import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { chromium } from 'playwright';

import { startVoiceGuardServer } from '../src/server.mjs';

const runningServer = process.env.VOICEGUARD_URL ? null : await startVoiceGuardServer({ port: 0 });
const baseUrl = process.env.VOICEGUARD_URL ?? runningServer.url;
const outputPath = resolve(process.env.VOICEGUARD_DEMO_OUTPUT ?? 'demo/voiceguard-demo.webm');
const browserCandidates = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  chromium.executablePath(),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);
const executablePath = browserCandidates.find(existsSync);

if (!executablePath) {
  throw new Error('No Chromium-compatible browser found. Run `npx playwright install chromium`.');
}

await mkdir(dirname(outputPath), { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--window-size=1440,900', '--hide-scrollbars', '--force-device-scale-factor=1']
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
  recordVideo: {
    dir: dirname(outputPath),
    size: { width: 1440, height: 900 }
  }
});
const page = await context.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
const video = page.video();

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  await page.getByRole('button', { name: 'Evaluate through MCP' }).click();
  await page.getByRole('heading', { name: 'POLICY CHECKS PASSED' }).waitFor();
  await page.waitForTimeout(3000);

  await page.getByLabel('Transcript').fill('Book a ride to the airport.');
  await page.getByLabel('Proposed tool').selectOption('request_ride');
  await page.getByLabel('Amount (USD)').fill('75');
  await page.getByRole('button', { name: 'Evaluate through MCP' }).click();
  await page.getByRole('heading', { name: 'EXPLICIT USER CONFIRMATION REQUIRED' }).waitFor();
  await page.waitForTimeout(3000);

  await page.getByRole('button', { name: 'Confirm action' }).click();
  await page.getByRole('heading', { name: 'USER CONFIRMED ACTION' }).waitFor();
  await page.waitForTimeout(3000);

  await page.getByRole('button', { name: 'Load risky example' }).click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Evaluate through MCP' }).click();
  await page.getByRole('heading', { name: 'TRANSCRIPT INJECTION PATTERN' }).waitFor();
  await page.waitForTimeout(3000);

  await page.getByRole('heading', { name: 'Audit and protocol evidence' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(3500);
} finally {
  await page.close();
  await video.saveAs(outputPath);
  await context.close();
  await browser.close();
  await runningServer?.close();
}

console.log(`Saved demo recording to ${outputPath}`);
