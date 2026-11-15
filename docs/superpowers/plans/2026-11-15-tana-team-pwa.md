# Tana Team PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A trilingual team calendar + invoice/claim PWA on Firebase with phone login, multi-team roles, push notifications, and Excel/PDF export.

**Architecture:** React + Vite PWA (custom service worker via `vite-plugin-pwa` injectManifest) talks directly to Firestore and Storage, guarded by security rules that check `teams/{teamId}/members/{uid}`. Cloud Functions (region `asia-southeast1`) handle login (Twilio Verify → custom token), team membership changes that need secrecy (invite codes, phone invites), notification fan-out (in-app doc + Web Push via VAPID), and the 15-minute tomorrow-digest schedule. Pure logic lives in `shared/` and is imported by both the app and functions.

**Tech Stack:** TypeScript, React 19, react-router 8, Vite 8, vite-plugin-pwa 2 (injectManifest), Firebase JS SDK 13, firebase-admin 14, firebase-functions 7, exceljs, jspdf, web-push, Vitest 5 (+ Firebase emulators for rules/functions), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-15-tana-team-pwa-design.md`

**Reference repos (read-only, cloned at):**
- Church app: `/home/user/bryanwoo988/church-attendance-` — copy login, OTP, i18n, test setup, emulator config patterns from here
- CompareCast: `/home/user/bryanwoo988/CompareCast` — copy service-worker push handling (`sw.js` push / notificationclick) from here

## Global Constraints

- Languages: `zh` (华语), `en` (English), `ms` (Bahasa Melayu). Every message key exists in all three dictionaries. First open picks from `navigator.language` (`zh*`→zh, `ms*`/`id*`→ms, else en).
- Theme names (Classic, Paper, Mint, Lavender, Midnight, OLED Black, Slate, Grape) are shown in English in all languages.
- Appearance: mode `system | light | dark` (default `system`); light theme default `paper`; dark theme default `midnight`; stored in `localStorage` key `appearance`, never in Firestore.
- Body text contrast ≥ 4.5:1 against background and card in all 8 themes.
- All dates/times are Malaysia time `Asia/Kuala_Lumpur`; dates stored as `YYYY-MM-DD` strings, times as `HH:MM` strings.
- Money stored as integer sen (`amountSen`), displayed `RM 1,250.00`.
- Phone numbers: Malaysian mobiles only, normalized with `normalizeMyPhone` to E.164 `+60…` before any compare or store.
- OTP: max **5** code requests per phone per KL day (constant `OTP_PER_PHONE_PER_DAY = 5` in functions, not admin-editable); App Check enforced outside emulators; emulator fake code `123456`.
- Invite code format: `TANA-` + 4 chars from alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no 0/O/1/I/L).
- Photo compression: longest side 1600px, JPEG quality 0.8, target ≤ 500 KB.
- Default tomorrow-digest time `20:00`; digest is not sent when the person has no work tomorrow.
- Notification kinds 2 (`assigned`) and 3 (`changed`) cannot be turned off.
- Region `asia-southeast1` for functions; Firebase project id in tests `demo-tana`.
- No chat, no OCR, no recurrence rules, no public share links, no multi-step approval.

## Review Focus

1. **Phone typed differently by admin and by worker** (`012-345 6789` vs `+60123456789`) — the pre-added invite must still attach on first login. Test in Task 5.
2. **Removed or pending member** — must stop receiving team notifications and lose read access immediately, including stale push subscriptions and the `users/{uid}/teams` index. Tests in Tasks 6, 7, 11.
3. **Digest timing** — a reminder time of `23:50`, a cron run that fires twice in one window, and an all-day event must each produce exactly one correct digest. Tests in Task 11.
4. **Unusual photos** (very large, portrait EXIF, decode failure such as HEIC on a non-Safari browser) — must compress or show a clear error, never upload silently-broken or hang. Tests in Task 13.
5. **Last admin** — the only admin demoting themself, leaving, or being removed must be refused by rules/functions, not just hidden in UI. Tests in Tasks 6, 7.

---

## File Structure

```
package.json, vite.config.ts, tsconfig.json, index.html, firebase.json,
firestore.rules, firestore.indexes.json, storage.rules, playwright.config.ts
public/icons/                       PWA icons
shared/                             pure logic, imported by app + functions
  types.ts        data shapes (below)
  phone.ts        normalizeMyPhone (copied)
  dates.ts        KL date/time helpers
  money.ts        sen parse/format
  inviteCode.ts   generate/normalize invite codes
  access.ts       role checks mirrored from rules (UI only)
  copyDates.ts    build copies of an event for many dates
  digest.ts       due-window + digest text
  notifyText.ts   notification title/body per kind per language
  export.ts       rows for Excel/PDF (calendar, invoices)
src/
  main.tsx, App.tsx, routes.tsx, firebase.ts, api.ts, sw.ts, app.css
  i18n/           index.ts, zh.ts, en.ts, ms.ts, LanguagePicker.tsx
  theme/          themes.ts, appearance.ts, AppearanceSettings.tsx
  auth/           AuthProvider.tsx, LoginPage.tsx, ProfileSetup.tsx, authErrors.ts
  team/           TeamContext.tsx, TeamSwitcher.tsx, CreateJoinPage.tsx, MembersPage.tsx
  calendar/       CalendarPage.tsx, MonthView.tsx, DayList.tsx, EventEditor.tsx, CopyDatesSheet.tsx, data.ts
  notify/         push.ts, Bell.tsx, NotificationsPage.tsx, PushBanner.tsx, NotifySettings.tsx
  invoice/        compress.ts, InvoicesPage.tsx, InvoiceEditor.tsx, InvoiceDetail.tsx, CategoriesPage.tsx, data.ts
  export/         ExportPage.tsx, xlsx.ts, pdf.ts, share.ts
  settings/       SettingsPage.tsx, ChangePhone.tsx
  ui/             (copy toast, confirm, AsyncButton from church app)
functions/src/
  index.ts, lib/admin.ts, lib/auth.ts, lib/otp.ts
  login.ts        requestLoginCode, verifyLoginCode, phone change
  teams.ts        createTeam, joinTeam, resetInviteCode, addMemberByPhone, cancelPhoneInvite, claimPhoneInvites
  notify.ts       notifyUsers (in-app + push)
  triggers.ts     Firestore triggers → notifyUsers; invoice delete cleanup; team index
  digest.ts       scheduled tomorrow digest
rules-test/       firestore.rules.test.ts, storage.rules.test.ts
functions/test/   login.test.ts, teams.test.ts, notify.test.ts, digest.test.ts
e2e/smoke.spec.ts
docs/SETUP.md
```

### Data shapes (`shared/types.ts`, Task 2)

```ts
export type Lang = 'zh' | 'en' | 'ms';
export type Role = 'admin' | 'finance' | 'member';
export type MemberStatus = 'pending' | 'active';
export type NotifyKind = 'digest' | 'assigned' | 'changed' | 'companyInvoice'
  | 'claimSubmitted' | 'claimDone' | 'joinRequest' | 'joined';
export const MANDATORY_KINDS: NotifyKind[] = ['assigned', 'changed'];

export interface UserDoc { name: string; phone: string; lang: Lang;
  notify: Partial<Record<NotifyKind, boolean>>; digestTime: string /* HH:MM */; createdAt: Timestamp }
export interface TeamDoc { name: string; createdBy: string; categories: string[]; createdAt: Timestamp }
export interface MemberDoc { uid: string; name: string; role: Role; status: MemberStatus; joinedAt: Timestamp }
export interface UserTeamDoc { teamId: string; name: string; role: Role; status: MemberStatus } // users/{uid}/teams/{teamId}, written by functions only
export interface EventDoc { title: string; date: string; allDay: boolean; start?: string; end?: string;
  assignees: string[]; place: string; notes: string; createdBy: string; updatedAt: Timestamp }
export type InvoiceKind = 'company' | 'claim';
export type ClaimStatus = 'pending' | 'reimbursed' | 'rejected';
export interface InvoiceDoc { kind: InvoiceKind; amountSen: number; date: string; vendor: string;
  category: string; notes: string; photoPath: string; uploadedBy: string; uploaderName: string;
  relatedUids: string[]; eventId?: string;
  status?: ClaimStatus; paidDate?: string; rejectReason?: string; createdAt: Timestamp; updatedAt: Timestamp }
export interface PhoneInviteDoc { teamId: string; teamName: string; phone: string; name: string; role: Role; createdBy: string; createdAt: Timestamp }
export interface NotificationDoc { kind: NotifyKind; teamId?: string; refId?: string;
  title: string; body: string; url: string; read: boolean; createdAt: Timestamp }
export interface PushSubDoc { endpoint: string; keys: { p256dh: string; auth: string }; ua: string; createdAt: Timestamp }
export const DEFAULT_CATEGORIES = ['农药 Pesticide', '肥料 Fertilizer', '燃油 Fuel', '零件 Parts', '工资 Wages', '其他 Other'];
```

Firestore paths exactly as spec §7.1; phone invites at `phoneInvites/{teamId}_{e164}`; OTP rate limits at `rateLimits/otp_{hash}`; digest dedupe at `digestSent/{uid}_{date}`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `firebase.json`, `firestore.indexes.json`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/sw.ts`, `src/test-setup.ts`, `src/App.test.tsx`, `functions/package.json`, `functions/tsconfig.json`, `functions/src/index.ts`, `functions/src/lib/admin.ts`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`

**Interfaces:**
- Produces: `npm test` (unit), `npm run test:rules`, `npm run test:functions`, `npm run build`, `npm run e2e`, scripts identical in shape to church app but project `demo-tana`; `db`, `FieldValue`, `IS_EMULATOR`, `REGION` exported from `functions/src/lib/admin.ts`.

- [ ] **Step 1:** Copy `package.json`, `vite.config.ts`, `tsconfig.json`, `firebase.json`, `functions/package.json`, `functions/tsconfig.json`, `src/test-setup.ts`, `functions/src/lib/admin.ts` from the church app; rename to `tana-team` / `demo-tana`; add deps `jspdf`, and `web-push` + `@types/web-push` in functions; drop `qr-scanner`, `qrcode`. Add `storage` block to `firebase.json` (`"rules": "storage.rules"`) and emulator `storage: { port: 9199 }`; add `storage` to the emulator `--only` lists in scripts.
- [ ] **Step 2:** Configure `VitePWA` with `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'`, manifest name `Tana Team`, short_name `Tana Team`, theme_color `#a0582b`. `src/sw.ts` only calls `precacheAndRoute(self.__WB_MANIFEST)` for now (push added in Task 12).
- [ ] **Step 3:** Write `src/App.test.tsx`: renders `<App />` and expects an element with role `main`.
- [ ] **Step 4:** Run `npm install && npm test` — expected FAIL until App renders `<main>`; make `App` render `<main />`; rerun — PASS.
- [ ] **Step 5:** Run `npm run build` — expected: `dist/sw.js` and `dist/manifest.webmanifest` exist.
- [ ] **Step 6:** Commit `chore: scaffold Tana Team PWA`.

### Task 2: Shared pure logic

**Files:**
- Create: `shared/types.ts` (shapes above), `shared/phone.ts` + test (copy from church), `shared/dates.ts`, `shared/money.ts`, `shared/inviteCode.ts`, `shared/access.ts`, `shared/copyDates.ts`, each with `*.test.ts`

**Interfaces:**
- Produces:
  - `klDate(d: Date): string`, `klTime(d: Date): string`, `addDays(date: string, n: number): string`, `minutesOf(hhmm: string): number`
  - `parseRM(input: string): number | null` (sen), `formatRM(sen: number): string`
  - `newInviteCode(rand?: () => number): string`, `normalizeInviteCode(input: string): string | null`
  - `canEditEvent(m: MemberDoc | undefined, e: Pick<EventDoc,'assignees'>, uid: string): boolean`, `canSeeInvoice(m, inv, uid): boolean`, `canProcessClaims(m): boolean`, `canExportInvoices(m): boolean`, `isActive(m): boolean`
  - `copyEventToDates(e: EventDoc, dates: string[]): EventDoc[]`

- [ ] **Step 1: Write failing tests** (one file per module). Required assertions:

```ts
expect(klDate(new Date('2026-11-15T16:30:00Z'))).toBe('2026-11-16'); // KL is UTC+8
expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
expect(parseRM('1,250.5')).toBe(125050); expect(parseRM('abc')).toBeNull(); expect(parseRM('0')).toBeNull();
expect(formatRM(125050)).toBe('RM 1,250.50');
expect(newInviteCode(() => 0)).toBe('TANA-2222');
expect(newInviteCode()).toMatch(/^TANA-[2-9A-HJKMNP-Z]{4}$/);
expect(normalizeInviteCode(' tana-7k3p ')).toBe('TANA-7K3P'); expect(normalizeInviteCode('7k3p')).toBe('TANA-7K3P');
expect(normalizeInviteCode('TANA-7K3O')).toBeNull();
expect(normalizeMyPhone('012-345 6789')).toEqual({ ok: true, e164: '+60123456789' });
expect(normalizeMyPhone('+60123456789')).toEqual({ ok: true, e164: '+60123456789' });
// access
const admin = { role: 'admin', status: 'active' }, fin = { role: 'finance', status: 'active' },
      mem = { role: 'member', status: 'active' }, pend = { role: 'admin', status: 'pending' };
expect(canEditEvent(mem, { assignees: ['u1'] }, 'u1')).toBe(true);
expect(canEditEvent(mem, { assignees: ['u2'] }, 'u1')).toBe(false);
expect(canEditEvent(admin, { assignees: ['u2'] }, 'u1')).toBe(true);
expect(canEditEvent(pend, { assignees: ['u1'] }, 'u1')).toBe(false);
expect(canSeeInvoice(mem, { uploadedBy: 'u1', relatedUids: [] }, 'u1')).toBe(true);
expect(canSeeInvoice(mem, { uploadedBy: 'u2', relatedUids: ['u1'] }, 'u1')).toBe(true);
expect(canSeeInvoice(mem, { uploadedBy: 'u2', relatedUids: [] }, 'u1')).toBe(false);
expect(canSeeInvoice(fin, { uploadedBy: 'u2', relatedUids: [] }, 'u1')).toBe(true);
// copy
const copies = copyEventToDates(ev /* date '2026-11-15' */, ['2026-11-18', '2026-11-20', '2026-11-15']);
expect(copies.map(c => c.date)).toEqual(['2026-11-18', '2026-11-20']); // source date skipped, duplicates removed, sorted
expect(copies[0]).toMatchObject({ title: ev.title, start: ev.start, assignees: ev.assignees });
```

- [ ] **Step 2:** Run `npx vitest run --project unit shared` — FAIL (modules missing).
- [ ] **Step 3:** Implement each module. `klDate`/`klTime` use `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' })`. `copyEventToDates` caps at 60 dates (throws `Error('tooManyDates')` beyond).
- [ ] **Step 4:** Rerun — PASS.
- [ ] **Step 5:** Commit `feat: shared types and pure helpers`.

### Task 3: Trilingual i18n

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/zh.ts`, `src/i18n/en.ts`, `src/i18n/ms.ts`, `src/i18n/LanguagePicker.tsx`, `src/i18n/i18n.test.ts`

**Interfaces:**
- Produces: `t(key: MessageKey, vars?: Record<string, string | number>): string`, `useT()`, `getLang(): Lang`, `setLang(l: Lang): void`, `detectLang(navLang: string): Lang`, `<LanguagePicker />` (three buttons: 华语 / English / Melayu). `MessageKey = keyof typeof zh`. Later tasks add keys to all three files.

- [ ] **Step 1: Failing tests:**

```ts
expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
expect(Object.keys(ms).sort()).toEqual(Object.keys(zh).sort());
for (const d of [zh, en, ms]) for (const v of Object.values(d)) expect(v.trim()).not.toBe('');
expect(detectLang('zh-CN')).toBe('zh'); expect(detectLang('ms-MY')).toBe('ms');
expect(detectLang('id')).toBe('ms'); expect(detectLang('fr')).toBe('en');
setLang('ms'); expect(document.documentElement.lang).toBe('ms');
expect(t('greet', { name: 'Ali' })).toContain('Ali');
```

- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement by adapting church `src/i18n/index.ts` (localStorage key `lang`, `useSyncExternalStore`), defaulting to `detectLang(navigator.language)` when nothing stored; `{name}` placeholder interpolation. The key-parity test keeps guarding every later task.
- [ ] **Step 4:** Rerun — PASS.
- [ ] **Step 5:** Commit `feat: zh/en/ms i18n`.

### Task 4: Appearance (mode + 8 themes)

**Files:**
- Create: `src/theme/themes.ts`, `src/theme/appearance.ts`, `src/theme/AppearanceSettings.tsx`, `src/app.css`, tests `src/theme/themes.test.ts`, `src/theme/AppearanceSettings.test.tsx`
- Reference: `docs/superpowers/specs/assets/appearance-reference.jpg`

**Interfaces:**
- Produces: `THEMES: Record<ThemeId, ThemeTokens>` where `ThemeId = 'classic'|'paper'|'mint'|'lavender'|'midnight'|'oled'|'slate'|'grape'`, `ThemeTokens = { kind: 'light'|'dark'; label: string; bg; card; fg; muted; line; soft; accent; accentFg; accentSoft; team: string[6] }`; `getAppearance(): { mode; light; dark }`, `setAppearance(p: Partial<...>)`, `applyAppearance(prefersDark: boolean)` (writes CSS vars on `:root` and `<meta name="theme-color">`), `useAppearance()`.

- [ ] **Step 1: Failing tests:**

```ts
for (const [id, th] of Object.entries(THEMES)) {
  expect(contrast(th.fg, th.bg)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(th.fg, th.card)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(th.muted, th.card)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(th.accentFg, th.accent)).toBeGreaterThanOrEqual(4.5);
  expect(new Set(th.team).size).toBe(6);
  for (const c of th.team) expect(contrast(c, th.card)).toBeGreaterThanOrEqual(3); // team dots visible
}
expect(Object.values(THEMES).filter(t => t.kind === 'light').map(t => t.label)).toEqual(['Classic','Paper','Mint','Lavender']);
expect(Object.values(THEMES).filter(t => t.kind === 'dark').map(t => t.label)).toEqual(['Midnight','OLED Black','Slate','Grape']);
expect(THEMES.oled.bg).toBe('#000000');
localStorage.clear(); expect(getAppearance()).toEqual({ mode: 'system', light: 'paper', dark: 'midnight' });
// AppearanceSettings: clicking "Dark" then "Slate" stores {mode:'dark', dark:'slate'}; selected swatch has aria-pressed=true; corrupt localStorage JSON falls back to defaults
```

- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. `contrast()` is WCAG relative luminance (export from `themes.ts`). Colors follow spec §6.8 hues (Paper: cream bg + `#a0582b`-ish accent; Midnight/OLED: gold accent; Slate: light blue; Grape: lilac); tune until tests pass. `AppearanceSettings` layout matches the reference image: segmented control, help text, two rows of four swatches with labels. Wrap all `localStorage` access in try/catch. Listen to `matchMedia('(prefers-color-scheme: dark)')` changes when mode is `system`.
- [ ] **Step 4:** Rerun — PASS.
- [ ] **Step 5:** Commit `feat: appearance with 4 light and 4 dark themes`.

### Task 5: Login functions + phone invite claim

**Files:**
- Create: `functions/src/lib/otp.ts`, `functions/src/lib/auth.ts`, `functions/src/login.ts`, `functions/test/login.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `normalizeMyPhone`, `klDate` (Task 2).
- Produces (callables): `requestLoginCode({phone}) → {sent:true}`, `verifyLoginCode({phone, code}) → {uid, token}`, `requestPhoneChangeCode({phone})`, `confirmPhoneChange({phone, code}) → {phone}`; internal `claimPhoneInvites(uid: string, e164: string): Promise<number>` — create it in `functions/src/teams.ts` in this task with full behavior (Task 6 adds the callables to the same file).

- [ ] **Step 1: Failing tests** (emulator, `FAKE_CODE`):

```ts
await call('requestLoginCode', { phone: '012-345 6789' });           // ok
for (let i = 0; i < 4; i++) await call('requestLoginCode', { phone: '0123456789' });
await expect(call('requestLoginCode', { phone: '0123456789' })).rejects.toMatchObject({ message: 'login.tooMany' }); // 6th today
await expect(call('requestLoginCode', { phone: '0312345678' })).rejects.toMatchObject({ message: 'login.invalidPhone' }); // landline
await expect(call('verifyLoginCode', { phone: '0129999999', code: '000000' })).rejects.toBeTruthy();
const { uid } = await call('verifyLoginCode', { phone: '+60129999999', code: '123456' });
// phone invite typed differently attaches on first login:
await db.doc('phoneInvites/t1_+60121112222').set({ teamId: 't1', teamName: 'East', phone: '+60121112222', name: 'Amin', role: 'member', ... });
const r = await call('verifyLoginCode', { phone: '012-111 2222', code: '123456' });
expect((await db.doc(`teams/t1/members/${r.uid}`).get()).data()).toMatchObject({ role: 'member', status: 'active', name: 'Amin' });
expect((await db.doc('phoneInvites/t1_+60121112222').get()).exists).toBe(false);
```

- [ ] **Step 2:** Run `npm run test:functions` — FAIL.
- [ ] **Step 3:** Port church `functions/src/lib/otp.ts` and `functions/src/otp.ts`, replacing the settings-doc limit with constant `OTP_PER_PHONE_PER_DAY = 5`, dropping church-specific `applyMyPhone`/merge logic. `verifyLoginCode` calls `claimPhoneInvites` every login (idempotent; also covers invites added after first login). `claimPhoneInvites` queries `phoneInvites where phone == e164`, and in one batch per invite writes the member doc (status `active`, name from invite unless user doc has a name) and deletes the invite.
- [ ] **Step 4:** Rerun — PASS.
- [ ] **Step 5:** Commit `feat: phone login via Twilio Verify with phone-invite claim`.

### Task 6: Team functions + team index trigger

**Files:**
- Create: `functions/src/teams.ts`, `functions/test/teams.test.ts`
- Create: `functions/src/triggers.ts` (team-index part)

**Interfaces:**
- Consumes: `newInviteCode`, `normalizeInviteCode`, `normalizeMyPhone`.
- Produces (callables, all require auth + user doc):
  - `createTeam({name}) → {teamId, code}` — creates team (categories `DEFAULT_CATEGORIES`), member doc admin/active, `inviteCodes/{code}`; retries code on collision (max 5).
  - `joinTeam({code}) → {teamId, status:'pending'|'active'}` — unknown code → `HttpsError('not-found','team.badCode')`; already member → returns current status, no change.
  - `resetInviteCode({teamId}) → {code}` — admin only; deletes old code doc.
  - `getInviteCode({teamId}) → {code}` — admin only.
  - `addMemberByPhone({teamId, phone, name, role}) → {status:'added'|'invited'}` — admin only; registered number → member active immediately; else writes `phoneInvites/{teamId}_{e164}`.
  - `cancelPhoneInvite({teamId, phone})` — admin only.
  - `leaveTeam({teamId})` — refuses `team.lastAdmin` if caller is the only active admin.
  - Trigger `onMemberWrite` on `teams/{teamId}/members/{uid}`: mirrors to `users/{uid}/teams/{teamId}` (delete on member delete); on create with `pending` → emits `joinRequest`; on `pending→active` or create-as-active by someone else → emits `joined` (via `notifyUsers`, Task 11; until then call a no-op import).

- [ ] **Step 1: Failing tests:**

```ts
const { teamId, code } = await as(alice).call('createTeam', { name: 'East Farm' });
expect(code).toMatch(/^TANA-/);
expect(await as(bob).call('joinTeam', { code: code.toLowerCase().replace('tana-', '') })).toEqual({ teamId, status: 'pending' });
await expect(as(bob).call('joinTeam', { code: 'TANA-ZZZZ' })).rejects.toMatchObject({ message: 'team.badCode' });
await expect(as(bob).call('resetInviteCode', { teamId })).rejects.toMatchObject({ code: 'permission-denied' });
const { code: code2 } = await as(alice).call('resetInviteCode', { teamId });
await expect(as(carol).call('joinTeam', { code })).rejects.toMatchObject({ message: 'team.badCode' }); // old code dead
expect(await as(alice).call('addMemberByPhone', { teamId, phone: carolPhone, name: 'C', role: 'finance' })).toEqual({ status: 'added' });
expect(await as(alice).call('addMemberByPhone', { teamId, phone: '0127770000', name: 'D', role: 'member' })).toEqual({ status: 'invited' });
await expect(as(alice).call('leaveTeam', { teamId })).rejects.toMatchObject({ message: 'team.lastAdmin' });
await waitFor(() => db.doc(`users/${bob.uid}/teams/${teamId}`).get()).toMatchObject({ status: 'pending', name: 'East Farm' });
await db.doc(`teams/${teamId}/members/${bob.uid}`).delete();
await waitFor(async () => (await db.doc(`users/${bob.uid}/teams/${teamId}`).get()).exists).toBe(false);
```

- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. Team name 1–60 chars trimmed; member name 1–80.
- [ ] **Step 4:** Rerun — PASS.
- [ ] **Step 5:** Commit `feat: team, invite code and phone-invite functions`.

### Task 7: Firestore + Storage security rules

**Files:**
- Create: `firestore.rules`, `storage.rules`, `rules-test/firestore.rules.test.ts`, `rules-test/storage.rules.test.ts`

**Interfaces:**
- Consumes: paths and shapes from `shared/types.ts`.
- Produces: rules enforcing spec §5 and §6.4. Rule helpers: `member(teamId)`, `isActive(teamId)`, `role(teamId)`, `isAdmin(teamId)`, `isFinance(teamId)` (admin or finance).

Required behavior (each line is at least one test, using `@firebase/rules-unit-testing`):
- `users/{uid}`: read/write own; write limited to `name, lang, notify, digestTime` and `notify.assigned`/`notify.changed` cannot be set `false`. Subcollections `events`, `pushSubs`: own only. `notifications`: own read; own update only `read`; no create/delete from client. `teams` index: own read only, no client write.
- `teams/{t}`: read active members; update `categories`/`name` admin only; no client create/delete.
- `members`: read active members of same team (pending reads own doc only); admin may update `role`/`status` of others and delete others; **nobody may change/delete a doc if it would leave zero active admins** (enforce by: admin cannot update/delete own member doc; the last-admin case for others is impossible because only admins act and they can't touch themselves); member cannot raise own role; no client create.
- `events`: read active; create if active and (`isAdmin` or `assignees == [request.auth.uid]`); update/delete if `isAdmin` or caller in `resource.data.assignees` and (non-admin) `assignees` unchanged; field validation (title 1–120, date `YYYY-MM-DD` string, assignees list ≤ 20 of strings).
- `invoices`: read if `isFinance` or `uploadedBy == uid` or `uid in relatedUids`; create `claim` by any active member with `uploadedBy == uid`, `status == 'pending'`, `relatedUids == []`; create `company` only `isFinance`, no `status`; `amountSen` int 1..100000000; claim owner may update fields (not `status` except `rejected→pending` resubmit) while `pending`/`rejected`; `isFinance` may set `status` to `reimbursed` (with optional `paidDate`) or `rejected` (with non-empty `rejectReason` ≤ 300); delete: owner when `pending|rejected`, or `isFinance`.
- `inviteCodes`, `phoneInvites` (writes), `rateLimits`, `digestSent`: no client access; `phoneInvites` readable by admin of its `teamId`.
- Storage `teams/{t}/invoices/{invoiceId}/{file}`: read if the Firestore invoice is readable by the same logic (use `firestore.get`); write if caller is active member of `t`, `contentType == 'image/jpeg'`, size < 2 MB; delete never from client (function cleans up).

Explicit cross-team and stale-member tests: user active in team A cannot read any doc in team B; user whose member doc was deleted cannot read team events; pending member cannot read events or invoices; admin cannot demote or delete self.

- [ ] **Step 1:** Write tests above — run `npm run test:rules` — FAIL.
- [ ] **Step 2:** Implement rules.
- [ ] **Step 3:** Rerun — PASS.
- [ ] **Step 4:** Commit `feat: firestore and storage rules`.

### Task 8: App shell, auth, login page

**Files:**
- Create: `src/firebase.ts`, `src/api.ts`, `src/routes.tsx`, `src/auth/AuthProvider.tsx`, `src/auth/LoginPage.tsx`, `src/auth/ProfileSetup.tsx`, `src/auth/authErrors.ts`, `src/ui/*` (copy toast, confirm, ConfirmHost, Toaster, AsyncButton from church), tests `src/auth/LoginPage.test.tsx`, `src/auth/AuthProvider.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: callables from Task 5; `t`, `LanguagePicker`; appearance.
- Produces: `useAuth(): { user: User | null; profile: UserDoc | null; loading: boolean }`; `api.ts` exports typed callable wrappers `requestLoginCode, verifyLoginCode, createTeam, joinTeam, resetInviteCode, getInviteCode, addMemberByPhone, cancelPhoneInvite, leaveTeam, requestPhoneChangeCode, confirmPhoneChange`; `db`, `storage`, `auth` from `firebase.ts` (persistent local cache as church; Storage emulator 9199).

- [ ] **Step 1: Failing tests:** LoginPage — enter `012 345 6789`, press send → `requestLoginCode` called with that string; code step shows; error `login.tooMany` shows translated text; language picker switches visible text to Melayu; page applies current theme vars. ProfileSetup shown when signed in without `users/{uid}`; saving writes `{name, phone, lang, notify:{}, digestTime:'20:00'}`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement, adapting church `LoginPage.tsx` layout (gradient header `.login`, two steps, error text) with Tana name/icon and three-language picker.
- [ ] **Step 4:** Rerun — PASS.
- [ ] **Step 5:** Commit `feat: login and profile setup`.

### Task 9: Teams UI

**Files:**
- Create: `src/team/TeamContext.tsx`, `src/team/TeamSwitcher.tsx`, `src/team/CreateJoinPage.tsx`, `src/team/MembersPage.tsx`, tests for each

**Interfaces:**
- Consumes: `users/{uid}/teams` index, Task 6 callables, `isActive`.
- Produces: `useTeams(): { teams: UserTeamDoc[]; current: string | 'personal'; setCurrent(id): void; member(teamId): MemberDoc | undefined }` (current saved in localStorage `team`).

- [ ] **Step 1: Failing tests:** switcher lists "Personal" + active teams, pending teams shown greyed with "等待批准"; create team shows code; join with bad code shows `team.badCode` text; MembersPage (admin) lists pending with Approve/Reject, active with role select and Remove, "not yet logged in" phone invites with Cancel; own row has no role select/remove; non-admin sees read-only list; add-by-phone form rejects invalid phone before calling.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. Approve = update member `status:'active'`; Reject/Remove = delete member doc (confirm dialog).
- [ ] **Step 4:** Rerun — PASS.
- [ ] **Step 5:** Commit `feat: team switcher, create/join, members admin`.

### Task 10: Calendar

**Files:**
- Create: `src/calendar/data.ts`, `CalendarPage.tsx`, `MonthView.tsx`, `DayList.tsx`, `EventEditor.tsx`, `CopyDatesSheet.tsx`, tests

**Interfaces:**
- Consumes: `canEditEvent`, `copyEventToDates`, `THEMES[..].team`.
- Produces: `listEvents(scope: {teamId} | 'personal', from: string, to: string)`, `saveEvent(scope, id | null, e)`, `deleteEvent(scope, id)`, `copyEvent(scope, e, dates)` (single `writeBatch`); overlay selection stored in localStorage `calLayers`.

- [ ] **Step 1: Failing tests:** month grid for Nov 2026 starts Monday-aligned with dots per layer color; toggling a layer hides its events; day list shows times and assignee names, all-day first; editor validates title required, end ≥ start; member editor's assignee picker is locked to self; admin can pick multiple; non-editable event opens read-only; copy sheet: select 3 dates → `copyEvent` called once with those dates; >60 dates shows error; delete asks confirm.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. Team colors: team index in user's team list → `team[i % 6]`; personal uses `accent`.
- [ ] **Step 4:** Rerun — PASS.
- [ ] **Step 5:** Commit `feat: shared and personal calendar with copy-to-dates`.

### Task 11: Notification backend

**Files:**
- Create: `shared/notifyText.ts` + test, `shared/digest.ts` + test, `functions/src/notify.ts`, `functions/src/digest.ts`, add to `functions/src/triggers.ts`, tests `functions/test/notify.test.ts`, `functions/test/digest.test.ts`

**Interfaces:**
- Produces:
  - `notifyText(kind: NotifyKind, lang: Lang, v: Record<string, string | number>): { title: string; body: string }`
  - `isDue(digestTime: string, nowKlMinutes: number): boolean` — true when `minutesOf(digestTime)` ∈ `(now-15, now]`, wrapping midnight
  - `digestBody(events: Pick<EventDoc,'title'|'start'|'allDay'|'place'>[], lang): string` — all-day first, then by start; max 5 lines + "+N"
  - `notifyUsers(uids: string[], n: { kind; teamId?; refId?; vars; url }, opts?: { exclude?: string }): Promise<void>` — for each uid: skip `exclude`; if `teamId`, skip unless member doc exists and `active`; skip if `notify[kind] === false` and kind not mandatory; write `users/{uid}/notifications` doc in the user's `lang`; send Web Push to every `pushSubs` doc via `web-push` (VAPID from secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, subject param `VAPID_SUBJECT`); delete sub on 404/410; other errors logged, not retried.
  - Triggers: `events` create → `assigned` to new assignees ≠ editor; update → `assigned` to added assignees, `changed` to remaining assignees when `date|start|end|allDay` changed; delete → `changed` (cancelled variant) to assignees. Batch copies: the client writes all copies with the same `batchId` field; the trigger groups by `batchId` using a `notifyBatches/{batchId}` doc (first trigger claims it in a transaction, waits 0 — sends one `assigned` with count = number of docs having that batchId queried at send time). Invoices: create `company` → admins + `relatedUids` (exclude uploader); create/resubmit `claim` → admins + finance (exclude uploader); status → `reimbursed|rejected` → uploader. Members: `joinRequest`, `joined` (Task 6 hook).
  - Scheduled `tomorrowDigest` every 15 minutes (`onSchedule('every 15 minutes', timeZone 'Asia/Kuala_Lumpur')`): for users with `isDue`, collect tomorrow's events where they are assignee across active teams (`collectionGroup('events') where assignees array-contains uid and date == tomorrow`) plus own personal events; none → skip; claim `digestSent/{uid}_{tomorrow}` with `create()` (fails if exists → skip); then `notifyUsers`.

- [ ] **Step 1: Failing tests:**

```ts
expect(isDue('20:00', 20 * 60)).toBe(true); expect(isDue('20:00', 20 * 60 + 15)).toBe(false);
expect(isDue('23:50', 0 * 60 + 5)).toBe(true);   // window wraps midnight
expect(isDue('00:00', 0)).toBe(true);
for (const l of ['zh','en','ms'] as const) for (const k of KINDS) expect(notifyText(k, l, sampleVars).title).not.toBe('');
// functions (emulator):
// assigning bob → bob gets 1 notification doc; editor alice gets none
// bob removed from team, then event assigned to bob → no notification
// bob sets notify.companyInvoice=false → no doc; bob sets notify.assigned=false (via admin) → still gets 'assigned'
// push endpoint returning 410 → pushSubs doc deleted (stub web-push sendNotification)
// copy to 4 dates → bob gets exactly 1 'assigned' with count 4
// digest: running tomorrowDigest twice at same time → 1 notification; user with no events tomorrow → 0; all-day event listed first
```

- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. Add `batchId?: string` to `EventDoc` in `shared/types.ts` and allow it in rules (Task 7 test updated).
- [ ] **Step 4:** Rerun unit + functions + rules — PASS.
- [ ] **Step 5:** Commit `feat: notifications fan-out, push and tomorrow digest`.

### Task 12: Notification frontend

**Files:**
- Modify: `src/sw.ts`
- Create: `src/notify/push.ts`, `Bell.tsx`, `NotificationsPage.tsx`, `PushBanner.tsx`, `NotifySettings.tsx`, tests

**Interfaces:**
- Produces: `pushState(): 'unsupported' | 'needs-home-screen' | 'denied' | 'off' | 'on'`, `enablePush(uid): Promise<void>` (subscribe with `VITE_VAPID_PUBLIC_KEY`, write `users/{uid}/pushSubs/{sha256(endpoint).slice(0,32)}`), `disablePush(uid)`.

- [ ] **Step 1: Failing tests:** iOS UA not standalone → `needs-home-screen`; Bell shows unread count (cap "9+"); tapping a notification marks read and navigates to `url`; "mark all read" updates all; PushBanner visible when user is assignee of any upcoming event or a team member and state ≠ `on`, with iPhone instructions when `needs-home-screen`; NotifySettings shows `assigned`/`changed` toggles disabled and checked, others toggle `notify.<kind>`, digest time input saves `digestTime`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. `sw.ts` push + notificationclick handlers adapted from CompareCast `sw.js` (always show a notification; tag per `refId`; click focuses existing client or opens `data.url`).
- [ ] **Step 4:** Rerun — PASS.
- [ ] **Step 5:** Commit `feat: push subscription, bell and notification settings`.

### Task 13: Invoices and claims

**Files:**
- Create: `src/invoice/compress.ts`, `data.ts`, `InvoicesPage.tsx`, `InvoiceEditor.tsx`, `InvoiceDetail.tsx`, `CategoriesPage.tsx`, tests; add invoice-delete cleanup trigger in `functions/src/triggers.ts` (+ functions test)

**Interfaces:**
- Consumes: `canSeeInvoice`, `canProcessClaims`, `parseRM`, `formatRM`.
- Produces: `compressImage(file: File): Promise<Blob>` (throws `Error('photo.unreadable')` on decode failure); `saveInvoice(teamId, id | null, data, photo?: Blob)` (uploads to `teams/{t}/invoices/{id}/{photoId}.jpg` then writes doc; on replace, the old photo is deleted by the trigger on `photoPath` change); `setClaimStatus(teamId, id, 'reimbursed' | 'rejected', extra)`; `listInvoices(teamId, filters, me)` (finance/admin: all; member: two queries `uploadedBy==uid` and `relatedUids array-contains uid`, merged).

- [ ] **Step 1: Failing tests:**

```ts
// compress (mock canvas/createImageBitmap)
const out = await compressImage(fakeImage(4000, 3000)); expect(dims(out)).toEqual([1600, 1200]); expect(out.type).toBe('image/jpeg');
await expect(compressImage(fakeUndecodable())).rejects.toThrow('photo.unreadable');
// when first pass > 500 KB, retries at lower quality (0.7, 0.6) and returns smallest
```
UI: member "new" defaults to claim, no company option; finance sees both types and "related people" picker; amount `abc` blocked; photo required; reject requires reason; rejected claim shows reason and "resubmit" for owner; filters by type/status/date; member list never shows company invoices they are not ticked on; editor offers optional "related work" picker listing this team's events ±30 days, saved as `eventId` (data-layer test with mocked queries). Functions: deleting invoice doc deletes its Storage photo; changing `photoPath` deletes old photo.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. `<input type="file" accept="image/*" capture="environment">` plus a second input without `capture` for album; use `createImageBitmap(file, { imageOrientation: 'from-image' })`. Upload shows progress; failure keeps form data.
- [ ] **Step 4:** Rerun — PASS.
- [ ] **Step 5:** Commit `feat: company invoices and staff claims with photos`.

### Task 14: Export and share

**Files:**
- Create: `shared/export.ts` + test, `src/export/xlsx.ts`, `src/export/pdf.ts`, `src/export/share.ts`, `src/export/ExportPage.tsx`, tests

**Interfaces:**
- Produces: `calendarRows(events, members, lang)`, `invoiceRows(invoices, lang) → { rows; totalSen }`; `buildCalendarXlsx`, `buildInvoiceXlsx` → `Blob`; `buildCalendarPdf`, `buildInvoicePdf(invoices, photoUrls, lang)` → `Blob` (summary table, then one receipt per page with image fitted, light colors always); `shareOrDownload(blob, filename)` uses `navigator.canShare({files})` → `navigator.share`, else `<a download>`.

- [ ] **Step 1: Failing tests:** `invoiceRows` totals sen correctly and labels status per language; calendar rows sorted by date then start; ExportPage hides invoice export for members; filename pattern `tana-<team>-<from>_<to>.xlsx`; share falls back to download when `canShare` false; a photo that fails to load produces a page saying the photo is unavailable rather than aborting the PDF.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement. PDF uses a CJK-capable font only if needed: embed `Noto Sans SC` subset is heavy — instead render text rows to canvas images per page **only when the language is `zh` or names contain CJK**; otherwise jsPDF built-in Helvetica. (Builder may choose a lighter approach if it keeps CJK text readable.)
- [ ] **Step 4:** Rerun — PASS.
- [ ] **Step 5:** Commit `feat: excel and pdf export with share`.

### Task 15: Settings, change phone, layout polish

**Files:**
- Create: `src/settings/SettingsPage.tsx`, `src/settings/ChangePhone.tsx`, tests
- Modify: `src/routes.tsx`, `src/App.tsx`

- [ ] **Step 1: Failing tests:** settings shows LanguagePicker, AppearanceSettings, NotifySettings, ChangePhone, Leave team (refuses with translated `team.lastAdmin`), Sign out; ChangePhone two-step flow mirrors church `ChangePhone.tsx`; bottom nav has Calendar / Invoices / Notifications (with badge) / Settings and hides Invoices when current scope is Personal.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Rerun — PASS.
- [ ] **Step 5:** Commit `feat: settings page and navigation`.

### Task 16: End-to-end smoke, setup docs

**Files:**
- Create: `e2e/smoke.spec.ts`, `playwright.config.ts`, `docs/SETUP.md`
- Modify: `README.md`

- [ ] **Step 1:** Write e2e (emulators, fake code): Alice logs in, creates team, gets code → Bob logs in, joins → Alice approves → Alice creates event assigned to Bob → Bob's bell shows 1 → Bob uploads a claim with a fixture JPEG → Alice marks reimbursed → Bob sees status → Alice exports Excel (download event fires) → switch language to Melayu and theme to OLED Black, screenshot at deviceScaleFactor 1 for review.
- [ ] **Step 2:** Run `npm run e2e -- --trace off` — FAIL until wiring complete; fix gaps; rerun — PASS.
- [ ] **Step 3:** Write `docs/SETUP.md` in Chinese following church `docs/SETUP.md`: new Firebase project, Blaze + USD 5 budget alert, Auth/Firestore/Storage (confirm free-tier bucket region before choosing), SMS region Malaysia only, new Twilio Verify Service `Tana Team` (SMS only, Geo Malaysia, low-balance alert — shared balance with church app), secrets `TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET`, param `TWILIO_VERIFY_SERVICE_SID`, VAPID keys via `npx web-push generate-vapid-keys` → secrets `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` + `VITE_VAPID_PUBLIC_KEY`, App Check reCAPTCHA Enterprise key, `npm run deploy`.
- [ ] **Step 4:** Run full suite: `npm test && npm run test:rules && npm run test:functions && npm run build` — all PASS.
- [ ] **Step 5:** Commit `docs: setup guide and e2e smoke`.
