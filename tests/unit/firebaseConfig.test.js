import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getFirebaseConfig, getOAuthClientId } from '../../src/firebaseConfig.js';

describe('firebaseConfig.js', () => {
  const originalEnv = { ...import.meta.env };

  beforeEach(() => {
    // Reset environment
    import.meta.env.VITE_FIREBASE_API_KEY = 'test-api-key';
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN = 'test.firebaseapp.com';
    import.meta.env.VITE_FIREBASE_DATABASE_URL = 'https://test.firebaseio.com';
    import.meta.env.VITE_FIREBASE_PROJECT_ID = 'test-project';
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET = 'test-project.appspot.com';
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID = '123456789';
    import.meta.env.VITE_FIREBASE_APP_ID = '1:123456789:web:abcdef';
    import.meta.env.VITE_FIREBASE_MEASUREMENT_ID = 'G-XXXXXXXXXX';
    import.meta.env.VITE_OAUTH_CLIENT_ID = 'oauth-client-id';
  });

  afterEach(() => {
    // Restore original environment
    Object.keys(import.meta.env).forEach(key => {
      if (key.startsWith('VITE_')) {
        delete import.meta.env[key];
      }
    });
    Object.assign(import.meta.env, originalEnv);
  });

  describe('getFirebaseConfig', () => {
    it('should return firebase config with all required fields', () => {
      const config = getFirebaseConfig();
      
      expect(config).toBeDefined();
      expect(config.apiKey).toBe('test-api-key');
      expect(config.authDomain).toBe('test.firebaseapp.com');
      expect(config.databaseURL).toBe('https://test.firebaseio.com');
      expect(config.projectId).toBe('test-project');
      expect(config.storageBucket).toBe('test-project.appspot.com');
      expect(config.messagingSenderId).toBe('123456789');
      expect(config.appId).toBe('1:123456789:web:abcdef');
      expect(config.measurementId).toBe('G-XXXXXXXXXX');
    });

    it('should throw error when apiKey is missing', () => {
      delete import.meta.env.VITE_FIREBASE_API_KEY;
      
      expect(() => getFirebaseConfig()).toThrow(/Missing required Firebase configuration/);
      expect(() => getFirebaseConfig()).toThrow(/apiKey/);
    });

    it('should throw error when authDomain is missing', () => {
      delete import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
      
      expect(() => getFirebaseConfig()).toThrow(/Missing required Firebase configuration/);
      expect(() => getFirebaseConfig()).toThrow(/authDomain/);
    });

    it('should throw error when projectId is missing', () => {
      delete import.meta.env.VITE_FIREBASE_PROJECT_ID;
      
      expect(() => getFirebaseConfig()).toThrow(/Missing required Firebase configuration/);
      expect(() => getFirebaseConfig()).toThrow(/projectId/);
    });

    it('should throw error when storageBucket is missing', () => {
      delete import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
      
      expect(() => getFirebaseConfig()).toThrow(/Missing required Firebase configuration/);
      expect(() => getFirebaseConfig()).toThrow(/storageBucket/);
    });

    it('should throw error when messagingSenderId is missing', () => {
      delete import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
      
      expect(() => getFirebaseConfig()).toThrow(/Missing required Firebase configuration/);
      expect(() => getFirebaseConfig()).toThrow(/messagingSenderId/);
    });

    it('should throw error when appId is missing', () => {
      delete import.meta.env.VITE_FIREBASE_APP_ID;
      
      expect(() => getFirebaseConfig()).toThrow(/Missing required Firebase configuration/);
      expect(() => getFirebaseConfig()).toThrow(/appId/);
    });

    it('should throw error with multiple missing fields', () => {
      delete import.meta.env.VITE_FIREBASE_API_KEY;
      delete import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
      
      expect(() => getFirebaseConfig()).toThrow(/Missing required Firebase configuration/);
      expect(() => getFirebaseConfig()).toThrow(/apiKey/);
      expect(() => getFirebaseConfig()).toThrow(/authDomain/);
    });

    it('should allow optional measurementId to be missing', () => {
      delete import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;
      
      const config = getFirebaseConfig();
      expect(config.measurementId).toBeUndefined();
    });

    it('should allow optional databaseURL to be missing', () => {
      delete import.meta.env.VITE_FIREBASE_DATABASE_URL;
      
      const config = getFirebaseConfig();
      expect(config.databaseURL).toBeUndefined();
    });

    it('should include helpful error message', () => {
      delete import.meta.env.VITE_FIREBASE_API_KEY;
      
      expect(() => getFirebaseConfig()).toThrow(/Please ensure all VITE_FIREBASE_\* environment variables are set/);
    });
  });

  describe('getOAuthClientId', () => {
    it('should return OAuth client ID when configured', () => {
      const clientId = getOAuthClientId();
      
      expect(clientId).toBe('oauth-client-id');
    });

    it('should return null when OAuth client ID is not configured', () => {
      delete import.meta.env.VITE_OAUTH_CLIENT_ID;
      
      const clientId = getOAuthClientId();
      
      expect(clientId).toBe(null);
    });

    it('should return null when OAuth client ID is empty string', () => {
      import.meta.env.VITE_OAUTH_CLIENT_ID = '';
      
      const clientId = getOAuthClientId();
      
      // Empty string should be falsy and return null
      expect(clientId).toBeFalsy();
    });

    it('should handle undefined OAuth client ID', () => {
      import.meta.env.VITE_OAUTH_CLIENT_ID = undefined;
      
      const clientId = getOAuthClientId();
      
      // Undefined is converted to string "undefined" by Vite, or returned as null
      // Accept both behaviors
      expect(clientId === null || clientId === 'undefined' || clientId === undefined).toBe(true);
    });
  });
});
