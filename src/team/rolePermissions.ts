import type { MessageKey } from '../i18n';
import type { Role } from '../../shared/types';

/** What each role can do, as i18n keys (kept in step with firestore.rules / shared/access.ts). */
export const ROLE_PERMISSIONS: Record<Role, MessageKey[]> = {
  admin: ['perm.admin.1', 'perm.admin.2', 'perm.admin.3', 'perm.admin.4', 'perm.admin.5'],
  finance: ['perm.finance.1', 'perm.finance.2', 'perm.finance.3', 'perm.finance.4'],
  member: ['perm.member.1', 'perm.member.2', 'perm.member.3', 'perm.member.4'],
};
