/**
 * Input sanitization utilities
 * All inputs MUST be sanitized BEFORE database operations
 */

const ENT = require('entities');

/**
 * Sanitize a username
 * - Alphanumeric, underscores, hyphens only
 * - 3-30 characters
 * @param {string} username 
 * @returns {string} sanitized username
 */
function sanitizeUsername(username) {
  if (typeof username !== 'string') {
    throw new Error('Username must be a string');
  }
  
  // Trim whitespace
  let sanitized = username.trim();
  
  // Remove any non-alphanumeric, underscore, or hyphen characters
  sanitized = sanitized.replace(/[^a-zA-Z0-9_-]/g, '');
  
  // Enforce length limits
  if (sanitized.length < 3 || sanitized.length > 30) {
    throw new Error('Username must be between 3 and 30 characters');
  }
  
  return sanitized;
}

/**
 * Sanitize a title field
 * - HTML entity encoding
 * - Max 200 characters
 * @param {string} title 
 * @returns {string} sanitized title
 */
function sanitizeTitle(title) {
  if (typeof title !== 'string') {
    throw new Error('Title must be a string');
  }
  
  let sanitized = title.trim();
  
  // Encode HTML entities to prevent XSS
  sanitized = ENT.encodeHTML(sanitized);
  
  // Enforce max length
  if (sanitized.length > 200) {
    sanitized = sanitized.substring(0, 200);
  }
  
  return sanitized;
}

/**
 * Sanitize content/text field
 * - HTML entity encoding
 * - Max 50000 characters
 * @param {string} content 
 * @returns {string} sanitized content
 */
function sanitizeContent(content) {
  if (typeof content !== 'string') {
    throw new Error('Content must be a string');
  }
  
  let sanitized = content.trim();
  
  // Encode HTML entities to prevent XSS
  sanitized = ENT.encodeHTML(sanitized);
  
  // Enforce max length
  if (sanitized.length > 50000) {
    sanitized = sanitized.substring(0, 50000);
  }
  
  return sanitized;
}

/**
 * Sanitize tags array
 * - Alphanumeric and underscores only
 * - Max 10 tags, 30 chars each
 * @param {string[]} tags 
 * @returns {string[]} sanitized tags
 */
function sanitizeTags(tags) {
  if (!Array.isArray(tags)) {
    throw new Error('Tags must be an array');
  }
  
  const sanitized = [];
  
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    
    let clean = tag.trim().toLowerCase();
    clean = clean.replace(/[^a-z0-9_]/g, '');
    
    if (clean.length > 0 && clean.length <= 30) {
      sanitized.push(clean);
    }
  }
  
  // Limit to 10 tags
  return sanitized.slice(0, 10);
}

/**
 * General input validation and sanitization
 * @param {any} input 
 * @param {string} fieldName 
 * @returns {string}
 */
function sanitizeStringInput(input, fieldName = 'field') {
  if (input === null || input === undefined) {
    throw new Error(`${fieldName} is required`);
  }
  
  if (typeof input !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  
  return input.trim();
}

module.exports = {
  sanitizeUsername,
  sanitizeTitle,
  sanitizeContent,
  sanitizeTags,
  sanitizeStringInput
};
