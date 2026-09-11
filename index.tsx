import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

let updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
updateServiceWorker = registerSW({
  onNeedRefresh() {
    const shouldRefresh = window.confirm('新版本已就绪，刷新页面以应用更新？');
    if (shouldRefresh) void updateServiceWorker();
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
