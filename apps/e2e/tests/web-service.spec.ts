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

// An existing Open/Unassigned ticket from the test data.
const TICKET_DESCRIPTION = 'QA TT-05 ticket without photo';
// An existing ticket with an attached photo.
const PHOTO_TICKET_DESCRIPTION = 'QA TT-06 ticket with photo';

test('WEB-TT-10: Empty state when there are no technical tickets', async () => {
  test.skip(
    true,
    'Skipped (safety, not a gap): testing this would require deleting all 31+ existing technical tickets in the shared database, including ones other tests in this same file (TT-02/04/05/06/07/08/09) depend on. Needs an isolated test database to automate safely.',
  );
});

test('WEB-TT-01: Status cards match the real data for the region', async ({ page }) => {
  // A documented, already-confirmed defect (regression plan): loadTechnicalTickets() drops
  // every ticket whose client/machine isn't readable under RLS, and machine visibility uses
  // the client's CURRENT region — not the region of the ticket's own client. Tickets for
  // clients in the manager's region get silently hidden if the machine has since been moved
  // to a client in a DIFFERENT region. The test below doesn't use test.fail() — it
  // intentionally FAILS (red) for as long as this defect is present in the application.
  // Deliberately kept outside the serial group below (a pure read, doesn't touch the shared
  // TICKET_DESCRIPTION fixture) so its failure doesn't block the other TT-* tests.
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

// The remaining tests share the SAME ticket fixture (resetting it to a known state before
// each test) — they run one after another to avoid a race on the same row. Split into their
// own describe group (instead of a file-wide serial) so WEB-TT-01 (above) isn't part of this
// chain — its intentional red failure must not skip the tests below.
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
  // Newly discovered: the technician dropdown is (unexpectedly, undocumented) region-scoped
  // — RLS on the "users" table returns only technicians FROM the logged-in manager's region,
  // with no indication in the UI that more exist. We use the same region as QA_MANAGER
  // (Italy) to avoid that unrelated behavior and test exactly what WEB-TT-04 describes
  // (active/inactive).
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

  // "Test Now" is in the same (Italy) region as QA_MANAGER — "OneTest" has region=null and
  // is therefore invisible in the dropdown (see the note in WEB-TT-04 about the
  // region-scoping finding).
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
