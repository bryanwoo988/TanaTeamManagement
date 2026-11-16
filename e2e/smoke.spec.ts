import { test, expect, type Browser, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The Auth emulator path of the login function accepts this code for every number.
const FAKE_CODE = '123456';
const RECEIPT = fileURLToPath(new URL('./fixtures/receipt.jpg', import.meta.url));
const SHOTS = fileURLToPath(new URL('./screenshots/', import.meta.url));

/** A phone-sized browser at deviceScaleFactor 1 (screenshots are reviewed at real pixel size). */
async function phone(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'en-US' });
  await ctx.addInitScript(() => localStorage.setItem('lang', 'en')); // skip the first-run language chooser
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[browser]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  return page;
}

async function login(page: Page, local: string, name: string) {
  await page.goto('/');
  await page.getByLabel('Mobile number').fill(local);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code', { exact: true }).fill(FAKE_CODE);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible({ timeout: 20_000 }); // first callable can be a cold start
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
}

/** The notifications tab in the bottom nav, which carries the unread count. */
const bell = (page: Page) => page.getByRole('navigation', { name: 'Main' }).locator('a[href="/notifications"]');

/** The page must never scroll sideways on a phone. */
async function noSideScroll(page: Page, where: string) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, `${where} is wider than the screen`).toBeLessThanOrEqual(0);
}

async function pickTeam(page: Page, team: string) {
  await page.getByRole('button', { name: 'Switch team' }).first().click();
  await page.getByRole('option', { name: team }).click();
}

test('team lifecycle: create, join, approve, assign, claim, reimburse, export, appearance', async ({ browser }) => {
  const alice = await phone(browser);
  const bob = await phone(browser);
  const TEAM = 'Tana Crew';

  // Alice signs up and creates a team; the invite code is shown.
  await login(alice, '012 345 6789', 'Alice');
  await alice.getByRole('button', { name: 'Switch team' }).click();
  await alice.getByRole('link', { name: 'Create or join a team' }).click();
  await alice.getByLabel('Team name').fill(TEAM);
  await alice.getByRole('button', { name: 'Create' }).click();
  const codeEl = alice.locator('p.ok strong');
  await expect(codeEl).toHaveText(/^[A-Z0-9-]{6,}$/, { timeout: 20_000 });
  const code = (await codeEl.textContent())!.trim();

  // Bob signs up and asks to join with the code.
  await login(bob, '013 222 3333', 'Bob');
  await bob.getByRole('button', { name: 'Switch team' }).click();
  await bob.getByRole('link', { name: 'Create or join a team' }).click();
  await bob.getByLabel('Invite code').fill(code);
  await bob.getByRole('button', { name: 'Join' }).click();
  await expect(bob.getByText('Request sent. Waiting for an admin to approve.')).toBeVisible({ timeout: 20_000 });

  // Alice approves Bob from Settings → Members.
  await alice.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
  await alice.getByRole('link', { name: 'Members' }).click();
  await expect(alice.getByText('Pending approval')).toBeVisible({ timeout: 20_000 });
  await alice.getByRole('button', { name: 'Approve' }).click();
  await expect(alice.getByRole('listitem').filter({ hasText: 'Bob' }).getByLabel('Role')).toBeVisible();
  const teamId = alice.url().match(/\/team\/([^/]+)\/members/)![1];

  // Bob is told he joined; he reads it so the bell starts from zero.
  await bob.goto('/');
  await expect(bell(bob)).toHaveAccessibleName('Notifications (1 unread)', { timeout: 20_000 });
  await bell(bob).click();
  await bob.getByRole('button', { name: 'Mark all read' }).click();
  await expect(bob.getByRole('button', { name: 'Mark all read' })).toHaveCount(0);
  await bob.screenshot({ path: `${SHOTS}notifications.png`, fullPage: true });
  await bob.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Calendar' }).click();
  await expect(bell(bob)).toHaveAccessibleName('Notifications');

  // Alice creates an event in the team calendar assigned to Bob.
  await alice.goto('/');
  await alice.getByRole('button', { name: 'Add event' }).click();
  const editor = alice.getByRole('dialog', { name: 'Add event' });
  await expect(editor.getByRole('combobox')).toHaveValue(teamId);
  await editor.getByLabel('Title', { exact: true }).fill('Stage setup');
  await editor.getByLabel('Start', { exact: true }).fill('09:00');
  await editor.getByLabel('End', { exact: true }).fill('12:00');
  await editor.getByRole('checkbox', { name: 'Bob' }).check();
  await alice.screenshot({ path: `${SHOTS}event-editor.png` });
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor).toHaveCount(0);
  await expect(alice.getByText('Stage setup')).toBeVisible();
  await alice.screenshot({ path: `${SHOTS}calendar.png`, fullPage: true });

  // Bob's bell shows the in-app notification written by the trigger (real push cannot be delivered here).
  await expect(bell(bob)).toHaveAccessibleName('Notifications (1 unread)', { timeout: 20_000 });
  await expect(bell(bob)).toContainText('1');

  // Bob submits a claim with a receipt photo.
  await pickTeam(bob, TEAM);
  await bob.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Invoices' }).click();
  await bob.getByRole('button', { name: 'New' }).click();
  const sheet = bob.getByRole('dialog', { name: 'New' });
  await sheet.getByLabel('Amount (RM)').fill('12.50');
  await sheet.getByLabel('Vendor').fill('Kedai Makan');
  await sheet.locator('label', { hasText: 'Choose from album' }).locator('input[type=file]').setInputFiles(RECEIPT);
  await expect(sheet.locator('img.photo-preview')).toBeVisible();
  await bob.screenshot({ path: `${SHOTS}invoice-editor.png` });
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toHaveCount(0, { timeout: 30_000 });
  const bobRow = bob.locator('a.inv-row', { hasText: 'Kedai Makan' });
  await expect(bobRow).toContainText('Pending');

  // Alice marks it reimbursed.
  await alice.goto(`/team/${teamId}/invoices`);
  await alice.locator('a.inv-row', { hasText: 'Kedai Makan' }).click();
  await expect(alice.getByRole('img', { name: 'Photo' })).toBeVisible({ timeout: 20_000 });
  await alice.screenshot({ path: `${SHOTS}invoice-detail.png`, fullPage: true });
  await alice.getByRole('button', { name: 'Mark reimbursed' }).click();
  await expect(alice.locator('.pill.reimbursed')).toHaveText('Reimbursed');

  // Bob sees the new status.
  await expect(bobRow).toContainText('Reimbursed', { timeout: 20_000 });

  // Screenshots of the invoices list (finance view and member view) and the members page.
  await alice.goto(`/team/${teamId}/invoices`);
  await expect(alice.getByTestId('inv-summary')).toContainText('1 item ·');
  await alice.screenshot({ path: `${SHOTS}invoices-admin.png`, fullPage: true });
  await alice.getByRole('button', { name: 'Date' }).click();
  await alice.screenshot({ path: `${SHOTS}invoices-admin-dates.png`, fullPage: true });
  await noSideScroll(alice, 'invoices with the date range open');
  await bob.screenshot({ path: `${SHOTS}invoices-member.png`, fullPage: true });
  await alice.goto(`/team/${teamId}/members`);
  await expect(alice.getByRole('button', { name: 'Copy code' })).toBeVisible();
  await expect(alice.locator('.invite-code')).toHaveText(/^[A-Z0-9-]{6,}$/, { timeout: 20_000 });
  await alice.screenshot({ path: `${SHOTS}members-admin.png`, fullPage: true });
  await alice.goto(`/team/${teamId}/invoices/categories`);
  await expect(alice.getByLabel('Add category')).toBeVisible();
  await alice.screenshot({ path: `${SHOTS}categories.png`, fullPage: true });
  await alice.goto('/settings/account');
  await expect(alice.getByRole('heading').first()).toBeVisible();
  await alice.screenshot({ path: `${SHOTS}account.png`, fullPage: true });
  await alice.goto('/teams/new');
  await expect(alice.getByLabel('Team name')).toBeVisible();
  await alice.screenshot({ path: `${SHOTS}create-join.png`, fullPage: true });
  await alice.goto(`/team/${teamId}/members`);
  await noSideScroll(alice, 'members');

  // Export opened from Invoices pre-selects invoices, and Back returns to Invoices.
  await alice.goto(`/team/${teamId}/invoices`);
  await alice.getByRole('link', { name: 'Export' }).click();
  await expect(alice.getByRole('radio', { name: 'Invoices' })).toBeChecked();
  await alice.screenshot({ path: `${SHOTS}export.png`, fullPage: true });
  await noSideScroll(alice, 'export');
  await alice.getByRole('link', { name: 'Back' }).click();
  await expect(alice).toHaveURL(new RegExp(`/team/${teamId}/invoices$`));
  await alice.getByRole('link', { name: 'Export' }).click();
  const [download] = await Promise.all([
    alice.waitForEvent('download'),
    alice.getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  await expect(alice.getByRole('status').filter({ hasText: 'File saved' })).toBeVisible();
  await alice.getByRole('status').getByRole('button', { name: 'Close' }).click();

  // Alice switches to Melayu and OLED Black (dark mode), then screenshots for review.
  await alice.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
  await alice.getByRole('button', { name: /Language/ }).click();
  await alice.screenshot({ path: `${SHOTS}language-sheet.png` });
  await alice.getByRole('radio', { name: 'Melayu' }).click();
  await expect(alice.getByRole('heading', { name: 'Tetapan', exact: true })).toBeVisible();
  await alice.getByRole('link', { name: /Paparan/ }).click();
  await expect(alice.getByRole('heading', { name: 'Paparan', exact: true })).toBeVisible();
  await alice.getByRole('button', { name: 'Gelap' }).click();
  await alice.getByRole('button', { name: 'OLED Black' }).click();
  await expect(alice.getByRole('button', { name: 'OLED Black' })).toHaveAttribute('aria-pressed', 'true');
  await expect(alice.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  // The fixed bottom nav would sit across a full-page/element capture, so it is hidden for the shots.
  const noNav = '.bottom-nav, .nav-spacer { display: none !important; }';
  await alice.screenshot({ path: `${SHOTS}appearance-page-ms-oled.png`, fullPage: true, style: noNav });
  await alice.locator('section.appearance').screenshot({ path: `${SHOTS}appearance-ms-oled-390.png`, style: noNav });
  await alice.getByRole('link', { name: 'Tetapan' }).first().click();
  await alice.screenshot({ path: `${SHOTS}settings-ms-oled.png`, fullPage: true, style: noNav });
});
