/**
 * DeskPet Coco — 背包 · 小鱼币经济 · 相册收集 · 小游戏
 * 独立模块，通过 window.CocoPet 与宠物本体交互。
 * 全部数据本地持久化（localStorage），完全离线。
 */
(function () {
  'use strict';
  const KEY = 'coco.inventory';
  const P = window.CocoPet; // 宠物能力出口
  if (!P) return;

  // 道具定义：价格(币)、使用效果、是否玩具(触发对应动画)
  const ITEMS = {
    pasta_feast:  { icon: '🍝', name: '宽面大餐',  price: 8,  desc: '+饱食45 · +羁绊',        effect: { hunger: 45, mood: 10, bond: 6 } },
    fish_dry:     { icon: '🐟', name: '小鱼干',    price: 5,  desc: '+饱食25 · +羁绊',        effect: { hunger: 25, mood: 6, bond: 4 } },
    catnip:       { icon: '🌿', name: '猫薄荷',    price: 6,  desc: '+心情30 · +精力15',      effect: { mood: 30, energy: 15 } },
    clean_spray:  { icon: '🧴', name: '清洁喷雾',  price: 6,  desc: '+清洁50',                effect: { clean: 50 } },
    yarn_toy:     { icon: '🧶', name: '毛线球玩具', price: 7, desc: '玩一局 +心情20 · +羁绊', effect: { mood: 20, bond: 4 }, toy: 'yarn' },
    mystery_fish: { icon: '✨', name: '传说小鱼',  price: 12, desc: '+饱食40 · +心情25 · 羁绊大涨', effect: { hunger: 40, mood: 25, bond: 12 } }
  };

  let S = { coins: 20, items: {}, album: [] }; // 新猫送 20 币开局
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && typeof d === 'object') {
        if (Number.isFinite(d.coins)) S.coins = Math.max(0, Math.round(d.coins));
        if (d.items && typeof d.items === 'object') S.items = d.items;
        if (Array.isArray(d.album)) S.album = d.album.slice(-60); // 最多留 60 条回忆
      }
    } catch {}
  }
  load();

  function coins() { return S.coins; }
  function addCoins(n) { S.coins = Math.max(0, S.coins + Math.round(n)); save(); refreshCoins(); }
  function addItem(id, n) { if (!ITEMS[id]) return; S.items[id] = (S.items[id] || 0) + (n || 1); save(); if (bagPanel && !bagPanel.hidden) renderBag(); }
  function countOf(id) { return S.items[id] || 0; }
  function spendCoins(n) { if (S.coins < n) return false; S.coins -= n; save(); refreshCoins(); return true; }

  // 相册：收藏回忆（羁绊升级/钓稀有鱼/高分/拍照）。最多 60 条，旧的自动清
  function addAlbum(type, title, icon, data) {
    const e = { type, title, icon: icon || '🖼️', ts: Date.now(), data: data || null };
    S.album.push(e);
    if (S.album.length > 60) S.album = S.album.slice(-60);
    save();
    if (P) P.showBubble(`📖 相册新增回忆：${title}`, 3000);
  }

  // ---- 使用道具 ----
  function useItem(id) {
    if (!ITEMS[id] || countOf(id) <= 0) return;
    const it = ITEMS[id];
    if (it.toy) P.setState(it.toy);                       // 玩具先做动画
    // 逐项生效到四维
    for (const k of ['hunger', 'clean', 'energy', 'mood']) {
      if (it.effect[k]) P.needs[k] = Math.min(100, Math.max(0, P.needs[k] + it.effect[k]));
    }
    if (it.effect.bond) P.addBond('use_' + id, it.effect.bond);
    S.items[id] -= 1; if (S.items[id] <= 0) delete S.items[id];
    P.updatePanel(); P.updateIndicator(); P.saveNeeds(); save();
    if (it.toy) setTimeout(() => { if (P) P.setState('idle'); }, 2200);
    P.showBubble(`用了「${it.name}」~ 舒服！`, 2600);
    renderBag();
  }

  // ---- 钓鱼小游戏：点击钓鱼 → 猫下竿 → 随机咬钩 → 品质结算 ----
  let fishTimer = null;
  function startFishing() {
    if (!P) return;
    if (fishTimer) { clearTimeout(fishTimer); fishTimer = null; }
    P.setState('fishing');
    const dur = 3200 + Math.random() * 2600;
    P.showBubble('🎣 浮漂在动……等鱼咬钩~', dur + 400);
    fishTimer = setTimeout(() => {
      fishTimer = null;
      const r = rollFish();
      const coinsGained = r.coins;
      addCoins(coinsGained);
      P.addBond('fishing', 6);
      P.setState('happy');
      if (r.new) addAlbum('fish', `钓到「${r.name}」`, r.icon);
      P.showBubble(`${r.icon} 钓到「${r.name}」！+${coinsGained} 小鱼币${r.new ? '（图鉴+1！）' : ''}`, 4200);
      setTimeout(() => { if (P) P.setState('idle'); }, 1600);
    }, dur);
  }
  function rollFish() {
    const hasEpic = S.album.some((a) => a.type === 'fish' && a.title.includes('传说'));
    const hasRare = S.album.some((a) => a.type === 'fish' && a.title.includes('稀有'));
    const r = Math.random();
    if (r < 0.08)  return { icon: '🦈', name: '传说大鱼', coins: 12 + ((Math.random() * 6) | 0), new: !hasEpic };
    if (r < 0.30)  return { icon: '🐠', name: '稀有彩鱼', coins: 5 + ((Math.random() * 4) | 0), new: !hasRare };
    const n = 1 + ((Math.random() * 3) | 0);
    return { icon: '🐟', name: `小鱼（x${n}）`, coins: n, new: false };
  }

  // ---- 接毛线球小游戏（canvas）：移动鼠标接住下落球，60 秒结算小鱼币 ----
  let game = { running: false, score: 0, coin: 0, raf: 0, balls: [], time: 0, endAt: 0, mouseX: 150 };
  const gameCv = document.getElementById('gameCanvas');
  const gctx = gameCv ? gameCv.getContext('2d') : null;
  function gameLoop(now) {
    if (!game.running) return;
    const left = Math.max(0, (game.endAt - now) / 1000);
    game.time = left;
    // 生成球
    if (Math.random() < 0.05 && game.balls.length < 6) {
      game.balls.push({ x: 12 + Math.random() * (gameCv.width - 24), y: -10, vy: 1.6 + Math.random() * 1.2 });
    }
    // 移动 + 碰撞挡板（猫在底部，宽 46，跟随鼠标）
    const paddleX = game.mouseX - 23;
    for (let i = game.balls.length - 1; i >= 0; i--) {
      const b = game.balls[i];
      b.y += b.vy;
      if (b.y + 8 >= gameCv.height - 12 && b.x > paddleX - 4 && b.x < paddleX + 46 + 4) {
        game.balls.splice(i, 1);
        game.score++;
      } else if (b.y > gameCv.height) {
        game.balls.splice(i, 1);
      }
    }
    // 画
    gctx.clearRect(0, 0, gameCv.width, gameCv.height);
    gctx.fillStyle = '#2d2016';
    gctx.fillRect(0, 0, gameCv.width, gameCv.height);
    // 猫挡板
    gctx.fillStyle = '#f6a64b';
    gctx.fillRect(paddleX, gameCv.height - 10, 46, 8);
    gctx.fillStyle = '#d98a2b';
    gctx.fillRect(paddleX + 4, gameCv.height - 16, 6, 6);
    // 球（毛线球）
    for (const b of game.balls) {
      gctx.fillStyle = '#c0392b';
      gctx.beginPath(); gctx.arc(b.x, b.y, 7, 0, 7); gctx.fill();
      gctx.strokeStyle = '#f5d0a9'; gctx.lineWidth = 2;
      gctx.beginPath(); gctx.arc(b.x, b.y, 7, 0, 7); gctx.stroke();
    }
    document.getElementById('gameScore').textContent = game.score;
    if (left <= 0) { endGame(); return; }
    document.getElementById('gameTime').textContent = Math.ceil(left);
    game.raf = requestAnimationFrame(gameLoop);
  }
  function startGame() {
    if (!gameCv || !gctx || game.running) return;
    game = { running: true, score: 0, coin: 0, balls: [], time: 60, endAt: Date.now() + 60000, mouseX: 150, raf: 0 };
    document.getElementById('gameScore').textContent = '0';
    document.getElementById('gameCoin').textContent = '0';
    document.getElementById('gameStart').disabled = true;
    game.raf = requestAnimationFrame(gameLoop);
  }
  function endGame() {
    game.running = false;
    cancelAnimationFrame(game.raf);
    const coin = Math.max(0, Math.floor(game.score / 2)); // 2 分 → 1 币
    game.coin = coin;
    addCoins(coin);
    if (P) {
      P.addBond('game_catch', Math.min(8, 3 + Math.floor(game.score / 3)));
      if (game.score >= 15) addAlbum('game', '接毛线球 15 连', '🎮');
      P.showBubble(`🎮 本轮接住 ${game.score} 个毛线球，+${coin} 小鱼币！`, 4000);
      P.setState('happy');
      setTimeout(() => { if (P) P.setState('idle'); }, 1600);
    }
    document.getElementById('gameCoin').textContent = coin;
    document.getElementById('gameStart').disabled = false;
  }
  function onCanvasMove(e) {
    if (!gameCv || !game.running) return;
    const r = gameCv.getBoundingClientRect();
    game.mouseX = e.clientX - r.left;
  }

  // ---- 面板 ----
  const bagPanel = document.getElementById('bagPanel');
  const shopPanel = document.getElementById('shopPanel');
  const albumPanel = document.getElementById('albumPanel');
  const gamePanel = document.getElementById('gamePanel');
  function refreshCoins() {
    const bc = document.getElementById('bagCoins'); if (bc) bc.textContent = S.coins;
    const sc = document.getElementById('shopCoins'); if (sc) sc.textContent = S.coins;
  }
  function renderBag() {
    const box = document.getElementById('bagItems'); if (!box) return;
    box.innerHTML = '';
    const owned = Object.keys(ITEMS).filter((id) => countOf(id) > 0);
    if (!owned.length) { box.innerHTML = '<div class="skin-hint">背包空空的，去商店用小鱼币买点道具吧~</div>'; return; }
    owned.forEach((id) => {
      const it = ITEMS[id];
      const d = document.createElement('div');
      d.className = 'inv-card';
      d.innerHTML = `<div class="inv-icon">${it.icon}</div><div class="inv-name">${it.name}</div><div class="inv-count">×${countOf(id)}</div><div class="inv-desc">${it.desc}</div>`;
      const btn = document.createElement('button');
      btn.textContent = '使用';
      btn.addEventListener('click', () => useItem(id));
      d.appendChild(btn);
      box.appendChild(d);
    });
  }
  function renderShop() {
    const box = document.getElementById('shopItems'); if (!box) return;
    box.innerHTML = '';
    Object.keys(ITEMS).forEach((id) => {
      const it = ITEMS[id];
      const d = document.createElement('div');
      d.className = 'inv-card';
      d.innerHTML = `<div class="inv-icon">${it.icon}</div><div class="inv-name">${it.name}</div><div class="inv-desc">${it.desc}</div>`;
      const btn = document.createElement('button');
      btn.textContent = `${it.price} 🐟 购买`;
      btn.addEventListener('click', () => {
        if (spendCoins(it.price)) { addItem(id, 1); renderShop(); P.showBubble(`买到了「${it.name}」~`, 2400); }
        else P.showBubble('小鱼币不够啦，去钓钓鱼/玩接球赚点~', 3200);
      });
      d.appendChild(btn);
      box.appendChild(d);
    });
  }
  function renderAlbum() {
    const box = document.getElementById('albumGrid'); if (!box) return;
    box.innerHTML = '';
    if (!S.album.length) { box.innerHTML = '<div class="skin-hint">还没有回忆，去钓稀有鱼、玩小游戏、拍拍照吧~</div>'; return; }
    const list = S.album.slice().reverse();
    list.forEach((a) => {
      const d = document.createElement('div');
      d.className = 'album-card';
      const t = new Date(a.ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
      d.innerHTML = `<div class="album-icon">${a.icon}</div><div class="album-title">${a.title}</div><div class="album-date">${t}</div>`;
      box.appendChild(d);
    });
  }
  function openBag() { P.closeAllPanels(); bagPanel.hidden = false; P.setUiOpen(true); P.api.panelResize(true); refreshCoins(); renderBag(); }
  function openShop() { P.closeAllPanels(); shopPanel.hidden = false; P.setUiOpen(true); P.api.panelResize(true); refreshCoins(); renderShop(); }
  function openAlbum() { P.closeAllPanels(); albumPanel.hidden = false; P.setUiOpen(true); P.api.panelResize(true); renderAlbum(); }
  function openGame() { P.closeAllPanels(); gamePanel.hidden = false; P.setUiOpen(true); P.api.panelResize(true); refreshCoins(); }
  function closeAllInv() {
    bagPanel.hidden = shopPanel.hidden = albumPanel.hidden = gamePanel.hidden = true;
    P.setUiOpen(false); P.api.panelResize(false);
  }
  document.getElementById('bagClose').addEventListener('click', closeAllInv);
  document.getElementById('shopClose').addEventListener('click', closeAllInv);
  document.getElementById('albumClose').addEventListener('click', closeAllInv);
  document.getElementById('gameClose').addEventListener('click', closeAllInv);
  document.getElementById('gameStart').addEventListener('click', startGame);
  gameCv.addEventListener('mousemove', onCanvasMove);
  // 菜单入口
  const bind = (a, fn) => { const b = document.querySelector(`#menu button[data-action="${a}"]`); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); };
  bind('bag', openBag); bind('shop', openShop); bind('album', openAlbum); bind('game', openGame);

  // 追光点玩完 → 结算小鱼币（每次保底，越玩越赚）
  if (P.api && P.api.onDotChaseDone) {
    P.api.onDotChaseDone(() => {
      const gain = 6 + ((Math.random() * 5) | 0);
      addCoins(gain);
      if (P) P.showBubble(`🐾 追光点玩完，+${gain} 小鱼币！`, 2600);
    });
  }
  // 钓鱼：菜单/动作触发
  if (P.api && P.api.onAction) {
    // runAction 已在 pet.js 处理 fishing 状态；这里补结算由 startFishing 统一驱动
  }
  // pet.js runAction 里 fishing 分支调用 CocoGame.startFishing()（见 pet.js）

  // 全局出口
  window.CocoGame = { coins, addCoins, addItem, countOf, spendCoins, addAlbum, startFishing, startGame, ITEMS };
  P.showBubble('🎒 新增背包 & 小鱼币系统：钓鱼、追光点、接毛线球都能赚币买道具啦~', 4200);
})();
