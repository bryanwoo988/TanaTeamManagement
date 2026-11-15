import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './app.css';
import { initAppearance } from './theme/appearance';

initAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
