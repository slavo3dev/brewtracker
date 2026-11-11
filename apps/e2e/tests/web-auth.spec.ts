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

  // "email"/"password" have an HTML required attribute — the browser blocks submission
  // before it ever reaches the server (the same "Select a warehouse."-type check as on
  // other forms).
  const emailInput = page.locator('#email');
  await expect.poll(() => emailInput.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
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

  // "email" has an HTML required attribute — the same client-side block as on the login form.
  await expect.poll(() => emailField.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
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
  // The earlier test was PURELY negative (only "isn't /login") — that would pass even if the
  // page returned a 404/empty response, as long as the URL didn't contain "/login". A
  // positive check was added to verify REAL page content is rendered (a heading unique to
  // this page).
  await page.goto('/ai-quality');
  await expect(page).not.toHaveURL(/\/login/);
  await expect(
    page.getByRole('heading', { name: 'Review every service visit with AI-assisted quality control.' }),
  ).toBeVisible();
});

test('WEB-AIQ-01: /ai-quality shows static cards with no functional queue', async ({ page }) => {
  await page.goto('/ai-quality');

  for (const title of ['Photo Review Queue', 'AI Cleanliness Scoring', 'Object Detection', 'Quality Analytics']) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }
});

test('WEB-AUTH-16: /api/users endpoints reject non-user-manager accounts', async ({ page }) => {
  // Driver: attempting to log in signs them back out (they can't reach the web dashboard at
  // all), so this also tests that a call without a valid admin session doesn't return user
  // data.
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_DRIVER_EMAIL!, process.env.QA_DRIVER_PASSWORD!);

  const deniedResponse = await page.request.get('/api/users');
  expect(deniedResponse.headers()['content-type']).not.toContain('application/json');
  expect(deniedResponse.url()).toContain('/login');

  // Control: a manager gets real JSON data back from the SAME call.
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

  // The only "settings"-type administrative page in the entire dashboard is Clock Rules
  // (/dashboard/time-clock/settings) — nowhere in the code (grepping all of apps/web/src) is
  // there a UI component that references app_settings.google_review_url, only the read-only
  // getGoogleReviewUrl() on the public survey page. The value is currently changed only
  // directly in Supabase.
  await page.goto('/dashboard/time-clock/settings');
  await expect(page.getByText(/google review/i)).toHaveCount(0);
});

test('WEB-AUTH-07: Forgot password sends a reset email for a valid address', async ({ page }) => {
  // Note: resetPasswordForEmail() actually sends an email, so it's subject to the same
  // Supabase rate limit on this shared QA project as WEB-USR-01 — it can occasionally fail
  // with "Unable to send reset email." even when the code is correct (the regression plan
  // tracks this as a Pass, unlike WEB-USR-01 which is documented as a real defect).
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
  // Length validation happens in the server action BEFORE any Supabase auth call — the form
  // is accessible even without an active recovery session, so a real reset link isn't needed
  // for this case.
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
  // UPDATED (app update): redirectTo for the recovery link changed from
  // /auth/callback?next=/reset-password/update to /auth/recovery — the new route reads
  // token_hash from the query string, writes it to an HttpOnly cookie, and redirects to
  // /reset-password/update (see apps/web/src/app/auth/recovery/route.ts).
  // NOTE: this route was NOT YET deployed to production at the time this test was written —
  // returns 404 until the dev branch is deployed.
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
  // UPDATED (app update): the entire recovery mechanism was reworked — token_hash now
  // arrives as a query parameter (not a URL hash fragment) via /auth/recovery, is stored in
  // an HttpOnly cookie, and the server action exchanges it for a session via verifyOtp() —
  // the OLD known defect (the hash fragment was never processed) is fixed at the root by
  // this. The redirect after successfully saving the password also changed: from /login to
  // /reset-password/success.
  // NOTE: NOT YET deployed to production at the time this test was written — 404 until the
  // dev branch is deployed; verify empirically once it's available.
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

    // The new password actually works for the next login (and the user is signed out, not
    // still logged into the old session — the recovery session is explicitly ended with
    // signOut({scope:'local'})).
    const login = new LoginPage(page);
    await login.goto();
    await login.login(email, 'NewValidPass123');
    await login.expectLoggedInOnDashboard();
  } finally {
    await deleteTestUser(userId);
  }
});
