/**
 * Planning Box - Local Storage with Backup
 * Shared via manual export/import for now
 */

const Store = {
  DATA_KEY: 'planningbox_data',
  USER_KEY: 'planningbox_user',

  // Get current user
  getUser() {
    return localStorage.getItem(this.USER_KEY) ? JSON.parse(localStorage.getItem(this.USER_KEY)) : null;
  },

  // Set current user
  setUser(user) {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },

  // Get data (create default if none)
  getData() {
    const data = localStorage.getItem(this.DATA_KEY);
    if (!data) {
      return { ideas: [], plans: [], version: 1 };
    }
    return JSON.parse(data);
  },

  // Save data
  saveData(data) {
    localStorage.setItem(this.DATA_KEY, JSON.stringify(data));
    return data;
  },

  // Create new data store
  createNewData() {
    return this.saveData({ ideas: [], plans: [], version: 1 });
  },

  // Clear all
  clear() {
    localStorage.removeItem(this.DATA_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  // Export to JSON file
  exportToFile() {
    const data = this.getData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'planning-box-backup-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
  },

  // Import from file
  importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          this.saveData(data);
          resolve(data);
        } catch (err) {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  },

  // Generate unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
};

window.Store = Store;
