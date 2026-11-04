import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

export default defineConfig({
  testDir: './tests',
  // Testovi u različitim fajlovima deljeno mutiraju isti seed (npr. QA_DRIVER_TRANSFERS_ID
  // otvoreni time entry, ili "najnovija ruta za vozača/datum" upiti) — file-local serial
  // grupe ne serijalizuju IZMEĐU fajlova, pa fullyParallel/multi-worker dozvoljava da jedan
  // test promeni seed ispod drugog test. Jedan worker = cela suita stvarno sekvencijalna.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'html',

  use: {
    // Lokalni dev server (npm run dev:web) — pokreni GA PRE testova. Korisnik pokreće
    // ovo ručno u svom terminalu; ovde samo ciljamo na njega.
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
