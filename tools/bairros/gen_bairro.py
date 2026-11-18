#!/usr/bin/env python3
"""
Plantas dos bairros do Huambo a partir dos kits gerados por IA (tools/bairros/bairros.json +
tools/art/ai/kits/<bairro>.json). Um ficheiro tools/bairros/<bairro>.json por bairro.

    python3 tools/bairros/gen_bairro.py [bairro ...] && python3 tools/bairros/build_bairros.py

Ruas em grelha (avenida asfaltada + ruas de terra, como no Huambo), cada edifício encostado à rua
do lado da sua porta (fachada mais comprida), adereços nos passeios sem tapar portas.
"""
import glob, json, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
objs = dict(json.load(open(os.path.join(ROOT, "client", "assets", "demo", "manifest.json")))["objects"])
for _k in glob.glob(os.path.join(ROOT, "client", "assets", "kits", "*", "manifest.json")):
    objs.update(json.load(open(_k))["objects"])
CFG = json.load(open(os.path.join(HERE, "bairros.json")))

def make(bairro, kit):
    BID, BNAME = bairro["id"], bairro["name"]
    rnd = random.Random(BID)
    tipo = bairro["tipo"]
    W, H = 150, 130
    # ruas horizontais (y0, y1, piso) e verticais (x0, x1, piso)
    av = "terra_rua" if tipo == "periferia" else "asfalto"  # na periferia as ruas são de terra
    HSTREETS = [(34, 40, av), (80, 85, "terra_rua"), (114, 119, "terra_rua")]
    VSTREETS = [(44, 49, "terra_rua"), (92, 97, av)]
    SIDE = 2.0

    ground = []
    for y0, y1, k in HSTREETS:
        ground.append({"kind": "asfalto" if k == "asfalto" else "terra", "y": [y0, y1]})
    for x0, x1, k in VSTREETS:
        ground.append({"kind": "asfalto" if k == "asfalto" else "terra", "x": [x0, x1]})
    for y0, y1, _ in HSTREETS:
        ground += [{"kind": "calcada", "y": [y0 - SIDE, y0]}, {"kind": "calcada", "y": [y1, y1 + SIDE]}]
    for x0, x1, _ in VSTREETS:
        ground += [{"kind": "calcada", "x": [x0 - SIDE, x0]}, {"kind": "calcada", "x": [x1, x1 + SIDE]}]
    ground.append({"kind": "relva", "x": [56, 88], "y": [44, 62]})  # praça do bairro
    ground.append({"kind": "terra"})

    BUILDINGS = []  # (id, rótulo, venue) a partir do kit nomeado
    for it in kit["items"]:
        v = it["venue"]
        venue = {"venue": v}
        if v in CFG["jobs"]:
            venue["job"] = CFG["jobs"][v]
        if v in CFG["shops"]:
            venue["shop"] = CFG["shops"][v]
        if v == "apartamentos":
            venue["units"] = 4
        if v == "casa":
            venue["units"] = 1
        BUILDINGS.append((it["id"], it["name"] if v == "casa" else None, venue))

    def fp(i):
        return objs[i]["footprint"]


    placed = []  # retângulos ocupados [x, y, w, h]


    def free(r, pad=1.0):
        x, y, w, h = r
        if x < 1 or y < 1 or x + w > W - 1 or y + h > H - 1:
            return False
        for px, py, pw, ph in placed:
            if x < px + pw + pad and px < x + w + pad and y < py + ph + pad and py < y + h + pad:
                return False
        # não invadir ruas nem passeios
        for y0, y1, _ in HSTREETS:
            if y < y1 + SIDE and y0 - SIDE < y + h:
                return False
        for x0, x1, _ in VSTREETS:
            if x < x1 + SIDE and x0 - SIDE < x + w:
                return False
        return True


    buildings = []
    for bid, label, venue in BUILDINGS:
        w, d = fp(bid)
        door_y = w >= d  # porta na fachada mais comprida
        spot = None
        if door_y:  # fachada +y encostada ao passeio de cima de uma rua horizontal
            for y0, _, _ in HSTREETS:
                y = y0 - SIDE - d - 0.6
                x = 2.0
                while x + w < W:
                    if free([x, y, w, d]):
                        spot = [x, y]
                        break
                    x += 1.0
                if spot:
                    break
        else:  # fachada +x encostada ao passeio esquerdo de uma rua vertical
            for x0, _, _ in VSTREETS:
                x = x0 - SIDE - w - 0.6
                y = 2.0
                while y + d < H:
                    if free([x, y, w, d]):
                        spot = [x, y]
                        break
                    y += 1.0
                if spot:
                    break
        if not spot:
            raise SystemExit(f"sem lugar para {bid}")
        spot = [round(spot[0], 1), round(spot[1], 1)]
        placed.append([spot[0], spot[1], w, d])
        b = {"id": bid, "at": spot, "venue": venue}
        if label:
            b["label"] = label
        buildings.append(b)

    # ---------------------------------------------------------------- adereços
    doors = []
    for b in buildings:
        w, d = fp(b["id"])
        doors.append((b["at"][0] + w / 2, b["at"][1] + d + 1.2) if w >= d else (b["at"][0] + w + 1.2, b["at"][1] + d / 2))
    props = []


    def add(pid, x, y, extra=None, clear=2.2):
        pw, pd = fp(pid)
        r = [x - pw / 2, y - pd / 2, pw, pd]
        if any(abs(x - dx) < clear and abs(y - dy) < clear for dx, dy in doors):
            return False
        for px, py, qw, qh in placed:
            if r[0] < px + qw + 0.3 and px < r[0] + r[2] + 0.3 and r[1] < py + qh + 0.3 and py < r[1] + r[3] + 0.3:
                return False
        placed.append(r)
        props.append([pid, [round(x, 1), round(y, 1)]] + ([extra] if extra else []))
        return True


    # candeeiros e árvores nos passeios da avenida e das ruas
    for y0, y1, k in HSTREETS:
        for x in range(6, W - 4, 13):
            add("f_candeeiro" if k == "asfalto" else "f_poste", x, y0 - SIDE + 0.5)
            add(rnd.choice(["f_jacaranda", "f_jacaranda2", "f_eucalipto", "f_palmeira"]), x + 6.5, y1 + SIDE - 0.6)
    for x0, x1, k in VSTREETS:
        for y in range(8, H - 4, 14):
            add("f_candeeiro2" if k == "asfalto" else "f_poste2", x1 + SIDE - 0.5, y)
    # praça do bairro: árvores, bancos, chafariz, bandeira
    for x, y, p in [(60, 47, "f_mulemba"), (84, 47, "f_jacaranda"), (60, 59, "f_jacaranda2"), (84, 59, "f_mangueira"), (72, 53, "f_chafariz"),
                    (66, 50, "f_banco_jardim"), (78, 50, "f_banco_jardim2"), (66, 57, "f_banco_madeira"), (78, 57, "f_banco_jardim"),
                    (72, 46, "f_bandeira"), (58, 53, "f_buganvilia"), (86, 53, "f_buganvilia")]:
        add(p, x, y)
    # paragem de candongueiros na avenida e praça de kupapatas
    if BID == "bairro_fatima":
        add("f_paragem", 50.5, 31.4)  # o abrigo tem escrito "Bairro de Fátima"
    add("f_candongueiro", 56, 37.0, clear=0)
    add("f_candongueiro" if BID != "bairro_fatima" else "f_candongueiro2", 64, 37.0, clear=0)
    for i, x in enumerate([100, 102, 104]):
        add("f_kupapata" if i % 2 == 0 else "f_kupapata2", x, 41.6, {"kind": "work", "job": "kupapata"} if i == 0 else None)
    add("f_carro", 120, 37.5, clear=0)
    add("f_hilux", 30, 83.0, clear=0)
    add("f_carro2", 128, 83.0, clear=0)
    # comércio informal: bancas (zungueira), quiosques de saldo, ATM
    add("f_banca", 22, 42.2, {"kind": "work", "job": "zunga"})
    for p, x in [("f_banca2", 26), ("f_banca3", 30), ("f_banca_roupa", 34)]:
        add(p, x, 42.2)
    add("f_quiosque_unitel", 110, 31.6)
    add("f_quiosque_movicel", 114, 31.6)
    add("f_atm", 118, 31.6)
    # vida do bairro: contentores, galinhas, cabra, bidões, carvão, blocos, placas
    for p, x, y in [("f_contentor", 8, 42.2), ("f_contentor2", 140, 87.2), ("f_galinha", 12, 88.5), ("f_galinha2", 14, 89.4), ("f_cabra", 20, 90.0),
                    ("f_bidao", 46, 88.0), ("f_carvao", 60, 88.0), ("f_blocos", 138, 106), ("f_gerador", 80, 31.6), ("f_bicicleta", 88, 88.0),
                    ] + ([("f_placa_bairro", 2.5, 41.8), ("f_placa_bairro", 147, 41.8)] if BID == "bairro_fatima" else []) + [("f_tanque", 140, 64), ("f_carroca", 70, 88.0),
                    ("f_mesa_plastico", 104, 88.4), ("f_mesa_plastico2", 108, 88.4)]:
        add(p, x, y)
    for i in range(18):  # mais árvores no interior dos quarteirões
        add(rnd.choice(["f_mangueira", "f_abacateiro", "f_palmeira2", "f_eucalipto2", "f_jacaranda"]), rnd.uniform(4, W - 4), rnd.uniform(4, H - 4))

    spec = {
        "id": BID,
        "name": BNAME,
        "size": [W, H],
        "tile": 4,
        "ground": ground,
        "buildings": buildings,
        "props": props,
        "spawns": [{"id": "avenida", "name": "Avenida (paragem)", "at": [46.5, 37.0]}, {"id": "largo", "name": "Praça do Bairro", "at": [72, 64]}],
    }
    json.dump(spec, open(os.path.join(HERE, BID + ".json"), "w"), ensure_ascii=False, indent=1)
    print(BID, len(buildings), "edifícios,", len(props), "adereços")



if __name__ == "__main__":
    import sys
    want = set(sys.argv[1:])
    for b in CFG["bairros"]:
        if want and b["id"] not in want:
            continue
        kit = json.load(open(os.path.join(ROOT, "tools", "art", "ai", "kits", b["id"] + ".json")))
        make(b, kit)
