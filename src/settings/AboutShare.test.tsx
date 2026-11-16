import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

vi.mock('qrcode', () => ({ default: { toCanvas: vi.fn().mockResolvedValue(undefined) } }));
import QRCode from 'qrcode';
import AboutPage from './AboutPage';
import SharePage from './SharePage';
import { CHANGELOG } from './changelog';
import { setLang } from '../i18n';

beforeEach(() => setLang('en'));

describe('AboutPage', () => {
  it('shows the version and the change history', () => {
    render(<MemoryRouter><AboutPage /></MemoryRouter>);
    expect(screen.getByText('Version 1.6.3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveAttribute('href', '/settings');
    expect(screen.getByText(CHANGELOG[0].items.en[0])).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });
});

describe('SharePage', () => {
  it('renders the QR, link, copy; hides Share when unsupported', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    render(<MemoryRouter><SharePage /></MemoryRouter>);
    expect(QRCode.toCanvas).toHaveBeenCalledWith(expect.anything(), 'https://tana-team.web.app', expect.anything());
    expect(screen.getByText('https://tana-team.web.app')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('https://tana-team.web.app');
  });
  it('shares through the native sheet when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<MemoryRouter><SharePage /></MemoryRouter>);
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tana Team', url: 'https://tana-team.web.app' }));
  });
});
