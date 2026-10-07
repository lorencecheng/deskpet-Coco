/**
 * DeskPet Coco — 渲染进程：宠物状态机与交互
 *
 * 设计要点：
 *  - 精灵资源完全可替换：每个状态读取 assets/sprites/<状态>/frame-1.png …
 *    若有多个 frame-N 则自动逐帧播放；只有一个则用 CSS 动画让形象“活”起来。
 *  - 状态：idle / idle-blink / happy / feed / bath / fishing / scratch / drag / drop / sleep
 */
(function () {
  'use strict';

  const SPRITE_BASE = '../../assets/sprites';

  // 逐帧播放节奏：数值越小越慢、越柔和（原 6fps 偏快，降到 4fps 更舒服）
  const ANIM_FPS = 4;

  // ---- 状态配置（duration=null 表示保持到被切换）----
  const STATES = {
    idle:        { duration: null, cls: 'pet-idle', fps: 2 },
    'idle-blink':{ duration: 280, cls: 'pet-idle' },
    walk:        { duration: null, cls: 'pet-walk', fps: 7 },
    stretch:     { duration: 2600, cls: 'pet-stretch', fps: 3 },
    lookaround:  { duration: 2200, cls: 'pet-lookaround', fps: 3 },
    drink:       { duration: 5200, cls: 'pet-drink', fps: 3 },
    yarn:        { duration: 4500, cls: 'pet-yarn', fps: 4 },
    chase:       { duration: null, cls: 'pet-chase', sprite: 'walk', fps: 12 },
    happy:       { duration: 2000, cls: 'pet-happy', fps: 4 },
    feed:        { duration: 4200, cls: 'pet-feed', fps: 4 },
    bath:        { duration: 5200, cls: 'pet-bath', fps: 3 },
    fishing:     { duration: 4300, cls: 'pet-fishing' },
    scratch:     { duration: 3400, cls: 'pet-scratch' },
    drag:        { duration: null, cls: 'pet-drag' },
    drop:        { duration: 520, cls: 'pet-drop', sprite: 'core' },
    sleep:       { duration: null, cls: 'pet-sleep', fps: 2 }
  };

  const petImg = document.getElementById('petImg');
  const menu = document.getElementById('menu');
  const bubble = document.getElementById('bubble');
  const indicator = document.getElementById('indicator');
  const needsPanel = document.getElementById('needsPanel');

  // preload 桥；在纯浏览器调试时退化为空实现，避免报错
  const api = window.coco || {
    onAction() { return () => {}; },
    triggerAction() {},
    dragStart() {}, dragMove() {}, dragEnd() {},
    chase() {}, onChaseDone() { return () => {}; },
    walk() {}, quit() {}, onWalkDir() { return () => {}; },
    menuResize() {}
  };

  // ---- 精灵帧加载与缓存 ----
  const framesCache = {};
  function probeFrames(state) {
    if (framesCache[state]) return Promise.resolve(framesCache[state]);
    return (async () => {
      const list = [];
      for (let i = 1; i <= 12; i++) {
        const url = `${SPRITE_BASE}/${state}/frame-${i}.png`;
        try {
          const ok = await new Promise((res) => {
            const t = new Image();
            t.onload = () => res(true);
            t.onerror = () => res(false);
            t.src = url;
          });
          if (!ok) break;
          list.push(url);
        } catch (e) { break; }
      }
      framesCache[state] = list;
      return list;
    })();
  }

  // ---- 逐帧动画 ----
  let animTimer = null;
  let frameIdx = 0;
  function stopAnim() {
    if (animTimer) { clearInterval(animTimer); animTimer = null; }
  }
  function startAnim(frames, fps) {
    stopAnim();
    frameIdx = 0;
    petImg.src = frameSrc(frames[0]);
    animTimer = setInterval(() => {
      frameIdx = (frameIdx + 1) % frames.length;
      petImg.src = frameSrc(frames[frameIdx]);
    }, 1000 / fps);
  }

  // ---- 状态机 ----
  let currentState = null;
  let idleSince = null;
  let autoTimer = null;
  let chaseTimeout = null;

  function setState(name) {
    const cfg = STATES[name];
    if (!cfg) return;

    // 保留水平镜像类（pet-facing-left），避免换状态时被清掉导致朝左丢失
    const facingLeft = petImg.classList.contains('pet-facing-left');

    currentState = name;
    petImg.className = '';
    void petImg.offsetWidth; // 强制重启 CSS 动画
    if (facingLeft) petImg.classList.add('pet-facing-left');
    petImg.classList.add(cfg.cls || 'pet-idle');

    const sprite = cfg.sprite || name; // 某些状态复用其他精灵帧（walk 用 idle 帧 + 走路动画）
    probeFrames(sprite).then((frames) => {
      if (currentState !== name) return; // 状态已切换，丢弃过期帧
      if (frames.length > 1) {
        startAnim(frames, cfg.fps || ANIM_FPS);
      } else {
        stopAnim();
        petImg.src = frameSrc(`${SPRITE_BASE}/${sprite}/frame-1.png`);
      }
    });

    if (name === 'idle') idleSince = Date.now();
    else if (name !== 'idle-blink') idleSince = null;

    // 有限时长状态到时自动回待机
    clearTimeout(autoTimer);
    if (cfg.duration) autoTimer = setTimeout(() => setState('idle'), cfg.duration);
  }

  // ---- 待机时的随机灵动行为：眨眼 / 偶尔挥手、挠痒 / 长时间发呆则睡觉 ----
  let idleLoopTimer = null;
  function scheduleIdleLoop() {
    clearTimeout(idleLoopTimer);
    idleLoopTimer = setTimeout(() => {
      if (currentState === 'idle') {
        const roll = Math.random();
        if (roll < 0.55) setState('idle-blink');          // 眨眼
        else if (roll < 0.68) setState(Math.random() < 0.5 ? 'happy' : 'scratch'); // 少量小动作
        // 其余情况安静待机，动作不频繁
      }
      scheduleIdleLoop();
    }, 3600 + Math.random() * 4800);   // 拉长间隔，动作更从容（原 2.4~6s → 3.6~8.4s）
  }

  function checkLongIdle() {
    if (currentState === 'idle' && idleSince && Date.now() - idleSince > 90000) {
      setState('sleep'); // 太安静了就睡一会
    }
    setTimeout(checkLongIdle, 5000);
  }

  // ---- 需求系统：饱食 / 清洁 / 精力 / 心情 ----
  const NEED_DEFS = {
    hunger: { label: '饱食', icon: '🍝', threshold: 35, decay: 1.1,
      hints: ['我饿啦~ 想吃意大利宽面~', '肚子咕咕叫，给我来碗面嘛~', '好饿……面条在哪里呀~'] },
    clean:  { label: '清洁', icon: '🛁', threshold: 35, decay: 0.9,
      hints: ['身上脏脏的~ 想洗个泡泡浴~', '我该洗澡啦，泡泡澡最舒服~', '毛都打结了，帮我洗香香~'] },
    energy: { label: '精力', icon: '😴', threshold: 30, decay: 0.6,
      hints: ['好困呀~ 想蜷起来睡一觉~', '眼皮好重……让我眯一会儿~', '累啦，先睡一觉补补能量~'] },
    mood:   { label: '心情', icon: '🎈', threshold: 40, decay: 1.6,
      hints: ['好无聊呀~ 陪我玩嘛~', '一个人待着好没劲，来逗逗我~', '我超想追着你的光标跑！'] }
  };
  let needs = { hunger: 100, clean: 100, energy: 100, mood: 100 };
  // 单机养成：把四维状态存到本地，重启后继续（长时间不理就会掉）
  function saveNeeds() {
    try { localStorage.setItem('coco.needs', JSON.stringify(needs)); } catch {}
  }
  function loadNeeds() {
    try {
      const n = JSON.parse(localStorage.getItem('coco.needs'));
      if (n && typeof n === 'object') {
        for (const k of Object.keys(NEED_DEFS)) {
          if (Number.isFinite(n[k])) needs[k] = Math.max(0, Math.min(100, n[k]));
        }
      }
    } catch {}
  }
  const lastHintAt = { hunger: 0, clean: 0, energy: 0, mood: 0 };
  let bubbleTimer = null;

  function showBubble(text, ms) {
    bubble.textContent = text;
    bubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms || 6000);
  }

  // ===================== 皮肤工坊：运行时调色 =====================
  // 原理：不修改任何 PNG 精灵，只对"猫咪本体像素"做颜色替换。
  // 先自动识别原橘猫的毛色/条纹/腮红三种参考色；换肤时只替换与参考色接近的像素，
  // 并保留原像素的明暗关系（阴影/条纹自然迁移到新毛色），道具色（碗/面条/杯）与
  // 黑色轮廓完全不动，保证像素锐利、四肢正确。
  const PRESETS = {
    orange: { fur: '#f6a64b', name: '橘猫' },
    black:  { fur: '#3a3741', name: '黑猫' },
    white:  { fur: '#f6f0e2', name: '白猫' },
    cream:  { fur: '#f4d9a8', name: '奶油' },
    gray:   { fur: '#9698a0', name: '灰猫' },
    brown:  { fur: '#a47046', name: '狸花' },
    calico: { fur: '#dd8c52', name: '三花' }
  };
  let skinScheme = { active: false, fur: PRESETS.orange.fur, name: PRESETS.orange.name };
  let lastCustom = null;
  let recolorCache = {};
  let recolorPending = {};
  let furPalette = null;

  const skinPanel = document.getElementById('skinPanel');
  const skinFur = document.getElementById('skinFur');
  const skinCode = document.getElementById('skinCode');

  function hexToRgb(h) { h = h.replace('#', ''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgbToHex(c) { return '#' + ((1 << 24) + (c[0] << 16) + (c[1] << 8) + c[2]).toString(16).slice(1); }
  function rgbToHsl(c) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0; const l = (mx + mn) / 2;
    const d = mx - mn;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hslToRgb(hsl) {
    let [h, s, l] = hsl;
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  function hslToHex(h, s, l) { return rgbToHex(hslToRgb([h, s, l])); }
  function lum(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function rgbDist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
  // 按亮度比例缩放给定颜色的明度（保持色相/饱和度），用于把原图明暗梯度迁移到新毛色
  function scaleLightness(base, factor) {
    const [h, s, l] = rgbToHsl(base);
    const f = Math.max(0.25, Math.min(2.5, factor));
    return hslToRgb([h, s, Math.max(0, Math.min(1, l * f))]);
  }

  async function loadBitmap(url) {
    const rel = url.indexOf(SPRITE_BASE + '/') === 0 ? url.slice((SPRITE_BASE + '/').length) : null;
    const dataUrl = rel ? await api.readSprite(rel) : null;
    const src = dataUrl || url;
    const img = new Image();
    img.src = src;
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('load')); });
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth || img.width;
    cv.height = img.naturalHeight || img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return { cv, ctx };
  }

  async function detectFurPalette() {
    if (furPalette) return furPalette;
    try {
      const { cv, ctx } = await loadBitmap(`${SPRITE_BASE}/core/frame-1.png`);
      const img = ctx.getImageData(0, 0, cv.width, cv.height);
      const d = img.data;
      let sum = [0, 0, 0], n = 0, sumS = [0, 0, 0], ns = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]; if (a < 128) continue;
        const [h, s, l] = rgbToHsl([d[i], d[i + 1], d[i + 2]]);
        if (h >= 8 && h <= 46 && s > 0.22 && l > 0.22 && l < 0.9) { // 毛色 + 条纹（同属橘色系）
          if (l < 0.55) { sumS[0] += d[i]; sumS[1] += d[i + 1]; sumS[2] += d[i + 2]; ns++; }
          else { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; n++; }
        }
      }
      furPalette = {
        base: n ? [Math.round(sum[0] / n), Math.round(sum[1] / n), Math.round(sum[2] / n)] : null,
        stripe: ns ? [Math.round(sumS[0] / ns), Math.round(sumS[1] / ns), Math.round(sumS[2] / ns)] : null
      };
    } catch {
      furPalette = { base: [230, 160, 70], stripe: [190, 110, 40] };
    }
    return furPalette;
  }

  async function ensureRecolored(url) {
    if (!skinScheme.active) return url;
    if (recolorCache[url]) return recolorCache[url];
    if (recolorPending[url]) return recolorPending[url];
    recolorPending[url] = (async () => {
      try {
        const pal = await detectFurPalette();
        const { cv, ctx } = await loadBitmap(url);
        const img = ctx.getImageData(0, 0, cv.width, cv.height);
        const d = img.data;
        const furRgb = hexToRgb(skinScheme.fur);
        const stripeFactor = (pal.base && pal.stripe) ? lum(pal.stripe) / Math.max(1, lum(pal.base)) : 0.7;
        const stripeRgb = scaleLightness(furRgb, stripeFactor);
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3]; if (a < 128) continue;
          const p = [d[i], d[i + 1], d[i + 2]];
          // 色相门控：只染橘色系本体像素（约 [8,42]），道具色（黄面/白碗/咖啡杯）与
          // 粉色腮红/心形都保留原样，不做改动
          const hh = rgbToHsl(p)[0];
          const inFurHue = hh >= 8 && hh <= 42;
          if (pal.base && inFurHue && rgbDist(p, pal.base) < 60) {
            const f = lum(p) / Math.max(1, lum(pal.base));
            const c = scaleLightness(furRgb, f); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; continue;
          }
          if (pal.stripe && inFurHue && rgbDist(p, pal.stripe) < 60) {
            const f = lum(p) / Math.max(1, lum(pal.stripe));
            const c = scaleLightness(stripeRgb, f); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
          }
        }
        ctx.putImageData(img, 0, 0);
        recolorCache[url] = cv.toDataURL('image/png');
      } catch { recolorCache[url] = url; }
      return recolorCache[url];
    })();
    try { return await recolorPending[url]; } finally { delete recolorPending[url]; }
  }

  function frameSrc(url) {
    if (!skinScheme.active) return url;
    if (recolorCache[url]) return recolorCache[url];
    ensureRecolored(url); // 未重染则后台准备，下一帧自动换上
    return url;
  }

  function persistSkin() {
    try { localStorage.setItem('coco.skin', JSON.stringify(skinScheme)); } catch {}
    try { localStorage.setItem('coco.skin.custom', JSON.stringify(lastCustom || null)); } catch {}
  }
  function restoreSkin() {
    try {
      const s = JSON.parse(localStorage.getItem('coco.skin'));
      if (s && typeof s === 'object' && typeof s.active === 'boolean') skinScheme = s;
    } catch {}
    try {
      const c = JSON.parse(localStorage.getItem('coco.skin.custom'));
      if (c && typeof c === 'object' && c.fur) lastCustom = { fur: c.fur, name: c.name || '自定义' };
    } catch {}
  }

  async function applySkin(scheme) {
    skinScheme.active = !!(scheme && scheme.active !== false);
    if (skinScheme.active) {
      skinScheme.fur = scheme.fur || PRESETS.orange.fur;
      skinScheme.name = scheme.name || skinScheme.name || '自定义';
    }
    recolorCache = {};
    persistSkin();
    const urls = [];
    for (const k of Object.keys(framesCache)) for (const u of framesCache[k]) urls.push(u);
    if (urls.length) await Promise.all(urls.map(ensureRecolored));
    // 刷新当前显示
    const name = currentState;
    if (name && STATES[name]) {
      const cfg = STATES[name];
      const sprite = cfg.sprite || name;
      probeFrames(sprite).then((frames) => {
        if (currentState !== name) return;
        if (frames.length > 1) startAnim(frames, cfg.fps || ANIM_FPS);
        else { stopAnim(); petImg.src = frameSrc(`${SPRITE_BASE}/${sprite}/frame-1.png`); }
      });
    }
  }

  function syncSkinInputs() {
    skinFur.value = skinScheme.active ? skinScheme.fur : PRESETS.orange.fur;
  }
  function updateSkinCode() {
    const fur = (skinScheme.active ? skinScheme.fur : PRESETS.orange.fur).replace('#', '');
    const nm = skinScheme.active ? (skinScheme.name || '自定义') : PRESETS.orange.name;
    skinCode.value = `coco:${nm}#${fur}`;
  }
  function parseSkinCode(t) {
    // 新格式 coco:名字#hex；兼容旧格式 coco#hex / coco#hex#cheek
    let m = /^coco:([^#]+)#([0-9a-fA-F]{6})$/.exec((t || '').trim());
    if (m) return { active: true, fur: '#' + m[2].toLowerCase(), name: m[1] };
    m = /^coco#([0-9a-fA-F]{6})(?:#[0-9a-fA-F]{6})?$/.exec((t || '').trim());
    if (!m) return null;
    return { active: true, fur: '#' + m[1].toLowerCase() };
  }
  // 随机配色只从「现实存在的猫色」中取样，避免出现蓝/绿等不自然颜色
  function randomRealFur() {
    const bands = [
      { h: [26, 42], s: [0.5, 0.68], l: [0.5, 0.66] },   // 橘/虎斑
      { h: [15, 32], s: [0.3, 0.5], l: [0.3, 0.46] },    // 狸花棕
      { h: [40, 50], s: [0.28, 0.45], l: [0.72, 0.86] }, // 奶油/杏
      { h: [0, 360], s: [0.02, 0.12], l: [0.35, 0.72] }, // 灰/蓝灰(中性)
      { h: [0, 360], s: [0.0, 0.15], l: [0.12, 0.22] }   // 近黑
    ];
    const b = bands[Math.floor(Math.random() * bands.length)];
    const h = b.h[0] + Math.random() * (b.h[1] - b.h[0]);
    const s = b.s[0] + Math.random() * (b.s[1] - b.s[0]);
    const l = b.l[0] + Math.random() * (b.l[1] - b.l[0]);
    return hslToHex(h, s, l);
  }

  function openSkinPanel() {
    hideMenu();
    syncSkinInputs();
    updateSkinCode();
    skinPanel.hidden = false;
    api.panelResize(true);
  }
  function closeSkinPanel() {
    skinPanel.hidden = true;
    api.panelResize(false);
  }
  function applyCustom(fur, name) {
    lastCustom = { fur, name: name || '自定义' };
    skinScheme.name = lastCustom.name;
    applySkin({ active: true, fur, name: skinScheme.name });
    updateSkinCode();
    persistSkin();
  }

  // 皮肤面板事件绑定
  document.querySelectorAll('.skin-presets button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.skin;
      if (key === 'mine') { if (lastCustom) applyCustom(lastCustom.fur, lastCustom.name); else showBubble('还没有自定义配色，先调一下试试~', 3000); }
      else if (key === 'orange') { applySkin({ active: false, name: PRESETS.orange.name }); }
      else { const p = PRESETS[key]; if (p) applyCustom(p.fur, p.name); }
      syncSkinInputs(); updateSkinCode();
    });
  });
  skinFur.addEventListener('input', () => applyCustom(skinFur.value));
  document.getElementById('skinRandom').addEventListener('click', () => { applyCustom(randomRealFur(), '随机'); syncSkinInputs(); updateSkinCode(); });
  document.getElementById('skinDefault').addEventListener('click', () => { applySkin({ active: false, name: PRESETS.orange.name }); syncSkinInputs(); updateSkinCode(); });
  document.getElementById('skinExport').addEventListener('click', () => { api.clipboardWrite(skinCode.value); showBubble('配色码已复制，发给朋友吧~ 🎨', 3000); });
  document.getElementById('skinImport').addEventListener('click', () => {
    const s = parseSkinCode(api.clipboardRead());
    if (s) { applyCustom(s.fur, s.name); syncSkinInputs(); updateSkinCode(); showBubble('已应用朋友的同款配色~ 🎨', 3000); }
    else showBubble('剪贴板里没有有效的配色码哦', 3000);
  });
  document.getElementById('skinClose').addEventListener('click', closeSkinPanel);

  function updateIndicator() {
    const low = Object.keys(NEED_DEFS).filter((k) => needs[k] < NEED_DEFS[k].threshold);
    indicator.textContent = low.map((k) => NEED_DEFS[k].icon).join('');
    indicator.classList.toggle('show', low.length > 0);
  }

  function barColor(v) {
    if (v > 60) return '#8fd461';
    if (v > 35) return '#f5c24a';
    return '#f2706e';
  }
  function updatePanel() {
    if (needsPanel.hidden) return;
    for (const k of Object.keys(NEED_DEFS)) {
      const fill = document.getElementById(`need-${k}`);
      if (!fill) continue;
      fill.style.width = `${needs[k]}%`;
      fill.style.background = barColor(needs[k]);
    }
  }
  let panelTimer = null;
  function showStatus() {
    needsPanel.hidden = false;
    updatePanel();
    // 查看后 5 秒自动消失，无需再点一次
    clearTimeout(panelTimer);
    panelTimer = setTimeout(() => { needsPanel.hidden = true; }, 5000);
  }

  const REACT = {
    feed:    ['宽面真好吃~ 谢谢你！', '吸溜~ 好香的一碗面！', '吃饱饱，超满足~'],
    bath:    ['泡泡浴好舒服~ 香香哒~', '洗白白啦，我最干净！', '咕噜咕噜，泡得好惬意~'],
    yarn:    ['毛线球最好玩啦！', '嘿嘿，看你往哪跑~', '玩得好开心呀！'],
    chase:   ['哈！被我追到啦~', '你跑不过我哒！', '追着光标好快乐~'],
    happy:   ['喵~ 你好呀！', '陪着我真开心~', '呼噜呼噜~'],
    drink:   ['咖啡暖乎乎的~', '咕嘟咕嘟，好提神！', '工作日的下午茶真棒~'],
    scratch: ['挠一挠，真舒服~', '啊~ 抓到痒处啦！', '浑身清爽~'],
    fishing: ['嘘……鱼要上钩啦！', '今天能钓到大鱼吗~', '垂钓的时光最悠闲~'],
    sleep:   ['晚安~ 做个好梦~', '呼……先睡一小会儿~', 'zzZ…… 别吵我哦~']
  };
  /** 互动对需求的影响 */
  function applyInteraction(name) {
    switch (name) {
      case 'feed':    needs.hunger = Math.min(100, needs.hunger + 60); needs.mood = Math.min(100, needs.mood + 8); break;
      case 'bath':    needs.clean = Math.min(100, needs.clean + 70); needs.mood = Math.min(100, needs.mood + 5); break;
      case 'yarn':    needs.mood = Math.min(100, needs.mood + 45); needs.energy = Math.max(0, needs.energy - 12); break;
      case 'chase':   needs.mood = Math.min(100, needs.mood + 40); needs.energy = Math.max(0, needs.energy - 15); break;
      case 'happy':   needs.mood = Math.min(100, needs.mood + 10); break;
      case 'drink':   needs.mood = Math.min(100, needs.mood + 12); needs.energy = Math.min(100, needs.energy + 5); break;
      case 'scratch': needs.mood = Math.min(100, needs.mood + 5); break;
      case 'fishing': needs.mood = Math.min(100, needs.mood + 15); needs.hunger = Math.min(100, needs.hunger + 5); break;
      case 'sleep':   break; // 精力由睡觉期间的 tick 持续恢复
    }
    const reacts = REACT[name];
    if (reacts) showBubble(reacts[Math.floor(Math.random() * reacts.length)], 4200);
    updateIndicator();
    updatePanel();
    saveNeeds();
  }

  /** 需求随时间变化（每 20 秒一跳） */
  function tickNeeds() {
    const sleeping = currentState === 'sleep';
    const playing = currentState === 'yarn' || currentState === 'chase';
    if (sleeping) needs.energy = Math.min(100, needs.energy + 8);
    for (const k of Object.keys(NEED_DEFS)) {
      let d = NEED_DEFS[k].decay;
      if (playing && k === 'energy') d += 1.5;
      needs[k] = Math.max(0, needs[k] - d);
    }
    // 提示最紧急的一项需求（每项冷却 30 秒）
    const now = Date.now();
    let urgent = null;
    for (const k of Object.keys(NEED_DEFS)) {
      if (needs[k] < NEED_DEFS[k].threshold) {
        if (!urgent || needs[k] / NEED_DEFS[k].threshold < needs[urgent] / NEED_DEFS[urgent].threshold) urgent = k;
      }
    }
    if (urgent && now - lastHintAt[urgent] > 30000) {
      lastHintAt[urgent] = now;
      const hints = NEED_DEFS[urgent].hints;
      showBubble(`${NEED_DEFS[urgent].icon} ${hints[Math.floor(Math.random() * hints.length)]}`);
    }
    updateIndicator();
    updatePanel();
    saveNeeds();
    setTimeout(tickNeeds, 20000);
  }

  // ---- 动作入口（托盘菜单、右键菜单共用）----
  let chaseActive = false;
  function startChase() {
    if (currentState === 'sleep') setState('idle');
    applyInteraction('chase');
    chaseActive = true;
    setState('chase'); // 复用走路精灵 + 更快帧率 + 弹跳跑动感，去追光标
    api.chase();       // 主进程开启持续追踪：鼠标移到哪，猫跑着追到哪
    // 兜底：主进程迟迟未回报完成时（异常情况）回到待机
    clearTimeout(chaseTimeout);
    chaseTimeout = setTimeout(() => { if (chaseActive) { chaseActive = false; setState('idle'); } }, 15000);
  }

  function runAction(name) {
    if (name === 'status') { showStatus(); return; }
    if (name === 'quit') { api.quit(); return; }
    if (name === 'skin') { openSkinPanel(); return; }
    if (name === 'weather') { showBubble('喵？让我看看今天的天气~ ☁️', 2000); api.checkWeather(); return; }
    // walk 由主进程驱动；这里只切换走路动画，避免与主进程双向触发形成循环
    if (name === 'walk') { setState('walk'); return; }
    if (!STATES[name]) return;
    if (name === 'chase') { startChase(); return; }
    if (currentState === 'sleep' && name !== 'sleep') setState('idle'); // 先唤醒
    applyInteraction(name);
    setState(name);
  }

  // ---- 点击 / 拖动 ----
  let ptr = { down: false, startX: 0, startY: 0, moved: false, dragging: false, startT: 0 };

  petImg.addEventListener('pointerdown', (e) => {
    // 右键：交给 contextmenu 统一弹出，避免与 contextmenu 重复 toggle 导致菜单一闪而过
    if (e.button === 2) { ptr.rightDown = true; return; }
    ptr.rightDown = false;
    ptr = { down: true, startX: e.screenX, startY: e.screenY, moved: false, dragging: false, startT: Date.now() };
    try { petImg.setPointerCapture(e.pointerId); } catch (err) {}
    hideMenu();
  });

  petImg.addEventListener('pointermove', (e) => {
    if (!ptr.down) return;
    const dx = e.screenX - ptr.startX;
    const dy = e.screenY - ptr.startY;
    if (!ptr.moved && Math.hypot(dx, dy) > 6) {
      ptr.moved = true;
      ptr.dragging = true;
      api.dragStart();
      setState('drag');
    }
    if (ptr.dragging) api.dragMove();
  });

  function endPointer(e) {
    // 右键抬起：保留刚弹出的菜单，不让它立刻关闭
    if (ptr.rightDown) { ptr.rightDown = false; return; }
    if (!ptr.down) return;
    const wasDragging = ptr.dragging;
    const wasQuick = !wasDragging && (Date.now() - ptr.startT) < 320;
    ptr.down = false;
    ptr.dragging = false;
    if (wasDragging) {
      api.dragEnd();
      applyInteraction('happy');
      setState('drop');
    } else if (wasQuick) {
      onPetClick();
    }
    hideMenu();
  }
  petImg.addEventListener('pointerup', endPointer);
  petImg.addEventListener('pointercancel', endPointer);
  petImg.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(); });

  function onPetClick() {
    if (currentState === 'sleep') { setState('idle'); applyInteraction('happy'); setState('happy'); return; }
    applyInteraction('happy');
    setState('happy');
  }

  // 悬停：偶尔歪头看光标（节流，避免一直打扰）
  let lastHoverAt = 0;
  petImg.addEventListener('pointerenter', () => {
    const now = Date.now();
    if (now - lastHoverAt > 8000 && currentState === 'idle') {
      lastHoverAt = now;
      setState('lookaround');
      setTimeout(() => { if (currentState === 'lookaround') setState('idle'); }, 2200);
      showBubble('喵？你一直在看我吗~ 😺', 3000);
    }
  });
  // 双击：高兴地蹦一下
  petImg.addEventListener('dblclick', () => {
    if (currentState === 'sleep') setState('idle');
    petImg.classList.add('pet-jump');
    setTimeout(() => petImg.classList.remove('pet-jump'), 620);
    showBubble('嘿嘿，跳一下！✨', 2200);
  });

  // ---- 右键动作菜单 ----
  function toggleMenu() {
    menu.hidden = !menu.hidden;
  }
  function showMenu() { menu.hidden = false; api.menuResize(true); }
  function hideMenu() { menu.hidden = true; api.menuResize(false); }
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !skinPanel.contains(e.target)) hideMenu();
  });
  menu.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = btn.dataset.action;
      // 菜单点「桌面巡游」：先通知主进程开始巡游（渲染进程只切动画，不再回发）
      if (a === 'walk') api.walk();
      runAction(a);
      hideMenu();
    });
  });

  // ---- 启动 ----
  api.onAction(runAction);
  api.onChaseDone(() => {
    if (chaseActive) {
      chaseActive = false;
      setState('happy');
      setTimeout(() => { if (currentState === 'happy') setState('idle'); }, 1600);
    }
  });
  // 巡游方向：主进程告知朝左/朝右，做水平镜像
  api.onWalkDir((dir) => {
    petImg.classList.toggle('pet-facing-left', dir === 'left');
  });

  // ---- 小助理：把文件拖到猫身上 → 猫"吃掉"并送入回收站 ----
  let lastEatAt = 0; // 吃撑冷却
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || files.length === 0) return;
    const paths = [];
    for (const f of files) {
      const p = api.getPathForFile ? api.getPathForFile(f) : (f.path || '');
      if (p) paths.push(p);
    }
    if (paths.length === 0) return;
    const now = Date.now();
    if (now - lastEatAt < 4000) { setState('happy'); showBubble('等一下啦，我吃撑了，歇会儿~ 🥺', 2600); setTimeout(() => { if (currentState === 'happy') setState('idle'); }, 1200); return; }
    lastEatAt = now;
    const many = paths.length > 1;
    setState('feed'); // 先做出"大口吃"的动画
    showBubble(many ? `哇，${paths.length} 个！看我大口吃掉~ 😋` : '啊呜~ 看我吃掉你~ 😋', 2600);
    api.eatFile(paths);
  });
  // 吃文件结果：已送回收站 / 有没能吃掉的 / 有危险文件被拒绝
  api.onEatResult((r) => {
    if (r && r.refused && r.refused.length) {
      // 危险文件：拒绝吃，提示用系统删除
      showBubble('这个不能吃，会肚子疼！程序/系统文件请自己删除哦 🛡️', 5200);
      setState('happy');
      setTimeout(() => { if (currentState === 'happy') setState('idle'); }, 1800);
    }
    if (r && r.trash && r.trash.length) {
      needs.hunger = Math.min(100, needs.hunger + (r.trash.length > 1 ? 40 : 25));
      needs.mood = Math.min(100, needs.mood + 6);
      updateIndicator(); updatePanel(); saveNeeds();
      showBubble(`已把 ${r.trash.length} 个文件送进回收站啦，有点饱了~ 🗑️😋`, 5200);
      setState('happy');
      setTimeout(() => { if (currentState === 'happy') setState('idle'); }, 1800);
    } else if (r && r.skipped && r.skipped.length) {
      showBubble(`有 ${r.skipped.length} 个没能吃掉……`, 4200);
    }
  });
  // 小助理提醒（久坐 / 天气等）
  api.onRemind((msg) => {
    if (msg) showBubble(msg, 8000);
  });

  setState('idle');
  scheduleIdleLoop();
  checkLongIdle();
  loadNeeds(); // 恢复上次的四维状态（饱食/清洁/精力/心情）
  tickNeeds();
  restoreSkin(); // 恢复上次保存的皮肤配色
  if (skinScheme.active) applySkin(skinScheme);
  setTimeout(() => showBubble('喵~ 我是咖啡猫 Coco，也是你的桌面小助理：把文件拖到我身上我会帮你放进回收站；坐久了、天气有变我也会提醒你~'), 2500);
})();
