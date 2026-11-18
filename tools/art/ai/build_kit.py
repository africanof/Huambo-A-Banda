#!/usr/bin/env python3
"""
Monta os recortes de um "kit de bairro" (cut_kit.py) como recursos do jogo.

    python3 tools/art/ai/build_kit.py kits/bairro_fatima.json

Cada recorte nomeado vai para client/assets/demo/<id>.png no tamanho ORIGINAL; o manifesto
guarda "scale" (o motor amplia ao desenhar: 6× menos memória de textura no telemóvel do que
gravar ampliado). Pegada no chão (metros) calculada pela forma isométrica do edifício:
canto da frente = ponto mais baixo; largura à esquerda = w, à direita = d (64 px por metro).
"""
import json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(ROOT, "client", "assets", "demo")
PX_PER_M = 64


def front_anchor(a: np.ndarray):
    """Canto da frente da base = ponto mais baixo do contorno de baixo, depois de alisado
    (filtro de mediana largo), para que vasos, mastros e plantas não contem."""
    from scipy.ndimage import median_filter
    ys, xs = np.where(a > 40)
    x0, x1 = int(xs.min()), int(xs.max())
    h, w = a.shape
    bottom = np.zeros(w)
    for x in range(x0, x1 + 1):
        col = np.where(a[:, x] > 40)[0]
        bottom[x] = col.max() if len(col) else 0
    k = max(15, (x1 - x0) // 12) | 1
    smooth = median_filter(bottom, size=k)
    lo, hi = x0 + (x1 - x0) // 12, x1 - (x1 - x0) // 12
    xf = lo + int(np.argmax(smooth[lo:hi + 1]))
    return int(xf), int(smooth[xf]), x0, x1


def main(cfg_path):
    cfg = json.load(open(cfg_path))
    cut_dir = os.path.join(HERE, cfg["cuts"])
    scale = float(cfg["scale"])
    man_path = os.path.join(OUT, "manifest.json")
    man = json.load(open(man_path))
    for e in cfg["items"]:
        if "file" in e:  # recorte substituído (ex.: letreiro corrigido)
            im = Image.open(os.path.join(HERE, e["file"])).convert("RGBA")
            if "crop" in e:  # várias peças na mesma imagem de correção: posição gravada ao compor
                pos = json.load(open(os.path.join(HERE, "raw", "fix_signs_pos.json")))["pos"][e["crop"]]
                x, y, w, h = pos
                im = im.crop((max(0, x - 20), max(0, y - 20), x + w + 20, y + h + 20))
                arr = np.asarray(im).copy()
                arr[..., 3] = np.where(arr[..., 3] > 40, arr[..., 3], 0)
                im = Image.fromarray(arr, "RGBA")
            a = np.asarray(im)[..., 3]
            ys, xs = np.where(a > 24)
            im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        else:
            im = Image.open(os.path.join(cut_dir, f"{e['n']:03d}.png")).convert("RGBA")
        if "split" in e:  # dois objetos colados: [parte, de]
            part, of = e["split"]
            arr = np.asarray(im)[..., 3]
            w = im.width
            lo, hi = int(w * 0.3), int(w * 0.7)
            m = lo + int(np.argmin((arr > 40).sum(axis=0)[lo:hi]))
            im = im.crop((0, 0, m, im.height)) if part == 0 else im.crop((m, 0, w, im.height))
            a = np.asarray(im)[..., 3]
            ys, xs = np.where(a > 24)
            im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        a = np.asarray(im)[..., 3]
        fx, fy, x0, x1 = front_anchor(a)
        if e.get("fp"):
            fp = e["fp"]
            anchor = [fx, fy] if e.get("cat") == "building" else [int((x0 + x1) / 2), fy]
        else:
            w_m = round(max(1.0, (fx - x0) * scale / PX_PER_M), 1)
            d_m = round(max(1.0, (x1 - fx) * scale / PX_PER_M), 1)
            if e.get("cat") != "building":
                # adereços: a silhueta é maior do que a base (rodas, toldos, ramos)
                w_m, d_m = (round(min(3.0, max(0.6, v * 0.55)), 1) for v in (w_m, d_m))
            fp = [w_m, d_m]
            anchor = [fx, fy]
        im.save(os.path.join(OUT, e["id"] + ".png"), optimize=True)
        entry = {"category": e.get("cat", "prop"), "size": [im.width, im.height], "anchor": anchor, "footprint": fp,
                 "scale": scale, "out": e["id"], "kit": cfg["id"]}
        for k in ("name", "light", "floor"):
            if k in e:
                entry[k] = e[k]
        man["objects"][e["id"]] = entry
        print(f"{e['id']:<24} {im.width}x{im.height}  pegada {fp}")
    json.dump(man, open(man_path, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
