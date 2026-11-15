import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import type { Role } from '../shared/types';

async function call<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
  const res = await httpsCallable<TReq, TRes>(functions, name)(data);
  return res.data;
}

// Login: the phone may be typed as 012…, 6012… or +6012…; the server normalizes it.
export const requestLoginCode = (phone: string) => call<{ phone: string }, { sent: true }>('requestLoginCode', { phone });
export const verifyLoginCode = (phone: string, code: string) =>
  call<{ phone: string; code: string }, { uid: string; token: string }>('verifyLoginCode', { phone, code });
export const requestPhoneChangeCode = (phone: string) =>
  call<{ phone: string }, { sent: true }>('requestPhoneChangeCode', { phone });
export const confirmPhoneChange = (phone: string, code: string) =>
  call<{ phone: string; code: string }, { phone: string }>('confirmPhoneChange', { phone, code });

// Teams
export const createTeam = (name: string) => call<{ name: string }, { teamId: string; code: string }>('createTeam', { name });
export const joinTeam = (code: string) =>
  call<{ code: string }, { teamId: string; status: 'pending' | 'active' }>('joinTeam', { code });
export const getInviteCode = (teamId: string) => call<{ teamId: string }, { code: string }>('getInviteCode', { teamId });
export const resetInviteCode = (teamId: string) => call<{ teamId: string }, { code: string }>('resetInviteCode', { teamId });
export const addMemberByPhone = (teamId: string, phone: string, name: string, role: Role) =>
  call<{ teamId: string; phone: string; name: string; role: Role }, { status: 'added' | 'invited' }>('addMemberByPhone', {
    teamId, phone, name, role,
  });
export const cancelPhoneInvite = (teamId: string, phone: string) =>
  call<{ teamId: string; phone: string }, Record<string, never>>('cancelPhoneInvite', { teamId, phone });
export const leaveTeam = (teamId: string) => call<{ teamId: string }, Record<string, never>>('leaveTeam', { teamId });
