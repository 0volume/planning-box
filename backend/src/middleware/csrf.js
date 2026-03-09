/**
 * CSRF protection middleware
 * Custom implementation (csurf is deprecated)
 */

const crypto = require('crypto');

// Store tokens per session (in production, use Redis or similar)
const csrfTokens = new Map();

// Generate a new CSRF token for a session
function generateToken(sessionId) {
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokens.set(sessionId, {
    token,
    createdAt: Date.now()
  });
  
  // Clean up old tokens (older than 1 hour)
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [sid, data] of csrfTokens.entries()) {
    if (data.createdAt < oneHourAgo) {
      csrfTokens.delete(sid);
    }
  }
  
  return token;
}

// Get token for session, generate if doesn't exist
function getToken(sessionId) {
  const data = csrfTokens.get(sessionId);
  if (data) {
    return data.token;
  }
  return generateToken(sessionId);
}

// CSRF protection middleware
const csrfProtection = (req, res, next) => {
  // Skip for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Skip for agent API routes (they use API token auth, not session)
  const skipPaths = ['/health', '/api/health', '/uploads/public', '/plans'];
  if (skipPaths.some(path => req.path === path || req.originalUrl === path)) {
    return next();
  }
  
  // Get session ID
  const sessionId = req.sessionID;
  
  // If no session, reject (shouldn't happen with session middleware)
  if (!sessionId) {
    return res.status(403).json({
      error: 'csrf_error',
      message: 'No session found'
    });
  }
  
  // Get token from header or body
  const clientToken = req.headers['x-csrf-token'] || req.body?._csrf;
  
  // If no token provided, reject
  if (!clientToken) {
    return res.status(403).json({
      error: 'csrf_error',
      message: 'CSRF token required'
    });
  }
  
  // Validate token
  const serverToken = getToken(sessionId);
  
  try {
    if (!crypto.timingSafeEqual(
      Buffer.from(clientToken),
      Buffer.from(serverToken)
    )) {
      return res.status(403).json({
        error: 'csrf_error',
        message: 'Invalid CSRF token'
      });
    }
  } catch (e) {
    return res.status(403).json({
      error: 'csrf_error',
      message: 'Invalid CSRF token'
    });
  }
  
  next();
};

// Middleware to expose CSRF token to client
const csrfTokenMiddleware = (req, res, next) => {
  const sessionId = req.sessionID;
  
  if (sessionId) {
    const token = getToken(sessionId);
    res.locals.csrfToken = token;
    res.setHeader('X-CSRF-Token', token);
  }
  
  next();
};

// Skip CSRF for safe methods and certain paths
const csrfSkip = (req, res, next) => {
  // Skip for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Skip for configured paths (agent API routes)
  const skipPaths = ['/health', '/api/health', '/uploads/public', '/plans'];
  if (skipPaths.some(path => req.path === path || req.originalUrl === path)) {
    return next();
  }
  
  // Get session ID
  const sessionId = req.sessionID;
  
  // If no session, reject
  if (!sessionId) {
    return res.status(403).json({
      error: 'csrf_error',
      message: 'No session found'
    });
  }
  
  // Get token from header or body
  const clientToken = req.headers['x-csrf-token'] || req.body?._csrf;
  
  // If no token provided, reject
  if (!clientToken) {
    return res.status(403).json({
      error: 'csrf_error',
      message: 'CSRF token required'
    });
  }
  
  // Validate token using timing-safe comparison
  const serverToken = getToken(sessionId);
  
  try {
    if (!crypto.timingSafeEqual(
      Buffer.from(clientToken),
      Buffer.from(serverToken)
    )) {
      return res.status(403).json({
        error: 'csrf_error',
        message: 'Invalid CSRF token'
      });
    }
  } catch (e) {
    return res.status(403).json({
      error: 'csrf_error',
      message: 'Invalid CSRF token'
    });
  }
  
  next();
};

// Error handler for CSRF errors
const handleCsrfError = (err, req, res, next) => {
  if (err.message && err.message.includes('csrf')) {
    return res.status(403).json({
      error: 'csrf_error',
      message: 'Invalid CSRF token'
    });
  }
  next(err);
};

module.exports = {
  csrfProtection,
  csrfTokenMiddleware,
  csrfSkip,
  handleCsrfError,
  getToken
};
