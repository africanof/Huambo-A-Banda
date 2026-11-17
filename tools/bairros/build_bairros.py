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


def front_point(at, fp):
    """Ponto do passeio em frente à fachada (lado +y no mundo = em baixo no ecrã)."""
    return [round(at[0] + fp[0] / 2, 2), round(at[1] + fp[1] + 1.2, 2)]


for src in sorted(glob.glob(os.path.join(HERE, "*.json"))):
    spec = json.load(open(src))
    out = {k: spec[k] for k in ("id", "name", "size", "tile", "ground", "spawns")}
    out["buildings"], out["props"], out["obstacles"], out["places"] = [], [], [], []
    for b in spec["buildings"]:
        o = objs[b["id"]]
        fp = o["footprint"]
        name = b.get("label", o.get("name", ""))
        out["buildings"].append({"id": b["id"], "at": b["at"], "fp": fp, "label": name})
        out["obstacles"].append([b["at"][0], b["at"][1], fp[0], fp[1]])
        if "place" in b:
            p = dict(b["place"])
            at = p.pop("door", None) or front_point(b["at"], fp)
            out["places"].append({"id": f"{b['id']}@{b['at'][0]},{b['at'][1]}", "name": name, "at": at, "radius": 2.6, **p})
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
          f"{len(out['obstacles'])} obstáculos, {len(out['places'])} lugares")
