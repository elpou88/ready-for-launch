// API Configuration for Railway Backend
export const API_CONFIG = {
  // Change this to your Railway backend URL after deployment
  BASE_URL: import.meta.env.VITE_API_URL || window.location.origin,
  
  // Railway deployment URL (update after deployment)
  RAILWAY_URL: 'https://your-railway-app.railway.app',
  
  // Development URL (current Replit)
  DEV_URL: window.location.origin,
} as const;

// Use Railway URL in production, local in development
export const API_BASE_URL = import.meta.env.PROD 
  ? API_CONFIG.RAILWAY_URL 
  : API_CONFIG.DEV_URL;

export const API_ENDPOINTS = {
  VALIDATE_TOKEN: `${API_BASE_URL}/api/validate-token`,
  USER_SESSIONS: `${API_BASE_URL}/api/user-sessions`,
  MAINTENANCE_STATUS: `${API_BASE_URL}/api/maintenance-status`,
  PROFESSIONAL_VALIDATE: `${API_BASE_URL}/api/professional/validate-token`,
  PROFESSIONAL_SESSION: `${API_BASE_URL}/api/professional/create-session`,
} as const;