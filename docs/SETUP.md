# 上线设置指南（第一次部署）

这份指南带你从零开始，把 Tana Team 放到网上。全程大约 60 分钟。需要：一台装了 Node.js 22 的电脑、一个 Google 账号、一张信用卡（Firebase Blaze 方案用），以及教会 App 正在用的那个 Twilio 账号。

> Tana Team 是一个**全新的 Firebase 项目**，和教会签到 App 分开（资料、规则、费用都分开）。只有 Twilio 账号是两边共用的，见第 6 节的警告。

---

## 1. 开新的 Firebase 项目

1. 打开 <https://console.firebase.google.com>，用你的 Google 账号登录。
2. 按 **「建立项目」**，名字例如 `tana-team`。Google Analytics 可以关掉。
3. 建好后，记下 **项目 ID**（项目设定 → 一般，例如 `tana-team-1a2b3`）。下面用 `你的项目ID` 代表它。
4. 同一页还有 **项目编号**（一串数字，例如 `123456789012`），第 8 节会用到。

## 2. 升级到 Blaze 方案并设 USD 5 预算提醒（一定要做）

1. 左下角 **「Spark」** → **「升级」** → 选 **Blaze**，绑定信用卡。（Cloud Functions 和推送都需要 Blaze。）
2. 打开 <https://console.cloud.google.com/billing> → 选这个结算账号 → **预算和提醒** → **建立预算**：
   - 范围：只选 `你的项目ID`
   - 金额：**USD 5 / 月**
   - 提醒：50%、90%、100% 时发邮件
3. 预算提醒只会通知，**不会自动停止扣费**。收到邮件时请上来看看是什么用量。

## 3. 打开 Authentication、Firestore、Storage

### 3.1 Authentication

1. Firebase 控制台 → **Authentication** → **开始使用**。
   登录由我们自己的函数用 Twilio 验证码完成，再签发登录凭证（custom token），所以**不需要**启用任何「登录方式」。
2. Authentication → 设定 → **SMS 地区政策**（SMS region policy）→ 选 **允许**，只勾选 **Malaysia (MY)**。（我们不用 Firebase 发短信，但以防万一有人直接打 Firebase 的短信接口刷费用。）
3. Authentication → 设定 → **已授权网域**：部署后确认你的网址（例如 `你的项目ID.web.app`）在列表里（通常会自动加）。

### 3.2 Firestore 数据库

1. Firebase 控制台 → **Firestore Database** → **建立数据库**。
2. 位置选 **asia-southeast1 (Singapore)**（离马来西亚最近，之后不能改）。
3. 选 **正式版模式**（规则会由我们部署覆盖）。

### 3.3 Storage（发票照片）

1. **先确认免费额度的区域再选 bucket 位置。** Storage 每月有 5 GB 免费额度，但目前 Google 的说明是：只有 `US-CENTRAL1`、`US-EAST1`、`US-WEST1` 这几个美国区域的 bucket 享有免费额度。打开 <https://firebase.google.com/pricing> 和 <https://cloud.google.com/storage/pricing#cloud-storage-always-free> 看最新说明：
   - 如果免费额度仍只限美国区域 → 选 **US-CENTRAL1**（照片上传会慢一点点，但几个人用几乎不花钱）。
   - 如果亚洲区域也有免费额度 → 选 **asia-southeast1**。
2. Firebase 控制台 → **Storage** → **开始使用** → 正式版模式 → 选上面决定的位置。
3. 记下 bucket 名字（例如 `你的项目ID.firebasestorage.app`），第 9 节要填。

## 4. Firestore TTL 政策（自动删除过期资料）

函数会写一些只在短时间内有用的资料，每笔都有 `expiresAt` 时间。设定 TTL 后 Firestore 会自动删除，不占空间也不用写清理程序。

Firebase 控制台 → **Firestore Database** → **TTL**（存留时间）→ **建立政策**，建立以下 **三条**，时间戳栏位都填 `expiresAt`：

| 集合群组 | 用途 |
|---|---|
| `rateLimits` | 每个号码每天要验证码的次数（防刷） |
| `digestSent` | 每日摘要「今天已发过」的记录 |
| `notifyBatches` | 「复制到多个日期」只发一次通知的记录 |

会用指令的话，也可以：

```bash
gcloud firestore fields ttls update expiresAt --collection-group=rateLimits    --enable-ttl --project=你的项目ID
gcloud firestore fields ttls update expiresAt --collection-group=digestSent    --enable-ttl --project=你的项目ID
gcloud firestore fields ttls update expiresAt --collection-group=notifyBatches --enable-ttl --project=你的项目ID
```

TTL 政策建好后要几分钟才生效；删除本身也可能延迟最多一两天，这是正常的。

## 5. Storage CORS（PDF 导出要用，一定要做）

导出 PDF 时，网页会直接下载发票照片放进 PDF。浏览器默认不允许网页这样读取 Storage 的图片，所以要给 bucket 设 CORS，否则 PDF 里的照片会是空白。

1. 项目根目录已经有一个范例 `cors.json`，内容如下。用文字编辑器打开，把两处 `YOUR_PROJECT_ID` 换成 `你的项目ID`，储存：

```json
[
  {
    "origin": ["https://YOUR_PROJECT_ID.web.app", "https://YOUR_PROJECT_ID.firebaseapp.com"],
    "method": ["GET"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

   以后如果换了自订网域，把它也加进 `origin`，再执行一次下面的指令。

2. 安装并登录 Google Cloud CLI（<https://cloud.google.com/sdk/docs/install>）：`gcloud auth login`。
3. 套用到你的 bucket（用第 3.3 步记下的名字）：

```bash
gcloud storage buckets update gs://你的bucket名字 --cors-file=cors.json
# 或旧的 gsutil 指令（效果一样）：
gsutil cors set cors.json gs://你的bucket名字
```

4. 检查：`gcloud storage buckets describe gs://你的bucket名字 --format="default(cors_config)"`。

## 6. 验证码短信：新的 Twilio Verify Service

登录和换号码的验证码由 Twilio Verify 发送。用教会 App 的**同一个 Twilio 账号**，但**另外建一个 Verify Service**，这样两个 App 的短信内容、记录分开。

> ⚠️ **余额共用警告**：两个 App 用同一个 Twilio 账号的余额。**余额用完时，教会 App 和 Tana Team 会同时无法登录**（收不到验证码）。所以下面第 4 步的低余额提醒一定要设，而且要设到一个你常看的邮箱。

1. Twilio 后台 → **Verify** → **Services** → **Create new**：
   - 名称：**`Tana Team`**（这个名字会出现在短信里）
   - 渠道：**只开 SMS**（Email、WhatsApp、Voice 等都关掉）
   - Fraud Guard：Standard
2. 该 Service → **Geo permissions**：只允许 **Malaysia**，其他国家全部关掉。
3. 记下 Service SID（`VA…`），第 9 节要填进 `TWILIO_VERIFY_SERVICE_SID`。
4. Twilio 后台 → **Billing** → **Low balance alert**（低余额提醒）：开启，金额例如 **USD 10**，填你的邮箱。（如果教会 App 已经设过，确认金额够两个 App 用几天。）
5. API Key：可以沿用教会 App 的 API Key，或在 **Account → API keys & tokens** 建一个新的 **Standard** API Key，记下 SID（`SK…`）和 Secret（Secret 只显示一次）。

## 7. Web Push（VAPID 金钥）

推送通知需要一对 VAPID 金钥。在项目目录执行：

```bash
npx web-push generate-vapid-keys
```

会输出 **Public Key** 和 **Private Key**。两个都只放服务器密钥（第 8 节），**不要放进网页设定或 Git**。网页会在运行时向服务器（`getPushConfig`）取 Public Key，所以网页和服务器用的金钥永远一致。

## 8. 服务器密钥（Secret Manager）与权限

1. 在项目目录登录并选项目：

```bash
npm install
npx firebase login
npx firebase use --add      # 选 你的项目ID，别名填 default
```

2. 建立四个密钥（每个指令会提示你贴上数值）：

```bash
npx firebase functions:secrets:set TWILIO_API_KEY_SID      # SK…
npx firebase functions:secrets:set TWILIO_API_KEY_SECRET   # API Key 的 Secret
npx firebase functions:secrets:set VAPID_PUBLIC_KEY        # 第 7 步的 Public Key
npx firebase functions:secrets:set VAPID_PRIVATE_KEY       # 第 7 步的 Private Key
```

3. Google Cloud Console → **IAM**：给 `项目编号-compute@developer.gserviceaccount.com`（`项目编号` 是第 1 节第 4 步记下的那串数字，也可以在 Firebase 控制台 → 项目设定 → 一般 找到）加角色 **Service Account Token Creator**（让函数能签发登录凭证）。

## 9. 设定档

### 9.1 函数参数：`functions/.env.你的项目ID`

在 `functions/` 目录建立 `.env.你的项目ID`（参考已有的 `functions/.env.demo-tana`，那是 emulator 用的）：

```
TWILIO_VERIFY_SERVICE_SID=VA…（第 6 步）
VAPID_SUBJECT=mailto:你的邮箱
```

### 9.2 注册 Web App 与网页设定：`.env.local`

1. Firebase 控制台 → 项目设定 → **你的应用程式** → 按 **</>**（网页）→ 名字随意 → 注册。
2. 在项目根目录建立 `.env.local`，把 `firebaseConfig` 的数值填进去：

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=你的项目ID
VITE_FIREBASE_STORAGE_BUCKET=你的bucket名字
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_RECAPTCHA_KEY=（先留空，9.3 做完再填）
VITE_USE_EMULATORS=false
```

`.env.local` 已在 `.gitignore` 里，不会被提交。

> 旧版本要求的 `VITE_VAPID_PUBLIC_KEY` 已经不用了，`.env.local` 里有的话可以删掉。

### 9.3 App Check（reCAPTCHA Enterprise）

登录函数在正式环境会强制 App Check，没设定的话**登录会失败**。

1. 打开 <https://console.cloud.google.com/security/recaptcha>（选同一个项目）→ **建立金钥** → 类型 **网站**，网域填 `你的项目ID.web.app` 和 `你的项目ID.firebaseapp.com`。记下 **金钥 ID**。
2. Firebase 控制台 → **App Check** → 选 9.2 注册的 Web App → **reCAPTCHA Enterprise** → 贴上金钥 ID → 储存。
3. 回到 `.env.local`，把金钥 ID 填进 `VITE_RECAPTCHA_KEY=`。

## 10. 部署

```bash
npm run deploy
```

这会建置网页并部署 Hosting、Firestore 规则、**Firestore 索引（`firestore.indexes.json`）**、Storage 规则和所有函数。完成后会显示网址，例如 `https://你的项目ID.web.app`。

- 第一次部署时，Google 可能要求启用几个 API（Cloud Functions、Cloud Build、Cloud Scheduler、Artifact Registry、Eventarc、Secret Manager），照提示按「启用」再部署一次即可。
- 部署时会问是否允许函数读取第 8 步的密钥，选 **Yes**。
- 只想更新索引时：`npx firebase deploy --only firestore:indexes`。新索引要几分钟建好，期间「我的工作」相关查询可能会报错，等一下即可。可以在 Firestore Database → **索引** 看进度。

## 11. 第一次使用

1. 用手机打开网址，输入电话号码，收验证码登录，填名字。
2. 左上角团队选单 → **创建或加入团队** → 输入团队名称 → 建立。你就是这个团队的管理员，画面会显示**邀请码**。
3. 把邀请码发给同事；他们登录后输入邀请码申请加入，你在 **设定 → 成员** 批准。也可以在成员页直接用电话号码加人。
4. 在 **设定** 打开推送通知（iPhone 要先「加入主画面」，再从主画面打开 App 才能开推送）。

## 12. 手机加到主屏幕

- **iPhone（Safari）**：分享按钮 → 加入主画面。
- **Android（Chrome）**：右上角 ⋮ → 安装应用程式 / 加到主画面。

---

## 13. 自动部署（GitHub Actions，不用 Cloud Shell）

设定一次后，`main` 每次更新，GitHub 会自动测试并部署到 Firebase（约 5–10 分钟）。平常的流程：Claude 改好代码 → 开 Pull Request → 你在 GitHub 按 **Merge** → 自动上线。进度在 GitHub 仓库的 **Actions** 分页看。

### 13.1 给部署账号权限（Google Cloud 网页）

1. <https://console.cloud.google.com/iam-admin/iam?project=tana-team> → **Grant access**（授予访问权限）
2. New principals 填 `tana-deployer@tana-team.iam.gserviceaccount.com`
3. 加三个角色：**Editor**、**Secret Manager Admin**、**Project IAM Admin** → Save

### 13.2 建金钥（只用一次，放进 GitHub 后删掉本机档案）

1. <https://console.cloud.google.com/iam-admin/serviceaccounts?project=tana-team> → 点 `tana-deployer` → **Keys** → **Add key → Create new key → JSON** → 会下载一个 `.json` 档
2. 用文字编辑器打开它，全选复制（13.3 要贴）
3. 贴进 GitHub 后，**把下载的 .json 档删掉**（也清空垃圾桶）

### 13.3 GitHub Secrets

GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**，建四个：

| 名称 | 值 |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | 13.2 的整个 JSON 内容 |
| `FIREBASE_API_KEY` | Firebase → 项目设定 → 你的应用程式 → Config 里的 `apiKey`（`AIza…`，从 Firebase 后台复制，不要从聊天记录复制） |
| `RECAPTCHA_KEY` | 9.3 的 reCAPTCHA 金钥 ID（`6L…`） |
| `VAPID_SUBJECT` | `mailto:你的邮箱` |

> 以前建过的 GitHub Secret `VAPID_PUBLIC_KEY` 已经不用了，可以删除（Settings → Secrets and variables → Actions → 点它 → Remove）。推送用的 Public Key 只保存在服务器密钥（Secret Manager）`VAPID_PUBLIC_KEY`，网页运行时向服务器取。
>
> 推送测试：App → 设定 → 通知设定 → **发送测试通知**。显示「已发送到 N 部设备」就正常；显示状态 401/403 表示服务器的 VAPID 金钥对不上（Public/Private 不是同一对），请重新生成一对并同时更新两个服务器密钥，然后在手机上关掉再开启通知。

### 13.4 第一次跑

GitHub → **Actions** → **Deploy** → **Run workflow**。绿色 ✓ 就是成功；红色 ✗ 点进去看哪一步失败。

### 安全

- 金钥只存在 GitHub Secrets（加密、记录里会遮蔽），本机不要留副本。
- 要停用自动部署：Google Cloud → 服务账号 `tana-deployer` → Keys → 删除那把金钥。
- 怀疑金钥外泄：同上删除，再建一把新的，更新 `FIREBASE_SERVICE_ACCOUNT`。

## 日常注意

- **Twilio 余额**：和教会 App 共用。收到低余额邮件就尽快充值，否则两边同时无法登录。
- **每日摘要和批量通知最多发一次**：「明日工作」摘要和一次复制到多个日期的「新工作」通知，会先记下「已发」再发送。万一发送途中出错，系统不会重发（宁可漏一次，也不会重复轰炸）。漏了的话，打开 App 的日历一样看得到工作。
- **费用**：几个人用通常每月不到 USD 1（主要是短信）。收到 USD 5 预算提醒时，到 Google Cloud Console → 结算 → 报表看是哪一项。

## 本地开发与测试（给开发者）

```bash
npm run dev              # 本地开发（连真实项目，用 .env.local）
npm run emulators        # 本地 emulator（项目 demo-tana，验证码一律 123456）
npm test                 # 单元测试
npm run test:rules       # 数据库 / Storage 权限规则测试（需要 Java）
npm run test:functions   # 服务器函数测试（需要 Java）
npm run e2e              # 端到端测试（emulator + Chromium）
```

在有代理的环境跑 emulator 测试时，先取消代理变量，例如
`env -u HTTPS_PROXY -u https_proxy -u HTTP_PROXY -u http_proxy npm run e2e`，否则函数触发器可能注册不上。
