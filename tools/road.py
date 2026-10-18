"""Draws the 42 road frames, src/common/assets/road/road_<level>_<phase>.png:
the road from the horizon down at each of the 7 curve levels and 6 stripe
phases, at half resolution (216x162), shown at 2x by the game.

The frames use the projection constants of src/common/js/projection.js, so
sprites the game places stand on the drawn road. Rerun after changing them:

    python3 tools/road.py
"""

from PIL import Image, ImageDraw

from common import (
    ASPHALT_DARK,
    ASPHALT_LIGHT,
    ASSETS,
    BAND,
    DRAW,
    H,
    HORIZON,
    LANE_W,
    LEVELS,
    PALM_H,
    PALM_X,
    PHASES,
    RED,
    ROAD_HALF,
    SAND,
    SKY,
    W,
    WATER,
    WHITE,
    hexrgb,
    palm_art,
    project,
    rgba,
    save_png,
)

SAND_DARK = hexrgb("#e2cc92")
WET_SAND = hexrgb("#d8c890")
RUMBLE_W = 1.12 * ROAD_HALF  # rumble strips run outside the asphalt
DASH_W = 26  # half-width of a lane dash, world units
SHORE_X = 3000  # the sea starts this far right of the centre line

# The colours of a daytime frame; the title art redraws the road at sunset.
DAY = {
    "sand": (SAND, SAND_DARK),
    "wet": WET_SAND,
    "water": WATER,
    "foam": SKY,
    "rumble": (WHITE, RED),
    "asphalt": (ASPHALT_LIGHT, ASPHALT_DARK),
    "dash": WHITE,
}


def edges(c):
    """Every segment edge, nearest first: screen y, px per world unit, centre x."""
    out = []
    for i in range(DRAW + 1):
        x, y, k = project(i, 0, c)
        out.append((y, k, x))
    return out


def draw_road(c, phase, colours=DAY, scale=0.5, palms=True):
    """The road below the horizon on a road bent by curve value `c`, with the
    band pattern advanced by `phase` segments."""
    w, h = round(W * scale), round((H - HORIZON) * scale)
    img = Image.new("RGBA", (w, h), rgba(colours["sand"][0]))
    d = ImageDraw.Draw(img)

    def pt(x, y):
        return (x * scale, (y - HORIZON) * scale)

    def quad(e1, e2, x_lo, x_hi, colour):
        y1, k1, c1 = e1
        y2, k2, c2 = e2
        d.polygon(
            [pt(c1 + x_lo * k1, y1), pt(c1 + x_hi * k1, y1), pt(c2 + x_hi * k2, y2), pt(c2 + x_lo * k2, y2)],
            fill=rgba(colour),
        )

    e = edges(c)
    # Beyond the draw distance: far sand and the sea up to the horizon.
    yf, kf, cf = e[DRAW]
    d.rectangle([0, 0, w, (yf - HORIZON) * scale + 1], fill=rgba(colours["sand"][0]))
    d.rectangle([(cf + SHORE_X * kf) * scale, 0, w, (yf - HORIZON) * scale + 1], fill=rgba(colours["water"]))
    for i in range(DRAW - 1, -1, -1):
        e1, e2 = e[i], e[i + 1]
        light = ((phase + i) // BAND) % 2 == 0
        y1, y2 = e1[0], e2[0]
        d.rectangle([0, (y2 - HORIZON) * scale, w, (y1 - HORIZON) * scale], fill=rgba(colours["sand"][0 if light else 1]))
        far = 20 * ROAD_HALF
        quad(e1, e2, SHORE_X - 260, far, colours["wet"])
        quad(e1, e2, SHORE_X, far, colours["water"])
        if light:
            quad(e1, e2, SHORE_X, SHORE_X + 120, colours["foam"])
        quad(e1, e2, -RUMBLE_W, RUMBLE_W, colours["rumble"][0 if light else 1])
        quad(e1, e2, -ROAD_HALF, ROAD_HALF, colours["asphalt"][0 if light else 1])
        if light:
            for lane in (-1, 1):
                off = lane * LANE_W / 2
                quad(e1, e2, off - DASH_W, off + DASH_W, colours["dash"])
    if palms:
        paste_palms(img, e, phase, scale, colours.get("palms"))
    return img


PALMS = None


def paste_palms(img, e, phase, scale, tint):
    """Palms stand on every 6th segment on both sides, so they repeat with the
    bands: leaning palms on the left, upright ones on the right."""
    global PALMS
    if PALMS is None:
        PALMS = (palm_art("palm_b", 18), palm_art("palm_a", 4))
    left, right = PALMS
    if tint:
        left, right = silhouette(left, tint), silhouette(right, tint)
    for i in range(DRAW, 0, -1):
        if (phase + i) % PHASES:
            continue
        y, k, x = e[i]
        height = PALM_H * k * scale
        if height < 3:
            continue
        for side, template in ((-1, left), (1, right)):
            px = (x + side * PALM_X * k) * scale
            h = round(height)
            wd = max(1, round(height * template.width / template.height))
            sprite = template.resize((wd, h), Image.NEAREST)
            img.paste(sprite, (round(px - wd / 2), round((y - HORIZON) * scale - h)), sprite)


def silhouette(img, colour):
    out = Image.new("RGBA", img.size, rgba(colour))
    out.putalpha(img.getchannel("A"))
    return out


def main():
    for level, c in enumerate(LEVELS):
        for phase in range(PHASES):
            frame = draw_road(c, phase)
            save_png(frame.convert("RGB").convert("RGBA"), ASSETS / "road" / f"road_{level}_{phase}.png")
    print("road: 42 frames")


if __name__ == "__main__":
    main()
