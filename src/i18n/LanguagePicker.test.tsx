import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const updateDoc = vi.fn();
const toastError = vi.fn();
let authState: { user: { uid: string } | null; profile: { name: string } | null } = { user: null, profile: null };
vi.mock('../firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => ({ path: p.join('/') }),
  updateDoc: (...a: unknown[]) => updateDoc(...a),
}));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => authState }));
vi.mock('../ui/toast', () => ({ toastError: () => toastError() }));

import LanguagePicker from './LanguagePicker';
import { getLang, setLang } from './index';

beforeEach(() => { vi.clearAllMocks(); setLang('en'); updateDoc.mockResolvedValue(undefined); });

describe('LanguagePicker', () => {
  it('signed out: only changes the local language', async () => {
    authState = { user: null, profile: null };
    render(<LanguagePicker />);
    await userEvent.click(screen.getByRole('button', { name: 'Melayu' }));
    expect(getLang()).toBe('ms');
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('signed in with a profile: also saves the language to users/{uid}', async () => {
    authState = { user: { uid: 'u1' }, profile: { name: 'Ali' } };
    render(<LanguagePicker />);
    await userEvent.click(screen.getByRole('button', { name: '华语' }));
    expect(getLang()).toBe('zh');
    expect(updateDoc).toHaveBeenCalledWith({ path: 'users/u1' }, { lang: 'zh' });
  });

  it('signed in without a profile yet: no write (setup stores the language)', async () => {
    authState = { user: { uid: 'u1' }, profile: null };
    render(<LanguagePicker />);
    await userEvent.click(screen.getByRole('button', { name: 'Melayu' }));
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('shows the error banner when saving fails, keeping the local choice', async () => {
    authState = { user: { uid: 'u1' }, profile: { name: 'Ali' } };
    updateDoc.mockRejectedValue(new Error('offline'));
    render(<LanguagePicker />);
    await userEvent.click(screen.getByRole('button', { name: 'Melayu' }));
    expect(getLang()).toBe('ms');
    await waitFor(() => expect(toastError).toHaveBeenCalled());
  });
});
