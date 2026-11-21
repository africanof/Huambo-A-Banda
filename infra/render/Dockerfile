# syntax=docker/dockerfile:1
# Imagem única para o Render (plano grátis): servidor de jogo + jogo Web no mesmo endereço.
# Contexto de build: raiz do repositório.
ARG GODOT_VER=4.6.2

# ---- 1. jogo Web (exportado com o Godot em modo headless)
FROM debian:12-slim AS web
ARG GODOT_VER
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip python3 libfontconfig1 \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL -o /tmp/godot.zip "https://github.com/godotengine/godot/releases/download/${GODOT_VER}-stable/Godot_v${GODOT_VER}-stable_linux.x86_64.zip" \
 && unzip -q /tmp/godot.zip -d /opt && mv "/opt/Godot_v${GODOT_VER}-stable_linux.x86_64" /usr/local/bin/godot && rm /tmp/godot.zip
COPY tools/deploy/range_unzip.py /tmp/range_unzip.py
# só o modelo Web (~10 MB) em vez do pacote completo de modelos (~1 GB)
RUN python3 /tmp/range_unzip.py \
      "https://github.com/godotengine/godot/releases/download/${GODOT_VER}-stable/Godot_v${GODOT_VER}-stable_export_templates.tpz" \
      "/root/.local/share/godot/export_templates/${GODOT_VER}.stable" templates/version.txt templates/web_nothreads_release.zip
COPY client /src/client
WORKDIR /src/client
RUN (godot --headless --path . --import >/dev/null 2>&1 || true) \
 && mkdir -p /web/packs && godot --headless --path . --export-release "Web Online" /web/index.html \
 && test -s /web/index.wasm && test -s /web/index.pck \
 && cp web/manifest.webmanifest web/sw.js web/offline.html web/*.png /web/ \
 && for k in $(ls assets/kits); do godot --headless --path . --export-pack "Pack $k" /web/packs/$k.pck && test -s /web/packs/$k.pck; done

# ---- 2. servidor (TypeScript → JavaScript)
FROM node:22-bookworm-slim AS server
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json server/tsconfig.build.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

# ---- 3. execução
FROM node:22-bookworm-slim
ENV NODE_ENV=production STATIC_DIR=/app/web
WORKDIR /app
COPY --from=server /app/node_modules ./node_modules
COPY --from=server /app/dist ./dist
COPY server/package.json ./
COPY server/data ./data
COPY --from=web /web ./web
USER node
CMD ["node", "dist/index.js"]
