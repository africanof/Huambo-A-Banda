"""Ensino superior: os edifícios do bairro que são institutos superiores ou universidades
passam a ser «universidade» (cursos superiores, professor universitário), em vez de escola.
Aplicado no fim do build_bairros (e pode correr sozinho sobre os JSON já gerados)."""
import glob
import json
import os
import re
import sys

SUPERIOR = re.compile(r"Instituto Superior|Universidade|Faculdade", re.I)


def apply(out: dict) -> int:
    n = 0
    for i in out.get("interiors", []):
        if SUPERIOR.search(str(i.get("name", ""))) and i.get("venue") == "escola":
            i["venue"] = "universidade"
            i["job"] = "professor_universitario"
            n += 1
            for p in out.get("places", []):
                if p.get("interior") == i["id"]:
                    if p.get("job") == "professor":
                        p["job"] = "professor_universitario"
                        p["name"] = "Púlpito do professor"
                    if p.get("kind") == "study":
                        p["name"] = "Anfiteatro"
                if p.get("kind") == "door" and i["id"] in (p.get("interiors") or []):
                    p["venue"] = "universidade"
    return n


if __name__ == "__main__":
    root = os.path.join(os.path.dirname(__file__), "..", "..")
    for d in ("server/data/bairros", "client/assets/bairros"):
        for f in sorted(glob.glob(os.path.join(root, d, "*.json"))):
            data = json.load(open(f))
            if apply(data):
                body = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                open(f, "w").write(body)
                print("universidade:", f)
    sys.exit(0)
