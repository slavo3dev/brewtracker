import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';

test('WEB-MKT-02: Feature grid cards link to the correct destinations', async ({ page }) => {
  const cards: Array<[string, RegExp]> = [
    ['Routes', /\/login$/],
    ['Service workflow', /\/login$/],
    ['Inventory', /\/login$/],
  ];

  for (const [title, expectedUrl] of cards) {
    await page.goto('/');
    await page.getByRole('heading', { name: title, exact: true }).click();
    await expect(page).toHaveURL(expectedUrl);
  }

  // AI quality gate je JAVNA stranica — anoniman korisnik tamo ostaje, bez redirecta na /login.
  await page.goto('/');
  await page.getByRole('heading', { name: 'AI quality gate', exact: true }).click();
  await expect(page).toHaveURL(/\/ai-quality$/);
});

test('WEB-MKT-05: Header shows Sign in/Get started when logged out, name/Sign out when logged in', async ({ page }) => {
  // Scoped na <header> — hero sekcija IMA sopstveno "Get started" dugme (vodi na
  // /get-started), pa bi globalni getByRole uhvatio oba i izazvao strict mode grešku.
  const header = page.locator('header');

  await page.goto('/');
  await expect(header.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Get started' })).toBeVisible();

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/');
  await expect(header.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
});

test('WEB-MKT-01: Home page shows the hero and CTA buttons', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Every machine. Every stop. Counted.' }),
  ).toBeVisible();

  // Hero "Get started" vodi na /get-started — <header> dolazi PRE hero sekcije u DOM-u, pa
  // ".first()" bez skopovanja pogađa header-ov link (koji vodi na /login) umesto hero-ovog.
  await page.locator('main').getByRole('link', { name: 'Get started', exact: true }).click();
  await expect(page).toHaveURL(/\/get-started$/);

  // Header "Get started" vodi na /login.
  await page.goto('/');
  const header = page.locator('header');
  await header.getByRole('link', { name: 'Get started' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('WEB-MKT-03: "Get started" page is a static mockup with no signup form', async ({ page }) => {
  await page.goto('/get-started');

  await expect(page.getByText('← Back home')).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);

  await page.getByText('← Back home').click();
  await expect(page).toHaveURL(/\/$/);
});

test('WEB-MKT-04: "How it works" page is a static mockup', async ({ page }) => {
  // Raniji test je proveravao SAMO da postoji jedan nav element ("Back home") negde na
  // stranici — to ne kaže ništa o STVARNOM sadržaju stranice. Dodata provera naslova
  // jedinstvenog za ovu stranicu potvrđuje da je prava "How it works" stranica renderovana.
  await page.goto('/how-it-works');
  await expect(
    page.getByRole('heading', { name: 'Routes, service visits, inventory, and reporting work together.' }),
  ).toBeVisible();
  await expect(page.getByText('← Back home')).toBeVisible();
});

test('WEB-MKT-06: Footer legal links are placeholders', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');

  for (const label of ['Privacy', 'Terms', 'Support']) {
    await expect(footer.getByRole('link', { name: label, exact: true })).toHaveAttribute('href', '#');
  }
});

test('WEB-AUTH-06: Button shows "Signing in…" while the request is in progress', async ({ page }) => {
  // Veštački usporavamo POST na /login da bismo pouzdano uhvatili tranzijentno stanje —
  // na brzom staging serveru zahtev bi inače mogao da se završi pre nego što Playwright
  // stigne da proveri dugme.
  await page.route('**/login', async (route) => {
    if (route.request().method() === 'POST') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await route.continue();
  });

  const login = new LoginPage(page);
  await login.goto();
  await page.locator('#email').fill(process.env.QA_MANAGER_EMAIL!);
  await page.locator('#password').fill(process.env.QA_MANAGER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('button', { name: 'Signing in…' })).toBeVisible();
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
});

test('WEB-HOME-01: Dashboard greets the logged-in admin by name', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  // "Welcome back, {ime}." je paragraf ispod H1 naslova "Dashboard", ne sama heading.
  const fullName = 'QA Manager Fixture';
  await expect(page.getByText(`Welcome back, ${fullName}.`)).toBeVisible();
});
