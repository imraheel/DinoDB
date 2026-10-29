import { BrowserWindow, app, nativeTheme } from 'electron';

const ABOUT_WIDTH = 420;
const ABOUT_HEIGHT = 180;

let aboutWindow: BrowserWindow | null = null;

function aboutHtml(version: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>About DinoDB</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: ui-sans-serif, system-ui, -apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
    background: #ffffff;
    color: #1d1d1f;
    -webkit-user-select: none;
    user-select: none;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #252528; color: #f5f5f7; }
    .muted { color: #98989d; }
  }
  .card { text-align: center; padding: 16px 28px; }
  .name { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
  .version { margin-top: 2px; font-size: 11px; color: #8e8e93; }
  .desc { margin-top: 10px; font-size: 11px; line-height: 1.45; max-width: 300px; color: #636366; }
  .muted { color: #636366; }
</style>
</head>
<body>
  <div class="card">
    <div class="name">DinoDB</div>
    <div class="version">Version ${version}</div>
    <p class="desc muted">A fast, native MongoDB client for the desktop.<br />Browse, query, and edit collections with ease.</p>
  </div>
</body>
</html>`;
}

export function openAboutWindow(): void {
  if (aboutWindow !== null && !aboutWindow.isDestroyed()) {
    aboutWindow.focus();
    return;
  }

  const html = aboutHtml(app.getVersion());

  aboutWindow = new BrowserWindow({
    width: ABOUT_WIDTH,
    height: ABOUT_HEIGHT,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    minimizable: process.platform === 'darwin',
    title: 'About DinoDB',
    center: true,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#252528' : '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  aboutWindow.once('ready-to-show', () => aboutWindow?.show());
  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });

  void aboutWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}
