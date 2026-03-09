/**
 * Comments Routes
 * GET /uploads/:uploadId/comments - List comments for an upload (threaded)
 * POST /uploads/:uploadId/comments - Add comment
 * DELETE /comments/:id - Delete comment (owner only)
 */

const express = require('express');
const { db } = require('../db');
const { sanitizeContent } = require('../utils/sanitizer');
const { csrfSkip } = require('../middleware/csrf');

const router = express.Router();

/**
 * Helper: Check if user is authenticated
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

/**
 * Helper: Get upload by ID (verify it exists)
 */
function getUploadById(id) {
  const stmt = db.prepare(`
    SELECT id, user_id, title, content, status, tags, created_at, updated_at
    FROM plan_uploads
    WHERE id = ?
  `);
  return stmt.get(id);
}

/**
 * Helper: Get comment by ID
 */
function getCommentById(id) {
  const stmt = db.prepare(`
    SELECT id, plan_upload_id, user_id, parent_id, content, created_at, updated_at
    FROM comments
    WHERE id = ?
  `);
  return stmt.get(id);
}

/**
 * Helper: Build threaded comment tree
 */
function buildCommentTree(comments) {
  const commentMap = new Map();
  const rootComments = [];

  // First pass: create map of all comments
  for (const comment of comments) {
    commentMap.set(comment.id, {
      ...comment,
      children: []
    });
  }

  // Second pass: build tree structure
  for (const comment of comments) {
    if (comment.parent_id === null) {
      rootComments.push(commentMap.get(comment.id));
    } else {
      const parent = commentMap.get(comment.parent_id);
      if (parent) {
        parent.children.push(commentMap.get(comment.id));
      }
    }
  }

  // Sort by created_at (oldest first for threads)
  const sortByDate = (a, b) => new Date(a.created_at) - new Date(b.created_at);
  
  const sortChildren = (comment) => {
    comment.children.sort(sortByDate);
    comment.children.forEach(sortChildren);
  };
  
  rootComments.sort(sortByDate);
  rootComments.forEach(sortChildren);

  return rootComments;
}

/**
 * GET /uploads/:uploadId/comments
 * List comments for an upload (threaded)
 */
router.get('/uploads/:uploadId/comments', requireAuth, (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { uploadId } = req.params;

    // Validate uploadId
    const id = parseInt(uploadId, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid upload ID' });
    }

    // Verify upload exists
    const upload = getUploadById(id);
    if (!upload) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    // Get all comments for this upload
    const stmt = db.prepare(`
      SELECT c.id, c.plan_upload_id, c.user_id, c.parent_id, c.content, 
             c.created_at, c.updated_at,
             u.username as author_username
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.plan_upload_id = ?
      ORDER BY c.created_at ASC
    `);

    const comments = stmt.all(id);

    // Build threaded tree
    const threadedComments = buildCommentTree(comments);

    res.json({
      comments: threadedComments,
      total: comments.length
    });

  } catch (error) {
    console.error('Error listing comments:', error);
    next(error);
  }
});

/**
 * POST /uploads/:uploadId/comments
 * Add comment to an upload
 * Body: { content, parent_id? }
 */
router.post('/uploads/:uploadId/comments', requireAuth, csrfSkip, (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { uploadId } = req.params;
    const { content, parent_id } = req.body;

    // Validate uploadId
    const id = parseInt(uploadId, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid upload ID' });
    }

    // Verify upload exists
    const upload = getUploadById(id);
    if (!upload) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    // Validate content
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Sanitize content
    const sanitizedContent = sanitizeContent(content);

    // Validate parent_id if provided (must be a valid comment on same upload)
    let sanitizedParentId = null;
    if (parent_id !== undefined && parent_id !== null) {
      const parentId = parseInt(parent_id, 10);
      if (isNaN(parentId)) {
        return res.status(400).json({ error: 'Invalid parent comment ID' });
      }

      // Verify parent comment exists and belongs to same upload
      const parentComment = getCommentById(parentId);
      if (!parentComment) {
        return res.status(400).json({ error: 'Parent comment not found' });
      }

      if (parentComment.plan_upload_id !== id) {
        return res.status(400).json({ error: 'Parent comment belongs to different upload' });
      }

      sanitizedParentId = parentId;
    }

    // Insert comment
    const insertStmt = db.prepare(`
      INSERT INTO comments (plan_upload_id, user_id, parent_id, content)
      VALUES (?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      id,
      userId,
      sanitizedParentId,
      sanitizedContent
    );

    // Get the created comment with author info
    const getCommentStmt = db.prepare(`
      SELECT c.id, c.plan_upload_id, c.user_id, c.parent_id, c.content,
             c.created_at, c.updated_at,
             u.username as author_username
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `);

    const newComment = getCommentStmt.get(result.lastInsertRowid);

    res.status(201).json({
      message: 'Comment added successfully',
      comment: {
        ...newComment,
        children: []
      }
    });

  } catch (error) {
    console.error('Error adding comment:', error);

    if (error.message && error.message.includes('must be')) {
      return res.status(400).json({ error: error.message });
    }

    next(error);
  }
});

/**
 * DELETE /comments/:id
 * Delete comment (owner only)
 */
router.delete('/comments/:id', requireAuth, csrfSkip, (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;

    // Validate id
    const commentId = parseInt(id, 10);
    if (isNaN(commentId)) {
      return res.status(400).json({ error: 'Invalid comment ID' });
    }

    // Get existing comment
    const existingComment = getCommentById(commentId);

    if (!existingComment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check ownership
    if (existingComment.user_id !== userId) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }

    // Delete comment (children will have NULL parent due to ON DELETE SET NULL not being used,
    // but foreign key is defined. For cascade delete of replies, we need to handle explicitly)
    
    // First, delete any child comments (replies)
    const deleteRepliesStmt = db.prepare(`
      DELETE FROM comments
      WHERE parent_id = ?
    `);
    deleteRepliesStmt.run(commentId);

    // Then delete the comment itself
    const deleteStmt = db.prepare(`
      DELETE FROM comments
      WHERE id = ?
    `);
    deleteStmt.run(commentId);

    res.json({
      message: 'Comment deleted successfully',
      deletedId: commentId
    });

  } catch (error) {
    console.error('Error deleting comment:', error);
    next(error);
  }
});

module.exports = router;
