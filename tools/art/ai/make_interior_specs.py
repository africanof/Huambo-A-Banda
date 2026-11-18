#!/usr/bin/env python3
"""
Kits de INTERIORES (regra: >100 objetos por imagem). Cada imagem tem as salas vazias (cortes
isométricos: chão + 2 paredes do fundo) de vários tipos de lugar e, a seguir, a mobília de cada um,
agrupada por lugar na mesma ordem. Escreve specs/kits_interiores.json e kits/interiores.json (grupos).
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
# venue: (descrição da sala vazia, [mobília])
V = {
    "casa": ("living room of an Angolan family home: tiled floor, painted walls with a window and curtains",
             ["double bed with wax-print bedspread", "terracotta sofa", "TV on a wooden cabinet", "gas stove with gas cylinder", "white fridge", "dining table with 4 chairs and flowered tablecloth", "woven rug", "wardrobe"]),
    "cantina": ("small grocery shop interior: cement floor, walls with shelves painted pale green",
                ["shop counter with a scale and sweets", "tall shelf full of cans, rice bags and oil bottles", "soft-drink fridge (red)", "stack of crates of Cuca beer", "plastic table with 4 plastic chairs", "sacks of rice and beans"]),
    "padaria": ("bakery interior: white tiles, wooden bread shelves on the wall",
                ["glass bread counter with pão", "wood-fired bread oven", "bread shelf with baguettes", "cake display", "small coffee machine on a counter", "flour sacks"]),
    "hotel": ("hotel room and lobby: beige walls, wooden floor",
              ["reception desk with a bell and key board", "hotel double bed with white sheets", "single bed", "bedside table with lamp", "armchair", "luggage rack with suitcase"]),
    "banco": ("bank branch interior: polished marble floor, light walls, bank logo panel",
              ["bank teller counter with glass partition", "ATM machine", "waiting chairs row", "queue barrier posts", "manager desk with computer", "safe (cofre)"]),
    "loja_telecom": ("mobile-phone shop interior: white walls with operator posters (Unitel, Movicel, Africell)",
                     ["phone display counter with smartphones", "wall display of phone cases", "shop counter with cash register", "SIM card stand", "waiting stool", "internet cafe computer desk"]),
    "correios": ("post office interior: yellow and red walls, counters",
                 ["post office counter with window", "wall of post office boxes (caixas postais)", "parcel scale", "stack of parcels", "mail sorting table", "waiting bench"]),
    "governo": ("government office interior: wood panelling, Angolan flag and official portrait frame on the wall",
                ["official desk with documents and stamp", "visitor chairs", "filing cabinet", "Angolan flag on a stand", "waiting bench", "document counter with forms"]),
    "tribunal": ("courtroom interior: dark wood panelling, high windows",
                 ["judge bench (raised)", "witness stand", "lawyer tables", "public benches", "court clerk desk", "scales of justice statue"]),
    "escola": ("primary-school classroom: blackboard on the wall, cement floor, windows",
               ["teacher desk", "school desks with benches (pair)", "school desks with benches (pair)", "bookshelf with books", "globe on a stand", "chalk board on easel"]),
    "saude": ("health centre consultation room: white tiled walls, green floor",
              ["hospital bed with drip stand", "doctor desk with stethoscope", "medicine cabinet", "examination table", "waiting chairs", "wheelchair"]),
    "igreja": ("church nave interior: white walls, stained-glass windows, wooden floor",
               ["altar with white cloth and candles", "wooden pews (benches)", "wooden pews (benches)", "lectern / ambo", "statue of Our Lady", "church keyboard / organ"]),
    "mercado": ("indoor market hall: concrete floor, zinc roof beams visible on the walls",
                ["vegetable stall", "fruit stall with bananas and mangoes", "dried fish stall", "fabric / clothing stall", "basket of cassava", "market scale with weights"]),
    "esquadra": ("police station interior: blue and white walls",
                 ["police reception desk", "holding cell with bars", "filing cabinet", "officer desk with radio", "waiting bench", "wanted posters board"]),
    "farmacia": ("pharmacy interior: white walls, green cross sign, glass shelves",
                 ["pharmacy counter", "tall medicine shelf", "glass display of medicines", "blood pressure machine with chair", "refrigerator for vaccines", "baby products shelf"]),
    "churrasqueira": ("grill restaurant interior: tiled floor, walls with menu board",
                      ["charcoal grill with chicken", "bar counter with stools", "plastic table set (red)", "plastic table set (blue)", "drinks fridge", "menu board"]),
    "discoteca": ("night club interior: dark walls, colored LED lights, dance floor",
                  ["DJ booth with speakers", "bar counter with bottles", "big speaker", "lounge sofa", "high bar table with stools", "disco light dance floor panel"]),
}
GROUPS = [list(V)[:9], list(V)[9:]]
specs, groups = [], []
for gi, vs in enumerate(GROUPS, 1):
    rooms = "; ".join(f"({i}) {V[v][0]}" for i, v in enumerate(vs, 1))
    furn = "\n".join(f"- for room ({i}): " + ", ".join(V[v][1]) for i, v in enumerate(vs, 1))
    prompt = (
        "CAMERA: the same isometric camera as the attached reference room: floor diamond seen from above at 30°, only the two BACK walls "
        "(left and right) are drawn, the front is open (cutaway), exactly like a life-simulation game interior.\n"
        f"Asset sheet of INTERIORS for a game set in Huambo, Angola. FIRST draw {len(vs)} EMPTY ROOMS (floor + two back walls, no furniture, "
        "all the same size and shape, each completely separated), in this order: " + rooms + ".\n"
        "THEN draw the FURNITURE, each piece as a separate isolated asset, grouped room by room in the same order, one row per room, "
        "with 2-3 extra small decorative items for each room (plants, frames, bins, fans, clocks) so that the sheet has more than 100 objects:\n" + furn +
        "\nEvery item fully separated by transparent space so each one can be cut out automatically. Same isometric angle and scale for all furniture."
    )
    specs.append({"id": f"kit_interiores_{gi}", "kind": "bairro_kit", "context_only": True, "refs": ["interior_sala"],
                  "size": "3840x2160", "quality": "high", "prompt": prompt})
    groups.append({"kit": f"kit_interiores_{gi}", "venues": vs, "furniture": {v: V[v][1] for v in vs}})
json.dump(specs, open(os.path.join(HERE, "specs", "kits_interiores.json"), "w"), ensure_ascii=False, indent=1)
json.dump(groups, open(os.path.join(HERE, "kits", "interiores_grupos.json"), "w"), ensure_ascii=False, indent=1)
print(len(specs), "pedidos")
