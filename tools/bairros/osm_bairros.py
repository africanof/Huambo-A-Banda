#!/usr/bin/env python3
"""
Ruas reais de cada bairro do Huambo (OpenStreetMap, ODbL): descarrega a área à volta do centro
de cada bairro para tools/bairros/osm/<id>.osm (cache, não versionado).
Centros: Nominatim (place=suburb/neighbourhood) e pontos de referência de tools/mapgen.
"""
import os, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
GEO = {  # id: (lat, lon)
    "cidade_baixa": (-12.7670, 15.7440), "cidade_alta": (-12.7752, 15.7355), "sao_pedro": (-12.7690, 15.7300),
    "bairro_academico": (-12.7710, 15.7487), "bairro_fatima": (-12.7810, 15.7426), "aviacao": (-12.7850, 15.7208),
    "bairro_militar": (-12.7770, 15.7257), "benfica": (-12.7470, 15.7453), "bomba_alta": (-12.7640, 15.7882),
    "cacilhas": (-12.7770, 15.7573), "cacoio": (-12.7690, 15.6773), "cahumba": (-12.7250, 15.7454),
    "cambiote": (-12.7680, 15.8137), "canata": (-12.7670, 15.7620), "chiva": (-12.7310, 15.7920),
    "kapango": (-12.7600, 15.7300), "lossambo": (-12.8440, 15.7637), "salucombo": (-12.8350, 15.7730),
    "samutaca": (-12.8450, 15.7386), "sao_jose": (-12.7680, 15.7749), "sao_joao": (-12.7630, 15.7578),
    "vila_graca": (-12.7450, 15.7871), "xipuli": (-12.7400, 15.7508),
}
HALF_M = 165  # área descarregada: 330 m × 330 m (bairro jogável + cenário à volta)


def bbox(lat, lon, half=HALF_M):
    import math
    dlat = half / 111_320
    dlon = half / (111_320 * math.cos(math.radians(lat)))
    return lon - dlon, lat - dlat, lon + dlon, lat + dlat


if __name__ == "__main__":
    want = set(sys.argv[1:])
    for k, (lat, lon) in GEO.items():
        if want and k not in want:
            continue
        out = os.path.join(HERE, "osm", k + ".osm")
        if os.path.exists(out):
            continue
        b = bbox(lat, lon)
        url = "https://api.openstreetmap.org/api/0.6/map?bbox=%.6f,%.6f,%.6f,%.6f" % b
        req = urllib.request.Request(url, headers={"User-Agent": "huambo-game-dev/1.0"})
        for attempt in range(3):
            try:
                data = urllib.request.urlopen(req, timeout=90).read()
                open(out, "wb").write(data)
                print(k, len(data) // 1024, "KB", flush=True)
                break
            except Exception as e:
                print(k, "erro", e, flush=True)
                time.sleep(5)
        time.sleep(1.5)
