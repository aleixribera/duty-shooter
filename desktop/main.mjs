// Duty Shooter's desktop shell: one window that opens the live game, so the
// page, its socket and its updates are exactly those of the browser version.
// The built-in address may be the arcade portal; it names the game's own.
// When the home server can't be reached it opens the Pages copy (Bot Match and
// Practice Range), and when that fails too, a local page with a Retry button.
import { app, BrowserWindow, Menu, screen, session, shell } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { candidates, firstReachable, opensExternally, resolveGame, staysInApp, urlFlag } from './config.mjs';

const OFFLINE_PAGE = join(import.meta.dirname, 'offline.html');
const ICON = join(import.meta.dirname, 'build', 'icon.png');
const INK = '#0b0e13';
// The permissions the game asks for: pointer lock to aim, the clipboard for invite links.
const PERMISSIONS = new Set(['pointerLock', 'clipboard-sanitized-write', 'fullscreen', 'keyboardLock']);
// For scripts (scripts/smoke.mjs): the window never shows and keeps rendering while hidden.
const BACKGROUND = Boolean(process.env.DUTY_BACKGROUND);

/** The live lobby's address, written into config.json when the app is built. */
function bakedUrl() {
  try {
    return JSON.parse(readFileSync(join(app.getAppPath(), 'config.json'), 'utf8')).url ?? null;
  } catch {
    return null;
  }
}

const flag = urlFlag(process.argv);
const baked = bakedUrl();
// The addresses to try, refined on each open once the arcade portal names the game's own.
let urls = candidates({ flag, baked });

// Menu sounds play before the first click, as they do once a browser tab has been clicked.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.setAppUserModelId('com.aleixribera.dutyshooter');

// A second launch focuses the open window instead.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();

/** Window size and position, kept between runs. */
const statePath = () => join(app.getPath('userData'), 'window.json');
function loadState() {
  try {
    const state = JSON.parse(readFileSync(statePath(), 'utf8'));
    const visible = screen.getAllDisplays().some(({ workArea: a }) =>
      state.x < a.x + a.width && state.x + state.width > a.x && state.y < a.y + a.height && state.y + state.height > a.y);
    return visible ? state : { maximized: true };
  } catch {
    return { maximized: true };
  }
}
function saveState(win) {
  const { x, y, width, height } = win.getNormalBounds();
  try {
    writeFileSync(statePath(), JSON.stringify({ x, y, width, height, maximized: win.isMaximized(), fullScreen: win.isFullScreen() }));
  } catch {
    // Not worth failing the close over.
  }
}

/** Opens the first address that answers, or the offline page. */
async function open(win) {
  urls = candidates({ flag: flag && (await resolveGame(flag)), baked: baked && (await resolveGame(baked)) });
  const url = await firstReachable(urls);
  if (url) {
    try {
      await win.loadURL(url);
      return;
    } catch {
      // Answered the check but failed to load: fall through to the offline page.
    }
  }
  await win.loadFile(OFFLINE_PAGE);
}

const onOfflinePage = (win) => win.webContents.getURL().startsWith('file:');

function createWindow() {
  const state = loadState();
  const win = new BrowserWindow({
    title: 'Duty Shooter',
    icon: ICON,
    x: state.x,
    y: state.y,
    width: state.width ?? 1600,
    height: state.height ?? 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: INK,
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: !BACKGROUND },
  });
  if (!BACKGROUND) {
    if (state.maximized) win.maximize();
    if (state.fullScreen) win.setFullScreen(true);
    win.once('ready-to-show', () => win.show());
    win.on('close', () => saveState(win));
  }
  // The page's own <title> would otherwise replace the app's name.
  win.on('page-title-updated', (event) => event.preventDefault());

  const { webContents } = win;
  // F11 fullscreen, F5 reload (or retry from the offline page), Ctrl+Shift+I devtools.
  // Escape is left to the game, which pauses on it.
  webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
    } else if (input.key === 'F5') {
      if (onOfflinePage(win)) open(win);
      else webContents.reload();
    } else if (input.key === 'I' && input.control && input.shift) {
      webContents.toggleDevTools();
    } else {
      return;
    }
    event.preventDefault();
  });
  // The offline page's Retry button navigates to `?retry`.
  webContents.on('will-navigate', (event, target) => {
    if (target.startsWith('file:') && target.includes('?retry')) {
      event.preventDefault();
      open(win);
    } else if (!staysInApp(target, urls)) {
      event.preventDefault();
      if (opensExternally(target)) shell.openExternal(target);
    }
  });
  webContents.setWindowOpenHandler(({ url }) => {
    if (opensExternally(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  open(win);
  return win;
}

app.whenReady().then(() => {
  if (!primary) return;
  // No menu bar, so Ctrl+W, Ctrl+R and Alt reach the game instead of the shell.
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, done) => done(PERMISSIONS.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => PERMISSIONS.has(permission));
  const win = createWindow();
  app.on('second-instance', () => {
    if (win.isMinimized()) win.restore();
    win.focus();
  });
});

app.on('window-all-closed', () => app.quit());
