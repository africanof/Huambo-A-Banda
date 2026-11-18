#!/usr/bin/env python3
"""
Emparelha os objetos de cada folha original com os das folhas dos outros 3 ângulos (mesmas
posições na folha) e gera kits/<kit>_r<n>.json → build_kit junta-os ao mesmo pacote como "<id>@<n>".

    python3 tools/art/ai/angle_kits.py [kit ...]
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from cut_kit import cut  # noqa: E402

# kit de configuração → folha original (raw) e pasta dos recortes originais
KITS = {}
for f in sorted(os.listdir(os.path.join(HERE, "kits"))):
    if not f.endswith(".json") or "_r" in f[-8:] or f in ("interiores_grupos.json", "interiores_salas.json"):
        continue
    cfg = json.load(open(os.path.join(HERE, "kits", f)))
    if "cuts" not in cfg or "items" not in cfg:
        continue
    sheet = cfg["cuts"].replace("raw/", "").replace("_cut", "")
    KITS[f[:-5]] = (cfg, sheet)


def match(src_idx, dst_idx, W, H):
    """Para cada recorte original, o recorte da outra folha mais parecido em posição e tamanho."""
    out = {}
    for e in src_idx:
        x, y, w, h = e["box"]
        cx, cy = (x + w / 2) / W, (y + h / 2) / H
        best, bd = None, 1e9
        for d in dst_idx:
            X, Y, Ww, Hh = d["box"]
            dx, dy = (X + Ww / 2) / W - cx, (Y + Hh / 2) / H - cy
            ds = abs(np.log(max(1, Ww * Hh) / max(1, w * h)))
            score = (dx * dx + dy * dy) ** 0.5 * 10 + ds * 0.6
            if score < bd:
                best, bd = d, score
        out[e["n"]] = (best, bd)
    return out


def run(name):
    cfg, sheet = KITS[name]
    src_dir = os.path.join(HERE, cfg["cuts"])
    if name == "cidade_baixa":
        return
    src_idx = json.load(open(os.path.join(src_dir, "index.json")))
    W, H = Image.open(os.path.join(HERE, "raw", sheet + ".png")).size
    for r in (1, 2, 3):
        raw = os.path.join(HERE, "raw", f"{sheet}_r{r}.png")
        if not os.path.exists(raw):
            print(name, f"r{r}: sem folha")
            continue
        cdir = os.path.join(HERE, "raw", f"{sheet}_r{r}_cut")
        dst_idx = json.load(open(os.path.join(cdir, "index.json"))) if os.path.exists(os.path.join(cdir, "index.json")) else cut(raw, cdir)
        m = match(src_idx, dst_idx, W, H)
        # um recorte da folha nova escolhido por 2+ objetos = objetos colados: esses vão pela zona
        uses = {}
        for n, (d, sc) in m.items():
            if d is not None:
                uses[d["n"]] = uses.get(d["n"], 0) + 1
        sheet_img = None
        items, bad = [], 0
        for it in cfg["items"]:
            if "n" not in it or it["n"] not in m:
                continue
            d, score = m[it["n"]]
            e = {k: v for k, v in it.items() if k not in ("n", "split")}
            e["id"] = f"{it['id']}@{r}"
            if d is None or score > 1.2 or uses.get(d["n"], 0) > 1:
                # recorta a mesma zona da folha nova e fica com o maior objeto lá dentro
                from scipy import ndimage
                from process import matte
                if sheet_img is None:
                    sheet_img = np.asarray(matte(Image.open(raw)))
                x, y, w, h = next(z["box"] for z in src_idx if z["n"] == it["n"])
                if "xrange" in it:
                    x, w = x + it["xrange"][0], it["xrange"][1] - it["xrange"][0]
                gx, gy = int(w * 0.1), int(h * 0.05)
                x0, y0, x1, y1 = max(0, x - gx), max(0, y - gy), min(W, x + w + gx), min(H, y + h + gy)
                reg = sheet_img[y0:y1, x0:x1].copy()
                alpha = reg[..., 3] > 24
                # parte as ligações finas com o vizinho (erosão), escolhe o objeto do centro, recupera a forma
                core = ndimage.binary_erosion(alpha, iterations=6)
                lab, k = ndimage.label(core)
                if k == 0:
                    bad += 1
                    continue
                sizes = ndimage.sum(np.ones_like(lab), lab, range(1, k + 1))
                big = 1 + int(np.argmax(sizes))
                keep = ndimage.binary_dilation(lab == big, iterations=8) & alpha
                reg[..., 3] = np.where(keep, reg[..., 3], 0)
                fp_ = os.path.join(cdir, f"zona_{it['id']}.png")
                Image.fromarray(reg, "RGBA").save(fp_)
                e.pop("xrange", None)
                e["file"] = os.path.relpath(fp_, HERE)
                if r in (1, 3) and "fp" in it:
                    e["fp"] = [it["fp"][1], it["fp"][0]]
                items.append(e)
                continue
            e["n"] = d["n"]
            # casas coladas: a mesma fração da largura
            if "xrange" in it:
                sw = next(x["box"][2] for x in src_idx if x["n"] == it["n"])
                a0, a1 = it["xrange"]
                e["xrange"] = [int(a0 / sw * d["box"][2]), int(a1 / sw * d["box"][2])]
            if r in (1, 3) and "fp" in it:  # rodado 90°: a pegada troca de lados
                e["fp"] = [it["fp"][1], it["fp"][0]]
            items.append(e)
        out = {"id": cfg["id"], "cuts": os.path.relpath(cdir, HERE), "scale": cfg["scale"], "merge": True, "items": items}
        json.dump(out, open(os.path.join(HERE, "kits", f"{name}_r{r}.json"), "w"), ensure_ascii=False, indent=1)
        print(name, f"r{r}: {len(items)} objetos emparelhados, {bad} sem par", flush=True)


if __name__ == "__main__":
    for n in (sys.argv[1:] or list(KITS)):
        if n in KITS:
            run(n)
