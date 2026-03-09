/**
 * Rate limiting middleware
 * 100 requests per minute, IP-based
 */

const rateLimit = require('express-rate-limit');

// Main API rate limiter - 100 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later.',
    retryAfter: 60
  },
  keyGenerator: (req) => {
    // Use IP address as key (proxy-aware)
    return req.ip || req.connection.remoteAddress || 'unknown';
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/health';
  }
});

// Strict limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 attempts per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 60
  },
  keyGenerator: (req) => {
    return req.ip || req.connection.remoteAddress || 'unknown';
  }
});

// Stricter limiter for failed login attempts
const loginFailureLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 failed attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many failed login attempts, account temporarily locked.',
    retryAfter: 900
  },
  keyGenerator: (req) => {
    // Combine IP with attempted username for more granular limiting
    const username = req.body?.username || 'unknown';
    return `${req.ip || 'unknown'}:${username}`;
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  loginFailureLimiter
};
