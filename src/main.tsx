import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './app.css';
import { initAppearance } from './theme/appearance';
import { installViewportFix } from './ui/viewportFix';

initAppearance();
installViewportFix();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
