/**
 * @fileoverview Firebase Configuration Loader
 * 
 * SECURITY: Loads Firebase configuration from environment variables
 * instead of hardcoding in source code.
 * 
 * Usage:
 *   import { getFirebaseConfig } from './firebaseConfig.js';
 *   const config = getFirebaseConfig();
 */

/**
 * Get Firebase configuration from environment variables
 * @returns {Object} Firebase configuration object
 * @throws {Error} If required environment variables are missing
 */
export function getFirebaseConfig() {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
  };

  // Validate required fields
  const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const missingFields = requiredFields.filter(field => !config[field]);
  
  if (missingFields.length > 0) {
    throw new Error(
      `Missing required Firebase configuration: ${missingFields.join(', ')}. ` +
      `Please ensure all VITE_FIREBASE_* environment variables are set in .env file.`
    );
  }

  return config;
}

/**
 * Get OAuth2 client ID from environment
 * @returns {string|null} OAuth2 client ID or null if not configured
 */
export function getOAuthClientId() {
  return import.meta.env.VITE_OAUTH_CLIENT_ID || null;
}
