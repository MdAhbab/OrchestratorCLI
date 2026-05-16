/**
 * Frontend configuration
 * Uses environment variables with fallbacks
 */

export const config = {
  // API Configuration
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  
  // Application Info
  appName: import.meta.env.VITE_APP_NAME || 'AI CLI Orchestrator',
  appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0',
  
  // API Endpoints
  endpoints: {
    health: '/api/health',
    version: '/api/version',
    status: '/api/status',
    download: (platform: string) => `/api/download/${platform}`,
  },
  
  // Build full API URL
  getApiUrl: (endpoint: string): string => {
    const baseUrl = config.apiBaseUrl;
    return `${baseUrl}${endpoint}`;
  },
  
  // Get download URL
  getDownloadUrl: (path: string): string => {
    const baseUrl = config.apiBaseUrl;
    return `${baseUrl}${path}`;
  },
} as const;

export default config;

// Made with Bob
