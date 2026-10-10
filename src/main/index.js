/**
 * DeskPet Coco — 主进程
 * 负责创建透明置顶窗口、托盘菜单、拖动定位、桌面巡游与动作 IPC。
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell, powerMonitor, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

// 高 DPI 支持：像素精确、精灵不模糊（透明置顶小窗尤其需要）
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

// 窗口尺寸：基础方块 + 可缩放（原 320 → 256，整体缩小 20%；支持 70%/100%/130%）
let petW = 256;
let petH = 256;
let petSize = 1;      // 尺寸预设：0.7 / 1 / 1.3
let petOpacity = 1;   // 透明度：1 / 0.8 / 0.6

// 外观/窗口行为开关
let fullscreenHideOn = true; // 检测到全屏应用时自动隐藏
let edgeSnapOn = true;       // 拖到屏幕边缘时贴边吸附（关闭则退回"边缘藏猫"）

let win = null;
let tray = null;
let dragRef = null; // { lastX, lastY } 记录拖动时的光标位置
let quitting = false;

// 巡游（桌面四边闲逛）状态
let wandering = false;
let wanderTimer = null;
let wanderLegs = 0;

// 追光标（持续追踪）状态
let chasing = false;
let chaseTimer = null;
let chaseSettle = 0;        // 猫已在光标附近"待命"的累计毫秒
let chaseLastCursor = null; // 上一次采样到的光标位置（用于判断光标是否在动）

// 逗猫小游戏：追光点（一个会跳走的发光小圆点，猫放下巡游去追）
let dotChasing = false;
let dotTimer = null;
let dotWin = null;
let dotEndAt = 0;

// 边缘藏猫状态：拖到左/右边缘时收进屏幕外，偶尔探头/尾巴
let hiddenMode = null;      // null | 'left' | 'right'
let peekTimer = null;
let peekAnim = null;

// 小助理状态：久坐提醒
let sitReminderOn = true;
let sitThresholdMin = 60;
let sitActiveMin = 0;
let sitTimer = null;

/** 获取窗口当前所在显示器的工作区（多显示器适配：窗口钳在它所在屏内，不跨屏飘走） */
function currentWorkArea() {
  try {
    if (win && !win.isDestroyed()) {
      const b = win.getBounds();
      return screen.getDisplayMatching(b).workArea;
    }
  } catch {}
  return screen.getPrimaryDisplay().workArea;
}

/** 窗口创建后始终保持在工作区内，防止拖到屏幕外（按所在显示器钳制） */
function keepInBounds() {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const wa = currentWorkArea();
  let x = b.x;
  let y = b.y;
  if (x < wa.x) x = wa.x;
  if (y < wa.y) y = wa.y;
  if (x + b.width > wa.x + wa.width) x = wa.x + wa.width - b.width;
  if (y + b.height > wa.y + wa.height) y = wa.y + wa.height - b.height;
  if (x !== b.x || y !== b.y) win.setPosition(x, y);
}

// ---- 外观 / 行为设置：尺寸、透明度、全屏隐藏、边缘吸附（跨启动记住） ----
const PREFS_FILE = path.join(app.getPath('userData'), 'prefs.json');
function loadPrefs() {
  try {
    if (fs.existsSync(PREFS_FILE)) {
      const d = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
      if (Number.isFinite(d.size)) petSize = d.size;
      if (Number.isFinite(d.opacity)) petOpacity = d.opacity;
      if (typeof d.fullscreenHideOn === 'boolean') fullscreenHideOn = d.fullscreenHideOn;
      if (typeof d.edgeSnapOn === 'boolean') edgeSnapOn = d.edgeSnapOn;
      if (typeof d.sitReminderOn === 'boolean') sitReminderOn = d.sitReminderOn;
      if (Number.isFinite(d.sitThresholdMin)) sitThresholdMin = d.sitThresholdMin;
    }
  } catch {}
  petW = Math.max(120, Math.round(256 * petSize));
  petH = Math.max(120, Math.round(256 * petSize));
}
function savePrefs() {
  try {
    fs.writeFileSync(PREFS_FILE, JSON.stringify({
      size: petSize, opacity: petOpacity,
      fullscreenHideOn, edgeSnapOn,
      sitReminderOn, sitThresholdMin
    }, null, 2));
  } catch {}
}

function applySize(s) {
  petSize = s;
  const w = Math.max(120, Math.round(256 * s));
  const h = Math.max(120, Math.round(256 * s));
  petW = w; petH = h;
  if (win && !win.isDestroyed()) {
    const b = win.getBounds();
    // 以窗口中心为锚缩放，位置不变
    const nx = Math.round(b.x + (b.width - w) / 2);
    const ny = Math.round(b.y + (b.height - h) / 2);
    win.setBounds({ x: nx, y: ny, width: w, height: h });
    win.setPosition(nx, ny);
  }
  savePrefs();
}
function applyOpacity(v) {
  petOpacity = v;
  if (win && !win.isDestroyed()) win.setOpacity(v);
  savePrefs();
}

// ---- 全屏自动隐藏：检测到全屏应用（游戏 / 播放器）时，猫悄悄藏起来 ----
let fsHidden = false; // 是否因全屏而隐藏
function updateFullscreenState() {
  if (!win || win.isDestroyed()) return;
  if (!fullscreenHideOn) return;
  // workArea 覆盖整个显示器（任务栏/顶栏被全屏占满）即视为全屏模式
  const full = screen.getAllDisplays().some((d) =>
    d.workArea.x === d.bounds.x && d.workArea.y === d.bounds.y &&
    d.workArea.width === d.bounds.width && d.workArea.height === d.bounds.height);
  if (full && !fsHidden) {
    fsHidden = true;
    stopWandering();
    stopChase();
    win.hide();
  } else if (!full && fsHidden) {
    fsHidden = false;
    win.show();
  }
}
function startFullscreenWatch() {
  try {
    screen.on('display-metrics-changed', updateFullscreenState);
    screen.on('display-added', updateFullscreenState);
    screen.on('display-removed', updateFullscreenState);
  } catch {}
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: petW,
    height: petH,
    x: wa.x + wa.width - petW - 48,
    y: wa.y + wa.height - petH - 48,
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
  // 拦截页面跳转：拖文件到窗口上不要被当成打开页面，交给"吃文件"逻辑处理
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.once('ready-to-show', () => {
    if (petOpacity < 1) win.setOpacity(petOpacity);
    win.show();
  });
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

/** 停止追光标 */
function stopChase() {
  chasing = false;
  if (chaseTimer) { clearInterval(chaseTimer); chaseTimer = null; }
}

// ===================== 逗猫小游戏：追光点 =====================
const DOT_SIZE = 26;            // 光点窗口边长
function dotRandomPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  const m = 30;
  return {
    x: wa.x + m + Math.random() * (wa.width - 2 * m),
    y: wa.y + m + Math.random() * (wa.height - 2 * m)
  };
}
/** 创建一个发光小圆点窗口，放到随机位置；返回光点中心坐标 */
function createDot() {
  if (dotWin && !dotWin.isDestroyed()) return;
  dotWin = new BrowserWindow({
    width: DOT_SIZE, height: DOT_SIZE,
    transparent: true, frame: false, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, focusable: false, hasShadow: false,
    webPreferences: { contextIsolation: true }
  });
  dotWin.setAlwaysOnTop(true, 'screen-saver');
  dotWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
    '<body style="margin:0;background:transparent">' +
    '<div style="width:' + DOT_SIZE + 'px;height:' + DOT_SIZE + 'px;border-radius:50%;' +
    'background:radial-gradient(circle at 40% 35%, #fff6c8, #ffd54f 45%, rgba(255,120,0,0) 78%);' +
    'box-shadow:0 0 16px 7px rgba(255,200,60,0.55)"></div></body>'
  ));
  const p = dotRandomPos();
  dotWin.setPosition(Math.round(p.x - DOT_SIZE / 2), Math.round(p.y - DOT_SIZE / 2));
}
/** 猫抓到光点：让光点跳到附近一个新位置，制造"追着跑"的乐趣 */
function relocateDot() {
  if (!dotWin || dotWin.isDestroyed()) return;
  const p = dotRandomPos();
  dotWin.setPosition(Math.round(p.x - DOT_SIZE / 2), Math.round(p.y - DOT_SIZE / 2));
}
function stopDotChase() {
  dotChasing = false;
  if (dotTimer) { clearInterval(dotTimer); dotTimer = null; }
  if (dotWin && !dotWin.isDestroyed()) { try { dotWin.destroy(); } catch {} }
  dotWin = null;
  if (win && !win.isDestroyed()) {
    sendAction('idle');
    win.webContents.send('pet:dotchase-done');
  }
}
/** 每帧把猫朝光点移动，抓到就跳走；总时长到就结束 */
function dotChaseTick() {
  if (!dotChasing || !win || win.isDestroyed()) { stopDotChase(); return; }
  const b = win.getBounds();
  const [dotX, dotY] = dotWin ? dotWin.getPosition() : [0, 0];
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const dx = (dotX + DOT_SIZE / 2) - cx;
  const dy = (dotY + DOT_SIZE / 2) - cy;
  const dist = Math.hypot(dx, dy);
  if (!Number.isFinite(dist)) { stopDotChase(); return; }
  // 转身（供渲染进程水平镜像）
  win.webContents.send('pet:walk-dir', dx < 0 ? 'left' : 'right');
  if (dist < 26) { relocateDot(); return; } // 抓到→光点跳走
  const step = Math.max(3, Math.min(14, dist * 0.30));
  const nx = Math.round(b.x + (dx / dist) * step);
  const ny = Math.round(b.y + (dy / dist) * step);
  if (Number.isFinite(nx) && Number.isFinite(ny)) win.setPosition(nx, ny);
  if (Date.now() > dotEndAt) stopDotChase(); // 玩够了，光点消失
}
function startDotChase() {
  if (!win || win.isDestroyed()) return;
  stopWandering();
  stopChase();
  stopDotChase();
  dotChasing = true;
  createDot();
  dotEndAt = Date.now() + 12000; // 一局约 12 秒
  // 注意：不要在这里 sendAction('dotchase')——渲染端已在 startDotChase 里切好 chase 动画，
  // 再回打会导致 渲染→主→渲染 无限递归（追光点"点了没反应"的根因）。
  dotTimer = setInterval(dotChaseTick, 33);
}

/** 退出边缘藏猫 */
function exitEdgeHide() {
  hiddenMode = null;
  if (peekTimer) { clearTimeout(peekTimer); peekTimer = null; }
  if (peekAnim) { clearInterval(peekAnim); peekAnim = null; }
}

/** 进入边缘藏猫：把窗口收进屏幕边缘外，偶尔探头瞄一下 */
function enterEdgeHide(edge) {
  if (!win || win.isDestroyed()) return;
  stopWandering();
  stopChase();
  exitEdgeHide();
  hiddenMode = edge;
  const wa = screen.getPrimaryDisplay().workArea;
  const HIDE_PX = 28; // 藏起来后屏幕边露出的宽度
  let hx;
  if (edge === 'right') hx = wa.x + wa.width - HIDE_PX;
  else hx = wa.x + HIDE_PX - petW;
  const [, y] = win.getPosition();
  win.setPosition(Math.round(hx), y);
  // 周期性探头：滑出 ~1.4s 再滑回去
  const doPeek = () => {
    if (!hiddenMode || !win || win.isDestroyed()) return;
    const out = edge === 'right' ? hx - 170 : hx + 170; // 探出头的位置
    sendAction('lookaround'); // 探头时东张西望，像在偷看主人
    const steps = 10;
    let i = 0;
    peekAnim = setInterval(() => {
      i += 1;
      const t = i / steps;
      const cx = Math.round(hx + (out - hx) * Math.sin(t * Math.PI)); // 平滑进出
      win.setPosition(cx, y);
      if (i >= steps) {
        clearInterval(peekAnim); peekAnim = null;
        peekTimer = setTimeout(() => { win && !win.isDestroyed() && sendAction('idle'); doPeek2(); }, 1600);
      }
    }, 30);
  };
  const doPeek2 = () => {
    peekTimer = setTimeout(() => { if (hiddenMode) doPeek(); }, 3500 + Math.random() * 3000);
  };
  peekTimer = setTimeout(doPeek, 1500);
}

/** 把窗口平滑移动到 (tx, ty)，到位后回调（慢速、自然，配合走路动画） */
function moveWindowTo(tx, ty, onDone) {
  const wa = currentWorkArea(); // 多显示器：钳在窗口当前所在屏内
  tx = Math.max(wa.x, Math.min(wa.x + wa.width - petW, tx));
  ty = Math.max(wa.y, Math.min(wa.y + wa.height - petH, ty));
  const [sx0, sy0] = win.getPosition();
  const dx = tx - sx0;
  const dy = ty - sy0;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) { if (onDone) onDone(); return; }
  // 每步约 4px、间隔 60ms ≈ 66px/s，像悠闲散步而不是图片滑动
  const steps = Math.max(10, Math.ceil(dist / 4));
  let i = 0;
  wanderTimer = setInterval(() => {
    i += 1;
    const t = i / steps;
    const ease = t * (2 - t); // ease-out，起步略快、到点缓停
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
  }, 60);
}

/** 巡游：只沿屏幕底部横向溜达——走一段、停一会（伸懒腰/张望）、再来，几趟后自动停下 */
function runWanderLeg() {
  if (!wandering || !win || win.isDestroyed()) { wandering = false; return; }
  const wa = currentWorkArea(); // 多显示器：贴当前屏底部
  const m = 24;
  const ty = wa.y + wa.height - petH - m; // 固定贴底，不再跳上/左/右边
  const [curX] = win.getPosition();
  // 选一个横向目标：尽量离当前位置远一点，避免原地打转
  let tx;
  const leftTarget = wa.x + m;
  const rightTarget = wa.x + wa.width - petW - m;
  if (curX < wa.x + wa.width / 2) tx = rightTarget;
  else tx = leftTarget;
  // 先切走路动画，再告知朝左/朝右（顺序重要：否则渲染端 setState 会清掉镜像类）
  sendAction('walk');
  win.webContents.send('pet:walk-dir', tx < curX ? 'left' : 'right');
  moveWindowTo(tx, ty, () => {
    if (!wandering) return;
    // 到点随机停一下：偶尔伸个懒腰或东张西望，再继续走（更自然）
    const rest = ['idle', 'idle', 'idle', 'stretch', 'lookaround'][Math.floor(Math.random() * 5)];
    sendAction(rest);
    wanderLegs += 1;
    // 走 2~3 段后自动停下、安静待一会（不再无限巡游）
    if (wanderLegs >= 2 + Math.floor(Math.random() * 2)) {
      wandering = false;
      sendAction('idle');
      return;
    }
    // 伸懒腰 / 张望这类小动作多停一会儿
    const pause = rest === 'idle' ? 1200 + Math.random() * 1600 : 2000 + Math.random() * 1600;
    wanderTimer = setTimeout(runWanderLeg, pause);
  });
}

function startWandering() {
  if (!win || win.isDestroyed()) return;
  stopDotChase(); // 与追光点互斥：抢窗口位置会造成"巡游不走/光点覆盖位置"
  stopChase();
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
    { label: '逗猫·追光点', click: () => sendAction('dotchase') },
    { label: '洗澡', click: () => sendAction('bath') },
    { label: '钓鱼', click: () => sendAction('fishing') },
    { label: '抓痒', click: () => sendAction('scratch') },
    { label: '睡觉', click: () => sendAction('sleep') },
    { type: 'separator' },
    { label: '🤖 小助理提醒', enabled: false },
    { label: '🧍 久坐提醒', type: 'checkbox', checked: sitReminderOn, click: (mi) => { sitReminderOn = mi.checked; } },
    {
      label: '久坐提醒间隔',
      submenu: [
        { label: '30 分钟', type: 'radio', checked: sitThresholdMin === 30, click: () => setSitThreshold(30) },
        { label: '60 分钟', type: 'radio', checked: sitThresholdMin === 60, click: () => setSitThreshold(60) },
        { label: '90 分钟', type: 'radio', checked: sitThresholdMin === 90, click: () => setSitThreshold(90) }
      ]
    },
    { type: 'separator' },
    { label: '🎛️ 外观与窗口', enabled: false },
    {
      label: '透明度',
      submenu: [
        { label: '100%（不透明）', type: 'radio', checked: petOpacity === 1, click: () => applyOpacity(1) },
        { label: '80%', type: 'radio', checked: petOpacity === 0.8, click: () => applyOpacity(0.8) },
        { label: '60%', type: 'radio', checked: petOpacity === 0.6, click: () => applyOpacity(0.6) }
      ]
    },
    {
      label: '尺寸',
      submenu: [
        { label: '小 (70%)', type: 'radio', checked: petSize === 0.7, click: () => applySize(0.7) },
        { label: '中 (100%)', type: 'radio', checked: petSize === 1, click: () => applySize(1) },
        { label: '大 (130%)', type: 'radio', checked: petSize === 1.3, click: () => applySize(1.3) }
      ]
    },
    { label: '🖥️ 全屏时自动隐藏', type: 'checkbox', checked: fullscreenHideOn, click: (mi) => { fullscreenHideOn = mi.checked; if (!fullscreenHideOn) { fsHidden = false; if (win && !win.isDestroyed() && !win.isVisible()) win.show(); } savePrefs(); } },
    { label: '🧲 拖到屏幕边缘吸附', type: 'checkbox', checked: edgeSnapOn, click: (mi) => { edgeSnapOn = mi.checked; savePrefs(); } },
    { label: '🗑️ 提示：把文件拖到猫身上，猫会吃掉它(送入回收站)', enabled: false },
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

  // 读取精灵图为 dataURL（渲染端调色用；主进程读文件，规避 CSP 与 canvas 污染）
  ipcMain.handle('read-sprite', (_e, relPath) => {
    try {
      const abs = path.join(__dirname, '..', '..', 'assets', 'sprites', relPath);
      const buf = fs.readFileSync(abs);
      const ext = path.extname(abs).toLowerCase();
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.gif' ? 'image/gif' : 'image/png';
      return 'data:' + mime + ';base64,' + buf.toString('base64');
    } catch { return null; }
  });

  // 右键菜单开/关：向上扩窗以容纳全部选项，窗口底边固定（猫在屏幕上的位置不动）
  let menuExpanded = false;
  const MENU_OPEN_H = 486; // 菜单展开时窗口高度（快捷区 + 最多展开一个分组也能放下）
  ipcMain.on('pet:menu-resize', (_e, open) => {
    if (!win || win.isDestroyed()) return;
    if (!!open === menuExpanded) return;
    const b = win.getBounds();
    const target = open ? Math.max(MENU_OPEN_H, petH) : petH;
    const bottom = b.y + b.height; // 底边锚点：扩窗/缩窗都保持它不动
    win.setBounds({ x: b.x, y: Math.round(bottom - target), width: b.width, height: target });
    menuExpanded = !!open;
  });

  // 皮肤工坊等面板开/关：向上扩窗容纳面板，窗口底边固定（猫不被顶走）
  let panelExpanded = false;
  const PANEL_OPEN_H = 460;
  ipcMain.on('pet:panel-resize', (_e, open) => {
    if (!win || win.isDestroyed()) return;
    if (!!open === panelExpanded) return;
    const b = win.getBounds();
    const target = open ? Math.max(PANEL_OPEN_H, petH) : petH;
    const bottom = b.y + b.height;
    win.setBounds({ x: b.x, y: Math.round(bottom - target), width: b.width, height: target });
    panelExpanded = !!open;
  });

  // ---- 皮肤工坊 · 拍照：保存像素档案卡 PNG 到「图片/DeskPet Coco」，并写入剪贴板 ----
  ipcMain.handle('pet:save-photo', (_e, dataUrl) => {
    try {
      const img = nativeImage.createFromDataURL(dataUrl);
      if (img.isEmpty()) return { path: '' };
      const dir = path.join(app.getPath('pictures'), 'DeskPet Coco');
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const file = path.join(dir, `Coco-${stamp}.png`);
      fs.writeFileSync(file, img.toPNG());
      clipboard.writeImage(img);
      return { path: file };
    } catch { return { path: '' }; }
  });
  ipcMain.handle('pet:copy-photo', (_e, dataUrl) => {
    try {
      const img = nativeImage.createFromDataURL(dataUrl);
      if (!img.isEmpty()) clipboard.writeImage(img);
    } catch {}
    return true;
  });

  // ---- 小助理：吃文件（把拖到猫身上的文件送入回收站，可恢复） ----
  // 危险文件（程序/脚本/系统目录）拒绝吃掉，避免误删
  const REFUSE_EXTS = new Set(['.exe', '.lnk', '.bat', '.cmd', '.com', '.sys', '.msi', '.ps1', '.vbs', '.jar']);
  function isDangerous(p) {
    const ext = path.extname(p).toLowerCase();
    if (REFUSE_EXTS.has(ext)) return true;
    if (/Program Files( \(x86\))?/i.test(p)) return true;
    if (/[\\/]Windows[\\/]/i.test(p) || /^[a-zA-Z]:[\\/]Windows$/i.test(p)) return true;
    return false;
  }
  ipcMain.on('pet:eat-file', async (_e, paths) => {
    if (!Array.isArray(paths)) return;
    const trash = [];
    const skipped = [];
    const refused = [];
    const appPath = app.getAppPath();
    for (const p of paths) {
      if (!p || typeof p !== 'string' || !path.isAbsolute(p)) { skipped.push(p); continue; }
      // 自我保护：不回收应用自身
      if (appPath && (p === appPath || p.startsWith(appPath + path.sep))) { skipped.push(path.basename(p)); continue; }
      // 危险文件：拒绝吃掉，提示用系统删除
      if (isDangerous(p)) { refused.push(path.basename(p)); continue; }
      try {
        await shell.trashItem(p); // Windows 上移到回收站（可恢复）
        trash.push(path.basename(p));
      } catch {
        skipped.push(path.basename(p));
      }
    }
    if (win && !win.isDestroyed()) win.webContents.send('pet:eat-file-result', { trash, skipped, refused });
  });

  // ---- 小助理：久坐提醒（监测连续工作时长） ----
  const SIT_MESSAGES = [
    '已连续工作约 {m} 分钟啦，起来伸个懒腰、喝口水吧~ ☕',
    '坐挺久了哦，站起来走动一下，眼睛也歇一歇~ 👀',
    '到点啦！伸个懒腰，起身倒杯水，回来继续~ 💪',
    '久坐容易腰酸，快起来活动几分钟吧~ 🐱'
  ];
  function setSitThreshold(mins) { sitThresholdMin = mins; sitActiveMin = 0; }
  function sitTick() {
    if (!sitReminderOn || !win || win.isDestroyed()) return;
    let idle = 0;
    try { idle = powerMonitor.getSystemIdleTime(); } catch { idle = 0; }
    if (idle < 120) {
      sitActiveMin += 1;
      if (sitActiveMin >= sitThresholdMin) {
        const mins = sitActiveMin;
        sitActiveMin = 0;
        sendAction('stretch');
        const msg = SIT_MESSAGES[Math.floor(Math.random() * SIT_MESSAGES.length)].replace('{m}', mins);
        if (win && !win.isDestroyed()) win.webContents.send('pet:remind', msg);
      }
    } else {
      sitActiveMin = 0; // 用户已在休息，不计时
    }
  }
  function startSitMonitor() { stopSitMonitor(); sitTimer = setInterval(sitTick, 60000); }
  function stopSitMonitor() { if (sitTimer) { clearInterval(sitTimer); sitTimer = null; } }

  startSitMonitor();     // 久坐提醒（窗口未就绪时自动跳过）

  // 拖动宠物：用光标位置增量移动窗口
  ipcMain.on('pet:drag-start', () => {
    stopWandering();
    exitEdgeHide(); // 重新拖拽就从藏身处出来
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
    if (!win || win.isDestroyed()) return;
    const wa = screen.getPrimaryDisplay().workArea;
    const [x, y] = win.getPosition();
    if (edgeSnapOn) {
      // 吸附模式：靠近左/右边缘时贴边蹲坐（不再藏起来），关闭吸附则退回藏猫
      const SNAP_PX = 40;
      if (x + petW > wa.x + wa.width - SNAP_PX) win.setPosition(wa.x + wa.width - petW, y);
      else if (x < wa.x + SNAP_PX) win.setPosition(wa.x, y);
    } else {
      if (x + petW > wa.x + wa.width - 70) enterEdgeHide('right');
      else if (x < wa.x + 70) enterEdgeHide('left');
    }
  });

  // 追光标：进入持续追踪模式——猫每帧读取光标位置，朝它跑过去；
  // 鼠标移到哪猫就追到哪；鼠标停下后猫追到光标附近即开心收尾并退出。
  ipcMain.on('pet:chase', () => {
    if (!win || win.isDestroyed()) return;
    stopWandering();
    stopDotChase(); // 与追光点互斥，避免两个追踪器同时抢窗口位置
    if (chasing) return; // 已在追踪中
    chasing = true;
    chaseSettle = 0;
    chaseLastCursor = screen.getCursorScreenPoint();
    chaseTick();
    chaseTimer = setInterval(chaseTick, 33);
  });
  // 渲染端兜底超时后主动停止追踪（避免动画与窗口脱节）
  ipcMain.on('pet:chase-stop', () => stopChase());

  function chaseTick() {
    if (!chasing || !win || win.isDestroyed()) { stopChase(); return; }
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist)) { stopChase(); return; }

    // 朝左/朝右转身（供渲染进程水平镜像）
    win.webContents.send('pet:walk-dir', dx < 0 ? 'left' : 'right');

    const CATCH = 22; // 追到判定距离
    if (dist < CATCH) {
      // 已在光标附近：若光标仍静止就待命计时，超时开心收尾；光标一动就继续追
      if (!chaseLastCursor) chaseLastCursor = p;
      const moved = Math.hypot(p.x - chaseLastCursor.x, p.y - chaseLastCursor.y);
      chaseLastCursor = p;
      chaseSettle = moved < 4 ? chaseSettle + 33 : 0;
      if (chaseSettle >= 900) {
        stopChase();
        if (win && !win.isDestroyed()) win.webContents.send('pet:chase-done');
      }
      return;
    }

    // 光标在移动：重置待命计时，平滑追赶（远快近缓，避免过快突兀）
    chaseSettle = 0;
    chaseLastCursor = p;
    const step = Math.max(2.5, Math.min(16, dist * 0.30));
    const nx = Math.round(b.x + (dx / dist) * step);
    const ny = Math.round(b.y + (dy / dist) * step);
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) { stopChase(); return; }
    win.setPosition(nx, ny);
  }

  // 桌面巡游
  ipcMain.on('pet:walk', () => startWandering());

  // 逗猫小游戏：追光点
  ipcMain.on('pet:dotchase', () => startDotChase());
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
    loadPrefs(); // 先恢复上次的外观/行为设置（尺寸、透明度、开关）
    registerIpc();
    createWindow();
    createTray();
    startFullscreenWatch(); // 检测全屏应用时自动隐藏
    // 调试/演示用：COC_AUTOWALK=1 时启动后自动开始桌面巡游
    if (process.env.COC_AUTOWALK === '1') setTimeout(startWandering, 1500);
    // 调试/演示用：COC_AUTOCHASE=1 时启动后自动进入追光标模式（端到端：渲染端 startChase → 主进程持续追踪）
    if (process.env.COC_AUTOCHASE === '1') {
      win.webContents.once('did-finish-load', () => {
        const trigger = () => { if (win && !win.isDestroyed()) win.webContents.send('pet:action', 'chase'); };
        setTimeout(trigger, 1500);
        setInterval(trigger, 1500); // 周期重触发，便于持续演示"鼠标移到哪猫追到哪"
      });
    }
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
