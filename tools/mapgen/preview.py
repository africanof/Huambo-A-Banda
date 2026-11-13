"""Pré-visualização do mapa (Pillow). Usa a mesma paleta que o cliente (client/src/world/palette.gd)."""
from __future__ import annotations

import math

from PIL import Image, ImageDraw, ImageFont

GROUND = (176, 120, 82)       # terra vermelha do planalto, seca
ASPHALT = (78, 76, 78)
ASPHALT_EDGE = (205, 170, 130)
DIRT_ROAD = (160, 88, 56)
AREA = {
    "park": (104, 150, 76), "grass": (128, 156, 82), "pitch": (88, 150, 70), "stadium": (150, 130, 110),
    "cemetery": (120, 140, 96), "wood": (70, 118, 62), "scrub": (140, 140, 86), "water": (90, 140, 170),
    "wetland": (120, 140, 86), "parking": (150, 146, 140), "railyard": (130, 110, 96), "plaza": (214, 196, 160),
    "farmland": (150, 130, 80), "campus": (190, 150, 112), "platform": (190, 180, 160),
}
WALL = {
    "house": [(234, 214, 180), (231, 164, 147), (240, 226, 200), (226, 190, 120), (222, 176, 160)],
    "block": [(200, 196, 188), (231, 164, 147), (214, 206, 190)],
    "commercial": [(231, 164, 147), (236, 222, 196), (210, 200, 180)],
    "shed": [(170, 170, 170)],
}
ROOF = {"tile": (184, 83, 47), "metal": (150, 154, 156), "flat": (176, 170, 160)}
SPECIAL = {
    "cathedral": ((244, 240, 230), (196, 98, 58)), "palace": ((230, 160, 148), (184, 83, 47)),
    "government": ((222, 150, 132), (90, 92, 98)), "station": ((238, 222, 176), (184, 83, 47)),
    "market": ((226, 214, 190), (140, 146, 150)), "civic": ((230, 170, 150), (184, 83, 47)),
    "cinema": ((226, 150, 150), (176, 170, 160)), "church": ((244, 240, 230), (196, 98, 58)),
    "hotel": ((236, 230, 214), (176, 170, 160)), "post": ((231, 160, 150), (184, 83, 47)),
    "hospital": ((240, 240, 236), (176, 170, 160)), "school": ((236, 214, 170), (184, 83, 47)),
}


def _pts(flat, s):
    return [(flat[i] * s, flat[i + 1] * s) for i in range(0, len(flat), 2)]


def render_preview(data: dict, path: str, max_side: int = 2000) -> None:
    import os

    s = max_side / max(data["width"], data["height"])
    W, H = int(data["width"] * s), int(data["height"] * s)
    im = Image.new("RGB", (W, H), GROUND)
    d = ImageDraw.Draw(im)
    for a in data["areas"]:
        col = AREA.get(a["k"])
        if not col:
            continue
        if a.get("line"):
            d.line(_pts(a["p"], s), fill=(90, 140, 170), width=max(1, int(3 * data["scale"] * s)))
        elif len(a["p"]) >= 6:
            d.polygon(_pts(a["p"], s), fill=col)
    for r in data["roads"]:
        w = max(1, int(r["w"] * s))
        col = DIRT_ROAD if r["u"] else ASPHALT
        d.line(_pts(r["p"], s), fill=col, width=w, joint="curve")
    for rail in data["rails"]:
        d.line(_pts(rail, s), fill=(60, 50, 45), width=max(1, int(4 * s * data["scale"])))
    for b in sorted(data["buildings"], key=lambda b: max(b["p"][1::2])):
        pts = _pts(b["p"], s)
        k = b["k"]
        if k in SPECIAL:
            wall, roof = SPECIAL[k]
        else:
            pal = WALL.get(k, WALL["house"])
            wall = pal[b["s"] % len(pal)]
            roof = ROOF["tile"] if k == "house" and b["s"] % 5 else (ROOF["flat"] if k in ("block", "commercial") else ROOF["metal"])
        h = b["h"] * s
        d.polygon(pts, fill=tuple(int(c * 0.72) for c in wall))
        d.polygon([(x, y - h) for x, y in pts], fill=roof, outline=tuple(int(c * 0.8) for c in roof))
    for i in range(0, len(data["trees"]), 2):
        x, y = data["trees"][i] * s, data["trees"][i + 1] * s
        r = max(1.5, 2.6 * data["scale"] * s)
        d.ellipse((x - r, y - r * 1.6, x + r, y + r * 0.4), fill=(58, 104, 52))
    for m in data["monuments"]:
        x, y = m["x"] * s, m["y"] * s
        d.rectangle((x - 3, y - 18, x + 3, y), fill=(150, 150, 150))
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 15)
        small = ImageFont.truetype("DejaVuSans.ttf", 11)
    except OSError:
        font = small = ImageFont.load_default()
    for lb in data["labels"]:
        x, y = lb["x"] * s, lb["y"] * s
        if lb["k"] == "bairro":
            d.text((x, y), lb["t"].upper(), font=font, fill=(255, 255, 255), anchor="mm", stroke_width=3, stroke_fill=(60, 30, 20))
        elif lb["k"] == "landmark":
            d.text((x, y), lb["t"], font=small, fill=(255, 240, 200), anchor="mm", stroke_width=2, stroke_fill=(30, 20, 15))
    for b in data["bairros"]:
        x, y = b["x"] * s, b["y"] * s
        d.ellipse((x - 5, y - 5, x + 5, y + 5), fill=(255, 209, 102), outline=(0, 0, 0))
    d.text((8, H - 8), data["attribution"], font=small, fill=(255, 255, 255), anchor="lb", stroke_width=2, stroke_fill=(0, 0, 0))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)
    print("pré-visualização:", path, im.size)
