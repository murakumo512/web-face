import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { SiteConfigProvider } from './context/SiteConfigContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SiteConfigProvider>
      <App />
    </SiteConfigProvider>
  </React.StrictMode>
);
