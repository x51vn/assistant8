#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const forbiddenRules = [
  {
    name: 'extension package/signing artifacts',
    matches: (path) => /\.(crx|pem)$/i.test(path),
  },
  {
    name: 'built extension output',
    matches: (path) => path === 'dist' || path.startsWith('dist/'),
  },
  {
    name: 'test result output',
    matches: (path) => path === 'test-results' || path.startsWith('test-results/'),
  },
  {
    name: 'Playwright HTML reports',
    matches: (path) => path === 'tests/e2e/reports' || path.startsWith('tests/e2e/reports/'),
  },
  {
    name: 'persistent browser profiles',
    matches: (path) => /^test-user-data-[^/]+(\/|$)/.test(path),
  },
  {
    name: 'local environment secrets',
    matches: (path) => ['.env', '.env.local', '.env.production'].includes(path),
  },
];

function getTrackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

const violations = [];
for (const path of getTrackedFiles()) {
  for (const rule of forbiddenRules) {
    if (rule.matches(path)) {
      violations.push({ path, category: rule.name });
      break;
    }
  }
}

if (violations.length > 0) {
  console.error(`Repository hygiene check failed: ${violations.length} forbidden tracked file(s).`);
  const byCategory = new Map();
  for (const violation of violations) {
    if (!byCategory.has(violation.category)) {
      byCategory.set(violation.category, []);
    }
    byCategory.get(violation.category).push(violation.path);
  }

  for (const [category, paths] of byCategory.entries()) {
    console.error(`\n${category}:`);
    for (const path of paths.slice(0, 25)) {
      console.error(`  - ${path}`);
    }
    if (paths.length > 25) {
      console.error(`  ... ${paths.length - 25} more`);
    }
  }
  process.exit(1);
}

console.log('Repository hygiene check passed: no forbidden tracked files.');
