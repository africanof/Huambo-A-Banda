#!/usr/bin/env python3
"""Texturas quadradas contínuas do chão (ruas desenhadas como polígonos nos bairros com ruas reais)."""
import os
import numpy as np
from PIL import Image, ImageFilter
from build_assets import RAW, OUT, TEXTURES, seamless

for t in TEXTURES:
    im = Image.open(os.path.join(RAW, t + ".png")).convert("RGB")
    w0, h0 = im.size
    im = im.crop((int(w0 * 0.15), int(h0 * 0.15), int(w0 * 0.85), int(h0 * 0.85))).resize((512, 512), Image.LANCZOS)
    tex = np.asarray(im).astype(np.float32)
    low = np.asarray(Image.fromarray(tex.astype(np.uint8)).filter(ImageFilter.GaussianBlur(60))).astype(np.float32)
    tex = tex - low + low.mean(axis=(0, 1), keepdims=True)
    if not t.endswith("textura_calcada"):
        tex = seamless(tex)
    name = t.replace("v2_", "").replace("v3_", "").replace("textura_", "")
    Image.fromarray(tex.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, f"chao_{name}.png"), optimize=True)
    print("chao_" + name)
