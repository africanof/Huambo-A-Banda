#!/usr/bin/env python3
"""
Plantas dos bairros com as RUAS REAIS do OpenStreetMap (ODbL).

    python3 tools/bairros/osm_bairros.py      # descarrega (cache)
    python3 tools/bairros/gen_osm.py [bairro ...] && python3 tools/bairros/build_bairros.py

Para cada bairro: janela de 160 m no núcleo de ruas mais denso perto do centro real do bairro,
rodada para que as ruas principais fiquem alinhadas com os eixos do jogo; edifícios do kit de IA
encostados às ruas com a porta virada para a rua; adereços do próprio kit; portais nas pontas das
ruas para o bairro vizinho real nessa direção (andar a pé de um bairro para o outro).
"""
import glob, json, math, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import osm_roads  # noqa: E402
from osm_bairros import GEO  # noqa: E402

objs = dict(json.load(open(os.path.join(ROOT, "client", "assets", "demo", "manifest.json")))["objects"])
for _k in glob.glob(os.path.join(ROOT, "client", "assets", "kits", "*", "manifest.json")):
    objs.update(json.load(open(_k))["objects"])
CFG = json.load(open(os.path.join(HERE, "bairros.json")))
NAMES = {b["id"]: b["name"] for b in CFG["bairros"]} | {"cidade_baixa": "Cidade Baixa", "bairro_fatima": "Bairro de Fátima"}

S = 160.0      # lado do bairro jogável (m)
OUT_M = 60.0   # ruas desenhadas para lá do limite (cenário)
SIDE = 2.0     # passeio


def bearing(dx, dy):
    """Rumo (graus, 0 = norte, 90 = este) de um vetor em metros (x = este, y = sul)."""
    return (math.degrees(math.atan2(dx, -dy)) + 360) % 360


def ang_diff(a, b):
    return abs((a - b + 180) % 360 - 180)


def seg_dist(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    L = vx * vx + vy * vy
    t = 0 if L == 0 else max(0, min(1, ((px - ax) * vx + (py - ay) * vy) / L))
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy))


def neighbours(bid):
    lat0, lon0 = GEO[bid]
    out = []
    for k, (lat, lon) in GEO.items():
        if k == bid:
            continue
        dx = (lon - lon0) * 111_320 * math.cos(math.radians(lat0))
        dy = (lat0 - lat) * 111_320
        out.append((k, bearing(dx, dy), math.hypot(dx, dy)))
    return out


def make(bid, name, tipo, kit_items, props_by_kind):
    lat0, lon0 = GEO[bid]
    roads, areas = osm_roads.load(os.path.join(HERE, "osm", bid + ".osm"), lat0, lon0)
    rnd = random.Random(bid)

    # 1) janela: mais ruas perto do centro real (penaliza afastar-se)
    best = (-1, 0, 0)
    for cx in range(-200, 201, 10):
        for cy in range(-200, 201, 10):
            L = sum(math.dist(p, q) for r in roads for p, q in zip(r["pts"], r["pts"][1:])
                    if abs((p[0] + q[0]) / 2 - cx) < S / 2 and abs((p[1] + q[1]) / 2 - cy) < S / 2)
            score = L - 1.2 * math.hypot(cx, cy)
            if score > best[0]:
                best = (score, cx, cy)
    _, cx, cy = best
    # 2) rotação: direção dominante das ruas (módulo 90°), pesada pelo comprimento
    sx = sy = 0.0
    for r in roads:
        for p, q in zip(r["pts"], r["pts"][1:]):
            if abs((p[0] + q[0]) / 2 - cx) < S and abs((p[1] + q[1]) / 2 - cy) < S:
                a = math.atan2(q[1] - p[1], q[0] - p[0]) * 4
                L = math.dist(p, q)
                sx += L * math.cos(a)
                sy += L * math.sin(a)
    rot = math.atan2(sy, sx) / 4  # ângulo a desfazer
    c, s = math.cos(-rot), math.sin(-rot)

    def tf(p):
        x, y = p[0] - cx, p[1] - cy
        return [round(x * c - y * s + S / 2, 2), round(x * s + y * c + S / 2, 2)]

    def untf_dir(dx, dy):  # direção no jogo → direção real (para o rumo)
        cr, sr = math.cos(rot), math.sin(rot)
        return dx * cr - dy * sr, dx * sr + dy * cr

    lo, hi = -OUT_M, S + OUT_M
    R = []
    for r in roads:
        pts = [tf(p) for p in r["pts"]]
        if all(not (lo <= x <= hi and lo <= y <= hi) for x, y in pts):
            continue
        R.append({"pts": pts, "w": r["w"], "paved": r["paved"], "name": r["name"]})
    A = [{"kind": a["kind"], "pts": [tf(p) for p in a["pts"]]} for a in areas]

    def road_d(x, y, extra=SIDE):
        """>0 = distância à beira do passeio; <=0 = em cima da rua/passeio."""
        best = 1e9
        for r in R:
            for p, q in zip(r["pts"], r["pts"][1:]):
                best = min(best, seg_dist(x, y, *p, *q) - r["w"] / 2 - extra)
        return best

    placed = []

    def free_rect(x, y, w, d, pad=1.0):
        if x < 1 or y < 1 or x + w > S - 1 or y + d > S - 1:
            return False
        for px, py, pw, ph in placed:
            if x < px + pw + pad and px < x + w + pad and y < py + ph + pad and py < y + d + pad:
                return False
        step = 1.5
        gx = x
        while gx <= x + w + 0.01:
            gy = y
            while gy <= y + d + 0.01:
                if road_d(gx, gy, SIDE + 0.3) <= 0:
                    return False
                gy += step
            gx += step
        return True

    # 3) edifícios: os do kit, públicos primeiro (perto do centro), depois casas
    def fp(i):
        return objs[i]["footprint"]

    def door_ok(door):
        x, y = door
        if not (1.2 < x < S - 1.2 and 1.2 < y < S - 1.2):
            return False
        return all(not (px - 0.6 < x < px + pw + 0.6 and py - 0.6 < y < py + ph + 0.6) for px, py, pw, ph in placed)

    segs = [(p, q, r) for r in R for p, q in zip(r["pts"], r["pts"][1:])]
    buildings, doors = [], []
    order = sorted(kit_items, key=lambda it: (it["venue"] == "casa", -fp(it["id"])[0] * fp(it["id"])[1]))
    for it in order:
        w, d = fp(it["id"])
        door_y = w >= d
        cands = []
        for p, q, r in segs:
            dx, dy = q[0] - p[0], q[1] - p[1]
            L = math.hypot(dx, dy)
            if L < 2:
                continue
            horiz = abs(dx) >= abs(dy)
            if horiz != door_y or (abs(dy) / L if horiz else abs(dx) / L) > 0.42:
                continue
            off = r["w"] / 2 + SIDE + 0.6
            n = int(L)
            for k in range(0, n + 1, 2):
                px, py = p[0] + dx * k / n, p[1] + dy * k / n
                if door_y:  # a rua passa por baixo (y maior) do edifício
                    x, y = px - w / 2, py - off - d
                    door = (px, py - off + 1.0)
                else:  # a rua passa à direita (x maior)
                    x, y = px - off - w, py - d / 2
                    door = (px - off + 1.0, py)
                dist_c = math.hypot(x + w / 2 - S / 2, y + d / 2 - S / 2)
                cands.append((dist_c if it["venue"] != "casa" else -0.3 * dist_c + rnd.random() * 20, x, y, door))
        cands.sort(key=lambda t: t[0])
        spot = None
        for _, x, y, door in cands:
            if free_rect(x, y, w, d) and door_ok(door):
                spot = (round(x, 1), round(y, 1), door)
                break
        if not spot:  # sem frente de rua livre: terreno livre mais perto de uma rua
            for _ in range(4000):
                x, y = rnd.uniform(2, S - w - 2), rnd.uniform(2, S - d - 2)
                door = (x + w / 2, y + d + 1.2) if door_y else (x + w + 1.2, y + d / 2)
                if free_rect(x, y, w, d) and door_ok(door):
                    spot = (round(x, 1), round(y, 1), door)
                    break
        if not spot:
            raise SystemExit(f"{bid}: sem lugar para {it['id']}")
        placed.append([spot[0], spot[1], w, d])
        dx_, dy_ = spot[2]
        placed.append([dx_ - 0.5, dy_ - 0.5, 1.0, 1.0])  # reserva a frente da porta
        b = {"id": it["id"], "at": [spot[0], spot[1]], "venue": dict(it["venue_spec"])}
        if it["venue"] == "casa":
            b["label"] = it["name"]
        buildings.append(b)
        doors.append(spot[2])

    # 4) adereços do próprio kit (categorias)
    props = []

    def add(pid, x, y, extra=None, clear=2.2, on_road=False):
        if pid not in objs:
            return False
        pw, pd = fp(pid)
        r = [x - pw / 2, y - pd / 2, pw, pd]
        if not (2 < x < S - 2 and 2 < y < S - 2):
            return False
        if any(abs(x - dx) < clear and abs(y - dy) < clear for dx, dy in doors):
            return False
        for px, py, qw, qh in placed:
            if r[0] < px + qw + 0.3 and px < r[0] + r[2] + 0.3 and r[1] < py + qh + 0.3 and py < r[1] + r[3] + 0.3:
                return False
        if not on_road and road_d(x, y, 0.2) <= 0:
            return False
        placed.append(r)
        props.append([pid, [round(x, 1), round(y, 1)]] + ([extra] if extra else []))
        return True

    def pick(kind):
        lst = props_by_kind.get(kind) or []
        return rnd.choice(lst) if lst else None

    for r in R:  # candeeiros (alcatrão) ou postes (terra) ao longo da beira, árvores do outro lado
        for p, q in zip(r["pts"], r["pts"][1:]):
            dx, dy = q[0] - p[0], q[1] - p[1]
            L = math.hypot(dx, dy)
            if L < 1:
                continue
            nx, ny = -dy / L, dx / L
            k = 4.0
            while k < L:
                px, py = p[0] + dx * k / L, p[1] + dy * k / L
                off = r["w"] / 2 + SIDE + 0.4
                lamp = pick("lamp") if r["paved"] else (pick("pole") or pick("lamp"))
                if lamp:
                    add(lamp, px + nx * off, py + ny * off, clear=1.6)
                t = pick("tree")
                if t and rnd.random() < 0.55:
                    add(t, px - nx * (off + 1.0), py - ny * (off + 1.0), clear=2.4)
                k += 16.0
    # veículos estacionados na beira da rua (em cima do alcatrão/terra)
    for _ in range(10):
        p, q, r = rnd.choice(segs)
        v = pick("vehicle")
        if v:
            t = rnd.uniform(0.2, 0.8)
            dx, dy = q[0] - p[0], q[1] - p[1]
            L = max(1e-6, math.hypot(dx, dy))
            add(v, p[0] + dx * t + (-dy / L) * (r["w"] / 2 - 1.3), p[1] + dy * t + (dx / L) * (r["w"] / 2 - 1.3), clear=3.5, on_road=True)
    # bancas e zungueiras perto do mercado e da praça; uma é posto de trabalho de zunga
    mk = next((d for it, d in zip(order, doors) if it["venue"] == "mercado"), (S / 2, S / 2))
    first = True
    for _ in range(40):
        st = pick("stall")
        if not st:
            break
        if add(st, mk[0] + rnd.uniform(-14, 14), mk[1] + rnd.uniform(2, 10), {"kind": "work", "job": "zunga"} if first else None, clear=2.6):
            first = False
        if sum(1 for pr in props if pr[0] in props_by_kind.get("stall", [])) >= 6:
            break
    # vida do bairro: pequenos objetos e mais árvores no meio dos quarteirões
    for _ in range(60):
        sm = pick("small")
        if sm:
            add(sm, rnd.uniform(4, S - 4), rnd.uniform(4, S - 4))
    for _ in range(40):
        t = pick("tree")
        if t:
            add(t, rnd.uniform(4, S - 4), rnd.uniform(4, S - 4), clear=3)

    # 5) saídas: onde as ruas cruzam o limite do bairro (rumo real de cada uma)
    exits = []
    inset = 2.5
    for r in R:
        pts = r["pts"]
        for p, q in zip(pts, pts[1:]):
            inside_p = inset <= p[0] <= S - inset and inset <= p[1] <= S - inset
            inside_q = inset <= q[0] <= S - inset and inset <= q[1] <= S - inset
            if inside_p == inside_q:
                continue
            a, b2 = (p, q) if inside_p else (q, p)
            lo_t, hi_t = 0.0, 1.0
            for _ in range(30):
                m = (lo_t + hi_t) / 2
                mx, my = a[0] + (b2[0] - a[0]) * m, a[1] + (b2[1] - a[1]) * m
                if inset <= mx <= S - inset and inset <= my <= S - inset:
                    lo_t = m
                else:
                    hi_t = m
            ex, ey = a[0] + (b2[0] - a[0]) * lo_t, a[1] + (b2[1] - a[1]) * lo_t
            ddx, ddy = b2[0] - a[0], b2[1] - a[1]
            L = max(1e-6, math.hypot(ddx, ddy))
            ux, uy = ddx / L, ddy / L
            if any(math.hypot(ex - e["at"][0], ey - e["at"][1]) < 8 for e in exits):
                continue
            exits.append({"bearing": bearing(*untf_dir(ddx, ddy)), "w": r["w"],
                          "at": [round(ex - ux * 1.5, 1), round(ey - uy * 1.5, 1)], "arrive": [round(ex - ux * 7, 1), round(ey - uy * 7, 1)]})
    portals = []

    # 6) pontos de chegada
    ctr = min(((x, y) for r in R for x, y in r["pts"] if 10 < x < S - 10 and 10 < y < S - 10),
              key=lambda t: math.hypot(t[0] - S / 2, t[1] - S / 2), default=(S / 2, S / 2))
    spawns = [{"id": "centro", "name": f"Centro de {name}", "at": [round(ctr[0], 1), round(ctr[1], 1)]}]
    spec = {
        "id": bid, "name": name, "size": [S, S], "tile": 4, "ground": [{"kind": "relva" if tipo == "nobre" else "terra"}],
        "osm": True, "roads": R, "areas": A, "geo": {"lat": lat0, "lon": lon0, "rot_deg": round(math.degrees(rot), 1), "cx": cx, "cy": cy},
        "buildings": buildings, "props": props, "spawns": spawns, "portals": portals,
    }
    return spec, exits


def kit_entries(bid):
    """Edifícios (com venue) e adereços por categoria do kit do bairro."""
    kit = json.load(open(os.path.join(ROOT, "tools", "art", "ai", "kits", bid + ".json")))
    items = []
    for it in kit["items"]:
        if it.get("cat") != "building" or "venue" not in it:
            continue
        v = it["venue"]
        spec = {"venue": v}
        if v in CFG["jobs"]:
            spec["job"] = CFG["jobs"][v]
        if v in CFG["shops"]:
            spec["shop"] = CFG["shops"][v]
        if v == "apartamentos":
            spec["units"] = 4
        if v == "casa":
            spec["units"] = 1
        items.append(dict(it, venue_spec=spec))
    kinds = {}
    for it in kit["items"]:
        if it.get("cat") == "prop" and it.get("kind"):
            kinds.setdefault(it["kind"], []).append(it["id"])
    return items, kinds


def assign_portals(specs, exits):
    """Liga cada bairro aos vizinhos reais pelas saídas das ruas, SEMPRE nos dois sentidos."""
    links = {k: {} for k in specs}  # bairro -> {destino: índice da saída}
    for k in specs:
        for i, e in sorted(enumerate(exits[k]), key=lambda t: -t[1]["w"]):
            cand = sorted((ang_diff(e["bearing"], nb_b) + d / 80, to) for to, nb_b, d in neighbours(k)
                          if to in specs and ang_diff(e["bearing"], nb_b) < 55 and d < 3500 and to not in links[k])
            if cand:
                links[k][cand[0][1]] = i
    # bairros isolados: liga ao vizinho mais próximo pela saída mais bem orientada
    for k in specs:
        if not links[k] and exits[k]:
            to, nb_b, _ = min((n for n in neighbours(k) if n[0] in specs), key=lambda n: n[2])
            links[k][to] = min(range(len(exits[k])), key=lambda i: ang_diff(exits[k][i]["bearing"], nb_b))
    # a cidade inteira tem de estar ligada: junta grupos separados pelo par mais próximo
    while True:
        comp, stack = {next(iter(specs))}, [next(iter(specs))]
        while stack:
            k = stack.pop()
            for to in list(links[k]) + [a for a in specs if k in links[a]]:
                if to not in comp:
                    comp.add(to)
                    stack.append(to)
        if len(comp) == len(specs):
            break
        a, b, nb_b, _ = min(((x, n[0], n[1], n[2]) for x in comp for n in neighbours(x) if n[0] in specs and n[0] not in comp), key=lambda t: t[3])
        links[a][b] = min(range(len(exits[a])), key=lambda i: ang_diff(exits[a][i]["bearing"], nb_b))
    # ida e volta
    for k in list(specs):
        for to in list(links[k]):
            if k in links[to] or not exits[to]:
                continue
            back = next(b for n, b, _ in neighbours(to) if n == k)
            used = set(links[to].values())
            free = [i for i in range(len(exits[to])) if i not in used] or list(range(len(exits[to])))
            links[to][k] = min(free, key=lambda i: ang_diff(exits[to][i]["bearing"], back))
    for k, spec in specs.items():
        seen = {}
        for to, i in sorted(links[k].items()):
            e = exits[k][i]
            n = seen.get(i, 0)
            seen[i] = n + 1
            # duas ligações na mesma rua: placas lado a lado, atravessadas à rua
            ix, iy = e["arrive"][0] - e["at"][0], e["arrive"][1] - e["at"][1]
            L = max(1e-6, math.hypot(ix, iy))
            off = 2.0 * ((n + 1) // 2) * (1 if n % 2 else -1)
            ox, oy = -iy / L * off, ix / L * off
            spec["portals"].append({"to": to, "name": NAMES.get(to, to), "at": [round(e["at"][0] + ox, 1), round(e["at"][1] + oy, 1)],
                                    "arrive": [round(e["arrive"][0] + ox, 1), round(e["arrive"][1] + oy, 1)]})


if __name__ == "__main__":
    want = set(sys.argv[1:])
    todo = [(b["id"], b["name"], b["tipo"]) for b in CFG["bairros"]] + [("bairro_fatima", "Bairro de Fátima", "centro")]
    fat_items, fat_kinds = kit_entries("bairro_fatima")
    specs, exits = {}, {}
    for bid, name, tipo in todo:
        if want and bid not in want:
            continue
        items, kinds = kit_entries(bid)
        for k, v in fat_kinds.items():  # se faltar uma categoria no kit do bairro, usa a de Fátima
            kinds.setdefault(k, v)
        specs[bid], exits[bid] = make(bid, name, tipo, items, kinds)
    # Cidade Baixa: planta própria (avenida e rua de terra); saídas nas pontas
    cb_path = os.path.join(HERE, "cidade_baixa.json")
    cb = json.load(open(cb_path))
    cb["portals"] = []
    cb["geo"] = {"lat": GEO["cidade_baixa"][0], "lon": GEO["cidade_baixa"][1]}
    specs["cidade_baixa"] = cb
    exits["cidade_baixa"] = [{"bearing": 270, "w": 8, "at": [3.0, 24.0], "arrive": [9.0, 24.0]},
                             {"bearing": 90, "w": 8, "at": [93.0, 24.0], "arrive": [87.0, 24.0]},
                             {"bearing": 0, "w": 4, "at": [30.0, 3.0], "arrive": [30.0, 9.0]},
                             {"bearing": 180, "w": 4, "at": [30.0, 45.0], "arrive": [30.0, 39.0]}]
    if want:
        exits = {k: v for k, v in exits.items()}
    assign_portals(specs, exits)
    for bid, spec in specs.items():
        json.dump(spec, open(os.path.join(HERE, bid + ".json"), "w"), ensure_ascii=False, indent=1)
        print(f"{bid:18} {len(spec['buildings'])} edifícios, {len(spec['props'])} adereços, {len(spec.get('roads', []))} ruas, a pé → {', '.join(p['to'] for p in spec['portals'])}")
