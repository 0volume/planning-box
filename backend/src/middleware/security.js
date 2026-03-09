/**
 * Security middleware - CSP headers and sanitization functions
 */

const ENT = require('entities');

/**
 * Content Security Policy headers
 */
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none';",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};

/**
 * Apply security headers to all responses
 */
function applySecurityHeaders(req, res, next) {
  for (const [header, value] of Object.entries(securityHeaders)) {
    res.setHeader(header, value);
  }
  next();
}

/**
 * Prevent clickjacking
 */
const antiClickjacking = (req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  next();
};

/**
 * MIME type sniffing protection
 */
const preventMimeSniffing = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
};

/**
 * XSS Protection header
 */
const xssProtection = (req, res, next) => {
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
};

/**
 * Referrer Policy
 */
const referrerPolicy = (req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
};

/**
 * Input validation middleware - checks for suspicious patterns
 * Does NOT sanitize, just validates and rejects obviously malicious input
 */
function validateInput(req, res, next) {
  const checkValue = (val, path) => {
    if (typeof val !== 'string') return;
    
    // Check for potential SQL injection patterns (basic detection)
    const sqlPatterns = /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute|script)\b|['"];|--|\/\*|\*\/)/i;
    if (sqlPatterns.test(val)) {
      console.warn(`Potential SQL injection detected in ${path}: ${val.substring(0, 50)}`);
      return false;
    }
    
    // Check for null bytes
    if (val.includes('\0')) {
      console.warn(`Null byte detected in ${path}`);
      return false;
    }
    
    return true;
  };
  
  const checkObject = (obj, path = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      if (typeof value === 'object' && value !== null) {
        if (!checkObject(value, currentPath)) return false;
      } else if (typeof value === 'string') {
        if (!checkValue(value, currentPath)) return false;
      }
    }
    return true;
  };
  
  if (req.body && !checkObject(req.body)) {
    return res.status(400).json({ error: 'Invalid input detected' });
  }
  
  next();
}

/**
 * Safe JSON response helper - prevents JSON hijacking
 */
function safeJSON(res, data) {
  res.setHeader('Content-Type', 'application/json');
  // Ensure we don't start with array (JSON hijacking prevention)
  if (Array.isArray(data)) {
    return res.json({ data });
  }
  return res.json(data);
}

/**
 * HTML encode for display (if needed in templates)
 */
function htmlEncode(str) {
  return ENT.encodeHTML(str);
}

module.exports = {
  applySecurityHeaders,
  antiClickjacking,
  preventMimeSniffing,
  xssProtection,
  referrerPolicy,
  validateInput,
  safeJSON,
  htmlEncode,
  securityHeaders
};
