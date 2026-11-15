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
import { normalizeMyPhone } from '../../shared/phone';
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
    expect(normalizeMyPhone(requestLoginCode.mock.calls[0][0] as string)).toEqual({ ok: true, e164: '+60123456789' });
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
    expect(verifyLoginCode).toHaveBeenCalledWith(requestLoginCode.mock.calls[0][0], '123456');
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

  it('formats the number live without the leading 0', async () => {
    render(<LoginPage />);
    const input = screen.getByLabelText('Mobile number');
    expect(input).toHaveAttribute('placeholder', '12-345 6789');
    await userEvent.type(input, '0123456789');
    expect(input).toHaveValue('12-345 6789');
  });

  it('formats a pasted +60 011 number', async () => {
    requestLoginCode.mockResolvedValue({ sent: true });
    render(<LoginPage />);
    const input = screen.getByLabelText('Mobile number');
    await userEvent.click(input);
    await userEvent.paste('+60 11-2345 6789');
    expect(input).toHaveValue('11-2345 6789');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(normalizeMyPhone(requestLoginCode.mock.calls[0][0] as string)).toEqual({ ok: true, e164: '+601123456789' });
  });

  it('caps the length', async () => {
    render(<LoginPage />);
    const input = screen.getByLabelText('Mobile number');
    await userEvent.type(input, '01234567891111');
    expect(input).toHaveValue('12-345 6789');
  });

  it('switches language with the inline links', async () => {
    render(<LoginPage />);
    expect(screen.getByText('Switch language?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'English' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Melayu' }));
    expect(screen.getByRole('button', { name: 'Hantar kod' })).toBeInTheDocument();
    expect(screen.getByText('Tukar bahasa?')).toBeInTheDocument();
  });

  it('uses the current theme variables', () => {
    setAppearance({ mode: 'dark', dark: 'slate' });
    render(<LoginPage />);
    expect(document.documentElement.style.getPropertyValue('--accent')).not.toBe('');
    expect(document.querySelector('.login')).toBeInTheDocument();
  });
});
