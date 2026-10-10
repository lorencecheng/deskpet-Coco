# 🐾 DeskPet Coco — A Coffee-Cat Desktop Pet

An open-source, always-on-top **desktop pet** that lives on your computer screen — a chubby, lovable **coffee-cat (Coco)** rendered in a soft **16-bit pixel-art** style (Stardew-Valley-like retro game look).

> 简体中文 README: [README.md](README.md) · 🤝 Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

MIT License · ⭐ Star & join the fun

---

## ✨ Features (post-simplification)

After cutting the "grindy" parts (AI chat, weather alerts, coin shop, catch-the-ball minigame, accessory stacking, coffee), we kept the most charming bits and polished them:

- **🎨 Pixel-art cat** — 16-bit soft pixel look. Crisp walking limbs vs. a chubby, lazy idle — a nice contrast.
- **🚶 Desktop patrol** — naturally wanders along all four edges of your screen: walks a bit, then pauses to **stretch / look around / groom**, then continues; **turns around** when changing direction, with smooth per-frame walking animation (no sliding).
- **🐱 Cursor chase** — runs to wherever you move your mouse, then waits obediently.
- **🖱️ Four mouse interactions** — hover (tilts head), click (head / paw / belly — belly makes it flop), double-click (happy hop), long-press (purrs, but gets annoyed if you overdo it).
- **🎣 Fishing** — click to fish, wait for the bobber, catch **small / big fish** for dried-fish treats; a **legendary fish** unlocks an album entry. Fishing is the core loop for item sources.
- **🐭 Dot-chase game** — chase a bouncing glowing dot; unlocked once your bond reaches "Acquainted" (a gentle progression push).
- **🍝 Feed pasta / 🛁 bath / 🐾 scratch / 🧶 yarn ball / 😴 sleep** — each with its own frame animation.
- **🧹 File feeding** — drag a file onto the cat and it **eats it (moves it to the Recycle Bin, recoverable)**; it refuses and quips about wrong kinds of files.
- **🧍 Long-sitting reminder** — reminds you to **stand up and hydrate** (30 / 60 / 90 min options).
- **💞 Bond system** — starts **aloof and wary**, grows into a **devoted companion**. Petting, playing, and feeding raise bond; higher bond unlocks more (Acquainted → dot-chase; Close → rubs against you after play; Best friend → belly-flops and acts spoiled). 15s cooldown per key prevents grinding; decay protection after 7 idle days.
- **🎨 Skin Workshop** — restyle without drawing: presets of **real, existing** cat colors (orange / black / white / cream / gray / tabby / calico) or a custom **fur** color picker. Pixel art, limbs, blush and props (bowl / noodles) always stay intact. Copy a **color code** and share it — a friend pastes it to get the same cat.
- **🎭 Costume Studio & Photo Mode** — dress Coco as **🏴‍☠️ Pirate (default) / 🗡️ Swordsman / 👗 Dress / 👑 Princess / 🧢 Streetwear / 🤡 Clown / 😈 Little Devil**; strike a pose (cool / smirk / heart / play-dead) and save a pixel archive card to `Pictures/DeskPet Coco` and the clipboard.
- **📊 Pixel-card UI** — status panel, right-click menu, skin/costume/inventory/album all share one warm orange pixel-card CSS token set. The right-click menu is **7 quick buttons + 3 collapsible groups**, clear at a glance, **no scrollbars**.
- **😴 Real day/night** — reads the system clock: sleepier at night, more lively by day; sleep restores energy (faster at night).

---

## 🧠 Status System (how to know what Coco wants)

Coco has **three visible needs** (Fullness / Cleanliness / Mood) plus a **hidden Energy**, changing over time and announced via speech bubbles:

| State | How to tell | What to do |
|---|---|---|
| 🍝 Hungry | Bubble says "want pasta", begs | Feed pasta / dried fish / kibble |
| 🛁 Dirty | Bubble says "want a bubble bath", fur dulls | Bathe / use clean spray |
| 🎈 Bored / low mood | Bubble says "so bored, play with me" | Yarn ball / cursor chase / dot-chase / fishing |
| 😴 Tired (hidden energy) | Yawns more often, sleepy | Let it sleep |

Mapping: **feed +fullness**, **bath +clean**, **yarn/chase +mood (−energy)**, **sleep +energy**, **fishing/petting +mood**. Energy is a hidden behavior value: drives "sleepy" behavior, drained by play, restored by sleep — but not shown as a progress bar to keep the UI clean.

---

## 🎒 Inventory (simplified to 4 items)

No currency, no shop — items return to "feed / play / clean":

| Item | Effect | Source |
|---|---|---|
| 🍚 Kibble | +25 fullness | Starter |
| 🐟 Dried fish | +30 fullness · +bond (best) | Fishing |
| 🧶 Yarn ball toy | +20 mood · −energy | Item |
| 🧴 Clean spray | +50 clean | Item |

Fishing → dried fish → feed (fullness + bond) forms the complete single-player loop.

---

## 📖 Album

Collect memorable moments: **bond upgrades**, **legendary fish**, **photo cards**. Up to 60 entries, oldest auto-cleared.

---

## 🎛️ Right-Click Menu (leveled · no scrolling)

- **7 quick buttons**: feed / play / wash / scratch / dot-chase / hi / sleep — high-frequency actions at a glance.
- **3 collapsible groups** (only one open at a time):
  - 🎮 **Play more**: cursor chase / fishing / desktop patrol
  - 🎨 **Dress up**: skin workshop / photo / inventory
  - 📊 **My cat**: status / bond / album
- **Bottom exit button**, dimmed to avoid mis-taps.

---

## 🚀 Run locally

```bash
npm install
npm start            # dev
```

**Requirements**: Node.js ≥ 16 + npm. Fully offline — no network, no API keys.

---

## 🗜️ Build a Windows executable

```bash
npm run dist:win:portable   # outputs a portable .exe under release/
```

> Electron 30 + electron-builder. See `package.json`.

---

## 🏗️ Project Structure

```
deskpet-coco/
├─ src/
│  ├─ main/index.js        # main: always-on-top transparent window / tray / patrol / cursor chase / sit reminder / file feeding
│  ├─ preload/index.js     # safe bridge: minimal IPC surface
│  └─ renderer/
│     ├─ index.html        # UI skeleton (pet / bubble / status panel / right-click menu / panels)
│     ├─ styles.css        # warm orange pixel-card CSS tokens
│     ├─ pet.js            # pet core: state machine / action animations / needs / personality / skin / costume / photo
│     ├─ bond.js           # bond system (5 levels, 7-day decay protection)
│     └─ inventory.js      # inventory / fishing / album
├─ assets/sprites/         # per-frame pixel sprites (core / actions / costumes)
├─ package.json
└─ README.md
```

---

## 🛠️ Tech Stack

- **Electron 30** — transparent always-on-top window, main + renderer
- **Vanilla DOM / Canvas** — pixel animation & UI, no heavy deps
- **localStorage** — needs / bond / inventory / album / skin all persisted locally, fully offline

---

## 🤝 Contributing

All fun ideas and PRs welcome:

- 🐛 Bug reports · 📝 README polish · 🎨 New pixel sprites · ✨ New interactions
- 💡 Share what you want in a desktop pet via [Issues](https://github.com/lorencecheng/deskpet-Coco/issues)

**Roadmap**: more outfits / poses, cross-computer pet visits, community skin sharing, richer idle behavior.

---

## 📄 License

[MIT](LICENSE) — free to use, modify, and distribute.
