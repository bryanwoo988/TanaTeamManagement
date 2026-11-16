import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

const saveCategories = vi.fn().mockResolvedValue(undefined);
vi.mock('./data', () => ({ saveCategories: (...a: unknown[]) => saveCategories(...a) }));
let role = 'admin';
vi.mock('../team/TeamContext', () => ({ useTeams: () => ({ member: () => ({ role, status: 'active' }) }) }));
const info = { categories: ['Fuel', 'Parts'], members: [] };
vi.mock('../ui/confirm', () => ({ confirmSheet: () => Promise.resolve(true) }));
vi.mock('./useTeamInfo', () => ({ useTeamInfo: () => info }));

import CategoriesPage from './CategoriesPage';
import { setLang } from '../i18n';

const setup = () => render(<MemoryRouter initialEntries={['/team/t1/invoices/categories']}><Routes><Route path="/team/:teamId/invoices/categories" element={<CategoriesPage />} /></Routes></MemoryRouter>);
beforeEach(() => { vi.clearAllMocks(); setLang('en'); role = 'admin'; });

describe('CategoriesPage', () => {
  it('admin adds a category', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Add category'), ' Seeds ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saveCategories).toHaveBeenCalledWith('t1', ['Fuel', 'Parts', 'Seeds']);
  });

  it('an empty draft saves nothing', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('Add category'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(saveCategories).not.toHaveBeenCalled();
  });

  it('admin removes a category', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Fuel' }));
    expect(saveCategories).toHaveBeenCalledWith('t1', ['Parts']);
  });

  it('non-admin is told it is admin only', () => {
    role = 'finance';
    setup();
    expect(screen.getByText('Only admins can manage categories.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });
});
