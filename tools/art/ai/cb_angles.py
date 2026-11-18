#!/usr/bin/env python3
"""Cidade Baixa: os 3 outros ângulos dos edifícios e adereços antigos → pacote kit_cidade_baixa (<id>@<r>)."""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage
from process import matte

HERE = os.path.dirname(os.path.abspath(__file__))
pos = json.load(open(os.path.join(HERE, "raw", "kit_cidade_baixa_pos.json")))
for r in (1, 2, 3):
    raw = os.path.join(HERE, "raw", f"kit_cidade_baixa_r{r}.png")
    if not os.path.exists(raw):
        print("sem", raw)
        continue
    sheet = np.asarray(matte(Image.open(raw)))
    H, W = sheet.shape[:2]
    out = os.path.join(HERE, "raw", f"kit_cidade_baixa_r{r}_cut")
    os.makedirs(out, exist_ok=True)
    items = []
    for i, (x, y, w, h, k) in pos.items():
        gx, gy = int(w * 0.1), int(h * 0.05)
        x0, y0, x1, y1 = max(0, x - gx), max(0, y - gy), min(W, x + w + gx), min(H, y + h + gy)
        reg = sheet[y0:y1, x0:x1].copy()
        alpha = reg[..., 3] > 24
        lab, n = ndimage.label(ndimage.binary_erosion(alpha, iterations=4))
        if n == 0:
            continue
        big = 1 + int(np.argmax(ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))))
        reg[..., 3] = np.where(ndimage.binary_dilation(lab == big, iterations=6) & alpha, reg[..., 3], 0)
        f = os.path.join(out, f"{i}.png")
        Image.fromarray(reg, "RGBA").save(f)
        items.append({"file": os.path.relpath(f, HERE), "id": f"{i}@{r}", "cat": "building" if list(pos).index(i) < 12 else "prop",
                      "fp": [1, 1], "scale": round(1.0 / k, 4)})
    json.dump({"id": "kit_cidade_baixa", "cuts": os.path.relpath(out, HERE), "scale": 1.0, "merge": r > 1, "items": items},
              open(os.path.join(HERE, "kits", f"cidade_baixa_r{r}.json"), "w"), ensure_ascii=False, indent=1)
    print("cidade_baixa", r, len(items))
