import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), updateDoc: vi.fn() }));
vi.mock('firebase/auth', () => ({ signInWithCustomToken: vi.fn() }));
vi.mock('../api', () => ({ requestLoginCode: vi.fn(), verifyLoginCode: vi.fn() }));
let authState: { user: unknown; profile: { lang: 'zh' | 'en' | 'ms' } | null } = { user: null, profile: null };
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => authState }));

describe('first-run language chooser', () => {
  beforeEach(() => { vi.resetModules(); localStorage.clear(); authState = { user: null, profile: null }; });

  it('defaults to English and shows the chooser before login when nothing is stored', async () => {
    const { default: FirstRunGate } = await import('./FirstRunGate');
    const { getLang } = await import('./index');
    render(<FirstRunGate><p>login page</p></FirstRunGate>);
    expect(getLang()).toBe('en');
    expect(screen.getByText('Choose your language')).toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '中文' }));
    expect(localStorage.getItem('lang')).toBe('zh');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('skips the chooser when a language is stored', async () => {
    localStorage.setItem('lang', 'ms');
    const { default: FirstRunGate } = await import('./FirstRunGate');
    render(<FirstRunGate><p>login page</p></FirstRunGate>);
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('signed-in profile counts as chosen and stores its language silently', async () => {
    authState = { user: { uid: 'u' }, profile: { lang: 'ms' } };
    const { default: FirstRunGate } = await import('./FirstRunGate');
    render(<FirstRunGate><p>app</p></FirstRunGate>);
    expect(screen.getByText('app')).toBeInTheDocument();
    expect(localStorage.getItem('lang')).toBe('ms');
  });
});
