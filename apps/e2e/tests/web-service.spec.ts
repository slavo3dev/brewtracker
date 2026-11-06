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

test('WEB-TT-10: Empty state when there are no technical tickets', async () => {
  test.skip(
    true,
    'Skipped (safety, not a gap): testing this would require deleting all 31+ existing technical tickets in the shared database, including ones other tests in this same file (TT-02/04/05/06/07/08/09) depend on. Needs an isolated test database to automate safely.',
  );
});

test('WEB-TT-01: Status cards match the real data for the region', async ({ page }) => {
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
      'Known app defect: the status cards (Open/In Progress/Resolved counts) do not match the real ticket count, because tickets are silently hidden from the list when their machine has since been moved to a client in a different region (RLS visibility follows the machine\'s CURRENT region, not the ticket\'s region). Fix: loadTechnicalTickets() should use the ticket/client region at creation time, not the machine\'s current region.',
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

  test('WEB-TT-03: Assigning a technician moves the ticket from Open to In Progress', async ({ page }) => {
  await resetTicketToOpen();

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const service = new TechnicalIssuesPage(page);
  await service.goto();
  await service.assignTechnician(TICKET_DESCRIPTION, 'Test');
  await service.expectInProgress(TICKET_DESCRIPTION);
});

test('WEB-TT-06: Assigning a closed ticket is blocked (controls hidden)', async ({ page }) => {
  await resetTicketToResolved();

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const service = new TechnicalIssuesPage(page);
  await service.goto();
  await service.expectResolvedStatus(TICKET_DESCRIPTION);
  await service.expectNoActionControls(TICKET_DESCRIPTION);
});

test('WEB-TT-07: "Mark as Resolved" is disabled until the ticket is in_progress', async ({ page }) => {
  await resetTicketToOpen();

  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const service = new TechnicalIssuesPage(page);
  await service.goto();
  await service.expectResolveDisabled(TICKET_DESCRIPTION);
});

test('WEB-TT-09: Resolving a ticket hides all action controls', async ({ page }) => {
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

test('WEB-TT-02: Ticket card shows the signed photo when one exists', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(process.env.QA_MANAGER_EMAIL!, process.env.QA_MANAGER_PASSWORD!);

  const service = new TechnicalIssuesPage(page);
  await service.goto();
  await service.expectPhotoVisible(PHOTO_TICKET_DESCRIPTION);
});

test('WEB-TT-04: Only active tech users are available for assignment', async ({ page }) => {
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

test('WEB-TT-05: Changing the technician on an in-progress ticket works', async ({ page }) => {
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

test('WEB-TT-08: Resolving is blocked with no technician assigned (edge case)', async ({ page }) => {
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
