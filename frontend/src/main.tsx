import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, getInitialTheme } from './lib/theme';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

// Apply the saved or system theme before the first paint so the page does not flash the wrong colours.
applyTheme(getInitialTheme());

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
