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
