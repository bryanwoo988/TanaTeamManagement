import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const requestPhoneChangeCode = vi.fn();
const confirmPhoneChange = vi.fn();
vi.mock('../api', () => ({
  requestPhoneChangeCode: (...a: unknown[]) => requestPhoneChangeCode(...a),
  confirmPhoneChange: (...a: unknown[]) => confirmPhoneChange(...a),
}));
const getIdToken = vi.fn().mockResolvedValue('t');
vi.mock('../firebase', () => ({ auth: { currentUser: { getIdToken: (...a: unknown[]) => getIdToken(...a) } }, db: {} }));

import ChangePhone from './ChangePhone';
import { setLang } from '../i18n';

beforeEach(() => { vi.clearAllMocks(); setLang('en'); });

describe('ChangePhone', () => {
  it('rejects an invalid number and the current number', async () => {
    render(<ChangePhone current="+60123456789" />);
    await userEvent.type(screen.getByLabelText('New mobile number'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('valid Malaysian mobile');
    await userEvent.clear(screen.getByLabelText('New mobile number'));
    await userEvent.type(screen.getByLabelText('New mobile number'), '012-345 6789');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already your number');
    expect(requestPhoneChangeCode).not.toHaveBeenCalled();
  });

  it('sends a code then confirms and shows the new number from the profile', async () => {
    requestPhoneChangeCode.mockResolvedValue({ sent: true });
    confirmPhoneChange.mockResolvedValue({ phone: '+60133334444' });
    const { rerender } = render(<ChangePhone current="+60123456789" />);
    await userEvent.type(screen.getByLabelText('New mobile number'), '013-333 4444');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(requestPhoneChangeCode).toHaveBeenCalledWith('+60133334444');
    await userEvent.type(await screen.findByLabelText('Code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Change number' }));
    expect(confirmPhoneChange).toHaveBeenCalledWith('+60133334444', '123456');
    expect(getIdToken).toHaveBeenCalledWith(true);
    // the profile snapshot carries the new number
    rerender(<ChangePhone current="+60133334444" />);
    expect(screen.getByText(/\+60 13-333 4444/)).toBeInTheDocument();
    expect(screen.getByLabelText('New mobile number')).toBeInTheDocument();
  });

  it('shows a translated server error and stays on the code step', async () => {
    requestPhoneChangeCode.mockResolvedValue({ sent: true });
    confirmPhoneChange.mockRejectedValue(Object.assign(new Error('phone.inUse'), {}));
    render(<ChangePhone current="+60123456789" />);
    await userEvent.type(screen.getByLabelText('New mobile number'), '013-333 4444');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await userEvent.type(await screen.findByLabelText('Code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Change number' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('used by another account');
  });
});
