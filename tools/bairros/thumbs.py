#!/usr/bin/env python3
"""Postais dos bairros para o catálogo do mapa (como as fotografias das cidades no Vida na Banda).

Cada postal é o centro do bairro desenhado com a ARTE REAL do bairro (os recortes de IA dos kits),
nas posições verdadeiras do mapa (client/assets/bairros/<id>.json), na mesma projeção isométrica
do jogo (1 m em x → (+64, +32) px; 1 m em y → (−64, +32) px). Não se desenha arte por código:
só se compõem as imagens que já existem (chão com as texturas do jogo, ruas, edifícios, árvores).

Uso:  python3 tools/bairros/thumbs.py            → client/assets/bairros/thumbs/<id>.webp
"""
from __future__ import annotations

import glob
import json
import math
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "client")
OUT = os.path.join(ROOT, "assets", "bairros", "thumbs")
PX, PY = 64.0, 32.0
S = 0.22                     # escala de desenho (px do jogo → px do postal antes do corte)
W_OUT, H_OUT = 480, 300      # tamanho final
WINDOW_M = 40.0              # lado da janela à volta do centro (m)


def res_path(p: str) -> str:
    return os.path.join(ROOT, p.replace("res://", ""))


def load_objects() -> dict:
    objs: dict = {}
    demo = json.load(open(os.path.join(ROOT, "assets", "demo", "manifest.json")))
    for k, o in demo.get("objects", demo).items():
        if isinstance(o, dict):
            o = dict(o)
            o.setdefault("path", f"res://assets/demo/{k}.png")
            objs[k] = o
    for m in glob.glob(os.path.join(ROOT, "assets", "kits", "*", "manifest.json")):
        for k, o in json.load(open(m))["objects"].items():
            objs[k] = o
    return objs


_img_cache: dict = {}


def sprite(o: dict):
    p = res_path(o["path"])
    if not os.path.exists(p):
        # alguns kits guardam .webp com o mesmo nome
        alt = os.path.splitext(p)[0] + ".webp"
        p = alt if os.path.exists(alt) else None
    if p is None:
        return None
    if p not in _img_cache:
        _img_cache[p] = Image.open(p).convert("RGBA")
    return _img_cache[p]


def to_screen(x: float, y: float) -> tuple[float, float]:
    return ((x - y) * PX * S, (x + y) * PY * S)


def front_corner(x: float, y: float, w: float, h: float) -> tuple[float, float]:
    best = (x, y)
    for c in [(x + w, y), (x + w, y + h), (x, y + h)]:
        if to_screen(*c)[1] > to_screen(*best)[1] + 0.01:
            best = c
    return best


def tex(name: str):
    p = os.path.join(ROOT, "assets", "demo", f"chao_{name}.png")
    return Image.open(p).convert("RGB") if os.path.exists(p) else None


def tiled_poly(canvas: Image.Image, poly: list[tuple[float, float]], t: Image.Image | None, fallback: tuple[int, int, int]) -> None:
    mask = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    if t is None:
        layer = Image.new("RGB", canvas.size, fallback)
    else:
        tt = t.resize((max(8, int(t.width * 0.5)), max(8, int(t.height * 0.5))))
        layer = Image.new("RGB", canvas.size)
        for yy in range(0, canvas.size[1], tt.height):
            for xx in range(0, canvas.size[0], tt.width):
                layer.paste(tt, (xx, yy))
    canvas.paste(layer, (0, 0), mask)


def render(bairro: str, objs: dict) -> Image.Image | None:
    d = json.load(open(os.path.join(ROOT, "assets", "bairros", f"{bairro}.json")))
    named = [b for b in d["buildings"] if str(b.get("label", "")) and not str(b.get("label", "")).startswith("Casa")]
    if not named:
        named = d["buildings"]
    # centro: a zona mais cheia de vida — onde cabem mais edifícios (os com nome valem o triplo)
    def ctr(b):
        return (b["at"][0] + b["fp"][0] / 2, b["at"][1] + b["fp"][1] / 2)
    half = WINDOW_M * 0.4
    best, best_score = ctr(named[0]), -1.0
    for cand in [ctr(b) for b in named]:
        score = 0.0
        for b in d["buildings"]:
            bx, by = ctr(b)
            if abs(bx - cand[0]) <= half and abs(by - cand[1]) <= half:
                score += 3.0 if b in named else 1.0
        if score > best_score:
            best, best_score = cand, score
    # puxa para o meio dos edifícios dessa zona
    zone = [ctr(b) for b in d["buildings"] if abs(ctr(b)[0] - best[0]) <= half and abs(ctr(b)[1] - best[1]) <= half]
    cx = sum(z[0] for z in zone) / len(zone)
    cy = sum(z[1] for z in zone) / len(zone)
    win = (cx - WINDOW_M / 2, cy - WINDOW_M / 2, WINDOW_M, WINDOW_M)

    corners = [to_screen(win[0], win[1]), to_screen(win[0] + win[2], win[1]), to_screen(win[0], win[1] + win[3]), to_screen(win[0] + win[2], win[1] + win[3])]
    minx = min(c[0] for c in corners) - 40
    maxx = max(c[0] for c in corners) + 40
    miny = min(c[1] for c in corners) - 260
    maxy = max(c[1] for c in corners) + 20
    W, H = int(maxx - minx), int(maxy - miny)
    off = (-minx, -miny)
    img = Image.new("RGBA", (W, H), (138, 90, 60, 255))

    def P(x: float, y: float) -> tuple[float, float]:
        s = to_screen(x, y)
        return (s[0] + off[0], s[1] + off[1])

    # chão
    ground = d["ground"][0]["kind"] if d.get("ground") else "terra"
    big = (win[0] - 30, win[1] - 30, win[2] + 60, win[3] + 60)
    gp = [P(big[0], big[1]), P(big[0] + big[2], big[1]), P(big[0] + big[2], big[1] + big[3]), P(big[0], big[1] + big[3])]
    tiled_poly(img, gp, tex("terra" if ground not in ("relva", "asfalto", "calcada") else ground), (138, 90, 60))
    for a in d.get("areas", []):
        tiled_poly(img, [P(q[0], q[1]) for q in a["pts"]], tex("relva"), (79, 122, 58))
    # faixas do chão (Cidade Baixa: avenida em faixas)
    for rule in d.get("ground", []):
        if "y" in rule:
            y0, y1 = rule["y"]
            poly = [P(-10, y0), P(d["size"][0] + 10, y0), P(d["size"][0] + 10, y1), P(-10, y1)]
            tiled_poly(img, poly, tex(rule["kind"]), (120, 120, 120))
    # ruas reais (passeio por baixo, faixa por cima)
    for pass_i in (0, 1):
        for r in d.get("roads", []):
            paved = bool(r.get("paved"))
            hw = float(r["w"]) / 2 + (0 if pass_i else (2.0 if paved else 0.8))
            t = tex("calcada") if pass_i == 0 and paved else (tex("asfalto") if paved else tex("terra"))
            pts = r["pts"]
            for i in range(len(pts) - 1):
                ax, ay = pts[i]
                bx, by = pts[i + 1]
                L = math.hypot(bx - ax, by - ay) or 1
                nx, ny = -(by - ay) / L * hw, (bx - ax) / L * hw
                tiled_poly(img, [P(ax + nx, ay + ny), P(bx + nx, by + ny), P(bx - nx, by - ny), P(ax - nx, ay - ny)], t, (90, 90, 90))
                if pass_i == 0 or not paved:
                    continue

    # edifícios e adereços, por profundidade (como o y-sort do jogo)
    items = []
    for b in d["buildings"]:
        o = objs.get(b["id"])
        if not o:
            continue
        x, y = front_corner(b["at"][0], b["at"][1], b["fp"][0], b["fp"][1])
        items.append((x + y, o, x, y))
    for p in d.get("props", []):
        o = objs.get(p["id"])
        if not o:
            continue
        items.append((p["at"][0] + p["at"][1], o, p["at"][0], p["at"][1]))
    items.sort(key=lambda t: t[0])
    lo, hi = (win[0] - 8, win[1] - 8), (win[0] + win[2] + 8, win[1] + win[3] + 8)
    for _, o, x, y in items:
        if not (lo[0] <= x <= hi[0] and lo[1] <= y <= hi[1]):
            continue
        sp = sprite(o)
        if sp is None:
            continue
        k = float(o.get("scale", 1.0)) * S
        w, h = max(1, int(sp.width * k)), max(1, int(sp.height * k))
        im = sp.resize((w, h), Image.LANCZOS)
        sx, sy = P(x, y)
        img.alpha_composite(im, (int(sx - o["anchor"][0] * k), int(sy - o["anchor"][1] * k)))

    # corte ao centro com a proporção do postal
    ccx, ccy = P(cx, cy)
    ccy -= 40  # os edifícios sobem a partir do chão: sobe um pouco o enquadramento
    cw = min(W, H * W_OUT / H_OUT) * 0.66
    ch = cw * H_OUT / W_OUT
    box = (int(ccx - cw / 2), int(ccy - ch / 2), int(ccx + cw / 2), int(ccy + ch / 2))
    return img.crop(box).resize((W_OUT, H_OUT), Image.LANCZOS).convert("RGB")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    objs = load_objects()
    only = sys.argv[1:]
    for f in sorted(glob.glob(os.path.join(ROOT, "assets", "bairros", "*.json"))):
        bid = os.path.basename(f)[:-5]
        if only and bid not in only:
            continue
        im = render(bid, objs)
        if im is None:
            print("sem imagem:", bid)
            continue
        out = os.path.join(OUT, f"{bid}.webp")
        im.save(out, "WEBP", quality=80, method=6)
        print(f"{bid}: {os.path.getsize(out) // 1024} KB")


if __name__ == "__main__":
    main()
