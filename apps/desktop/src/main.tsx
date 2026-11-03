import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import AccountWidget from './accountsOnly/AccountWidget';
import 'antd/dist/reset.css';
import './accountsOnly/glass.css';
import './accountsOnly/polish.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{window.location.hash === '#account-widget' ? <AccountWidget /> : <App />}</React.StrictMode>,
);
