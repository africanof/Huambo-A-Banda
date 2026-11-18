"""Lê as ruas de um .osm e devolve-as em metros (x = este, y = sul) a partir do centro do bairro."""
import math, xml.etree.ElementTree as ET

ROAD_W = {"motorway": 14, "trunk": 14, "primary": 12, "primary_link": 8, "secondary": 11, "secondary_link": 7,
          "tertiary": 9, "tertiary_link": 7, "residential": 7, "unclassified": 7, "living_street": 6,
          "service": 5, "pedestrian": 6, "track": 4.5, "road": 6}
PAVED = {"asphalt", "paved", "concrete", "paving_stones", "sett", "cobblestone"}


def load(path, lat0, lon0):
    root = ET.parse(path).getroot()
    nodes = {}
    for n in root.iter("node"):
        lat, lon = float(n.get("lat")), float(n.get("lon"))
        nodes[n.get("id")] = ((lon - lon0) * 111_320 * math.cos(math.radians(lat0)), (lat0 - lat) * 111_320)
    roads, areas = [], []
    for w in root.iter("way"):
        t = {x.get("k"): x.get("v") for x in w.findall("tag")}
        pts = [nodes[nd.get("ref")] for nd in w.findall("nd") if nd.get("ref") in nodes]
        if len(pts) < 2:
            continue
        hw = t.get("highway")
        if hw in ROAD_W:
            surf = t.get("surface", "")
            major = hw in ("motorway", "trunk", "primary", "secondary", "tertiary", "primary_link", "secondary_link", "tertiary_link")
            paved = surf in PAVED or (not surf and major)
            roads.append({"pts": pts, "w": ROAD_W[hw], "paved": paved, "hw": hw, "name": t.get("name", "")})
        elif t.get("leisure") in ("park", "garden", "pitch") or t.get("landuse") in ("grass", "recreation_ground", "meadow"):
            if pts[0] == pts[-1]:
                areas.append({"kind": "relva", "pts": pts})
    return roads, areas
