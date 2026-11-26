import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ToolbarPopup from './components/ToolbarPopup';
import './styles/tokens.css';
import './styles/global.css';

const params = new URLSearchParams(window.location.search);
const popupType = params.get('type');
const popup = params.get('popup') === 'toolbar' && (popupType === 'downloads' || popupType === 'adblock')
  ? <ToolbarPopup kind={popupType} />
  : <App />;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {popup}
  </React.StrictMode>
);
