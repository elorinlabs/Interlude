import { testBrowserLaunchOptions } from '../../scripts/test-browser.mjs';
import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './e2e',
  testMatch: ['**/composer-suggestion.pw.ts', '**/composer-scroll.pw.ts',
    '**/file-references.pw.ts', '**/long-paste.pw.ts'], workers: 1,
  timeout: 30_000, reporter: 'list', outputDir: '../../.codex-tmp/web-suggestion-playwright',
  use: {
    launchOptions: testBrowserLaunchOptions(),
    baseURL: 'http://127.0.0.1:1492/web/', locale: 'zh-CN',
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
  ],
  webServer: { command: 'npx vite --host 127.0.0.1 --port 1492 --strictPort',
    url: 'http://127.0.0.1:1492/web/', reuseExistingServer: false },
});
