import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { installFetchInterceptor } from './services/fetchInterceptor';
import './index.css';
import './styles/designSystem.css';

installFetchInterceptor();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary
      title="Nexora encountered an unexpected error"
      description="Refresh the page or return home. If the problem persists, contact support."
    >
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
