import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('./firebase', () => ({ auth: {}, db: {} }));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: () => () => {}, signOut: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), onSnapshot: vi.fn() }));

import App from './App';

it('renders a main landmark', () => {
  render(<App />);
  expect(screen.getByRole('main')).toBeInTheDocument();
});
