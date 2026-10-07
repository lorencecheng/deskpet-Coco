#!/usr/bin/env python3
"""Process generated sprite images: remove white background (flood-fill from edges)
and resize to transparent PNG sprites.

Usage: python3 process_sprites.py <in_dir> <out_dir> <size>
  in_dir  : directory containing <state>.png (jpeg) files
  out_dir : root output dir; writes out_dir/<state>/frame-1.png
  size    : output square size in px (default 512)
"""
import sys, os
from collections import deque
from PIL import Image

def remove_white_bg(img, tol=32, feather=0):
    """Flood-fill from all border pixels: any pixel that is near-white AND
    connected to the border becomes transparent. Interior white fur is preserved
    because it is not connected to the border."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    visited = [[False] * w for _ in range(h)]
    q = deque()
    # seed all border pixels that are near-white
    for x in range(w):
        for y in (0, h - 1):
            r, g, b, a = px[x, y]
            if r > 255 - tol and g > 255 - tol and b > 255 - tol:
                if not visited[y][x]:
                    visited[y][x] = True
                    q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            r, g, b, a = px[x, y]
            if r > 255 - tol and g > 255 - tol and b > 255 - tol:
                if not visited[y][x]:
                    visited[y][x] = True
                    q.append((x, y))
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                r, g, b, a = px[nx, ny]
                if r > 255 - tol and g > 255 - tol and b > 255 - tol:
                    visited[ny][nx] = True
                    q.append((nx, ny))
    # remove fully transparent rows/cols margins (auto-trim)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    return img

def main():
    in_dir, out_dir = sys.argv[1], sys.argv[2]
    size = int(sys.argv[3]) if len(sys.argv) > 3 else 512
    os.makedirs(out_dir, exist_ok=True)
    for name in sorted(os.listdir(in_dir)):
        if not name.endswith(".png"):
            continue
        state = name[:-4]
        src = os.path.join(in_dir, name)
        img = Image.open(src).convert("RGB")
        img = remove_white_bg(img)
        # resize keeping aspect, then pad to square transparent canvas
        img.thumbnail((size, size), Image.LANCZOS)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        canvas.paste(img, ((size - img.width) // 2, (size - img.height) // 2), img)
        dest_dir = os.path.join(out_dir, state)
        os.makedirs(dest_dir, exist_ok=True)
        out = os.path.join(dest_dir, "frame-1.png")
        canvas.save(out)
        print(f"  {state}: {src} -> {out} ({canvas.size})")
    print("done")

if __name__ == "__main__":
    main()
