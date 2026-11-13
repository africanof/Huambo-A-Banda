#!/usr/bin/env python3
"""
Gerador do mapa de jogo a partir de dados REAIS do OpenStreetMap (Huambo, Angola).

    python3 tools/mapgen/mapgen.py            # usa tools/mapgen/osm/*.osm (já descarregados)
    python3 tools/mapgen/mapgen.py --fetch    # volta a descarregar da API do OSM

Saídas:
    client/assets/maps/huambo_centro.json   (geometria para desenhar + colisão)
    server/data/maps/huambo_centro.json     (cópia idêntica: o servidor usa a colisão e os spawns)
    docs/img/huambo_centro_preview.png      (pré-visualização para revisão humana)

Dados © OpenStreetMap contributors, licença ODbL 1.0 — a atribuição aparece no jogo.
Só usa a biblioteca padrão do Python (+ Pillow, opcional, para a pré-visualização).
"""
from __future__ import annotations

import base64
import glob
import hashlib
import json
import math
import os
import random
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OSM_DIR = os.path.join(os.path.dirname(__file__), "osm")

MAP_ID = "huambo_centro"
MAP_NAME = "Huambo — Centro"
# Caixa: Cidade Alta (Palácio, Praça 11 de Novembro) até à Cidade Baixa (Estação do CFB),
# Bairro Académico, Bairro de Fátima e São Pedro.
BBOX = (15.728, -12.784, 15.754, -12.760)  # lon0, lat0, lon1, lat1
SCALE = 5.0           # píxeis por metro
LEVEL_PX = 3.0 * SCALE * 0.5  # altura visual de um piso (projeção oblíqua)
CELL = 8              # célula da grelha de colisão (px)
BORDER = 24           # margem bloqueada à volta do mapa (px)

# ------------------------------------------------------------------ marcos (nomes reais do OSM)
# kind -> estilo no cliente; levels -> altura; os nomes vêm do OSM.
LANDMARKS = {
    "Sé Catedral de Nossa Senhora da Conceição": ("cathedral", 5),
    "Palacio do Governador": ("palace", 3),
    "Governo Provincial do Huambo": ("government", 5),
    "Estação CFB Huambo": ("station", 2),
    "São Pedro": ("station", 1),
    "Mercado Municipal Owilu": ("market", 1),
    "Mercado do Himalaia": ("market", 1),
    "Tribunal do Huambo": ("civic", 3),
    "Museu Municipal": ("civic", 2),
    "Biblioteca provincial do Huambo": ("civic", 2),
    "Centro Cultural do Huambo": ("civic", 2),
    "Cinema do Petro": ("cinema", 2),
    "Igreja da Nossa Senhora de Fátima": ("church", 3),
    "Igreja Adeventista": ("church", 2),
    "Hotel Almirante": ("hotel", 5),
    "iK Hotel": ("hotel", 4),
    "Hotel Nino": ("hotel", 3),
    "Pavilhão Multiuso Serra Van-Dúnem": ("civic", 3),
}
# Correios: o nó do OSM fica dentro de um edifício sem nome; marcamos esse edifício.
POI_BUILDINGS = {"Correios de Angola": ("post", 3), "Hospital Geral do Huambo": ("hospital", 3)}

BAIRROS = [
    # id, nome, lat, lon (pontos de referência reais)
    ("cidade_alta", "Cidade Alta", -12.7752, 15.7355),        # Praça 11 de Novembro / Palácio
    ("cidade_baixa", "Cidade Baixa", -12.7650, 15.7450),       # Estação do CFB
    ("academico", "Bairro Académico", -12.7713, 15.7487),
    ("fatima", "Bairro de Fátima", -12.7790, 15.7420),         # Mercado do Himalaia
    ("sao_pedro", "São Pedro", -12.7690, 15.7300),             # Estação de São Pedro
]

ROAD_WIDTH_M = {
    "primary": 16, "primary_link": 9, "secondary": 13, "secondary_link": 8,
    "tertiary": 11, "tertiary_link": 7, "residential": 8, "unclassified": 7,
    "living_street": 6, "service": 5, "pedestrian": 8, "track": 4,
    "footway": 2.5, "path": 2, "steps": 3, "cycleway": 2.5,
}
ROAD_ORDER = ["path", "footway", "steps", "cycleway", "track", "service", "living_street", "unclassified",
              "residential", "pedestrian", "tertiary_link", "tertiary", "secondary_link", "secondary",
              "primary_link", "primary"]

AREA_KINDS = [
    # (tag, valor, kind)
    ("leisure", "park", "park"), ("leisure", "garden", "park"), ("landuse", "grass", "grass"),
    ("landuse", "meadow", "grass"), ("landuse", "village_green", "grass"), ("leisure", "pitch", "pitch"),
    ("leisure", "stadium", "stadium"), ("landuse", "cemetery", "cemetery"), ("landuse", "forest", "wood"),
    ("natural", "wood", "wood"), ("natural", "scrub", "scrub"), ("natural", "water", "water"),
    ("natural", "wetland", "wetland"), ("amenity", "parking", "parking"), ("landuse", "railway", "railyard"),
    ("amenity", "marketplace", "plaza"), ("highway", "pedestrian", "plaza"), ("landuse", "farmland", "farmland"),
    ("amenity", "school", "campus"), ("amenity", "college", "campus"), ("amenity", "university", "campus"),
    ("amenity", "hospital", "campus"), ("landuse", "military", "campus"), ("landuse", "construction", "scrub"),
]
BLOCKING_AREAS = {"water"}  # zonas húmidas (vale das Cacilhas) são caminháveis

random.seed(1912)  # ano da fundação do Huambo: geração determinística


# ------------------------------------------------------------------ utilitários
def fetch() -> None:
    os.makedirs(OSM_DIR, exist_ok=True)
    lon0, lat0, lon1, lat1 = BBOX
    n = 4
    dx, dy = (lon1 - lon0) / n, (lat1 - lat0) / n
    for i in range(n):
        for j in range(n):
            b = f"{lon0+i*dx:.5f},{lat0+j*dy:.5f},{lon0+(i+1)*dx:.5f},{lat0+(j+1)*dy:.5f}"
            out = os.path.join(OSM_DIR, f"tile_{i}_{j}.osm")
            subprocess.run(["curl", "-sf", "-o", out, "--max-time", "120", "-A", "huambo-a-banda-mapgen/0.1",
                            f"https://api.openstreetmap.org/api/0.6/map?bbox={b}"], check=True)
            print("descarregado", out)
            time.sleep(1.5)


class OSM:
    def __init__(self) -> None:
        self.nodes: dict[str, tuple[float, float, dict]] = {}
        self.ways: dict[str, tuple[list[str], dict]] = {}
        self.rels: dict[str, tuple[list[tuple[str, str, str]], dict]] = {}
        files = sorted(glob.glob(os.path.join(OSM_DIR, "tile_*.osm")))
        if not files:
            sys.exit("Sem dados OSM. Corre com --fetch.")
        for f in files:
            root = ET.parse(f).getroot()
            for n in root.iter("node"):
                self.nodes[n.get("id")] = (float(n.get("lat")), float(n.get("lon")), tags(n))
            for w in root.iter("way"):
                self.ways[w.get("id")] = ([nd.get("ref") for nd in w.findall("nd")], tags(w))
            for r in root.iter("relation"):
                mem = [(m.get("type"), m.get("ref"), m.get("role")) for m in r.findall("member")]
                self.rels[r.get("id")] = (mem, tags(r))


def tags(e) -> dict:
    return {t.get("k"): t.get("v") for t in e.findall("tag")}


LON0, LAT0, LON1, LAT1 = BBOX
LATC = (LAT0 + LAT1) / 2
MX = math.cos(math.radians(LATC)) * 111320.0
MY = 110574.0
WIDTH = int(round((LON1 - LON0) * MX * SCALE))
HEIGHT = int(round((LAT1 - LAT0) * MY * SCALE))


def project(lat: float, lon: float) -> tuple[float, float]:
    return ((lon - LON0) * MX * SCALE, (LAT1 - lat) * MY * SCALE)


def way_points(osm: OSM, refs: list[str]) -> list[tuple[float, float]]:
    pts = []
    for r in refs:
        n = osm.nodes.get(r)
        if n:
            pts.append(project(n[0], n[1]))
    return pts


def simplify(pts: list[tuple[float, float]], eps: float) -> list[tuple[float, float]]:
    """Douglas–Peucker."""
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    dmax, idx = 0.0, 0
    ax, ay = a
    bx, by = b
    L = math.hypot(bx - ax, by - ay) or 1e-9
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        d = abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / L
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return simplify(pts[: idx + 1], eps)[:-1] + simplify(pts[idx:], eps)
    return [a, b]


def simplify_ring(ring: list[tuple[float, float]], eps: float) -> list[tuple[float, float]]:
    """Douglas–Peucker para anéis fechados: parte no vértice mais afastado do primeiro."""
    if len(ring) < 4:
        return ring
    far = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)
    a = simplify(ring[: far + 1], eps)
    b = simplify(ring[far:] + [ring[0]], eps)
    return a[:-1] + b[:-1]


def polygon_area(pts) -> float:
    s = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        s += x1 * y2 - x2 * y1
    return s / 2


def centroid(pts):
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def point_in_poly(x, y, pts) -> bool:
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def flat(pts) -> list[int]:
    out = []
    for x, y in pts:
        out += [int(round(x)), int(round(y))]
    return out


def clip_ok(pts) -> bool:
    """Mantém só geometria que toca no mapa."""
    return any(-200 <= x <= WIDTH + 200 and -200 <= y <= HEIGHT + 200 for x, y in pts)


def close_ring(pts):
    if len(pts) > 2 and pts[0] == pts[-1]:
        return pts[:-1]
    return pts


def join_rings(osm: OSM, members) -> list[list[tuple[float, float]]]:
    """Junta os 'outer' de um multipolígono em anéis fechados."""
    segs = [list(osm.ways[ref][0]) for typ, ref, role in members if typ == "way" and role in ("outer", "") and ref in osm.ways]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur += s[1:]
                elif s[-1] == cur[-1]:
                    cur += list(reversed(s))[1:]
                elif s[-1] == cur[0]:
                    cur = s[:-1] + cur
                elif s[0] == cur[0]:
                    cur = list(reversed(s))[:-1] + cur
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        pts = close_ring(way_points(osm, cur))
        if len(pts) >= 3:
            rings.append(pts)
    return rings


# ------------------------------------------------------------------ extração
def area_kind(t: dict) -> str | None:
    for k, v, kind in AREA_KINDS:
        if t.get(k) == v:
            return kind
    return None


def building_style(t: dict, name: str | None, area_m2: float, cx: float, cy: float, rnd: random.Random):
    """Devolve (kind, pisos). Paleta e materiais decididos no cliente pelo kind + seed."""
    if name in LANDMARKS:
        return LANDMARKS[name]
    if t.get("building") in ("church",) or t.get("amenity") == "place_of_worship":
        return ("church", 2)
    if t.get("building") == "train_station":
        return ("station", 2)
    if t.get("amenity") in ("hospital", "clinic") or t.get("building") == "hospital":
        return ("hospital", 3)
    if t.get("amenity") in ("school", "college", "university") or t.get("building") in ("college", "school", "university"):
        return ("school", 2)
    if t.get("amenity") == "marketplace":
        return ("market", 1)
    lv = t.get("building:levels")
    levels = None
    if lv:
        try:
            levels = max(1, min(14, int(float(lv.split(";")[0]))))
        except ValueError:
            levels = None
    if t.get("building") == "house":
        return ("house", levels or 1)
    if t.get("building") in ("commercial", "retail", "office", "hotel"):
        return ("commercial", levels or 3)
    if t.get("building") in ("roof", "greenhouse", "shed", "hut"):
        return ("shed", 1)
    # Sem etiqueta: a área decide. Edifícios grandes no centro histórico são prédios de vários pisos.
    if levels is None:
        if area_m2 < 110:
            levels = 1
        elif area_m2 < 300:
            levels = rnd.choice([1, 1, 2])
        elif area_m2 < 900:
            levels = rnd.choice([2, 3, 3, 4])
        else:
            levels = rnd.choice([3, 4, 5, 7])
    kind = "block" if levels >= 3 else ("house" if area_m2 < 300 else "commercial")
    return (kind, levels)


def main() -> None:
    if "--fetch" in sys.argv:
        fetch()
    osm = OSM()
    rnd = random.Random(1912)

    roads, rails, areas, buildings, labels, pois = [], [], [], [], [], []
    trees: list[int] = []
    poi_points = []

    # Nós com nome (POIs) — usados também para associar nomes a edifícios sem nome.
    for nid, (lat, lon, t) in osm.nodes.items():
        name = t.get("name")
        if not name or "place" in t:
            continue
        cat = next((k for k in ("amenity", "shop", "tourism", "office", "historic", "leisure") if k in t), None)
        if cat is None:
            continue
        x, y = project(lat, lon)
        if 0 <= x <= WIDTH and 0 <= y <= HEIGHT:
            sub = t.get(cat)
            poi_points.append((name, cat, sub, x, y))
        if t.get("natural") == "tree":
            pass

    for nid, (lat, lon, t) in osm.nodes.items():
        if t.get("natural") == "tree":
            x, y = project(lat, lon)
            if 0 <= x <= WIDTH and 0 <= y <= HEIGHT:
                trees += [int(x), int(y)]

    # Vias, linhas férreas, áreas e edifícios.
    for wid, (refs, t) in osm.ways.items():
        pts = way_points(osm, refs)
        if len(pts) < 2 or not clip_ok(pts):
            continue
        closed = refs[0] == refs[-1]
        hw = t.get("highway")
        if hw in ROAD_WIDTH_M and not (hw == "pedestrian" and t.get("area") == "yes"):
            surface = t.get("surface", "")
            unpaved = surface in ("unpaved", "dirt", "ground", "gravel", "sand", "earth", "compacted", "fine_gravel")
            # Sem etiqueta de superfície: vias residenciais fora do centro tendem a ser de terra.
            if not surface and hw in ("residential", "unclassified", "service", "track") and (pts[0][1] > HEIGHT * 0.7 or pts[0][0] > WIDTH * 0.8):
                unpaved = rnd.random() < 0.5
            if hw in ("footway", "path", "track"):
                unpaved = unpaved or not surface
            spts = simplify(pts, 1.5)
            roads.append({"k": hw, "w": round(ROAD_WIDTH_M[hw] * SCALE), "u": 1 if unpaved else 0,
                          "r": 1 if t.get("junction") == "roundabout" else 0, "p": flat(spts),
                          "n": t.get("name", "")})
            continue
        if t.get("railway") == "rail":
            rails.append(flat(simplify(pts, 1.5)))
            continue
        if t.get("railway") == "platform":
            areas.append({"k": "platform", "p": flat(simplify_ring(close_ring(pts), 1.0))}) if closed else None
            continue
        if "building" in t and closed:
            ring = close_ring(pts)
            if len(ring) >= 3:
                buildings.append((ring, t))
            continue
        kind = area_kind(t)
        if hw == "pedestrian" and t.get("area") == "yes":
            kind = "plaza"
        if kind and closed:
            ring = close_ring(pts)
            areas.append({"k": kind, "p": flat(simplify_ring(ring, 1.0)), "n": t.get("name", "")})
        elif t.get("waterway") in ("stream", "river", "ditch", "drain"):
            areas.append({"k": "stream", "p": flat(simplify(pts, 1.5)), "line": 1})

    for rid, (members, t) in osm.rels.items():
        if t.get("type") != "multipolygon":
            continue
        rings = join_rings(osm, members)
        if "building" in t:
            for ring in rings:
                if clip_ok(ring):
                    buildings.append((ring, t))
        else:
            kind = area_kind(t)
            if kind:
                for ring in rings:
                    if clip_ok(ring):
                        areas.append({"k": kind, "p": flat(simplify_ring(ring, 1.0)), "n": t.get("name", "")})

    # ---------------------------------------------------------------- edifícios finais
    out_buildings = []
    building_polys = []
    named_landmarks = []
    for ring, t in buildings:
        ring = simplify_ring(ring, 0.4 * SCALE)
        if len(ring) < 3:
            continue
        if polygon_area(ring) < 0:
            ring = list(reversed(ring))  # sentido horário em coordenadas de ecrã
        area_m2 = abs(polygon_area(ring)) / (SCALE * SCALE)
        if area_m2 < 6:
            continue
        name = t.get("name")
        cx, cy = centroid(ring)
        if not name:
            for pname, cat, sub, px, py in poi_points:
                if pname in POI_BUILDINGS and point_in_poly(px, py, ring):
                    name = pname
                    break
        if name in POI_BUILDINGS:
            kind, levels = POI_BUILDINGS[name]
        else:
            kind, levels = building_style(t, name, area_m2, cx, cy, rnd)
        b = {"p": flat(ring), "k": kind, "h": int(round(levels * LEVEL_PX)), "s": rnd.randrange(1 << 16)}
        if name:
            b["n"] = name
            if kind not in ("house", "block", "commercial", "shed"):
                named_landmarks.append((name, kind, cx, cy))
        out_buildings.append(b)
        building_polys.append(ring)

    # ---------------------------------------------------------------- marcos especiais (não-edifícios)
    monuments = []
    for nid, (lat, lon, t) in osm.nodes.items():
        if t.get("historic") == "memorial":
            x, y = project(lat, lon)
            if not (0 <= x <= WIDTH and 0 <= y <= HEIGHT):
                continue
            if t.get("inscription") == "Agostinho Neto":
                # Rotunda central: obelisco + estátua de Agostinho Neto (Praça 11 de Novembro).
                monuments.append({"k": "obelisk", "x": int(x), "y": int(y), "n": "Praça 11 de Novembro — Obelisco e estátua de Agostinho Neto"})
            else:
                monuments.append({"k": "statue", "x": int(x), "y": int(y), "n": t.get("name", "Estátua")})

    # ---------------------------------------------------------------- árvores procedimentais
    def free(x, y, r=10):
        if not (BORDER < x < WIDTH - BORDER and BORDER < y < HEIGHT - BORDER):
            return False
        for poly in nearby_buildings(x, y):
            if point_in_poly(x, y, poly):
                return False
        return True

    # índice espacial simples para edifícios
    bucket = 256
    index: dict[tuple[int, int], list] = {}
    for poly in building_polys:
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        for bx in range(int(min(xs)) // bucket, int(max(xs)) // bucket + 1):
            for by in range(int(min(ys)) // bucket, int(max(ys)) // bucket + 1):
                index.setdefault((bx, by), []).append(poly)

    def nearby_buildings(x, y):
        return index.get((int(x) // bucket, int(y) // bucket), [])

    for a in areas:
        if a["k"] in ("park", "wood", "cemetery") and not a.get("line"):
            pts = [(a["p"][i], a["p"][i + 1]) for i in range(0, len(a["p"]), 2)]
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            step = 70 if a["k"] == "park" else 45
            y = min(ys) + step / 2
            while y < max(ys):
                x = min(xs) + step / 2
                while x < max(xs):
                    jx, jy = x + rnd.uniform(-20, 20), y + rnd.uniform(-20, 20)
                    if point_in_poly(jx, jy, pts) and free(jx, jy) and rnd.random() < 0.75:
                        trees += [int(jx), int(jy)]
                    x += step
                y += step

    # árvores de alinhamento nas avenidas (como nas fotos do centro)
    for r in roads:
        if r["k"] in ("primary", "secondary", "tertiary") and (r["n"].startswith("Avenida") or r["n"].startswith("Praça")):
            p = r["p"]
            off = r["w"] / 2 + 2.5 * SCALE
            for i in range(0, len(p) - 2, 2):
                x1, y1, x2, y2 = p[i], p[i + 1], p[i + 2], p[i + 3]
                L = math.hypot(x2 - x1, y2 - y1)
                if L < 1:
                    continue
                nx, ny = -(y2 - y1) / L, (x2 - x1) / L
                d = 9 * SCALE
                while d < L:
                    for side in (-1, 1):
                        tx = x1 + (x2 - x1) * d / L + nx * off * side
                        ty = y1 + (y2 - y1) * d / L + ny * off * side
                        if free(tx, ty) and rnd.random() < 0.8:
                            trees += [int(tx), int(ty)]
                    d += 13 * SCALE

    # ---------------------------------------------------------------- etiquetas de ruas
    by_name: dict[str, list] = {}
    for r in roads:
        if r["n"] and r["k"] not in ("footway", "path", "steps"):
            by_name.setdefault(r["n"], []).append(r)
    for name, rs in by_name.items():
        placed = []
        segs = []
        for r in rs:
            p = r["p"]
            for i in range(0, len(p) - 2, 2):
                L = math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1])
                segs.append((L, p[i], p[i + 1], p[i + 2], p[i + 3]))
        segs.sort(reverse=True)
        for L, x1, y1, x2, y2 in segs:
            if L < 18 * SCALE:
                break
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            if not (0 < mx < WIDTH and 0 < my < HEIGHT):
                continue
            if any(math.hypot(mx - px, my - py) < 220 * SCALE for px, py in placed):
                continue
            ang = math.degrees(math.atan2(y2 - y1, x2 - x1))
            if ang > 90:
                ang -= 180
            elif ang < -90:
                ang += 180
            labels.append({"t": name, "x": int(mx), "y": int(my), "a": round(ang, 1), "k": "street"})
            placed.append((mx, my))
            if len(placed) >= 4:
                break

    # Áreas com nome (jardins, estádios) e marcos
    for a in areas:
        if a.get("n") and not a.get("line"):
            pts = [(a["p"][i], a["p"][i + 1]) for i in range(0, len(a["p"]), 2)]
            cx, cy = centroid(pts)
            labels.append({"t": a["n"], "x": int(cx), "y": int(cy), "a": 0, "k": "area"})
    seen: dict[str, list] = {}
    for name, kind, cx, cy in named_landmarks:
        if any(math.hypot(cx - x, cy - y) < 120 * SCALE for x, y in seen.get(name, [])):
            continue  # vários polígonos com o mesmo nome (ex.: blocos de um hotel)
        seen.setdefault(name, []).append((cx, cy))
        labels.append({"t": name, "x": int(cx), "y": int(cy), "a": 0, "k": "landmark"})

    for name, cat, sub, x, y in poi_points:
        pois.append({"n": name, "c": cat, "s": sub or "", "x": int(x), "y": int(y)})

    # ---------------------------------------------------------------- grelha de colisão
    cols = (WIDTH + CELL - 1) // CELL
    rows = (HEIGHT + CELL - 1) // CELL
    grid = bytearray(cols * rows)

    def fill_poly(pts):
        ys = [p[1] for p in pts]
        r0 = max(0, int(min(ys) // CELL))
        r1 = min(rows - 1, int(max(ys) // CELL))
        n = len(pts)
        for r in range(r0, r1 + 1):
            yc = r * CELL + CELL / 2
            xs = []
            for i in range(n):
                x1, y1 = pts[i]
                x2, y2 = pts[(i + 1) % n]
                if (y1 > yc) != (y2 > yc):
                    xs.append(x1 + (yc - y1) * (x2 - x1) / (y2 - y1))
            xs.sort()
            for i in range(0, len(xs) - 1, 2):
                c0 = max(0, int(math.ceil(xs[i] / CELL - 0.5)))
                c1 = min(cols - 1, int(math.floor(xs[i + 1] / CELL - 0.5)))
                for c in range(c0, c1 + 1):
                    grid[r * cols + c] = 1

    for poly in building_polys:
        fill_poly(poly)
    for a in areas:
        if a["k"] in BLOCKING_AREAS and not a.get("line"):
            fill_poly([(a["p"][i], a["p"][i + 1]) for i in range(0, len(a["p"]), 2)])
    for m in monuments:
        rad = 7 * SCALE if m["k"] == "obelisk" else 1.5 * SCALE
        fill_poly([(m["x"] + rad * math.cos(t), m["y"] + rad * math.sin(t)) for t in [i * math.pi / 6 for i in range(12)]])
    b = BORDER // CELL + 1
    for r in range(rows):
        for c in range(cols):
            if r < b or c < b or r >= rows - b or c >= cols - b:
                grid[r * cols + c] = 1

    # bitset compacto
    bits = bytearray((cols * rows + 7) // 8)
    for i, v in enumerate(grid):
        if v:
            bits[i >> 3] |= 1 << (i & 7)

    def walkable_near(x, y):
        """Procura em espiral o ponto livre mais próximo (para spawns)."""
        for rad in range(0, 400, 4):
            for k in range(max(1, rad // 2)):
                ang = 2 * math.pi * k / max(1, rad // 2)
                px, py = x + rad * math.cos(ang), y + rad * math.sin(ang)
                c, r_ = int(px // CELL), int(py // CELL)
                ok = True
                for dc in (-2, -1, 0, 1, 2):
                    for dr in (-2, -1, 0, 1, 2):
                        cc, rr = c + dc, r_ + dr
                        if not (0 <= cc < cols and 0 <= rr < rows) or grid[rr * cols + cc]:
                            ok = False
                if ok:
                    return int(px), int(py)
        raise RuntimeError("sem ponto livre")

    bairros = []
    for bid, name, lat, lon in BAIRROS:
        x, y = project(lat, lon)
        sx, sy = walkable_near(x, y)
        bairros.append({"id": bid, "name": name, "x": sx, "y": sy})
        labels.append({"t": name, "x": int(x), "y": int(y), "a": 0, "k": "bairro"})

    data = {
        "id": MAP_ID,
        "name": MAP_NAME,
        "attribution": "Dados do mapa © OpenStreetMap contributors (ODbL 1.0)",
        "bbox": list(BBOX),
        "scale": SCALE,
        "width": WIDTH,
        "height": HEIGHT,
        "grid": {"cell": CELL, "cols": cols, "rows": rows, "bits": base64.b64encode(bytes(bits)).decode()},
        "bairros": bairros,
        "roads": sorted(roads, key=lambda r: ROAD_ORDER.index(r["k"])),
        "rails": rails,
        "areas": areas,
        "buildings": out_buildings,
        "monuments": monuments,
        "trees": trees,
        "labels": labels,
        "pois": pois,
    }
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    data["version"] = hashlib.sha256(body.encode()).hexdigest()[:12]
    out = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True)

    for path in (os.path.join(ROOT, "client", "assets", "maps", f"{MAP_ID}.json"),
                 os.path.join(ROOT, "server", "data", "maps", f"{MAP_ID}.json")):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(out)
    print(f"mapa {MAP_ID} v{data['version']}: {WIDTH}x{HEIGHT}px, {len(out_buildings)} edifícios, {len(roads)} vias, "
          f"{len(areas)} áreas, {len(trees)//2} árvores, {len(labels)} etiquetas, {len(pois)} POIs, "
          f"grelha {cols}x{rows}, {len(out)/1024:.0f} KiB")

    try:
        from preview import render_preview
        render_preview(data, os.path.join(ROOT, "docs", "img", f"{MAP_ID}_preview.png"))
    except ImportError as e:
        print("pré-visualização ignorada:", e)


if __name__ == "__main__":
    main()
