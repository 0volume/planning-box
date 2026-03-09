/**
 * Planning Box - Robust Gist Storage
 * - Reads from public Gist (no auth needed)
 * - Writes to Gist with token (stored securely)
 * - Keeps local backup before any write
 * - Version history to prevent data loss
 */

const GistStore = {
  GIST_ID: 'bfed497f6154e1290e3723cdc4931d01',
  DATA_KEY: 'planningbox_data',
  USER_KEY: 'planningbox_user',
  TOKEN_KEY: 'planningbox_github_token',
  BACKUP_KEY: 'planningbox_backup',
  
  // Get token (stored in sessionStorage for extra safety)
  getToken() {
    return sessionStorage.getItem(this.TOKEN_KEY) || localStorage.getItem(this.TOKEN_KEY);
  },
  
  // Set token
  setToken(token) {
    sessionStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.TOKEN_KEY, token);
  },
  
  // Get data from cache
  getData() {
    const data = localStorage.getItem(this.DATA_KEY);
    if (!data) return { ideas: [], plans: [], version: 2 };
    try {
      return JSON.parse(data);
    } catch (e) {
      return { ideas: [], plans: [], version: 2 };
    }
  },
  
  // Save data with backup
  async saveData(data) {
    // Always keep local backup BEFORE saving
    const currentData = this.getData();
    this.createBackup(currentData);
    
    // Save to local cache
    localStorage.setItem(this.DATA_KEY, JSON.stringify(data));
    
    // Try to save to Gist if we have a token
    const token = this.getToken();
    if (token) {
      try {
        await this.saveToGist(data, token);
        console.log('Saved to Gist');
      } catch (e) {
        console.warn('Gist save failed:', e.message);
      }
    }
    
    return data;
  },
  
  // Create local backup
  createBackup(data) {
    const backups = JSON.parse(localStorage.getItem(this.BACKUP_KEY) || '[]');
    backups.unshift({
      timestamp: new Date().toISOString(),
      data: data
    });
    // Keep last 10 backups
    if (backups.length > 10) backups.pop();
    localStorage.setItem(this.BACKUP_KEY, JSON.stringify(backups));
  },
  
  // Restore from backup
  restoreBackup(backupIndex) {
    const backups = JSON.parse(localStorage.getItem(this.BACKUP_KEY) || '[]');
    if (backups[backupIndex]) {
      const data = backups[backupIndex].data;
      localStorage.setItem(this.DATA_KEY, JSON.stringify(data));
      return data;
    }
    return null;
  },
  
  // Get list of backups
  getBackups() {
    const backups = JSON.parse(localStorage.getItem(this.BACKUP_KEY) || '[]');
    return backups.map((b, i) => ({
      index: i,
      timestamp: b.timestamp,
      ideas: b.data?.ideas?.length || 0,
      plans: b.data?.plans?.length || 0
    }));
  },
  
  // Sync from Gist
  async syncFromGist() {
    try {
      const response = await fetch(`https://api.github.com/gists/${this.GIST_ID}`);
      if (!response.ok) return null;
      
      const gist = await response.json();
      const filename = Object.keys(gist.files)[0];
      const content = gist.files[filename].content;
      const data = JSON.parse(content);
      
      // Create backup before overwriting
      this.createBackup(this.getData());
      
      // Save to local
      localStorage.setItem(this.DATA_KEY, JSON.stringify(data));
      console.log('Synced from Gist:', data.ideas?.length || 0, 'ideas');
      return data;
    } catch (e) {
      console.warn('Gist sync failed:', e.message);
      return null;
    }
  },
  
  // Save to Gist with auth
  async saveToGist(data, token) {
    const response = await fetch(`https://api.github.com/gists/${this.GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: 'Planning Box - ' + new Date().toISOString(),
        files: {
          'planning-box.json': {
            content: JSON.stringify(data, null, 2)
          }
        }
      })
    });
    
    if (!response.ok) {
      const err = await response.text();
      throw new Error('Failed to save: ' + response.status);
    }
    return true;
  },
  
  // Get user
  getUser() {
    const u = localStorage.getItem(this.USER_KEY);
    return u ? JSON.parse(u) : null;
  },
  
  // Set user
  setUser(user) {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },
  
  // Clear (but not data)
  clear() {
    localStorage.removeItem(this.USER_KEY);
  },
  
  // Generate ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },
  
  // Export to file
  exportToFile() {
    const data = this.getData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'planning-box-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
  },
  
  // Import from file
  async importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          this.createBackup(this.getData());
          this.saveData(data);
          resolve(data);
        } catch (err) {
          reject(new Error('Invalid file'));
        }
      };
      reader.onerror = () => reject(new Error('Read error'));
      reader.readAsText(file);
    });
  }
};

const Store = GistStore;
window.Store = Store;
