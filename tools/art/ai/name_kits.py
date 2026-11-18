#!/usr/bin/env python3
"""
Recorta todos os kits de bairro e dá nome aos edifícios pela ordem pedida à IA.

    python3 tools/art/ai/name_kits.py [bairro ...]

Para cada bairro de tools/bairros/bairros.json: cut_kit → os N primeiros recortes grandes
(ordem de leitura) são os N edifícios pedidos; casas coladas são separadas. Escreve
kits/<bairro>.json (para build_kit.py) e uma pré-visualização com os nomes para revisão.
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from cut_kit import cut  # noqa: E402

cfg = json.load(open(os.path.join(HERE, "..", "..", "bairros", "bairros.json")))
SCRATCH = os.environ.get("PREVIEW_DIR", os.path.join(HERE, "raw"))
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)


def run(b):
    bid = b["id"]
    raw = os.path.join(HERE, "raw", f"kit_{bid}.png")
    if not os.path.exists(raw):
        return f"{bid}: sem imagem"
    cdir = os.path.join(HERE, "raw", f"kit_{bid}_cut")
    idx = cut(raw, cdir)
    names = [(v, s) for v, s in b["buildings"]] + [("casa", f"Casa {i}") for i in range(1, b["houses"] + 1)]
    n = len(names)
    # edifícios = recortes "maciços": muito preenchidos e com base larga (árvores têm tronco
    # estreito em baixo; candeeiros quase nada). Medido nos kits: casas fill≥0.74 base≥0.89;
    # árvores fill<0.6 base<0.65.
    feats = {}
    for e in idx:
        if e["px"] < 8000:
            continue
        a = np.asarray(Image.open(os.path.join(cdir, f"{e['n']:03d}.png")))[..., 3] > 40
        w, h = e["box"][2], e["box"][3]
        cols = np.where(a[int(h * 0.8):].any(axis=0))[0]
        base = (cols.max() - cols.min() + 1) / w if len(cols) else 0
        feats[e["n"]] = (a, a.sum() / (w * h), base)
    def reading(lst):
        """Ordem de leitura: linhas pelo centro vertical, depois da esquerda para a direita."""
        lst = sorted(lst, key=lambda e: e["box"][1] + e["box"][3] / 2)
        rows, cur = [], []
        med_h = float(np.median([e["box"][3] for e in lst]))
        for e in lst:
            cy = e["box"][1] + e["box"][3] / 2
            if cur and cy - (cur[-1]["box"][1] + cur[-1]["box"][3] / 2) > 0.45 * med_h:
                rows.append(cur)
                cur = []
            cur.append(e)
        rows.append(cur)
        return [e for r in rows for e in sorted(r, key=lambda e: e["box"][0])]

    hmax = max(e["box"][3] for e in idx)
    big = reading([e for e in idx if e["n"] in feats and e["box"][3] >= 0.33 * hmax and e["px"] > 12000])
    housey = lambda e: feats[e["n"]][1] >= 0.62 and feats[e["n"]][2] >= 0.8

    def parts_of(e):
        """Divide um recorte nos vales reais de transparência (objetos encostados)."""
        a = feats[e["n"]][0]
        w, h = e["box"][2], e["box"][3]
        col = a.sum(axis=0).astype(float)
        low = col < 0.12 * col.max()
        cuts, x = [0], 0
        while x < w:
            if low[x]:
                q = x
                while q < w and low[q]:
                    q += 1
                c = (x + q) // 2
                if 0.08 * w < c < 0.92 * w and c - cuts[-1] >= 0.7 * h and w - c >= 0.7 * h:
                    cuts.append(c)
                x = q
            else:
                x += 1
        cuts.append(w)
        return [{"n": e["n"], "w": w, "h": h, "x0": cuts[j], "x1": cuts[j + 1]} for j in range(len(cuts) - 1)]

    def even_split(q):
        """Fila de casas encostadas sem vale: divide pela largura típica de uma casa."""
        w, h = q["x1"] - q["x0"], q["h"]
        k = round(w / (1.35 * h))
        if w < 2.8 * h or k < 2:
            return [q]
        a = feats[q["n"]][0]
        col = a.sum(axis=0).astype(float)
        cuts = [q["x0"]]
        for j in range(1, k):
            c = q["x0"] + int(w * j / k)
            lo, hi = max(cuts[-1] + 20, c - w // (4 * k)), min(q["x1"] - 20, c + w // (4 * k))
            cuts.append(lo + int(np.argmin(col[lo:hi])) if hi > lo else c)
        cuts.append(q["x1"])
        return [dict(q, x0=cuts[j], x1=cuts[j + 1]) for j in range(k)]

    def shoulders(q):
        """Tira de um edifício as partes baixas encostadas ao lado (ex.: casa colada a um prédio):
        fica só a largura que chega à metade de cima; o resto volta para as casas."""
        a = feats[q["n"]][0][:, q["x0"]:q["x1"]]
        h, w = a.shape
        top = np.where(a[: int(h * 0.45)].any(axis=0))[0]
        if not len(top):
            return q, []
        t0, t1 = max(0, top.min() - 8), min(w, top.max() + 9)
        rest = []
        if t0 > 0.25 * w:
            rest.append(dict(q, x0=q["x0"], x1=q["x0"] + t0))
        if w - t1 > 0.25 * w:
            rest.append(dict(q, x0=q["x0"] + t1, x1=q["x1"]))
        if not rest:
            return q, []
        return dict(q, x0=q["x0"] + (t0 if t0 > 0.25 * w else 0), x1=q["x0"] + (t1 if w - t1 > 0.25 * w else w)), rest

    nb = len(b["buildings"])
    # o prédio de apartamentos (último da lista) é o edifício mais alto em proporção;
    # pode ter caído na linha das casas por ser alto
    apt_i = [k for k, (v, _) in enumerate(b["buildings"]) if v == "apartamentos"]
    chosen = big[:nb]
    if apt_i:
        # depois dos 7 edifícios-base: o edifício maciço mais alto (4 andares)
        head = [e for e in big if e not in big[:4] and feats[e["n"]][1] >= 0.6 and feats[e["n"]][2] >= 0.75 and e["box"][3] >= 0.9 * e["box"][2]]
        head = head or [e for e in big[7:] if feats[e["n"]][1] >= 0.6]
        apt = max(head, key=lambda e: e["box"][3])
        others = [e for e in big if e is not apt][: nb - 1]
        chosen = others[: apt_i[0]] + [apt] + others[apt_i[0]:]
    named, extra = [], []
    for e in chosen:
        ps = parts_of(e)
        main = max(ps, key=lambda q: q["x1"] - q["x0"])
        main, low = shoulders(main)
        named.append(main)
        extra += [q for q in ps if q is not main and (q["x1"] - q["x0"]) > 0.5 * q["h"]] + low
    used = {e["n"] for e in chosen}
    pool = extra[:]
    for e in reading([e for e in idx if e["n"] in feats and e["n"] not in used and housey(e)]):
        for q in parts_of(e):
            pool += even_split(q)
    houses = pool[: b["houses"]]
    items = named + houses
    out = []
    for (venue, sign), it in zip(names, items):
        kid = f"{bid}_{'casa' if venue == 'casa' else venue}" + (f"{sign.split()[-1]}" if venue == "casa" else "")
        if any(o["id"] == kid for o in out):
            kid += f"_{len(out)}"
        e = {"n": it["n"], "id": kid, "name": sign, "cat": "building", "venue": venue}
        if it["x1"] - it["x0"] < it["w"]:
            e["xrange"] = [int(it["x0"]), int(it["x1"])]
        out.append(e)
    json.dump({"id": f"kit_{bid}", "cuts": f"raw/kit_{bid}_cut", "scale": 1.6, "items": out}, open(os.path.join(HERE, "kits", f"{bid}.json"), "w"), ensure_ascii=False, indent=1)
    # pré-visualização com nomes
    prev = Image.open(os.path.join(cdir, "preview.png")).convert("RGB")
    d = ImageDraw.Draw(prev)
    for e in out:
        x, y, w, h = next(i["box"] for i in idx if i["n"] == e["n"])
        if "xrange" in e:
            x += e["xrange"][0]
            d.line([(x, y), (x, y + h)], fill=(0, 160, 0), width=6)
        d.text((x + 6, y + h - 46), e["name"][:28], fill=(0, 90, 220), font=font, stroke_width=4, stroke_fill=(255, 255, 255))
    prev.resize((1920, 1080)).save(os.path.join(SCRATCH, f"names_{bid}.png"))
    return f"{bid}: {len(out)}/{n} edifícios nomeados ({len(idx)} recortes)"


if __name__ == "__main__":
    want = set(sys.argv[1:])
    for b in cfg["bairros"]:
        if not want or b["id"] in want:
            print(run(b), flush=True)
