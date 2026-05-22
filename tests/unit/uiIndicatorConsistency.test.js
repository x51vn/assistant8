import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharedProgressBar = normalizePath('src/ui-preact/components/ProgressBar.jsx');
const sharedProgressStyles = normalizePath('src/extension/styles-preact.css');

const runtimeSources = [
  ...collectFiles(path.join(repoRoot, 'src/ui-preact')),
  ...collectFiles(path.join(repoRoot, 'src/extension/styles-preact.css')),
];

const forbiddenIndicatorNames = [
  'toast-progress',
  'onboarding-progress',
  'research-progress',
  'progress-header',
  'mkt-regime-bar',
  'net-worth-bar',
  'bar-segment',
  'chart-bars',
  'chart-bar-container',
  'chart-bar',
  'usage-bar',
  'progress-bar',
  'progress-track',
  'progress-fill',
  'mkt-run-progress',
  'mkt-run-bar',
  'usage-bar-track',
  'usage-bar-fill',
  'strength-bar',
  'strength-fill',
];

const allowedLayoutBarClasses = [
  /^navbar(?:-.+)?$/,
  /^search-bar$/,
  /^pi-tab-bar$/,
  /^pi-filter-bar$/,
  /^journal-metrics-bar$/,
  /^sidebar(?:-.+)?$/,
  /^scrollbar(?:-.+)?$/,
  /^toolbar(?:-.+)?$/,
  /^action-bar$/,
  /^fa-chart-bar$/,
];

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function collectFiles(targetPath) {
  if (!existsSync(targetPath)) return [];

  const stats = statSync(targetPath);
  if (stats.isFile()) {
    return /\.(css|jsx?|tsx?)$/.test(targetPath) ? [targetPath] : [];
  }

  return readdirSync(targetPath)
    .flatMap((entry) => collectFiles(path.join(targetPath, entry)));
}

function readSources(files = runtimeSources) {
  return files.map((file) => ({
    absolutePath: file,
    relativePath: normalizePath(path.relative(repoRoot, file)),
    contents: readFileSync(file, 'utf8'),
  }));
}

function findMatches(patterns, sources, { skip = () => false } = {}) {
  const findings = [];

  for (const source of sources) {
    if (skip(source)) continue;

    for (const pattern of patterns) {
      const matches = source.contents.match(pattern.regex);
      if (matches) {
        findings.push(`${source.relativePath}: ${pattern.name} (${matches.length})`);
      }
    }
  }

  return findings;
}

function forbiddenNamePattern(name) {
  return new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(name)}(?=$|[^A-Za-z0-9_-]|-)`, 'g');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('UI indicator consistency', () => {
  test('keeps ProgressBar as the sole semantic progressbar implementation', () => {
    const findings = findMatches(
      [
        { name: 'role="progressbar"', regex: /role\s*=\s*["']progressbar["']/g },
        { name: '<progress>', regex: /<progress(?:\s|>|\/)/g },
        { name: 'aria-valuenow', regex: /\baria-valuenow\b/g },
      ],
      readSources(),
      {
        skip: ({ relativePath }) => relativePath === sharedProgressBar,
      }
    );

    expect(findings).toEqual([]);
  });

  test('does not define direct progress track/fill markup outside the shared component', () => {
    const findings = findMatches(
      [
        { name: 'progressbar__track', regex: /\bprogressbar__track\b/g },
        { name: 'progressbar__fill', regex: /\bprogressbar__fill\b/g },
        { name: 'progress-track', regex: /\bprogress-track\b/g },
        { name: 'progress-fill', regex: /\bprogress-fill\b/g },
        { name: 'progress-bar track/fill', regex: /\bprogress-bar-(?:track|fill)\b/g },
      ],
      readSources(),
      {
        skip: ({ relativePath }) =>
          relativePath === sharedProgressBar || relativePath === sharedProgressStyles,
      }
    );

    expect(findings).toEqual([]);
  });

  test('rejects ambiguous progressbar-like indicator class names', () => {
    const patterns = forbiddenIndicatorNames.map((name) => ({
      name,
      regex: forbiddenNamePattern(name),
    }));

    const findings = findMatches(patterns, readSources());

    expect(findings).toEqual([]);
  });

  test('documents allowed non-indicator layout bar names', () => {
    const legitimateLayoutClasses = [
      'navbar-tabs',
      'search-bar',
      'pi-tab-bar',
      'pi-filter-bar',
      'journal-metrics-bar',
      'sidebar-bg',
      'scrollbar-track',
      'fa-chart-bar',
    ];

    expect(
      legitimateLayoutClasses.filter((className) =>
        allowedLayoutBarClasses.some((pattern) => pattern.test(className))
      )
    ).toEqual(legitimateLayoutClasses);
  });
});
