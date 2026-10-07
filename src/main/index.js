/**
 * DeskPet Coco — 主进程
 * 负责创建透明置顶窗口、托盘菜单、拖动定位、桌面巡游与动作 IPC。
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');

// 窗口尺寸：一个容纳宠物的小方块（原 320 → 缩到 256，整体缩小 20%）
const PET_W = 256;
const PET_H = 256;

let win = null;
let tray = null;
let dragRef = null; // { lastX, lastY } 记录拖动时的光标位置
let quitting = false;

// 巡游（桌面四边闲逛）状态
let wandering = false;
let wanderTimer = null;
let wanderLegs = 0;

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

/** 停止巡游 */
function stopWandering() {
  wandering = false;
  if (wanderTimer) { clearInterval(wanderTimer); wanderTimer = null; }
}

/** 把窗口平滑移动到 (tx, ty)，到位后回调 */
function moveWindowTo(tx, ty, onDone) {
  const wa = screen.getPrimaryDisplay().workArea;
  tx = Math.max(wa.x, Math.min(wa.x + wa.width - PET_W, tx));
  ty = Math.max(wa.y, Math.min(wa.y + wa.height - PET_H, ty));
  const [sx0, sy0] = win.getPosition();
  const dx = tx - sx0;
  const dy = ty - sy0;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) { if (onDone) onDone(); return; }
  const steps = Math.max(8, Math.min(50, Math.ceil(dist / 14)));
  let i = 0;
  wanderTimer = setInterval(() => {
    i += 1;
    const t = i / steps;
    const ease = t * (2 - t); // ease-out，起步略快、到点缓停，更自然
    const nx = Math.round(sx0 + dx * ease);
    const ny = Math.round(sy0 + dy * ease);
    if (win && !win.isDestroyed() && Number.isFinite(nx) && Number.isFinite(ny)) {
      win.setPosition(nx, ny);
    }
    if (i >= steps) {
      clearInterval(wanderTimer);
      wanderTimer = null;
      if (onDone) onDone();
    }
  }, 45);
}

/** 巡游：随机挑一条边（含角落），走一段、停一会、再来 */
function runWanderLeg() {
  if (!wandering || !win || win.isDestroyed()) { wandering = false; return; }
  const wa = screen.getPrimaryDisplay().workArea;
  const edges = ['bottom', 'top', 'left', 'right'];
  const edge = edges[Math.floor(Math.random() * edges.length)];
  const m = 20; // 边缘留白
  let tx = 0;
  let ty = 0;
  if (edge === 'bottom') {
    ty = wa.y + wa.height - PET_H - m;
    tx = wa.x + m + Math.random() * (wa.width - PET_W - 2 * m);
  } else if (edge === 'top') {
    ty = wa.y + m;
    tx = wa.x + m + Math.random() * (wa.width - PET_W - 2 * m);
  } else if (edge === 'left') {
    tx = wa.x + m;
    ty = wa.y + m + Math.random() * (wa.height - PET_H - 2 * m);
  } else {
    tx = wa.x + wa.width - PET_W - m;
    ty = wa.y + m + Math.random() * (wa.height - PET_H - 2 * m);
  }
  // 播放走路动画，并告知朝左/朝右（供渲染进程水平镜像）
  const [curX] = win.getPosition();
  win.webContents.send('pet:walk-dir', tx < curX ? 'left' : 'right');
  sendAction('walk');
  moveWindowTo(tx, ty, () => {
    if (!wandering) return;
    // 到点随机停一下：偶尔伸个懒腰或东张西望，再继续走（更自然）
    const rest = ['idle', 'idle', 'idle', 'stretch', 'lookaround'][Math.floor(Math.random() * 5)];
    sendAction(rest);
    wanderLegs += 1;
    if (wanderLegs >= 5 + Math.floor(Math.random() * 4)) {
      wandering = false; // 巡游结束，安静待一会儿
      return;
    }
    // 伸懒腰 / 张望这类小动作多停一会儿
    const pause = rest === 'idle' ? 900 + Math.random() * 1500 : 1600 + Math.random() * 1600;
    wanderTimer = setTimeout(runWanderLeg, pause);
  });
}

function startWandering() {
  if (!win || win.isDestroyed()) return;
  stopWandering();
  wandering = true;
  wanderLegs = 0;
  runWanderLeg();
}

function createTray() {
  const iconPath = path.join(__dirname, '../../assets/icons/tray-32.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    { label: '查看状态', click: () => sendAction('status') },
    { label: '🚶 桌面巡游（四边闲逛）', click: () => startWandering() },
    { type: 'separator' },
    { label: '说嗨', click: () => sendAction('happy') },
    { label: '喝咖啡', click: () => sendAction('drink') },
    { label: '喂意大利宽面', click: () => sendAction('feed') },
    { label: '玩毛线球', click: () => sendAction('yarn') },
    { label: '追光标', click: () => sendAction('chase') },
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
  ipcMain.on('action', (_e, name) => {
    if (name === 'walk') { startWandering(); return; }
    stopWandering();
    sendAction(name);
  });

  // 渲染进程直接退出
  ipcMain.on('pet:quit', () => { quitting = true; app.quit(); });

  // 拖动宠物：用光标位置增量移动窗口
  ipcMain.on('pet:drag-start', () => {
    stopWandering();
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
    if (Number.isFinite(x + dx) && Number.isFinite(y + dy)) win.setPosition(Math.round(x + dx), Math.round(y + dy));
  });
  ipcMain.on('pet:drag-end', () => {
    dragRef = null;
  });

  // 追光标：把窗口朝光标位置分步扑跳（取整 + 有限数校验，避免 NaN/小数触发崩溃）
  ipcMain.on('pet:chase', () => {
    if (!win || win.isDestroyed()) return;
    stopWandering();
    const b = win.getBounds();
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const p = screen.getCursorScreenPoint();
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist) || dist < 10) {
      if (win && !win.isDestroyed()) win.webContents.send('pet:chase-done');
      return;
    }
    const steps = Math.max(4, Math.min(12, Math.ceil(dist / 26)));
    const sx = dx / dist;
    const sy = dy / dist;
    let i = 0;
    const timer = setInterval(() => {
      if (!win || win.isDestroyed()) { clearInterval(timer); return; }
      const [x, y] = win.getPosition();
      const nx = Math.round(x + sx * 26);
      const ny = Math.round(y + sy * 26);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) { clearInterval(timer); return; }
      win.setPosition(nx, ny);
      i += 1;
      if (i >= steps) {
        clearInterval(timer);
        if (win && !win.isDestroyed()) win.webContents.send('pet:chase-done');
      }
    }, 70);
  });

  // 桌面巡游
  ipcMain.on('pet:walk', () => startWandering());
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
    // 调试/演示用：COC_AUTOWALK=1 时启动后自动开始桌面巡游
    if (process.env.COC_AUTOWALK === '1') setTimeout(startWandering, 1500);
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
