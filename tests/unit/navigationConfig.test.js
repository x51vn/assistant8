import { describe, it, expect } from 'vitest';
import { NAVIGATION_PAGES, getNavigationPages } from '../../src/ui-preact/config/navigationConfig.js';

describe('navigationConfig', () => {
  it('has unique page ids', () => {
    const ids = NAVIGATION_PAGES.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('sorts pages by order ascending', () => {
    const sorted = getNavigationPages();
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i - 1].order).toBeLessThan(sorted[i].order);
    }
  });

  it('contains exactly five primary tabs', () => {
    const primaryCount = NAVIGATION_PAGES.filter((p) => p.primary).length;
    expect(primaryCount).toBe(5);
  });
});

