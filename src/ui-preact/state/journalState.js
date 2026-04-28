/**
 * Journal State — Preact Signals
 * Centralized reactive state for Journal page
 *
 * Change: trading-journal-mvp
 */

import { signal } from '@preact/signals';

// ===== JOURNAL DATA SIGNALS =====
export const journalEntries = signal([]);
export const journalLoading = signal(false);
export const journalError = signal(null);
export const journalMetrics = signal(null);

// ===== MODAL STATE SIGNALS =====
export const isNewEntryModalOpen = signal(false);
export const isCloseEntryModalOpen = signal(false);
export const isReviewModalOpen = signal(false);
export const isChecklistSettingsOpen = signal(false);
export const selectedEntry = signal(null);

// ===== PREFILL DATA (from watchlist + market assessment) =====
export const prefillData = signal(null);

// ===== SETTERS =====

export function setJournalEntries(items) {
  journalEntries.value = items;
}

export function setJournalLoading(v) {
  journalLoading.value = v;
}

export function setJournalError(err) {
  journalError.value = err;
}

export function setJournalMetrics(m) {
  journalMetrics.value = m;
}

export function openNewEntryModal(prefill = null) {
  prefillData.value = prefill;
  isNewEntryModalOpen.value = true;
}

export function closeNewEntryModal() {
  isNewEntryModalOpen.value = false;
  prefillData.value = null;
}

export function openCloseEntryModal(entry) {
  selectedEntry.value = entry;
  isCloseEntryModalOpen.value = true;
}

export function closeCloseEntryModal() {
  isCloseEntryModalOpen.value = false;
  selectedEntry.value = null;
}

export function openReviewModal(entry) {
  selectedEntry.value = entry;
  isReviewModalOpen.value = true;
}

export function closeReviewModal() {
  isReviewModalOpen.value = false;
  selectedEntry.value = null;
}

export function addJournalEntry(item) {
  journalEntries.value = [item, ...journalEntries.value];
}

export function updateJournalEntryInState(updated) {
  journalEntries.value = journalEntries.value.map(e => e.id === updated.id ? updated : e);
}

export function removeJournalEntry(id) {
  journalEntries.value = journalEntries.value.filter(e => e.id !== id);
}
