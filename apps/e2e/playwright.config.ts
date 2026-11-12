import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

export default defineConfig({
  testDir: './tests',
  // Tests in different files share and mutate the same seed data (e.g. QA_DRIVER_TRANSFERS_ID's
  // open time entry, or "latest route for driver/date" queries) — file-local serial groups
  // don't serialize ACROSS files, so fullyParallel/multiple workers would let one test change
  // the seed data out from under another test. One worker = the whole suite is genuinely
  // sequential.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'html',

  use: {
    // Local dev server (npm run dev:web) — start IT BEFORE running the tests. The user
    // starts this manually in their own terminal; here we just point at it.
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
