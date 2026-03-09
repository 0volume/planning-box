/**
 * Planning Box - SPA
 */

const app = document.getElementById('app');
let currentUser = null;
let currentData = null;

// Initialize
async function init() {
  try {
    // Try to sync from shared Gist first
    const syncedData = await Store.syncFromGist();
    if (syncedData) {
      console.log('Loaded shared data from Gist');
    }
    
    currentUser = Store.getUser();
    if (currentUser) {
      currentData = Store.getData();
      if (!currentData) {
        currentData = { ideas: [], plans: [], version: 2 };
        Store.saveData(currentData);
      }
    }
  } catch (e) {
    console.error('Init error:', e);
    currentUser = null;
    currentData = null;
  }
  renderLoginOrDashboard();
}

function renderLoginOrDashboard() {
  if (currentUser && currentData) {
    renderDashboard();
  } else {
    renderLogin();
  }
}

function renderView(view, data = null) {
  switch (view) {
    case 'dashboard': renderDashboard(data?.status || 'all'); break;
    case 'idea-new': renderIdeaForm(null); break;
    case 'idea-edit': renderIdeaForm(data); break;
    case 'idea-view': renderIdeaView(data); break;
    case 'plans': renderPlans(); break;
    case 'plan-view': renderPlanView(data); break;
    case 'backup': renderBackup(); break;
    default: renderDashboard();
  }
}

// Login
function renderLogin() {
  app.innerHTML = `
    <div class="auth-container">
      <h1>💡 Planning Box</h1>
      <p class="subtitle">Shared planning for humans + AI agents</p>
      <div class="card">
        <h2>Enter Your Name</h2>
        <form id="login-form">
          <input type="text" name="username" placeholder="Your name" required>
          <button type="submit">Continue</button>
        </form>
      </div>
    </div>
  `;
  
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const username = form.username.value.trim();
    if (!username) return;
    
    currentUser = { username };
    Store.setUser(currentUser);
    currentData = Store.getData();
    
    // Ensure we always have data structure
    if (!currentData || !currentData.ideas) {
      currentData = { ideas: [], plans: [], version: 2 };
      Store.saveData(currentData);
    }
    
    renderDashboard();
  });
}

// Dashboard
async function renderDashboard(filterStatus = 'all') {
  if (!currentData) currentData = Store.getData();
  
  const ideas = currentData.ideas || [];
  const plans = currentData.plans || [];
  
  const counts = { all: ideas.length, open: 0, processing: 0, planned: 0, complete: 0 };
  ideas.forEach(i => {
    if (counts[i.status] !== undefined) counts[i.status]++;
  });
  
  const filteredIdeas = filterStatus === 'all' ? ideas : ideas.filter(i => i.status === filterStatus);
  
  const linkedIdeaIds = new Set();
  plans.forEach(p => (p.ideaIds || []).forEach(id => linkedIdeaIds.add(id)));
  
  app.innerHTML = `
    <header class="header">
      <div class="header-content">
        <h1>💡 Planning Box</h1>
        <nav>
          <span>Welcome, ${escapeHtml(currentUser.username)}</span>
          <a href="#" data-action="backup">💾 Backup</a>
          <a href="#" data-action="logout">Logout</a>
        </nav>
      </div>
    </header>
    
    <main class="main">
      <div class="tabs">
        <div class="tab-group">
          <button class="tab ${filterStatus === 'all' ? 'active' : ''}" data-status="all">All (${counts.all})</button>
          <button class="tab ${filterStatus === 'open' ? 'active' : ''}" data-status="open">🆕 Open (${counts.open})</button>
          <button class="tab ${filterStatus === 'processing' ? 'active' : ''}" data-status="processing">🔄 Processing (${counts.processing})</button>
          <button class="tab ${filterStatus === 'planned' ? 'active' : ''}" data-status="planned">📋 Planned (${counts.planned})</button>
          <button class="tab ${filterStatus === 'complete' ? 'active' : ''}" data-status="complete">✅ Complete (${counts.complete})</button>
        </div>
        <button class="btn-primary" data-action="idea-new">+ New Idea</button>
      </div>
      
      <div class="section">
        <h2>💡 Ideas</h2>
        <div class="idea-list">
          ${filteredIdeas.length === 0 ? '<p class="empty">No ideas yet. Create one to get started!</p>' : ''}
          ${filteredIdeas.map(i => `
            <div class="idea-item ${linkedIdeaIds.has(i.id) ? 'linked' : ''}">
              <div class="idea-main">
                <div class="idea-title">${escapeHtml(i.title)}</div>
                <div class="idea-meta">
                  <span class="status-badge ${i.status}">${getStatusIcon(i.status)} ${i.status}</span>
                  ${linkedIdeaIds.has(i.id) ? '<span class="linked-badge">📎 Linked to plan</span>' : ''}
                  <span class="date">${formatDate(i.createdAt)}</span>
                </div>
                <div class="idea-tags">${(i.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
              </div>
              <div class="idea-actions">
                <button class="btn-small" data-action="idea-view" data-id="${i.id}">View</button>
                <button class="btn-small" data-action="idea-edit" data-id="${i.id}">Edit</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div class="section">
        <div class="section-header">
          <h2>📄 Agent Plans</h2>
          <button class="btn-secondary" data-action="plans">View All Plans</button>
        </div>
        <div class="plan-preview-list">
          ${plans.length === 0 ? '<p class="empty" style="text-align:center;padding:20px;">No agent-generated plans yet.<br>Agents will create plans linked to your ideas.</p>' : ''}
          ${plans.slice(0, 3).map(p => `
            <div class="plan-preview" data-action="plan-view" data-id="${p.id}">
              <div class="plan-preview-title">${escapeHtml(p.title)}</div>
              <div class="plan-preview-meta">
                <span>${(p.ideaIds || []).length} ideas</span>
                <span>${p.phases?.length || 0} phases</span>
              </div>
              <div class="plan-preview-ideas">
                ${(p.ideaIds || []).slice(0, 3).map(iid => {
                  const idea = ideas.find(i => i.id === iid);
                  return idea ? `<span class="tag">${escapeHtml(idea.title.substring(0, 20))}</span>` : '';
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </main>
  `;
  
  setupListeners();
}

function getStatusIcon(status) {
  return { open: '🆕', processing: '🔄', planned: '📋', complete: '✅' }[status] || '';
}

function setupListeners() {
  document.querySelectorAll('[data-status]').forEach(el => {
    el.addEventListener('click', () => renderDashboard(el.dataset.status));
  });
  
  document.querySelectorAll('[data-action="logout"]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      currentUser = null;
      // Don't clear data - keep it!
      localStorage.removeItem('planningbox_user'); // Only clear user, not data
      renderLogin();
    });
  });
  
  document.querySelectorAll('[data-action="idea-new"]').forEach(el => el.addEventListener('click', () => renderIdeaForm(null)));
  document.querySelectorAll('[data-action="idea-view"]').forEach(el => el.addEventListener('click', () => renderIdeaView(el.dataset.id)));
  document.querySelectorAll('[data-action="idea-edit"]').forEach(el => el.addEventListener('click', () => renderIdeaForm(el.dataset.id)));
  document.querySelectorAll('[data-action="plans"]').forEach(el => el.addEventListener('click', () => renderPlans()));
  document.querySelectorAll('.plan-preview').forEach(el => el.addEventListener('click', () => renderPlanView(el.dataset.id)));
  document.querySelectorAll('[data-action="backup"]').forEach(el => el.addEventListener('click', (e) => { e.preventDefault(); renderBackup(); }));
}

// Idea Form
function renderIdeaForm(id) {
  if (!currentData) currentData = Store.getData();
  const ideas = currentData.ideas || [];
  const idea = id ? ideas.find(i => i.id === id) : null;
  
  app.innerHTML = `
    <div class="form-container">
      <h1>${id ? '✏️ Edit Idea' : '💡 New Idea'}</h1>
      <form id="idea-form">
        <label>Title</label>
        <input type="text" name="title" placeholder="What's your idea?" value="${escapeHtml(idea?.title || '')}" required>
        
        <label>Status</label>
        <select name="status">
          <option value="open" ${idea?.status === 'open' ? 'selected' : ''}>🆕 Open</option>
          <option value="processing" ${idea?.status === 'processing' ? 'selected' : ''}>🔄 Processing</option>
          <option value="planned" ${idea?.status === 'planned' ? 'selected' : ''}>📋 Planned</option>
          <option value="complete" ${idea?.status === 'complete' ? 'selected' : ''}>✅ Complete</option>
        </select>
        
        <label>Tags (comma-separated)</label>
        <input type="text" name="tags" placeholder="feature, bug, improvement" value="${idea?.tags?.join(', ') || ''}">
        
        <label>Description</label>
        <textarea name="content" rows="12" placeholder="Describe your idea in detail..." required>${escapeHtml(idea?.content || '')}</textarea>
        
        <div class="form-actions">
          <button type="submit" class="btn-primary">${id ? 'Update' : 'Create'} Idea</button>
          <button type="button" class="btn-secondary" data-action="dashboard">Cancel</button>
          ${id ? '<button type="button" class="btn-danger" data-action="delete" data-id="' + id + '">Delete</button>' : ''}
        </div>
      </form>
    </div>
  `;
  
  document.getElementById('idea-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    
    if (!currentData) currentData = Store.getData();
    const ideas = currentData.ideas || [];
    
    const data = {
      id: id || Store.generateId(),
      title: form.title.value.trim(),
      content: form.content.value,
      status: form.status.value,
      tags: form.tags.value.split(',').map(t => t.trim()).filter(t => t),
      createdAt: idea?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    if (id) {
      const idx = ideas.findIndex(i => i.id === id);
      if (idx >= 0) ideas[idx] = data;
    } else {
      ideas.push(data);
    }
    
    currentData.ideas = ideas;
    Store.saveData(currentData);
    renderDashboard();
  });
  
  document.querySelector('[data-action="dashboard"]').addEventListener('click', () => renderDashboard());
  
  if (id) {
    document.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (confirm('Delete this idea?')) {
        if (!currentData) currentData = Store.getData();
        currentData.ideas = (currentData.ideas || []).filter(i => i.id !== id);
        Store.saveData(currentData);
        renderDashboard();
      }
    });
  }
}

// Idea View
function renderIdeaView(id) {
  if (!currentData) currentData = Store.getData();
  const ideas = currentData.ideas || [];
  const plans = currentData.plans || [];
  const idea = ideas.find(i => i.id === id);
  if (!idea) return renderDashboard();
  
  const linkedPlans = plans.filter(p => (p.ideaIds || []).includes(id));
  
  app.innerHTML = `
    <div class="view-container">
      <button class="btn-back" data-action="dashboard">← Back</button>
      
      <div class="idea-detail">
        <div class="idea-detail-header">
          <h1>${escapeHtml(idea.title)}</h1>
          <span class="status-badge ${idea.status}">${getStatusIcon(idea.status)} ${idea.status}</span>
        </div>
        
        <div class="meta">
          <span>Created: ${formatDate(idea.createdAt)}</span>
          <span>Updated: ${formatDate(idea.updatedAt)}</span>
        </div>
        
        <div class="tags">${(idea.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
        
        <div class="content">${escapeHtml(idea.content).replace(/\n/g, '<br>')}</div>
        
        <div class="actions">
          <button class="btn-primary" data-action="idea-edit" data-id="${id}">✏️ Edit</button>
        </div>
      </div>
      
      ${linkedPlans.length > 0 ? `
        <div class="linked-plans-section">
          <h3>📄 Linked Plans</h3>
          <div class="linked-plans-list">
            ${linkedPlans.map(p => `
              <div class="linked-plan-item" data-action="plan-view" data-id="${p.id}">
                <span class="plan-title">${escapeHtml(p.title)}</span>
                <span class="plan-phases">${p.phases?.length || 0} phases</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : '<p class="empty">This idea is not yet linked to any plans.</p>'}
    </div>
  `;
  
  document.querySelector('[data-action="dashboard"]').addEventListener('click', () => renderDashboard());
  document.querySelector('[data-action="idea-edit"]').addEventListener('click', () => renderIdeaForm(id));
  document.querySelectorAll('.linked-plan-item').forEach(el => el.addEventListener('click', () => renderPlanView(el.dataset.id)));
}

// Plans
function renderPlans() {
  if (!currentData) currentData = Store.getData();
  const ideas = currentData.ideas || [];
  const plans = currentData.plans || [];
  
  app.innerHTML = `
    <div class="view-container">
      <button class="btn-back" data-action="dashboard">← Back</button>
      <h1>📄 Agent Plans</h1>
      <p class="info">Plans generated by AI agents based on your ideas.</p>
      
      <div class="plan-list">
        ${plans.length === 0 ? '<p class="empty" style="text-align:center;padding:20px;">No agent-generated plans yet.<br>Agents will create plans linked to your ideas.</p>' : ''}
        ${plans.map(p => `
          <div class="plan-card" data-action="plan-view" data-id="${p.id}">
            <h3>${escapeHtml(p.title)}</h3>
            <p class="plan-excerpt">${escapeHtml(p.content.substring(0, 150))}...</p>
            <div class="plan-card-meta">
              <span>📅 ${formatDate(p.createdAt)}</span>
              <span>📋 ${p.phases?.length || 0} phases</span>
              <span>💡 ${(p.ideaIds || []).length} ideas</span>
            </div>
            <div class="plan-card-ideas">
              ${(p.ideaIds || []).map(iid => {
                const idea = ideas.find(i => i.id === iid);
                return idea ? `<span class="tag">💡 ${escapeHtml(idea.title.substring(0, 25))}</span>` : '';
              }).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  document.querySelector('[data-action="dashboard"]').addEventListener('click', () => renderDashboard());
  document.querySelectorAll('.plan-card').forEach(el => el.addEventListener('click', () => renderPlanView(el.dataset.id)));
}

// Plan View
function renderPlanView(id) {
  if (!currentData) currentData = Store.getData();
  const ideas = currentData.ideas || [];
  const plans = currentData.plans || [];
  const plan = plans.find(p => p.id === id);
  if (!plan) return renderPlans();
  
  const linkedIdeas = (plan.ideaIds || []).map(iid => ideas.find(i => i.id === iid)).filter(Boolean);
  
  app.innerHTML = `
    <div class="view-container">
      <button class="btn-back" data-action="plans">← Back to Plans</button>
      
      <div class="plan-detail">
        <div class="plan-detail-header">
          <h1>📄 ${escapeHtml(plan.title)}</h1>
          <span class="plan-badge">Agent Generated</span>
        </div>
        
        <div class="meta"><span>Created: ${formatDate(plan.createdAt)}</span></div>
        
        <div class="plan-content">
          <h3>Description</h3>
          <p>${escapeHtml(plan.content).replace(/\n/g, '<br>')}</p>
        </div>
        
        <div class="linked-ideas-section">
          <h3>💡 Based on Ideas (${linkedIdeas.length})</h3>
          <div class="linked-ideas-grid">
            ${linkedIdeas.map(idea => `
              <div class="linked-idea-card" data-action="idea-view" data-id="${idea.id}">
                <div class="linked-idea-title">${escapeHtml(idea.title)}</div>
                <div class="linked-idea-status">
                  <span class="status-badge ${idea.status}">${getStatusIcon(idea.status)} ${idea.status}</span>
                </div>
                <div class="linked-idea-tags">${(idea.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
              </div>
            `).join('')}
          </div>
        </div>
        
        ${plan.phases?.length ? `
          <div class="phases-section">
            <h3>📋 Implementation Phases</h3>
            <div class="phases-timeline">
              ${plan.phases.map((phase, idx) => `
                <div class="phase-item">
                  <div class="phase-number">${idx + 1}</div>
                  <div class="phase-content">
                    <h4>${escapeHtml(phase.title)}</h4>
                    <p>${escapeHtml(phase.description || '')}</p>
                    ${phase.tasks ? `<div class="phase-tasks"><strong>Tasks:</strong>${phase.tasks.map(t => `<div class="task-item">• ${escapeHtml(t)}</div>`).join('')}</div>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
  document.querySelector('[data-action="plans"]').addEventListener('click', () => renderPlans());
  document.querySelectorAll('[data-action="idea-view"]').forEach(el => el.addEventListener('click', () => renderIdeaView(el.dataset.id)));
}

// Backup
function renderBackup() {
  app.innerHTML = `
    <div class="view-container">
      <button class="btn-back" data-action="dashboard">← Back</button>
      <h1>💾 Backup & Restore</h1>
      <p class="info">Download a backup of all ideas and plans, or restore from a previous backup.</p>
      
      <div class="card" style="margin-bottom: 20px;">
        <h3>📥 Download Backup</h3>
        <p style="color: var(--text-muted); margin: 10px 0;">Save your ideas and plans to a JSON file.</p>
        <button class="btn-primary" id="export-btn">Download JSON</button>
      </div>
      
      <div class="card">
        <h3>📤 Restore from Backup</h3>
        <p style="color: var(--text-muted); margin: 10px 0;">Upload a previously downloaded JSON backup file.</p>
        <input type="file" id="import-file" accept=".json" style="margin-bottom: 15px;">
        <button class="btn-secondary" id="import-btn">Restore Backup</button>
      </div>
    </div>
  `;
  
  document.querySelector('[data-action="dashboard"]').addEventListener('click', () => renderDashboard());
  
  document.getElementById('export-btn').addEventListener('click', () => {
    Store.exportToFile();
  });
  
  document.getElementById('import-btn').addEventListener('click', async () => {
    const file = document.getElementById('import-file').files[0];
    if (!file) {
      alert('Please select a file first');
      return;
    }
    try {
      await Store.importFromFile(file);
      currentData = Store.getData();
      alert('Backup restored successfully!');
      renderDashboard();
    } catch (e) {
      alert('Failed to restore: ' + e.message);
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
