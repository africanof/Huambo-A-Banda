#!/usr/bin/env python3
"""
Gera arte 2D HD com o modelo de imagem da OpenAI a partir de specs JSON.

    python3 tools/art/ai/generate.py specs/teste.json [--only id1,id2] [--force]

A chave NÃO está neste código: o proxy do ambiente injeta-a nos pedidos para api.openai.com.
Fora deste ambiente, define OPENAI_API_KEY.
Cada imagem fica em tools/art/ai/raw/<id>.png com o prompt usado ao lado (.json), para ser reprodutível.
"""
import base64, json, os, sys, time, urllib.request, concurrent.futures as cf

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
API = "https://api.openai.com/v1/images/generations"
API_EDIT = "https://api.openai.com/v1/images/edits"
KEY = os.environ.get("OPENAI_API_KEY", "proxy-injected")

STYLE = json.load(open(os.path.join(HERE, "style.json")))


def build_prompt(spec):
    kind = spec.get("kind", "object")
    if kind == "texture":
        # texturas: só o pedido + regras de textura (sem câmara isométrica nem cena da cidade)
        return "\n".join([spec["prompt"], STYLE["texture"], "Absolutely no buildings, no people, no vehicles, no city, no perspective: only the material surface seen straight from above, filling the whole image."])
    parts = [STYLE["base"], STYLE.get(kind, ""), spec["prompt"], STYLE["huambo"], STYLE["negative"]]
    return "\n".join(p for p in parts if p)


def generate(spec, force=False):
    out = os.path.join(RAW, spec["id"] + ".png")
    # REGRA DO PROJETO (CLAUDE.md): só arte baseada em imagens reais e atuais do Huambo.
    if not spec.get("refs"):
        return spec["id"], "RECUSADO: sem fotografias de referência reais do Huambo (campo refs)"
    if os.path.exists(out) and not force:
        return spec["id"], "em cache"
    body = {
        "model": spec.get("model", STYLE["model"]),
        "prompt": build_prompt(spec),
        "size": spec.get("size", "1024x1024"),
        "quality": spec.get("quality", "high"),
        "background": spec.get("background", "transparent"),
        "output_format": "png",
        "n": 1,
    }
    if spec.get("refs"):
        # edição com imagens de referência (mantém a identidade da personagem)
        boundary = "----huambo" + str(time.time_ns())
        chunks = []
        for k, v in body.items():
            if k == "n":
                continue
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for ref in spec["refs"]:
            path = os.path.join(RAW, ref + ".png")
            if not os.path.exists(path):
                path = os.path.join(HERE, "refs", ref)
            chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="{ref}.png"\r\nContent-Type: image/png\r\n\r\n'.encode()
                          + open(path, "rb").read() + b"\r\n")
        chunks.append(f"--{boundary}--\r\n".encode())
        req = urllib.request.Request(API_EDIT, data=b"".join(chunks), method="POST",
                                     headers={"Authorization": f"Bearer {KEY}", "Content-Type": f"multipart/form-data; boundary={boundary}"})
    else:
        req = urllib.request.Request(API, data=json.dumps(body).encode(), method="POST",
                                     headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    t0 = time.time()
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.load(r)
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:400]
            if e.code in (429, 500, 502, 503) and attempt < 2:
                time.sleep(10 * (attempt + 1)); continue
            return spec["id"], f"ERRO {e.code}: {msg}"
    img = base64.b64decode(data["data"][0]["b64_json"])
    os.makedirs(RAW, exist_ok=True)
    open(out, "wb").write(img)
    json.dump({"spec": spec, "request": {k: v for k, v in body.items()}, "usage": data.get("usage")},
              open(out[:-4] + ".json", "w"), ensure_ascii=False, indent=1)
    return spec["id"], f"ok {time.time()-t0:.0f}s usage={data.get('usage')}"


if __name__ == "__main__":
    specs = json.load(open(sys.argv[1]))
    only = None
    for a in sys.argv[2:]:
        if a.startswith("--only"):
            only = set(a.split("=", 1)[1].split(","))
    force = "--force" in sys.argv
    todo = [s for s in specs if not only or s["id"] in only]
    with cf.ThreadPoolExecutor(max_workers=4) as ex:
        for sid, status in ex.map(lambda s: generate(s, force), todo):
            print(f"{sid}: {status}", flush=True)
