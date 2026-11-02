import { test, expect } from '../fixtures/test';
import { LoginPage } from '../pages/LoginPage';
import { TechnicalIssuesPage } from '../pages/TechnicalIssuesPage';
import {
  resetTicketToOpen,
  resetTicketToResolved,
  resetTicketToInProgressAssigned,
  resetTicketToInProgressNoAssignee,
  getTrueTicketCountsByRegion,
} from '../helpers/technicalTicketSeed';
import { createTestUser, deleteTestUser } from '../helpers/userSeed';

// Postojeći Open/Unassigned tiket iz test podataka.
const TICKET_DESCRIPTION = 'QA TT-05 ticket without photo';
// Postojeći tiket sa priloženom fotografijom.
const PHOTO_TICKET_DESCRIPTION = 'QA TT-06 ticket with photo';

test('WEB-TT-10: Prazno stanje kad nema nijednog tehničkog tiketa', async () => {
  test.skip(
    true,
    'PRESKOČENO (bezbednosni razlog, ne propust): da bi se ovo testiralo, trebalo bi obrisati SVIH 31 postojećih tehničkih tiketa iz deljene baze, uključujući one koje KORISTE drugi testovi u ovom istom fajlu (TT-02/04/05/06/07/08/09). Potrebna izolovana test baza da bi se ovo bezbedno automatizovalo.',
  );
});

test('WEB-TT-01: Status kartice odgovaraju stvarnim podacima regiona', async ({ page }) => {
  // Dokumentovan, već potvrđen defekt (regresioni plan): loadTechnicalTickets() izbacuje
  // svaki tiket čiji klijent/mašina nije čitljiva pod RLS-om, a vidljivost mašine koristi
  // NJEN TRENUTNI region klijenta — ne region klijenta samog tiketa. Tiketi za klijente iz
  // menadžerovog regiona se tiho sakriju ako je mašina u međuvremenu preseljena na klijenta
  // iz DRUGOG regiona. Test ispod ne koristi test.fail() — namerno PADA (crveno) dok god je
  // ovaj defekt prisutan u aplikaciji. Namerno van serial grupe ispod (čisto čitanje, ne
  // dira deljeni TICKET_DESCRIPTION fiksturu) da njegov pad ne blokira ostale TT-* testove.
  test.info().annotations.push({
    type: 'note',
    description:
      'POZNAT DEFEKT u aplikaciji: status kartice (Open/In Progress/Resolved brojevi) ne odgovaraju stvarnom broju tiketa, jer se tiketi tiho sakriju iz liste kad je njihova mašina u međuvremenu preseljena na klijenta iz drugog regiona (RLS vidljivost prati trenutni region mašine, ne region tiketa). Treba popraviti: loadTechnicalTickets() da koristi region tiketa/klijenta u trenutku kreiranja, ne trenutni region mašine.',
  });

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const service = new TechnicalIssuesPage(page);
  await service.goto();

  const shown = await service.getStatusCounts();
  const expected = await getTrueTicketCountsByRegion('Italy');

  expect(shown.open).toBe(expected.open);
  expect(shown.inProgress).toBe(expected.inProgress);
  expect(shown.resolved).toBe(expected.resolved);
});

// Preostali testovi dele ISTI tiket fixture (resetuju ga na poznato stanje pre svakog
// testa) — rade jedan za drugim da izbegnu trku oko istog reda. Izdvojeni u sopstvenu
// describe grupu (umesto file-wide serial) da WEB-TT-01 (gore) ne bude deo ovog lanca —
// njegov namerni crveni pad ne sme da poskipuje testove ispod.
test.describe(() => {
  test.describe.configure({ mode: 'serial' });

  test('WEB-TT-03: Dodela tehničara pomera tiket iz Open u In Progress', async ({ page }) => {
  await resetTicketToOpen();

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const service = new TechnicalIssuesPage(page);
  await service.goto();
  await service.assignTechnician(TICKET_DESCRIPTION, 'Test');
  await service.expectInProgress(TICKET_DESCRIPTION);
});

test('WEB-TT-06: Dodela zatvorenog tiketa je blokirana (kontrole sakrivene)', async ({ page }) => {
  await resetTicketToResolved();

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const service = new TechnicalIssuesPage(page);
  await service.goto();
  await service.expectResolvedStatus(TICKET_DESCRIPTION);
  await service.expectNoActionControls(TICKET_DESCRIPTION);
});

test('WEB-TT-07: "Mark as Resolved" je onemogućeno dok tiket nije in_progress', async ({ page }) => {
  await resetTicketToOpen();

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const service = new TechnicalIssuesPage(page);
  await service.goto();
  await service.expectResolveDisabled(TICKET_DESCRIPTION);
});

test('WEB-TT-09: Rešavanje tiketa sakriva sve akcione kontrole', async ({ page }) => {
  await resetTicketToOpen();

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const service = new TechnicalIssuesPage(page);
  await service.goto();
  await service.assignTechnician(TICKET_DESCRIPTION, 'Test');
  await service.expectInProgress(TICKET_DESCRIPTION);

  await service.resolveTicket(TICKET_DESCRIPTION);
  await service.expectResolvedStatus(TICKET_DESCRIPTION);
  await service.expectNoActionControls(TICKET_DESCRIPTION);
});

test('WEB-TT-02: Kartica tiketa prikazuje potpisanu fotografiju kad postoji', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const service = new TechnicalIssuesPage(page);
  await service.goto();
  await service.expectPhotoVisible(PHOTO_TICKET_DESCRIPTION);
});

test('WEB-TT-04: Samo aktivni tech korisnici su dostupni za dodelu', async ({ page }) => {
  // Novootkriveno: dropdown tehničara je (neočekivano, nedokumentovano) region-scoped —
  // RLS na "users" tabeli vraća samo tehničare IZ REGIONA ulogovanog menadžera, bez ikakve
  // naznake u UI-ju da ih ima još. Koristimo isti region kao QA_MANAGER (Italy) da izbegnemo
  // tu nepovezanu pojavu i testiramo tačno ono što WEB-TT-04 opisuje (aktivan/neaktivan).
  const stamp = Date.now();
  const activeTechId = await createTestUser({
    email: `qa-tt-04-active-${stamp}@brewtracker.com`,
    password: 'TestPass123!',
    fullName: `QA TT-04 Active Tech ${stamp}`,
    role: 'tech',
    isActive: true,
    region: 'Italy',
  });
  const inactiveTechId = await createTestUser({
    email: `qa-tt-04-inactive-${stamp}@brewtracker.com`,
    password: 'TestPass123!',
    fullName: `QA TT-04 Inactive Tech ${stamp}`,
    role: 'tech',
    isActive: false,
    region: 'Italy',
  });

  try {
    await resetTicketToOpen();

    const login = new LoginPage(page);
    await login.goto();
    await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

    const service = new TechnicalIssuesPage(page);
    await service.goto();
    const options = await service.getTechnicianOptionLabels(TICKET_DESCRIPTION);

    expect(options).toContain(`QA TT-04 Active Tech ${stamp}`);
    expect(options).not.toContain(`QA TT-04 Inactive Tech ${stamp}`);
  } finally {
    await deleteTestUser(activeTechId);
    await deleteTestUser(inactiveTechId);
  }
});

test('WEB-TT-05: Promena tehničara na in-progress tiketu radi', async ({ page }) => {
  await resetTicketToInProgressAssigned();

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const service = new TechnicalIssuesPage(page);
  await service.goto();
  await service.expectAssignedTo(TICKET_DESCRIPTION, 'Test');

  // "Test Now" je u istom (Italy) regionu kao QA_MANAGER — "OneTest" ima region=null i zato
  // je nevidljiv u dropdown-u (vidi napomenu u WEB-TT-04 o region-scoping nalazu).
  await service.reassignTechnician(TICKET_DESCRIPTION, 'Test Now');
  await service.expectAssignedTo(TICKET_DESCRIPTION, 'Test Now');
});

test('WEB-TT-08: Rešavanje je blokirano bez dodeljenog tehničara (rubni slučaj)', async ({ page }) => {
  await resetTicketToInProgressNoAssignee();

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const service = new TechnicalIssuesPage(page);
  await service.goto();
  await service.attemptResolveWithoutAssignee(TICKET_DESCRIPTION);
  await service.expectActionError(TICKET_DESCRIPTION, 'Assign a technician before resolving the ticket.');
});
});
