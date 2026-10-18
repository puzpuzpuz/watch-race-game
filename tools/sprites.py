"""Draws every picture the game needs except the road frames (tools/road.py)
into src/common/assets/, and writes src/common/js/gen/art.js with the sizes
the game needs to place them.

Pictures marked "generator" in the spec's sprite list are taken from
art/raw/<name>.png when that file exists (see README.md for the names), and
otherwise drawn here as placeholders. Either way they go through the same
clean-up: magenta key, fit to the frame at half resolution, palette snap,
outline, 2x fat pixels. Text and HUD shapes are always drawn here.

    python3 tools/sprites.py
"""

import json
import math
import random

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from common import (
    ASSETS,
    CLEAR,
    CYAN,
    FONT_BIG,
    FONT_SMALL,
    GEN_JS,
    GLASS,
    GLASS_LIGHT,
    GREY,
    GREY_DARK,
    GREY_LIGHT,
    H,
    HORIZON,
    ORANGE,
    OUTLINE,
    PINK,
    RED,
    RED_SHADE,
    SAND,
    SHADOW,
    SKY,
    TYRE,
    W,
    WATER,
    WHITE,
    YELLOW,
    YELLOW_SHADE,
    add_outline,
    fat,
    from_raw,
    from_raw_full,
    hexrgb,
    outline_missing,
    rgba,
    save_jpg,
    save_png,
    text_image,
    text_mask,
)
from road import draw_road

SIZE_STEP, SIZE_COUNT = 0.75, 12
RIVAL = (64, 56)  # the rival cars' shared frame: tall enough for the van
RED_LIGHT = hexrgb("#ff7a6e")
TAIL = hexrgb("#ff2a3a")


def new(w, h):
    img = Image.new("RGBA", (w, h), CLEAR)
    return img, ImageDraw.Draw(img)


def box(d, x0, y0, x1, y1, colour):
    d.rectangle([x0, y0, x1, y1], fill=rgba(colour))


def art(name, size, draw, anchor="bottom"):
    """Half-resolution art for a generator picture: art/raw/<name>.png when
    present, else the drawn placeholder. Outlined, not yet doubled."""
    raw = from_raw(name, size, anchor)
    if raw is not None:
        return outline_missing(raw)
    img = draw()
    if img.size != size:  # a placeholder drawn smaller than the frame
        frame = Image.new("RGBA", size, CLEAR)
        frame.paste(img, ((size[0] - img.width) // 2, size[1] - img.height))
        img = frame
    return add_outline(img, 1)


def rotate(img, degrees, fit=True):
    """Rotates about the centre with nearest-neighbour; shrinks to stay inside
    the frame when `fit`."""
    out = img.rotate(degrees, resample=Image.NEAREST, expand=True)
    if fit and (out.width > img.width or out.height > img.height):
        f = min(img.width / out.width, img.height / out.height)
        out = out.resize((max(1, round(out.width * f)), max(1, round(out.height * f))), Image.NEAREST)
    frame = Image.new("RGBA", img.size, CLEAR)
    frame.paste(out, ((img.width - out.width) // 2, img.height - out.height), out)
    return frame


def glint(img):
    """A white four-point sparkle near the top left: the pickup's glint frame."""
    out = img.copy()
    d = ImageDraw.Draw(out)
    cx, cy = img.width // 4, img.height // 4
    box(d, cx - 4, cy, cx + 4, cy, WHITE)
    box(d, cx, cy - 4, cx, cy + 4, WHITE)
    box(d, cx - 1, cy - 1, cx + 1, cy + 1, WHITE)
    return out


# ------------------------------------------------------------------ the car


def draw_car():
    """Red Testarossa-style car from behind, with its shadow (72x40 half res)."""
    img, d = new(72, 40)
    d.ellipse([3, 32, 68, 39], fill=SHADOW)
    for x in (4, 57):
        box(d, x, 24, x + 10, 36, TYRE)
        box(d, x + 1, 25, x + 9, 25, GREY_DARK)
    # Body: wide hips, then the cabin.
    box(d, 2, 16, 69, 31, RED)
    box(d, 2, 27, 69, 31, RED_SHADE)
    box(d, 3, 16, 68, 16, RED_LIGHT)
    d.polygon([(15, 16), (21, 5), (50, 5), (56, 16)], fill=rgba(RED))
    box(d, 21, 5, 50, 6, RED_LIGHT)
    d.polygon([(19, 15), (23, 8), (48, 8), (52, 15)], fill=rgba(GLASS))
    d.line([(26, 14), (30, 9)], fill=rgba(GLASS_LIGHT), width=2)
    # Full-width black grille over the tail lights.
    box(d, 5, 18, 66, 25, OUTLINE)
    for x0, x1 in ((6, 20), (51, 65)):
        box(d, x0, 19, x1, 24, TAIL)
    for y in (20, 22, 24):
        box(d, 6, y, 65, y, GREY_DARK)
    # Side strakes on the hips.
    for y in (17, 19, 21, 23):
        box(d, 2, y, 4, y, RED_SHADE)
        box(d, 67, y, 69, y, RED_SHADE)
    box(d, 31, 26, 40, 29, WHITE)  # blank plate
    box(d, 3, 26, 68, 26, RED_LIGHT)
    for x in (27, 41):
        box(d, x, 30, x + 3, 31, GREY)
    return img


def car_frames():
    straight = art("car", (72, 40), draw_car)
    full = fat(straight)
    # Lean frames: the straight frame rotated 4 degrees and shifted 3 px.
    lean_l = Image.new("RGBA", full.size, CLEAR)
    r = full.rotate(4, resample=Image.NEAREST)
    lean_l.paste(r, (-3, 0), r)
    lean_r = Image.new("RGBA", full.size, CLEAR)
    r = full.rotate(-4, resample=Image.NEAREST)
    lean_r.paste(r, (3, 0), r)
    return [full, lean_l, lean_r, fat(art("car_crash", (72, 40), draw_crash))]


def draw_crash():
    """The car spun, bonnet up: placeholder for the generator's crash frame."""
    car = draw_car()
    d = ImageDraw.Draw(car)
    d.polygon([(22, 6), (28, 0), (44, 0), (50, 6)], fill=rgba(RED_SHADE))
    box(d, 6, 19, 20, 24, GREY_DARK)  # a broken tail light
    return rotate(car, 18)


def draw_flame(variant):
    img, d = new(24, 12)
    for i, cx in enumerate((4, 18)):
        long = (i == 0) == (variant == 0)
        length = 11 if long else 8
        d.polygon([(cx - 4, 0), (cx + 4, 0), (cx + 2, length // 2), (cx, length), (cx - 2, length // 2)], fill=rgba(CYAN))
        d.polygon([(cx - 2, 0), (cx + 2, 0), (cx, length - 4)], fill=rgba(WHITE))
    return img


def flame_frames():
    raw = from_raw("flame", (24, 12), "centre")
    if raw is not None:
        a = outline_missing(raw)
        return [fat(a), fat(a.transpose(Image.FLIP_LEFT_RIGHT))]
    return [fat(draw_flame(v)) for v in (0, 1)]


def smoke_frames():
    frames = []
    for n, (r, fade) in enumerate(((3, 0), (5, 1), (7, 2))):
        img, d = new(16, 16)
        cx, cy = 8, 9 - n
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=rgba(GREY))
        d.ellipse([cx - r + 1, cy - r, cx + r - 2, cy + r - 3], fill=rgba(GREY_LIGHT))
        px = img.load()
        for y in range(16):
            for x in range(16):
                # Fading by dithering: later frames lose more pixels.
                if px[x, y][3] and fade and (x + y * (3 - fade)) % (4 - fade) == 0:
                    px[x, y] = CLEAR
        frames.append(fat(img))
    return frames


def sparkle_frames():
    frames = []
    for n in range(3):
        img, d = new(24, 24)
        c = 12
        ray = (4, 9, 11)[n]
        if n < 2:
            box(d, c - ray, c, c + ray, c, WHITE if n == 0 else YELLOW)
            box(d, c, c - ray, c, c + ray, WHITE if n == 0 else YELLOW)
            box(d, c - 1, c - 1, c + 1, c + 1, WHITE)
        for i in range(8 if n else 0):
            a = math.radians(i * 45 + 22)
            r = ray - 2 + n
            x, y = c + math.cos(a) * r, c + math.sin(a) * r
            box(d, round(x), round(y), round(x), round(y), CYAN if i % 2 else PINK)
        frames.append(fat(img))
    return frames


# -------------------------------------------------------------- road objects


def draw_block():
    """Barricade: striped boards on two legs, a red sign, a cone each side."""
    img, d = new(80, 48)
    for x in (16, 61):
        box(d, x, 22, x + 2, 46, GREY_DARK)
    for y0 in (16, 26):
        box(d, 9, y0, 70, y0 + 6, WHITE)
        for k in range(-2, 12):
            x = 9 + k * 8
            d.polygon([(x, y0 + 6), (x + 4, y0 + 6), (x + 10, y0), (x + 6, y0)], fill=rgba(ORANGE))
        box(d, 9, y0, 9, y0 + 6, OUTLINE)
        box(d, 70, y0, 70, y0 + 6, OUTLINE)
    d.rectangle([0, 0, 79, 15], fill=CLEAR)
    box(d, 17, 1, 62, 14, RED)
    box(d, 17, 14, 62, 14, RED_SHADE)
    sign = text_mask("CLOSED", FONT_SMALL)
    img.paste(rgba(WHITE), (40 - sign.width // 2, 4), sign)
    for x in (1, 70):
        cone(d, x, 30)
    return img


def cone(d, x, y):
    d.polygon([(x + 4, y), (x + 5, y), (x + 8, y + 14), (x + 1, y + 14)], fill=rgba(ORANGE))
    box(d, x + 2, y + 6, x + 7, y + 8, WHITE)
    box(d, x, y + 14, x + 9, y + 16, ORANGE)


def draw_gas():
    img, d = new(40, 40)
    box(d, 8, 9, 33, 38, RED)
    box(d, 8, 33, 33, 38, RED_SHADE)
    box(d, 9, 9, 32, 9, RED_LIGHT)
    box(d, 11, 3, 25, 8, RED_SHADE)
    d.rectangle([14, 5, 22, 6], fill=CLEAR)
    box(d, 27, 2, 31, 8, YELLOW_SHADE)
    box(d, 28, 1, 30, 2, GREY)
    # Fuel-drop badge.
    d.polygon([(20, 14), (26, 23), (26, 27), (23, 31), (17, 31), (14, 27), (14, 23)], fill=rgba(YELLOW))
    box(d, 17, 24, 18, 27, WHITE)
    return img


def draw_repair():
    img, d = new(40, 40)
    pts = []
    for i in range(10):
        r = 18 if i % 2 == 0 else 8
        a = math.radians(-90 + i * 36)
        pts.append((20 + r * math.cos(a), 21 + r * math.sin(a)))
    d.polygon(pts, fill=rgba(YELLOW))
    inner = [(20 + (x - 20) * 0.55, 21 + (y - 21) * 0.55) for x, y in pts]
    d.polygon(inner, fill=rgba(hexrgb("#fff08a")))
    # Silver wrench across the star.
    d.line([(9, 31), (29, 11)], fill=rgba(GREY_LIGHT), width=4)
    d.line([(10, 32), (30, 12)], fill=rgba(GREY), width=1)
    for cx, cy in ((9, 31), (30, 10)):
        d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=rgba(GREY_LIGHT))
        d.rectangle([cx - 1, cy - 1, cx + 1, cy + 1], fill=CLEAR)
    return img


def car_back(d, body, shade, roof=True, top_down=False):
    """A rival car from behind (64x40 half res): tyres, body, rear window."""
    d.ellipse([3, 32, 60, 39], fill=SHADOW)
    for x in (4, 50):
        box(d, x, 25, x + 9, 36, TYRE)
    box(d, 2, 17, 61, 31, body)
    box(d, 2, 28, 61, 31, shade)
    if roof:
        d.polygon([(12, 17), (17, 5), (46, 5), (51, 17)], fill=rgba(body))
        d.polygon([(15, 16), (19, 8), (44, 8), (48, 16)], fill=rgba(GLASS))
        d.line([(22, 15), (25, 9)], fill=rgba(GLASS_LIGHT), width=2)
    for x0 in (4, 50):
        box(d, x0, 20, x0 + 9, 24, TAIL)
    box(d, 3, 27, 60, 28, GREY_LIGHT)  # chrome bumper
    box(d, 27, 22, 36, 25, WHITE)


def draw_taxi():
    img, d = new(64, 40)
    car_back(d, YELLOW, YELLOW_SHADE)
    box(d, 24, 1, 39, 4, WHITE)
    box(d, 24, 4, 39, 4, GREY)
    for x in range(8, 56, 4):
        box(d, x, 17, x + 1, 18, OUTLINE)  # chequer stripe
    return img


def draw_convertible():
    img, d = new(64, 40)
    blue, blue_shade = hexrgb("#8ad4f4"), hexrgb("#4a98c8")
    car_back(d, blue, blue_shade, roof=False)
    box(d, 8, 12, 55, 17, blue)
    for x in (17, 37):  # white seats, top down
        box(d, x, 6, x + 9, 15, WHITE)
        box(d, x, 13, x + 9, 15, GREY_LIGHT)
    d.line([(10, 12), (14, 4), (49, 4), (53, 12)], fill=rgba(GREY_LIGHT), width=1)
    return img


def draw_van():
    img, d = new(64, 40)
    d.ellipse([3, 32, 60, 39], fill=SHADOW)
    for x in (5, 49):
        box(d, x, 27, x + 9, 36, TYRE)
    box(d, 4, 1, 59, 31, WHITE)
    box(d, 4, 26, 59, 31, GREY_LIGHT)
    box(d, 31, 3, 32, 29, GREY)  # two rear doors
    for x0 in (9, 36):
        box(d, x0, 5, x0 + 18, 12, GLASS)
        box(d, x0 + 1, 6, x0 + 3, 11, GLASS_LIGHT)
    box(d, 27, 17, 29, 18, GREY_DARK)
    box(d, 34, 17, 36, 18, GREY_DARK)
    for x0 in (4, 56):
        box(d, x0, 16, x0 + 3, 24, TAIL)
    box(d, 3, 29, 60, 31, GREY_DARK)
    return img


def draw_debris(variant):
    img, d = new(48, 32)
    rnd = random.Random(5 + variant)
    for i in range(2):
        plank, pd = new(30, 6)
        box(pd, 0, 0, 29, 5, WHITE)
        for k in range(-1, 6):
            x = k * 6
            pd.polygon([(x, 5), (x + 3, 5), (x + 7, 0), (x + 4, 0)], fill=rgba(ORANGE))
        angle = (25 if i else -35) + variant * 40 + rnd.randint(-8, 8)
        r = plank.rotate(angle, resample=Image.NEAREST, expand=True)
        img.paste(r, (2 + i * 16, 2 + variant * 4), r)
    c, cd = new(12, 18)
    cone(cd, 1, 0)
    r = c.rotate(60 if variant else -50, resample=Image.NEAREST, expand=True)
    img.paste(r, (18 - variant * 10, 12), r)
    return img


def draw_billboard():
    img, d = new(96, 72)
    for x in (22, 70):
        box(d, x, 40, x + 3, 71, GREY)
        box(d, x + 3, 40, x + 3, 71, GREY_DARK)
    box(d, 1, 1, 94, 42, PINK)
    box(d, 3, 3, 92, 40, CYAN)
    box(d, 5, 5, 90, 38, hexrgb("#2a1650"))
    # Sunset: bands, then a striped sun on the horizon.
    for i, col in enumerate(("#3c1c6e", "#7a2a8a", "#c8357a", "#ff6a5a")):
        box(d, 5, 5 + i * 6, 90, 10 + i * 6, hexrgb(col))
    d.pieslice([30, 14, 66, 50], 180, 360, fill=rgba(YELLOW))
    for y in (24, 27, 30):
        box(d, 30, y, 66, y, hexrgb("#ff6a5a"))
    box(d, 5, 32, 90, 38, hexrgb("#2a1650"))
    word = text_image("MIAMI", FONT_SMALL, cell=1, color=WHITE, outline=1, shadow=PINK)
    img.paste(word, (48 - word.width // 2, 28), word)
    return img


def draw_lifeguard():
    img, d = new(64, 72)
    mint, pink = hexrgb("#8ee6c4"), hexrgb("#ffa8cc")
    for x in (14, 46):
        box(d, x, 36, x + 2, 71, WHITE)
    box(d, 16, 52, 46, 53, GREY_LIGHT)
    d.line([(2, 71), (14, 44)], fill=rgba(WHITE), width=2)  # ramp
    box(d, 8, 34, 55, 37, mint)
    box(d, 10, 14, 53, 34, pink)
    for x in range(12, 53, 6):
        box(d, x, 14, x + 2, 34, hexrgb("#ff8ab8"))
    box(d, 24, 19, 39, 28, GLASS)
    box(d, 25, 20, 27, 27, GLASS_LIGHT)
    d.polygon([(6, 15), (32, 4), (57, 15)], fill=rgba(mint))
    box(d, 31, 0, 32, 5, GREY)
    box(d, 33, 0, 38, 3, RED)
    return img


def draw_banner():
    """START gantry: chequered posts and beam, high enough to drive under."""
    img, d = new(216, 132)
    for x0 in (2, 202):
        box(d, x0, 20, x0 + 11, 131, WHITE)
        for y in range(20, 131, 8):
            box(d, x0, y, x0 + 5, y + 3, OUTLINE)
            box(d, x0 + 6, y + 4, x0 + 11, y + 7, OUTLINE)
    box(d, 2, 10, 213, 29, WHITE)
    for x in range(2, 213, 4):
        for y in range(10, 29, 4):
            if (x // 4 + y // 4) % 2:
                box(d, x, y, x + 3, y + 3, OUTLINE)
    box(d, 66, 1, 149, 36, RED)
    box(d, 68, 3, 147, 34, RED_SHADE)
    word = text_image("START", FONT_BIG, cell=2, outline=1)
    img.paste(word, (108 - word.width // 2, 19 - word.height // 2), word)
    return img


# ------------------------------------------------------------- backgrounds


def draw_sky():
    """Bright blue in bands, lighter toward the horizon, pixel clouds (216x95)."""
    img, d = new(216, 95)
    bands = ["#2f9ae0", "#3aa8e6", "#48b6ea", "#56c4ec", "#62d0ec", "#6bdeec", "#8ae6f0", "#a8eef4"]
    for i, col in enumerate(bands):
        box(d, 0, i * 12, 215, i * 12 + 11, hexrgb(col))
    rnd = random.Random(11)
    for _ in range(6):
        x, y = rnd.randint(-10, 200), rnd.randint(8, 60)
        for dx, dy, r in ((0, 4, 6), (8, 0, 8), (18, 3, 6), (26, 5, 4)):
            d.ellipse([x + dx - r, y + dy - r // 2, x + dx + r, y + dy + r // 2 + 1], fill=rgba(WHITE))
        box(d, x - 6, y + 6, x + 30, y + 7, hexrgb("#d8f4f8"))
    return img


def draw_city():
    """216x55 half res: pastel art-deco towers on the left, open sea on the right,
    dunes and beach huts along the bottom. Transparent above."""
    img, d = new(216, 55)
    pink, mint, peach = hexrgb("#ffb0cc"), hexrgb("#a8ecd0"), hexrgb("#ffcaa0")
    shades = {pink: hexrgb("#e48aa8"), mint: hexrgb("#7cc8ac"), peach: hexrgb("#e4a478")}
    window = hexrgb("#5a8ab0")
    # The sea along the horizon, behind everything.
    box(d, 0, 44, 215, 54, WATER)
    box(d, 0, 44, 215, 44, hexrgb("#a8eef4"))
    for x in range(120, 215, 13):
        box(d, x, 47 + (x % 3), x + 3, 47 + (x % 3), SKY)
    rnd = random.Random(7)
    x = 2
    while x < 118:
        bw = rnd.randint(10, 20)
        bh = rnd.randint(14, 40)
        col = rnd.choice((pink, mint, peach))
        top = 50 - bh
        box(d, x, top, x + bw - 1, 50, col)
        box(d, x + bw - 2, top, x + bw - 1, 50, shades[col])
        # Deco top: stepped crown.
        box(d, x + 2, top - 3, x + bw - 3, top - 1, col)
        box(d, x + bw // 2 - 1, top - 6, x + bw // 2, top - 4, shades[col])
        for wy in range(top + 3, 47, 4):
            for wx in range(x + 2, x + bw - 3, 3):
                box(d, wx, wy, wx + 1, wy + 1, window)
        x += bw + rnd.randint(0, 3)
    # Dunes and huts.
    for xx in range(216):
        top = 49 + round(2 * math.sin(xx / 9) + math.sin(xx / 4))
        box(d, xx, top, xx, 54, SAND)
    for hx, col in ((132, pink), (158, mint), (186, peach)):
        box(d, hx, 44, hx + 8, 49, col)
        d.polygon([(hx - 1, 44), (hx + 4, 40), (hx + 9, 44)], fill=rgba(RED))
        box(d, hx + 3, 46, hx + 4, 49, OUTLINE)
    return img


def city_strip():
    """The skyline strip: the tile, a mirrored copy (seamless at both joins),
    then the tile again, so any 432 px window of a full 864 px loop is covered."""
    raw = from_raw_full("bg_city", (216, 55))
    if raw is not None:
        tile = Image.new("RGBA", raw.size, CLEAR)
        tile.paste(raw, (0, 0), raw)
        tile = Image.composite(tile, Image.new("RGBA", raw.size, CLEAR), _not_magenta(tile))
    else:
        tile = draw_city()
    tile = fat(tile)
    strip = Image.new("RGBA", (tile.width * 3, tile.height), CLEAR)
    strip.paste(tile, (0, 0))
    strip.paste(tile.transpose(Image.FLIP_LEFT_RIGHT), (tile.width, 0))
    strip.paste(tile, (tile.width * 2, 0))
    return strip, tile.width * 2


def _not_magenta(img):
    mask = Image.new("L", img.size, 255)
    px, mp = img.load(), mask.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if r > 150 and b > 150 and g < 110:
                mp[x, y] = 0
    return mask


# ---------------------------------------------------------------- HUD


def digit_frames():
    """0-9, the decimal point and a blank, 16x22: white type, 2 px outline."""
    out = []
    for ch in "0123456789. ":
        frame = Image.new("RGBA", (16, 22), CLEAR)
        if ch != " ":
            g = text_image(ch, FONT_BIG, cell=2, outline=2)
            frame.paste(g, ((16 - g.width) // 2, (22 - g.height) // 2), g)
        out.append(frame)
    return out


HEART = [".##.##.", "#######", "#######", "#######", ".#####.", "..###..", "...#..."]
PUMP = ["######..", "#....#..", "#....#.#", "######.#", "######.#", "######.#", "######.#", "######..", "########"]


def pixel_icon(rows, cell, colour, frame=24):
    mask = Image.new("1", (len(rows[0]) * cell, len(rows) * cell), 0)
    d = ImageDraw.Draw(mask)
    for y, row in enumerate(rows):
        for x, on in enumerate(row):
            if on == "#":
                d.rectangle([x * cell, y * cell, x * cell + cell - 1, y * cell + cell - 1], fill=1)
    img = Image.new("RGBA", (frame, frame), CLEAR)
    ox, oy = (frame - mask.width) // 2, (frame - mask.height) // 2
    img.paste(rgba(colour), (ox, oy), mask)
    return img, mask, (ox, oy)


def hud_icons():
    pump, _, _ = pixel_icon(PUMP, 2, WHITE)
    d = ImageDraw.Draw(pump)
    box(d, 6, 5, 13, 8, RED)  # the pump's window
    pump = add_outline(pump, 2)
    full, mask, (ox, oy) = pixel_icon(HEART, 3, RED)
    d = ImageDraw.Draw(full)
    box(d, ox + 3, oy + 3, ox + 5, oy + 5, WHITE)
    full = add_outline(full, 2)
    # Lost heart: outline only.
    empty = Image.new("RGBA", (24, 24), CLEAR)
    edge = add_outline(Image.composite(Image.new("RGBA", (24, 24), rgba(WHITE)), empty, _offset(mask, ox, oy)), 2, WHITE)
    inner = _offset(mask, ox, oy).filter(ImageFilter.MinFilter(5))
    edge.paste(CLEAR, (0, 0), inner)
    empty = add_outline(edge, 2)
    return [pump, full, empty]


def _offset(mask, ox, oy, size=24):
    m = Image.new("L", (size, size), 0)
    m.paste(255, (ox, oy), mask)
    return m


def gauge_frames():
    out = []
    for colour in (RED, ORANGE, hexrgb("#4ee06a"), GREY_DARK):
        img = Image.new("RGBA", (8, 18), rgba(OUTLINE))
        d = ImageDraw.Draw(img)
        box(d, 1, 1, 6, 16, colour)
        if colour != GREY_DARK:
            box(d, 1, 1, 6, 2, WHITE if colour != RED else hexrgb("#ff9a9a"))
        out.append(img)
    return out


def boost_frames():
    """Ready, pressed, then 8 cooling steps that refill left to right."""
    grey = hexrgb("#6a7080")

    def pill(fill, fill_to=None, label=WHITE):
        img, d = new(104, 48)
        d.rounded_rectangle([0, 0, 103, 47], radius=23, fill=rgba(OUTLINE))
        d.rounded_rectangle([2, 2, 101, 45], radius=21, fill=rgba(fill))
        if fill_to is not None and fill_to > 0:
            mask = Image.new("L", (104, 48), 0)
            md = ImageDraw.Draw(mask)
            md.rounded_rectangle([2, 2, 101, 45], radius=21, fill=255)
            md.rectangle([2 + round(99 * fill_to), 0, 103, 47], fill=0)
            img.paste(rgba(hexrgb("#a83a78")), (0, 0), mask)
        d.rounded_rectangle([6, 5, 97, 9], radius=2, fill=rgba(WHITE if fill == PINK else grey))
        word = text_image("BOOST", FONT_SMALL, cell=2, color=label, outline=2, bold=1)
        img.paste(word, (52 - word.width // 2, 25 - word.height // 2), word)
        return img

    frames = [pill(PINK), pill(hexrgb("#a8206c"), label=GREY_LIGHT)]
    for n in range(8):
        frames.append(pill(grey, n / 8, GREY_LIGHT))
    return frames


WORDS = {
    "score": "SCORE",
    "best": "BEST",
    "newbest": "NEW BEST",
    "paused": "PAUSED",
    "taptostart": "TAP TO START",
    "taptogo": "TAP TO GO",
    "km": "KM",
    "kmh": "KM/H",
    "gas": "+GAS",
    "life": "+LIFE",
    "p100": "+100",
    "p1000": "+1000",
    "distance": "DISTANCE",
}
WORD_COLOURS = {"gas": YELLOW, "life": PINK, "p100": CYAN, "p1000": CYAN, "newbest": YELLOW}

HEADLINES = {"3": "3", "2": "2", "1": "1", "go": "GO!", "wrecked": "WRECKED", "outofgas": "OUT OF GAS"}


def headline(s):
    return text_image(s, FONT_BIG, cell=4, outline=3, shadow=PINK)


# ----------------------------------------------------------------- screens


def draw_logo():
    """MIAMI RUSH in chrome lettering with a neon pink edge (180x60 half res)."""
    img, _ = new(180, 60)
    chrome = ["#ffffff", "#d8f6ff", "#9ae4ff", "#4a7ad0", "#ff8ad0", "#ffd0f0", "#ffffff"]
    for row, (word, y) in enumerate((("MIAMI", 2), ("RUSH", 32))):
        mask = text_mask(word, FONT_BIG, cell=3, spacing=1)
        fill = Image.new("RGBA", mask.size, CLEAR)
        fd = ImageDraw.Draw(fill)
        for i in range(mask.height):
            fd.line([(0, i), (mask.width, i)], fill=rgba(hexrgb(chrome[i * len(chrome) // mask.height])))
        letters = Image.new("RGBA", mask.size, CLEAR)
        letters.paste(fill, (0, 0), mask)
        letters = add_outline(letters, 1, PINK)
        sheared = letters.transform(
            letters.size, Image.AFFINE, (1, 0.18, -4, 0, 1, 0), resample=Image.NEAREST
        )
        img.paste(sheared, (90 - sheared.width // 2 + 2, y), sheared)
    return add_outline(img, 1)


def logo():
    raw = from_raw("logo", (180, 60), "centre")
    return fat(outline_missing(raw) if raw is not None else draw_logo())


def sunset_scene(car):
    """The car on the beach road at sunset, full screen (the title art)."""
    raw = from_raw_full("title_bg", (W, H))
    if raw is not None:
        return raw.convert("RGB")
    half_w, half_h, horizon = W // 2, H // 2, HORIZON // 2
    img = Image.new("RGBA", (half_w, half_h), CLEAR)
    d = ImageDraw.Draw(img)
    bands = ["#24104a", "#3a1660", "#5a1c74", "#842a84", "#b23a86", "#e04e7e", "#ff7262", "#ff9a52", "#ffc04a"]
    step = horizon / len(bands)
    for i, col in enumerate(bands):
        box(d, 0, round(i * step), half_w, round((i + 1) * step), hexrgb(col))
    # Striped sun sinking into the sea.
    sun = Image.new("RGBA", (half_w, horizon), CLEAR)
    sd = ImageDraw.Draw(sun)
    sd.ellipse([68, 34, 148, 114], fill=rgba(hexrgb("#ffe46a")))
    sd.rectangle([68, 74, 148, 114], fill=rgba(hexrgb("#ff8a5a")))
    sd.ellipse([68, 34, 148, 114], outline=None)
    for k, y in enumerate(range(62, horizon, 5)):
        sd.rectangle([60, y, 156, y + 1 + k // 2], fill=CLEAR)
    img.paste(sun, (0, 0), sun)
    rnd = random.Random(3)
    x = 0
    while x < half_w:
        bw, bh = rnd.randint(6, 14), rnd.randint(8, 30)
        if 56 < x < 150:
            bh //= 3
        box(d, x, horizon - bh, x + bw, horizon, hexrgb("#3a1a56"))
        x += bw + 1
    box(d, 0, horizon - 3, half_w, horizon, hexrgb("#c04a7a"))
    sunset = {
        "sand": (hexrgb("#e09a74"), hexrgb("#c8825e")),
        "wet": hexrgb("#b87058"),
        "water": hexrgb("#7a3a7a"),
        "foam": hexrgb("#ff9ac8"),
        "rumble": (hexrgb("#ffe0d0"), hexrgb("#d02a4a")),
        "asphalt": (hexrgb("#5a4a6a"), hexrgb("#4a3c5c")),
        "dash": hexrgb("#ffe0d0"),
        "palms": hexrgb("#2a1238"),
    }
    road = draw_road(0, 0, sunset)
    img.paste(road, (0, horizon))
    full = fat(img)
    full.paste(car, (144, 360), car)
    return full.convert("RGB")


def corner_guides():
    """Debug overlay: quarter circles of 60 to 140 px in every corner. The one
    that follows the screen's edge gives the corner radius."""
    img = Image.new("RGBA", (W, H), CLEAR)
    d = ImageDraw.Draw(img)
    colours = {60: PINK, 80: YELLOW, 100: CYAN, 110: WHITE, 120: hexrgb("#4ee06a"), 140: ORANGE}
    for r, col in colours.items():
        for cx, cy, start in ((r, r, 180), (W - r, r, 270), (W - r, H - r, 0), (r, H - r, 90)):
            d.arc([cx - r, cy - r, cx + r, cy + r], start, start + 90, fill=rgba(col), width=2)
    # A legend in the middle: each radius in its arc's colour.
    labels = [text_image(str(r), FONT_SMALL, cell=2, color=col, outline=2) for r, col in colours.items()]
    width = sum(lb.width for lb in labels) + 6 * (len(labels) - 1)
    x, y = (W - width) // 2, 236
    d.rectangle([x - 6, y - 6, x + width + 5, y + labels[0].height + 5], fill=rgba(OUTLINE))
    for lb in labels:
        img.paste(lb, (x, y), lb)
        x += lb.width + 6
    return img


def icon(car):
    img = Image.new("RGBA", (96, 96), CLEAR)
    d = ImageDraw.Draw(img)
    bands = ["#3a1660", "#842a84", "#e04e7e", "#ff7262", "#ffc04a"]
    for i, col in enumerate(bands):
        box(d, 0, i * 12, 95, i * 12 + 11, hexrgb(col))
    d.ellipse([28, 22, 68, 62], fill=rgba(hexrgb("#ffe46a")))
    box(d, 0, 60, 95, 95, hexrgb("#4a3c5c"))
    for x in range(0, 96, 12):
        box(d, x, 76, x + 5, 77, hexrgb("#ffe0d0"))
    full = fat(img)
    big = car.resize((round(car.width * 1.25), round(car.height * 1.25)), Image.NEAREST)
    full.paste(big, ((192 - big.width) // 2, 192 - big.height - 12), big)
    raw = from_raw_full("icon", (192, 192))
    return raw if raw is not None else full


# ------------------------------------------------------------------ output


# Road objects: art (one image per frame, full size), and width in world units.
# A lane is 667 units; the player's car is about 720 wide.
def objects():
    taxi = art("rival_taxi", RIVAL, draw_taxi)
    conv = art("rival_convertible", RIVAL, draw_convertible)
    van = art("rival_van", RIVAL, draw_van)
    rivals = [taxi, conv, van]
    raw_debris = from_raw("debris", (48, 32))
    debris = (
        [outline_missing(raw_debris), outline_missing(raw_debris.transpose(Image.FLIP_LEFT_RIGHT))]
        if raw_debris is not None
        else [add_outline(draw_debris(v), 1) for v in (0, 1)]
    )
    block = art("block", (80, 48), draw_block)
    if from_raw("block", (80, 48)) is not None:
        block = letter(block, "CLOSED", (37, 9), outline=0)
    billboard = art("billboard", (96, 72), draw_billboard)
    if from_raw("billboard", (96, 72)) is not None:
        billboard = letter(billboard, "MIAMI", (48, 33))
    banner = art("banner", (216, 132), draw_banner)
    if from_raw("banner", (216, 132)) is not None:
        banner = letter(banner, "START", (110, 40))
    gas = art("gas", (40, 40), draw_gas)
    repair = art("repair", (40, 40), draw_repair)
    return {
        "block": ([block], 600, SIZE_COUNT),
        "gas": ([gas, glint(gas)], 300, SIZE_COUNT),
        "repair": ([repair, glint(repair)], 300, SIZE_COUNT),
        "rivals": (rivals + [rotate(r, 20) for r in rivals], 640, SIZE_COUNT),
        "debris": (debris, 360, SIZE_COUNT),
        "billboard": ([billboard], 1150, SIZE_COUNT),
        "lifeguard": ([art("lifeguard", (64, 72), draw_lifeguard)], 770, SIZE_COUNT),
        # The start gantry only shows near the start line, so 3 sizes do.
        "banner": ([banner], 2300, 3),
    }


def letter(img, word, centre, outline=1):
    """Script lettering on generator art, whose signs are blank: `word` centred
    on `centre`, a half-resolution point on the sign the generator drew."""
    t = text_image(word, FONT_SMALL, cell=1, outline=outline)
    out = img.copy()
    out.paste(t, (centre[0] - t.width // 2, centre[1] - t.height // 2), t)
    return out


def sized(img, n):
    f = SIZE_STEP**n
    w = max(1, math.floor(img.width * f + 0.5))
    h = max(1, math.floor(img.height * f + 0.5))
    return img.resize((w, h), Image.NEAREST)


def main():
    meta = {"objects": {}, "words": {}, "headlines": {}}
    for name, (frames, world, count) in objects().items():
        full = [fat(f) for f in frames]
        sizes = []
        for n in range(count):
            for i, f in enumerate(full):
                s = sized(f, n)
                save_png(s, ASSETS / "obj" / f"{name}_{i}_{n}.png")
            sizes.append([s.width, s.height])
        meta["objects"][name] = {"world": world, "frames": len(full), "sizes": sizes}

    cars = car_frames()
    for i, f in enumerate(cars):
        save_png(f, ASSETS / "car" / f"car_{i}.png")
    for group, frames in (("flame", flame_frames()), ("smoke", smoke_frames()), ("sparkle", sparkle_frames())):
        for i, f in enumerate(frames):
            save_png(f, ASSETS / "car" / f"{group}_{i}.png")

    sky = from_raw_full("bg_sky", (216, 95))
    if sky is None:
        sky = draw_sky()
    save_png(fat(sky), ASSETS / "bg" / "bg_sky.png")
    strip, period = city_strip()
    save_png(strip, ASSETS / "bg" / "bg_city.png", extra=48)
    meta["cityPeriod"] = period
    meta["cityWidth"] = strip.width

    for i, f in enumerate(digit_frames()):
        save_png(f, ASSETS / "hud" / f"digits_{i}.png")
    for i, f in enumerate(hud_icons()):
        save_png(f, ASSETS / "hud" / f"hud_icons_{i}.png")
    for i, f in enumerate(gauge_frames()):
        save_png(f, ASSETS / "hud" / f"gauge_{i}.png")
    for i, f in enumerate(boost_frames()):
        save_png(f, ASSETS / "hud" / f"boost_btn_{i}.png")
    for key, word in WORDS.items():
        img = text_image(word, FONT_SMALL, cell=2, color=WORD_COLOURS.get(key, WHITE), outline=2, bold=1)
        save_png(img, ASSETS / "hud" / f"words_{key}.png")
        meta["words"][key] = [img.width, img.height]
    for key, word in HEADLINES.items():
        img = headline(word)
        save_png(img, ASSETS / "screens" / f"headlines_{key}.png")
        meta["headlines"][key] = [img.width, img.height]

    lg = logo()
    save_png(lg, ASSETS / "screens" / "logo.png", extra=48)
    meta["logo"] = [lg.width, lg.height]
    title = sunset_scene(cars[0])
    save_jpg(title, ASSETS / "screens" / "title_bg.jpg")
    dark = ImageEnhance.Brightness(title.filter(ImageFilter.GaussianBlur(5))).enhance(0.45)
    save_jpg(dark, ASSETS / "screens" / "results_bg.jpg")
    save_png(corner_guides(), ASSETS / "screens" / "corners.png")
    save_png(icon(cars[0]), ASSETS / "icon.png", extra=48)

    write_meta(meta)
    print("sprites: done")


def write_meta(meta):
    GEN_JS.mkdir(parents=True, exist_ok=True)
    lines = []
    for key, value in meta.items():
        if isinstance(value, dict):
            inner = ",\n".join(f"    {json.dumps(k)}: {json.dumps(v)}" for k, v in value.items())
            lines.append(f"  {key}: {{\n{inner}\n  }}")
        else:
            lines.append(f"  {key}: {json.dumps(value)}")
    body = "{\n" + ",\n".join(lines) + "\n}"
    (GEN_JS / "art.js").write_text(
        "// Written by tools/sprites.py: picture sizes the game needs to place\n"
        "// pictures, which are never resized at run time. Road objects list their\n"
        "// width in world units and their pixel size at every size step, step 0\n"
        "// the largest, each 0.75x the last.\n\n"
        f"export const SIZE_STEP = {SIZE_STEP}\n\n"
        f"export const ART = {body}\n"
    )


if __name__ == "__main__":
    main()
