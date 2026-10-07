/**
 * DeskPet Coco — 预加载脚本
 * 通过 contextBridge 向渲染进程暴露最小化、安全的 IPC 接口。
 */
const { contextBridge, ipcRenderer, webUtils, clipboard } = require('electron');

contextBridge.exposeInMainWorld('coco', {
  /** 订阅主进程（托盘菜单等）下发的动作 */
  onAction(callback) {
    const listener = (_e, name) => callback(name);
    ipcRenderer.on('pet:action', listener);
    return () => ipcRenderer.removeListener('pet:action', listener);
  },
  /** 右键菜单触发动作（由渲染进程向主进程发，再广播回自己，保持单一入口） */
  triggerAction(name) {
    ipcRenderer.send('action', name);
  },
  dragStart() { ipcRenderer.send('pet:drag-start'); },
  dragMove() { ipcRenderer.send('pet:drag-move'); },
  dragEnd() { ipcRenderer.send('pet:drag-end'); },
  /** 追光标：让主进程把窗口朝光标位置扑跳 */
  chase() { ipcRenderer.send('pet:chase'); },
  onChaseDone(callback) {
    const listener = () => callback();
    ipcRenderer.on('pet:chase-done', listener);
    return () => ipcRenderer.removeListener('pet:chase-done', listener);
  },
  /** 桌面巡游：让主进程沿屏幕四边闲逛 */
  walk() { ipcRenderer.send('pet:walk'); },
  /** 巡游方向回调：dir = 'left' | 'right' */
  onWalkDir(callback) {
    const listener = (_e, dir) => callback(dir);
    ipcRenderer.on('pet:walk-dir', listener);
    return () => ipcRenderer.removeListener('pet:walk-dir', listener);
  },
  /** 退出应用 */
  quit() { ipcRenderer.send('pet:quit'); },
  /** 右键菜单开/关时让主进程临时拉高窗口，保证全部选项可见 */
  menuResize(open) { ipcRenderer.send('pet:menu-resize', open); },

  // ---- 小助理能力 ----
  /** 从拖拽的 File 对象解析真实路径（Electron 安全接口） */
  getPathForFile(file) {
    try { return webUtils.getPathForFile(file); } catch { return ''; }
  },
  /** 把拖到猫身上的文件"吃掉"（主进程负责送入回收站） */
  eatFile(paths) { ipcRenderer.send('pet:eat-file', paths); },
  /** 吃文件结果回调：{ trash: [names], skipped: [names] } */
  onEatResult(callback) {
    const listener = (_e, r) => callback(r);
    ipcRenderer.on('pet:eat-file-result', listener);
    return () => ipcRenderer.removeListener('pet:eat-file-result', listener);
  },
  /** 主进程下发的小助理提醒（久坐 / 天气等） */
  onRemind(callback) {
    const listener = (_e, msg) => callback(msg);
    ipcRenderer.on('pet:remind', listener);
    return () => ipcRenderer.removeListener('pet:remind', listener);
  },

  // ---- 皮肤工坊 ----
  /** 把配色码写入剪贴板 */
  clipboardWrite(text) { try { clipboard.writeText(text); return true; } catch { return false; } },
  /** 读取剪贴板文本 */
  clipboardRead() { try { return clipboard.readText() || ''; } catch { return ''; } },
  /** 打开/关闭皮肤工坊面板时临时调整窗口高度 */
  panelResize(open) { ipcRenderer.send('pet:panel-resize', open); },
  /** 读取精灵图片为 dataURL（调色用），relPath 形如 "idle/frame-1.png" */
  readSprite(relPath) { return ipcRenderer.invoke('read-sprite', relPath); }
});
