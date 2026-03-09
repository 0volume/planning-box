/**
 * Authentication routes
 * POST /auth/register - Register new user
 * POST /auth/login - Login user
 * POST /auth/logout - Logout user
 * GET /auth/me - Get current user info
 */

const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { sanitizeUsername, sanitizeStringInput } = require('../utils/sanitizer');
const { authLimiter, loginFailureLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

/**
 * POST /auth/register
 * Body: { username, password }
 */
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    
    // Validate required fields
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Sanitize username (this also validates)
    const sanitizedUsername = sanitizeUsername(username);
    
    // Validate password
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    if (password.length > 128) {
      return res.status(400).json({ error: 'Password must be less than 128 characters' });
    }
    
    // Hash password with bcrypt (12 rounds)
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    
    // Insert user into database
    const insertStmt = db.prepare(`
      INSERT INTO users (username, password_hash)
      VALUES (?, ?)
    `);
    
    try {
      const result = insertStmt.run(sanitizedUsername, passwordHash);
      
      res.status(201).json({
        message: 'User registered successfully',
        userId: result.lastInsertRowid,
        username: sanitizedUsername
      });
    } catch (dbError) {
      if (dbError.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Username already exists' });
      }
      throw dbError;
    }
    
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.message.includes('must be between') || error.message.includes('must be a string')) {
      return res.status(400).json({ error: error.message });
    }
    
    next(error);
  }
});

/**
 * POST /auth/login
 * Body: { username, password }
 */
router.post('/login', loginFailureLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    
    // Validate required fields
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Sanitize username
    const sanitizedUsername = sanitizeUsername(username);
    
    // Look up user
    const userStmt = db.prepare(`
      SELECT id, username, password_hash, is_active
      FROM users
      WHERE username = ?
    `);
    
    const user = userStmt.get(sanitizedUsername);
    
    if (!user) {
      // Don't reveal whether username exists
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check if account is active
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is disabled' });
    }
    
    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordValid) {
      // Update failed login count or log attempt
      console.warn(`Failed login attempt for user: ${sanitizedUsername}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Update last login
    const updateLoginStmt = db.prepare(`
      UPDATE users
      SET last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    updateLoginStmt.run(user.id);
    
    // Regenerate session to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        return next(err);
      }
      
      // Store user info in session
      req.session.userId = user.id;
      req.session.username = user.username;
      
      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username
        }
      });
    });
    
  } catch (error) {
    console.error('Login error:', error);
    
    if (error.message.includes('must be a string')) {
      return res.status(400).json({ error: error.message });
    }
    
    next(error);
  }
});

/**
 * POST /auth/logout
 */
router.post('/logout', (req, res, next) => {
  // Destroy session
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return next(err);
    }
    
    // Clear session cookie
    res.clearCookie('connect.sid');
    
    res.json({ message: 'Logged out successfully' });
  });
});

/**
 * GET /auth/me
 * Returns current authenticated user info
 */
router.get('/me', (req, res) => {
  // Check if user is authenticated via session
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  res.json({
    authenticated: true,
    user: {
      id: req.session.userId,
      username: req.session.username
    }
  });
});

module.exports = router;
