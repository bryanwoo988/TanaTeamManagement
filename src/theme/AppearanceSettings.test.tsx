import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppearanceSettings from './AppearanceSettings';
import { getAppearance } from './appearance';
import { setLang } from '../i18n';

beforeEach(() => {
  localStorage.clear();
  setLang('en');
});

describe('AppearanceSettings', () => {
  it('stores mode and dark theme choices and marks the selected swatch', () => {
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    fireEvent.click(screen.getByRole('button', { name: 'Slate' }));
    expect(getAppearance()).toEqual({ mode: 'dark', light: 'paper', dark: 'slate' });
    expect(JSON.parse(localStorage.getItem('appearance')!)).toMatchObject({ mode: 'dark', dark: 'slate' });
    expect(screen.getByRole('button', { name: 'Slate' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Midnight' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Paper' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('falls back to defaults on corrupt storage', () => {
    localStorage.setItem('appearance', '{not json');
    render(<AppearanceSettings />);
    expect(getAppearance()).toEqual({ mode: 'system', light: 'paper', dark: 'midnight' });
    expect(screen.getByRole('button', { name: 'Paper' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Follow system' })).toHaveAttribute('aria-pressed', 'true');
  });
});
