import { describe, expect, test, afterEach } from 'vitest';
import { h } from 'preact';
import { cleanup, render } from '../../test-utils/preact-render.js';
import { ProgressBar } from '../../../src/ui-preact/components/ProgressBar.jsx';

describe('ProgressBar', () => {
  afterEach(() => {
    cleanup();
  });

  test('renders determinate progress with normalized percent, label, caption, and ARIA values', () => {
    const { container, getByRole, getByText } = render(
      h(ProgressBar, {
        label: 'Pipeline progress',
        value: 3,
        max: 6,
        caption: 'Bước 3/6',
        showValue: true,
      })
    );

    const progressbar = getByRole('progressbar', { name: 'Pipeline progress' });
    expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
    expect(progressbar.getAttribute('aria-valuemax')).toBe('6');
    expect(progressbar.getAttribute('aria-valuenow')).toBe('3');
    expect(progressbar.getAttribute('aria-valuetext')).toBe('50%');

    const fill = container.querySelector('.progressbar__fill');
    expect(fill.style.width).toBe('50%');
    expect(getByText('Bước 3/6')).toBeTruthy();
    expect(getByText('50%')).toBeTruthy();
  });

  test('clamps determinate progress to safe percentage values', () => {
    const { container } = render(
      h('div', null, [
        h(ProgressBar, { key: 'below', label: 'Below range', value: -2, max: 5 }),
        h(ProgressBar, { key: 'above', label: 'Above range', value: 8, max: 5 }),
        h(ProgressBar, { key: 'invalid', label: 'Invalid max', value: 2, max: 0 }),
      ])
    );

    const fills = Array.from(container.querySelectorAll('.progressbar__fill'));
    expect(fills.map((fill) => fill.style.width)).toEqual(['0%', '100%', '0%']);
  });

  test('renders indeterminate progress without current value', () => {
    const { getByRole } = render(
      h(ProgressBar, {
        label: 'Loading settings',
        indeterminate: true,
      })
    );

    const progressbar = getByRole('progressbar', { name: 'Loading settings' });
    expect(progressbar.hasAttribute('aria-valuenow')).toBe(false);
    expect(progressbar.classList.contains('progressbar--indeterminate')).toBe(true);
  });

  test('falls back to default tone and size for unsupported variants', () => {
    const { getByRole } = render(
      h(ProgressBar, {
        label: 'Unsupported variants',
        value: 1,
        max: 2,
        tone: 'neon',
        size: 'huge',
      })
    );

    const progressbar = getByRole('progressbar', { name: 'Unsupported variants' });
    expect(progressbar.classList.contains('progressbar--primary')).toBe(true);
    expect(progressbar.classList.contains('progressbar--md')).toBe(true);
  });
});
