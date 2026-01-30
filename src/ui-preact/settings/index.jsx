import { h, render } from 'preact';
import { SettingsPage } from './SettingsPage.jsx';

/**
 * X51LABS-149: Preact Settings App Entry Point
 * Mounts SettingsPage component to DOM element #app
 */
const root = document.getElementById('app');

if (root) {
  render(<SettingsPage />, root);
  console.log('[Preact Settings] Mounted successfully');
} else {
  console.error('[Preact Settings] Mount point #app not found in DOM');
}
