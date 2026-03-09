/**
 * Planning Box - Gist Shared Storage
 * 
 * Architecture:
 * - LocalStorage: immediate cache (sync)
 * - GitHub Gist: shared remote storage
 * - All users read same Gist, writes require GitHub token
 */

const GistStore = {
  GIST_ID: 'bfed497f6154e1290e3723cdc4931d01', // Shared Gist
  DATA_KEY: 'planningbox_data',
  USER_KEY: 'planningbox_user',
  
  // Get data synchronously from cache
  getData() {
    const data = localStorage.getItem(this.DATA_KEY);
    if (!data) {
      return { ideas: [], plans: [], version: 2 };
    }
    try {
      return JSON.parse(data);
    } catch (e) {
      return { ideas: [], plans: [], version: 2 };
    }
  },
  
  // Save to local cache immediately, then try Gist
  async saveData(data) {
    localStorage.setItem(this.DATA_KEY, JSON.stringify(data));
    
    // Try to sync to Gist in background
    this.saveToGist(data).catch(e => console.warn('Gist save failed:', e.message));
    
    return data;
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
  
  // Clear
  clear() {
    localStorage.removeItem(this.USER_KEY);
    // Keep DATA_KEY - don't delete ideas/plans
  },
  
  // Generate ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },
  
  // Sync from Gist (call on page load)
  async syncFromGist() {
    try {
      const response = await fetch(`https://api.github.com/gists/${this.GIST_ID}`);
      if (!response.ok) return null;
      
      const gist = await response.json();
      const filename = Object.keys(gist.files)[0];
      const content = gist.files[filename].content;
      const data = JSON.parse(content);
      
      // Save to local cache
      localStorage.setItem(this.DATA_KEY, JSON.stringify(data));
      console.log('Synced from Gist:', data.ideas.length, 'ideas,', data.plans.length, 'plans');
      return data;
    } catch (e) {
      console.warn('Gist sync failed:', e.message);
      return null;
    }
  },
  
  // Save to Gist (requires token for writes)
  async saveToGist(data) {
    // Without token, writes will fail (rate limited)
    // For now, just log
    console.log('Would save to Gist:', data.ideas.length, 'ideas');
    // In production, add token handling here
  },
  
  // Export to file
  exportToFile() {
    const data = this.getData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'planning-box-backup.json';
    a.click();
  },
  
  // Import from file
  async importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
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
