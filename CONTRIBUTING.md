# Contributing to DeskPet Coco

Thanks for helping Coco grow! 🐱 Any contribution — code, sprite frames, docs, bug reports, or ideas — is welcome.

## Getting started

1. **Fork** this repository.
2. **Clone** your fork:
   ```bash
   git clone https://github.com/<your-username>/deskpet-Coco.git
   cd deskpet-Coco
   ```
3. **Install & run**:
   ```bash
   npm install
   npm start
   ```
   The pet appears at the bottom-right of your screen. See [README.en.md](README.en.md) for the full interaction list.

## How to help

### 🎨 Add / improve animation frames
The app is sprite-driven. Each state is a folder under `assets/sprites/<state>/` with `frame-N.png` files (up to 12). The renderer plays them as a loop at a per-state fps (see `src/renderer/pet.js` → `STATES`).

- To add frames for an existing state: add `frame-N.png` files and (optionally) set a `fps` in `STATES`.
- To add a brand-new interaction: create the sprite folder, add a state entry in `STATES`, hook the action in the menu (`src/main/index.js` and `src/renderer/pet.js`), and (optional) add need/reaction text.
- Frames should use **transparent PNGs**. If you generate images with a white background, run `tools/process_sprites.py` to make them transparent.

### 🐞 Report bugs
Open an issue with:
- Your OS and Electron/app version
- Steps to reproduce
- What you expected vs. what happened
- A screenshot or GIF if possible

### ✨ Request / suggest features
Open an issue labeled `enhancement` and describe the interaction or behavior you'd love to see. Ideas we're tracking: sounds/meowing, petting & laser-pointer interactions, more skins, macOS/Linux builds, auto-launch on boot, tests & CI.

### 📝 Improve docs
Fix typos, translate READMEs, or clarify usage. PRs are welcome.

## Pull request checklist

- [ ] Work from a new branch (`git checkout -b feat/your-change`)
- [ ] `npm start` runs without errors
- [ ] If you added a state/frames, confirm they load (no "Failed to load resource" in the dev console)
- [ ] Keep changes focused; reference the issue number if one exists
- [ ] Update `README.md` / `README.en.md` if user-visible behavior changed

## Code of conduct

Be kind and constructive. Harassment, trolling, and personal attacks are not tolerated. This project follows the [Contributor Covenant](https://www.contributor-covenant.org/).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
