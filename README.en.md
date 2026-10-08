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
- **Drag anywhere** — grab Coco with the mouse and drop it anywhere; by default it **snaps** to the left/right screen edge on landing. Toggle in the tray to fall back to **edge-hiding** (it tucks into the edge and peeks out to look around).
- **🖥️ Auto-hide on fullscreen** — when you open a fullscreen app (game / player), Coco tucks itself away so it never blocks the view; it returns when you exit fullscreen (toggleable in the tray).
- **🎛️ Opacity / size** — in the tray you can make Coco semi-transparent (100% / 80% / 60%) or switch between Small / Medium / Large sizes to fit your screen.
- **Lively idle actions** — while idle Coco randomly blinks, **washes its face**, **yawns**, or scratches; it's livelier when happy, quieter when down, and begs for food more when hungry.
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
- **Smart AI behaviors** — blinks, **washes its face, yawns**, and scratches on its own; naps when left alone for a while; livelier when happy, quieter when down, and begs more for food when hungry.
- **Natural pacing** — animation loops are tuned to a calm, smooth rhythm so actions feel alive but not jittery.
- **Status bubbles** — Coco tells you when it's **hungry / dirty / sleepy / bored** with a speech bubble, a small icon above its head, and a status panel; it also replies with a playful line after each interaction.
- **Small footprint** — sized ~40% smaller than the original so it doesn't crowd your desktop.
- **Lightweight** — built on Electron with a frameless transparent window; low resource usage.
- **🎨 Skin Workshop** — restyle without drawing: pick a preset (orange / black / white / cream / gray / tabby-brown / calico — all real, existing cat colors) or pick a custom **fur** color. The pixel art, limbs, pink blush, and props (bowl / noodles / coffee mug) always stay intact. Copy a **color code** and send it to a friend — they paste it and get the exact same cat (social cat-sharing!).
- **🧠 AI brain (optional)** — plug in a lightweight, free model and Coco really "thinks": based on your interactions and its current mood/hunger it picks its own action and quips a line. Off by default and fully offline; only when enabled does it go online, and on any failure it falls back to local lines. Supports **local llama.cpp** or any **OpenAI-compatible API** (Qwen / Doubao etc.).
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

- **🗑️ Eat a file** — drag any file/folder onto Coco and it chows down and **moves it to the Recycle Bin** (recoverable). A few thoughtful details: executable/system files (`.exe/.lnk/.bat/.cmd/.sys/.msi`, or anything under `Program Files` / `Windows`) are **refused** (so it doesn't break its tummy and you don't lose critical files); feeding too fast triggers an **"I'm full" cooldown** — give it a moment.
- **🧍 Sedentary reminder** — when you've been continuously working (no keyboard/mouse idle for a while) past a threshold, Coco stretches and pops a bubble to get you moving. Default 60 min; switch 30 / 60 / 90 min in the tray menu under **"久坐提醒间隔"**. Messages rotate so it never gets repetitive.
- **🌦 Weather alert** — Coco locates your approximate region by IP and checks the next 6 hours of forecast (Open-Meteo, no API key). Severe weather (thunderstorm, heavy rain, snow, freezing rain, fog) or extreme heat/cold triggers a graded warning; right-click → "**查看天气**" to check the current weather anytime.

Reminder toggles live in the system-tray menu under **"🤖 小助理提醒"**.

## 🚀 Run locally

Requires [Node.js](https://nodejs.org) ≥ 18.

```bash
npm install     # install Electron deps
npm start       # launch the desktop pet
```

| Action | Effect |
|---|---|
| Hover the pet | Coco occasionally tilts its head at you (throttled, non-intrusive) |
| Click the pet | Coco waves "hi" |
| Double-click the pet | Coco does a happy little jump |
| Drag the pet | Pick it up and drop it anywhere (it bounces on landing) |
| Right-click the pet | Interaction menu (Roam / Feed / Bath / Fish / Scratch / Check weather / Sleep / Exit…) |
| Tray icon | Lives in the system tray; right-click for Roam, all interactions, appearance settings (opacity / size / fullscreen-hide / edge-snap), or Exit |

> 💾 **Local care system** — Coco's four needs (**satiety / cleanliness / energy / mood**) are saved locally: feeding it noodles/files fills it up, bathing cleans it, playing yarn/chase makes it happy but tired; ignoring it for too long slowly drains the bars and it asks you to play. It persists across restarts — like a little buddy that needs your care.

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
- **Custom palette**: drag the "Fur" color picker for live preview
- **🎲 Random**: one-click random **real-world cat colors** (orange / tabby / cream / tabby-brown / gray / near-black) — never those unnatural blue or green cats
- **❤️ My palette**: save and instantly switch back to your latest custom scheme
- **↩ Reset to orange**: back to the classic orange cat anytime
- **Color-code sharing**: copy the code (e.g. `coco:Orange#f6a64b`, with the color name for clarity) from the panel; a friend pastes it in their own Coco to get the identical cat. Perfect for sharing on social feeds — let's pass the cat around!

> The scheme is saved locally (`localStorage`) and persists across restarts.

## 🧠 AI brain (optional — make Coco sassier and livelier)

Right-click the pet → **🧠 AI Settings** to enable it. **Off by default and fully offline**; once enabled, Coco uses a language model to pick its own action and say its own line — lazier, sassier, more character.

> **Don't want to configure anything? No problem.** With AI off, Coco ships with a built-in "reads your mood" sassy local personality: it reacts differently when hungry / dirty / tired / bored (e.g. feed coffee while starving and it quips "Coffee doesn't fix hunger! I want noodles!") — alive out of the box. To get the real AI, tap **✨ Free setup (3 steps)** in AI Settings to grab a free key and paste it in — no tech knowledge needed.

- **When it triggers** (not constantly online): petting / double-click / feeding / bathing etc., plus occasional idle self-talk.
- **Self-decides**: the AI returns `{"action":"...","text":"..."}`; Coco parses it and **chooses its own action** (wash / yawn / pretend to sleep / stare / sass…) plus a one-line bubble. It only acts while idle — never interrupts roaming or cursor-chasing.
- **Two backends** (switch in the panel):
  1. **Local llama.cpp** (free, offline, best privacy): backend `local`, base URL `http://127.0.0.1:8080/v1`, model = your loaded gguf name (e.g. `qwen1.5-0.5b`).
  2. **Online OpenAI-compatible API** (e.g. Qwen / Doubao free tiers): backend `online`, fill in the compatible base URL + API key + model name.
- **Graceful fallback**: offline / bad key / timeout / malformed output → auto-falls back to built-in local lines; the app never crashes.
- **Anti-spam**: default min interval 15 s (tunable 10/30/60 s) so it never burns tokens.
- **Privacy**: your API key is stored only in local `prefs.json`; requests are made only when you've enabled AI and an event fires — no middleman server. Only cat state and short chat text are sent; no other PC data is read.

### Quick start — Qwen free tier
1. Get an `API-KEY` and the compatible base URL (e.g. `https://dashscope.aliyuncs.com/compatible-mode/v1`) from Alibaba Cloud.
2. In **🧠 AI Settings**: enable → backend "在线 API" → fill base URL, key, model (e.g. `qwen-turbo`) → save.

### Local llama.cpp — fully offline
1. Download [llama.cpp](https://github.com/ggerganov/llama.cpp) and run: `./llama-server -m qwen1.5-0.5b-instruct-q4.gguf --port 8080`.
2. In **🧠 AI Settings**: backend "本地 llama.cpp" → base URL `http://127.0.0.1:8080/v1` → model = your loaded name → save.

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
