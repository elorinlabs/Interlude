import { defineConfig } from '@playwright/test';
import { testBrowserChannel, testBrowserLaunchOptions } from '../../scripts/test-browser.mjs';

const webPort = process.env.DICTATION_WEB_PORT ?? '1432';
const desktopPort = process.env.DICTATION_DESKTOP_PORT ?? '1489';
const webUrl = `http://127.0.0.1:${webPort}/web/`;
const desktopUrl = `http://127.0.0.1:${desktopPort}`;

export default defineConfig({
  testDir: './e2e', testMatch: '**/dictation.pw.ts', workers: 2, timeout: 45_000,
  outputDir: '../../.codex-tmp/dictation-playwright', reporter: 'list',
  use: { channel: testBrowserChannel(process.env.CHAT_TEST_BROWSER), headless: true, locale: 'zh-CN',
    permissions: ['microphone'], screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: testBrowserLaunchOptions({
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    }) },
  projects: [
    { name: 'web-desktop', use: { baseURL: webUrl, viewport: { width: 1280, height: 900 } } },
    { name: 'web-mobile', use: { baseURL: webUrl, viewport: { width: 390, height: 844 }, isMobile: true } },
    { name: 'desktop-remote', use: { baseURL: desktopUrl, viewport: { width: 1280, height: 900 } } },
  ],
  webServer: [
    { command: `npx vite --host 127.0.0.1 --port ${webPort} --strictPort`, url: webUrl },
    { command: `npx vite --host 127.0.0.1 --port ${desktopPort} --strictPort`, cwd: '../desktop', url: desktopUrl },
  ],
});
