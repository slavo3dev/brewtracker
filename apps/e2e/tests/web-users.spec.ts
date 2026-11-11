import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { UsersPage } from '../pages/UsersPage';
import { createTestUser, deleteTestUser, getUserIdByEmail, setUserEmailToNull } from '../helpers/userSeed';

test('WEB-USR-01: Creating a user with all fields succeeds and sends the setup email', async ({ page }) => {
  // A documented, already-confirmed defect (regression plan, Critical Fail): createUserAction()
  // calls sendAppUserPasswordReset() IMMEDIATELY after createAppUser(), in the SAME try
  // block — when that call hits the Supabase rate limit for reset-password emails (common on
  // this shared QA project), the whole action returns an error instead of a success message,
  // even though the user was ALREADY created in the database. The test below doesn't use
  // test.fail() — it intentionally FAILS (red) whenever the rate limit is hit.
  test.info().annotations.push({
    type: 'note',
    description:
      'Known app defect (Critical): user creation and sending the setup email share the same try block — when the email send hits the Supabase rate limit, the whole action returns an error even though the user was already created in the database. NOTE: this test depends on the CURRENT state of the Supabase email quota — an occasional green pass does NOT mean the bug is fixed, only that the quota was not exhausted at that moment. Fix: split user creation and the email send into separate try blocks.',
  });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const users = new UsersPage(page);
  await users.goto();
  await users.openAddUserForm();

  const stamp = Date.now();
  const email = `qa-usr-01-${stamp}@brewtracker.com`;

  try {
    await users.fillAndSubmit({
      fullName: 'QA USR-01 Test User',
      email,
      phone: `+3816${String(stamp).slice(-8)}`,
      address: 'Test Address 1',
      region: 'Italy',
      role: 'driver',
    });

    await users.expectUserCreatedAndEmailSent();
  } finally {
    // The documented defect above: the account is created in the database even when the
    // final message fails (an email rate limit), so we clean up regardless of the outcome —
    // so reruns don't pile up accounts.
    const userId = await getUserIdByEmail(email);
    if (userId) {
      await deleteTestUser(userId);
    }
  }
});

test('WEB-USR-02: Role select in the Add user form defaults to Driver', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const users = new UsersPage(page);
  await users.goto();
  await users.openAddUserForm();

  expect(await users.getAddFormRoleDefault()).toBe('driver');
});

test('WEB-USR-06: Empty state when the filter combination matches nobody', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const users = new UsersPage(page);
  await users.goto();
  // "Filter by region" is a <select> with options derived from existing users — you can't
  // select a region that no user has. Search is free text (ANDed with the other filters) —
  // a guaranteed-nonexistent search reliably gives zero results.
  await users.search(`qa-usr-06-nonexistent-${Date.now()}`);

  await users.expectNoUsersMessage();
  expect(await users.getVisibleUserCount()).toBe(0);
});

test('WEB-USR-07: Pagination shows 10 users per page', async ({ page }) => {
  // The test seeds enough users ITSELF (instead of relying on the ambient count in the
  // shared database) — guarantees at least 2 full pages regardless of how many users
  // currently exist.
  const stamp = Date.now();
  // allSettled (not all) + push inside the try — if ONE of the 15 requests is rejected, the
  // others that succeeded must still be recorded for cleanup below, instead of being
  // permanently lost in the shared database.
  const userIds: string[] = [];
  try {
    const results = await Promise.allSettled(
      Array.from({ length: 15 }, async (_, i) => {
        const id = await createTestUser({
          email: `qa-usr-07-${stamp}-${i}@brewtracker.com`,
          password: 'TestPass123!',
          fullName: `QA USR-07 Pagination User ${stamp}-${i}`,
          role: 'driver',
          isActive: true,
        });
        userIds.push(id);
      }),
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') {
      throw failure.reason;
    }

    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const users = new UsersPage(page);
    await users.goto();

    expect(await users.getVisibleUserCount()).toBe(10);
    expect(await users.getPageIndicatorText()).toMatch(/Page 1 of \d+/);

    await users.clickNextPage();
    expect(await users.getPageIndicatorText()).toMatch(/Page 2 of \d+/);
    expect(await users.getVisibleUserCount()).toBe(10);

    await users.clickPreviousPage();
    expect(await users.getPageIndicatorText()).toMatch(/Page 1 of \d+/);
  } finally {
    await Promise.all(userIds.map((id) => deleteTestUser(id)));
  }
});

test('WEB-USR-11: "Send password reset" is disabled for a user with no email', async ({ page }) => {
  const fullName = `QA USR-11 Test User ${Date.now()}`;
  const userId = await createTestUser({
    email: `qa-usr-11-${Date.now()}@brewtracker.com`,
    password: 'TestPass123!',
    fullName,
    role: 'driver',
    isActive: true,
  });
  await setUserEmailToNull(userId);

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const users = new UsersPage(page);
    await users.goto();
    await users.expandUser(fullName);
    await users.expectSendPasswordResetDisabled(fullName);
  } finally {
    await deleteTestUser(userId);
  }
});

test('WEB-USR-03: Creating a user is blocked without a full name', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const users = new UsersPage(page);
  await users.goto();
  await users.openAddUserForm();

  await users.attemptSubmitWithoutFullName(`qa-usr-03-${Date.now()}@brewtracker.com`);

  // "fullName" has an HTML required attribute — the browser blocks submission before it ever
  // reaches the server (no "User created..." message).
  const fullNameField = users.fullNameField();
  await expect.poll(() => fullNameField.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  await expect(page.getByText('User created and password setup email sent.')).toHaveCount(0);
});

test('WEB-USR-12: Activate/Deactivate changes is_active with confirmation', async ({ page }) => {
  const fullName = `QA USR-12 Test User ${Date.now()}`;
  const email = `qa-usr-12-${Date.now()}@brewtracker.com`;
  const userId = await createTestUser({
    email,
    password: 'TestPass123!',
    fullName,
    role: 'driver',
    isActive: true,
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const users = new UsersPage(page);
    await users.goto();
    await users.expandUser(email);
    await users.toggleActiveStatus(email, fullName, 'Deactivate');
    await users.expectActiveStatus(email, 'Inactive');

    await users.toggleActiveStatus(email, fullName, 'Activate');
    await users.expectActiveStatus(email, 'Active');
  } finally {
    await deleteTestUser(userId);
  }
});

test('WEB-USR-08: Editing and saving user data persists', async ({ page }) => {
  const email = `qa-usr-08-${Date.now()}@brewtracker.com`;
  const userId = await createTestUser({
    email,
    password: 'TestPass123!',
    fullName: 'QA USR-08 Original Name',
    role: 'driver',
    isActive: true,
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const users = new UsersPage(page);
    await users.goto();
    await users.expandUser(email);

    const updated = {
      fullName: 'QA USR-08 Updated Name',
      phone: '+381641112233',
      address: 'Updated Address 42',
      region: 'Montenegro',
      role: 'tech',
    };
    await users.editUserDetails(email, updated);

    // The role select updates IMMEDIATELY on screen after saving, without a reload — before
    // the fix (router.refresh() + a key on <select>) the uncontrolled select kept showing the
    // OLD role until the page was manually reloaded.
    expect((await users.getUserDetails(email)).role).toBe(updated.role);

    // Persistence — reload the page and check the changes remain.
    await users.goto();
    await users.expandUser(email);
    const persisted = await users.getUserDetails(email);
    expect(persisted.fullName).toBe(updated.fullName);
    expect(persisted.phone).toBe(updated.phone);
    expect(persisted.address).toBe(updated.address);
    expect(persisted.region).toBe(updated.region);
    expect(persisted.role).toBe(updated.role);
  } finally {
    await deleteTestUser(userId);
  }
});

test('WEB-USR-04: Search filters by part of the phone number', async ({ page }) => {
  const stamp = Date.now();
  const uniquePhone = `+381699${String(stamp).slice(-6)}`;
  const email = `qa-usr-04-${stamp}@brewtracker.com`;
  const userId = await createTestUser({
    email,
    password: 'TestPass123!',
    fullName: `QA USR-04 Test User ${stamp}`,
    role: 'driver',
    isActive: true,
    phone: uniquePhone,
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const users = new UsersPage(page);
    await users.goto();
    await users.search(uniquePhone.slice(-8));

    await expect(users.userCard(email)).toBeVisible();
    expect(await users.getVisibleUserCount()).toBe(1);
  } finally {
    await deleteTestUser(userId);
  }
});

test('WEB-USR-05: Role/Status/Region filters combine with AND', async ({ page }) => {
  const stamp = Date.now();
  const uniqueRegion = `QA-USR-05-Region-${stamp}`;
  const email = `qa-usr-05-${stamp}@brewtracker.com`;
  const userId = await createTestUser({
    email,
    password: 'TestPass123!',
    fullName: `QA USR-05 Test User ${stamp}`,
    role: 'manager',
    isActive: true,
    region: uniqueRegion,
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const users = new UsersPage(page);
    await users.goto();
    await users.filterByRole('manager');
    await users.filterByStatus('true');
    await users.filterByRegion(uniqueRegion);

    // The region is unique (a timestamp) — the combination of all three filters must give
    // EXACTLY this user.
    await expect(users.userCard(email)).toBeVisible();
    expect(await users.getVisibleUserCount()).toBe(1);

    // Changing ONLY the status (role+region stay the same) must exclude this (active) user
    // — confirms the filters combine with AND, not OR.
    await users.filterByStatus('false');
    expect(await users.getVisibleUserCount()).toBe(0);
  } finally {
    await deleteTestUser(userId);
  }
});

test('WEB-USR-09: Full name is required when saving an edit', async ({ page }) => {
  const email = `qa-usr-09-${Date.now()}@brewtracker.com`;
  const userId = await createTestUser({
    email,
    password: 'TestPass123!',
    fullName: 'QA USR-09 Test User',
    role: 'driver',
    isActive: true,
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const users = new UsersPage(page);
    await users.goto();
    await users.expandUser(email);

    // "fullName" has an HTML required attribute — the browser blocks submission before it
    // ever reaches the server.
    await users.attemptClearFullNameAndSave(email);
    const fullNameInput = users.userCard(email).locator('input[name="fullName"]');
    await expect.poll(() => fullNameInput.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
    await expect(users.userCard(email).getByText('User updated.')).toHaveCount(0);
  } finally {
    await deleteTestUser(userId);
  }
});

test('WEB-USR-10: "Send password reset" asks for confirmation and requires an email on the account', async ({ page }) => {
  // Note: sendAppUserPasswordReset() is subject to the same Supabase rate limit as
  // WEB-USR-01/WEB-AUTH-07 on this shared QA project — it can occasionally fail with a
  // generic error instead of "Password reset email sent." even when the code is correct.
  test.info().annotations.push({
    type: 'note',
    description:
      'Not an app defect: this test depends on the shared Supabase email quota on the QA project — if it fails, check whether the quota is currently exhausted before investigating the code (same root cause as WEB-USR-01/AUTH-07).',
  });

  const email = `qa-usr-10-${Date.now()}@brewtracker.com`;
  const userId = await createTestUser({
    email,
    password: 'TestPass123!',
    fullName: 'QA USR-10 Test User',
    role: 'driver',
    isActive: true,
  });

  try {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const users = new UsersPage(page);
    await users.goto();
    await users.expandUser(email);

    const dialogMessage = await users.sendPasswordReset(email, email);
    expect(dialogMessage).toBe(`Send a password reset email to ${email}?`);
    await users.expectPasswordResetSent(email);
  } finally {
    await deleteTestUser(userId);
  }
});

test('WEB-USR-14: /dashboard/users is unreachable for non-user-manager accounts', async ({ page }) => {
  // canManageUsers() allows every active admin (manager/CEO) — in this code there's no
  // "admin without this permission". Driver/tech accounts can't log into the web dashboard
  // at all (see WEB-AUTH-05), so requireUserManager()'s redirect("/dashboard") is currently
  // unreachable code; the final, user-visible outcome is still the same — a driver can't see
  // /dashboard/users.
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_DRIVER_EMAIL!, process.env.QA_DRIVER_PASSWORD!);

  const users = new UsersPage(page);
  await users.goto();
  await expect(page).toHaveURL(/\/login/);
});
