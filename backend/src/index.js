/**
 * Planning Box - Express Application
 */

require('dotenv').config();

const express = require('express');
const session = require('express-session');

// Initialize database
require('./db');

// Import middleware
const { applySecurityHeaders, validateInput } = require('./middleware/security');
const { apiLimiter } = require('./middleware/rateLimit');
const { csrfProtection, csrfTokenMiddleware, handleCsrfError } = require('./middleware/csrf');

// Import routes
const authRoutes = require('./routes/auth');
const uploadsRoutes = require('./routes/uploads');
const commentsRoutes = require('./routes/comments');
const apiTokensRoutes = require('./routes/apiTokens');
const { router: plansRoutes, agentRouter } = require('./routes/plans');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  name: 'connect.sid',
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(applySecurityHeaders);
app.use(validateInput);
app.use('/api', apiLimiter);
app.use(csrfTokenMiddleware);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes
app.use('/auth', csrfProtection);
app.use('/auth', authRoutes);

// Agent routes FIRST (API token auth)
app.use('/uploads', agentRouter);
app.use('/plans', agentRouter);

// Human uploads routes
app.use('/uploads', csrfProtection);
app.use('/uploads', uploadsRoutes);

// Comments routes
app.use('/', csrfProtection);
app.use('/', commentsRoutes);

// API Tokens routes
app.use('/api-tokens', csrfProtection);
app.use('/api-tokens', apiTokensRoutes);

// Plans routes (human view)
app.use('/plans', plansRoutes);

// CSRF error handler
app.use(handleCsrfError);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Application error:', err);
  const message = NODE_ENV === 'production' ? 'An internal error occurred' : err.message;
  res.status(err.status || 500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`Planning Box server running on port ${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
});

module.exports = app;
