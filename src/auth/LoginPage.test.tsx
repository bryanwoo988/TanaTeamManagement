import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const requestLoginCode = vi.fn();
const verifyLoginCode = vi.fn();
const signInWithCustomToken = vi.fn();
vi.mock('../api', () => ({
  requestLoginCode: (...a: unknown[]) => requestLoginCode(...a),
  verifyLoginCode: (...a: unknown[]) => verifyLoginCode(...a),
}));
vi.mock('../firebase', () => ({ auth: { name: 'auth' } }));
vi.mock('firebase/auth', () => ({ signInWithCustomToken: (...a: unknown[]) => signInWithCustomToken(...a) }));

import LoginPage from './LoginPage';
import { setLang } from '../i18n';
import { setAppearance } from '../theme/appearance';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setLang('en');
});

describe('LoginPage', () => {
  it('sends the typed number and moves to the code step', async () => {
    requestLoginCode.mockResolvedValue({ sent: true });
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Mobile number'), '012 345 6789');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(requestLoginCode).toHaveBeenCalledWith('012 345 6789');
    expect(await screen.findByText('Enter the code')).toBeInTheDocument();
  });

  it('signs in with the custom token after the right code', async () => {
    requestLoginCode.mockResolvedValue({ sent: true });
    verifyLoginCode.mockResolvedValue({ token: 'tok' });
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Mobile number'), '0123456789');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await userEvent.type(await screen.findByLabelText('Code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(verifyLoginCode).toHaveBeenCalledWith('0123456789', '123456');
    expect(signInWithCustomToken).toHaveBeenCalledWith({ name: 'auth' }, 'tok');
  });

  it('shows a translated message for a server error key', async () => {
    requestLoginCode.mockRejectedValue(Object.assign(new Error('login.tooMany [429]'), { code: 'functions/resource-exhausted' }));
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Mobile number'), '0123456789');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts today. Please try again tomorrow.');
  });

  it('rejects an invalid number without calling the server', async () => {
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText('Mobile number'), '12345678');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(requestLoginCode).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid Malaysian mobile number.');
  });

  it('switches language with the picker', async () => {
    render(<LoginPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Melayu' }));
    expect(screen.getByRole('button', { name: 'Hantar kod' })).toBeInTheDocument();
  });

  it('uses the current theme variables', () => {
    setAppearance({ mode: 'dark', dark: 'slate' });
    render(<LoginPage />);
    expect(document.documentElement.style.getPropertyValue('--accent')).not.toBe('');
    expect(document.querySelector('.login')).toBeInTheDocument();
  });
});
