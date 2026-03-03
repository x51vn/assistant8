/**
 * Market Assessment State — Preact Signals
 * Manages state for the Market Assessment page.
 */

import { signal, computed } from '@preact/signals';

// ─── Data signals ───
export const assessmentRuns = signal([]);      // Array of run summaries
export const assessmentRecords = signal([]);   // All records (flat)
export const currentRunRecords = signal([]);   // Records for selected run
export const sectors = signal([]);             // User's sector catalog

// ─── UI signals ───
export const loading = signal(false);
export const running = signal(false);
export const runStatus = signal(null);         // { runId, status, step, totalSteps, message }
export const error = signal(null);
export const selectedRunId = signal(null);
export const filterSymbol = signal('');
export const filterSector = signal('');

// ─── Computed ───
export const classificationMode = computed(() => {
  const activeSectors = sectors.value.filter(s => s.is_active);
  return activeSectors.length > 0 ? 'CONSTRAINED' : 'AUTO';
});

export const latestRun = computed(() => {
  if (assessmentRuns.value.length === 0) return null;
  return assessmentRuns.value[0]; // sorted desc by date
});

export const latestRecords = computed(() => {
  const latest = latestRun.value;
  if (!latest) return [];
  return latest.records || [];
});

export const regimeHistory = computed(() => {
  // Build regime time-series: one point per run date
  const seen = new Map();
  for (const run of assessmentRuns.value) {
    if (!seen.has(run.as_of_date)) {
      seen.set(run.as_of_date, {
        date: run.as_of_date,
        score: run.market_regime_score,
        state: run.market_regime_state
      });
    }
  }
  return Array.from(seen.values()).reverse(); // chronological order
});

// ─── Available sectors & symbols from history ───
export const availableSectors = computed(() => {
  const set = new Set();
  for (const item of assessmentRecords.value) {
    if (item.sector_name) set.add(item.sector_name);
  }
  return [...set].sort();
});

export const availableSymbols = computed(() => {
  const set = new Set();
  for (const item of assessmentRecords.value) {
    if (item.symbol) set.add(item.symbol);
  }
  return [...set].sort();
});

// ─── Mutation helpers ───
export function setAssessmentRuns(runs) {
  assessmentRuns.value = runs;
}

export function setAssessmentRecords(records) {
  assessmentRecords.value = records;
}

export function setCurrentRunRecords(records) {
  currentRunRecords.value = records;
}

export function setSectors(items) {
  sectors.value = items;
}

export function setRunning(val) {
  running.value = val;
}

export function setRunStatus(status) {
  runStatus.value = status;
}

export function setError(val) {
  error.value = val;
}

export function setSelectedRunId(id) {
  selectedRunId.value = id;
}

export function resetMarketState() {
  assessmentRuns.value = [];
  assessmentRecords.value = [];
  currentRunRecords.value = [];
  sectors.value = [];
  loading.value = false;
  running.value = false;
  runStatus.value = null;
  error.value = null;
  selectedRunId.value = null;
  filterSymbol.value = '';
  filterSector.value = '';
}
