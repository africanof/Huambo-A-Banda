#!/usr/bin/env python3
"""
Pós-processamento da arte gerada por IA:
  1. recorte: usa o alfa da imagem quando é limpo (bimodal); senão usa o removedor de fundo (rembg);
  2. limpa halos e "franjas" de cor nas bordas;
  3. folhas de sprites: separa as células pelas colunas vazias, alinha a linha dos pés
     e o centro do corpo, e normaliza a escala entre frames (evita "tremer" na animação).
"""
import io, os, sys
import numpy as np
from PIL import Image

_session = None


def matte(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    a = np.asarray(im)[..., 3].astype(np.float32)
    semi = ((a > 32) & (a < 224)).mean()
    clean = (a <= 32).mean() > 0.15 and semi < 0.08
    if clean:
        alpha = np.clip((a - 40) / (200 - 40), 0, 1)
    else:
        global _session
        from rembg import new_session, remove
        if _session is None:
            _session = new_session("isnet-general-use")
        rgb = Image.fromarray(np.asarray(im)[..., :3])
        cut = remove(rgb, session=_session, post_process_mask=True)
        alpha = np.asarray(cut)[..., 3].astype(np.float32) / 255.0
    arr = np.asarray(im).astype(np.float32)
    arr[..., 3] = alpha * 255
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), "RGBA")


def trim(im: Image.Image, pad: int = 2) -> tuple[Image.Image, tuple[int, int]]:
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 8)
    x0, x1, y0, y1 = max(0, xs.min() - pad), min(im.width, xs.max() + pad + 1), max(0, ys.min() - pad), min(im.height, ys.max() + pad + 1)
    return im.crop((x0, y0, x1, y1)), (x0, y0)


def split_cells(im: Image.Image, expected: int | None = None) -> list[Image.Image]:
    """Separa figuras numa fila pelas colunas sem conteúdo."""
    a = np.asarray(im)[..., 3] > 40
    col = a.sum(0)
    filled = col > 2
    cells, start = [], None
    for x, f in enumerate(filled):
        if f and start is None:
            start = x
        elif not f and start is not None:
            if x - start > 12:
                cells.append((start, x))
            start = None
    if start is not None:
        cells.append((start, len(filled)))
    # junta fragmentos estreitos (ex.: uma mão separada do corpo)
    merged = []
    for c in cells:
        if merged and (c[0] - merged[-1][1] < 6 or (c[1] - c[0]) < 25):
            merged[-1] = (merged[-1][0], c[1])
        else:
            merged.append(c)
    if expected and len(merged) != expected:
        # figuras encostadas: corta no vale de menor conteúdo perto de cada divisão esperada
        xs = np.where(filled)[0]
        x_start, x_end = xs.min(), xs.max() + 1
        step = (x_end - x_start) / expected
        cuts = [x_start]
        for k in range(1, expected):
            c = x_start + k * step
            lo, hi = int(c - step * 0.3), int(c + step * 0.3)
            cuts.append(lo + int(np.argmin(col[lo:hi])))
        cuts.append(x_end)
        print(f"  {len(merged)} células por colunas vazias → corte por vales em {expected}", file=sys.stderr)
        return [im.crop((cuts[i], 0, cuts[i + 1], im.height)) for i in range(expected)]
    return [im.crop((x0, 0, x1, im.height)) for x0, x1 in merged]


def foot_anchor(im: Image.Image) -> tuple[float, float, int]:
    """(centro x do tronco, y dos pés, altura) — âncora estável entre frames."""
    a = np.asarray(im)[..., 3] > 60
    ys, xs = np.where(a)
    top, bottom = ys.min(), ys.max()
    h = bottom - top
    # centro horizontal medido na zona do tronco (30–55% da altura), menos sensível a braços e pernas
    band = a[top + int(h * 0.3): top + int(h * 0.55)]
    bx = np.where(band.any(0))[0]
    cx = (bx.min() + bx.max()) / 2 if len(bx) else xs.mean()
    return cx, bottom, h


def normalize_frames(frames: list[Image.Image], target_h: int) -> tuple[list[Image.Image], tuple[int, int]]:
    """Todos os frames na mesma escala (altura mediana), pés na mesma linha, tronco centrado."""
    anchors = [foot_anchor(f) for f in frames]
    med_h = float(np.median([h for _, _, h in anchors]))
    s = target_h / med_h
    out = []
    W = int(max(f.width for f in frames) * s) + 40
    H = int(target_h * 1.25)
    for f, (cx, by, _) in zip(frames, anchors):
        g = f.resize((max(1, int(f.width * s)), max(1, int(f.height * s))), Image.LANCZOS)
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ox = int(W / 2 - cx * s)
        oy = int(H - 8 - by * s)
        canvas.alpha_composite(g, (ox, oy))
        out.append(canvas)
    return out, (W // 2, H - 8)


if __name__ == "__main__":
    src = sys.argv[1]
    m = matte(Image.open(src))
    m.save(src.replace(".png", "_matte.png"))
    print("ok", m.size)
