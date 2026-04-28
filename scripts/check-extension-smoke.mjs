#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');

function fail(message) {
  console.error(`Extension smoke check failed: ${message}`);
  process.exit(1);
}

function assertFile(relativePath, label = relativePath) {
  const fullPath = path.join(distDir, relativePath);
  if (!existsSync(fullPath)) {
    fail(`${label} missing at dist/${relativePath}`);
  }
}

function assertDirectoryHasFiles(relativePath, label = relativePath) {
  const fullPath = path.join(distDir, relativePath);
  if (!existsSync(fullPath)) {
    fail(`${label} directory missing at dist/${relativePath}`);
  }
  const entries = readdirSync(fullPath);
  if (entries.length === 0) {
    fail(`${label} directory is empty at dist/${relativePath}`);
  }
}

assertFile('manifest.json', 'manifest');

const manifest = JSON.parse(readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) {
  fail(`expected manifest_version 3, received ${manifest.manifest_version}`);
}

if (manifest.side_panel?.default_path) {
  assertFile(manifest.side_panel.default_path, 'side panel entrypoint');
} else {
  fail('manifest side_panel.default_path is missing');
}

if (manifest.background?.service_worker) {
  assertFile(manifest.background.service_worker, 'background service worker');
} else {
  fail('manifest background.service_worker is missing');
}

for (const scriptGroup of manifest.content_scripts || []) {
  for (const script of scriptGroup.js || []) {
    assertFile(script, `content script ${script}`);
  }
}

for (const icon of Object.values(manifest.icons || {})) {
  assertFile(icon, `icon ${icon}`);
}

for (const resourceGroup of manifest.web_accessible_resources || []) {
  for (const resource of resourceGroup.resources || []) {
    if (resource.endsWith('/*.md')) {
      assertDirectoryHasFiles(resource.slice(0, -'/*.md'.length), `resource glob ${resource}`);
    } else {
      assertFile(resource, `web accessible resource ${resource}`);
    }
  }
}

const sidePanelPath = manifest.side_panel.default_path;
const sidePanelHtml = readFileSync(path.join(distDir, sidePanelPath), 'utf8');
if (!sidePanelHtml.includes('id="app"')) {
  fail(`${sidePanelPath} does not contain #app mount point`);
}

const localRefs = [
  ...sidePanelHtml.matchAll(/<(?:script|link)\b[^>]+(?:src|href)=["']([^"']+)["']/g),
]
  .map((match) => match[1])
  .filter((ref) => !/^(https?:)?\/\//.test(ref))
  .map((ref) => ref.replace(/^\.\//, '').split('#')[0].split('?')[0])
  .filter(Boolean);

for (const ref of localRefs) {
  assertFile(ref, `${sidePanelPath} referenced asset ${ref}`);
}

console.log('Extension smoke check passed: dist manifest and side panel artifacts are aligned.');
