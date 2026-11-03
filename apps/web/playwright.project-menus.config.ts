import { defineConfig } from '@playwright/test';
import chatConfig from './playwright.chat.config';

// Menu fixtures mock their connection and do not need the compatibility backend.
export default defineConfig({
  ...chatConfig,
  testMatch: '**/project-menus.pw.ts',
  webServer: Array.isArray(chatConfig.webServer) ? chatConfig.webServer.slice(1) : chatConfig.webServer,
  outputDir: '../../.codex-tmp/project-menus-playwright',
  reporter: [['list']],
});
