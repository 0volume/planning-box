/**
 * Planning Box - Self-contained SPA
 * All data encrypted and stored locally
 */

const app = document.getElementById('app');
let currentUser = null;
let currentData = null;
let currentPassword = null;

// Initialize
async function init() {
  currentUser = Store.getUser();
  if (currentUser) {
    renderDashboard();
  } else {
    renderLogin();
  }
}

// Router
function navigate(view, data = null) {
  if (view === 'login' || view === 'register') {
    renderLogin();
  } else if (currentUser) {
    renderView(view, data);
  } else {
    renderLogin();
  }
}

function renderView(view, data = null) {
  switch (view) {
    case 'dashboard': renderDashboard(); break;
    case 'upload-new': renderUploadForm(null); break;
    case 'upload-edit': renderUploadForm(data); break;
    case 'upload-view': renderUploadView(data); break;
    case 'plans': renderPlans(); break;
    case 'export': renderExport(); break;
    case 'import': renderImport(); break;
    default: renderDashboard();
  }
}

// Login
function renderLogin() {
  app.innerHTML = `
    <div class="auth-container">
      <h1>🔐 Planning Box</h1>
      <div class="card">
        <h2>Login</h2>
        <form id="login-form">
          <input type="text" name="username" placeholder="Username" required>
          <input type="password" name="password" placeholder="Password" required>
          <button type="submit">Login</button>
        </form>
        <p>New? <a href="#" data-action="register">Create account</a></p>
      </div>
    </div>
  `;
  
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const username = form.username.value.trim();
    const password = form.password.value;
    
    if (!username || !password) {
      alert('Please fill in all fields');
      return;
    }
    
    try {
      currentPassword = password;
      currentData = await Store.getData(password);
      currentUser = { username };
      Store.setUser(currentUser);
      renderDashboard();
    } catch (err) {
      alert('Invalid username or password');
    }
  });
  
  document.querySelector('[data-action="register"]').addEventListener('click', (e) => {
    e.preventDefault();
    renderRegister();
  });
}

// Register
function renderRegister() {
  app.innerHTML = `
    <div class="auth-container">
      <h1>🔐 Planning Box</h1>
      <div class="card">
        <h2>Create Account</h2>
        <form id="register-form">
          <input type="text" name="username" placeholder="Choose a username" required>
          <input type="password" name="password" placeholder="Choose a password (min 8 chars)" required>
          <input type="password" name="confirm" placeholder="Confirm password" required>
          <button type="submit">Create Account</button>
        </form>
        <p>Already have one? <a href="#" data-action="login">Login</a></p>
      </div>
    </div>
  `;
  
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const username = form.username.value.trim();
    const password = form.password.value;
    const confirm = form.confirm.value;
    
    if (password.length < 8) {
      alert('Password must be at least 8 characters');
      return;
    }
    
    if (password !== confirm) {
      alert('Passwords do not match');
      return;
    }
    
    try {
      currentPassword = password;
      currentData = await Store.createNewData(password);
      currentUser = { username };
      Store.setUser(currentUser);
      renderDashboard();
    } catch (err) {
      alert('Failed to create account');
    }
  });
  
  document.querySelector('[data-action="login"]').addEventListener('click', (e) => {
    e.preventDefault();
    renderLogin();
  });
}

// Dashboard
function renderDashboard() {
  const counts = { open: 0, processing: 0, planned: 0, complete: 0 };
  currentData.uploads.forEach(u => {
    if (counts[u.status] !== undefined) counts[u.status]++;
  });
  
  app.innerHTML = `
    <header class="header">
      <div class="header-content">
        <h1>📋 Planning Box</h1>
        <nav>
          <span>Welcome, ${escapeHtml(currentUser.username)}</span>
          <a href="#" data-action="export">Export</a>
          <a href="#" data-action="import">Import</a>
          <a href="#" data-action="logout">Logout</a>
        </nav>
      </div>
    </header>
    
    <main class="main">
      <div class="status-cards">
        <div class="status-card open">${counts.open}<span>Open</span></div>
        <div class="status-card processing">${counts.processing}<span>Processing</span></div>
        <div class="status-card planned">${counts.planned}<span>Planned</span></div>
        <div class="status-card complete">${counts.complete}<span>Complete</span></div>
      </div>
      
      <div class="section">
        <div class="section-header">
          <h2>Your Plan-Uploads</h2>
          <button class="btn-primary" data-action="upload-new">+ New</button>
        </div>
        
        <div class="upload-list">
          ${currentData.uploads.length === 0 ? '<p class="empty">No uploads yet. Create one to get started!</p>' : ''}
          ${currentData.uploads.map(u => `
            <div class="upload-item">
              <div class="upload-title">${escapeHtml(u.title)}</div>
              <div class="upload-meta">
                <span class="status-badge ${u.status}">${u.status}</span>
                <span class="date">${formatDate(u.createdAt)}</span>
                <button class="btn-small" data-action="upload-view" data-id="${u.id}">View</button>
                <button class="btn-small" data-action="upload-edit" data-id="${u.id}">Edit</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </main>
  `;
  
  setupDashboardListeners();
}

function setupDashboardListeners() {
  document.querySelectorAll('[data-action="logout"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      currentUser = null;
      currentData = null;
      currentPassword = null;
      Store.clear();
      renderLogin();
    });
  });
  
  document.querySelectorAll('[data-action="upload-new"]').forEach(el => {
    el.addEventListener('click', () => renderUploadForm(null));
  });
  
  document.querySelectorAll('[data-action="upload-view"]').forEach(el => {
    el.addEventListener('click', () => renderUploadView(el.dataset.id));
  });
  
  document.querySelectorAll('[data-action="upload-edit"]').forEach(el => {
    el.addEventListener('click', () => renderUploadForm(el.dataset.id));
  });
  
  document.querySelectorAll('[data-action="export"]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); renderExport(); });
  });
  
  document.querySelectorAll('[data-action="import"]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); renderImport(); });
  });
}

// Upload Form
function renderUploadForm(id) {
  const upload = id ? currentData.uploads.find(u => u.id === id) : null;
  
  app.innerHTML = `
    <div class="form-container">
      <h1>${id ? 'Edit' : 'New'} Plan-Upload</h1>
      <form id="upload-form">
        <input type="text" name="title" placeholder="Title" value="${escapeHtml(upload?.title || '')}" required>
        
        <label>Status</label>
        <select name="status">
          <option value="open" ${upload?.status === 'open' ? 'selected' : ''}>Open</option>
          <option value="processing" ${upload?.status === 'processing' ? 'selected' : ''}>Processing</option>
          <option value="planned" ${upload?.status === 'planned' ? 'selected' : ''}>Planned</option>
          <option value="complete" ${upload?.status === 'complete' ? 'selected' : ''}>Complete</option>
        </select>
        
        <label>Tags (comma-separated)</label>
        <input type="text" name="tags" placeholder="feature, idea" value="${upload?.tags?.join(', ') || ''}">
        
        <label>Content</label>
        <textarea name="content" rows="10" placeholder="Describe your idea..." required>${escapeHtml(upload?.content || '')}</textarea>
        
        <div class="form-actions">
          <button type="submit" class="btn-primary">${id ? 'Update' : 'Create'}</button>
          <button type="button" class="btn-secondary" data-action="dashboard">Cancel</button>
          ${id ? '<button type="button" class="btn-danger" data-action="delete" data-id="' + id + '">Delete</button>' : ''}
        </div>
      </form>
    </div>
  `;
  
  document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    
    const data = {
      id: id || Store.generateId(),
      title: form.title.value.trim(),
      content: form.content.value,
      status: form.status.value,
      tags: form.tags.value.split(',').map(t => t.trim()).filter(t => t),
      createdAt: upload?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    if (id) {
      const idx = currentData.uploads.findIndex(u => u.id === id);
      if (idx >= 0) currentData.uploads[idx] = data;
    } else {
      currentData.uploads.push(data);
    }
    
    await Store.saveData(currentData, currentPassword);
    renderDashboard();
  });
  
  document.querySelector('[data-action="dashboard"]').addEventListener('click', (e) => {
    e.preventDefault();
    renderDashboard();
  });
  
  if (id) {
    document.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (confirm('Delete this upload?')) {
        currentData.uploads = currentData.uploads.filter(u => u.id !== id);
        await Store.saveData(currentData, currentPassword);
        renderDashboard();
      }
    });
  }
}

// Upload View
function renderUploadView(id) {
  const upload = currentData.uploads.find(u => u.id === id);
  if (!upload) return renderDashboard();
  
  const comments = currentData.comments.filter(c => c.uploadId === id);
  
  app.innerHTML = `
    <div class="view-container">
      <button class="btn-back" data-action="dashboard">← Back</button>
      
      <div class="upload-detail">
        <h1>${escapeHtml(upload.title)}</h1>
        <div class="meta">
          <span class="status-badge ${upload.status}">${upload.status}</span>
          <span>Created: ${formatDate(upload.createdAt)}</span>
        </div>
        
        <div class="tags">
          ${(upload.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        
        <div class="content">${escapeHtml(upload.content).replace(/\n/g, '<br>')}</div>
        
        <div class="actions">
          <button class="btn-primary" data-action="upload-edit" data-id="${id}">Edit</button>
        </div>
      </div>
      
      <div class="comments-section">
        <h2>Comments</h2>
        
        <form id="comment-form">
          <textarea name="content" placeholder="Add a comment..." required></textarea>
          <button type="submit">Post</button>
        </form>
        
        <div class="comments-list">
          ${comments.length === 0 ? '<p>No comments yet.</p>' : ''}
          ${comments.map(c => `
            <div class="comment">
              <div class="comment-header">
                <strong>${escapeHtml(c.author)}</strong>
                <span>${formatDate(c.createdAt)}</span>
              </div>
              <div class="comment-content">${escapeHtml(c.content)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  
  document.querySelector('[data-action="dashboard"]').addEventListener('click', () => renderDashboard());
  document.querySelector('[data-action="upload-edit"]').addEventListener('click', () => renderUploadForm(id));
  
  document.getElementById('comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const comment = {
      id: Store.generateId(),
      uploadId: id,
      author: currentUser.username,
      content: form.content.value,
      createdAt: new Date().toISOString()
    };
    currentData.comments.push(comment);
    await Store.saveData(currentData, currentPassword);
    renderUploadView(id);
  });
}

// Plans (Read-only view)
function renderPlans() {
  app.innerHTML = `
    <div class="view-container">
      <button class="btn-back" data-action="dashboard">← Back</button>
      <h1>Plans (Generated by Agents)</h1>
      <p>Agents will read your uploads and generate plans. Import a plans JSON to see them here.</p>
    </div>
  `;
  
  document.querySelector('[data-action="dashboard"]').addEventListener('click', () => renderDashboard());
}

// Export
function renderExport() {
  const json = Store.exportJSON();
  
  app.innerHTML = `
    <div class="view-container">
      <button class="btn-back" data-action="dashboard">← Back</button>
      <h1>Export Data</h1>
      <p>Copy this JSON to share with agents or back up your data:</p>
      <textarea id="export-area" rows="15">${escapeHtml(json)}</textarea>
      <button class="btn-primary" id="copy-btn">Copy to Clipboard</button>
    </div>
  `;
  
  document.querySelector('[data-action="dashboard"]').addEventListener('click', () => renderDashboard());
  document.getElementById('copy-btn').addEventListener('click', () => {
    document.getElementById('export-area').select();
    document.execCommand('copy');
    alert('Copied!');
  });
}

// Import
function renderImport() {
  app.innerHTML = `
    <div class="view-container">
      <button class="btn-back" data-action="dashboard">← Back</button>
      <h1>Import Data</h1>
      <p>Paste a previously exported JSON to import:</p>
      <textarea id="import-area" rows="15" placeholder="Paste JSON here..."></textarea>
      <button class="btn-primary" id="import-btn">Import</button>
    </div>
  `;
  
  document.querySelector('[data-action="dashboard"]').addEventListener('click', () => renderDashboard());
  document.getElementById('import-btn').addEventListener('click', async () => {
    const json = document.getElementById('import-area').value.trim();
    if (!json) {
      alert('Please paste JSON data');
      return;
    }
    
    try {
      await Store.importJSON(json, currentPassword);
      currentData = await Store.getData(currentPassword);
      alert('Import successful!');
      renderDashboard();
    } catch (e) {
      alert('Import failed: ' + e.message);
    }
  });
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Start
init();
