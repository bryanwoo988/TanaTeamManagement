# Tana Team

**中文**：Tana Team 是给小团队（例如一个农场）用的手机网页 App（PWA）：共用的工作日历、员工报销与公司发票（带收据照片）、Excel / PDF 导出，以及 App 内通知和手机推送。用手机号码 + 短信验证码登录，支持华语 / English / Bahasa Melayu。

**English**: Tana Team is a mobile-first PWA for small teams (e.g. a farm): a shared work calendar, staff claims and company invoices with receipt photos, Excel / PDF export, and in-app plus push notifications. Sign-in is by Malaysian mobile number and SMS code; the UI speaks Chinese, English and Malay.

## 功能 Features

- 电话号码登录（Twilio Verify），一个人可加入多个团队，每个团队角色不同（管理员 / 财务 / 成员） — Phone sign-in; one person, many teams, a role per team
- 邀请码或电话号码加人，管理员批准加入申请 — Join by invite code or phone, with admin approval
- 团队日历 + 个人日历叠加显示，指派工作、复制到多个日期 — Team and personal calendars as layers; assignees; copy to dates
- 员工报销与公司发票，拍照上传、标记已报销 / 拒绝 — Claims and company invoices with photos; reimburse / reject
- 导出 Excel 与附照片的 PDF，可直接用手机分享 — Excel and photo PDF export via the share sheet
- App 内通知、Web Push、每日“明天的工作”摘要 — In-app notifications, Web Push, daily digest
- 离线缓存、8 款主题（浅色 / 深色，含 OLED Black） — Offline cache; 8 themes including OLED Black

## 技术 Tech stack

React 19 + Vite + TypeScript PWA (Workbox) · Firebase Auth / Firestore / Storage / Cloud Functions (Node 22, asia-southeast1) / Hosting · App Check (reCAPTCHA Enterprise) · Twilio Verify · Web Push (VAPID) · ExcelJS · jsPDF · Vitest · Playwright

## 开发与测试 Development & tests

```bash
npm install
npm run dev              # 本地开发 dev server (uses .env.local)
npm run emulators        # Firebase emulators (project demo-tana; SMS code is always 123456)

npm test                 # 单元测试 unit tests
npm run test:rules       # Firestore / Storage 规则测试 rules tests (needs Java)
npm run test:functions   # Cloud Functions 测试 functions tests (needs Java)
npm run build            # 类型检查 + 建置 typecheck + build
npm run e2e              # 端到端冒烟测试 e2e smoke (emulators + Chromium)
```

Behind an HTTP proxy, unset the proxy variables for emulator-based runs, e.g. `env -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy npm run e2e`. The e2e run saves review screenshots to `e2e/screenshots/`.

## 文档 Docs

- 上线设置指南 Setup guide (Chinese): [docs/SETUP.md](docs/SETUP.md)
- 设计文档 Design spec: [docs/superpowers/specs/2026-11-15-tana-team-pwa-design.md](docs/superpowers/specs/2026-11-15-tana-team-pwa-design.md)
