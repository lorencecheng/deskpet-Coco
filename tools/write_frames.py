#!/usr/bin/env python3
"""Write downloaded <state>-<n>.png frames into assets/sprites/<state>/frame-<n>.png
with white-background removal (flood fill from borders) and 512px resize."""
import sys, os, glob
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from PIL import Image
from process_sprites import remove_white_bg

def main():
    src_dir = sys.argv[1]
    out_root = sys.argv[2]
    size = int(sys.argv[3]) if len(sys.argv) > 3 else 512
    files = sorted(glob.glob(os.path.join(src_dir, "*.png")))
    done = 0
    for fp in files:
        base = os.path.basename(fp)[:-4]      # e.g. idle-2
        state, _, n = base.rpartition("-")
        if not n.isdigit():
            print("skip", base); continue
        img = Image.open(fp).convert("RGB")
        img = remove_white_bg(img)
        img.thumbnail((size, size), Image.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2), img)
        out_dir = os.path.join(out_root, state)
        os.makedirs(out_dir, exist_ok=True)
        out = os.path.join(out_dir, f"frame-{n}.png")
        canvas.save(out)
        done += 1
    print(f"processed {done} frames -> {out_root}")

if __name__ == "__main__":
    main()
