/**
 * Planning Box - Auth State Management
 */

import api from './api.js';

const SESSION_KEY = 'planning_box_session';

class AuthManager {
  constructor() {
    this.user = null;
    this.listeners = [];
  }

  /**
   * Initialize auth state from localStorage
   * Also establishes a session for new visitors
   */
  async init() {
    // First, establish a session by hitting /auth/me
    // This GET request will create a session and return CSRF token
    await api.fetchCsrfToken();
    
    const session = localStorage.getItem(SESSION_KEY);
    if (session) {
      try {
        const data = await api.getCurrentUser();
        if (data.authenticated) {
          this.user = data.user;
          this.notifyListeners();
          return true;
        }
      } catch (e) {
        // Session invalid
        this.logout();
      }
    }
    return false;
  }

  /**
   * Register a new user
   */
  async register(username, password) {
    const result = await api.register(username, password);
    return result;
  }

  /**
   * Login user
   */
  async login(username, password) {
    const result = await api.login(username, password);
    if (result.user) {
      this.user = result.user;
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        userId: result.user.id,
        username: result.user.username,
        timestamp: Date.now()
      }));
      this.notifyListeners();
    }
    return result;
  }

  /**
   * Logout user
   */
  async logout() {
    try {
      await api.logout();
    } catch (e) {
      // Ignore logout errors
    }
    this.user = null;
    localStorage.removeItem(SESSION_KEY);
    this.notifyListeners();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.user;
  }

  /**
   * Get current user
   */
  getUser() {
    return this.user;
  }

  /**
   * Subscribe to auth state changes
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Notify all listeners of auth state change
   */
  notifyListeners() {
    this.listeners.forEach(callback => callback(this.user));
  }
}

// Export singleton instance
const auth = new AuthManager();
export default auth;
