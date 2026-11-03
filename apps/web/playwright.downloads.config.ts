import { testBrowserChannel, testBrowserLaunchOptions } from '../../scripts/test-browser.mjs';
import { defineConfig } from '@playwright/test';

// Downloads use an in-page transfer fixture and do not need the chat relay server.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['downloads.pw.ts', 'download-actions.pw.ts', 'download-sharing.pw.ts', 'download-workspace.pw.ts'],
  workers: 2, timeout: 90_000,
  outputDir: '../../.codex-tmp/download-workspace-web',
  use: {
    launchOptions: testBrowserLaunchOptions(),
    baseURL: 'http://127.0.0.1:1422/web/', channel: testBrowserChannel(process.env.CHAT_TEST_BROWSER),
    locale: 'zh-CN', headless: true, screenshot: 'only-on-failure', actionTimeout: 15_000 },
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 960 } } },
  ],
  webServer: { command: 'npx vite --host 127.0.0.1 --port 1422 --strictPort',
    url: 'http://127.0.0.1:1422/web/', reuseExistingServer: !process.env.CI },
});
