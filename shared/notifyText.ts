import type { Lang, NotifyKind } from './types';

type Vars = Record<string, string | number>;
type Text = { title: string; body: string };

/**
 * Variables each kind reads (missing ones render empty):
 * - digest: count, list (the per-language digestBody)
 * - assigned: title, team, when, count (>1 = copied to several dates, `when` is the first)
 * - changed: title, team, when, cancelled (truthy = deleted)
 * - companyInvoice / claimSubmitted: team, name (uploader), amount (formatted), vendor
 * - claimDone: team, amount, vendor, status ('reimbursed' | 'rejected'), reason
 * - joinRequest: name, team; joined: team
 */
const T: Record<Lang, Record<string, Text>> = {
  zh: {
    digest: { title: '明天有 {count} 项工作', body: '{list}' },
    assigned: { title: '新工作：{title}', body: '{team} · {when}' },
    assignedMany: { title: '新工作：{title}', body: '{team} · {count} 个日期，从 {when} 开始' },
    changed: { title: '工作有改动：{title}', body: '{team} · {when}' },
    cancelled: { title: '工作已取消：{title}', body: '{team} · {when}' },
    companyInvoice: { title: '新公司发票', body: '{name} 上传了 {vendor} {amount}（{team}）' },
    claimSubmitted: { title: '新报销申请', body: '{name} 提交了 {vendor} {amount}（{team}）' },
    claimReimbursed: { title: '报销已处理', body: '{vendor} {amount} 已报销（{team}）' },
    claimRejected: { title: '报销被退回', body: '{vendor} {amount} 被退回：{reason}（{team}）' },
    joinRequest: { title: '加入申请', body: '{name} 申请加入 {team}' },
    joined: { title: '已加入团队', body: '你已加入 {team}' },
  },
  en: {
    digest: { title: 'Tomorrow: {count} jobs', body: '{list}' },
    assigned: { title: 'New work: {title}', body: '{team} · {when}' },
    assignedMany: { title: 'New work: {title}', body: '{team} · {count} dates from {when}' },
    changed: { title: 'Work changed: {title}', body: '{team} · {when}' },
    cancelled: { title: 'Work cancelled: {title}', body: '{team} · {when}' },
    companyInvoice: { title: 'New company invoice', body: '{name} uploaded {vendor} {amount} ({team})' },
    claimSubmitted: { title: 'New expense claim', body: '{name} submitted {vendor} {amount} ({team})' },
    claimReimbursed: { title: 'Claim reimbursed', body: '{vendor} {amount} has been reimbursed ({team})' },
    claimRejected: { title: 'Claim returned', body: '{vendor} {amount} was returned: {reason} ({team})' },
    joinRequest: { title: 'Join request', body: '{name} asked to join {team}' },
    joined: { title: 'Joined team', body: 'You have joined {team}' },
  },
  ms: {
    digest: { title: 'Esok: {count} kerja', body: '{list}' },
    assigned: { title: 'Kerja baharu: {title}', body: '{team} · {when}' },
    assignedMany: { title: 'Kerja baharu: {title}', body: '{team} · {count} tarikh mulai {when}' },
    changed: { title: 'Kerja diubah: {title}', body: '{team} · {when}' },
    cancelled: { title: 'Kerja dibatalkan: {title}', body: '{team} · {when}' },
    companyInvoice: { title: 'Invois syarikat baharu', body: '{name} memuat naik {vendor} {amount} ({team})' },
    claimSubmitted: { title: 'Tuntutan baharu', body: '{name} menghantar {vendor} {amount} ({team})' },
    claimReimbursed: { title: 'Tuntutan dibayar', body: '{vendor} {amount} telah dibayar balik ({team})' },
    claimRejected: { title: 'Tuntutan dikembalikan', body: '{vendor} {amount} dikembalikan: {reason} ({team})' },
    joinRequest: { title: 'Permohonan sertai', body: '{name} memohon untuk menyertai {team}' },
    joined: { title: 'Sudah menyertai pasukan', body: 'Anda telah menyertai {team}' },
  },
};

function variant(kind: NotifyKind, v: Vars): string {
  if (kind === 'assigned' && Number(v.count) > 1) return 'assignedMany';
  if (kind === 'changed' && v.cancelled) return 'cancelled';
  if (kind === 'claimDone') return v.status === 'rejected' ? 'claimRejected' : 'claimReimbursed';
  return kind;
}

const fill = (s: string, v: Vars) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? '')).trim();

/** Notification title and body for a kind, in the recipient's language. */
export function notifyText(kind: NotifyKind, lang: Lang, v: Vars): Text {
  const t = (T[lang] ?? T.en)[variant(kind, v)];
  return { title: fill(t.title, v), body: fill(t.body, v) };
}
