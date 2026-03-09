/**
 * Planning Box - API Client
 * Handles all HTTP requests with proper auth and CSRF handling
 */

const API_BASE = ''; // Same origin

class ApiClient {
  constructor() {
    this.csrfToken = null;
  }

  /**
   * Get CSRF token by establishing a session first
   * Must be called after user login to get session-bound token
   */
  async fetchCsrfToken() {
    try {
      // First, establish a session by hitting an endpoint that creates one
      // This ensures we have a session cookie
      const response = await fetch('/auth/me', { 
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      });
      
      // The session cookie should now be set
      // Now get the CSRF token from the header
      const token = response.headers.get('X-CSRF-Token');
      if (token) {
        this.csrfToken = token;
        return token;
      }
      
      // If no token in header, try to make another request that requires auth
      // which should also return a new token
      if (response.status === 401) {
        // Not logged in - try to get a token anyway via a public endpoint
        // that initializes a session
        const initResponse = await fetch('/uploads', { 
          credentials: 'same-origin',
          headers: { 'Accept': 'application/json' }
        });
        this.csrfToken = initResponse.headers.get('X-CSRF-Token');
      }
    } catch (e) {
      console.error('Failed to fetch CSRF token:', e);
    }
    
    return this.csrfToken;
  }

  /**
   * Make an authenticated request
   */
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Add CSRF token to state-changing requests
    if (['POST', 'PUT', 'DELETE'].includes(options.method)) {
      if (!this.csrfToken) {
        await this.fetchCsrfToken();
      }
      if (this.csrfToken) {
        headers['X-CSRF-Token'] = this.csrfToken;
      }
    }

    // Add credentials for cookie-based auth
    const fetchOptions = {
      ...options,
      headers,
      credentials: 'same-origin'
    };

    try {
      const response = await fetch(url, fetchOptions);
      
      // Update CSRF token from response if available
      const newCsrfToken = response.headers.get('X-CSRF-Token');
      if (newCsrfToken) {
        this.csrfToken = newCsrfToken;
      }

      // Handle auth errors
      if (response.status === 401) {
        // Clear session and redirect to login
        localStorage.removeItem('session');
        window.location.hash = '#/login';
        throw new Error('Session expired. Please login again.');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        throw new Error('Network error. Please check your connection.');
      }
      throw error;
    }
  }

  // Auth endpoints
  async register(username, password) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }

  async login(username, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }

  async logout() {
    return this.request('/auth/logout', {
      method: 'POST'
    });
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  // Uploads endpoints
  async getUploads(status = null) {
    const query = status ? `?status=${status}` : '';
    return this.request(`/uploads${query}`);
  }

  async getUpload(id) {
    return this.request(`/uploads/${id}`);
  }

  async createUpload(data) {
    return this.request('/uploads', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateUpload(id, data) {
    return this.request(`/uploads/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteUpload(id) {
    return this.request(`/uploads/${id}`, {
      method: 'DELETE'
    });
  }

  // Comments endpoints
  async getComments(uploadId) {
    return this.request(`/uploads/${uploadId}/comments`);
  }

  async addComment(uploadId, content, parentId = null) {
    return this.request(`/uploads/${uploadId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content, parent_id: parentId })
    });
  }

  async deleteComment(commentId) {
    return this.request(`/comments/${commentId}`, {
      method: 'DELETE'
    });
  }

  // Plans endpoints
  async getPlans() {
    return this.request('/plans');
  }

  async getPlan(id) {
    return this.request(`/plans/${id}`);
  }
}

// Export singleton instance
const api = new ApiClient();
export default api;
