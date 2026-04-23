import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

function renderFatal(message: string) {
  const root = document.getElementById('root');
  if (!root) {
    return;
  }

  root.innerHTML = `
    <section style="max-width:760px;margin:48px auto;padding:24px;border:1px solid rgba(255,123,142,0.35);border-radius:16px;background:rgba(20,10,14,0.82);color:#ffe6ea;font-family:'Space Grotesk',sans-serif;">
      <h1 style="margin:0 0 12px;font-size:24px;">RoboViz failed to render</h1>
      <p style="margin:0 0 10px;opacity:0.92;">The app hit a runtime error before the dashboard mounted.</p>
      <pre style="margin:0;white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,0.35);border-radius:10px;padding:12px;">${message}</pre>
    </section>
  `;
}

window.addEventListener('error', (event) => {
  if (event.error instanceof Error) {
    renderFatal(event.error.stack ?? event.error.message);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  if (reason instanceof Error) {
    renderFatal(reason.stack ?? reason.message);
  } else {
    renderFatal(String(reason));
  }
});

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Missing root element (#root).');
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  (window as Window & { __robovizMounted?: boolean }).__robovizMounted = true;
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  renderFatal(message);
}
