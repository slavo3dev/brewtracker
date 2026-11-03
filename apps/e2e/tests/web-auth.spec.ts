import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { createTestUser, createUserWithoutProfile, deleteTestUser } from '../helpers/userSeed';
import { generateRecoveryActionLink } from '../helpers/authSeed';

const BASE_URL = 'http://localhost:3000';

test('WEB-AUTH-01: Admin (manager/CEO) successfully logs in', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);
  await login.expectLoggedInOnDashboard();
});

test('WEB-AUTH-05: Driver/tech account cannot access the web dashboard', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_DRIVER_EMAIL!, process.env.QA_DRIVER_PASSWORD!);

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText('This dashboard is only for managers and CEOs.')).toBeVisible();
});

test('WEB-AUTH-13: Logged-out user on any /dashboard/* route is redirected to /login', async ({ page }) => {
  await page.goto('/dashboard/users');
  await expect(page).toHaveURL(/\/login/);
});

test('WEB-AUTH-03: Login is blocked with wrong credentials', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, 'wrongpassword123');

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("That email or password isn't right. Try again.")).toBeVisible();
});

test('WEB-AUTH-15: Inactive admin account is blocked from the dashboard', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_INACTIVE_MANAGER_EMAIL!, process.env.QA_INACTIVE_MANAGER_PASSWORD!);

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText('This dashboard is only for managers and CEOs.')).toBeVisible();
});

test('WEB-AUTH-02: Login is blocked with empty fields', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await page.getByRole('button', { name: 'Sign in' }).click();

  // "email"/"password" imaju HTML required atribut — browser blokira submit pre nego
  // što ikada stigne do servera (ista "Select a warehouse."-tipa provera kao na drugim formama).
  await expect(page.locator('#email')).toHaveJSProperty('validity.valid', false);
  await expect(page).toHaveURL(/\/login/);
});

test('WEB-AUTH-04: Login is blocked for an account with no users profile', async ({ page }) => {
  const email = `qa-auth-04-${Date.now()}@brewtracker.com`;
  const password = 'TestPass123!';
  const userId = await createUserWithoutProfile({ email, password });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(email, password);

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Your user profile is missing. Contact your manager.')).toBeVisible();
  } finally {
    await deleteTestUser(userId);
  }
});

test('WEB-AUTH-08: Forgot password is blocked with an empty email', async ({ page }) => {
  await page.goto('/forgot-password');
  const emailField = page.locator('input[type="email"]');
  await page.getByRole('button', { name: 'Send reset link' }).click();

  // "email" ima HTML required atribut — ista client-side blokada kao na login formi.
  await expect(emailField).toHaveJSProperty('validity.valid', false);
});

test('WEB-AUTH-14: Active manager can access /dashboard/users', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/users');
  await expect(page).toHaveURL(/\/dashboard\/users/);
  await expect(page.getByRole('heading', { name: 'User management' })).toBeVisible();
});

test('WEB-AIQ-02: /ai-quality is accessible without authentication', async ({ page }) => {
  await page.goto('/ai-quality');
  await expect(page).not.toHaveURL(/\/login/);
});

test('WEB-AIQ-01: /ai-quality shows static cards with no functional queue', async ({ page }) => {
  await page.goto('/ai-quality');

  for (const title of ['Photo Review Queue', 'AI Cleanliness Scoring', 'Object Detection', 'Quality Analytics']) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }
});

test('WEB-AUTH-16: /api/users endpoints reject non-user-manager accounts', async ({ page }) => {
  // Driver: pokušaj logina ga odjavljuje (ne može na web dashboard uopšte), pa je ovo i test
  // da poziv bez validne admin sesije ne vraća korisničke podatke.
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_DRIVER_EMAIL!, process.env.QA_DRIVER_PASSWORD!);

  const deniedResponse = await page.request.get('/api/users');
  expect(deniedResponse.headers()['content-type']).not.toContain('application/json');
  expect(deniedResponse.url()).toContain('/login');

  // Kontrola: manager ISTIM pozivom dobija prave JSON podatke.
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const allowedResponse = await page.request.get('/api/users');
  expect(allowedResponse.headers()['content-type']).toContain('application/json');
  const body = await allowedResponse.json();
  expect(Array.isArray(body.users)).toBe(true);
});

test('WEB-NA-01: /api/warehouses endpoint does not exist (UI uses server actions)', async ({ page }) => {
  const getResponse = await page.request.get('/api/warehouses');
  expect(getResponse.status()).toBe(404);
});

test('WEB-NA-02: No admin UI exists to configure the Google review URL (documented gap)', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  // Jedina "settings"-tipa administrativna stranica u čitavom dashboard-u je Clock Rules
  // (/dashboard/time-clock/settings) — nigde u kodu (grep po celom apps/web/src) ne postoji
  // UI komponenta koja referenciše app_settings.google_review_url, samo read-only
  // getGoogleReviewUrl() na javnoj survey stranici. Vrednost se trenutno menja isključivo
  // direktno u Supabase-u.
  await page.goto('/dashboard/time-clock/settings');
  await expect(page.getByText(/google review/i)).toHaveCount(0);
});

test('WEB-AUTH-07: Forgot password sends a reset email for a valid address', async ({ page }) => {
  // Napomena: resetPasswordForEmail() stvarno šalje email, pa podleže istom Supabase
  // rate-limitu na ovom deljenom QA projektu kao WEB-USR-01 — povremeno može pasti sa
  // "Unable to send reset email." čak i kad je kod ispravan (regresioni plan ovo vodi
  // kao Pass, za razliku od WEB-USR-01 koji je dokumentovan kao stvaran defekt).
  test.info().annotations.push({
    type: 'note',
    description:
      'Not an app defect: this test depends on the shared Supabase email quota on the QA project — if it fails, check whether the quota is currently exhausted before investigating the code (same root cause as WEB-USR-01/USR-10).',
  });

  await page.goto('/forgot-password');
  await page.locator('input[type="email"]').fill(process.env.QA_MANAGER_EMAIL!);
  await page.getByRole('button', { name: 'Send reset link' }).click();

  await expect(page.getByText('Check your email for a password reset link.')).toBeVisible({ timeout: 10000 });
});

test('WEB-AUTH-10: New password shorter than 8 characters is rejected', async ({ page }) => {
  // Validacija dužine se dešava u server akciji PRE bilo kakvog Supabase auth poziva — forma
  // je dostupna i bez aktivne recovery sesije, pa ne treba pravi reset link za ovaj slučaj.
  await page.goto('/reset-password/update');
  await page.locator('input[name="password"]').fill('short1');
  await page.locator('input[name="confirmPassword"]').fill('short1');
  await page.getByRole('button', { name: 'Update password' }).click();

  await expect(page.getByText('Password must be at least 8 characters.')).toBeVisible();
});

test('WEB-AUTH-11: Password confirmation mismatch is rejected', async ({ page }) => {
  await page.goto('/reset-password/update');
  await page.locator('input[name="password"]').fill('ValidPass123');
  await page.locator('input[name="confirmPassword"]').fill('DifferentPass123');
  await page.getByRole('button', { name: 'Update password' }).click();

  await expect(page.getByText('Passwords do not match.')).toBeVisible();
});

test('WEB-AUTH-09: Reset link routes through /auth/recovery to /reset-password/update', async ({ page }) => {
  // AŽURIRANO (app update): redirectTo za recovery link promenjen sa
  // /auth/callback?next=/reset-password/update na /auth/recovery — nova ruta čita
  // token_hash iz query stringa, upisuje ga u HttpOnly kolačić, i redirektuje na
  // /reset-password/update (vidi apps/web/src/app/auth/recovery/route.ts).
  // NAPOMENA: ova ruta još NIJE deployed na produkciju u trenutku pisanja ovog testa —
  // vraća 404 dok se dev grana ne deployuje.
  const email = `qa-auth-09-${Date.now()}@brewtracker.com`;
  const userId = await createTestUser({
    email,
    password: 'OldPass123!',
    fullName: 'QA AUTH-09 Test Manager',
    role: 'manager',
    isActive: true,
  });

  try {
    const actionLink = await generateRecoveryActionLink(email, `${BASE_URL}/auth/recovery`);
    await page.goto(actionLink);

    await expect(page).toHaveURL(/\/reset-password\/update/);
  } finally {
    await deleteTestUser(userId);
  }
});

test('WEB-AUTH-12: Successful password reset shows confirmation and the new password works on next login', async ({ page }) => {
  // AŽURIRANO (app update): ceo recovery mehanizam je prepravljen — token_hash sada stiže
  // kao query parametar (ne URL hash fragment) preko /auth/recovery, čuva se u HttpOnly
  // kolačiću, i server akcija ga razmenjuje za sesiju preko verifyOtp() — STARI poznati
  // defekt (hash fragment se nikad nije obrađivao) je ovim rešen u korenu. Redirect posle
  // uspešnog čuvanja lozinke je takođe promenjen: sa /login na /reset-password/success.
  // NAPOMENA: još NIJE deployed na produkciju u trenutku pisanja ovog testa — 404 dok se
  // dev grana ne deployuje; verifikovati empirijski čim bude dostupno.
  const email = `qa-auth-12-${Date.now()}@brewtracker.com`;
  const userId = await createTestUser({
    email,
    password: 'OldPass123!',
    fullName: 'QA AUTH-12 Test Manager',
    role: 'manager',
    isActive: true,
  });

  try {
    const actionLink = await generateRecoveryActionLink(email, `${BASE_URL}/auth/recovery`);
    await page.goto(actionLink);
    await expect(page).toHaveURL(/\/reset-password\/update/);

    await page.locator('input[name="password"]').fill('NewValidPass123');
    await page.locator('input[name="confirmPassword"]').fill('NewValidPass123');
    await page.getByRole('button', { name: 'Update password' }).click();

    await expect(page).toHaveURL(/\/reset-password\/success/);
    await expect(page.getByText('Password saved')).toBeVisible();

    // Nova lozinka stvarno radi za sledeći login (i korisnik je odjavljen, ne i dalje ulogovan
    // u staroj sesiji — recovery sesija se eksplicitno gasi sa signOut({scope:'local'})).
    const login = new LoginPage(page);
    await login.goto();
    await login.login(email, 'NewValidPass123');
    await login.expectLoggedInOnDashboard();
  } finally {
    await deleteTestUser(userId);
  }
});
