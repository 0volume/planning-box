/**
 * Plans Routes (Agent API + Human View)
 * 
 * Human routes (session auth) - mounted at /plans:
 * GET /plans - List plans (human view)
 * GET /plans/:id - Get plan details
 * 
 * Agent routes (API token auth):
 * GET /uploads/public - Get ALL uploads (no user auth required, API token auth)
 * POST /plans - Agent: create plan from uploads
 */

const express = require('express');
const crypto = require('crypto');
const { db } = require('../db');
const { csrfSkip } = require('../middleware/csrf');

const router = express.Router();

/**
 * Helper: Hash token using SHA-256
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Middleware: Authenticate via API token (for agent routes)
 */
function requireAgentAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'API token required. Use: Authorization: Bearer <token>' });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const tokenHash = hashToken(token);
  
  // Look up token in database
  const stmt = db.prepare(`
    SELECT id, user_id, name, expires_at, last_used
    FROM api_tokens
    WHERE token_hash = ?
  `);
  
  const apiToken = stmt.get(tokenHash);
  
  if (!apiToken) {
    return res.status(401).json({ error: 'Invalid API token' });
  }
  
  // Check expiration
  if (apiToken.expires_at) {
    const expiresAt = new Date(apiToken.expires_at);
    if (expiresAt < new Date()) {
      return res.status(401).json({ error: 'API token has expired' });
    }
  }
  
  // Update last_used timestamp
  const updateStmt = db.prepare(`
    UPDATE api_tokens
    SET last_used = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  updateStmt.run(apiToken.id);
  
  // Attach token info to request
  req.agentToken = apiToken;
  next();
}

/**
 * Helper: Check if user is authenticated (for human routes)
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

/**
 * Helper: Get plan by ID with junction data
 */
function getPlanById(planId) {
  const stmt = db.prepare(`
    SELECT p.id, p.agent_token_id, p.title, p.content, p.phases,
           p.created_at, p.updated_at,
           at.user_id as owner_user_id
    FROM plans p
    JOIN api_tokens at ON p.agent_token_id = at.id
    WHERE p.id = ?
  `);
  
  const plan = stmt.get(planId);
  
  if (plan) {
    // Get linked uploads
    const uploadsStmt = db.prepare(`
      SELECT pup.id, pup.title, pup.status
      FROM plan_uploads_plans pupp
      JOIN plan_uploads pup ON pupp.plan_upload_id = pup.id
      WHERE pupp.plan_id = ?
    `);
    plan.uploads = uploadsStmt.all(planId);
  }
  
  return plan;
}

// ============================================================================
// HUMAN ROUTES (Session Auth) - mounted at /plans
// ============================================================================

/**
 * GET /plans
 * List user's plans (human view - only their own)
 */
router.get('/', requireAuth, (req, res, next) => {
  try {
    const userId = req.session.userId;
    
    const stmt = db.prepare(`
      SELECT p.id, p.agent_token_id, p.title, p.content, p.phases,
             p.created_at, p.updated_at,
             at.name as token_name
      FROM plans p
      JOIN api_tokens at ON p.agent_token_id = at.id
      WHERE at.user_id = ?
      ORDER BY p.updated_at DESC
    `);
    
    const plans = stmt.all(userId);
    
    // Parse phases JSON
    const result = plans.map(plan => ({
      ...plan,
      phases: plan.phases ? JSON.parse(plan.phases) : []
    }));
    
    res.json({
      plans: result,
      total: result.length
    });
    
  } catch (error) {
    console.error('Error listing plans:', error);
    next(error);
  }
});

/**
 * GET /plans/:id
 * Get plan details (human view - only their own)
 */
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const userId = req.session.userId;
    const { id } = req.params;
    
    const planId = parseInt(id, 10);
    if (isNaN(planId)) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }
    
    const plan = getPlanById(planId);
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    // Check ownership
    if (plan.owner_user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({
      ...plan,
      phases: plan.phases ? JSON.parse(plan.phases) : []
    });
    
  } catch (error) {
    console.error('Error getting plan:', error);
    next(error);
  }
});

module.exports = router;

// ============================================================================
// SEPARATE ROUTER for Agent routes (different base path)
// ============================================================================

const agentRouter = express.Router();

/**
 * GET /uploads/public
 * Get ALL uploads (agent API - no user auth, API token auth)
 * Returns all uploads from all users
 */
agentRouter.get('/public', requireAgentAuth, (req, res, next) => {
  try {
    const stmt = db.prepare(`
      SELECT pup.id, pup.user_id, pup.title, pup.content, pup.status, 
             pup.tags, pup.created_at, pup.updated_at,
             u.username as author_username
      FROM plan_uploads pup
      JOIN users u ON pup.user_id = u.id
      ORDER BY pup.created_at DESC
    `);
    
    const uploads = stmt.all();
    
    // Parse tags from JSON string
    const result = uploads.map(upload => ({
      ...upload,
      tags: upload.tags ? JSON.parse(upload.tags) : []
    }));
    
    res.json({
      uploads: result,
      total: result.length,
      agent: req.agentToken.name
    });
    
  } catch (error) {
    console.error('Error fetching public uploads:', error);
    next(error);
  }
});

/**
 * POST /
 * Create plan from uploads (agent API)
 * Mounted at /plans, so full path is POST /plans
 * Body: { title, content, phases, upload_ids: [] }
 */
agentRouter.post('/', requireAgentAuth, csrfSkip, (req, res, next) => {
  try {
    const agentToken = req.agentToken;
    const { title, content, phases, upload_ids } = req.body;
    
    // Validate required fields
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    if (!phases || typeof phases !== 'string') {
      return res.status(400).json({ error: 'Phases (JSON string) is required' });
    }
    
    // Validate phases is valid JSON
    let parsedPhases;
    try {
      parsedPhases = JSON.parse(phases);
      if (!Array.isArray(parsedPhases)) {
        return res.status(400).json({ error: 'Phases must be a JSON array' });
      }
    } catch (e) {
      return res.status(400).json({ error: 'Phases must be valid JSON' });
    }
    
    // Validate upload_ids if provided
    let validUploadIds = [];
    if (upload_ids !== undefined) {
      if (!Array.isArray(upload_ids)) {
        return res.status(400).json({ error: 'upload_ids must be an array' });
      }
      
      // Validate all upload IDs exist
      const uploadIdNums = upload_ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      
      if (uploadIdNums.length !== upload_ids.length) {
        return res.status(400).json({ error: 'All upload_ids must be valid integers' });
      }
      
      // Check uploads exist
      const checkStmt = db.prepare(`
        SELECT id FROM plan_uploads WHERE id IN (${uploadIdNums.join(',')})
      `);
      const existingUploads = checkStmt.all();
      validUploadIds = existingUploads.map(u => u.id);
    }
    
    // Insert plan
    const insertPlanStmt = db.prepare(`
      INSERT INTO plans (agent_token_id, title, content, phases)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = insertPlanStmt.run(
      agentToken.id,
      title.trim(),
      content.trim(),
      phases
    );
    
    const planId = result.lastInsertRowid;
    
    // Link to uploads if provided
    if (validUploadIds.length > 0) {
      const linkStmt = db.prepare(`
        INSERT INTO plan_uploads_plans (plan_id, plan_upload_id)
        VALUES (?, ?)
      `);
      
      for (const uploadId of validUploadIds) {
        linkStmt.run(planId, uploadId);
      }
    }
    
    // Get created plan
    const plan = getPlanById(planId);
    
    res.status(201).json({
      message: 'Plan created successfully',
      plan: {
        ...plan,
        phases: parsedPhases
      }
    });
    
  } catch (error) {
    console.error('Error creating plan:', error);
    next(error);
  }
});

// Export both routers
module.exports = { router, agentRouter };
