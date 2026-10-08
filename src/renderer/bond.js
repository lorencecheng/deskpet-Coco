/**
 * DeskPet Coco — 羁绊系统（本地持久化，完全离线）
 *
 * 陪伴式养成，不是"肝度"：刚领养时它高冷警惕，相处越久、互动越多，
 * 羁绊等级逐渐上涨，解锁更多交互与更放得开的性格。
 * 关键原则：绝不反向惩罚。很久不打开只会极缓慢衰减（连续 7 天才开始，
 * 每天 -2），不会清零、不会"养死"，不给用户压力。
 */
(function () {
  'use strict';

  const KEY = 'coco.bond';
  // 防刷冷却：同一类互动 15s 内不能重复刷羁绊
  const COOLDOWN_MS = 15000;

  // 羁绊等级（lv 越大越亲近）
  const LEVELS = [
    { lv: 0, name: '陌生', min: 0 },
    { lv: 1, name: '初识', min: 200 },
    { lv: 2, name: '熟悉', min: 400 },
    { lv: 3, name: '亲近', min: 600 },
    { lv: 4, name: '挚友', min: 800 }
  ];

  // 升级时的一句台词（索引=新等级）
  const UPGRADE_MSG = [
    '',
    '好像没那么怕你了……',
    '开始习惯你的存在了~',
    '越来越信任你了，喵~',
    '你是我最好的铲屎官！'
  ];

  let state = { value: 0, enabled: true, lastGainBy: {}, lastOpen: 0, name: '' };

  function save() {
    state.lastOpen = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }

  // 极缓慢衰减：只有连续 7 天没打开才开始扣，每天 -2，最低 0，打开一次即暂停
  function applyDecaySinceLastOpen() {
    if (!state.enabled) return;
    const now = Date.now();
    const last = state.lastOpen || now;
    const days = (now - last) / 86400000;
    if (days < 7) return;
    const lost = Math.floor(days - 7 + 1) * 2;
    state.value = Math.max(0, state.value - lost);
    save();
  }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && typeof d === 'object') {
        if (Number.isFinite(d.value)) state.value = Math.max(0, Math.round(d.value));
        if (typeof d.enabled === 'boolean') state.enabled = d.enabled;
        if (d.lastGainBy && typeof d.lastGainBy === 'object') state.lastGainBy = d.lastGainBy;
        if (Number.isFinite(d.lastOpen)) state.lastOpen = d.lastOpen;
        if (typeof d.name === 'string') state.name = d.name.slice(0, 12);
      }
    } catch {}
    applyDecaySinceLastOpen();
  }

  function levelInfo() {
    let cur = LEVELS[0];
    for (const L of LEVELS) { if (state.value >= L.min) cur = L; else break; }
    const next = LEVELS[cur.lv + 1] || null;
    return {
      lv: cur.lv,
      name: cur.name,
      value: state.value,
      next: next ? next.min : null,
      progress: next ? Math.min(1, (state.value - cur.min) / (next.min - cur.min)) : 1
    };
  }

  /**
   * 加羁绊。同 key 在 COOLDOWN_MS 内不能重复刷。
   * @returns {{leveled:boolean, oldLv:number, newLv:number, cooled:boolean}}
   */
  function gain(key, amount) {
    if (!state.enabled || !(amount > 0)) return { leveled: false, cooled: false };
    const now = Date.now();
    if (state.lastGainBy[key] && now - state.lastGainBy[key] < COOLDOWN_MS) {
      return { leveled: false, cooled: true };
    }
    state.lastGainBy[key] = now;
    const oldLv = levelInfo().lv;
    state.value = Math.min(999999, state.value + amount);
    const newLv = levelInfo().lv;
    const leveled = newLv > oldLv;
    save();
    return { leveled, oldLv, newLv, cooled: false };
  }

  function setEnabled(v) { state.enabled = !!v; save(); }
  function isEnabled() { return state.enabled; }
  // 主人自定义称呼：猫记住你叫什么，AI/助理都用名字叫你（更真实）
  function setName(n) {
    state.name = (n || '').trim().slice(0, 12);
    save();
    return state.name;
  }
  function getName() { return state.name; }

  // ---- 助理能力按羁绊等级解锁（羁绊越高越得力，人设仍是慵懒贱橘） ----
  const ASSIST_ABILITIES = [
    { lv: 0, label: '基础问答、短句提问' },
    { lv: 1, label: '简短备忘、一句话文案' },
    { lv: 2, label: '文字一句话总结、简单待办(≤3条)' },
    { lv: 3, label: '结合你的习惯、多步小规划(≤5条)' },
    { lv: 4, label: '长文提炼、存笔记、帮你写短句/消息' }
  ];
  // 返回当前羁绊等级已解锁的助理能力标签列表
  function getAssistantPermission() {
    const lv = levelInfo().lv;
    return ASSIST_ABILITIES.filter((a) => a.lv <= lv).map((a) => a.label);
  }
  function assistantLevelInfo() {
    const info = levelInfo();
    return { lv: info.lv, name: info.name, abilities: getAssistantPermission() };
  }

  // 脚本解析时即加载（读取上次进度 + 结算离线衰减）
  load();

  window.CocoBond = {
    LEVELS, UPGRADE_MSG, ASSIST_ABILITIES,
    levelInfo, gain, setEnabled, isEnabled, getAssistantPermission, assistantLevelInfo,
    setName, getName
  };
})();
