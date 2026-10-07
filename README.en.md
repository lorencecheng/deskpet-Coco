# 🐾 DeskPet Coco — A Coffee-Cat Desktop Pet

An open-source, always-on-top **desktop pet** that lives on your computer screen — a chubby, lovable **coffee-cat (Coco)** rendered in a soft **16-bit pixel-art** style (Stardew-Valley-like retro game look).

> 🇨🇳 中文版说明见 [README.md](README.md)

<p align="center">
  <img src="assets/sprites/core/frame-1.png" width="180" alt="Coco the coffee cat">
</p>

## ✨ Features

- **Pixel-art character** — the whole cat is hand-crafted 16-bit pixel animation: idle, walking, and every interaction is a real pixel animation loop.
- **Always-on-top** — Coco stays above your windows and keeps you company while you work.
- **🚶 Desktop roaming** — Coco naturally strolls along the screen edges and corners, walks side to side, occasionally stops to **stretch or look around**, then keeps going; flips to face its walking direction and auto-stops after a while. (Trigger via right-click or tray menu "Roam".)
- **Drag anywhere** — grab Coco with the mouse and drop it anywhere; drag it to the far left/right edge and it **hides** into the screen edge, occasionally peeking out to look around, then tucks back in.
- **Eight interactions** (right-click the pet or use the tray menu):
  - 😺 **Say hi** — waves a paw
  - ☕ **Drink coffee** — sips a hot mug (a true coffee cat)
  - 🍝 **Feed fettuccine** — its favorite dish, slurps happily
  - 🧶 **Play with yarn** — bats and pounces a yarn ball
  - 🐱 **Chase cursor** — runs to wherever your mouse goes, tracking continuously with direction flip
  - 🛁 **Bath** — soaks in a bubbly bath
  - 🎣 **Fishing** — holds a rod and waits for a bite
  - 🐾 **Scratch** — scratches its ear in delight
  - 😴 **Sleep** — curls up and naps; click it to wake up
- **🤖 Desktop assistant** — Coco does more than pose: drag a file onto it and it **eats it (moves it to the Recycle Bin)**, it **reminds you when you've been sitting too long**, and it **warns you about sudden weather alerts** for your region.
- **Smart AI behaviors** — blinks, waves, scratches on its own; naps when left alone for a while.
- **Natural pacing** — animation loops are tuned to a calm, smooth rhythm so actions feel alive but not jittery.
- **Status bubbles** — Coco tells you when it's **hungry / dirty / sleepy / bored** with a speech bubble, a small icon above its head, and a status panel; it also replies with a playful line after each interaction.
- **Small footprint** — sized ~40% smaller than the original so it doesn't crowd your desktop.
- **Lightweight** — built on Electron with a frameless transparent window; low resource usage.
- **🎨 Skin Workshop** — restyle without drawing: pick a preset (orange / black / white / cream / gray / tabby-brown / calico — all real, existing cat colors) or pick a custom **fur** color. The pixel art, limbs, pink blush, and props (bowl / noodles / coffee mug) always stay intact. Copy a **color code** and send it to a friend — they paste it and get the exact same cat (social cat-sharing!).
- **Fully customizable** — sprites live in `assets/sprites/<state>/frame-N.png`; swap images to restyle without touching code.

## 🧠 How do you know what Coco wants?

Coco has **four needs** that change over time, and it actively tells you when something is low:

| Need | When low | Matching interaction |
|---|---|---|
| 🍝 Satiety | bubble says "I'm hungry~" | Feed fettuccine |
| 🛁 Cleanliness | bubble says "I'm dirty~" | Bath |
| 😴 Energy | bubble says "I'm sleepy~" | Sleep (energy recovers while sleeping) |
| 🎈 Mood | bubble says "I'm bored~" | Play yarn / chase cursor / say hi |

**Three ways to see its state:**
1. **Speech bubble** — when a need drops below threshold, Coco pops a hint (30s cooldown per need, most urgent first).
2. **Head icon** — while any need is low, a small icon (🍝🛁😴🎈) stays above its head.
3. **Status panel** — open via right-click / tray "📊 Status" to see four color-coded progress bars (green/yellow/red).

## 🤖 Assistant features

Coco is a small helper that lives on your desktop:

- **🗑️ Eat a file** — drag any file/folder onto Coco and it chows down and **moves it to the Recycle Bin** (recoverable). Perfect for a little tidy-up. Right-click a stray file and drag it to the cat.
- **🧍 Sedentary reminder** — when you've been continuously working (no keyboard/mouse idle for a while) past a threshold (default 60 min), Coco stretches and pops a bubble: *"been working ~60 min, stand up and drink some water~"*. Toggle in the tray menu.
- **🌦 Weather alert** — Coco locates your approximate region by IP and checks the next 6 hours of forecast (Open-Meteo, no API key). If severe weather is coming (thunderstorm, heavy rain, heavy snow, freezing rain, dense fog) or extreme heat/cold, it warns you. Toggle in the tray menu.

Reminder toggles live in the system-tray menu under **"🤖 小助理提醒"**.

## 🚀 Run locally

Requires [Node.js](https://nodejs.org) ≥ 18.

```bash
npm install     # install Electron deps
npm start       # launch the desktop pet
```

| Action | Effect |
|---|---|
| Click the pet | Coco waves "hi" |
| Drag the pet | Pick it up and drop it anywhere (it bounces on landing) |
| Right-click the pet | Interaction menu (Roam / Feed / Bath / Fish / Scratch / Sleep / Exit…) |
| Tray icon | Lives in the system tray; right-click for Roam, all interactions, or Exit |

## 🗜️ Package a Windows build

```bash
npm run dist:win            # NSIS installer + portable build
npm run dist:win:portable   # portable single .exe only
```

Output goes to `release/`. Building on Windows is most reliable; see [electron-builder](https://www.electron.build/multi-platform-build) for cross-platform notes.

## 🎨 Customize the character

The app is **sprite-driven** — restyle without touching code:

```
assets/sprites/
├── idle/          frame-1..3 …   idle (breathing loop)
├── idle-blink/    frame-1 …      blink frame
├── happy/         frame-1..2 …   say hi
├── drink/         frame-1..3 …   drink coffee
├── feed/          frame-1..3 …   eat fettuccine
├── yarn/          frame-1..3 …   play with yarn
├── bath/          frame-1..3 …   bath
├── fishing/       frame-1 …      fishing
├── scratch/       frame-1 …      scratching
├── stretch/       frame-1..3 …   stretch
├── lookaround/    frame-1..3 …   look around
├── walk/          frame-1..6 …   walking loop
├── drag/          frame-1 …      being picked up
├── sleep/         frame-1..3 …   sleeping (breathing loop)
└── core/          frame-1 …      core/cover image
```

- **Multi-frame animation (recommended)**: name frames `frame-1.png`, `frame-2.png`, … (up to 12). The app plays them as a loop at a per-state fps.
- **Single frame**: if a state only has `frame-1.png`, the built-in CSS animation (float/breathe/wiggle) provides the liveliness.
- **Transparent background**: use transparent PNGs. White-background images won't be auto-removed.

## 🎨 Skin Workshop (restyle without drawing)

Open the palette panel via **🎨 Skin Workshop** in the right-click menu. Restyling only changes the cat's **fur** color — the pixel art, limbs, the pink blush/heart, and any props in its paws (bowl, noodles, coffee mug) are all preserved. Presets are all real, existing cat coat colors (no unrealistic blue/green cats).

- **Presets**: 🟠 Orange · ⚫ Black · ⚪ White · 🟡 Cream · 🐭 Gray · 🟤 Tabby-brown · 🧡 Calico
- **Custom palette**: drag the "Fur" and "Blush" color pickers for live preview
- **🎲 Random**: one-click random fur colors, fun to play with
- **❤️ My palette**: save and instantly switch back to your latest custom scheme
- **↩ Reset to orange**: back to the classic orange cat anytime
- **Color-code sharing**: copy the code (e.g. `coco#f6a64b`) from the panel; a friend pastes it in their own Coco to get the identical cat. Perfect for sharing on social feeds — let's pass the cat around!

> The scheme is saved locally (`localStorage`) and persists across restarts.

## 🏗️ Project structure

```
deskpet-coco/
├── assets/
│   ├── sprites/          # sprite images (replaceable)
│   └── icons/            # tray / packaging icons
├── src/
│   ├── main/index.js     # main process: transparent on-top window, tray, drag positioning, IPC
│   ├── preload/index.js  # safe IPC bridge
│   └── renderer/
│       ├── index.html
│       ├── styles.css    # transparency + lively animations
│       └── pet.js        # state machine, frame animation, interactions
├── tools/process_sprites.py  # script used to make sprites transparent
├── package.json
└── README.md
```

## 🛠️ Tech stack

- **Electron** — cross-platform desktop shell; mature transparent frameless always-on-top window
- Plain **HTML / CSS / JS** — no front-end framework, lightweight and easy to modify

## 🤝 Contributing

This is an open-source community pet! We'd love your help. See **[CONTRIBUTING.md](CONTRIBUTING.md)** for how to run the project, add new interactions, create animation frames, report bugs, and submit pull requests. A list of beginner-friendly tasks is tracked under the **"good first issue"** labels on GitHub.

Ideas we're excited about:
- 🎵 Meowing / background sounds
- 🚀 More interactions (petting, laser pointer, feeding treats…)
- 🎨 More skins / pixel-art styles
- 🖥️ macOS / Linux builds & auto-launch-on-boot
- 🧪 Tests & CI for cross-platform packaging

## 📄 License

[MIT](LICENSE)
