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
    groom:       { duration: 3400, cls: 'pet-groom', fps: 3 },   // 洗脸舔爪
    yawn:        { duration: 2800, cls: 'pet-yawn', fps: 3 },    // 打哈欠犯困
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

  // ---- 随机自主行为：待机时猫自己会"做点事"，按心情/饱食/精力加权；AI 开启时由 AI 自主挑动作+吐槽 ----
  let idleLoopTimer = null;
  // 行为池：w 为基础权重，下面按需求状态动态加成（knockbowl/doze/sulk 平时 w=0，缺触发时被加权进来）
  const AUTO_BEHAVIORS = [
    { id: 'stretch',    state: 'stretch',    w: 1, mood: [0, 100], bubble: ['伸个懒腰~ 舒服~', '哈——伸个懒腰', '骨节咔咔响，拉伸一下~'] },
    { id: 'lookaround', state: 'lookaround', w: 1, mood: [0, 100], bubble: ['嗯？那边好像有动静……', '东张西望中……', '谁在叫我？看看~'] },
    { id: 'groom',      state: 'groom',      w: 1, mood: [0, 100], bubble: ['洗脸脸，保持体面~ 🧼', '舔舔爪子理理毛，我可精致了~', '洗香香，本猫最优雅~'] },
    { id: 'yawn',       state: 'yawn',       w: 1, mood: [0, 100], bubble: ['哈——真困呀~ 🥱', '打个哈欠，眯一会儿~', '这日子好闲……先困一下~'] },
    { id: 'scratch',    state: 'scratch',    w: 1, mood: [0, 100], bubble: ['挠一挠，爽~', '嗯？哪里痒……啊舒服了~'] },
    { id: 'play',       state: 'yarn',       w: 2, mood: [60, 100], bubble: ['（自己滚起毛线球）嘿，接招！', '没人陪我？我自己玩！', '毛线球！看我的！'] },
    { id: 'bounce',     state: 'happy',      w: 1, mood: [60, 100], bubble: ['（开心蹦跶两下）喵~！', '心情好，蹦起来~'] },
    { id: 'knockbowl',  state: 'drop',       w: 0, mood: [0, 100], bubble: ['啪！我把碗掀了！（饿了）', '碗里空空，气死我了~', '面条呢？！我掀桌！'] },
    { id: 'doze',       state: 'sleep',      w: 0, mood: [0, 100], bubble: ['眼皮好重……先瘫一下~ 😴', 'ZZZ……（困了先眯一会儿）'], doze: true },
    { id: 'sulk',       state: 'drop',       w: 1, mood: [0, 35],  bubble: ['哼，没人理我……', '别烦我，我正闹脾气呢~'] },
    { id: 'bellyshow',  state: 'drop',       w: 0, mood: [0, 100], bubble: ['（在你面前躺平露肚皮~）', '信任你到敢翻肚皮啦~'] }
  ];
  function randOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pickAutoBehavior() {
    const lv = bondLv();
    const entries = AUTO_BEHAVIORS.map((b) => {
      let w = b.w;
      // 需求驱动的"个性"加权：很饿想掀碗、很困想打盹、心情差闹脾气
      if (b.id === 'knockbowl' && needs.hunger < 30) w += 5;
      if (b.id === 'doze' && needs.energy < 30) w += 5;
      if (b.id === 'sulk' && needs.mood < 35) w += 3;
      if ((b.id === 'play' || b.id === 'bounce') && needs.mood < 60) w = 0; // 心情不好不爱玩
      if (b.id === 'bellyshow' && lv >= 4) w += 5; // 只有羁绊挚友才敢当着你翻肚皮
      return { b, w };
    }).filter((x) => x.w > 0);
    if (!entries.length) return null;
    const total = entries.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    for (const x of entries) { r -= x.w; if (r < 0) return x.b; }
    return entries[entries.length - 1].b;
  }
  function playAutoBehavior(b) {
    // 自主小动作对需求的一点点影响，让"自己做的事"真的参与养成
    if (b.id === 'knockbowl') needs.mood = Math.max(0, needs.mood - 6);
    if (b.id === 'sulk') needs.mood = Math.max(0, needs.mood - 2);
    if (b.id === 'play') { needs.mood = Math.min(100, needs.mood + 6); needs.energy = Math.max(0, needs.energy - 3); }
    if (b.id === 'bounce') needs.mood = Math.min(100, needs.mood + 4);
    updateIndicator(); updatePanel(); saveNeeds();
    if (b.doze) {
      setState('sleep');
      showBubble(randOf(b.bubble), 3600);
      // 打盹是临时小憩，几秒后自己回待机（不像真正睡着那样一直睡）
      setTimeout(() => { if (currentState === 'sleep') setState('idle'); }, 7000);
      return;
    }
    setState(b.state);
    showBubble(randOf(b.bubble), 3600);
  }
  function scheduleIdleLoop() {
    clearTimeout(idleLoopTimer);
    idleLoopTimer = setTimeout(() => {
      if (currentState === 'idle') {
        const mood = needs.mood;
        // 心情低落 → 动作变少、更安静；心情好 → 更多小动作
        const busy = mood < 35 ? 0.28 : (mood > 65 ? 0.65 : 0.45);
        const roll = Math.random();
        if (roll < busy) {
          // AI 开启时，让它自己挑个动作+吐槽一句（自主思考）；失败再回本地随机自主行为
          maybeAiLine('我正闲着发呆，想点心事').then((usedAi) => {
            if (!usedAi && currentState === 'idle') {
              const b = pickAutoBehavior();
              if (b) playAutoBehavior(b);
              else setState('idle-blink');
            }
          });
        } else {
          setState('idle-blink'); // 安静待机时偶尔眨个眼
        }
        // 饱食度很低时：更主动讨食，气泡提示（不真的喂）
        if (needs.hunger < NEED_DEFS.hunger.threshold && Math.random() < 0.5) {
          const begs = NEED_DEFS.hunger.hints;
          showBubble(`🍝 ${begs[Math.floor(Math.random() * begs.length)]} 丢个文件给我吃掉吧~`, 4200);
        }
        // 羁绊越深越黏人：熟悉后偶尔凑近你说句话（低概率，不打扰）
        const lv = bondLv();
        if (lv >= 2 && Math.random() < (lv >= 4 ? 0.22 : 0.13)) {
          const near = lv >= 4
            ? ['（凑到你光标边趴下，陪你~）', '喵~ 你在就好。', '（蹭蹭屏幕）别太累哦。']
            : ['（在你附近悠闲晃悠）', '喵~ 今天也陪你~', '（朝你那边看了看）'];
          showBubble(randOf(near), 3200);
        }
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

  // ---- AI 大脑面板 ----
  function openAiPanel() {
    hideMenu();
    if (!skinPanel.hidden) closeSkinPanel();
    aiEnabled.checked = !!aiConfig.enabled;
    aiBackend.value = aiConfig.backend || 'online';
    aiBaseUrl.value = aiConfig.baseUrl || '';
    aiKey.value = aiConfig.apiKey || '';
    aiModel.value = aiConfig.model || 'qwen-turbo';
    aiPrompt.value = aiConfig.systemPrompt || '';
    aiCooldown.value = String(aiConfig.cooldownMs || 15000);
    aiPanel.hidden = false;
    api.panelResize(true);
  }
  function closeAiPanel() {
    aiPanel.hidden = true;
    api.panelResize(false);
  }
  function saveAiConfig() {
    aiConfig.enabled = aiEnabled.checked;
    aiConfig.backend = aiBackend.value;
    aiConfig.baseUrl = aiBaseUrl.value.trim();
    aiConfig.apiKey = aiKey.value.trim();
    aiConfig.model = aiModel.value.trim() || 'qwen-turbo';
    aiConfig.systemPrompt = aiPrompt.value.trim();
    aiConfig.cooldownMs = parseInt(aiCooldown.value, 10) || 15000;
    api.aiSaveConfig(aiConfig);
    showBubble(aiConfig.enabled ? 'AI 大脑已开启，我要开始嘴欠啦~ 🧠' : '已关闭 AI，回到本地乖乖模式~', 3200);
  }
  const aiEnabled = document.getElementById('aiEnabled');
  const aiBackend = document.getElementById('aiBackend');
  const aiBaseUrl = document.getElementById('aiBaseUrl');
  const aiKey = document.getElementById('aiKey');
  const aiModel = document.getElementById('aiModel');
  const aiPrompt = document.getElementById('aiPrompt');
  const aiCooldown = document.getElementById('aiCooldown');
  const aiPanel = document.getElementById('aiPanel');
  document.getElementById('aiSave').addEventListener('click', () => { saveAiConfig(); closeAiPanel(); });
  document.getElementById('aiClose').addEventListener('click', closeAiPanel);
  // 免费开通向导：普通用户零配置上手 AI（3 步）
  document.getElementById('aiWizard').addEventListener('click', () => {
    api.openExternal('https://bailian.console.aliyun.com/?tab=model');
    showBubble('第1步：注册/登录通义千问，领免费额度（页面已打开）~', 6000);
    setTimeout(() => showBubble('第2步：在「API-KEY」菜单点创建，复制那串 Key~', 6000), 6500);
    setTimeout(() => showBubble('第3步：回到这里把 Key 粘进上面框，点「保存并启用」搞定！', 6000), 13000);
  });
  // 本地模型一键启用（离线 · 免配置）：自动启动 + 切到 local 后端
  document.getElementById('aiLocal').addEventListener('click', () => {
    api.aiLocalStatus().then((st) => {
      if (st && st.hasModel) {
        showBubble('正在启动本地模型（首次稍慢）……', 3000);
        api.aiLocalStart().then((r) => {
          if (r && r.ok) {
            aiConfig.enabled = true; aiConfig.backend = 'local'; aiConfig.baseUrl = `http://127.0.0.1:${r.port}/v1`;
            api.aiSaveConfig(aiConfig); closeAiPanel();
            showBubble('本地模型已就绪，我现在真的会"想"啦~ 🤖💬', 4000);
          } else {
            showBubble('本地模型启动失败（可能是 CPU 太慢或缺少依赖），先用免费开通试在线版吧~', 5000);
          }
        });
      } else {
        showBubble('还没装本地模型。点我会打开下载教程：装好一次，以后永久免配置离线用~', 5000);
        api.openExternal('https://github.com/lorencecheng/deskpet-Coco/blob/main/scripts/README.local-ai.md');
      }
    });
  });

  // ---- 问问 Coco：羁绊越高越得力的小助理（聊天面板） ----
  const assistPanel = document.getElementById('assistPanel');
  const assistInput = document.getElementById('assistInput');
  const assistLog = document.getElementById('assistLog');
  const assistName = document.getElementById('assistName');
  let assistLastAt = 0;
  const ASSIST_COOLDOWN = 20000; // 助理独立冷却，防刷 token / 本地模型算力
  // 助理多轮记忆：记住最近 4 轮对话（最多 8 条），持久化到本地，重启不丢
  const ASSIST_HISTORY_KEY = 'coco.assistHistory';
  let assistHistory = [];
  function loadAssistHistory() {
    try { const h = JSON.parse(localStorage.getItem(ASSIST_HISTORY_KEY)); if (Array.isArray(h)) assistHistory = h.slice(-8); } catch {}
  }
  function saveAssistHistory() { try { localStorage.setItem(ASSIST_HISTORY_KEY, JSON.stringify(assistHistory.slice(-8))); } catch {} }
  function pushAssist(role, text) { assistHistory.push({ role, text }); assistHistory = assistHistory.slice(-8); saveAssistHistory(); }
  function clearAssistHistory() { assistHistory = []; saveAssistHistory(); }
  loadAssistHistory();
  function appendAssist(role, text) {
    const el = document.createElement('div');
    el.className = 'assist-msg ' + role;
    el.textContent = text;
    assistLog.appendChild(el);
    assistLog.scrollTop = assistLog.scrollHeight;
    return el;
  }
  function updateAssistBadge() {
    const badge = document.getElementById('assistBadge');
    if (!badge) return;
    if (!aiConfig.enabled) { badge.textContent = '⚪ 助理待机 · 先开启 AI 大脑才开口'; return; }
    if (bond && bond.isEnabled()) {
      const a = bond.assistantLevelInfo();
      badge.textContent = `助理 Lv${a.lv} · ${a.name} · ${a.abilities.join('、')}`;
      badge.title = a.abilities.join('、');
    } else {
      badge.textContent = '⚪ 羁绊未开启 · 我懒得动';
    }
  }
  function openAssistPanel() {
    hideMenu();
    if (!skinPanel.hidden) closeSkinPanel();
    if (!aiPanel.hidden) closeAiPanel();
    if (bond && bond.getName()) assistName.value = bond.getName();
    updateAssistBadge();
    assistPanel.hidden = false;
    api.panelResize(true);
    setTimeout(() => assistInput.focus(), 60);
  }
  function closeAssistPanel() {
    assistPanel.hidden = true;
    api.panelResize(false);
  }
  function buildAssistantMessages(userText) {
    const needsText = Object.keys(NEED_DEFS).map((k) => `${NEED_DEFS[k].label}:${Math.round(needs[k])}%`).join('，');
    let user = `当前猫咪状态：${needsText}。`;
    if (bond && bond.isEnabled()) {
      const a = bond.assistantLevelInfo();
      user += `你和主人的羁绊等级：${a.name}（Lv${a.lv}）。你现在能提供的助理能力：${a.abilities.join('、')}。`;
    }
    if (bond && bond.getName()) user += `主人叫「${bond.getName()}」，要用名字称呼他。`;
    // 注入近期对话，让连续聊天更连贯
    if (assistHistory.length) {
      user += `你们最近的对话：\n${assistHistory.map((h) => `${h.role === 'user' ? '主人' : 'Coco'}：${h.text}`).join('\n')}\n`;
    }
    user += `如果主人问的能力你没解锁，就懒懒地拒绝、让他先提升羁绊。请只回复一句简短的话（不超过20字），口语化、带点慵懒贱猫味，别用markdown、别解释、别列清单。主人问你：${userText}`;
    return [
      { role: 'system', content: aiConfig.systemPrompt || '你是桌面像素胖橘猫Coco，慵懒、有点贱、腹黑但不恶毒，说话简短一句话、15字内、口语化。' },
      { role: 'user', content: user }
    ];
  }
  function sendAssist() {
    const text = assistInput.value.trim();
    if (!text) return;
    appendAssist('user', text);
    pushAssist('user', text);
    assistInput.value = '';
    assistSend.disabled = true;
    if (!aiConfig.enabled) {
      appendAssist('coco', '先到「🧠 AI 设置」开启 AI 大脑，我才能开口帮你呀~');
      assistSend.disabled = false; return;
    }
    if (!bond || !bond.isEnabled()) {
      appendAssist('coco', '开一下「💞 羁绊系统」嘛，我才有干劲帮你~');
      assistSend.disabled = false; return;
    }
    const now = Date.now();
    const wait = Math.ceil((ASSIST_COOLDOWN - (now - assistLastAt)) / 1000);
    if (now - assistLastAt < ASSIST_COOLDOWN) {
      appendAssist('coco', `我还在消化上一句……再等 ${Math.max(1, wait)} 秒吧~`);
      assistSend.disabled = false; return;
    }
    assistLastAt = now;
    const think = appendAssist('coco', '……（懒懒地动脑子）');
    think.classList.add('thinking');
    api.aiChat(buildAssistantMessages(text)).then((res) => {
      think.remove();
      let reply = '哎，脑子短路了……可能是网络或模型问题，稍后再试~';
      if (res && res.ok && res.text) reply = res.text.trim();
      appendAssist('coco', reply);
      pushAssist('coco', reply);
      assistSend.disabled = false;
    });
  }
  const assistSend = document.getElementById('assistSend');
  document.getElementById('assistClose').addEventListener('click', closeAssistPanel);
  assistSend.addEventListener('click', sendAssist);
  assistInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAssist(); });
  // 自定义称呼：猫记住你叫什么
  assistName.addEventListener('change', () => {
    const n = assistName.value.trim();
    if (bond) bond.setName(n);
    if (n) { appendAssist('coco', `记住啦，我叫你「${bond.getName()}」~`); updateAssistBadge(); }
  });
  // 清空聊天记忆
  document.getElementById('assistClear').addEventListener('click', () => {
    clearAssistHistory();
    assistLog.innerHTML = '';
    appendAssist('coco', '好，刚才的话我就当没听见~ 🧹');
  });

  // ---- 羁绊系统（bond.js）：陪伴式养成，刚领养高冷 → 越相处越亲近 ----
  const bond = window.CocoBond;
  function bondLv() {
    if (!bond || !bond.isEnabled()) return 4; // 关闭羁绊 = 全部交互开放，不设门槛
    return bond.levelInfo().lv;
  }
  function addBond(key, amount) {
    if (!bond || !bond.isEnabled()) return;
    const r = bond.gain(key, amount);
    if (r.leveled) {
      const info = bond.levelInfo();
      showBubble(`💞 羁绊升级：${info.name}！${bond.UPGRADE_MSG[info.lv] || ''}`, 4600);
      updateIndicator(); updatePanel();
    }
  }
  function bondBarColor(lv) {
    const cols = ['#9aa0a6', '#aacf7a', '#f5c24a', '#ff9d4d', '#f2706e'];
    return cols[lv] || cols[0];
  }

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
    // 羁绊进度条 + 等级名
    const bFill = document.getElementById('need-bond');
    const bLv = document.getElementById('bondLevel');
    if (bFill && bond) {
      const info = bond.isEnabled() ? bond.levelInfo() : { name: '开放', progress: 1, lv: 4, next: null };
      bFill.style.width = `${Math.round(info.progress * 100)}%`;
      bFill.style.background = bondBarColor(info.lv);
      if (bLv) bLv.textContent = `羁绊 ${info.name}`;
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

  // ---- 本地性格引擎：不开 AI 也"活"的贱猫 ----
  // 常规反应 + 需求偏低时的"看脸色"贱话，让普通用户零配置也能感到它有性格
  const REACT = {
    feed:    ['宽面真好吃~ 谢谢！', '吸溜~ 这碗面我记你一辈子~', '吃饱饱，懒得动了~'],
    bath:    ['泡泡浴好舒服~ 香香哒~', '洗白白啦，我最干净！', '咕噜咕噜，泡得好惬意~'],
    yarn:    ['毛线球最好玩啦！', '嘿嘿，看你往哪跑~', '玩得好开心呀！'],
    chase:   ['哈！被我追到啦~', '你跑不过我哒！', '追着光标好快乐~'],
    happy:   ['喵~ 你好呀！', '陪着我真开心~', '呼噜呼噜~'],
    drink:   ['咖啡暖乎乎的~', '咕嘟咕嘟，好提神！', '工作日的下午茶真棒~'],
    scratch: ['挠一挠，真舒服~', '啊~ 抓到痒处啦！', '浑身清爽~'],
    fishing: ['嘘……鱼要上钩啦！', '今天能钓到大鱼吗~', '垂钓的时光最悠闲~'],
    sleep:   ['晚安~ 做个好梦~', '呼……先睡一小会儿~', 'zzZ…… 别吵我哦~']
  };
  // 某一项需求很低时，猫会"看脸色"地吐槽（key=需求名，再按互动细分）
  const REACT_NEEDY = {
    hunger: {
      feed:    ['你终于想起我啦！再来十碗！', '饿到腿软，这碗面救了我~', '早该喂我了，哼~'],
      drink:   ['咖啡不解饿！我要的是宽面！'],
      fishing: ['鱼半天不上钩，我都快饿晕了……']
    },
    clean: {
      bath: ['身上都馊了，还好你给我洗香香~', '泡泡浴，爽到眯眼~'],
      feed: ['先让我洗个澡啦，脏着怎么吃面！'],
      sleep: ['别让我脏着睡……先洗澡嘛~']
    },
    energy: {
      sleep: ['累死了……终于能睡了~', '别吵我，让我瘫一会~'],
      yarn:  ['玩不动啦……让我歇会吧~'],
      chase: ['跑不动了，你自己玩吧……'],
      happy: ['好累……摸摸就够了~']
    },
    mood: {
      happy: ['心情好一点点了……', '陪陪我，我就开心了~'],
      feed:  ['喂饱我心情就好了~', '吃得饱才笑得出来嘛~'],
      yarn:  ['陪我玩，我就高兴了~']
    }
  };
  function pickReaction(name) {
    let needy = null;
    for (const k of Object.keys(NEED_DEFS)) {
      if (needs[k] < NEED_DEFS[k].threshold) {
        if (needy === null || needs[k] < needs[needy]) needy = k;
      }
    }
    if (needy && REACT_NEEDY[needy] && REACT_NEEDY[needy][name]) {
      const arr = REACT_NEEDY[needy][name];
      return arr[Math.floor(Math.random() * arr.length)];
    }
    const arr = REACT[name] || ['喵~'];
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // ===================== AI 大脑（可选，慵懒贱猫） =====================
  // 关闭 AI 时完全离线：所有行为走本地性格池；开启后 AI 生成 {action,text}，
  // 解析失败/断网/超时都自动降级回本地文案，绝不影响程序运行。
  let aiConfig = { enabled: false, backend: 'online', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '', model: 'qwen-turbo', temperature: 0.8, maxTokens: 80, cooldownMs: 15000, systemPrompt: '' };
  let lastAiAt = 0;
  // AI 动作名 → 本地状态：让 AI 也能"决定"猫做什么（仅待机时生效，避免打断巡游/追光标）
  const AI_ACTION_STATES = {
    blink: 'idle-blink', wash: 'groom', yawn: 'yawn', stretch: 'stretch',
    ignore: 'idle', stare: 'lookaround', sleep: 'sleep', tease: 'happy',
    play: 'yarn', knock: 'drop', sulk: 'drop'
  };
  function parseAiJson(s) {
    try {
      const m = (s || '').match(/\{[\s\S]*\}/);
      if (!m) return null;
      const o = JSON.parse(m[0]);
      if (!o || typeof o.text !== 'string' || !o.text.trim()) return null;
      return { action: typeof o.action === 'string' ? o.action : 'idle', text: o.text.trim() };
    } catch { return null; }
  }
  function buildAiMessages(eventText, userMsg) {
    const needsText = Object.keys(NEED_DEFS).map((k) => `${NEED_DEFS[k].label}:${Math.round(needs[k])}%`).join('，');
    let user = `当前状态：${needsText}。最近事件：${eventText}。`;
    // 把羁绊等级喂给 AI，让它按"熟不熟"调口吻：陌生就冷淡，挚友才敢嘴欠撒娇
    if (bond && bond.isEnabled()) {
      const b = bond.levelInfo();
      user += `你和主人的羁绊等级：${b.name}（Lv${b.lv}）。`;
    }
    // 记住主人起的名字，日常也用它称呼
    if (bond && bond.getName()) user += `主人叫「${bond.getName()}」，要用名字称呼。`;
    if (userMsg) user += `用户说：${userMsg}。`;
    user += ' 请只输出一个JSON，形如 {"action":"blink|wash|yawn|stretch|ignore|stare|sleep|tease|play|knock|sulk","text":"一句话气泡，15字内"}，不要任何多余文字、解释或markdown。';
    return [
      { role: 'system', content: aiConfig.systemPrompt || '你是桌面像素胖橘猫Coco，慵懒、有点贱、腹黑但不恶毒，说话简短一句话、15字内、口语化。' },
      { role: 'user', content: user }
    ];
  }
  /** 尝试让 AI 说一句话（可顺带选动作）。成功返回 true；AI 未开/冷却/失败返回 false。 */
  async function maybeAiLine(eventText, opts) {
    opts = opts || {};
    if (!aiConfig.enabled) return false;
    const now = Date.now();
    if (now - lastAiAt < (aiConfig.cooldownMs || 15000)) return false;
    lastAiAt = now;
    const res = await api.aiChat(buildAiMessages(eventText, opts.userMsg));
    if (!res || !res.ok || !res.text) return false;
    const p = parseAiJson(res.text);
    if (!p) return false;
    const canAct = opts.doAction && (currentState === 'idle' || currentState === 'idle-blink');
    if (canAct && AI_ACTION_STATES[p.action]) setState(AI_ACTION_STATES[p.action]);
    if (p.text) showBubble(p.text, 4000);
    return true;
  }

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
    // 羁绊上涨：投喂/陪玩/洗澡这些"用心照顾"都会拉近感情（喂最见效）
    if (name === 'feed') addBond('feed', 5);
    if (name === 'yarn' || name === 'chase') addBond('play', 3);
    if (name === 'bath') addBond('bath', 2);
    // AI 开启时优先用 AI 的贱猫台词，失败再回落本地固定文案
    const evtMap = { feed: '你喂了我意大利宽面', bath: '你帮我洗澡', yarn: '你陪我玩毛线球', chase: '我追着你的光标跑', happy: '你摸了我一下', drink: '你请我喝咖啡', scratch: '你帮我抓痒', fishing: '我在钓鱼', sleep: '我要睡觉了' };
    const evt = evtMap[name] || name;
    maybeAiLine(evt, { doAction: true }).then((usedAi) => {
      if (!usedAi) showBubble(pickReaction(name), 4200);
    });
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

  // 逗猫小游戏：追光点（复用 chase 跑动动画，但不触发追光标，避免冲突）
  let dotChaseActive = false;
  function startDotChase() {
    if (currentState === 'sleep') setState('idle');
    applyInteraction('chase');
    dotChaseActive = true;
    setState('chase');
    api.dotChase(); // 主进程驱动发光光点 + 猫去追
    clearTimeout(chaseTimeout);
    chaseTimeout = setTimeout(() => { if (dotChaseActive) { dotChaseActive = false; setState('idle'); } }, 15000);
  }

  function runAction(name) {
    if (name === 'status') { showStatus(); return; }
    if (name === 'quit') { api.quit(); return; }
    if (name === 'skin') { openSkinPanel(); return; }
    if (name === 'ai') { openAiPanel(); return; }
    if (name === 'assist') { openAssistPanel(); return; }
    if (name === 'bond') {
      if (!bond) return;
      const on = !bond.isEnabled();
      bond.setEnabled(on);
      showBubble(on ? '💞 羁绊系统已开启——我们从陌生慢慢处起~' : '💞 羁绊系统已关闭（不涨也不掉，想养随时回来）', 3600);
      updatePanel();
      return;
    }
    if (name === 'weather') { showBubble('喵？让我看看今天的天气~ ☁️', 2000); api.checkWeather(); return; }
    // walk 由主进程驱动；这里只切换走路动画，避免与主进程双向触发形成循环
    if (name === 'walk') { setState('walk'); return; }
    if (!STATES[name]) return;
    if (name === 'chase') { startChase(); return; }
    if (name === 'dotchase') { startDotChase(); return; }
    if (currentState === 'sleep' && name !== 'sleep') setState('idle'); // 先唤醒
    applyInteraction(name);
    setState(name);
  }

  // ---- 点击 / 拖动 ----
  let ptr = { down: false, startX: 0, startY: 0, moved: false, dragging: false, startT: 0, longHold: false, longTimer: null, pettingStart: 0, pettingMoves: 0, annoyed: false, petTimeout: null };

  // ---- 长按抚摸：按住猫停一下开始抚摸（舒服眯眼），摸太久会不耐烦躲开 ----
  function startPetting() {
    if (currentState === 'sleep') setState('idle');
    // 羁绊 Lv0 高冷期：一摸就挣脱，不让好好摸
    if (bondLv() === 0) {
      ptr.pettingStart = Date.now(); ptr.pettingMoves = 0; ptr.annoyed = true;
      showBubble('别碰，离我远点~', 2200);
      setState('drop');
      return;
    }
    needs.mood = Math.min(100, needs.mood + 6);
    updateIndicator(); updatePanel(); saveNeeds();
    setState('happy');
    showBubble('呼噜呼噜~ 好舒服~ 🐾', 2600);
    ptr.pettingStart = Date.now();
    ptr.pettingMoves = 0;
    ptr.annoyed = false;
    clearTimeout(ptr.petTimeout);
    // 最多摸约 5 秒，太久就烦
    ptr.petTimeout = setTimeout(() => { if (ptr.down && ptr.longHold && !ptr.annoyed) annoyPetting(); }, 5000);
  }
  function pettingMove() {
    ptr.pettingMoves += 1;
    if (ptr.annoyed) return;
    // 忍耐度随羁绊：Lv1 很快就不耐烦，Lv3+ 更能被你摸舒服（更久才烦）
    const annoyAt = bondLv() <= 1 ? 1600 : (bondLv() >= 3 ? 3200 : 2600);
    if (Date.now() - ptr.pettingStart > annoyAt) { annoyPetting(); return; }
    if (ptr.pettingMoves % 10 === 0) { // 抚摸中偶尔更舒服一点（节流）
      needs.mood = Math.min(100, needs.mood + 1);
      updateIndicator(); updatePanel(); saveNeeds();
      showBubble(['呼噜呼噜~', '好舒服呀~', '喵，别停~'][Math.floor(Math.random() * 3)], 1800);
    }
  }
  function annoyPetting() {
    ptr.annoyed = true;
    needs.mood = Math.max(0, needs.mood - 10);
    updateIndicator(); updatePanel(); saveNeeds();
    showBubble('摸够了，别蹭了~ 😾', 2600);
    setState('drop'); // 扭头躲开
  }
  function endPetting() {
    clearTimeout(ptr.petTimeout);
    if (ptr.annoyed) {
      setTimeout(() => { if (currentState === 'drop') setState('idle'); }, 900);
    } else {
      needs.mood = Math.min(100, needs.mood + 4);
      updateIndicator(); updatePanel(); saveNeeds();
      addBond('petting', 8); // 完整摸完一轮 → 羁绊上涨
      showBubble('呼~ 摸得我有点满足了~', 2400);
      setState('idle');
    }
  }

  petImg.addEventListener('pointerdown', (e) => {
    // 右键：交给 contextmenu 统一弹出，避免与 contextmenu 重复 toggle 导致菜单一闪而过
    if (e.button === 2) { ptr.rightDown = true; return; }
    ptr.rightDown = false;
    ptr = { down: true, startX: e.screenX, startY: e.screenY, moved: false, dragging: false, startT: Date.now(), longHold: false, longTimer: null, pettingStart: 0, pettingMoves: 0, annoyed: false, petTimeout: null };
    try { petImg.setPointerCapture(e.pointerId); } catch (err) {}
    hideMenu();
    // 长按检测：按住 450ms 还没拖动 → 进入抚摸模式（区别于拖拽移动窗口）
    ptr.longTimer = setTimeout(() => {
      if (ptr.down && !ptr.moved && !ptr.dragging && !ptr.longHold) { ptr.longHold = true; startPetting(); }
    }, 450);
  });

  petImg.addEventListener('pointermove', (e) => {
    if (!ptr.down) return;
    if (ptr.longHold) { pettingMove(e); return; } // 抚摸中锁定窗口，不移动
    const dx = e.screenX - ptr.startX;
    const dy = e.screenY - ptr.startY;
    if (!ptr.moved && Math.hypot(dx, dy) > 6) {
      ptr.moved = true;
      ptr.dragging = true;
      clearTimeout(ptr.longTimer);
      api.dragStart();
      setState('drag');
    }
    if (ptr.dragging) api.dragMove();
  });

  function endPointer(e) {
    // 右键抬起：保留刚弹出的菜单，不让它立刻关闭
    if (ptr.rightDown) { ptr.rightDown = false; return; }
    if (!ptr.down) return;
    clearTimeout(ptr.longTimer);
    const wasDragging = ptr.dragging;
    const wasPetting = ptr.longHold;
    const wasQuick = !wasDragging && !wasPetting && (Date.now() - ptr.startT) < 320;
    ptr.down = false;
    ptr.dragging = false;
    ptr.longHold = false;
    if (wasPetting) {
      endPetting();
    } else if (wasDragging) {
      api.dragEnd();
      applyInteraction('happy');
      setState('drop');
    } else if (wasQuick) {
      // 计算点击在猫咪图片内的相对位置(0-1)，交给部位点击分区判断
      const rx = e.offsetX / (petImg.clientWidth || 1);
      const ry = e.offsetY / (petImg.clientHeight || 1);
      onPetClick(rx, ry);
    }
    hideMenu();
  }
  petImg.addEventListener('pointerup', endPointer);
  petImg.addEventListener('pointercancel', endPointer);
  petImg.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(); });

  // ---- 部位点击：点脑袋/爪子/肚子，猫反应不一样（复用现有状态，不新增精灵帧）----
  const ZONE_REACT = {
    head:  ['摸头，眯眼享受~ 😌', '头这里最舒服，别停~', '哼，这位置还算会摸'],
    paw:   ['别碰我爪，痒~', '再摸要咬你哦~', '爪子收了，休想拿捏我'],
    belly: ['哎呀……肚子被摸，翻个身~', '肚子不能随便摸！', '痒死了，滚一圈躲你']
  };
  // 把 petImg 内的点击坐标(0-1)映射到部位：头在上方，肚子在下方中部，爪在两侧
  function clickZone(px, py) {
    if (px == null || py == null) return 'body';
    if (py < 0.42) return 'head';
    if (py > 0.66 && px > 0.28 && px < 0.72) return 'belly';
    if (px < 0.28 || px > 0.72) return 'paw';
    return 'body';
  }
  function onPetClick(px, py) {
    if (currentState === 'sleep') { setState('idle'); applyInteraction('happy'); setState('happy'); return; }
    const zone = clickZone(px, py);
    if (zone === 'head' || zone === 'paw' || zone === 'belly') {
      const lv = bondLv();
      // 羁绊低时很警惕：Lv0 完全不让摸肚子，Lv1 也有概率躲开（真正的高冷期）
      if (zone === 'belly' && lv <= 1 && Math.random() < (lv === 0 ? 1 : 0.4)) {
        needs.mood = Math.max(0, needs.mood - 2);
        updateIndicator(); updatePanel(); saveNeeds();
        showBubble(lv === 0 ? '别碰，离我远点。' : '肚子先不给摸！', 2400);
        setState('drop');
        return;
      }
      needs.mood = Math.min(100, needs.mood + 12);
      updateIndicator(); updatePanel(); saveNeeds();
      addBond('pet', 3);
      const zoneName = zone === 'head' ? '脑袋' : (zone === 'paw' ? '爪子' : '肚子');
      maybeAiLine(`你点了我的${zoneName}`).then((used) => {
        if (!used) showBubble(ZONE_REACT[zone][Math.floor(Math.random() * ZONE_REACT[zone].length)], 3600);
      });
      if (zone === 'belly') setState('drop');      // 摸肚子→躺倒翻身
      else setState('happy');
      return;
    }
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
  // 双击：高兴地蹦一下（AI 开启时让它吐槽）
  petImg.addEventListener('dblclick', () => {
    if (currentState === 'sleep') setState('idle');
    petImg.classList.add('pet-jump');
    setTimeout(() => petImg.classList.remove('pet-jump'), 620);
    maybeAiLine('你双击了我').then((usedAi) => {
      if (!usedAi) showBubble('嘿嘿，跳一下！✨', 2200);
    });
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
  api.onDotChaseDone(() => {
    if (dotChaseActive) {
      dotChaseActive = false;
      addBond('dotchase', 12); // 玩完一局 → 羁绊上涨
      setState('happy');
      if (bondLv() >= 3) showBubble('（追得好开心，蹭蹭你~）', 2600); // 亲近后玩完会主动蹭
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
  api.aiGetConfig().then((cfg) => { if (cfg && typeof cfg === 'object') aiConfig = cfg; }); // 恢复 AI 配置
  setTimeout(() => showBubble('喵~ 我是咖啡猫 Coco，也是你的桌面小助理：把文件拖到我身上我会帮你放进回收站；坐久了、天气有变我也会提醒你~'), 2500);
})();
