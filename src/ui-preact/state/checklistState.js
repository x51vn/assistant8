/**
 * Checklist State — Preact Signals
 * Centralized reactive state for checklist templates
 *
 * Change: trading-journal-mvp
 */

import { signal } from '@preact/signals';

export const checklistTemplates = signal([]);
export const checklistLoading = signal(false);

export function setChecklistTemplates(items) {
  checklistTemplates.value = items;
}

export function setChecklistLoading(v) {
  checklistLoading.value = v;
}
