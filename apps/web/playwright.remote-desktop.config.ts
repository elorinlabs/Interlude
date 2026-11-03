import { defineConfig, devices } from '@playwright/test';
import { testBrowserLaunchOptions } from '../../scripts/test-browser.mjs';

// Only the isolated coturn test uses a generated, temporary certificate.
const launchOptions = { args: process.env.DESKTOP_RELAY_TEST_INSECURE_TLS === '1'
  ? ['--ignore-certificate-errors'] : [] };
const chromiumLaunchOptions = testBrowserLaunchOptions(launchOptions);

export default defineConfig({
  testDir: './e2e', testMatch: '**/remote-desktop*.pw.ts', workers: 1, timeout: 60_000,
  outputDir: '../../.codex-tmp/remote-desktop-web', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:1438/web/', locale: 'zh-CN', headless: true,
    launchOptions,
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'portrait', use: { launchOptions: chromiumLaunchOptions,
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'landscape', use: { launchOptions: chromiumLaunchOptions,
      viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { launchOptions: chromiumLaunchOptions, viewport: { width: 1440, height: 900 } } },
    { name: 'webkit-iphone', testMatch: '**/remote-desktop-compatibility.pw.ts',
      use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    { name: 'webkit-iphone-landscape', testMatch: '**/remote-desktop-compatibility.pw.ts',
      use: { ...devices['iPhone 13 landscape'], browserName: 'webkit' } },
    { name: 'webkit-ipad', testMatch: '**/remote-desktop-compatibility.pw.ts',
      use: { ...devices['iPad (gen 7)'], browserName: 'webkit' } },
  ],
  webServer: { command: 'npx vite --host 127.0.0.1 --port 1438 --strictPort',
    url: 'http://127.0.0.1:1438/web/', reuseExistingServer: true },
});
