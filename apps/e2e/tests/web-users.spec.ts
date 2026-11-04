import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { UsersPage } from '../pages/UsersPage';
import { createTestUser, deleteTestUser, getUserIdByEmail, setUserEmailToNull } from '../helpers/userSeed';

test('WEB-USR-01: Creating a user with all fields succeeds and sends the setup email', async ({ page }) => {
  // Dokumentovan, već potvrđen defekt (regresioni plan, Critical Fail): createUserAction()
  // poziva sendAppUserPasswordReset() ODMAH posle createAppUser(), u ISTOM try bloku — kad taj
  // poziv udari u Supabase rate-limit za reset-password email (uobičajeno u ovom deljenom QA
  // projektu), cela akcija vraća grešku umesto success poruke, iako je korisnik VEĆ kreiran u
  // bazi. Test ispod ne koristi test.fail() — namerno PADA (crveno) kad god rate limit udari.
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
    // Dokumentovan defekt gore: nalog se pravi u bazi i kad finalna poruka ne uspe (rate
    // limit na email), pa čistimo bez obzira na ishod — da reruns ne gomilaju naloge.
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
  // Filter by region je <select> sa opcijama izvedenim iz postojećih korisnika — ne može
  // se birati region koji ne postoji nijednom korisniku. Search je slobodan tekst (AND sa
  // ostalim filterima) — garantovano nepostojeća pretraga pouzdano daje nula rezultata.
  await users.search(`qa-usr-06-nonexistent-${Date.now()}`);

  await users.expectNoUsersMessage();
  expect(await users.getVisibleUserCount()).toBe(0);
});

test('WEB-USR-07: Pagination shows 10 users per page', async ({ page }) => {
  // Test SAM seeduje dovoljno korisnika (umesto da se oslanja na ambijentalni broj u
  // deljenoj bazi) — garantuje bar 2 pune strane bez obzira koliko trenutno ima korisnika.
  const stamp = Date.now();
  const userIds = await Promise.all(
    Array.from({ length: 15 }, (_, i) =>
      createTestUser({
        email: `qa-usr-07-${stamp}-${i}@brewtracker.com`,
        password: 'TestPass123!',
        fullName: `QA USR-07 Pagination User ${stamp}-${i}`,
        role: 'driver',
        isActive: true,
      }),
    ),
  );

  try {
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

  // "fullName" ima HTML required atribut — browser blokira submit pre nego što ikada
  // stigne do servera (nema "User created..." poruke).
  await expect(users.fullNameField()).toHaveJSProperty('validity.valid', false);
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

    // Perzistencija — ponovo učitaj stranicu i proveri da izmene ostaju.
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

    // Region je jedinstven (timestamp) — kombinacija sva tri filtera mora dati TAČNO ovog
    // korisnika.
    await expect(users.userCard(email)).toBeVisible();
    expect(await users.getVisibleUserCount()).toBe(1);

    // Promena SAMO statusa (role+region ostaju isti) mora da isključi ovog (aktivnog)
    // korisnika — potvrđuje da se filteri kombinuju sa AND, ne OR.
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

    // "fullName" ima HTML required atribut — browser blokira submit pre nego što ikada
    // stigne do servera.
    await users.attemptClearFullNameAndSave(email);
    await expect(users.userCard(email).locator('input[name="fullName"]')).toHaveJSProperty('validity.valid', false);
    await expect(users.userCard(email).getByText('User updated.')).toHaveCount(0);
  } finally {
    await deleteTestUser(userId);
  }
});

test('WEB-USR-10: "Send password reset" asks for confirmation and requires an email on the account', async ({ page }) => {
  // Napomena: sendAppUserPasswordReset() podleže istom Supabase rate-limitu kao WEB-USR-01/
  // WEB-AUTH-07 na ovom deljenom QA projektu — povremeno može pasti sa generičkom greškom
  // umesto "Password reset email sent." čak i kad je kod ispravan.
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
  // canManageUsers() dozvoljava svakom aktivnom admin-u (manager/CEO) — u ovom kodu ne
  // postoji "admin bez te dozvole". Driver/tech nalozi se uopšte ne mogu ulogovati na web
  // dashboard (vidi WEB-AUTH-05), pa je requireUserManager()-ov redirect("/dashboard")
  // trenutno nedostižan kod; krajnji, korisniku vidljiv ishod je ipak isti — driver ne
  // može da vidi /dashboard/users.
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_DRIVER_EMAIL!, process.env.QA_DRIVER_PASSWORD!);

  const users = new UsersPage(page);
  await users.goto();
  await expect(page).toHaveURL(/\/login/);
});
