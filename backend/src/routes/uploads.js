/**
 * Plan-Uploads CRUD Routes
 * GET /uploads - List user's uploads (with optional status filter)
 * GET /uploads/:id - Get single upload
 * POST /uploads - Create new upload
 * PUT /uploads/:id - Update upload (owner only)
 * DELETE /uploads/:id - Delete upload (owner only)
 */

const express = require('express');
const { db } = require('../db');
const { sanitizeTitle, sanitizeContent, sanitizeTags } = require('../utils/sanitizer');
const { csrfSkip } = require('../middleware/csrf');

const router = express.Router();

// Valid status values
const VALID_STATUSES = ['open', 'processing', 'planned', 'complete'];

// Status workflow transitions (optional - allows forward progression only)
const STATUS_TRANSITIONS = {
  'open': ['processing', 'planned', 'complete'],
  'processing': ['planned', 'complete'],
  'planned': ['complete'],
  'complete': []
};

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
 * Helper: Get upload by ID (with ownership check)
 */
function getUploadById(id, userId) {
  const stmt = db.prepare(`
    SELECT id, user_id, title, content, status, tags, created_at, updated_at
    FROM plan_uploads
    WHERE id = ?
  `);
  const upload = stmt.get(id);
  
  // Check ownership if userId provided
  if (upload && userId !== undefined && upload.user_id !== userId) {
    return null;
  }
  
  return upload;
}

/**
 * GET /uploads
 * List user's uploads with optional status filter
 * Query params: ?status=open|processing|planned|complete
 */
router.get('/', requireAuth, (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { status } = req.query;
    
    // Build query based on filters
    let query = `
      SELECT id, user_id, title, content, status, tags, created_at, updated_at
      FROM plan_uploads
      WHERE user_id = ?
    `;
    const params = [userId];
    
    // Filter by status if provided
    if (status && VALID_STATUSES.includes(status)) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const stmt = db.prepare(query);
    const uploads = stmt.all(...params);
    
    // Parse tags from JSON string
    const result = uploads.map(upload => ({
      ...upload,
      tags: upload.tags ? JSON.parse(upload.tags) : []
    }));
    
    res.json({
      uploads: result,
      total: result.length
    });
    
  } catch (error) {
    console.error('Error listing uploads:', error);
    next(error);
  }
});

/**
 * GET /uploads/:id
 * Get single upload by ID
 */
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    
    // Validate ID
    const uploadId = parseInt(id, 10);
    if (isNaN(uploadId)) {
      return res.status(400).json({ error: 'Invalid upload ID' });
    }
    
    const upload = getUploadById(uploadId, userId);
    
    if (!upload) {
      return res.status(404).json({ error: 'Upload not found' });
    }
    
    // Parse tags from JSON string
    res.json({
      ...upload,
      tags: upload.tags ? JSON.parse(upload.tags) : []
    });
    
  } catch (error) {
    console.error('Error getting upload:', error);
    next(error);
  }
});

/**
 * POST /uploads
 * Create new upload
 * Body: { title, content, tags?, status? }
 */
router.post('/', requireAuth, csrfSkip, (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { title, content, tags, status } = req.body;
    
    // Validate required fields
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    // Sanitize inputs
    const sanitizedTitle = sanitizeTitle(title);
    const sanitizedContent = sanitizeContent(content);
    
    // Sanitize and validate tags
    let sanitizedTags = [];
    if (tags && Array.isArray(tags)) {
      sanitizedTags = sanitizeTags(tags);
    }
    
    // Validate status if provided
    let sanitizedStatus = 'open';
    if (status && VALID_STATUSES.includes(status)) {
      sanitizedStatus = status;
    }
    
    // Insert into database
    const insertStmt = db.prepare(`
      INSERT INTO plan_uploads (user_id, title, content, status, tags)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = insertStmt.run(
      userId,
      sanitizedTitle,
      sanitizedContent,
      sanitizedStatus,
      JSON.stringify(sanitizedTags)
    );
    
    res.status(201).json({
      message: 'Upload created successfully',
      upload: {
        id: result.lastInsertRowid,
        user_id: userId,
        title: sanitizedTitle,
        content: sanitizedContent,
        status: sanitizedStatus,
        tags: sanitizedTags,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error creating upload:', error);
    
    if (error.message && error.message.includes('must be')) {
      return res.status(400).json({ error: error.message });
    }
    
    next(error);
  }
});

/**
 * PUT /uploads/:id
 * Update upload (owner only)
 * Body: { title?, content?, tags?, status? }
 */
router.put('/:id', requireAuth, csrfSkip, (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    const { title, content, tags, status } = req.body;
    
    // Validate ID
    const uploadId = parseInt(id, 10);
    if (isNaN(uploadId)) {
      return res.status(400).json({ error: 'Invalid upload ID' });
    }
    
    // Get existing upload (check ownership)
    const existingUpload = getUploadById(uploadId, userId);
    
    if (!existingUpload) {
      return res.status(404).json({ error: 'Upload not found or access denied' });
    }
    
    // Validate status transition if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }
    
    if (status && status !== existingUpload.status) {
      // Check if transition is allowed
      const allowedTransitions = STATUS_TRANSITIONS[existingUpload.status] || [];
      if (!allowedTransitions.includes(status)) {
        return res.status(400).json({ 
          error: `Invalid status transition from '${existingUpload.status}' to '${status}'`,
          allowed: allowedTransitions
        });
      }
    }
    
    // Sanitize provided fields (only update what's provided)
    let sanitizedTitle = existingUpload.title;
    if (title !== undefined) {
      if (typeof title !== 'string') {
        return res.status(400).json({ error: 'Title must be a string' });
      }
      sanitizedTitle = sanitizeTitle(title);
    }
    
    let sanitizedContent = existingUpload.content;
    if (content !== undefined) {
      if (typeof content !== 'string') {
        return res.status(400).json({ error: 'Content must be a string' });
      }
      sanitizedContent = sanitizeContent(content);
    }
    
    let sanitizedTags = existingUpload.tags ? JSON.parse(existingUpload.tags) : [];
    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'Tags must be an array' });
      }
      sanitizedTags = sanitizeTags(tags);
    }
    
    let sanitizedStatus = existingUpload.status;
    if (status !== undefined) {
      sanitizedStatus = status;
    }
    
    // Update in database
    const updateStmt = db.prepare(`
      UPDATE plan_uploads
      SET title = ?, content = ?, status = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    updateStmt.run(
      sanitizedTitle,
      sanitizedContent,
      sanitizedStatus,
      JSON.stringify(sanitizedTags),
      uploadId
    );
    
    res.json({
      message: 'Upload updated successfully',
      upload: {
        id: uploadId,
        user_id: userId,
        title: sanitizedTitle,
        content: sanitizedContent,
        status: sanitizedStatus,
        tags: sanitizedTags,
        updated_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error updating upload:', error);
    
    if (error.message && error.message.includes('must be')) {
      return res.status(400).json({ error: error.message });
    }
    
    next(error);
  }
});

/**
 * DELETE /uploads/:id
 * Delete upload (owner only)
 */
router.delete('/:id', requireAuth, csrfSkip, (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    
    // Validate ID
    const uploadId = parseInt(id, 10);
    if (isNaN(uploadId)) {
      return res.status(400).json({ error: 'Invalid upload ID' });
    }
    
    // Get existing upload (check ownership)
    const existingUpload = getUploadById(uploadId, userId);
    
    if (!existingUpload) {
      return res.status(404).json({ error: 'Upload not found or access denied' });
    }
    
    // Delete from database
    const deleteStmt = db.prepare(`
      DELETE FROM plan_uploads
      WHERE id = ?
    `);
    
    deleteStmt.run(uploadId);
    
    res.json({
      message: 'Upload deleted successfully',
      deletedId: uploadId
    });
    
  } catch (error) {
    console.error('Error deleting upload:', error);
    next(error);
  }
});

module.exports = router;
