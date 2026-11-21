#!/usr/bin/env bash
# Gera o APK de Android do Huambo É A Banda (assinado para publicar).
#
#   KEYSTORE=/caminho/huambo-release.keystore KEYSTORE_PASSWORD=… tools/android/build_apk.sh
#
# Precisa de: Godot 4.6.2 (GODOT=…), modelos de exportação Android, Android SDK com build-tools
# (editor settings: export/android/android_sdk_path) e Java 17+.
# A chave NUNCA vai para o repositório: guarda-a em segurança. Todas as atualizações da app
# têm de ser assinadas com a mesma chave (o Android e a Play Store recusam outra).
# Antes de cada nova versão, sobe version/code (e version/name) no preset «Android» de client/export_presets.cfg.
set -euo pipefail
cd "$(dirname "$0")/../../client"
: "${GODOT:=godot}"
: "${KEYSTORE:?indica o caminho da keystore em KEYSTORE}"
: "${KEYSTORE_PASSWORD:?indica a palavra-passe em KEYSTORE_PASSWORD}"
mkdir -p build/android
"$GODOT" --headless --path . --import >/dev/null 2>&1 || true
GODOT_ANDROID_KEYSTORE_RELEASE_PATH="$KEYSTORE" \
GODOT_ANDROID_KEYSTORE_RELEASE_USER="${KEYSTORE_ALIAS:-huambo}" \
GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD="$KEYSTORE_PASSWORD" \
  "$GODOT" --headless --path . --export-release "Android" build/android/huambo-e-a-banda.apk
ls -lh build/android/huambo-e-a-banda.apk
