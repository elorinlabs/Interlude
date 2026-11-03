import { testBrowserLaunchOptions } from '../../scripts/test-browser.mjs';
import { defineConfig } from '@playwright/test';

export default defineConfig({ testDir: './e2e', testMatch: '**/token-summary.pw.ts', workers: 1,
  timeout: 30000, reporter: 'list', outputDir: '../../.codex-tmp/token-summary-cache/web',
  use: {
    launchOptions: testBrowserLaunchOptions(),
    baseURL: 'http://127.0.0.1:1522/web/', locale: 'zh-CN',
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: { command: 'npx vite --host 127.0.0.1 --port 1522 --strictPort',
    url: 'http://127.0.0.1:1522/web/', reuseExistingServer: false, timeout: 120000 },
});
