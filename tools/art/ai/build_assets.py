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
# fonte (gerada A PARTIR DE FOTOS REAIS, specs/bairro_v2.json) → (categoria, alvo, valor, pegada_m, extra)
ASSETS = {
    "v2_correios": ("building", "width", (10 + 8) * PX_PER_M, [10, 8], {"name": "Correios", "out": "correios"}),
    "v2_governo": ("building", "width", (14 + 8) * PX_PER_M, [14, 8], {"name": "Governo Provincial", "out": "governo"}),
    "v2_casa_colonial": ("building", "width", (10 + 8) * PX_PER_M, [10, 8], {"name": "Casa do Jogador", "door": True, "out": "casa_colonial"}),
    "v2_cantina": ("building", "width", (6 + 5) * PX_PER_M, [6, 5], {"name": "Cantina Ekuikui", "out": "cantina"}),
    "v2_padaria": ("building", "width", (7 + 6) * PX_PER_M, [7, 6], {"name": "Padaria Planalto", "out": "padaria"}),
    "v2_predio": ("building", "width", (9 + 7) * PX_PER_M, [9, 7], {"name": "Prédio da Rua Cinco", "out": "predio_60"}),
    "v2_obelisco": ("prop", "height", 640, [3, 3], {"name": "Praça Agostinho Neto", "out": "obelisco"}),
    "v2_eucalipto": ("prop", "height", 560, [1, 1], {"out": "arvore_eucalipto"}),
    "v2_jacaranda": ("prop", "height", 430, [1.5, 1.5], {"out": "jacaranda"}),
    "v2_palmeira": ("prop", "height", 300, [1.5, 1.5], {"out": "palmeira"}),
    "v2_candeeiro": ("prop", "height", 340, [0.4, 0.4], {"light": True, "out": "candeeiro"}),
    "v2_kupapata": ("prop", "width", 170, [1.6, 0.8], {"out": "kupapata"}),
    "v2_zungueira": ("prop", "width", 230, [1.8, 1.2], {"name": "Zungueira", "out": "bancada_zungueira"}),
    # PROVISÓRIO: sem fotografias reais de interiores do Huambo ainda (ver REFERENCIAS.md)
    "movel_sofa": ("furniture", "width", 250, [2, 1], {"price": 45000, "label": "Sofá", "provisorio": True}),
    "movel_poltrona": ("furniture", "width", 130, [1, 1], {"price": 22000, "label": "Poltrona", "provisorio": True}),
    "movel_mesa_centro": ("furniture", "width", 150, [1, 1], {"price": 12000, "label": "Mesa de centro", "provisorio": True}),
    "movel_tv": ("furniture", "width", 180, [2, 1], {"price": 85000, "label": "Televisor", "provisorio": True}),
    "movel_cama": ("furniture", "width", 300, [2, 2], {"price": 95000, "label": "Cama de casal", "provisorio": True}),
    "movel_mesa_jantar": ("furniture", "width", 270, [2, 2], {"price": 60000, "label": "Mesa de jantar", "provisorio": True}),
    "movel_frigorifico": ("furniture", "height", 230, [1, 1], {"price": 150000, "label": "Frigorífico", "provisorio": True}),
    "movel_fogao": ("furniture", "width", 130, [1, 1], {"price": 70000, "label": "Fogão + botija", "provisorio": True}),
    "movel_tapete": ("furniture", "width", 300, [2, 2], {"price": 18000, "label": "Tapete", "floor": True, "provisorio": True}),
    "movel_planta": ("furniture", "height", 150, [1, 1], {"price": 8000, "label": "Planta", "provisorio": True}),
    "movel_candeeiro": ("furniture", "height", 200, [1, 1], {"price": 15000, "label": "Candeeiro", "provisorio": True}),
    "interior_sala": ("room", "width", 1180, [8, 7], {"provisorio": True}),
}
CHARACTERS = {
    "homem": {"ref": "v2_ref_homem", "down": "v2_homem_andar_baixo", "up": "v2_homem_andar_cima", "name": "Kiala"},
    "mulher": {"ref": "v2_ref_mulher", "down": "v2_mulher_andar_baixo", "up": "v2_mulher_andar_cima", "name": "Nzinga"},
}
TEXTURES = ["v2_textura_asfalto", "v2_textura_calcada", "v2_textura_terra", "v2_textura_relva"]
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
        info = {"name": c["name"], "frame_size": None, "anchor": None, "anims": {}}
        sheets = {}
        for d in ("down", "up"):
            cells = P.split_cells(P.matte(Image.open(os.path.join(RAW, c[d] + ".png"))), 8)
            frames = [P.trim(P.clean_cell(x))[0] for x in cells]
            norm, anchor = P.normalize_frames(frames, CHAR_H)
            # pose parada = frame da marcha com os pés mais juntos (mesma escala e estilo da marcha)
            idle = min(range(len(norm)), key=lambda i: foot_spread(norm[i]))
            sheets[d] = [norm[idle]] + norm
        fw = max(f.width for fs in sheets.values() for f in fs)
        fh = max(f.height for fs in sheets.values() for f in fs)
        for d, fs in sheets.items():
            sheet = Image.new("RGBA", (fw * len(fs), fh), (0, 0, 0, 0))
            for i, f in enumerate(fs):
                sheet.alpha_composite(f, (i * fw + (fw - f.width) // 2, fh - f.height))
            sheet.save(os.path.join(OUT, f"{cid}_{d}.png"), optimize=True)
            # passada medida na arte: maior abertura dos pés (px) → metros (altura da figura = 1,75 m).
            # Um ciclo de 8 frames = 2 passos. Usado no jogo para o ritmo da animação seguir o chão.
            # root motion: o corpo avança o que o pé assente recua (arte a 0,5× no jogo;
            # 1 m no mundo = 64 px na horizontal do ecrã nas direções diagonais)
            cycle_px = root_motion_px(fs[1:], d == "down")
            stride_m = cycle_px * 0.5 / 64.0
            info["anims"][d] = {"file": f"{cid}_{d}.png", "frames": len(fs), "idle_frame": 0, "walk_from": 1,
                                "stride_m": round(float(max(stride_m, 0.35)), 3)}
        info["frame_size"] = [fw, fh]
        info["anchor"] = [fw // 2, fh - 8]
        manifest["characters"][cid] = info
        print(f"  personagem {cid}: frame {fw}x{fh}, {[len(v) for v in sheets.values()]} frames")


def foot_spread(im: Image.Image) -> int:
    """Largura ocupada na faixa dos pés (8% inferiores da figura)."""
    a = np.asarray(im)[..., 3] > 80
    ys = np.where(a.any(1))[0]
    top, bottom = ys.min(), ys.max()
    band = a[bottom - max(3, int((bottom - top) * 0.08)): bottom + 1]
    xs = np.where(band.any(0))[0]
    return int(xs.max() - xs.min()) if len(xs) else 0


def feet(im: Image.Image) -> list[tuple[float, int]]:
    """Pés na faixa inferior: lista de (x central, y mais baixo) por grupo de colunas."""
    a = np.asarray(im)[..., 3] > 80
    ys = np.where(a.any(1))[0]
    top, bottom = ys.min(), ys.max()
    band = a[bottom - max(4, int((bottom - top) * 0.07)): bottom + 1]
    cols = np.where(band.any(0))[0]
    groups, start = [], cols[0]
    for c0, c1 in zip(cols, cols[1:]):
        if c1 - c0 > 3:
            groups.append((start, c0)); start = c1
    groups.append((start, cols[-1]))
    out = []
    for g0, g1 in groups:
        sub = band[:, g0:g1 + 1]
        low = np.where(sub.any(1))[0].max()
        out.append(((g0 + g1) / 2, int(low)))
    return out


def root_motion_px(frames: list[Image.Image], facing_down: bool) -> float:
    """Distância horizontal (px da arte) que o corpo avança num ciclo, seguindo o pé assente.
    De frente para a câmara o pé assente é o mais baixo; de costas é o mais alto (mais longe)."""
    total = 0.0
    n = len(frames)
    for i in range(n):
        f0, f1 = feet(frames[i]), feet(frames[(i + 1) % n])
        planted = max(f0, key=lambda f: f[1]) if facing_down else min(f0, key=lambda f: f[1])
        nxt = min(f1, key=lambda f: abs(f[0] - planted[0]))
        dx = planted[0] - nxt[0]  # pé recua → corpo avança para a direita do ecrã
        if 0 < dx < 40:
            total += dx
    return total


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
        src_im = Image.open(path).convert("RGB")
        # usa só o centro (o gerador escurece/ilumina as bordas) e iguala a luz em toda a textura
        w0, h0 = src_im.size
        src_im = src_im.crop((int(w0 * 0.15), int(h0 * 0.15), int(w0 * 0.85), int(h0 * 0.85)))
        tex = np.asarray(src_im.resize((512, 512), Image.LANCZOS)).astype(np.float32)
        from PIL import ImageFilter
        low = np.asarray(Image.fromarray(tex.astype(np.uint8)).filter(ImageFilter.GaussianBlur(60))).astype(np.float32)
        tex = tex - low + low.mean(axis=(0, 1), keepdims=True)  # remove gradientes de iluminação
        if not t.endswith("textura_calcada"):  # padrão em grelha: a fusão criaria linhas duplas
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
        names.append(t.replace("v2_", "").replace("textura_", ""))
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
