import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:4330", viewport: { width: 1280, height: 900 } },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4330",
    url: "http://127.0.0.1:4330/",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
