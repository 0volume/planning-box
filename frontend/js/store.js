/**
 * Local Storage Data Store
 * All data encrypted with user's password
 */

const Store = {
  KEYS: {
    USER: 'planningbox_user',
    DATA: 'planningbox_data',
    SALT: 'planningbox_salt'
  },

  // Get current user
  getUser() {
    const user = localStorage.getItem(this.KEYS.USER);
    return user ? JSON.parse(user) : null;
  },

  // Set current user
  setUser(user) {
    localStorage.setItem(this.KEYS.USER, JSON.stringify(user));
  },

  // Clear all data (logout)
  clear() {
    localStorage.removeItem(this.KEYS.USER);
    localStorage.removeItem(this.KEYS.DATA);
    localStorage.removeItem(this.KEYS.SALT);
  },

  // Get data store
  async getData(password) {
    const encrypted = localStorage.getItem(this.KEYS.DATA);
    const salt = localStorage.getItem(this.KEYS.SALT);
    
    if (!encrypted || !salt) {
      return this.createNewData(password);
    }
    
    try {
      const data = await Crypto.decrypt(encrypted, password);
      return data;
    } catch (e) {
      throw new Error('Invalid password');
    }
  },

  // Create new data store
  async createNewData(password) {
    const data = {
      ideas: [],
      plans: [],
      comments: [],
      version: 1
    };
    
    await this.saveData(data, password);
    return data;
  },

  // Save data (encrypts with password)
  async saveData(data, password) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    
    localStorage.setItem(this.KEYS.SALT, btoa(String.fromCharCode(...salt)));
    
    const encrypted = await Crypto.encrypt(data, password);
    localStorage.setItem(this.KEYS.DATA, encrypted);
  },

  // Export data as JSON (for agents)
  exportJSON() {
    const data = localStorage.getItem(this.KEYS.DATA);
    const salt = localStorage.getItem(this.KEYS.SALT);
    
    if (!data) return null;
    
    return JSON.stringify({
      salt,
      data,
      exportedAt: new Date().toISOString()
    }, null, 2);
  },

  // Import JSON data
  async importJSON(jsonString, password) {
    try {
      const imported = JSON.parse(jsonString);
      
      if (imported.salt) {
        localStorage.setItem(this.KEYS.SALT, imported.salt);
      }
      if (imported.data) {
        localStorage.setItem(this.KEYS.DATA, imported.data);
      }
      
      // Verify it works
      return await this.getData(password);
    } catch (e) {
      throw new Error('Invalid import data');
    }
  },

  // Generate unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
};

window.Store = Store;
