import { chromium } from '@playwright/test';
import path from 'path';

export async function launchExtensionContext(currentDir, userDataDirName, extraArgs = []) {
  const extensionPath = path.join(currentDir, '../../dist');
  const userDataDir = path.join(currentDir, `../../${userDataDirName}`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      ...extraArgs
    ]
  });

  const serviceWorker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const extensionId = new URL(serviceWorker.url()).host;

  return { context, extensionId, extensionPath };
}