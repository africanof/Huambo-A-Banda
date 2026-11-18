#!/usr/bin/env python3
"""
Os outros 3 ângulos de cada folha (regra: >100 objetos por imagem): edição da folha original,
mesmos objetos nas mesmas posições, câmara noutro canto. r1 = câmara 90° para a direita,
r2 = por trás, r3 = 90° para a esquerda (igual à rotação Iso.rot do jogo).
Também compõe a folha da Cidade Baixa (edifícios individuais antigos + objetos de viagem).
"""
import json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
ANG = {
    1: "Show every building from its RIGHT-BACK corner: the FRONT facade (the one with the shop sign and the main door) must NOT be visible. "
       "The side wall that was on the RIGHT side in the original image is now drawn on the LEFT side, and on the RIGHT side you now see the BACK wall of the building "
       "(back door, back windows, water tank, yard). Other objects (trees, cars, stalls, people) are seen from that same new side.",
    2: "The camera has moved 180 degrees around every object: each building and object is now seen FROM BEHIND, showing its two BACK facades that were hidden before "
       "(back doors, back windows, water tanks, yards, washing lines; shop signs are not visible from behind).",
    3: "Show every building from its LEFT-FRONT corner: the FRONT facade (with the shop sign and the main door) is now drawn on the RIGHT side, and on the LEFT side "
       "you now see the building's LEFT side wall that was hidden before. Other objects are seen from that same new side.",
}
ROOM = {
    1: "Each EMPTY ROOM is now seen from another corner: the camera moved 90 degrees to the right, so the right back wall is replaced by the wall that was open before; keep the same floor, materials and style.",
    2: "Each EMPTY ROOM is now seen from the opposite corner: draw the two walls that were OPEN (cut away) before as the back walls, with the same floor, materials and style (windows, a door).",
    3: "Each EMPTY ROOM is now seen from another corner: the camera moved 90 degrees to the left, so the left back wall is replaced by the wall that was open before; keep the same floor, materials and style.",
}
COMMON = ("EDIT the attached asset sheet. Keep EXACTLY the same objects, the same number of objects, in the SAME positions and order on the sheet, the same sizes, colours, materials "
          "and the same isometric camera elevation (2:1 dimetric), transparent background, every object separated by transparent space. ONLY change the viewing direction: ")


def compose_cidade_baixa():
    """Folha da Cidade Baixa: os 12 edifícios e adereços antigos + objetos das viagens (>100 objetos)."""
    man = json.load(open(os.path.join(HERE, "..", "..", "..", "client", "assets", "demo", "manifest.json")))
    demo = os.path.join(HERE, "..", "..", "..", "client", "assets", "demo")
    ids = ["correios", "casa_colonial", "cantina", "predio_castanho", "banco", "loja_telecom", "predio_rosa", "governo", "padaria", "predio_60", "escola", "tribunal",
           "jacaranda", "palmeira", "arvore_avenida", "arvore_eucalipto", "candeeiro", "kupapata", "bancada_mercado", "bancada_zungueira", "obelisco"]
    sheet = Image.new("RGBA", (3840, 2160), (0, 0, 0, 0))
    pos, x, y, rowh = {}, 20, 20, 0
    for i in ids:
        im = Image.open(os.path.join(demo, man["objects"][i]["out"] + ".png")).convert("RGBA")
        k = min(1.0, 520 / im.height) if i in ids[:12] else min(1.0, 240 / im.height)
        im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
        if x + im.width > 3820:
            x, y, rowh = 20, y + rowh + 30, 0
        sheet.paste(im, (x, y), im)
        pos[i] = [x, y, im.width, im.height, k]
        x += im.width + 30
        rowh = max(rowh, im.height)
    # objetos das viagens para passar dos 100
    cut = os.path.join(RAW, "kit_viagens_cut")
    x, y, rowh = 20, y + rowh + 40, 0
    for n in range(7, 95):
        p = os.path.join(cut, f"{n:03d}.png")
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert("RGBA")
        im.thumbnail((200, 200))
        if x + im.width > 3820:
            x, y, rowh = 20, y + rowh + 24, 0
        if y + im.height > 2140:
            break
        sheet.paste(im, (x, y), im)
        x += im.width + 24
        rowh = max(rowh, im.height)
    sheet.save(os.path.join(RAW, "kit_cidade_baixa.png"))
    json.dump(pos, open(os.path.join(RAW, "kit_cidade_baixa_pos.json"), "w"))


if __name__ == "__main__":
    compose_cidade_baixa()
    cfg = json.load(open(os.path.join(HERE, "..", "..", "bairros", "bairros.json")))
    sheets = [f"kit_{b['id']}" for b in cfg["bairros"]] + ["kit_bairro_fatima_v2", "kit_cidade_baixa"]
    specs = []
    for s in sheets:
        for r, txt in ANG.items():
            specs.append({"id": f"{s}_r{r}", "kind": "bairro_kit", "context_only": True, "refs": [s], "size": "3840x2160", "quality": "high",
                          "prompt": COMMON + txt})
    for s in ["kit_interiores_1", "kit_interiores_2"]:
        for r in (1, 2, 3):
            specs.append({"id": f"{s}_r{r}", "kind": "bairro_kit", "context_only": True, "refs": [s], "size": "3840x2160", "quality": "high",
                          "prompt": COMMON + ROOM[r] + " The furniture items are seen from the same new direction: " + ANG[r]})
    json.dump(specs, open(os.path.join(HERE, "specs", "kits_angulos.json"), "w"), ensure_ascii=False, indent=1)
    print(len(specs), "pedidos")
