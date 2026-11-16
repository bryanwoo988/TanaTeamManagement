import type { Lang } from '../../shared/types';

export interface ChangelogEntry {
  version: string;
  /** 'YYYY-MM-DD HH:mm' in Kuala Lumpur time. */
  date: string;
  items: Record<Lang, string[]>;
}

/** Newest first. The newest entry's date is replaced by the real build time on the About page. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.8.0',
    date: '2026-11-17 07:51',
    items: {
      zh: ['设置 → 账户可以修改自己的名字', '新增发票时类别不再默认选第一个，必须自己选', '发票详情重新排版：报销、退回分开，删除改成底部小按钮', '「开启通知」提示缩成一行，只在日历页显示', '日历：新增工作改成右下角的 ＋ 按钮，导出改成图标', '工作表单：开始和结束时间并排，负责人改成可点的名字标签，右上角 ✕ 关闭', '发票类别：移除改成垃圾桶图标并先确认', '各页面的「返回」样式统一'],
      en: ['Settings → Account lets you change your name', 'A new invoice no longer preselects the first category; you must choose one', 'Invoice detail re-laid out: reimburse and reject are separate, delete is a small button at the bottom', 'The "turn on notifications" prompt is one line and only on the calendar', 'Calendar: add work with the ＋ button at the bottom right; export is an icon', 'Work form: start and end side by side, assignees as tappable name chips, ✕ to close', 'Invoice categories: remove is a bin icon that asks first', 'One "Back" style on every page'],
      ms: ['Tetapan → Akaun membolehkan anda menukar nama', 'Invois baharu tidak lagi memilih kategori pertama secara automatik; anda mesti memilih', 'Butiran invois disusun semula: bayar balik dan tolak diasingkan, padam ialah butang kecil di bawah', 'Gesaan "hidupkan pemberitahuan" kini satu baris dan hanya di kalendar', 'Kalendar: tambah kerja dengan butang ＋ di kanan bawah; eksport ialah ikon', 'Borang kerja: mula dan tamat sebelah-menyebelah, petugas sebagai cip nama, ✕ untuk tutup', 'Kategori invois: buang ialah ikon tong yang bertanya dahulu', 'Satu gaya "Kembali" di semua halaman'],
    },
  },
  {
    version: '1.7.0',
    date: '2026-11-16 22:52',
    items: {
      zh: ['通知页面重新设计：按今天／昨天／更早分组，每类通知有自己的图标', '未读通知有底色和圆点，标题旁显示未读数量；时间跟随所选语言显示'],
      en: ['Notifications page redesigned: grouped into Today / Yesterday / Earlier, with an icon for each kind', 'Unread notifications are tinted with a dot, the unread count sits next to the title, and times follow your language'],
      ms: ['Halaman pemberitahuan direka semula: dikumpul kepada Hari ini / Semalam / Lebih awal, dengan ikon bagi setiap jenis', 'Pemberitahuan belum dibaca diwarnakan dengan titik, bilangan belum dibaca di sebelah tajuk, dan masa mengikut bahasa anda'],
    },
  },
  {
    version: '1.6.5',
    date: '2026-11-16 18:40',
    items: {
      zh: ['修正：iPhone 上底部导航栏有时会跑到屏幕中间'],
      en: ['Fixed: on iPhone the bottom bar sometimes floated up to the middle of the screen'],
      ms: ['Dibaiki: pada iPhone bar bawah kadangkala terapung ke tengah skrin'],
    },
  },
  {
    version: '1.6.4',
    date: '2026-11-16 12:10',
    items: {
      zh: ['修正：发票页打开「日期」筛选后，页面不再左右晃动', '修正：更新记录里 v1.6.0–v1.6.2 的时间', '只有一笔发票时的文字更自然'],
      en: ['Fixed: the Invoices page no longer scrolls sideways when the Date filter is open', 'Fixed: the times shown for v1.6.0–v1.6.2 in this list', 'Tidier wording when there is only one invoice'],
      ms: ['Dibaiki: halaman Invois tidak lagi bergerak ke sisi apabila penapis Tarikh dibuka', 'Dibaiki: masa yang ditunjukkan untuk v1.6.0–v1.6.2 dalam senarai ini', 'Ayat lebih kemas apabila hanya ada satu invois'],
    },
  },
  {
    version: '1.6.3',
    date: '2026-11-16 08:32',
    items: {
      zh: ['成员页的邀请卡片重新设计：邀请码放大显示，旁边一键复制；「分享邀请」变成整行大按钮；移除「复制链接」', '没有分享功能的浏览器，按「分享邀请」会复制整段邀请信息（含链接）'],
      en: ['Invite card on the Members page redesigned: big invite code with a one-tap copy icon, a full-width Share invite button, and Copy link removed', 'Where the browser has no share sheet, Share invite copies the whole invite message with the link'],
      ms: ['Kad jemputan di halaman Ahli direka semula: kod jemputan besar dengan ikon salin satu ketik, butang Kongsi jemputan selebar skrin, dan Salin pautan dibuang', 'Jika pelayar tiada helaian kongsi, Kongsi jemputan menyalin keseluruhan mesej jemputan bersama pautan'],
    },
  },
  {
    version: '1.6.2',
    date: '2026-11-16 08:19',
    items: {
      zh: ['设置里的「语言」改成一行，只显示当前语言；点开再从列表选择'],
      en: ['Language in Settings is now one row showing the current language; tap it to pick from a list'],
      ms: ['Bahasa dalam Tetapan kini satu baris yang menunjukkan bahasa semasa; ketik untuk memilih dari senarai'],
    },
  },
  {
    version: '1.6.1',
    date: '2026-11-16 08:14',
    items: {
      zh: ['导出、成员页面的「返回」会回到你刚才的页面（例如发票页），不再总是跳回日历', '从发票页进入导出时，默认选好「发票与报销」；单选项排版更整齐'],
      en: ['"Back" on the Export and Members pages returns to the page you came from (e.g. Invoices) instead of always the calendar', 'Opening Export from Invoices pre-selects invoices; tidier option layout'],
      ms: ['"Kembali" di halaman Eksport dan Ahli kembali ke halaman sebelumnya (cth. Invois), bukan sentiasa ke kalendar', 'Membuka Eksport dari Invois memilih invois secara lalai; susun atur pilihan lebih kemas'],
    },
  },
  {
    version: '1.6.0',
    date: '2026-11-16 08:06',
    items: {
      zh: ['发票页面重新设计：筛选改成一排可点的标签，日期范围收进「日期」按钮', '列表上方显示笔数和合计金额（财务还能看到待报销金额）', '按月份分组并显示每月合计；新增「我的」筛选', '新增、导出、类别按钮移到标题旁边'],
      en: ['Invoices page redesigned: filters are now one-tap chips, and the date range folds under a "Date" button', 'The count and total of what is shown appear above the list (finance also sees the amount pending reimbursement)', 'Invoices are grouped by month with a monthly total; new "Mine" filter', 'New, Export and Categories moved next to the title'],
      ms: ['Halaman invois direka semula: penapis kini cip satu ketik, julat tarikh dilipat di bawah butang "Tarikh"', 'Bilangan dan jumlah yang dipaparkan ditunjuk di atas senarai (kewangan juga melihat jumlah belum dibayar balik)', 'Invois dikumpul mengikut bulan dengan jumlah bulanan; penapis "Saya" baharu', 'Butang Baharu, Eksport dan Kategori dipindah ke sebelah tajuk'],
    },
  },
  {
    version: '1.5.0',
    date: '2026-11-16 07:20',
    items: {
      zh: ['邀请码可以一键复制；分享邀请链接，同事点链接登录后自动申请加入团队'],
      en: ['Copy the invite code in one tap; share an invite link, and colleagues who tap it and sign in automatically request to join the team'],
      ms: ['Salin kod jemputan dengan satu ketik; kongsi pautan jemputan, rakan sekerja yang menekannya dan log masuk akan memohon menyertai pasukan secara automatik'],
    },
  },
  {
    version: '1.4.3',
    date: '2026-11-16 07:05',
    items: {
      zh: ['登出再登录后，通知会自动重新开启（除非你在设置里自己关掉）'],
      en: ['After signing out and back in, notifications turn back on automatically (unless you switched them off in Settings)'],
      ms: ['Selepas log keluar dan log masuk semula, pemberitahuan dihidupkan semula secara automatik (kecuali anda mematikannya dalam Tetapan)'],
    },
  },
  {
    version: '1.4.2',
    date: '2026-11-16 06:58',
    items: {
      zh: ['弹出的表单可以往下拉来关闭'],
      en: ['Pull a pop-up form down to close it'],
      ms: ['Tarik borang timbul ke bawah untuk menutupnya'],
    },
  },
  {
    version: '1.4.1',
    date: '2026-11-16 06:50',
    items: {
      zh: ['打开新页面时从最上面开始显示'],
      en: ['New pages now open at the top'],
      ms: ['Halaman baharu kini dibuka dari atas'],
    },
  },
  {
    version: '1.4.0',
    date: '2026-11-16 06:39',
    items: {
      zh: ['设置页改版', '显示版本和更新记录', '分享 App 的二维码和链接'],
      en: ['Settings page redesigned', 'Version and change history are shown', 'QR code and link to share the app'],
      ms: ['Halaman Tetapan direka semula', 'Versi dan sejarah perubahan dipaparkan', 'Kod QR dan pautan untuk berkongsi aplikasi'],
    },
  },
  {
    version: '1.3.0',
    date: '2026-11-16 06:25',
    items: {
      zh: ['表单可以上下滑动', '点收据照片全屏查看', '换角色前先确认并列出权限', '所有手机号栏位统一显示 +60', '开启通知的提示不再闪现'],
      en: ['Forms can scroll up and down', 'Tap a receipt photo to view it full screen', 'Confirm and see the permissions before changing a role', 'All phone number fields consistently show +60', 'The enable-notifications prompt no longer flashes'],
      ms: ['Borang boleh dilungsur ke atas dan bawah', 'Ketik gambar resit untuk lihat skrin penuh', 'Sahkan dan lihat kebenaran sebelum menukar peranan', 'Semua medan nombor telefon kini memaparkan +60', 'Gesaan membuka pemberitahuan tidak lagi berkelip'],
    },
  },
  {
    version: '1.2.0',
    date: '2026-11-15 23:24',
    items: {
      zh: ['推送通知修好（服务器自动管理推送金钥）', '通知错误显示具体原因'],
      en: ['Push notifications fixed (the server now manages push keys automatically)', 'Notification errors show the specific reason'],
      ms: ['Pemberitahuan tolak dibaiki (pelayan kini mengurus kunci tolak secara automatik)', 'Ralat pemberitahuan memaparkan sebab yang khusus'],
    },
  },
  {
    version: '1.1.0',
    date: '2026-11-15 22:39',
    items: {
      zh: ['新成员登录后直接进入团队', '管理员可设定谁能上传收据', '登录页改版', '第一次打开先选语言', '新 App 图标', 'App 内 logo 跟随主题变色', '设置里可发送测试通知'],
      en: ['New members go straight into the team after signing in', 'Admins can choose who may upload receipts', 'Redesigned sign-in page', 'Pick a language the first time you open the app', 'New app icon', 'The in-app logo follows the theme colour', 'Send a test notification from Settings'],
      ms: ['Ahli baharu terus masuk ke pasukan selepas log masuk', 'Pentadbir boleh menetapkan siapa yang boleh memuat naik resit', 'Halaman log masuk direka semula', 'Pilih bahasa semasa membuka aplikasi buat kali pertama', 'Ikon aplikasi baharu', 'Logo dalam aplikasi mengikut warna tema', 'Hantar pemberitahuan ujian dari Tetapan'],
    },
  },
  {
    version: '1.0.0',
    date: '2026-11-15 17:30',
    items: {
      zh: ['首次上线：团队日历、发票与报销、通知、导出 Excel/PDF、三种语言、8 种主题'],
      en: ['First release: team calendar, invoices and claims, notifications, Excel/PDF export, three languages, 8 themes'],
      ms: ['Keluaran pertama: kalendar pasukan, invois dan tuntutan, pemberitahuan, eksport Excel/PDF, tiga bahasa, 8 tema'],
    },
  },
];

/** Kuala Lumpur wall-clock 'YYYY-MM-DD HH:mm' for an ISO instant. */
export function formatKL(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}`;
}

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const BUILD_TIME = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : new Date(0).toISOString();
export const COMMIT = typeof __COMMIT__ === 'string' ? __COMMIT__ : 'dev';
