#!/usr/bin/env bash
# Cria o servidor do Huambo É A Banda no Google Cloud (e2-micro, nível gratuito).
# Corre no Cloud Shell (https://console.cloud.google.com → ícone >_ no canto superior direito):
#
#   curl -fsSL https://raw.githubusercontent.com/africanof/Huambo-A-Banda/ccr-6c9fbaa9-2cpgti/infra/gcp/criar-servidor.sh | bash
#
# O que faz: ativa a API do Compute Engine, reserva um IP fixo, abre as portas 80/443,
# cria a máquina e instala tudo (servidor de jogo + jogo Web + HTTPS automático).
set -euo pipefail

REPO_BRANCH="${REPO_BRANCH:-ccr-6c9fbaa9-2cpgti}"
ZONE="${ZONE:-us-east1-b}"          # zonas com e2-micro gratuito: us-west1, us-central1, us-east1
REGION="${ZONE%-*}"
VM="${VM:-huambo-jogo}"
PROJECT="$(gcloud config get-value project 2>/dev/null || true)"

if [[ -z "$PROJECT" || "$PROJECT" == "(unset)" ]]; then
  echo "Escolhe primeiro um projeto: gcloud config set project ID_DO_PROJETO"; exit 1
fi
echo "→ Projeto: $PROJECT · zona: $ZONE"

gcloud services enable compute.googleapis.com --quiet

if ! gcloud compute addresses describe "$VM-ip" --region "$REGION" >/dev/null 2>&1; then
  gcloud compute addresses create "$VM-ip" --region "$REGION" --quiet
fi
IP="$(gcloud compute addresses describe "$VM-ip" --region "$REGION" --format='value(address)')"
HOST="${IP//./-}.sslip.io"
echo "→ IP fixo: $IP · endereço do jogo: https://$HOST"

if ! gcloud compute firewall-rules describe huambo-web >/dev/null 2>&1; then
  gcloud compute firewall-rules create huambo-web --allow tcp:80,tcp:443 --target-tags huambo-web --quiet
fi

if ! gcloud compute instances describe "$VM" --zone "$ZONE" >/dev/null 2>&1; then
  curl -fsSL "https://raw.githubusercontent.com/africanof/Huambo-A-Banda/$REPO_BRANCH/infra/gcp/instalar.sh" -o /tmp/huambo-instalar.sh
  gcloud compute instances create "$VM" \
    --zone "$ZONE" --machine-type e2-micro \
    --image-family debian-12 --image-project debian-cloud \
    --boot-disk-size 30GB --boot-disk-type pd-standard \
    --address "$IP" --tags huambo-web \
    --metadata "huambo-host=$HOST,huambo-branch=$REPO_BRANCH" \
    --metadata-from-file startup-script=/tmp/huambo-instalar.sh \
    --quiet
else
  echo "→ A máquina já existe: a reinstalar a versão mais recente."
  gcloud compute ssh "$VM" --zone "$ZONE" --quiet --command "sudo google_metadata_script_runner startup"
fi

cat <<MSG

✅ Máquina criada. A instalação continua sozinha dentro dela (~15–25 minutos na primeira vez).
   Para acompanhar:  gcloud compute ssh $VM --zone $ZONE --command 'sudo journalctl -u google-startup-scripts -f'

   Quando terminar, o jogo fica em:   https://$HOST
   Estado do servidor:                 https://$HOST/health
MSG
