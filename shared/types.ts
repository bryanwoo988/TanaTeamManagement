import type { Timestamp } from 'firebase/firestore';

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
  assignees: string[]; place: string; notes: string; createdBy: string; updatedAt: Timestamp;
  batchId?: string }
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
