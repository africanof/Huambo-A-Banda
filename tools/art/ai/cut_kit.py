#!/usr/bin/env python3
"""
Recorta uma folha "kit de bairro" (muitos objetos isolados em fundo transparente) em sprites.

    python3 tools/art/ai/cut_kit.py raw/kit_bairro_fatima.png out_dir

Componentes ligados no alfa (com uma pequena dilatação para juntar mastros/bandeiras ao edifício);
ignora salpicos; grava cada recorte como <n>.png e um índice JSON com a caixa original
e uma pré-visualização numerada (para dar nome a cada recorte).
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from process import matte  # noqa: E402


def split_wide(comp: np.ndarray, x0: int, min_w: int = 60) -> list[tuple[int, int]]:
    """Divide um componente largo onde quase não há pixeis na coluna (objetos encostados)."""
    h, w = comp.shape
    if w < 1.6 * h and w < 700:
        return [(0, w)]
    col = comp.sum(axis=0)
    thr = max(2, int(0.04 * h))
    cuts, start, k = [], 0, 0
    while k < w:
        if col[k] <= thr and k - start >= min_w:
            e = k
            while e < w and col[e] <= thr:
                e += 1
            cuts.append((start, k))
            start = e
            k = e
        else:
            k += 1
    cuts.append((start, w))
    if len(cuts) == 1 and w > 1.6 * h:
        # objetos encostados sem coluna vazia: corta na coluna mais vazia do meio
        lo, hi = int(w * 0.3), int(w * 0.7)
        m = lo + int(np.argmin(col[lo:hi]))
        cuts = [(0, m), (m, w)]
    return [(a, b) for a, b in cuts if b - a >= 12]


def cut(path: str, out: str, min_area: int = 900, join_px: int = 2):
    im = matte(Image.open(path))
    a = np.asarray(im)[..., 3]
    mask = a > 24
    grown = ndimage.binary_dilation(mask, iterations=join_px)
    labels, n = ndimage.label(grown)
    os.makedirs(out, exist_ok=True)
    items = []
    for i, sl in enumerate(ndimage.find_objects(labels), start=1):
        if sl is None:
            continue
        ys, xs = sl
        comp_all = (labels[sl] == i) & mask[sl]
        if comp_all.sum() < min_area:
            continue
        full = np.asarray(im)[sl]
        for a, b in split_wide(comp_all, xs.start):
            comp = comp_all[:, a:b]
            if comp.sum() < min_area:
                continue
            rows = np.where(comp.any(axis=1))[0]
            r0, r1 = int(rows.min()), int(rows.max()) + 1
            crop = full[r0:r1, a:b].copy()
            crop[..., 3] = np.where(comp[r0:r1], crop[..., 3], 0)
            items.append({"box": [int(xs.start + a), int(ys.start + r0), int(b - a), int(r1 - r0)], "px": int(comp.sum()), "img": crop})
    # ordem de leitura: linhas (por centro y em faixas) e depois x
    items.sort(key=lambda it: (round((it["box"][1] + it["box"][3]) / 180), it["box"][0]))
    index = []
    for k, it in enumerate(items):
        Image.fromarray(it["img"], "RGBA").save(os.path.join(out, f"{k:03d}.png"))
        index.append({"n": k, "box": it["box"], "px": it["px"]})
    json.dump(index, open(os.path.join(out, "index.json"), "w"), indent=0)
    # pré-visualização numerada
    prev = Image.new("RGB", im.size, (235, 235, 235))
    prev.paste(im, mask=im.split()[-1])
    d = ImageDraw.Draw(prev)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 40)
    except OSError:
        font = ImageFont.load_default()
    for it, e in zip(items, index):
        x, y, w, h = it["box"]
        d.rectangle([x, y, x + w, y + h], outline=(220, 0, 0), width=3)
        d.text((x + 4, y + 2), str(e["n"]), fill=(220, 0, 0), font=font, stroke_width=3, stroke_fill=(255, 255, 255))
    prev.save(os.path.join(out, "preview.png"))
    return index


if __name__ == "__main__":
    idx = cut(sys.argv[1], sys.argv[2])
    print(len(idx), "recortes")
