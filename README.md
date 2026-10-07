# 🐾 DeskPet Coco — 咖啡猫桌面宠物

An open-source desktop pet that lives on your computer screen. 一只灵动可爱的 **咖啡猫**（橘黄胖猫）桌面宠物。

<p align="center">
  <img src="assets/sprites/core/frame-1.png" width="180" alt="咖啡猫">
</p>

## ✨ Features

- **Always-on-top** — 宠物常驻桌面最上层，边工作边陪你
- **Always-on-top 任意位置** — 直接用鼠标拖拽宠物，把它放到屏幕任意角落
- **五大互动**（右键点击宠物或托盘菜单触发）：
  - 🍝 **喂意大利宽面** — 咖啡猫的最爱，吧唧吧唧吃得很香
  - 🛁 **洗澡** — 泡在泡泡浴里舒服享受
  - 🎣 **钓鱼** — 举起鱼竿，钓起一条亮晶晶的小鱼
  - 🐾 **抓痒** — 抬起后爪挠痒，一脸享受
  - 😺 **说嗨** — 挥挥爪子跟你打招呼
  - 😴 **睡觉** — 蜷成一团打盹，点它一下就醒
- **灵动 AI 行为** — 会时不时眨眼、挥手、挠痒；安静久了会自己打盹睡觉
- **轻量** — 基于 Electron，无边框透明窗口，资源占用低
- **形象可完全自定义** — 精灵图按 `assets/sprites/<状态>/frame-N.png` 存放，想换形象直接替换图片即可（甚至支持逐帧动画）

## 🚀 本地运行

需要 [Node.js](https://nodejs.org) ≥ 18。

```bash
npm install     # 安装 Electron 依赖
npm start       # 启动桌面宠物
```

启动后宠物出现在屏幕右下角，你可以：

| 操作 | 效果 |
|---|---|
| 单击宠物 | 猫咪挥手说嗨 |
| 拖动宠物 | 把猫咪拎起来拖到任意位置（松手会落地弹一下） |
| 右键宠物 | 弹出互动菜单（喂宽面 / 洗澡 / 钓鱼 / 抓痒 / 睡觉） |
| 托盘图标 | 常驻系统托盘，右键可触发所有互动或退出 |

## 🗜️ 打包 Windows 可执行文件

```bash
npm run dist:win            # 生成 NSIS 安装包 + portable 免安装版
npm run dist:win:portable   # 仅生成免安装便携版（一个 .exe，双击即用）
```

产物输出到 `release/` 目录。

> 打包在 Windows 上执行最稳妥。若在其它系统打包，请参阅 [electron-builder](https://www.electron.build/multi-platform-build) 的跨平台构建说明。

## 🎨 自定义形象（把猫换成你的）

应用是 **精灵图驱动** 的，改形象不需要碰代码：

```
assets/sprites/
├── idle/        frame-1.png …  待机（眨眼时用 idle-blink）
├── idle-blink/  frame-1.png …  闭眼眨眼帧
├── happy/       frame-1.png …  说嗨/打招呼
├── feed/        frame-1.png …  吃意大利宽面
├── bath/        frame-1.png …  洗澡
├── fishing/     frame-1.png …  钓鱼
├── scratch/     frame-1.png …  抓痒
├── drag/        frame-1.png …  被拖起
├── sleep/       frame-1.png …  睡觉
└── core/        frame-1.png …  核心形象（README 封面等）
```

- **单帧图**：放一张透明背景 PNG，命名 `frame-1.png`。猫咪的灵动感由内置 CSS 动画（浮动/呼吸/摇摆）实现。
- **逐帧动画**：想更细腻，就把同一状态多张帧命名成 `frame-1.png`、`frame-2.png`、…（最多 12 帧），应用会自动逐帧播放。
- **透明背景**：推荐用透明 PNG。若用带白底图，应用不会自动去底，最好先抠图。

## 🏗️ 项目结构

```
deskpet-coco/
├── assets/
│   ├── sprites/        # 精灵图（可替换）
│   └── icons/          # 托盘 / 打包图标
├── src/
│   ├── main/index.js   # 主进程：透明置顶窗口、托盘、拖动定位、IPC
│   ├── preload/index.js# 安全 IPC 桥
│   └── renderer/
│       ├── index.html
│       ├── styles.css  # 透明背景 + 灵动动画
│       └── pet.js      # 状态机、帧动画、交互
├── tools/process_sprites.py # 生成精灵图时的背景透明化脚本
├── package.json
└── README.md
```

## 🛠️ Tech Stack

- **Electron** — 跨平台桌面壳，透明无边框置顶窗口成熟稳定
- 原生 HTML / CSS / JS — 无前端框架，轻量易改

## 📄 License

[MIT](LICENSE)
