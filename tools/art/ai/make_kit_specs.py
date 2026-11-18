#!/usr/bin/env python3
"""Pedidos (specs) dos kits de bairro a partir de tools/bairros/bairros.json → specs/kits_bairros.json."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(os.path.join(HERE, "..", "..", "bairros", "bairros.json")))
look = cfg["look"]
specs = []
for b in cfg["bairros"]:
    lines = []
    for n, (venue, sign) in enumerate(b["buildings"], 1):
        lines.append(f"({n}) '{sign}' - {look['venue'][venue]}")
    nb = len(b["buildings"])
    houses = f"({nb + 1}-{nb + b['houses']}) {b['houses']} DIFFERENT family houses of the bairro: {look['houses'][b['tipo']]}."
    prompt = (
        "CAMERA: copy EXACTLY the isometric camera of the two attached reference assets: every building is seen from a corner, "
        "showing TWO facades that both recede diagonally (front facade on the left side going up-left, side facade on the right side going up-right), "
        "the nearest vertical corner of the building points toward the viewer at the bottom centre. Never draw a building seen straight from the front. "
        "The references only show the camera angle and level of detail — do NOT copy their buildings.\n"
        "SIGNS: spell every sign EXACTLY as written between quotes, letter by letter, Portuguese with accents and the tilde (São, Graça, Administração).\n"
        f"Asset sheet of the whole '{b['name']}' neighbourhood of Huambo, Angola. Every public building carries a clearly readable Portuguese sign. "
        "Draw ALL of these as separate isolated assets, in this order (left to right, top to bottom):\n"
        "BIG NAMED BUILDINGS (each with its sign): " + "; ".join(lines) + "; " + houses + "\n"
        "THEN SMALL PROPS (about 85 items, each isolated): 10 trees (jacarandas in bloom, eucalyptus, palm trees, mulemba fig, mango, avocado, bougainvillea); "
        "6 street lamps; 4 wooden electricity poles; 2 blue-and-white candongueiro minibuses; 4 kupapata motorbikes; 3 cars; 6 zungueira and market stalls; "
        "4 waste containers; 4 benches; 3 rooftop water tanks; 2 generators; 2 bus-stop shelters; 4 flower pots; 3 bicycles; 4 piles of cement blocks; "
        "2 wheelbarrows; 3 yellow jerrycans; 3 chickens; 2 goats; " + f"2 street signs reading '{b['name']}'; "
        "2 Angolan flags on poles; 3 mobile-phone credit kiosks; 2 sacks of charcoal; 1 public water tap; 2 plastic table sets; 2 gas cylinders; "
        "1 wooden cart; 2 walls with gates.\nEvery item fully separated by transparent space so each one can be cut out automatically."
    )
    specs.append({"id": f"kit_{b['id']}", "kind": "bairro_kit", "context_only": True, "refs": ["v3_banco", "v3_predio_castanho"],
                  "size": "3840x2160", "quality": "high", "prompt": prompt})
json.dump(specs, open(os.path.join(HERE, "specs", "kits_bairros.json"), "w"), ensure_ascii=False, indent=1)
print(len(specs), "pedidos")
