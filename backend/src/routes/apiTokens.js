/**
 * API Tokens Routes (Human-managed)
 * GET /api-tokens - List user's tokens
 * POST /api-tokens - Create token (show ONCE)
 * DELETE /api-tokens/:id - Revoke token
 */

const express = require('express');
const crypto = require('crypto');
const { db } = require('../db');
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
 * Helper: Hash token using SHA-256
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * GET /api-tokens
 * List user's API tokens (without exposing the actual tokens)
 */
router.get('/', requireAuth, (req, res, next) => {
  try {
    const userId = req.session.userId;
    
    const stmt = db.prepare(`
      SELECT id, user_id, name, created_at, last_used, expires_at
      FROM api_tokens
      WHERE user_id = ?
      ORDER BY created_at DESC
    `);
    
    const tokens = stmt.all(userId);
    
    res.json({
      tokens: tokens,
      total: tokens.length
    });
    
  } catch (error) {
    console.error('Error listing API tokens:', error);
    next(error);
  }
});

/**
 * POST /api-tokens
 * Create new API token (show ONCE - returned only at creation time)
 * Body: { name, expires_in_days? }
 */
router.post('/', requireAuth, csrfSkip, (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { name, expires_in_days } = req.body;
    
    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Token name is required' });
    }
    
    const tokenName = name.trim().substring(0, 100);
    
    // Generate random token (64 hex characters = 32 bytes)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);
    
    // Calculate expiration if provided
    let expiresAt = null;
    if (expires_in_days !== undefined) {
      const days = parseInt(expires_in_days, 10);
      if (!isNaN(days) && days > 0) {
        const expiresDate = new Date();
        expiresDate.setDate(expiresDate.getDate() + days);
        expiresAt = expiresDate.toISOString();
      }
    }
    
    // Insert into database
    const insertStmt = db.prepare(`
      INSERT INTO api_tokens (user_id, name, token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = insertStmt.run(
      userId,
      tokenName,
      tokenHash,
      expiresAt
    );
    
    res.status(201).json({
      message: 'API token created successfully',
      token: {
        id: result.lastInsertRowid,
        name: tokenName,
        // Return the raw token ONLY now - never again!
        token: rawToken,
        created_at: new Date().toISOString(),
        expires_at: expiresAt
      },
      warning: 'Store this token securely - it will not be shown again!'
    });
    
  } catch (error) {
    console.error('Error creating API token:', error);
    next(error);
  }
});

/**
 * DELETE /api-tokens/:id
 * Revoke/delete API token (owner only)
 */
router.delete('/:id', requireAuth, csrfSkip, (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    
    // Validate ID
    const tokenId = parseInt(id, 10);
    if (isNaN(tokenId)) {
      return res.status(400).json({ error: 'Invalid token ID' });
    }
    
    // Verify token exists and belongs to user
    const getStmt = db.prepare(`
      SELECT id, user_id, name
      FROM api_tokens
      WHERE id = ?
    `);
    
    const existingToken = getStmt.get(tokenId);
    
    if (!existingToken) {
      return res.status(404).json({ error: 'Token not found' });
    }
    
    if (existingToken.user_id !== userId) {
      return res.status(403).json({ error: 'You can only delete your own tokens' });
    }
    
    // Delete token
    const deleteStmt = db.prepare(`
      DELETE FROM api_tokens
      WHERE id = ?
    `);
    
    deleteStmt.run(tokenId);
    
    // Also delete associated plans (cascade)
    const deletePlansStmt = db.prepare(`
      DELETE FROM plans
      WHERE agent_token_id = ?
    `);
    deletePlansStmt.run(tokenId);
    
    res.json({
      message: 'API token revoked successfully',
      deletedId: tokenId
    });
    
  } catch (error) {
    console.error('Error revoking API token:', error);
    next(error);
  }
});

module.exports = router;
