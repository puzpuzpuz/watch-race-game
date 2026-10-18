"""Shared helpers for tools/sprites.py and tools/road.py: the projection
constants read from the game's code, the palette, the pixel fonts, the palm
art, and the clean-up steps every picture goes through (magenta key, palette
snap, outline, 2x fat pixels, 8-bit palette PNG).

Sprites are drawn, or scaled from generator art, at half resolution and then
doubled with nearest-neighbour, which gives the art's 2x2 "fat pixels".
"""

import math
import re
from collections import Counter
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "src" / "common" / "assets"
GEN_JS = ROOT / "src" / "common" / "js" / "gen"
RAW = ROOT / "art" / "raw"
PROJECTION_JS = ROOT / "src" / "common" / "js" / "projection.js"


def read_constants(path=PROJECTION_JS):
    """The `export const NAME = <number or [numbers]>` lines of the game's
    projection module, so the road frames use the game's own camera."""
    consts = {}
    pattern = re.compile(r"^export const (\w+) = (-?[\d.]+|\[[-\d., ]+\])")
    for line in path.read_text().splitlines():
        m = pattern.match(line)
        if not m:
            continue
        value = m.group(2)
        if value.startswith("["):
            consts[m.group(1)] = [float(v) for v in value[1:-1].split(",")]
        else:
            consts[m.group(1)] = float(value)
    return consts


C = read_constants()
W, H, HORIZON = int(C["W"]), int(C["H"]), int(C["HORIZON"])
SEG, ROAD_HALF, LANE_W = C["SEG"], C["ROAD_HALF"], C["LANE_W"]
CAM_H, Z_NEAR, DRAW = C["CAM_H"], C["Z_NEAR"], int(C["DRAW"])
LEVELS, PHASES, BAND = C["LEVELS"], int(C["PHASES"]), int(C["BAND"])
PALM_X, PALM_H = C["PALM_X"], C["PALM_H"]
DEPTH = 1 / math.tan(math.radians(C["FOV_DEG"] / 2))


def project(d, world_x, c):
    """Same as project() in projection.js: screen x, y and px per world unit."""
    s = DEPTH / (Z_NEAR + d * SEG)
    k = s * W / 2
    return W / 2 + (c * d * (d - 1) / 2 + world_x) * k, HORIZON + s * CAM_H * H / 2, k


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


# The palette from the spec's Art direction table.
SKY = hexrgb("#6bdeec")
WATER = hexrgb("#50adb0")
SAND = hexrgb("#f0e0aa")
ASPHALT_LIGHT = hexrgb("#707a8a")
ASPHALT_DARK = hexrgb("#5e6478")
WHITE = hexrgb("#f5fcfd")
OUTLINE = hexrgb("#03070d")
RED_SHADE = hexrgb("#971d2c")
RED = hexrgb("#e8323c")
PALM = hexrgb("#3a9a3a")
PINK = hexrgb("#ff3fa4")
CYAN = hexrgb("#39e6ff")
BASE = [SKY, WATER, SAND, ASPHALT_LIGHT, ASPHALT_DARK, WHITE, OUTLINE, RED_SHADE, RED, PALM, PINK, CYAN]

# Extra shades the placeholder art uses; each picture may add up to 24 (see save_png).
YELLOW = hexrgb("#ffd23c")
YELLOW_SHADE = hexrgb("#d89a14")
ORANGE = hexrgb("#ff8a20")
GREY = hexrgb("#9aa3b5")
GREY_LIGHT = hexrgb("#c8cdd8")
GREY_DARK = hexrgb("#3a3f4c")
TYRE = hexrgb("#1c1f28")
GLASS = hexrgb("#2b3550")
GLASS_LIGHT = hexrgb("#5a6a90")
TRUNK = hexrgb("#9a6434")
TRUNK_DARK = hexrgb("#6e4424")
PALM_DARK = hexrgb("#24702c")
PALM_LIGHT = hexrgb("#62c24e")
SHADOW = (3, 7, 13, 110)  # the one half-transparent tone, for shadows
CLEAR = (0, 0, 0, 0)


def rgba(c, a=255):
    return tuple(c[:3]) + (a,)


# ---------------------------------------------------------------- pixel fonts

# Large type: 6x9 cells (M and W are 8 wide), two-cell vertical strokes.
# Digits, headlines, logo.
FONT_BIG = {
    "0": [".####.", "######", "##..##", "##..##", "##..##", "##..##", "##..##", "######", ".####."],
    "1": ["..##..", ".###..", "####..", "..##..", "..##..", "..##..", "..##..", "######", "######"],
    "2": [".####.", "######", "##..##", "...###", "..###.", ".###..", "###...", "######", "######"],
    "3": ["#####.", "######", "....##", "..###.", "..####", "....##", "##..##", "######", ".####."],
    "4": ["...###", "..####", ".##.##", "##..##", "######", "######", "....##", "....##", "....##"],
    "5": ["######", "######", "##....", "#####.", "######", "....##", "##..##", "######", ".####."],
    "6": [".####.", "######", "##....", "#####.", "######", "##..##", "##..##", "######", ".####."],
    "7": ["######", "######", "....##", "...###", "..###.", "..##..", "..##..", "..##..", "..##.."],
    "8": [".####.", "######", "##..##", ".####.", "######", "##..##", "##..##", "######", ".####."],
    "9": [".####.", "######", "##..##", "##..##", "######", ".#####", "....##", "######", ".####."],
    "A": [".####.", "######", "##..##", "##..##", "######", "######", "##..##", "##..##", "##..##"],
    "B": ["#####.", "######", "##..##", "#####.", "######", "##..##", "##..##", "######", "#####."],
    "C": [".####.", "######", "##..##", "##....", "##....", "##....", "##..##", "######", ".####."],
    "D": ["#####.", "######", "##..##", "##..##", "##..##", "##..##", "##..##", "######", "#####."],
    "E": ["######", "######", "##....", "#####.", "#####.", "##....", "##....", "######", "######"],
    "F": ["######", "######", "##....", "#####.", "#####.", "##....", "##....", "##....", "##...."],
    "G": [".####.", "######", "##....", "##....", "##.###", "##.###", "##..##", "######", ".####."],
    "H": ["##..##", "##..##", "##..##", "######", "######", "##..##", "##..##", "##..##", "##..##"],
    "I": ["######", "######", "..##..", "..##..", "..##..", "..##..", "..##..", "######", "######"],
    "J": ["..####", "..####", "....##", "....##", "....##", "##..##", "##..##", "######", ".####."],
    "K": ["##..##", "##.###", "#####.", "####..", "###...", "####..", "#####.", "##.###", "##..##"],
    "L": ["##....", "##....", "##....", "##....", "##....", "##....", "##....", "######", "######"],
    "M": ["##....##", "###..###", "########", "##.##.##", "##.##.##", "##....##", "##....##", "##....##", "##....##"],
    "N": ["##..##", "###.##", "###.##", "######", "######", "##.###", "##.###", "##..##", "##..##"],
    "O": [".####.", "######", "##..##", "##..##", "##..##", "##..##", "##..##", "######", ".####."],
    "P": ["#####.", "######", "##..##", "##..##", "######", "#####.", "##....", "##....", "##...."],
    "Q": [".####.", "######", "##..##", "##..##", "##..##", "##.###", "##.###", "######", ".#####"],
    "R": ["#####.", "######", "##..##", "##..##", "#####.", "######", "##.##.", "##..##", "##..##"],
    "S": [".#####", "######", "##....", "#####.", ".#####", "....##", "....##", "######", "#####."],
    "T": ["######", "######", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##.."],
    "U": ["##..##", "##..##", "##..##", "##..##", "##..##", "##..##", "##..##", "######", ".####."],
    "V": ["##..##", "##..##", "##..##", "##..##", "##..##", ".####.", ".####.", "..##..", "..##.."],
    "W": ["##....##", "##....##", "##....##", "##....##", "##.##.##", "##.##.##", "########", "###..###", "##....##"],
    "X": ["##..##", "##..##", ".####.", "..##..", "..##..", "..##..", ".####.", "##..##", "##..##"],
    "Y": ["##..##", "##..##", "##..##", ".####.", "..##..", "..##..", "..##..", "..##..", "..##.."],
    "Z": ["######", "######", "...###", "..###.", ".###..", "###...", "##....", "######", "######"],
    "!": ["..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "......", "..##..", "..##.."],
    "+": ["......", "..##..", "..##..", "######", "######", "..##..", "..##..", "......", "......"],
    "/": ["....##", "....##", "...##.", "...##.", "..##..", ".##...", ".##...", "##....", "##...."],
    ".": ["......", "......", "......", "......", "......", "......", "......", "..##..", "..##.."],
    "-": ["......", "......", "......", "######", "######", "......", "......", "......", "......"],
    " ": ["......"] * 9,
}

# Small type: classic 5x7. Words, signs, button labels.
FONT_SMALL = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "C": [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "G": [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".####"],
    "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "I": [".###.", "..#..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "J": ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    "N": ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "P": ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
    "Q": [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "W": ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "#.#.#", ".#.#."],
    "X": ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
    "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    "Z": ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
    "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
    "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],
    "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
    "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
    "!": ["..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."],
    ".": [".....", ".....", ".....", ".....", ".....", ".....", "..#.."],
    "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
    " ": ["....."] * 7,
}


def text_mask(s, font, cell=1, spacing=1, bold=0, cell_h=None):
    """A 1-bit mask of `s`: each font cell is cell x cell_h pixels, glyphs
    `spacing` cells apart; bold smears each lit cell `bold` px to the right."""
    cell_h = cell_h or cell
    gh = len(font["0"])
    widths = [len(font[ch][0]) for ch in s]
    width = (sum(widths) + spacing * (len(s) - 1)) * cell + bold
    mask = Image.new("1", (max(1, width), gh * cell_h), 0)
    d = ImageDraw.Draw(mask)
    ox = 0
    for ch, gw in zip(s, widths):
        for y, row in enumerate(font[ch]):
            for x, on in enumerate(row):
                if on == "#":
                    x0, y0 = ox + x * cell, y * cell_h
                    d.rectangle([x0, y0, x0 + cell - 1 + bold, y0 + cell_h - 1], fill=1)
        ox += (gw + spacing) * cell
    return mask


def text_image(s, font, cell=2, color=WHITE, outline=2, spacing=1, bold=0, shadow=None, cell_h=None):
    """White pixel letters with a near-black outline, as the HUD uses. An
    optional `shadow` colour is drawn 1 cell below the letters, inside the
    outline."""
    mask = text_mask(s, font, cell, spacing, bold, cell_h)
    drop = (cell_h or cell) if shadow else 0
    w, h = mask.size[0] + 2 * outline, mask.size[1] + 2 * outline + drop
    img = Image.new("RGBA", (w, h), CLEAR)
    if shadow:
        img.paste(rgba(shadow), (outline, outline + drop), mask)
    img.paste(rgba(color), (outline, outline), mask)
    return add_outline(img, outline)


# ---------------------------------------------------------- picture clean-up


def add_outline(img, width=1, color=OUTLINE):
    """Paints `color` on transparent pixels within `width` of opaque ones."""
    if width <= 0:
        return img
    alpha = img.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    grown = alpha.filter(ImageFilter.MaxFilter(2 * width + 1))
    ring = Image.eval(grown, lambda a: a)
    ring.paste(0, (0, 0), alpha)  # keep only the new pixels
    out = img.copy()
    out.paste(rgba(color), (0, 0), ring)
    return out


def outline_missing(img, color=OUTLINE, dark=80):
    """A 1 px outline where generator art lacks one: paints `color` on
    transparent pixels beside an edge pixel lighter than `dark`, so an outline
    the art already has isn't doubled."""
    alpha = img.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    light = ImageChops.multiply(alpha, img.convert("L").point(lambda v: 255 if v > dark else 0))
    ring = light.copy()
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):  # grow without diagonals
        shifted = Image.new("L", img.size, 0)
        shifted.paste(light, (dx, dy))
        ring = ImageChops.lighter(ring, shifted)
    ring.paste(0, (0, 0), alpha)
    out = img.copy()
    out.paste(rgba(color), (0, 0), ring)
    return out


def fat(img):
    """Doubles a half-resolution picture with nearest-neighbour: 2x2 fat pixels."""
    return img.resize((img.width * 2, img.height * 2), Image.NEAREST)


def key_magenta(img):
    """Generator art comes on flat magenta: make it transparent."""
    img = img.convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if r > 150 and b > 150 and g < 110 and abs(r - b) < 90:
                px[x, y] = CLEAR
    return img


def from_raw(name, size, anchor="bottom"):
    """Generator art for `name` from art/raw/<name>.png, keyed, cropped and fitted
    into `size` (half resolution), or None when there's no such file. World
    sprites are anchored bottom-centre; others are centred.

    Pixel art drawn at about the frame's size keeps its pixels: it's used as
    is, or scaled by a whole number when it fits twice over, or shrunk with
    nearest-neighbour. Only big painted art is shrunk smoothly."""
    path = RAW / f"{name}.png"
    if not path.exists():
        return None
    img = key_magenta(Image.open(path))
    box = img.getchannel("A").getbbox()
    if box:
        img = img.crop(box)
    w, h = size
    if img.width <= w and img.height <= h:
        k = max(1, int(min((w - 2) / img.width, (h - 2) / img.height)))
        fitted = img.resize((img.width * k, img.height * k), Image.NEAREST)
    else:
        scale = min((w - 2) / img.width, (h - 2) / img.height)
        resample = Image.NEAREST if scale > 0.5 else Image.LANCZOS
        fitted = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), resample)
    alpha = fitted.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    fitted.putalpha(alpha)
    out = Image.new("RGBA", size, CLEAR)
    x = (w - fitted.width) // 2
    y = max(0, h - 1 - fitted.height) if anchor == "bottom" else (h - fitted.height) // 2
    out.paste(fitted, (x, y), fitted)
    return out


def from_raw_full(name, size):
    """A full-frame picture (backgrounds, title art) from art/raw, scaled to
    cover `size` and cropped centrally, or None. Pixel art smaller than `size`
    is scaled up by a whole number, so its pixels stay square."""
    path = RAW / f"{name}.png"
    if not path.exists():
        return None
    img = Image.open(path).convert("RGBA")
    w, h = size
    scale = max(w / img.width, h / img.height)
    if scale >= 1:
        k = math.ceil(scale)
        img = img.resize((img.width * k, img.height * k), Image.NEAREST)
    else:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    x, y = (img.width - w) // 2, (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))


def dist2(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


def nearest(c, palette):
    best, bi = None, 0
    for i, p in enumerate(palette):
        dd = dist2(c, p)
        if best is None or dd < best:
            best, bi = dd, i
    return bi


def build_palette(img, extra):
    """The base palette plus up to `extra` shades from colours it doesn't cover."""
    counts = Counter()
    for r, g, b, a in img.getdata():
        if a >= 192:
            counts[(r, g, b)] += 1
    far = [c for c in counts if min(dist2(c, p) for p in BASE) > 300]
    if not far or extra <= 0:
        return list(BASE)
    if len(far) <= extra:
        return list(BASE) + far
    pixels = []
    for c in far:
        pixels.extend([c] * min(counts[c], 64))
    strip = Image.new("RGB", (len(pixels), 1))
    strip.putdata(pixels)
    q = strip.quantize(colors=extra, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()
    used = sorted(i for _, i in q.getcolors())
    return list(BASE) + [tuple(pal[3 * i : 3 * i + 3]) for i in used]


def save_png(img, path, extra=24):
    """Snaps `img` to the palette and saves it as an 8-bit palette PNG. Index 0
    is transparent and index 1 the half-transparent shadow tone."""
    img = img.convert("RGBA")
    palette = build_palette(img, extra)
    cache = {}
    data = []
    for r, g, b, a in img.getdata():
        if a < 64:
            data.append(0)
        elif a < 192:
            data.append(1)
        else:
            c = (r, g, b)
            i = cache.get(c)
            if i is None:
                i = cache[c] = 2 + nearest(c, palette)
            data.append(i)
    out = Image.new("P", img.size, 0)
    out.putdata(data)
    flat = [0, 0, 0] + list(OUTLINE)
    for p in palette:
        flat.extend(p)
    out.putpalette(flat)
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, transparency=bytes([0, SHADOW[3]] + [255] * len(palette)), optimize=True)


def save_jpg(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(path, quality=88, optimize=True)


# ---------------------------------------------------------------- palm trees


def draw_palm(lean):
    """A palm at half resolution (64x128): a segmented trunk bending `lean` px
    to the right at the top, and a crown of fronds."""
    img = Image.new("RGBA", (64, 128), CLEAR)
    d = ImageDraw.Draw(img)
    base_x, top_y = 32 - lean // 2, 30
    top_x = base_x + lean
    for y in range(126, top_y, -1):
        f = (126 - y) / (126 - top_y)
        x = base_x + lean * f * f
        half = 3 if f < 0.6 else 2
        colour = TRUNK if ((126 - y) // 5) % 2 else TRUNK_DARK
        d.rectangle([round(x) - half, y, round(x) + half, y], fill=rgba(colour))
        d.point((round(x) + half, y), fill=rgba(TRUNK_DARK))
    cx, cy = top_x, top_y
    fronds = [(-160, 30), (-130, 27), (-100, 18), (-60, 18), (-20, 27), (10, 30), (-80, 12), (200, 22), (-200, 22)]
    for angle, length in fronds:
        a = math.radians(angle)
        pts = []
        for t in range(0, length + 1, 2):
            droop = (t / length) ** 2 * 10
            pts.append((cx + math.cos(a) * t, cy + math.sin(a) * t * 0.6 + droop))
        for i, (x, y) in enumerate(pts):
            w = max(1, round(4 * (1 - i / len(pts))) + 1)
            d.ellipse([x - w, y - w / 2, x + w, y + w / 2], fill=rgba(PALM))
            d.point((x, y - w / 2), fill=rgba(PALM_LIGHT))
            d.point((x, y + w / 2), fill=rgba(PALM_DARK))
    for dx in (-3, 2):
        d.ellipse([cx + dx - 2, cy + 1, cx + dx + 2, cy + 5], fill=rgba(TRUNK_DARK))
    return add_outline(img, 1)


def palm_art(name, lean):
    """Generator art from art/raw if present, else the drawn placeholder."""
    raw = from_raw(name, (64, 128))
    return outline_missing(raw) if raw is not None else draw_palm(lean)
