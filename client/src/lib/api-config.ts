export const API_CONFIG = {
  // Railway backend URL (update after deployment)
  BACKEND_URL: import.meta.env.VITE_BACKEND_URL || (
    import.meta.env.MODE === 'production' 
      ? 'https://your-railway-backend.railway.app'
      : 'http://localhost:5000'
  ),
  
  // WebSocket URL
  WS_URL: import.meta.env.VITE_WS_URL || (
    import.meta.env.MODE === 'production'
      ? 'wss://your-railway-backend.railway.app/ws'
      : 'ws://localhost:5000/ws'
  ),
    
  // API endpoints
  ENDPOINTS: {
    HEALTH: '/api/health',
    SESSIONS: '/api/sessions',
    FUND_MANAGER: '/api/fund-manager',
    MAINTENANCE: '/api/maintenance-status'
  }
};

// Get the base URL for API requests
export const getApiUrl = (endpoint: string) => {
  return `${API_CONFIG.BACKEND_URL}${endpoint}`;
};