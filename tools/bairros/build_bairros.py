#!/usr/bin/env python3
"""
Planta dos bairros (tools/bairros/*.json) → ficheiro único usado pelo cliente e pelo servidor.

    python3 tools/bairros/build_bairros.py

Resolve as pegadas (footprints) dos edifícios/adereços a partir de client/assets/demo/manifest.json,
calcula os obstáculos de colisão (metros) e os "lugares" interativos (comer, trabalhar, casa…), e
escreve client/assets/bairros/<id>.json e server/data/bairros/<id>.json (idênticos, com versão).
"""
import glob, hashlib, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
manifest = json.load(open(os.path.join(ROOT, "client", "assets", "demo", "manifest.json")))
objs = dict(manifest["objects"])
KIT_VERSIONS = {}
for _k in sorted(glob.glob(os.path.join(ROOT, "client", "assets", "kits", "*", "manifest.json"))):
    _m = json.load(open(_k))
    objs.update(_m["objects"])
    KIT_VERSIONS[_m["kit"]] = _m["version"]


# ---------------------------------------------------------------- interiores
# Cada edifício com nome tem interior (regra do projeto: todos os lugares funcionam).
# Os interiores ficam longe da rua (y = 1000 m), cada um na sua sala de 8×7 m, no
# MESMO mundo multijogador: quem está no mesmo interior vê-se; entrar/sair = teletransporte.
ROOM = (8.0, 7.0)
INTERIOR_Y = 1000.0
INTERIOR_STEP = 50.0
EXIT = (6.6, 6.3)      # porta de saída (canto da frente)
ENTRY = (6.0, 5.4)     # onde se aparece ao entrar

# mobília (id, x, y) em metros dentro da sala e pontos de interação (tipo, x, y, extra)
LAYOUTS = {
    "cantina": ([("movel_fogao", 3.6, 0.2), ("movel_frigorifico", 4.8, 0.2), ("movel_mesa_jantar", 0.6, 2.6), ("movel_mesa_jantar", 0.6, 5.0), ("movel_planta", 7.0, 0.2)],
                [("food", 4.4, 1.9, "Balcão"), ("work", 5.6, 1.9, "Cozinha")]),
    "padaria": ([("movel_frigorifico", 1.0, 0.2), ("movel_mesa_centro", 3.0, 0.4), ("movel_mesa_centro", 4.0, 0.4), ("movel_planta", 7.0, 0.2)],
                [("food", 3.8, 2.0, "Balcão do pão"), ("work", 1.6, 1.8, "Forno")]),
    "hotel": ([("movel_mesa_centro", 1.0, 1.0), ("movel_cama", 5.5, 0.3), ("movel_cama", 5.5, 3.0), ("movel_planta", 0.2, 0.2), ("movel_tapete", 2.6, 3.4)],
              [("work", 1.5, 2.8, "Receção"), ("sleep", 4.6, 2.6, "Quarto")]),
    "banco": ([("movel_mesa_jantar", 3.0, 0.4), ("movel_sofa", 0.3, 4.6), ("movel_planta", 7.0, 0.2), ("movel_planta", 0.2, 0.2)],
              [("bank", 3.9, 3.1, "Balcão do banco"), ("work", 5.6, 1.4, "Caixa")]),
    "loja_telecom": ([("movel_tv", 3.0, 0.2), ("movel_mesa_centro", 3.5, 1.6), ("movel_planta", 7.0, 0.2), ("movel_poltrona", 0.4, 4.6)],
                     [("service", 4.0, 3.0, "Balcão"), ("work", 5.6, 1.4, "Atrás do balcão")]),
    "correios": ([("movel_mesa_jantar", 3.0, 0.4), ("movel_planta", 7.0, 0.2), ("movel_poltrona", 0.4, 4.6), ("movel_poltrona", 1.5, 4.6)],
                 [("service", 3.9, 3.1, "Guiché"), ("work", 5.6, 1.4, "Triagem")]),
    "governo": ([("movel_mesa_jantar", 3.0, 0.4), ("movel_poltrona", 0.4, 4.4), ("movel_poltrona", 1.5, 4.4), ("movel_planta", 7.0, 0.2), ("movel_tapete", 2.8, 3.6)],
                [("service", 3.9, 3.1, "Atendimento"), ("work", 5.6, 1.4, "Secretaria")]),
    "tribunal": ([("movel_mesa_jantar", 3.0, 0.4), ("movel_poltrona", 0.6, 3.2), ("movel_poltrona", 0.6, 4.4), ("movel_planta", 7.0, 0.2)],
                 [("service", 3.9, 3.1, "Cartório"), ("work", 5.6, 1.4, "Secretaria judicial")]),
    "escola": ([("movel_tv", 3.0, 0.2), ("movel_mesa_centro", 1.0, 2.4), ("movel_mesa_centro", 2.6, 2.4), ("movel_mesa_centro", 1.0, 4.2), ("movel_mesa_centro", 2.6, 4.2)],
               [("study", 4.6, 3.4, "Sala de aula"), ("work", 5.2, 1.6, "Quadro")]),
    "casa": ([("movel_cama", 5.6, 0.3), ("movel_sofa", 0.4, 0.3), ("movel_tv", 0.4, 2.4), ("movel_fogao", 3.0, 0.2), ("movel_frigorifico", 4.0, 0.2), ("movel_tapete", 2.0, 3.0)],
             [("home_sleep", 5.0, 2.8, "Cama"), ("home_eat", 3.5, 1.7, "Cozinha")]),
}
LAYOUTS.update({
    "igreja": ([("f_banco_madeira", 1.0, 2.6), ("f_banco_madeira", 3.0, 2.6), ("f_banco_madeira", 1.0, 4.4), ("f_banco_madeira", 3.0, 4.4),
                ("movel_mesa_centro", 3.4, 0.4), ("movel_planta", 0.2, 0.2), ("movel_planta", 7.0, 0.2)],
               [("service", 4.8, 1.8, "Altar"), ("work", 6.2, 1.2, "Sacristia")]),
    "saude": ([("movel_cama", 5.5, 0.3), ("movel_mesa_centro", 1.0, 1.0), ("movel_poltrona", 0.4, 4.6), ("movel_poltrona", 1.5, 4.6), ("movel_planta", 7.0, 3.0)],
              [("service", 2.6, 2.4, "Consultório"), ("work", 4.6, 2.8, "Enfermaria")]),
    "mercado": ([("f_banca", 1.0, 1.0), ("f_banca2", 3.8, 1.0), ("f_banca3", 1.0, 4.0)],
                [("food", 3.2, 3.6, "Bancas"), ("work", 5.8, 2.2, "Banca")]),
    "esquadra": ([("movel_mesa_jantar", 3.0, 0.4), ("movel_poltrona", 0.4, 4.4), ("movel_poltrona", 1.5, 4.4), ("movel_planta", 7.0, 0.2)],
                 [("service", 3.9, 3.1, "Atendimento"), ("work", 5.6, 1.4, "Gabinete")]),
    "farmacia": ([("movel_frigorifico", 0.6, 0.2), ("movel_frigorifico", 1.8, 0.2), ("movel_mesa_centro", 3.2, 1.4), ("movel_planta", 7.0, 0.2)],
                 [("service", 3.6, 3.0, "Balcão"), ("work", 5.6, 1.4, "Atrás do balcão")]),
    "churrasqueira": ([("movel_fogao", 4.0, 0.2), ("f_mesa_plastico", 0.8, 2.4), ("f_mesa_plastico2", 2.4, 2.4), ("movel_frigorifico", 5.2, 0.2)],
                      [("food", 4.4, 2.0, "Balcão"), ("work", 6.4, 1.6, "Grelha")]),
    "discoteca": ([("movel_tapete", 2.2, 2.4), ("movel_tv", 5.0, 0.2), ("f_mesa_plastico2", 0.4, 0.4), ("movel_sofa", 0.4, 4.8)],
                  [("service", 3.2, 3.4, "Pista de dança"), ("work", 5.8, 1.8, "Bar")]),
})
LAYOUTS["administracao"] = LAYOUTS["governo"]
LAYOUTS["apartamentos"] = LAYOUTS["casa"]
VENUE_NAMES = {"casa": "Casa", "apartamentos": "Apartamento"}


SALAS = {}
_salas = os.path.join(ROOT, "tools", "art", "ai", "kits", "interiores_salas.json")
if os.path.exists(_salas):
    SALAS = json.load(open(_salas))
RS = 7.5  # sala dos kits de interiores (quadrada)


def auto_layout(venue, kinds):
    """Disposição automática com a mobília do kit de interiores deste tipo de lugar.
    Devolve (mobília [(id, x, y)], pontos {kind: (x, y)}) em metros dentro da sala, ou None."""
    import collections
    fv = {"administracao": "governo", "apartamentos": "casa"}.get(venue, venue)
    items = [(k, o) for k, o in objs.items() if o.get("venue") == fv and o.get("category") == "furniture"]
    if not items:
        return None
    mains = [(k, o) for k, o in items if str(o.get("role", "")).startswith("main")]
    rest = [(k, o) for k, o in items if not str(o.get("role", "")).startswith("main")]
    rest.sort(key=lambda t: -t[1]["footprint"][0] * t[1]["footprint"][1])
    G = 0.25
    door = (6.2, 0.9)  # porta na parede da direita (como nas imagens das salas)
    keep = [(4.9, 0.0, 7.5, 2.7), (5.8, 5.8, 7.5, 7.5)]  # entrada e canto da frente livres
    placed = []  # (x, y, w, d, floor)

    def clear_of(x, y, w, d, pad):
        if x < 0.15 or y < 0.15 or x + w > RS - 0.15 or y + d > RS - 0.15:
            return False
        for kx0, ky0, kx1, ky1 in keep:
            if x < kx1 and kx0 < x + w and y < ky1 and ky0 < y + d:
                return False
        for px, py, pw, pd, fl in placed:
            if x < px + pw + pad and px < x + w + pad and y < py + pd + pad and py < y + d + pad:
                return False
        return True

    def walk_ok(x, y, r=0.42):
        if x < r or y < r or x > RS - r or y > RS - r:
            return False
        for px, py, pw, pd, fl in placed:
            if not fl and px - r < x < px + pw + r and py - r < y < py + pd + r:
                return False
        return True

    def reach(targets):
        start = (round(door[0] / G), round((door[1] + 0.8) / G))
        seen, q = {start}, collections.deque([start])
        while q:
            c = q.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n2 = (c[0] + dx, c[1] + dy)
                if n2 in seen or not walk_ok(n2[0] * G, n2[1] * G):
                    continue
                seen.add(n2)
                q.append(n2)
        return all((round(tx / G), round(ty / G)) in seen for tx, ty in targets)

    spots, furn = {}, []
    centres = [(2.6, 3.0), (3.0, 4.6), (1.6, 4.8), (4.2, 3.6)]
    for i, (k, o) in enumerate(mains):
        w, d = o["footprint"]
        cx, cy = centres[i % len(centres)]
        best = None
        for gx in range(1, int(RS / G)):
            for gy in range(1, int(RS / G)):
                x, y = gx * G, gy * G
                if not clear_of(x, y, w, d, 0.5):
                    continue
                # ponto de interação: à frente (+x se a peça é comprida em y, senão +y)
                sp = (round(x + w + 0.6, 2), round(y + d / 2, 2)) if d >= w else (round(x + w / 2, 2), round(y + d + 0.6, 2))
                if not walk_ok(*sp):
                    continue
                score = abs(x + w / 2 - cx) + abs(y + d / 2 - cy)
                if best is None or score < best[0]:
                    best = (score, x, y, sp)
        if not best:
            continue
        _, x, y, sp = best
        placed.append((x, y, w, d, bool(o.get("floor"))))
        if not reach(list(spots.values()) + [sp]):
            placed.pop()
            continue
        furn.append((k, x, y))
        role = o["role"].split("_", 1)[1] if "_" in o["role"] else ""
        spots.setdefault(role, sp)
    for k, o in rest:  # encostado às paredes do fundo (x pequeno ou y pequeno)
        w, d = o["footprint"]
        best = None
        for gx in range(0, int(RS / G)):
            for gy in range(0, int(RS / G)):
                x, y = 0.2 + gx * G, 0.2 + gy * G
                if not clear_of(x, y, w, d, 0.15):
                    continue
                score = min(x, y) * 3 + (x + y) * 0.2
                if best is None or score < best[0]:
                    best = (score, x, y)
        if not best:
            continue
        _, x, y = best
        placed.append((x, y, w, d, bool(o.get("floor"))))
        if not reach(list(spots.values())):
            placed.pop()
            continue
        furn.append((k, x, y))
    # pontos sem peça principal: ao lado de um ponto existente (ex.: "work" atrás/junto ao balcão)
    for kind in kinds:
        if kind in spots:
            continue
        for base in list(spots.values()) + [(3.5, 4.5)]:
            for ox, oy in ((0, 1.4), (1.4, 0), (0, -1.4), (-1.4, 0), (1.4, 1.4)):
                c = (round(base[0] + ox, 2), round(base[1] + oy, 2))
                if walk_ok(*c) and all(abs(c[0] - a) + abs(c[1] - b) > 1.2 for a, b in spots.values()) and reach([c]):
                    spots[kind] = c
                    break
            if kind in spots:
                break
    return furn, spots


def build_interior(n, ident, venue, name, out, extra=None):
    x0, y0 = n * INTERIOR_STEP, INTERIOR_Y
    furniture, spots = LAYOUTS[venue]
    kinds = [k for k, *_ in spots]
    auto = auto_layout(venue, kinds) if SALAS.get(venue) in objs else None
    if auto and all(k in auto[1] for k in kinds):
        labels = {k: lab for k, _, _, lab in spots}
        furniture = [(k, x, y) for k, x, y in auto[0]]
        spots = [(k, auto[1][k][0], auto[1][k][1], labels[k]) for k in kinds]
        room, size, entry, exit_ = SALAS[venue], (RS, RS), (6.2, 1.9), (6.2, 0.9)
    else:
        room, size, entry, exit_ = "interior_sala", ROOM, ENTRY, EXIT
    items = []
    for fid, fx, fy in furniture:
        fp = objs[fid]["footprint"]
        items.append({"id": fid, "at": [round(x0 + fx, 2), round(y0 + fy, 2)]})
        if not objs[fid].get("floor"):
            out["obstacles"].append([round(x0 + fx, 2), round(y0 + fy, 2), fp[0], fp[1]])
    out["interiors"].append({"id": ident, "venue": venue, "name": name, "rect": [x0, y0, size[0], size[1]], "room": room,
                             "entry": [x0 + entry[0], y0 + entry[1]], "furniture": items, **(extra or {})})
    for kind, sx, sy, label in spots:
        place = {"id": f"{ident}:{kind}", "name": label, "kind": kind, "at": [x0 + sx, y0 + sy], "radius": 1.6, "interior": ident}
        if extra:
            place.update({k: v for k, v in extra.items() if k in ("job", "shop")})
        if kind != "work":
            place.pop("job", None)
        if kind not in ("food", "sleep"):
            place.pop("shop", None)
        out["places"].append(place)
    out["places"].append({"id": f"{ident}:exit", "name": "Sair", "kind": "exit", "at": [x0 + exit_[0], y0 + exit_[1]], "radius": 1.3, "interior": ident})


def front_point(at, fp):
    """Ponto do passeio em frente à porta: na fachada mais comprida (+y se w >= d, senão +x)."""
    if fp[0] >= fp[1]:
        return [round(at[0] + fp[0] / 2, 2), round(at[1] + fp[1] + 1.2, 2)]
    return [round(at[0] + fp[0] + 1.2, 2), round(at[1] + fp[1] / 2, 2)]


for src in sorted(glob.glob(os.path.join(HERE, "*.json"))):
    spec = json.load(open(src))
    if "buildings" not in spec:  # bairros.json (configuração dos kits), não é uma planta
        continue
    out = {k: spec[k] for k in ("id", "name", "size", "tile", "ground", "spawns")}
    for k in ("osm", "roads", "areas", "geo", "portals"):
        if k in spec:
            out[k] = spec[k]
    out["buildings"], out["props"], out["obstacles"], out["places"], out["interiors"] = [], [], [], [], []
    n_interior = 0
    for b in spec["buildings"]:
        o = objs[b["id"]]
        fp = o["footprint"]
        name = b.get("label", o.get("name", ""))
        out["buildings"].append({"id": b["id"], "at": b["at"], "fp": fp, "label": name})
        out["obstacles"].append([b["at"][0], b["at"][1], fp[0], fp[1]])
        v = dict(b["venue"])
        venue = v.pop("venue")
        door_at = v.pop("door", None) or front_point(b["at"], fp)
        door_id = f"{b['id']}@{b['at'][0]},{b['at'][1]}"
        units = v.pop("units", 0)
        ids = []
        if units:  # habitação: cada fração é um interior privado
            for u in range(units):
                ident = f"{b['id']}_{u + 1}"
                label = f"{VENUE_NAMES[venue]} {u + 1}" if units > 1 else name
                build_interior(n_interior, ident, venue, label, out, {"building": door_id, "unit": u + 1})
                ids.append(ident)
                n_interior += 1
        else:
            ident = b["id"]
            build_interior(n_interior, ident, venue, name, out, {"building": door_id, **v})
            ids.append(ident)
            n_interior += 1
        out["places"].append({"id": door_id, "name": name, "kind": "door", "venue": venue, "at": door_at, "radius": 2.6, "interiors": ids})
    for entry in spec["props"]:
        pid, at = entry[0], entry[1]
        o = objs[pid]
        fp = o["footprint"]
        out["props"].append({"id": pid, "at": at})
        out["obstacles"].append([round(at[0] - fp[0] / 2, 2), round(at[1] - fp[1] / 2, 2), fp[0], fp[1]])
        if len(entry) > 2:
            name = o.get("name", pid)
            out["places"].append({"id": f"{pid}@{at[0]},{at[1]}", "name": name, "at": [at[0], round(at[1] + fp[1] / 2 + 0.8, 2)], "radius": 2.2, **entry[2]})
    # saídas a pé para os bairros vizinhos reais
    for pt in spec.get("portals", []):
        out["places"].append({"id": f"portal:{pt['to']}", "name": f"A pé para {pt['name']}", "kind": "portal", "to": pt["to"],
                              "at": pt["at"], "radius": 3.0})
    # kits de arte (pacotes descarregados sob pedido) usados por este bairro
    used = {objs[b["id"]].get("kit") for b in out["buildings"]} | {objs[p["id"]].get("kit") for p in out["props"]}
    used |= {objs[f["id"]].get("kit") for i in out["interiors"] for f in i["furniture"]}
    used |= {objs[i["room"]].get("kit") for i in out["interiors"] if i["room"] in objs}
    out["kits"] = sorted(k for k in used if k)
    out["kit_versions"] = {k: KIT_VERSIONS[k] for k in out["kits"]}
    body = json.dumps(out, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    out["version"] = hashlib.sha256(body.encode()).hexdigest()[:12]
    text = json.dumps(out, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    for d in ("client/assets/bairros", "server/data/bairros"):
        os.makedirs(os.path.join(ROOT, d), exist_ok=True)
        open(os.path.join(ROOT, d, spec["id"] + ".json"), "w").write(text)
    print(f"{spec['id']} v{out['version']}: {len(out['buildings'])} edifícios, {len(out['props'])} adereços, "
          f"{len(out['obstacles'])} obstáculos, {len(out['places'])} lugares, {len(out['interiors'])} interiores")
