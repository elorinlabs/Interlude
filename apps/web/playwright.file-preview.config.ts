import { defineConfig } from '@playwright/test';
import chatConfig from './playwright.chat.config';

export default defineConfig({
  ...chatConfig,
  testMatch: ['**/file-preview.pw.ts', '**/html-assets.pw.ts', '**/html-assets-deferred.pw.ts'],
  webServer: Array.isArray(chatConfig.webServer) ? chatConfig.webServer.slice(1) : chatConfig.webServer,
  outputDir: '../../.codex-tmp/web-file-preview-playwright',
  reporter: [['list']],
});
