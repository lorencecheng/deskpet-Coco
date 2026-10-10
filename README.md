# 🐾 DeskPet Coco — 咖啡猫桌面宠物

**An open-source desktop pet that lives on your computer screen.**
一只灵动可爱的 **咖啡猫**（橘黄胖猫）桌面宠物，采用 **16bit 柔和像素风**（星露谷式复古游戏质感）。

> 🇬🇧 English README: [README.en.md](README.en.md) · 🤝 想参与贡献？见 [CONTRIBUTING.md](CONTRIBUTING.md)

简体中文 · MIT License · ⭐ 欢迎 Star & 一起优化

---

## ✨ Features（做减法后的核心功能）

专注治愈陪伴，删掉了"肝币打工"感的功能（AI 聊天、天气预警、小鱼币商店、接毛线球小游戏、配饰叠加、喝咖啡），保留最戳人的部分并打磨得更顺滑：

- **🎨 像素风形象** — 整只咖啡猫为 16bit 柔和像素风，复古游戏质感。走路四肢清晰、平时圆胖慵懒，对比感十足。
- **🚶 桌面巡游** — 在桌面四边自然闲逛：走一阵会停下来**伸懒腰 / 东张西望 / 洗脸舔爪**再继续；从右到左会**自动转向**，走路逐帧动画连贯，不弹跳不滑动。
- **🐱 追光标** — 鼠标移到哪，猫就**自然跑动追到哪**；追到后会乖巧待命。
- **🖱️ 四种鼠标互动** — 悬停（歪头看你）、单击（摸头 / 摸爪子 / 摸肚子，摸肚子会躺倒）、双击（高兴蹦一下）、长按抚摸（舒服眯眼，摸太久会不耐烦躲开）。
- **🎣 钓鱼** — 点击钓鱼，浮漂等咬钩，钓到**小鱼 / 大鱼**换小鱼干；钓到**传奇大鱼**上相册图鉴。钓鱼是道具来源的核心闭环。
- **🐭 逗猫 · 追光点** — 追一个会跳走的发光小圆点，羁绊达到「初识」才解锁（养成引导）。
- **🍝 喂意大利宽面 / 🛁 洗澡 / 🐾 抓痒 / 🧶 玩毛线球 / 😴 睡觉** — 每样都有专属逐帧动画。
- **🧹 文件投喂** — 把文件拖到猫身上，猫会"吃掉"它并**送入回收站**（可恢复）；吃错东西会拒绝并吐槽。
- **🧍 久坐提醒** — 坐太久猫会提醒你**站起来活动、去喝水**（30 / 60 / 90 分钟可选）。
- **💞 羁绊系统** — 从刚领养的**高冷警惕**，到相处久了变成**无条件信任你的挚友**。摸头、陪伴、逗猫、投喂都涨羁绊；羁绊越高解锁越多（初识解锁追光点、亲近后玩完会主动蹭你、挚友翻肚皮撒娇）。同键 15 秒冷却防刷，7 天不理会会缓慢衰减。
- **🎨 皮肤工坊** — 不用会画画也能换肤：内置橘猫 / 黑猫 / 白猫 / 奶油 / 灰猫 / 狸花 / 三花等**现实中真实存在**的猫色预设，或取色器自由调毛色。像素风格、四肢、腮红与道具（碗 / 面条）始终不变。配色可一键**复制成配色码**发给朋友，对方粘贴即可得到同款猫咪（社交传猫！）。
- **🎭 服装工坊 & 拍照模式** — 给猫穿 **🏴‍☠️ 汪洋大盗（默认照）/ 🗡️ 剑客 / 👗 小裙子 / 👑 公主裙 / 🧢 潮牌 / 🤡 小丑 / 😈 小恶魔**；摆酷 / 坏笑 / 比心 / 装死等 pose 拍一张像素档案卡，自动存图并复制到剪贴板。
- **📊 像素档案卡 UI** — 状态面板、右键菜单、皮肤工坊、背包、相册全部统一成暖橘像素质感卡片（一套 CSS 令牌）。右键菜单 **7 个快捷按钮 + 3 个可折叠分组**，一目了然、**无滚动条**，按层级收纳。
- **😴 昼夜真实联动** — 读取系统时间：夜晚更容易犯困打盹、白天更活泼；睡眠恢复精力（夜晚恢复更快）。

---

## 🧠 状态系统（怎么知道猫咪想要什么）

咖啡猫有 **三维可见需求**（饱食 / 清洁 / 心情）＋ **隐藏的精力**，会随时间自然变化，并主动用气泡让你知道它现在的状态：

| 状态 | 怎么看出来 | 怎么解决 |
|---|---|---|
| 🍝 **饿了** | 气泡喊"想吃意大利宽面"，会主动讨食 | 喂宽面 / 小鱼干 / 猫粮 |
| 🛁 **脏了** | 气泡喊"想洗泡泡浴"，毛色会变暗 | 洗澡 / 用清洁喷雾 |
| 🎈 **无聊 / 心情差** | 气泡喊"好无聊，陪我玩" | 玩毛线球 / 追光标 / 逗猫 / 钓鱼 |
| 😴 **累了（隐藏精力）** | 更频繁打哈欠、犯困想睡 | 让它睡觉 |

互动与需求的对应关系：**喂宽面 +饱食**、**洗澡 +清洁**、**玩毛线球 / 追光标 +心情（但耗精力）**、**睡觉 +精力**、**钓鱼 / 抚摸 +心情**。精力隐藏为内部行为值：困了更想睡、玩闹消耗、睡眠恢复，但不在面板当进度条打扰你。

---

## 🎒 背包道具（精简为 4 种）

删掉货币和商店，道具回归"吃 / 玩 / 洗"三种照顾行为：

| 道具 | 效果 | 来源 |
|---|---|---|
| 🍚 普通猫粮 | +饱食25 | 开局自带 |
| 🐟 小鱼干 | +饱食30 · +羁绊（最香） | 钓鱼收获 |
| 🧶 毛线球玩具 | +心情20 · 耗精力 | 道具 |
| 🧴 清洁喷雾 | +清洁50 | 道具 |

钓鱼 → 小鱼干 → 喂食涨饱食和羁绊，形成完整的单机养成闭环。

---

## 📖 相册 · 回忆收集

收集值得纪念的瞬间：**羁绊升级**、**钓到传奇大鱼**、**拍照出卡**。最多保留 60 条，旧的自动清理。

---

## 🎛️ 右键菜单（分级收纳 · 不滚动）

- **顶部 7 个快捷按钮**：喂 / 玩 / 洗 / 挠 / 逗 / 嗨 / 睡 —— 高频操作一眼可见。
- **3 个可折叠分组**（最多同时展开一组，点击就地展开）：
  - 🎮 **玩更多**：追光标 / 钓鱼 / 桌面巡游
  - 🎨 **装扮**：皮肤工坊 / 拍照 / 背包
  - 📊 **我的猫咪**：状态 / 羁绊 / 相册
- **底部独立退出按钮**，弱化靠下避免误触。

---

## 🚀 本地运行

```bash
npm install
npm start            # 开发运行
```

**依赖**：Node.js ≥ 16 + npm。全离线运行，不联网、不配任何 API。

---

## 🗜️ 打包 Windows 可执行文件

```bash
npm run dist:win:portable   # 生成 release/ 下的便携版 exe
```

> 当前为 Electron 30 + electron-builder。图标与打包配置见 `package.json`。

---

## 🎨 皮肤工坊（不用画画也能换肤）

右键菜单 →「🎨 装扮」→「皮肤工坊」。换肤只改猫咪本体的**毛色**，像素风格、四肢、腮红和手里的道具（碗、面条）都原样保留。预设都是现实中真实存在的猫色（橘、黑、白、奶油、灰、狸花、三花），**没有蓝猫、绿猫那种不存在的颜色**。

配色码机制：`复制` → 发微信 / 群 → 对方 `粘贴` → 得到同款猫咪。

---

## 🎭 服装工坊 & 拍照模式（穿新衣 · 摆 pose · 出卡）

「🎨 装扮」→「拍照」，先选 pose（摆酷 / 坏笑 / 比心 / 装死），再点「拍照保存」生成一张带羁绊 / 服装信息的像素档案卡，自动存进「图片/DeskPet Coco」并复制到剪贴板。

---

## 🏗️ 项目结构

```
deskpet-coco/
├─ src/
│  ├─ main/index.js        # 主进程：透明置顶窗口 / 托盘 / 巡游 / 追光标 / 久坐提醒 / 文件投喂
│  ├─ preload/index.js     # 安全桥：最小化 IPC 接口
│  └─ renderer/
│     ├─ index.html        # 界面骨架（宠物 / 气泡 / 状态面板 / 右键菜单 / 各面板）
│     ├─ styles.css        # 一套暖橘像素质感 CSS 令牌
│     ├─ pet.js            # 宠物本体：状态机 / 动作动画 / 需求 / 性格 / 皮肤 / 服装 / 拍照
│     ├─ bond.js           # 羁绊系统（5 级养成，7 天衰减保护）
│     └─ inventory.js      # 背包 / 钓鱼 / 相册
├─ assets/sprites/         # 像素逐帧精灵（core / 各动作 / 各服装）
├─ package.json
└─ README.md
```

---

## 🛠️ Tech Stack

- **Electron 30** — 透明置顶小窗 + 主进程 / 渲染进程
- **原生 Canvas / DOM** — 像素动画与 UI，无重量级依赖
- **localStorage** — 需求 / 羁绊 / 背包 / 相册 / 皮肤全本地持久化，完全离线

---

## 🤝 参与贡献

欢迎一切有意思的点子与 PR：

- 🐛 提 Bug、📝 完善 README、🎨 加像素精灵、✨ 加互动动作
- 💡 在 [Issues](https://github.com/lorencecheng/deskpet-Coco/issues) 聊聊你想要的桌宠功能

**Roadmap（待社区一起做）**：更多服装 / 姿势、宠物间串门社交、皮肤工坊社区分享、更细腻的待机行为。

---

## 📄 License

[MIT](LICENSE) — 自由使用、修改、分发。

---

<a id="english"></a>

## 🇬🇧 English

**DeskPet Coco** is an open-source **pixel-art desktop cat** (a chubby orange coffee-cat) that lives on your desktop. 16-bit soft pixel style, fully offline, no API keys.

**Core features:**
- **Pixel cat sprite** with crisp walking / chubby idle contrast; walks around all four edges of your screen, turning naturally, pausing to stretch / look around.
- **Chases your cursor** — runs to wherever you move it, then waits obediently.
- **Four mouse interactions**: hover (tilts head), click (pet head / paw / belly — belly makes it flop), double-click (happy hop), long-press (purr, but it gets annoyed if you overdo it).
- **Mini-activities**: fishing (catch fish → dried-fish treats; legendary fish unlocks an album entry), yarn ball, dot-chase game, bath, scratch, sleep.
- **Feed it pasta** 🍝 and **drop files onto it** to recycle them (recoverable) — a tiny desktop assistant with a long-sitting reminder 🧍.
- **Bonding system** 💞 — starts aloof, grows to your best friend. Higher bond unlocks dot-chase, extra affection, belly flops.
- **Skin workshop** 🎨 — recolor with real-world cat presets (orange/black/white/cream/grey/tabby/calico) or a color picker; share a palette code so a friend gets the same cat.
- **Costume & photo studio** 🎭 — pirate / swordsman / dress / princess / streetwear / clown / little-devil outfits + poses → pixel photo card.
- **Leveled right-click menu** — 7 quick actions + 3 collapsible groups, no scrollbars.

**Run:**
```bash
npm install && npm start        # dev
npm run dist:win:portable       # build a Windows .exe
```

**Tech:** Electron 30 · vanilla DOM/Canvas · localStorage persistence (fully offline).
**License:** MIT. PRs welcome — see [Issues](https://github.com/lorencecheng/deskpet-Coco/issues).
