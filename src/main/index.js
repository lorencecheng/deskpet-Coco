/**
 * DeskPet Coco — 主进程
 * 负责创建透明置顶窗口、托盘菜单、拖动定位与动作 IPC。
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');

// 窗口尺寸：一个容纳宠物的小方块
const PET_W = 320;
const PET_H = 320;

let win = null;
let tray = null;
let dragRef = null; // { lastX, lastY } 记录拖动时的光标位置
let quitting = false;

/** 窗口创建后始终保持在工作区内，防止拖到屏幕外 */
function keepInBounds() {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const wa = screen.getPrimaryDisplay().workArea;
  let x = b.x;
  let y = b.y;
  if (x < wa.x) x = wa.x;
  if (y < wa.y) y = wa.y;
  if (x + b.width > wa.x + wa.width) x = wa.x + wa.width - b.width;
  if (y + b.height > wa.y + wa.height) y = wa.y + wa.height - b.height;
  if (x !== b.x || y !== b.y) win.setPosition(x, y);
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: PET_W,
    height: PET_H,
    x: wa.x + wa.width - PET_W - 48,
    y: wa.y + wa.height - PET_H - 48,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false, // 拖动由我们手动控制
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('move', keepInBounds);
  win.on('closed', () => { win = null; });
}

/** 向渲染进程下发一个动作 */
function sendAction(name) {
  if (win && !win.isDestroyed()) win.webContents.send('pet:action', name);
}

function createTray() {
  const iconPath = path.join(__dirname, '../../assets/icons/tray-32.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    { label: '说嗨', click: () => sendAction('happy') },
    { label: '喂意大利宽面', click: () => sendAction('feed') },
    { label: '洗澡', click: () => sendAction('bath') },
    { label: '钓鱼', click: () => sendAction('fishing') },
    { label: '抓痒', click: () => sendAction('scratch') },
    { label: '睡觉', click: () => sendAction('sleep') },
    { type: 'separator' },
    { label: '退出 DeskPet Coco', click: () => { quitting = true; app.quit(); } }
  ]);

  tray.setToolTip('DeskPet Coco · 咖啡猫');
  tray.setContextMenu(menu);
  tray.on('click', () => sendAction('happy'));
}

function registerIpc() {
  // 托盘菜单触发动作
  ipcMain.on('action', (_e, name) => sendAction(name));

  // 拖动宠物：用光标位置增量移动窗口
  ipcMain.on('pet:drag-start', () => {
    const p = screen.getCursorScreenPoint();
    dragRef = { lastX: p.x, lastY: p.y };
  });
  ipcMain.on('pet:drag-move', () => {
    if (!dragRef || !win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const dx = p.x - dragRef.lastX;
    const dy = p.y - dragRef.lastY;
    dragRef.lastX = p.x;
    dragRef.lastY = p.y;
    const [x, y] = win.getPosition();
    win.setPosition(x + dx, y + dy);
  });
  ipcMain.on('pet:drag-end', () => {
    dragRef = null;
  });
}

// 单实例锁：避免重复打开多个宠物
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      sendAction('happy');
    }
  });

  app.whenReady().then(() => {
    registerIpc();
    createWindow();
    createTray();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    // 托盘常驻，窗口关闭不退出；仅显式退出时退出
    if (quitting) app.quit();
  });

  app.on('before-quit', () => { quitting = true; });
}
