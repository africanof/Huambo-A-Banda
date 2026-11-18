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
objs = manifest["objects"]


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


def build_interior(n, ident, venue, name, out, extra=None):
    x0, y0 = n * INTERIOR_STEP, INTERIOR_Y
    furniture, spots = LAYOUTS[venue]
    items = []
    for fid, fx, fy in furniture:
        fp = objs[fid]["footprint"]
        items.append({"id": fid, "at": [round(x0 + fx, 2), round(y0 + fy, 2)]})
        if not objs[fid].get("floor"):
            out["obstacles"].append([round(x0 + fx, 2), round(y0 + fy, 2), fp[0], fp[1]])
    out["interiors"].append({"id": ident, "venue": venue, "name": name, "rect": [x0, y0, ROOM[0], ROOM[1]],
                             "entry": [x0 + ENTRY[0], y0 + ENTRY[1]], "furniture": items, **(extra or {})})
    for kind, sx, sy, label in spots:
        place = {"id": f"{ident}:{kind}", "name": label, "kind": kind, "at": [x0 + sx, y0 + sy], "radius": 1.6, "interior": ident}
        if extra:
            place.update({k: v for k, v in extra.items() if k in ("job", "shop")})
        if kind != "work":
            place.pop("job", None)
        if kind not in ("food", "sleep"):
            place.pop("shop", None)
        out["places"].append(place)
    out["places"].append({"id": f"{ident}:exit", "name": "Sair", "kind": "exit", "at": [x0 + EXIT[0], y0 + EXIT[1]], "radius": 1.3, "interior": ident})


def front_point(at, fp):
    """Ponto do passeio em frente à porta: na fachada mais comprida (+y se w >= d, senão +x)."""
    if fp[0] >= fp[1]:
        return [round(at[0] + fp[0] / 2, 2), round(at[1] + fp[1] + 1.2, 2)]
    return [round(at[0] + fp[0] + 1.2, 2), round(at[1] + fp[1] / 2, 2)]


for src in sorted(glob.glob(os.path.join(HERE, "*.json"))):
    spec = json.load(open(src))
    out = {k: spec[k] for k in ("id", "name", "size", "tile", "ground", "spawns")}
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
    body = json.dumps(out, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    out["version"] = hashlib.sha256(body.encode()).hexdigest()[:12]
    text = json.dumps(out, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    for d in ("client/assets/bairros", "server/data/bairros"):
        os.makedirs(os.path.join(ROOT, d), exist_ok=True)
        open(os.path.join(ROOT, d, spec["id"] + ".json"), "w").write(text)
    print(f"{spec['id']} v{out['version']}: {len(out['buildings'])} edifícios, {len(out['props'])} adereços, "
          f"{len(out['obstacles'])} obstáculos, {len(out['places'])} lugares, {len(out['interiors'])} interiores")
