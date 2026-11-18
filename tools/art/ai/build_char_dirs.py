#!/usr/bin/env python3
"""
Personagens em 8 direções: a folha kit_personagens (homem/mulher × frente, perfil, costas;
marcha de 8 passos, parado, sentado, a trabalhar, a acenar) junta-se às folhas 3/4 que já existiam.
Cada direção fica numa folha <cid>_<dir>.png com o MESMO tamanho de quadro e os pés no mesmo sítio.
"""
import json, os
import numpy as np
from PIL import Image
import process as P
from build_assets import OUT, RAW, CHAR_H, foot_spread, root_motion_px

ROWS = [("homem", "front"), ("homem", "side"), ("homem", "back"), ("mulher", "front"), ("mulher", "side"), ("mulher", "back")]
man_path = os.path.join(OUT, "manifest.json")
man = json.load(open(man_path))
sheet = P.matte(Image.open(os.path.join(RAW, "kit_personagens.png")))
H = sheet.height // 6
for r, (cid, d) in enumerate(ROWS):
    row = sheet.crop((0, r * H, sheet.width, (r + 1) * H))
    cells = P.split_cells(row)
    frames = [P.trim(P.clean_cell(x))[0] for x in cells]
    walk = frames[:8]
    norm, _ = P.normalize_frames(walk, CHAR_H)
    # as poses extra (sentado, a trabalhar, a acenar) à mesma escala que a marcha
    k = norm[0].height / max(1, walk[0].height)
    extra = [f.resize((max(1, int(f.width * k)), max(1, int(f.height * k))), Image.LANCZOS) for f in frames[8:]]
    idle = min(range(len(norm)), key=lambda i: foot_spread(norm[i]))
    fs = [norm[idle]] + norm + extra
    info = man["characters"][cid]
    fw, fh = info["frame_size"]
    out = Image.new("RGBA", (fw * len(fs), fh), (0, 0, 0, 0))
    for i, f in enumerate(fs):
        if i <= 8:  # marcha normalizada: corta o quadro à volta do centro, pés no mesmo sítio (sem encolher)
            f = f.crop((f.width // 2 - fw // 2, f.height - fh, f.width // 2 - fw // 2 + fw, f.height))
        elif f.width > fw or f.height > fh:
            f = f.copy()
            f.thumbnail((fw, fh))
        out.alpha_composite(f, (i * fw + (fw - f.width) // 2, fh - f.height - (8 if i > 8 else 0)))
    out.save(os.path.join(OUT, f"{cid}_{d}.png"), optimize=True)
    stride = root_motion_px(norm, True) * 0.5 / 64.0 if d == "side" else 0.5
    info["anims"][d] = {"file": f"{cid}_{d}.png", "frames": 9, "idle_frame": 0, "walk_from": 1, "stride_m": round(float(max(stride, 0.35)), 3),
                        "extra": {"sit": 9, "work": [10, 11, 12, 13], "wave": [14, 15, 16]} if len(fs) >= 17 else {}}
    print(cid, d, len(cells), "quadros")
json.dump(man, open(man_path, "w"), ensure_ascii=False, indent=1)
