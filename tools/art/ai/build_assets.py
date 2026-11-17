#!/usr/bin/env python3
"""
Transforma a arte gerada (tools/art/ai/raw) em recursos prontos para o Godot
(client/assets/demo):

  * objetos/edifícios/móveis: recorte, escala pelo tamanho real, âncora no ponto
    mais à frente (base) → usado na ordenação em profundidade (y-sort);
  * personagens: folhas de marcha normalizadas (mesma escala, pés alinhados) +
    poses paradas, numa folha por personagem e direção;
  * chão: texturas tornadas contínuas (sem costuras) e projetadas em losangos
    isométricos de 512×256 (4 m × 4 m);
  * manifest.json com tamanhos, âncoras, pegadas (colisão) e metadados.

    python3 tools/art/ai/build_assets.py
"""
import json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import process as P  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(ROOT, "client", "assets", "demo")
PX_PER_M = 64  # meia largura do losango de 1 m (tile de 1 m = 128×64 px)

# id: (categoria, alvo, valor, pegada_m [w, d] ou None, extra)
# alvo "width" = largura final em px; "height" = altura final em px
ASSETS = {
    "teste_edificio_correios": ("building", "width", (10 + 8) * PX_PER_M, [10, 8], {"name": "Correios", "out": "correios"}),
    "casa_colonial": ("building", "width", (10 + 8) * PX_PER_M, [10, 8], {"name": "Casa do Jogador", "door": True}),
    "cantina": ("building", "width", (6 + 5) * PX_PER_M, [6, 5], {"name": "Cantina Ekuikui"}),
    "padaria": ("building", "width", (7 + 6) * PX_PER_M, [7, 6], {"name": "Padaria Planalto"}),
    "predio_60": ("building", "width", (9 + 7) * PX_PER_M, [9, 7], {"name": "Prédio da Cidade Baixa"}),
    "arvore_eucalipto": ("prop", "height", 560, [1, 1], {}),
    "arvore_mulemba": ("prop", "height", 420, [2, 2], {}),
    "buganvilia": ("prop", "height", 150, [1, 1], {}),
    "candeeiro": ("prop", "height", 330, [0.4, 0.4], {"light": True}),
    "kupapata": ("prop", "width", 170, [1.6, 0.8], {}),
    "banco_jardim": ("prop", "width", 160, [1.6, 0.6], {}),
    "bancada_zungueira": ("prop", "width", 220, [1.8, 1.2], {"name": "Zungueira"}),
    "movel_sofa": ("furniture", "width", 250, [2, 1], {"price": 45000, "label": "Sofá"}),
    "movel_poltrona": ("furniture", "width", 130, [1, 1], {"price": 22000, "label": "Poltrona"}),
    "movel_mesa_centro": ("furniture", "width", 150, [1, 1], {"price": 12000, "label": "Mesa de centro"}),
    "movel_tv": ("furniture", "width", 180, [2, 1], {"price": 85000, "label": "Televisor"}),
    "movel_cama": ("furniture", "width", 300, [2, 2], {"price": 95000, "label": "Cama de casal"}),
    "movel_mesa_jantar": ("furniture", "width", 270, [2, 2], {"price": 60000, "label": "Mesa de jantar"}),
    "movel_frigorifico": ("furniture", "height", 230, [1, 1], {"price": 150000, "label": "Frigorífico"}),
    "movel_fogao": ("furniture", "width", 130, [1, 1], {"price": 70000, "label": "Fogão + botija"}),
    "movel_tapete": ("furniture", "width", 300, [2, 2], {"price": 18000, "label": "Tapete", "floor": True}),
    "movel_planta": ("furniture", "height", 150, [1, 1], {"price": 8000, "label": "Planta"}),
    "movel_candeeiro": ("furniture", "height", 200, [1, 1], {"price": 15000, "label": "Candeeiro"}),
    "interior_sala": ("room", "width", 1180, [8, 7], {}),
}
CHARACTERS = {
    "homem": {"ref": "ref_homem", "down": "homem_andar_baixo", "up": "homem_andar_cima", "name": "Kiala"},
    "mulher": {"ref": "ref_mulher", "down": "mulher_andar_baixo", "up": "mulher_andar_cima", "name": "Nzinga"},
}
TEXTURES = ["textura_asfalto", "textura_calcada", "textura_terra", "textura_relva"]
CHAR_H = 300  # altura na textura (exibida a 0,5 → 150 px no mundo)


def base_anchor(im: Image.Image) -> tuple[int, int]:
    """Ponto mais à frente da base: média x das colunas na linha opaca mais baixa."""
    a = np.asarray(im)[..., 3] > 100
    ys = np.where(a.any(1))[0]
    bottom = ys.max()
    band = a[max(0, bottom - 6): bottom + 1]
    xs = np.where(band.any(0))[0]
    return int((xs.min() + xs.max()) / 2), int(bottom)


def make_shadow(im: Image.Image, ax: int, ay: int, strength: float = 0.5):
    """Sombra projetada no chão (sol de cima-esquerda → sombra para trás-direita), desfocada."""
    from PIL import ImageFilter
    k_x, k_y = 0.75, 0.3  # deslocamento por píxel de altura
    W = int(im.width + im.height * k_x + 40)
    H = ay + 40
    a = im.getchannel("A")
    # saída (X, Y) ← entrada (x, y):  x = X + (k_x/k_y)(Y - ay) ;  y = ay + (Y - ay)/k_y
    coef = (1, k_x / k_y, -k_x / k_y * ay, 0, 1 / k_y, ay - ay / k_y)
    sh = a.transform((W, H), Image.AFFINE, coef, resample=Image.BILINEAR)
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    sh = sh.point(lambda v: int(v * strength))
    out = Image.new("RGBA", (W, H), (20, 14, 30, 0))
    out.putalpha(sh)
    return out


def build_objects(manifest):
    for src, (cat, mode, val, foot, extra) in ASSETS.items():
        path = os.path.join(RAW, src + ".png")
        if not os.path.exists(path):
            print("  em falta:", src)
            continue
        im, _ = P.trim(P.matte(Image.open(path)))
        s = val / (im.width if mode == "width" else im.height)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        ax, ay = base_anchor(im)
        name = extra.get("out", src)
        im.save(os.path.join(OUT, f"{name}.png"), optimize=True)
        manifest["objects"][name] = {"category": cat, "size": list(im.size), "anchor": [ax, ay], "footprint": foot, **extra}
        if cat in ("building", "prop"):
            make_shadow(im, ax, ay, 0.55 if cat == "building" else 0.45).save(os.path.join(OUT, f"{name}_sombra.png"), optimize=True)
            manifest["objects"][name]["shadow_anchor"] = [ax, ay]
        print(f"  {name}: {im.size}")


def build_characters(manifest):
    for cid, c in CHARACTERS.items():
        if not all(os.path.exists(os.path.join(RAW, c[k] + ".png")) for k in ("ref", "down", "up")):
            print("  personagem incompleta:", cid)
            continue
        ref_cells = P.split_cells(P.matte(Image.open(os.path.join(RAW, c["ref"] + ".png"))), 4)
        # referência: 0 baixo-esq, 1 baixo-dir, 2 cima-esq, 3 cima-dir → usamos as viradas à direita
        idle = {"down": P.trim(ref_cells[1])[0], "up": P.trim(ref_cells[3])[0]} if len(ref_cells) == 4 else {}
        info = {"name": c["name"], "frame_size": None, "anchor": None, "anims": {}}
        sheets = {}
        for d in ("down", "up"):
            cells = P.split_cells(P.matte(Image.open(os.path.join(RAW, c[d] + ".png"))), 8)
            frames = [P.trim(x)[0] for x in cells]
            if d in idle:
                frames = [idle[d]] + frames
            norm, anchor = P.normalize_frames(frames, CHAR_H)
            sheets[d] = norm
        fw = max(f.width for fs in sheets.values() for f in fs)
        fh = max(f.height for fs in sheets.values() for f in fs)
        for d, fs in sheets.items():
            sheet = Image.new("RGBA", (fw * len(fs), fh), (0, 0, 0, 0))
            for i, f in enumerate(fs):
                sheet.alpha_composite(f, (i * fw + (fw - f.width) // 2, fh - f.height))
            sheet.save(os.path.join(OUT, f"{cid}_{d}.png"), optimize=True)
            info["anims"][d] = {"file": f"{cid}_{d}.png", "frames": len(fs), "idle_frame": 0, "walk_from": 1}
        info["frame_size"] = [fw, fh]
        info["anchor"] = [fw // 2, fh - 8]
        manifest["characters"][cid] = info
        print(f"  personagem {cid}: frame {fw}x{fh}, {[len(v) for v in sheets.values()]} frames")


def seamless(arr: np.ndarray) -> np.ndarray:
    """Torna uma textura contínua: mistura com uma cópia deslocada meio período, com máscara radial."""
    h, w = arr.shape[:2]
    shifted = np.roll(arr, (h // 2, w // 2), (0, 1))
    yy, xx = np.mgrid[0:h, 0:w]
    m = np.minimum(np.minimum(xx, w - 1 - xx) / (w / 2), np.minimum(yy, h - 1 - yy) / (h / 2))
    m = np.clip(m * 1.6, 0, 1)[..., None]
    return arr * m + shifted * (1 - m)


def build_tiles(manifest):
    TW, TH = 512, 256  # losango de 4 m × 4 m
    atlas = Image.new("RGBA", (TW * len(TEXTURES), TH), (0, 0, 0, 0))
    names = []
    for i, t in enumerate(TEXTURES):
        path = os.path.join(RAW, t + ".png")
        if not os.path.exists(path):
            print("  textura em falta:", t)
            continue
        tex = np.asarray(Image.open(path).convert("RGB").resize((512, 512), Image.LANCZOS)).astype(np.float32)
        if t != "textura_calcada":  # padrão em grelha: a fusão criaria linhas duplas
            tex = seamless(tex)
        tex = Image.fromarray(tex.clip(0, 255).astype(np.uint8))
        S = tex.width
        # ecrã (X, Y) ← textura (u, v):  X = (u - v)·TW/(2S) + TW/2,  Y = (u + v)·TH/(2S)
        # inversa: u = (X - TW/2)·S/TW + Y·S/TH ; v = -(X - TW/2)·S/TW + Y·S/TH
        a, b, c = S / TW, S / TH, -S / 2
        d, e, f = -S / TW, S / TH, S / 2
        tile = tex.transform((TW, TH), Image.AFFINE, (a, b, c, d, e, f), resample=Image.BICUBIC).convert("RGBA")
        mask = Image.new("L", (TW, TH), 0)
        from PIL import ImageDraw
        e = 2.5  # losango ligeiramente maior: os mosaicos sobrepõem-se e não ficam costuras
        ImageDraw.Draw(mask).polygon([(TW / 2, -e), (TW + 2 * e, TH / 2), (TW / 2, TH + e), (-2 * e, TH / 2)], fill=255)
        tile.putalpha(mask)
        atlas.paste(tile, (i * TW, 0))
        names.append(t.replace("textura_", ""))
    atlas.save(os.path.join(OUT, "chao_tiles.png"), optimize=True)
    manifest["tiles"] = {"file": "chao_tiles.png", "tile_size": [TW, TH], "meters": 4, "names": names}
    print("  mosaicos:", names)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    manifest = {"px_per_m": PX_PER_M, "objects": {}, "characters": {}}
    print("objetos…"); build_objects(manifest)
    print("personagens…"); build_characters(manifest)
    print("chão…"); build_tiles(manifest)
    json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), ensure_ascii=False, indent=1)
    print("manifest escrito")
