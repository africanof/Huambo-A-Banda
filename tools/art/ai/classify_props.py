#!/usr/bin/env python3
"""
Classifica os ADEREÇOS de cada kit de bairro (tudo o que não é edifício nomeado) pela forma e cor:
lamp (candeeiro), pole (poste de madeira), tree, vehicle (pneus escuros em baixo), stall (banca), small.
Acrescenta-os a kits/<bairro>.json (cat: prop, kind) para o build_kit e o gerador de plantas.
"""
import colorsys, json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, "..", "..", "bairros", "bairros.json")))


def classify(im):
    arr = np.asarray(im).astype(np.float32)
    a = arr[..., 3] > 40
    h, w = a.shape
    px = int(a.sum())
    if px < 1500 or h < 30:
        return None
    rgb = arr[..., :3] / 255
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, bl = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    brownish = a & (r > g) & (g > bl) & (sat > 0.25) & (mx < 0.75)
    leafy = a & (sat > 0.22) & ~((r > g) & (g > bl) & (mx < 0.75))  # cor viva que não é madeira/terra
    dark = a & (mx < 0.28)
    def width_rows(y0, y1):
        cols = np.where(a[int(h * y0):int(h * y1)].any(axis=0))[0]
        return (cols.max() - cols.min() + 1) / w if len(cols) else 0
    top_leafy = leafy[: int(h * 0.6)].sum() / max(1, a[: int(h * 0.6)].sum())
    base = width_rows(0.88, 1.0)
    mid = width_rows(0.55, 0.8)
    bottom_dark = dark[int(h * 0.75):].sum() / max(1, a[int(h * 0.75):].sum())
    whole_dark = dark.sum() / px
    ar = w / h
    if h > 2.2 * w:
        return "pole" if brownish.sum() / px > 0.3 else "lamp"
    if px > 9000 and h >= 0.75 * w and top_leafy > 0.45 and mid < 0.45 and base < 0.45:
        return "tree"
    if ar > 1.35 and bottom_dark > 0.12 and whole_dark < 0.45 and px > 6000:
        return "vehicle"
    if 0.8 <= ar < 1.9 and px > 14000 and whole_dark < 0.35 and top_leafy > 0.25 and base > 0.5:
        return "stall"
    if px < 45000:
        return "small"
    return None


def feats(im):
    arr = np.asarray(im).astype(np.float32)
    a = arr[..., 3] > 40
    h, w = a.shape
    rgb = arr[..., :3] / 255
    r, g, bl = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(axis=2)
    sat = np.where(mx > 0, (mx - rgb.min(axis=2)) / np.maximum(mx, 1e-6), 0)
    brown = a & (r > g) & (g > bl) & (sat > 0.25) & (mx < 0.75)
    leafy = a & (sat > 0.2) & ~brown
    px = max(1, int(a.sum()))
    top = a[: int(h * 0.6)]
    return {"thin": h > 1.6 * w and w * h > 0 and px / (w * h) < 0.45, "brown": brown.sum() / px, "ar": w / h, "px": int(a.sum()),
            "leafy": leafy[: int(h * 0.6)].sum() / max(1, top.sum()), "fill": px / (w * h),
            "trunk": brown[int(h * 0.75):].sum() / max(1, a[int(h * 0.75):].sum())}


def cost(f, cat):
    """Custo de um objeto pertencer a uma categoria (0 = encaixa bem)."""
    if cat == "tree":
        return 0.0 if (f["leafy"] > 0.35 and f["px"] > 5000 and not (f["thin"] and f["leafy"] < 0.3)) else 1.0
    if cat == "light":
        return 0.0 if f["thin"] else 1.2
    if cat == "vehicle":
        return 0.0 if f["ar"] > 1.05 and f["px"] > 4000 else 1.0
    if cat == "stall":
        return 0.0 if 0.8 < f["ar"] < 2.0 and f["px"] > 8000 else 1.0
    return 0.3


EXPECT = [("tree", 10), ("light", 10), ("vehicle", 9), ("stall", 6)]


def segment(fs):
    """Divide a sequência em [árvores][candeeiros/postes][veículos][bancas][resto] minimizando o custo."""
    n = len(fs)
    pre = {c: [0.0] for c, _ in EXPECT}
    for c, _ in EXPECT:
        for f in fs:
            pre[c].append(pre[c][-1] + cost(f, c))
    small = [0.0]
    for f in fs:
        small.append(small[-1] + cost(f, "small"))
    best = (1e18, None)
    lim = min(n, 60)
    for b1 in range(0, lim):
        c1 = pre["tree"][b1] + 0.4 * abs(b1 - 10)
        for b2 in range(b1, min(n, b1 + 16) + 1):
            c2 = c1 + pre["light"][b2] - pre["light"][b1] + 0.4 * abs(b2 - b1 - 10)
            if c2 >= best[0]:
                continue
            for b3 in range(b2, min(n, b2 + 14) + 1):
                c3 = c2 + pre["vehicle"][b3] - pre["vehicle"][b2] + 0.4 * abs(b3 - b2 - 9)
                if c3 >= best[0]:
                    continue
                for b4 in range(b3, min(n, b3 + 9) + 1):
                    c4 = c3 + pre["stall"][b4] - pre["stall"][b3] + 0.4 * abs(b4 - b3 - 6) + small[n] - small[b4]
                    if c4 < best[0]:
                        best = (c4, (b1, b2, b3, b4))
    b1, b2, b3, b4 = best[1]
    out = []
    for i, f in enumerate(fs):
        if i < b1:
            out.append("tree" if cost(f, "tree") == 0 else "small")
        elif i < b2:
            out.append(("pole" if f["brown"] > 0.3 else "lamp") if f["thin"] else "small")
        elif i < b3:
            out.append("vehicle" if cost(f, "vehicle") == 0 else "small")
        elif i < b4:
            out.append("stall" if cost(f, "stall") == 0 else "small")
        else:
            out.append("small")
    # 2.ª passagem: árvores fora de ordem (copa viva, contorno irregular, não fino)
    for i, f in enumerate(fs):
        if out[i] in ("small", "stall") and f["leafy"] > 0.55 and f["px"] > 6000 and f["fill"] < 0.62 and not f["thin"] and f["ar"] < 1.4 and f["trunk"] > 0.25:
            out[i] = "tree"
    return out


def run(bid):
    kpath = os.path.join(HERE, "kits", bid + ".json")
    kit = json.load(open(kpath))
    cdir = os.path.join(HERE, kit["cuts"])
    idx = json.load(open(os.path.join(cdir, "index.json")))
    used = {it["n"] for it in kit["items"] if it.get("cat") == "building"}
    items = [it for it in kit["items"] if it.get("cat") == "building"]
    seq = [e for e in sorted(idx, key=lambda e: e["n"]) if e["n"] not in used and e["px"] >= 1500]
    fs = [feats(Image.open(os.path.join(cdir, f"{e['n']:03d}.png"))) for e in seq]
    count = {}
    for e, k in zip(seq, segment(fs)):
        count[k] = count.get(k, 0) + 1
        items.append({"n": e["n"], "id": f"{bid}_{k}{count[k]}", "cat": "prop", "kind": k,
                      **({"light": True} if k == "lamp" else {}), **({"fp": [0.4, 0.4]} if k in ("lamp", "pole") else {}),
                      **({"fp": [1.5, 1.5]} if k == "tree" else {})})
    kit["items"] = items
    json.dump(kit, open(kpath, "w"), ensure_ascii=False, indent=1)
    return count


if __name__ == "__main__":
    ids = sys.argv[1:] or [b["id"] for b in cfg["bairros"]]
    for b in ids:
        print(b, run(b), flush=True)
