/**
 * Planning Box - SPA Application
 */

import api from './api.js';
import auth from './auth.js';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sanitize text content - prevents XSS
 * Uses textContent for safe display
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * Format date for display
 */
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Show error message
 */
function showError(message) {
  return `<div class="alert alert-error">${escapeHtml(message)}</div>`;
}

/**
 * Show success message
 */
function showSuccess(message) {
  return `<div class="alert alert-success">${escapeHtml(message)}</div>`;
}

// ============================================================================
// View: Login
// ============================================================================

function renderLogin(error = '') {
  return `
    <div class="auth-container">
      <h1>Login</h1>
      ${error ? showError(error) : ''}
      <form id="login-form">
        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" id="username" name="username" required autocomplete="username">
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-primary">Login</button>
      </form>
      <p class="auth-footer">
        Don't have an account? <a href="#/register" class="link">Register</a>
      </p>
    </div>
  `;
}

function setupLoginHandlers() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = form.username.value.trim();
    const password = form.password.value;

    try {
      await auth.login(username, password);
      window.location.hash = '#/dashboard';
    } catch (error) {
      document.getElementById('main').innerHTML = renderLogin(error.message);
      setupLoginHandlers();
    }
  });
}

// ============================================================================
// View: Register
// ============================================================================

function renderRegister(error = '') {
  return `
    <div class="auth-container">
      <h1>Register</h1>
      ${error ? showError(error) : ''}
      <form id="register-form">
        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" id="username" name="username" required autocomplete="username" minlength="3" maxlength="30">
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" required autocomplete="new-password" minlength="8">
        </div>
        <div class="form-group">
          <label for="confirm-password">Confirm Password</label>
          <input type="password" id="confirm-password" name="confirm-password" required autocomplete="new-password" minlength="8">
        </div>
        <button type="submit" class="btn btn-primary">Register</button>
      </form>
      <p class="auth-footer">
        Already have an account? <a href="#/login" class="link">Login</a>
      </p>
    </div>
  `;
}

function setupRegisterHandlers() {
  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = form.username.value.trim();
    const password = form.password.value;
    const confirmPassword = form['confirm-password'].value;

    if (password !== confirmPassword) {
      document.getElementById('main').innerHTML = renderRegister('Passwords do not match');
      setupRegisterHandlers();
      return;
    }

    try {
      await auth.register(username, password);
      // Auto-login after registration
      await auth.login(username, password);
      window.location.hash = '#/dashboard';
    } catch (error) {
      document.getElementById('main').innerHTML = renderRegister(error.message);
      setupRegisterHandlers();
    }
  });
}

// ============================================================================
// View: Dashboard
// ============================================================================

async function renderDashboard() {
  try {
    const [uploadsData, user] = await Promise.all([
      api.getUploads(),
      Promise.resolve(auth.getUser())
    ]);

    const uploads = uploadsData.uploads;
    
    // Calculate status counts
    const stats = { open: 0, processing: 0, planned: 0, complete: 0 };
    uploads.forEach(u => {
      if (stats[u.status] !== undefined) stats[u.status]++;
    });

    const username = user ? escapeHtml(user.username) : 'User';

    return `
      <div class="dashboard-header">
        <h1>Welcome, ${username}</h1>
        <a href="#/upload/new" class="btn btn-primary">New Upload</a>
      </div>

      <div class="stats-grid">
        <div class="stat-card open">
          <h3>Open</h3>
          <div class="value">${stats.open}</div>
        </div>
        <div class="stat-card processing">
          <h3>Processing</h3>
          <div class="value">${stats.processing}</div>
        </div>
        <div class="stat-card planned">
          <h3>Planned</h3>
          <div class="value">${stats.planned}</div>
        </div>
        <div class="stat-card complete">
          <h3>Complete</h3>
          <div class="value">${stats.complete}</div>
        </div>
      </div>

      <h2 class="section-title">Your Uploads</h2>
      ${uploads.length === 0 ? `
        <div class="empty-state">
          <h2>No uploads yet</h2>
          <p>Create your first plan upload to get started.</p>
          <a href="#/upload/new" class="btn btn-primary" style="margin-top: 1rem;">Create Upload</a>
        </div>
      ` : `
        <div class="upload-list">
          ${uploads.map(upload => `
            <div class="upload-item">
              <div class="upload-item-info" onclick="window.location.hash='#/upload/${upload.id}'">
                <h3>${escapeHtml(upload.title)}</h3>
                <div class="upload-item-meta">
                  Created ${formatDate(upload.created_at)}
                  ${upload.tags && upload.tags.length > 0 ? ` · ${upload.tags.length} tags` : ''}
                </div>
              </div>
              <span class="status-badge status-${upload.status}">${upload.status}</span>
            </div>
          `).join('')}
        </div>
      `}
    `;
  } catch (error) {
    return showError(error.message);
  }
}

// ============================================================================
// View: Upload Editor (Create/Edit)
// ============================================================================

async function renderUploadEditor(uploadId = null) {
  let upload = null;
  
  if (uploadId) {
    try {
      upload = await api.getUpload(uploadId);
    } catch (error) {
      return showError(error.message);
    }
  }

  const isEdit = !!upload;
  const title = upload ? escapeHtml(upload.title) : '';
  const content = upload ? escapeHtml(upload.content) : '';
  const status = upload ? upload.status : 'open';
  const tags = upload && upload.tags ? upload.tags : [];

  return `
    <div class="editor-container">
      <h1>${isEdit ? 'Edit Upload' : 'New Upload'}</h1>
      <form id="upload-form">
        <input type="hidden" name="uploadId" value="${uploadId || ''}">
        
        <div class="form-group">
          <label for="title">Title</label>
          <input type="text" id="title" name="title" required value="${title}" placeholder="Enter a title for your plan">
        </div>

        <div class="form-group">
          <label for="content">Content</label>
          <textarea id="content" name="content" required placeholder="Describe your plan in detail...">${content}</textarea>
        </div>

        <div class="form-group">
          <label for="status">Status</label>
          <select id="status" name="status">
            <option value="open" ${status === 'open' ? 'selected' : ''}>Open</option>
            <option value="processing" ${status === 'processing' ? 'selected' : ''}>Processing</option>
            <option value="planned" ${status === 'planned' ? 'selected' : ''}>Planned</option>
            <option value="complete" ${status === 'complete' ? 'selected' : ''}>Complete</option>
          </select>
        </div>

        <div class="form-group">
          <label for="tags">Tags (comma-separated)</label>
          <input type="text" id="tags" name="tags" value="${tags.join(', ')}" placeholder="e.g., important, review, feature">
        </div>

        <div class="editor-actions">
          <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Upload'}</button>
          <a href="#/dashboard" class="btn btn-secondary">Cancel</a>
          ${isEdit ? `<button type="button" id="delete-btn" class="btn btn-danger" style="margin-left: auto;">Delete</button>` : ''}
        </div>
      </form>
    </div>
  `;
}

function setupUploadEditorHandlers(uploadId = null) {
  const form = document.getElementById('upload-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
      title: form.title.value.trim(),
      content: form.content.value.trim(),
      status: form.status.value,
      tags: form.tags.value.split(',').map(t => t.trim()).filter(t => t)
    };

    try {
      if (uploadId) {
        await api.updateUpload(uploadId, data);
      } else {
        await api.createUpload(data);
      }
      window.location.hash = '#/dashboard';
    } catch (error) {
      alert(error.message);
    }
  });

  const deleteBtn = document.getElementById('delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete this upload?')) {
        try {
          await api.deleteUpload(uploadId);
          window.location.hash = '#/dashboard';
        } catch (error) {
          alert(error.message);
        }
      }
    });
  }
}

// ============================================================================
// View: Upload Detail
// ============================================================================

async function renderUploadDetail(uploadId) {
  try {
    const upload = await api.getUpload(uploadId);
    const commentsData = await api.getComments(uploadId);
    
    const tags = upload.tags || [];

    return `
      <a href="#/dashboard" class="back-link">← Back to Dashboard</a>
      
      <div class="upload-detail">
        <div class="upload-detail-header">
          <div>
            <h1>${escapeHtml(upload.title)}</h1>
            <div class="upload-detail-meta">
              Created ${formatDate(upload.created_at)} · Updated ${formatDate(upload.updated_at)}
            </div>
          </div>
          <a href="#/upload/${uploadId}/edit" class="btn btn-secondary btn-small">Edit</a>
        </div>

        <span class="status-badge status-${upload.status}" style="margin-bottom: 1rem; display: inline-block;">${upload.status}</span>

        ${tags.length > 0 ? `
          <div class="tags-list">
            ${tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
          </div>
        ` : ''}

        <div class="upload-detail-content">${escapeHtml(upload.content)}</div>

        <div class="comments-section">
          <h2>Comments</h2>
          
          <div class="comment-form">
            <textarea id="comment-content" placeholder="Add a comment..."></textarea>
            <button id="add-comment-btn" class="btn btn-primary btn-small">Add Comment</button>
          </div>

          <div class="comments-list" id="comments-list">
            ${renderComments(commentsData.comments, uploadId)}
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    return showError(error.message);
  }
}

function renderComments(comments, uploadId) {
  if (!comments || comments.length === 0) {
    return '<p class="empty-state">No comments yet. Be the first to comment!</p>';
  }

  return comments.map(comment => renderComment(comment, uploadId)).join('');
}

function renderComment(comment, uploadId, isReply = false) {
  const isOwner = auth.getUser() && auth.getUser().id === comment.user_id;
  
  let html = `
    <div class="comment" data-comment-id="${comment.id}">
      <div class="comment-header">
        <span class="comment-author">${escapeHtml(comment.author_username)}</span>
        <span class="comment-date">${formatDate(comment.created_at)}</span>
      </div>
      <div class="comment-content">${escapeHtml(comment.content)}</div>
      ${!isReply ? `<button class="reply-btn btn btn-small" style="margin-top: 0.5rem;" data-parent-id="${comment.id}">Reply</button>` : ''}
      ${isOwner ? `<button class="delete-comment-btn btn btn-small btn-danger" style="margin-top: 0.5rem; margin-left: 0.5rem;" data-comment-id="${comment.id}">Delete</button>` : ''}
    </div>
  `;

  if (comment.children && comment.children.length > 0) {
    html += `
      <div class="comment-replies">
        ${comment.children.map(child => renderComment(child, uploadId, true)).join('')}
      </div>
    `;
  }

  return html;
}

function setupUploadDetailHandlers(uploadId) {
  // Add comment
  const addCommentBtn = document.getElementById('add-comment-btn');
  const commentContent = document.getElementById('comment-content');

  if (addCommentBtn) {
    addCommentBtn.addEventListener('click', async () => {
      const content = commentContent.value.trim();
      if (!content) return;

      try {
        await api.addComment(uploadId, content);
        // Reload the view
        const html = await renderUploadDetail(uploadId);
        document.getElementById('main').innerHTML = html;
        setupUploadDetailHandlers(uploadId);
      } catch (error) {
        alert(error.message);
      }
    });
  }

  // Reply buttons
  document.querySelectorAll('.reply-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const parentId = parseInt(e.target.dataset.parentId, 10);
      const content = prompt('Enter your reply:');
      if (!content || !content.trim()) return;

      try {
        await api.addComment(uploadId, content.trim(), parentId);
        // Reload the view
        const html = await renderUploadDetail(uploadId);
        document.getElementById('main').innerHTML = html;
        setupUploadDetailHandlers(uploadId);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  // Delete comment buttons
  document.querySelectorAll('.delete-comment-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const commentId = parseInt(e.target.dataset.commentId, 10);
      if (!confirm('Delete this comment?')) return;

      try {
        await api.deleteComment(commentId);
        // Reload the view
        const html = await renderUploadDetail(uploadId);
        document.getElementById('main').innerHTML = html;
        setupUploadDetailHandlers(uploadId);
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

// ============================================================================
// View: Plans List
// ============================================================================

async function renderPlans() {
  try {
    const data = await api.getPlans();
    const plans = data.plans;

    return `
      <h1 class="section-title">Agent-Generated Plans</h1>
      
      ${plans.length === 0 ? `
        <div class="empty-state">
          <h2>No plans yet</h2>
          <p>Plans generated by agents will appear here.</p>
        </div>
      ` : `
        <div class="plans-list">
          ${plans.map(plan => `
            <div class="plan-item" onclick="window.location.hash='#/plan/${plan.id}'">
              <h3>${escapeHtml(plan.title)}</h3>
              <div class="plan-item-meta">
                Created ${formatDate(plan.created_at)} · Updated ${formatDate(plan.updated_at)}
              </div>
              ${plan.phases && plan.phases.length > 0 ? `
                <div class="plan-item-phases">
                  ${plan.phases.map(phase => `
                    <span class="phase-badge">${escapeHtml(phase.name || 'Phase')}</span>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `}
    `;
  } catch (error) {
    return showError(error.message);
  }
}

// ============================================================================
// View: Plan Detail
// ============================================================================

async function renderPlanDetail(planId) {
  try {
    const plan = await api.getPlan(planId);
    const phases = plan.phases || [];

    return `
      <a href="#/plans" class="back-link">← Back to Plans</a>
      
      <div class="plan-detail">
        <h1>${escapeHtml(plan.title)}</h1>
        <div class="plan-detail-meta">
          Created ${formatDate(plan.created_at)} · Updated ${formatDate(plan.updated_at)}
        </div>

        <div class="plan-detail-content">${escapeHtml(plan.content)}</div>

        ${plan.uploads && plan.uploads.length > 0 ? `
          <h2 style="margin-bottom: 1rem;">Linked Uploads</h2>
          <div class="upload-list" style="margin-bottom: 1.5rem;">
            ${plan.uploads.map(upload => `
              <div class="upload-item" onclick="window.location.hash='#/upload/${upload.id}'">
                <div class="upload-item-info">
                  <h3>${escapeHtml(upload.title)}</h3>
                </div>
                <span class="status-badge status-${upload.status}">${upload.status}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${phases.length > 0 ? `
          <div class="plan-phases">
            <h2>Phases</h2>
            ${phases.map((phase, index) => `
              <div class="phase-item">
                <div class="phase-title">Phase ${index + 1}: ${escapeHtml(phase.name || 'Untitled')}</div>
                ${phase.description ? `<div class="phase-description">${escapeHtml(phase.description)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  } catch (error) {
    return showError(error.message);
  }
}

// ============================================================================
// Router
// ============================================================================

const routes = {
  '/login': { 
    render: () => renderLogin(), 
    setup: setupLoginHandlers,
    auth: false 
  },
  '/register': { 
    render: () => renderRegister(), 
    setup: setupRegisterHandlers,
    auth: false 
  },
  '/dashboard': { 
    render: renderDashboard, 
    setup: () => {},
    auth: true 
  },
  '/upload/new': { 
    render: () => renderUploadEditor(null), 
    setup: () => setupUploadEditorHandlers(null),
    auth: true 
  },
  '/upload/:id/edit': { 
    render: (id) => renderUploadEditor(id), 
    setup: (id) => setupUploadEditorHandlers(id),
    auth: true 
  },
  '/upload/:id': { 
    render: renderUploadDetail, 
    setup: setupUploadDetailHandlers,
    auth: true 
  },
  '/plans': { 
    render: renderPlans, 
    setup: () => {},
    auth: true 
  },
  '/plan/:id': { 
    render: renderPlanDetail, 
    setup: () => {},
    auth: true 
  }
};

function parseRoute(hash) {
  // Remove leading #
  const path = hash.replace(/^#/, '') || '/';
  
  // Check for exact match
  if (routes[path]) {
    return { route: routes[path], params: {} };
  }
  
  // Check for parameterized routes
  for (const [pattern, route] of Object.entries(routes)) {
    if (pattern.includes(':')) {
      const patternParts = pattern.split('/');
      const pathParts = path.split('/');
      
      if (patternParts.length === pathParts.length) {
        const params = {};
        let match = true;
        
        for (let i = 0; i < patternParts.length; i++) {
          if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = pathParts[i];
          } else if (patternParts[i] !== pathParts[i]) {
            match = false;
            break;
          }
        }
        
        if (match) {
          return { route, params };
        }
      }
    }
  }
  
  return null;
}

async function navigate() {
  const hash = window.location.hash || '#/';
  const result = parseRoute(hash);
  
  // Show loading
  document.getElementById('main').innerHTML = '<div class="loading">Loading...</div>';
  
  // Check auth requirement
  if (result && result.route.auth && !auth.isAuthenticated()) {
    window.location.hash = '#/login';
    return;
  }
  
  // Check if trying to access auth pages while logged in
  if (result && !result.route.auth && auth.isAuthenticated() && hash === '#/login') {
    window.location.hash = '#/dashboard';
    return;
  }
  
  if (!result) {
    // Default to dashboard or login
    if (auth.isAuthenticated()) {
      window.location.hash = '#/dashboard';
    } else {
      window.location.hash = '#/login';
    }
    return;
  }
  
  // Update header visibility
  const header = document.getElementById('header');
  if (result.route.auth) {
    header.style.display = 'block';
  } else {
    header.style.display = 'none';
  }
  
  // Render the view
  try {
    const params = result.params;
    const route = result.route;
    
    // Call render with params if needed
    let html;
    if (route.render.length > 0) {
      // Has parameters
      const paramValues = Object.values(params);
      html = await route.render(...paramValues);
    } else {
      html = await route.render();
    }
    
    document.getElementById('main').innerHTML = html;
    
    // Setup handlers
    if (route.setup.length > 0) {
      const paramValues = Object.values(params);
      route.setup(...paramValues);
    } else {
      route.setup();
    }
  } catch (error) {
    document.getElementById('main').innerHTML = showError(error.message);
  }
}

// ============================================================================
// App Initialization
// ============================================================================

async function init() {
  // Setup logout button
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await auth.logout();
    window.location.hash = '#/login';
  });

  // Subscribe to auth changes
  auth.subscribe((user) => {
    if (!user) {
      window.location.hash = '#/login';
    }
  });

  // Initialize auth
  await auth.init();

  // Setup routing
  window.addEventListener('hashchange', navigate);
  
  // Initial navigation
  await navigate();
}

// Start the app
init().catch(console.error);
