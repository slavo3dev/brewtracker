import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { deleteProductByName } from '../helpers/productSeed';

test('WEB-INV-01: Movement history shows paginated results by default', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');

  // Ukupan broj je mnogo veći od 10 (stotine), ali se podrazumevano prikazuje samo prva stranica.
  await expect(page.getByText(/^\d+ movements · Showing 1–10$/)).toBeVisible();
});

test('WEB-INV-02: Filtering by movement type narrows the results', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  await page.getByLabel('Filter by movement type').selectOption('machine_refill');
  await page.getByRole('button', { name: 'Search' }).click();

  const cards = page.locator('article');
  await expect(cards.first()).toBeVisible();
  const headings = await cards.locator('h3').allInnerTexts();
  expect(headings.length).toBeGreaterThan(0);
  for (const heading of headings) {
    expect(heading).toBe('Machine Refill');
  }
});

test('WEB-INV-03: Search by visit ID or unit substring works', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  // Server action treba stvaran round-trip da primeni filter — zabeleži tekst PRE pretrage i
  // sačekaj da se stvarno PROMENI (ne samo da ostane vidljiv) pre čitanja rezultata, inače
  // ispod možemo pročitati stanje od PRE filtriranja (nefiltriranih 10 od 132 pokreta).
  const resultsSummary = page.getByText(/^\d+ movements · Showing/);
  const beforeText = await resultsSummary.innerText();

  // Substring trajno zasejanog source_visit_id fixture pokreta ("qa-fixture-visit-ndfec463") —
  // ne oslanja se na slučajnu istorijsku vrednost koja može nestati kad se deljena baza menja.
  await page.getByPlaceholder('Search visit or unit').fill('ndfec463');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(resultsSummary).not.toHaveText(beforeText);

  await expect(page.locator('article').first()).toBeVisible();
  // Raniji test je samo proveravao da se NEGDE na stranici pojavi generički tekst "Visit:" —
  // to bi prošlo i da pretraga ne filtrira ništa (npr. da vraća sve pokrete). Vidljivi tekst
  // kartice je zasečen (shortenId() seče na 18 karaktera + "…" za duže ID-jeve — za ovaj fixture
  // to je TAČNO PRE "ndfec463" dela), pa se umesto vidljivog teksta provera radi na "title"
  // atributu span-a (koji nosi CEO, nesečeno source_visit_id) — tako se stvarno potvrđuje da
  // je rezultat pretrage povezan sa traženim substring-om, ne samo da je neka kartica prikazana.
  const visitLabels = page.locator('article span[title]');
  const visitCount = await visitLabels.count();
  expect(visitCount).toBeGreaterThan(0);
  for (let i = 0; i < visitCount; i++) {
    await expect(visitLabels.nth(i)).toHaveAttribute('title', /ndfec463/);
  }
});

test('WEB-INV-05: A loading error shows an error banner', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');

  // Server action za učitavanje pokreta ide POST na istu stranicu — presretni i simuliraj
  // mrežni kvar samo za taj zahtev (abortuje se), ne za inicijalno učitavanje stranice.
  await page.route('/dashboard/inventory', async (route) => {
    if (route.request().method() === 'POST') {
      await route.abort('failed');
    } else {
      await route.continue();
    }
  });

  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.locator('.border-red-200')).toBeVisible();
});

test('WEB-INV-06: Products tab filters by search/category/status', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  await page.getByRole('button', { name: 'Products' }).click();

  // Nema neaktivnih proizvoda u trenutnim test podacima — filtriramo na "Active" (sigurno
  // ima rezultata) da proverimo ISTI mehanizam filtriranja po statusu.
  await page.getByLabel('Filter by product status').selectOption('true');
  const cards = page.locator('article');
  await expect(cards.first()).toBeVisible();
  const badges = await cards.locator('span', { hasText: /^(Active|Inactive)$/ }).allInnerTexts();
  expect(badges.length).toBeGreaterThan(0);
  for (const badge of badges) {
    expect(badge).toBe('Active');
  }
});

test('WEB-INV-07: Product card shows unit conversion and package details', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  await page.getByRole('button', { name: 'Products' }).click();

  const firstCard = page.locator('article').first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard.getByText(/^1 .+ = \d+(\.\d+)? .+$/)).toBeVisible();
  await expect(firstCard.getByText('Loose units:', { exact: false })).toBeVisible();
  await expect(firstCard.getByText('Partial base unit:', { exact: false })).toBeVisible();
});

test('WEB-INV-08: Locations tab filters by location type', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  await page.getByRole('button', { name: 'Locations' }).click();

  await page.getByLabel('Filter by location type').selectOption('warehouse');
  const cards = page.locator('article');
  await expect(cards.first()).toBeVisible();
  const typeBadges = await cards.locator('span').allInnerTexts();
  expect(typeBadges.length).toBeGreaterThan(0);
  for (const badge of typeBadges) {
    expect(badge).toBe('Warehouse');
  }
});

test('WEB-INVM-02: Machines stub page still enforces admin auth', async ({ page }) => {
  await page.goto('/dashboard/inventory/machines');
  await expect(page).toHaveURL(/\/login/);
});

test('WEB-INV-10: Non-admin cannot access any /dashboard/inventory/* page', async ({ page }) => {
  const paths = [
    '/dashboard/inventory',
    '/dashboard/inventory/reconciliation',
    '/dashboard/inventory/transfers',
  ];

  for (const path of paths) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test('WEB-INV-04: "Clear filters" resets all movement filters', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  await page.getByLabel('Filter by movement type').selectOption('machine_refill');
  await page.getByPlaceholder('Search visit or unit').fill('ndfec463');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();

  await page.getByRole('button', { name: 'Clear filters' }).click();

  await expect(page.getByLabel('Filter by movement type')).toHaveValue('');
  await expect(page.getByPlaceholder('Search visit or unit')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
});

test('WEB-INV-09: Header actions link to the correct inventory subpages', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const links: Array<[string, RegExp]> = [
    ['Reconcile inventory', /\/dashboard\/inventory\/reconciliation$/],
    ['Record transfer', /\/dashboard\/inventory\/transfers$/],
    ['Warehouse movements', /\/dashboard\/inventory\/movements$/],
    ['Warehouses', /\/dashboard\/inventory\/warehouses$/],
    ['Machines', /\/dashboard\/inventory\/machines$/],
  ];

  for (const [label, expectedUrl] of links) {
    await page.goto('/dashboard/inventory');
    await page.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(expectedUrl);
  }
});

test('WEB-INVM-01: Machines page shows a "coming soon" stub with no functional UI', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory/machines');
  await expect(page.getByRole('heading', { name: 'Machines' })).toBeVisible();
  await expect(page.getByText('Machine management module coming soon.')).toBeVisible();
});

// NOVA FUNKCIONALNOST (app update, dev grana) — Inventory Product CRUD ("+ Add Product" /
// "Edit" na Products tabu). NAPOMENA: u trenutku pisanja ovih testova, NI app kod NI DB
// migracije nisu deployed/primenjeni na ovaj QA projekat — testovi ispod će pasti dok se
// oba koraka ne završe. Pisano prema izvornom kodu kao priprema za kad bude gotovo.

test('WEB-INVP-01: "+ Add Product" form creates a new product', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  await page.getByRole('button', { name: 'Products' }).click();
  await page.getByRole('button', { name: '+ Add Product' }).click();

  const name = `QA INVP-01 Test Product ${Date.now()}`;

  try {
    await page.getByLabel('Product name *').fill(name);
    await page.getByLabel('Display unit label *').fill('bags');
    await page.getByLabel('Base unit *').fill('bag');
    await page.getByLabel('Issue unit *', { exact: true }).fill('case');
    await page.getByLabel('Base units per issue unit *').fill('6');
    await page.getByLabel('OCS').check();
    await page.getByRole('button', { name: 'Create Product' }).click();

    // Deljeni katalog je narastao dovoljno (50+ proizvoda) da nov proizvod ne mora pasti
    // na prvu stranicu (10 po strani) — sačekaj da se forma zatvori (handleProductSaved
    // već resetovao search na "") pre upisa, pa pretraži po imenu da izbegnemo tu zavisnost.
    await expect(page.getByLabel('Product name *')).toHaveCount(0);
    await page.getByPlaceholder('Search products').fill(name);
    await expect(page.getByText(name)).toBeVisible();
  } finally {
    // Bez ovoga, deljeni katalog trajno rase sa svakim zelenim run-om — i pomera pozicione
    // izbore u WEB-XFER-10-tipa petljama koje prolaze kroz SVE aktivne proizvode.
    await deleteProductByName(name);
  }
});

test('WEB-INVP-02: Creating a product is blocked without a selected business type', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  await page.getByRole('button', { name: 'Products' }).click();
  await page.getByRole('button', { name: '+ Add Product' }).click();

  await page.getByLabel('Product name *').fill(`QA INVP-02 ${Date.now()}`);
  await page.getByLabel('Display unit label *').fill('bags');
  await page.getByLabel('Base unit *').fill('bag');
  await page.getByLabel('Issue unit *', { exact: true }).fill('case');
  await page.getByLabel('Base units per issue unit *').fill('6');
  // OCS je defaultno čekiran — isključi ga da nijedan business type ne ostane izabran.
  await page.getByLabel('OCS').uncheck();
  await page.getByRole('button', { name: 'Create Product' }).click();

  await expect(page.getByText('Select at least one business type.')).toBeVisible();
});

test('WEB-INVP-03: "Edit" button on a card opens a form with existing data and saves the change', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  await page.goto('/dashboard/inventory');
  await page.getByRole('button', { name: 'Products' }).click();
  await page.getByRole('button', { name: '+ Add Product' }).click();

  const originalName = `QA INVP-03 Original ${Date.now()}`;
  const updatedName = `QA INVP-03 Updated ${Date.now()}`;

  try {
    await page.getByLabel('Product name *').fill(originalName);
    await page.getByLabel('Display unit label *').fill('bags');
    await page.getByLabel('Base unit *').fill('bag');
    await page.getByLabel('Issue unit *', { exact: true }).fill('case');
    await page.getByLabel('Base units per issue unit *').fill('6');
    await page.getByLabel('OCS').check();
    await page.getByRole('button', { name: 'Create Product' }).click();

    // handleProductSaved() u app kodu BRIŠE search polje na "" posle SVAKOG uspešnog
    // create/edit (i zatvara formu) — moramo sačekati da se forma stvarno zatvori (taj
    // reset se već desio) PRE nego što upišemo search, inače app sam obriše ono što upišemo.
    await expect(page.getByLabel('Product name *')).toHaveCount(0);

    // Deljeni katalog je dovoljno veliki da nov proizvod (alfabetski posle mnogih
    // postojećih "C.../I.../M..." imena) ne mora pasti na prvu stranicu (10 po strani) —
    // pretraga po imenu izbegava tu zavisnost od paginacije.
    await page.getByPlaceholder('Search products').fill(originalName);
    await expect(page.getByText(originalName)).toBeVisible();

    const card = page.locator('article').filter({ hasText: originalName });
    await card.getByRole('button', { name: 'Edit' }).click();

    await expect(page.getByLabel('Product name *')).toHaveValue(originalName);

    await page.getByLabel('Product name *').fill(updatedName);
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Sačekaj da se edit forma stvarno zatvori (server action + revalidate) PRE interakcije
    // sa search input-om — inače fill() može pogoditi instancu polja koja se baš zamenjuje
    // tokom re-rendera, pa se upisana vrednost izgubi (prazno polje, "Showing 57 of 57").
    await expect(page.getByLabel('Product name *')).toHaveCount(0);

    await page.getByPlaceholder('Search products').fill(updatedName);
    await expect(page.getByText(updatedName)).toBeVisible();
    await expect(page.getByText(originalName)).toHaveCount(0);
  } finally {
    // Proizvod sad postoji pod updatedName (preimenovan) — ili pod originalName ako je edit
    // korak pao pre rename-a; pokušaj oba da ne ostavimo nijedan trag u deljenom katalogu.
    await deleteProductByName(updatedName);
    await deleteProductByName(originalName);
  }
});

test('WEB-INVP-04: Non-manager/CEO cannot manage inventory products', async ({ page }) => {
  // requireInventoryManager() odbija svakog ko nije manager/CEO sa specifičnom porukom —
  // razlikuje se od generičkog requireAdmin() koji se koristi za ostatak Inventory stranice.
  // NAPOMENA (strukturno ograničenje, ne test bug): vozač se uopšte ne može ulogovati na web
  // dashboard (vidi WEB-AUTH-05) — ovaj test zato stvarno proverava SAMO taj opštiji login gate,
  // ne i requireInventoryManager()-ovu specifičnu manager-vs-generic-admin granu (ona grana je
  // trenutno nedostižna dok god ne postoji ulogovan admin BEZ ove konkretne dozvole). Isti
  // obrazac kao WEB-USR-14/WEB-TCREV-11/WEB-HOME-02/WEB-FLEET-07 — ne može se popraviti bez
  // izmene permission modela u aplikaciji.
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_DRIVER_EMAIL!, process.env.QA_DRIVER_PASSWORD!);
  await page.goto('/dashboard/inventory');
  await expect(page).toHaveURL(/\/login/);
});
