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
        petImg.src = `${SPRITE_BASE}/${sprite}/frame-1.png`;
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
  const lastHintAt = { hunger: 0, clean: 0, energy: 0, mood: 0 };
  let bubbleTimer = null;

  function showBubble(text, ms) {
    bubble.textContent = text;
    bubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms || 6000);
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

  // ---- 右键动作菜单 ----
  function toggleMenu() {
    menu.hidden = !menu.hidden;
  }
  function showMenu() { menu.hidden = false; api.menuResize(true); }
  function hideMenu() { menu.hidden = true; api.menuResize(false); }
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) hideMenu();
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
    setState('feed'); // 先做出"大口吃"的动画
    showBubble(`啊呜~ 有 ${paths.length} 个文件！看我吃掉它~ 😋`, 2600);
    api.eatFile(paths);
  });
  // 吃文件结果：已送回收站 / 有没能吃掉的
  api.onEatResult((r) => {
    if (r && r.trash && r.trash.length) {
      showBubble(`已把 ${r.trash.length} 个文件送到回收站啦~ 🗑️`, 5200);
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
  tickNeeds();
  setTimeout(() => showBubble('喵~ 我是咖啡猫 Coco，也是你的桌面小助理：把文件拖到我身上我会帮你放进回收站；坐久了、天气有变我也会提醒你~'), 2500);
})();
