#!/usr/bin/env bash
# Instalação/atualização dentro da máquina (corre como root, no arranque, pelo Google).
# Idempotente: pode correr várias vezes. Registos: journalctl -u google-startup-scripts
set -euo pipefail
export HOME=/root
exec > >(tee -a /var/log/huambo-instalar.log) 2>&1
echo "=== Huambo É A Banda — instalação $(date -Is) ==="

meta() { curl -fsS -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1" 2>/dev/null || true; }
HOST="$(meta huambo-host)"
BRANCH="$(meta huambo-branch)"; BRANCH="${BRANCH:-ccr-6c9fbaa9-2cpgti}"
REPO="https://github.com/africanof/Huambo-A-Banda.git"
APP=/opt/huambo
GODOT_VER=4.6.2
[[ -n "$HOST" ]] || { echo "falta o metadado huambo-host"; exit 1; }

# 1 GB de RAM: memória de troca para compilar e exportar
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

export DEBIAN_FRONTEND=noninteractive
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg git unzip python3 debian-keyring debian-archive-keyring apt-transport-https libfontconfig1
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
id huambo >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin huambo

# código
if [[ -d "$APP/repo/.git" ]]; then
  git -C "$APP/repo" fetch --depth 1 origin "$BRANCH" && git -C "$APP/repo" reset --hard FETCH_HEAD
else
  mkdir -p "$APP" && git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP/repo"
fi

# servidor de jogo
cd "$APP/repo/server"
npm ci --no-audit --no-fund
npm run build
npm prune --omit=dev

# configuração (o segredo dos convidados é gerado uma vez e mantido)
mkdir -p /etc/huambo
if [[ ! -f /etc/huambo/server.env ]]; then
  cat > /etc/huambo/server.env <<ENV
NODE_ENV=production
PORT=2567
LOG_LEVEL=info
ALLOW_GUESTS=true
GUEST_TOKEN_SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '/+=\n')
GUEST_RATE_PER_MIN=10
TRUSTED_IP_HEADER=x-forwarded-for
CORS_ORIGINS=https://$HOST
SUPABASE_URL=https://arhepspapnncsxkfvszt.supabase.co
# Para gravar contas reais no Supabase, cola aqui a chave secreta (sb_secret_...) e reinicia:
#   sudo nano /etc/huambo/server.env && sudo systemctl restart huambo-server
# SUPABASE_SERVICE_ROLE_KEY=
ENV
  chmod 600 /etc/huambo/server.env
fi

cat > /etc/systemd/system/huambo-server.service <<UNIT
[Unit]
Description=Huambo É A Banda — servidor de jogo
After=network-online.target
Wants=network-online.target

[Service]
User=huambo
WorkingDirectory=$APP/repo/server
EnvironmentFile=/etc/huambo/server.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=3
MemoryMax=600M
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

# jogo Web: exporta com o Godot (só o modelo Web é descarregado, ~10 MB)
GODOT_DIR="$APP/godot"
mkdir -p "$GODOT_DIR"
if [[ ! -x "$GODOT_DIR/godot" ]]; then
  curl -fsSL -o /tmp/godot.zip "https://github.com/godotengine/godot/releases/download/${GODOT_VER}-stable/Godot_v${GODOT_VER}-stable_linux.x86_64.zip"
  unzip -o -q /tmp/godot.zip -d "$GODOT_DIR" && mv "$GODOT_DIR/Godot_v${GODOT_VER}-stable_linux.x86_64" "$GODOT_DIR/godot" && rm /tmp/godot.zip
fi
TPL="/root/.local/share/godot/export_templates/${GODOT_VER}.stable"
if [[ ! -f "$TPL/web_nothreads_release.zip" ]]; then
  python3 "$APP/repo/tools/deploy/range_unzip.py" \
    "https://github.com/godotengine/godot/releases/download/${GODOT_VER}-stable/Godot_v${GODOT_VER}-stable_export_templates.tpz" \
    "$TPL" templates/version.txt templates/web_nothreads_release.zip
fi
cd "$APP/repo/client"
"$GODOT_DIR/godot" --headless --path . --import >/dev/null 2>&1 || true
rm -rf "$APP/repo/build/online" && mkdir -p "$APP/repo/build/online"
"$GODOT_DIR/godot" --headless --path . --export-release "Web Online" ../build/online/index.html
mkdir -p ../build/online/packs
for k in $(ls assets/kits 2>/dev/null); do "$GODOT_DIR/godot" --headless --path . --export-pack "Pack $k" "../build/online/packs/$k.pck"; done
test -s "$APP/repo/build/online/index.wasm"
rm -rf "$APP/web" && cp -r "$APP/repo/build/online" "$APP/web"
chown -R huambo:huambo "$APP"

# HTTPS automático (Let's Encrypt) e encaminhamento: jogo Web + servidor no mesmo endereço
cat > /etc/caddy/Caddyfile <<CADDY
$HOST {
	encode gzip zstd
	@ws header Connection *Upgrade*
	@api path /matchmake/* /auth/* /me/* /health /stats /jornal /ricos /districts /districts/* /packs/*
	handle @ws {
		reverse_proxy 127.0.0.1:2567
	}
	handle @api {
		reverse_proxy 127.0.0.1:2567
	}
	handle {
		root * $APP/web
		header /index.html Cache-Control "no-cache"
		header *.wasm Cache-Control "public, max-age=3600"
		header *.pck Cache-Control "no-cache"
		file_server
	}
}
CADDY

systemctl daemon-reload
systemctl enable --now huambo-server
systemctl restart huambo-server
systemctl reload caddy || systemctl restart caddy
sleep 3
curl -fsS http://127.0.0.1:2567/health && echo
echo "=== Pronto: https://$HOST ==="
