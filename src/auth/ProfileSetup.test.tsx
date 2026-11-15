import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const setDoc = vi.fn().mockResolvedValue(undefined);
vi.mock('../firebase', () => ({
  db: { name: 'db' },
  auth: { currentUser: { uid: 'u1', phoneNumber: '+60123456789' as string | null } },
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => ({ path: p.join('/') }),
  setDoc: (...a: unknown[]) => setDoc(...a),
  serverTimestamp: () => 'SERVER_TS',
}));

import { auth } from '../firebase';
import ProfileSetup from './ProfileSetup';
import { setLang } from '../i18n';

beforeEach(() => {
  vi.clearAllMocks();
  setLang('en');
});

describe('ProfileSetup', () => {
  it('writes exactly the profile fields the rules allow', async () => {
    render(<ProfileSetup />);
    await userEvent.type(screen.getByLabelText('Name'), '  Ali  ');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(setDoc).toHaveBeenCalledWith(
      { path: 'users/u1' },
      { name: 'Ali', phone: '+60123456789', lang: 'en', notify: {}, digestTime: '20:00', createdAt: 'SERVER_TS' },
    );
  });

  it('shows an error when the account has no phone number', async () => {
    (auth.currentUser as { phoneNumber: string | null }).phoneNumber = null;
    render(<ProfileSetup />);
    await userEvent.type(screen.getByLabelText('Name'), 'Ali');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no phone number');
    expect(setDoc).not.toHaveBeenCalled();
    (auth.currentUser as { phoneNumber: string | null }).phoneNumber = '+60123456789';
  });
});
