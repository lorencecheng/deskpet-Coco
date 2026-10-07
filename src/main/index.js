/**
 * DeskPet Coco — 主进程
 * 负责创建透明置顶窗口、托盘菜单、拖动定位、桌面巡游与动作 IPC。
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage, shell, powerMonitor } = require('electron');
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

// 追光标（持续追踪）状态
let chasing = false;
let chaseTimer = null;
let chaseSettle = 0;        // 猫已在光标附近"待命"的累计毫秒
let chaseLastCursor = null; // 上一次采样到的光标位置（用于判断光标是否在动）

// 边缘藏猫状态：拖到左/右边缘时收进屏幕外，偶尔探头/尾巴
let hiddenMode = null;      // null | 'left' | 'right'
let peekTimer = null;
let peekAnim = null;

// 小助理状态：久坐提醒 / 天气预警提醒
let sitReminderOn = true;
let sitThresholdMin = 60;
let sitActiveMin = 0;
let sitTimer = null;
let weatherReminderOn = true;
let weatherTimer = null;
let lastWeatherAlert = null;

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
  // 拦截页面跳转：拖文件到窗口上不要被当成打开页面，交给"吃文件"逻辑处理
  win.webContents.on('will-navigate', (e) => e.preventDefault());
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

/** 停止追光标 */
function stopChase() {
  chasing = false;
  if (chaseTimer) { clearInterval(chaseTimer); chaseTimer = null; }
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
  else hx = wa.x + HIDE_PX - PET_W;
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
  const wa = screen.getPrimaryDisplay().workArea;
  tx = Math.max(wa.x, Math.min(wa.x + wa.width - PET_W, tx));
  ty = Math.max(wa.y, Math.min(wa.y + wa.height - PET_H, ty));
  const [sx0, sy0] = win.getPosition();
  const dx = tx - sx0;
  const dy = ty - sy0;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) { if (onDone) onDone(); return; }
  const steps = Math.max(8, Math.min(120, Math.ceil(dist / 8))); // 每步约 8px，更慢更自然
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
  }, 100);
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
  // 先切走路动画，再告知朝左/朝右（顺序重要：否则渲染端 setState 会清掉镜像类）
  sendAction('walk');
  const [curX] = win.getPosition();
  win.webContents.send('pet:walk-dir', tx < curX ? 'left' : 'right');
  moveWindowTo(tx, ty, () => {
    if (!wandering) return;
    // 到点随机停一下：偶尔伸个懒腰或东张西望，再继续走（更自然）
    const rest = ['idle', 'idle', 'idle', 'stretch', 'lookaround'][Math.floor(Math.random() * 5)];
    sendAction(rest);
    wanderLegs += 1;
    // 走 2~4 段后自动停下、安静待一会
    if (wanderLegs >= 2 + Math.floor(Math.random() * 3)) {
      wandering = false;
      return;
    }
    // 伸懒腰 / 张望这类小动作多停一会儿
    const pause = rest === 'idle' ? 900 + Math.random() * 1500 : 1600 + Math.random() * 1600;
    wanderTimer = setTimeout(runWanderLeg, pause);
  });
}

function startWandering() {
  if (!win || win.isDestroyed()) return;
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
    { label: '洗澡', click: () => sendAction('bath') },
    { label: '钓鱼', click: () => sendAction('fishing') },
    { label: '抓痒', click: () => sendAction('scratch') },
    { label: '睡觉', click: () => sendAction('sleep') },
    { type: 'separator' },
    { label: '🤖 小助理提醒', enabled: false },
    { label: '🧍 久坐提醒', type: 'checkbox', checked: sitReminderOn, click: (mi) => { sitReminderOn = mi.checked; } },
    { label: '🌦 天气预警提醒', type: 'checkbox', checked: weatherReminderOn, click: (mi) => { weatherReminderOn = mi.checked; } },
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

  // 右键菜单开/关：临时拉高窗口以容纳全部选项，宠物居中位置不变
  let menuExpanded = false;
  const MENU_OPEN_H = 320; // 菜单展开时窗口高度
  ipcMain.on('pet:menu-resize', (_e, open) => {
    if (!win || win.isDestroyed()) return;
    if (!!open === menuExpanded) return;
    const [x, y, w, h] = [win.getBounds().x, win.getBounds().y, win.getBounds().width, win.getBounds().height];
    if (open) {
      const delta = MENU_OPEN_H - h;
      win.setBounds({ x, y: Math.round(y - delta / 2), width: w, height: MENU_OPEN_H });
    } else {
      const delta = h - PET_H;
      win.setBounds({ x, y: Math.round(y + delta / 2), width: w, height: PET_H });
    }
    menuExpanded = !!open;
  });

  // ---- 小助理：吃文件（把拖到猫身上的文件送入回收站，可恢复） ----
  ipcMain.on('pet:eat-file', async (_e, paths) => {
    if (!Array.isArray(paths)) return;
    const trash = [];
    const skipped = [];
    const appPath = app.getAppPath();
    for (const p of paths) {
      if (!p || typeof p !== 'string' || !path.isAbsolute(p)) { skipped.push(p); continue; }
      // 自我保护：不回收应用自身
      if (appPath && (p === appPath || p.startsWith(appPath + path.sep))) { skipped.push(path.basename(p)); continue; }
      try {
        await shell.trashItem(p); // Windows 上移到回收站（可恢复）
        trash.push(path.basename(p));
      } catch {
        skipped.push(path.basename(p));
      }
    }
    if (win && !win.isDestroyed()) win.webContents.send('pet:eat-file-result', { trash, skipped });
  });

  // ---- 小助理：久坐提醒（监测连续工作时长） ----
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
        if (win && !win.isDestroyed()) win.webContents.send('pet:remind', `已连续工作约 ${mins} 分钟啦，起来伸个懒腰、喝口水吧~ ☕`);
      }
    } else {
      sitActiveMin = 0; // 用户已在休息，不计时
    }
  }
  function startSitMonitor() { stopSitMonitor(); sitTimer = setInterval(sitTick, 60000); }
  function stopSitMonitor() { if (sitTimer) { clearInterval(sitTimer); sitTimer = null; } }

  // ---- 小助理：天气预警提醒（IP 定位 + Open-Meteo 免费接口） ----
  const SEVERE_CODES = [
    { code: 95, label: '雷暴' }, { code: 96, label: '雷暴' }, { code: 99, label: '强雷暴(伴冰雹)' },
    { code: 65, label: '大雨' }, { code: 82, label: '强降雨' },
    { code: 75, label: '大雪' }, { code: 77, label: '大雪' },
    { code: 66, label: '冻雨' }, { code: 67, label: '冻雨' },
    { code: 45, label: '大雾' }, { code: 48, label: '浓雾' }
  ];
  // 免费 IP 定位：优先 ipinfo，失败回退 ip-api
  async function getGeo() {
    try {
      const r = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(6000) });
      const j = await r.json();
      const [lat, lon] = (j.loc || '').split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return { lat, lon, city: (j.city || j.region || '你所在地区').toString() };
      }
    } catch { /* fallthrough */ }
    try {
      const r = await fetch('http://ip-api.com/json/', { signal: AbortSignal.timeout(6000) });
      const j = await r.json();
      if (j.status === 'success' && Number.isFinite(Number(j.lat)) && Number.isFinite(Number(j.lon))) {
        return { lat: Number(j.lat), lon: Number(j.lon), city: (j.city || '你所在地区').toString() };
      }
    } catch { /* fallthrough */ }
    throw new Error('geo-fail');
  }
  async function weatherTick() {
    if (!weatherReminderOn || !win || win.isDestroyed()) return;
    try {
      // 1) IP 粗略定位所在地区
      const geo = await getGeo();
      const lat = geo.lat;
      const lon = geo.lon;
      const city = geo.city;

      // 2) 获取未来 24h 逐小时天气码与温度
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=weather_code,temperature_2m&forecast_days=1&timezone=auto`;
      const wxRes = await fetch(url, { signal: AbortSignal.timeout(9000) });
      const data = await wxRes.json();
      const codes = (data.hourly && data.hourly.weather_code) || [];
      const temps = (data.hourly && data.hourly.temperature_2m) || [];
      if (codes.length === 0) throw new Error('wx-empty');

      // 定位当前小时下标
      const times = (data.hourly && data.hourly.time) || [];
      let hourIdx = 0;
      const nowMs = Date.now();
      for (let i = 0; i < times.length; i++) {
        if (new Date(times[i]).getTime() <= nowMs) hourIdx = i;
      }

      // 3) 扫描未来 6 小时是否有严重天气
      let alert = null;
      const lookAhead = Math.min(hourIdx + 6, codes.length);
      for (let i = hourIdx; i < lookAhead; i++) {
        const c = codes[i];
        const hit = SEVERE_CODES.find((s) => s.code === c);
        if (hit) { alert = hit; break; }
      }

      // 4) 极端温度提醒
      let maxTemp = null;
      for (let i = hourIdx; i < lookAhead; i++) if (Number.isFinite(temps[i])) maxTemp = Math.max(maxTemp || -Infinity, temps[i]);
      let tempAlert = null;
      if (maxTemp !== null && maxTemp >= 35) tempAlert = `高温 ${Math.round(maxTemp)}°C`;
      else if (maxTemp !== null && maxTemp <= -5) tempAlert = `低温 ${Math.round(maxTemp)}°C`;

      const key = alert ? `code-${alert.code}` : (tempAlert ? tempAlert : null);
      if (key && key !== lastWeatherAlert) {
        lastWeatherAlert = key;
        sendAction('lookaround');
        const msg = alert
          ? `🌦 天气提醒（${city}）：未来几小时可能有${alert.label}，出门记得带伞、注意安全哦~`
          : `🌡 天气提醒（${city}）：未来几小时有${tempAlert}，注意防暑/保暖哦~`;
        if (win && !win.isDestroyed()) win.webContents.send('pet:remind', msg);
      }
    } catch {
      // 网络/定位失败：静默，下个周期重试
    }
  }
  function startWeatherMonitor() { stopWeatherMonitor(); weatherTick(); weatherTimer = setInterval(weatherTick, 30 * 60 * 1000); }
  function stopWeatherMonitor() { if (weatherTimer) { clearInterval(weatherTimer); weatherTimer = null; } }

  startSitMonitor();     // 久坐提醒（窗口未就绪时自动跳过）
  startWeatherMonitor(); // 天气预警提醒（失败静默重试）

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
    // 拖到左/右屏幕边缘附近 → 猫藏起来，偶尔探头偷看
    const wa = screen.getPrimaryDisplay().workArea;
    const [x] = win.getPosition();
    if (x + PET_W > wa.x + wa.width - 70) enterEdgeHide('right');
    else if (x < wa.x + 70) enterEdgeHide('left');
  });

  // 追光标：进入持续追踪模式——猫每帧读取光标位置，朝它跑过去；
  // 鼠标移到哪猫就追到哪；鼠标停下后猫追到光标附近即开心收尾并退出。
  ipcMain.on('pet:chase', () => {
    if (!win || win.isDestroyed()) return;
    stopWandering();
    if (chasing) return; // 已在追踪中
    chasing = true;
    chaseSettle = 0;
    chaseLastCursor = screen.getCursorScreenPoint();
    chaseTick();
    chaseTimer = setInterval(chaseTick, 33);
  });

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
