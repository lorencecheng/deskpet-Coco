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

  // ---- 状态配置（duration=null 表示保持到被切换）----
  const STATES = {
    idle:        { duration: null, cls: 'pet-idle' },
    'idle-blink':{ duration: 280, cls: 'pet-idle' },
    drink:       { duration: 5200, cls: 'pet-drink' },
    yarn:        { duration: 4500, cls: 'pet-yarn' },
    chase:       { duration: null, cls: 'pet-chase' },
    happy:       { duration: 2000, cls: 'pet-happy' },
    feed:        { duration: 4200, cls: 'pet-feed' },
    bath:        { duration: 5200, cls: 'pet-bath' },
    fishing:     { duration: 4300, cls: 'pet-fishing' },
    scratch:     { duration: 3400, cls: 'pet-scratch' },
    drag:        { duration: null, cls: 'pet-drag' },
    drop:        { duration: 520, cls: 'pet-drop' },
    sleep:       { duration: null, cls: 'pet-sleep' }
  };

  const petImg = document.getElementById('petImg');
  const menu = document.getElementById('menu');

  // preload 桥；在纯浏览器调试时退化为空实现，避免报错
  const api = window.coco || {
    onAction() { return () => {}; },
    triggerAction() {},
    dragStart() {}, dragMove() {}, dragEnd() {},
    chase() {}, onChaseDone() { return () => {}; }
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
    petImg.src = frames[0];
    animTimer = setInterval(() => {
      frameIdx = (frameIdx + 1) % frames.length;
      petImg.src = frames[frameIdx];
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

    currentState = name;
    petImg.className = '';
    void petImg.offsetWidth; // 强制重启 CSS 动画
    petImg.classList.add(cfg.cls || 'pet-idle');

    probeFrames(name).then((frames) => {
      if (currentState !== name) return; // 状态已切换，丢弃过期帧
      if (frames.length > 1) {
        startAnim(frames, 6);
      } else {
        stopAnim();
        petImg.src = `${SPRITE_BASE}/${name}/frame-1.png`;
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
        if (roll < 0.62) setState('idle-blink');          // 频繁眨眼
        else if (roll < 0.82) setState(Math.random() < 0.5 ? 'happy' : 'scratch'); // 偶尔的小动作
        // 其余情况保持待机
      }
      scheduleIdleLoop();
    }, 2400 + Math.random() * 3600);
  }

  function checkLongIdle() {
    if (currentState === 'idle' && idleSince && Date.now() - idleSince > 90000) {
      setState('sleep'); // 太安静了就睡一会
    }
    setTimeout(checkLongIdle, 5000);
  }

  // ---- 动作入口（托盘菜单、右键菜单共用）----
  function startChase() {
    if (currentState === 'sleep') setState('idle');
    setState('chase');
    api.chase();
    // 兜底：若主进程迟迟未回报扑跳完成，自动回到开心/待机
    clearTimeout(chaseTimeout);
    chaseTimeout = setTimeout(() => { if (currentState === 'chase') setState('happy'); }, 3200);
  }

  function runAction(name) {
    if (!STATES[name]) return;
    if (name === 'chase') { startChase(); return; }
    if (currentState === 'sleep' && name !== 'sleep') setState('idle'); // 先唤醒
    setState(name);
  }

  // ---- 点击 / 拖动 ----
  let ptr = { down: false, startX: 0, startY: 0, moved: false, dragging: false, startT: 0 };

  petImg.addEventListener('pointerdown', (e) => {
    if (e.button === 2) { toggleMenu(); return; }
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
    if (!ptr.down) return;
    const wasDragging = ptr.dragging;
    const wasQuick = !wasDragging && (Date.now() - ptr.startT) < 320;
    ptr.down = false;
    ptr.dragging = false;
    if (wasDragging) {
      api.dragEnd();
      setState('drop');
    } else if (wasQuick) {
      onPetClick();
    }
    hideMenu();
  }
  petImg.addEventListener('pointerup', endPointer);
  petImg.addEventListener('pointercancel', endPointer);
  petImg.addEventListener('contextmenu', (e) => { e.preventDefault(); toggleMenu(); });

  function onPetClick() {
    if (currentState === 'sleep') { setState('idle'); setState('happy'); return; }
    setState('happy');
  }

  // ---- 右键动作菜单 ----
  function toggleMenu() {
    menu.hidden = !menu.hidden;
  }
  function hideMenu() { menu.hidden = true; }
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) hideMenu();
  });
  menu.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      runAction(btn.dataset.action);
      hideMenu();
    });
  });

  // ---- 启动 ----
  api.onAction(runAction);
  api.onChaseDone(() => {
    if (currentState === 'chase') {
      setState('happy');
      setTimeout(() => { if (currentState === 'happy') setState('idle'); }, 1600);
    }
  });
  setState('idle');
  scheduleIdleLoop();
  checkLongIdle();
})();
