import React from 'react';
import ReactDOM from 'react-dom/client';
import AppShell from './layout/AppShell';
import { AppProvider } from './context/AppState';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <AppShell />
    </AppProvider>
  </React.StrictMode>
);
