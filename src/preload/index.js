/**
 * DeskPet Coco — 预加载脚本
 * 通过 contextBridge 向渲染进程暴露最小化、安全的 IPC 接口。
 */
const { contextBridge, ipcRenderer } = require('electron');

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
  /** 退出应用 */
  quit() { ipcRenderer.send('pet:quit'); }
});
