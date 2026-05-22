import { h, render } from 'preact';
import { AuthProvider } from '../context/AuthContext.jsx';
import { App } from '../App.jsx';
import '../styles/themes.css'; // XST-771: CSS custom properties for light/dark themes

/**
 * X51LABS-149: Preact Settings App Entry Point
 * Mounts App component with:
 * - AuthProvider wrapper for context access
 * - App gate that shows login if not authenticated, settings if authenticated
 * 
 * X51LABS-170: Added auth gate
 * FIX: Added theme synchronization
 */

/**
 * Theme Synchronization - Listen to system theme changes
 * Applies 'dark' or 'light' class to body for CSS selectors
 */
function applyTheme() {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.classList.toggle('dark', isDark);
  document.body.classList.toggle('light', !isDark);
  console.log(`[Theme] Applied theme: ${isDark ? 'dark' : 'light'}`);
}

// Apply theme on load
applyTheme();

// Listen for theme changes in runtime
const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
darkModeMediaQuery.addEventListener('change', (e) => {
  console.log('[Theme] System theme changed to:', e.matches ? 'dark' : 'light');
  applyTheme();
});

const root = document.getElementById('app');

if (root) {
  render(
    <AuthProvider>
      <App />
    </AuthProvider>,
    root
  );
  console.log('[Preact Settings] Mounted successfully with AuthProvider + App gate');
} else {
  console.error('[Preact Settings] Mount point #app not found in DOM');
}
