/**
 * DeskPet Coco — 背包 · 钓鱼 · 相册收集
 * 独立模块，通过 window.CocoPet 与宠物本体交互。
 * 全部数据本地持久化（localStorage），完全离线。无货币/商店/接球小游戏。
 */
(function () {
  'use strict';
  const KEY = 'coco.inventory';
  const P = window.CocoPet; // 宠物能力出口
  if (!P) return;

  // 道具精简为 4 种（去货币后聚焦"吃/玩/洗"三种照顾行为）：
  // kibble 普通猫粮（钓不到鱼时的实惠口粮） · fish_dry 小鱼干（钓鱼收获，最香）
  // yarn_toy 毛线球玩具（陪玩，耗隐藏精力） · clean_spray 清洁喷雾（应急洗澡）
  const ITEMS = {
    kibble:      { icon: '🍚', name: '普通猫粮', desc: '+饱食25 · 实惠口粮',      effect: { hunger: 25, mood: 4 } },
    fish_dry:    { icon: '🐟', name: '小鱼干',   desc: '+饱食30 · +羁绊（最香）', effect: { hunger: 30, mood: 6, bond: 5 } },
    yarn_toy:    { icon: '🧶', name: '毛线球玩具', desc: '玩毛线 +心情20 · 耗精力', effect: { mood: 20, bond: 4 }, toy: 'yarn', energyCost: 8 },
    clean_spray: { icon: '🧴', name: '清洁喷雾',  desc: '+清洁50 · 应急洗香香',    effect: { clean: 50 } }
  };

  let S = { items: {}, album: [] }; // 无货币；初始给一包口粮好上手
  if (!S.items.kibble) S.items.kibble = 2;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && typeof d === 'object') {
        if (d.items && typeof d.items === 'object') S.items = d.items;
        if (Array.isArray(d.album)) S.album = d.album.slice(-60); // 最多留 60 条回忆
      }
    } catch {}
    if (!S.items.kibble) S.items.kibble = 2; // 空背包也保底两包口粮
  }
  load();

  function addItem(id, n) { if (!ITEMS[id]) return; S.items[id] = (S.items[id] || 0) + (n || 1); save(); if (bagPanel && !bagPanel.hidden) renderBag(); }
  function countOf(id) { return S.items[id] || 0; }

  // 相册：收藏回忆（羁绊升级 / 钓到大鱼 / 拍照）。最多 60 条，旧的自动清
  function addAlbum(type, title, icon) {
    const e = { type, title, icon: icon || '🖼️', ts: Date.now() };
    S.album.push(e);
    if (S.album.length > 60) S.album = S.album.slice(-60);
    save();
    if (P) P.showBubble(`📖 相册新增回忆：${title}`, 3000);
  }

  // ---- 使用道具 ----
  function useItem(id) {
    if (!ITEMS[id] || countOf(id) <= 0) return;
    const it = ITEMS[id];
    if (it.toy) P.setState(it.toy);                       // 玩具先做专属动画
    for (const k of ['hunger', 'clean', 'energy', 'mood']) { // 精力为隐藏属性，仍受道具/玩具影响
      if (it.effect[k]) P.needs[k] = Math.min(100, Math.max(0, P.needs[k] + it.effect[k]));
    }
    if (it.toy && it.energyCost) P.needs.energy = Math.max(0, P.needs.energy - it.energyCost);
    if (it.effect.bond) P.addBond('use_' + id, it.effect.bond);
    S.items[id] -= 1; if (S.items[id] <= 0) delete S.items[id];
    P.updatePanel(); P.updateIndicator(); P.saveNeeds(); save();
    if (it.toy) setTimeout(() => { if (P) P.setState('idle'); }, 2200);
    P.showBubble(`用了「${it.name}」~ 舒服！`, 2600);
    renderBag();
  }

  // ---- 钓鱼：点击钓鱼 → 猫下竿 → 随机咬钩。两条鱼 → 一条小鱼干；稀有/传说入相册 ----
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
      P.addBond('fishing', 6);
      if (r.food > 0) addItem('fish_dry', r.food);
      if (r.new) addAlbum('fish', `钓到「${r.name}」`, r.icon);
      P.setState('happy');
      let msg = `${r.icon} 钓到「${r.name}」！`;
      if (r.food > 0) msg += ` +${r.food} 小鱼干${r.new ? '（图鉴+1！）' : ''}`;
      else if (r.new) msg += '（图鉴+1！）';
      P.showBubble(msg, 4200);
      setTimeout(() => { if (P) P.setState('idle'); }, 1600);
    }, dur);
  }
  // 鱼只保留"小鱼 / 大鱼"两级（去复杂概率与货币）：大鱼大概率给小鱼干、小概率上相册
  function rollFish() {
    const hasBig = S.album.some((a) => a.type === 'fish' && a.title.includes('大鱼'));
    const r = Math.random();
    if (r < 0.06)  return { icon: '🐋', name: '传奇大鱼', food: 3, new: !hasBig };   // 罕见：入相册 + 3 小鱼干
    if (r < 0.30)  return { icon: '🐠', name: '大肥鱼',  food: 2, new: false };      // 常见好货
    return { icon: '🐟', name: '小鱼',    food: Math.random() < 0.7 ? 1 : 0, new: false }; // 偶尔空竿
  }

  // ---- 面板 ----
  const bagPanel = document.getElementById('bagPanel');
  const albumPanel = document.getElementById('albumPanel');
  function renderBag() {
    const box = document.getElementById('bagItems'); if (!box) return;
    box.innerHTML = '';
    const owned = Object.keys(ITEMS).filter((id) => countOf(id) > 0);
    if (!owned.length) { box.innerHTML = '<div class="skin-hint">背包空空的，去钓钓鱼攒点小鱼干吧~</div>'; return; }
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
  function renderAlbum() {
    const box = document.getElementById('albumGrid'); if (!box) return;
    box.innerHTML = '';
    if (!S.album.length) { box.innerHTML = '<div class="skin-hint">还没有回忆，去钓大鱼、拍拍照吧~</div>'; return; }
    const list = S.album.slice().reverse();
    list.forEach((a) => {
      const d = document.createElement('div');
      d.className = 'album-card';
      const t = new Date(a.ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
      d.innerHTML = `<div class="album-icon">${a.icon}</div><div class="album-title">${a.title}</div><div class="album-date">${t}</div>`;
      box.appendChild(d);
    });
  }
  function openBag() { P.closeAllPanels(); bagPanel.hidden = false; P.setUiOpen(true); P.api.panelResize(true); renderBag(); }
  function openAlbum() { P.closeAllPanels(); albumPanel.hidden = false; P.setUiOpen(true); P.api.panelResize(true); renderAlbum(); }
  function closeAllInv() {
    bagPanel.hidden = albumPanel.hidden = true;
    P.setUiOpen(false); P.api.panelResize(false);
  }
  document.getElementById('bagClose').addEventListener('click', closeAllInv);
  document.getElementById('albumClose').addEventListener('click', closeAllInv);
  // 菜单入口
  const bind = (a, fn) => { const b = document.querySelector(`#menu button[data-action="${a}"]`); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); };
  bind('bag', openBag); bind('album', openAlbum);
  // 追光点：回归纯互动（羁绊已在 pet.js 结算，这里只补一句开心话，不再发币）
  if (P.api && P.api.onDotChaseDone) {
    P.api.onDotChaseDone(() => {
      if (P) P.showBubble('🐾 追到啦！这一下，神清气爽~', 2400);
    });
  }

  // 全局出口（pet.js 的 runAction 会调用 startFishing）
  window.CocoGame = { addItem, countOf, addAlbum, useItem, startFishing, ITEMS };
  P.showBubble('🎒 背包上线：钓钓鱼攒小鱼干，喂饱 / 陪玩 / 洗香香都靠它~', 4200);
})();
