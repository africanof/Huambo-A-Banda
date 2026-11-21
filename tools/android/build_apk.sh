#!/usr/bin/env bash
# Gera a app de Android do Huambo É A Banda, assinada para publicar:
#   - APK  (instalar diretamente no telemóvel)
#   - AAB  (Android App Bundle, o formato que a Google Play Store pede)
#
#   KEYSTORE=/caminho/huambo-release.keystore KEYSTORE_PASSWORD=… tools/android/build_apk.sh        # os dois
#   FORMATO=apk … tools/android/build_apk.sh                                                       # só o APK
#
# O AAB compila com o Gradle: precisa no SDK de platforms;android-35 e build-tools;35.0.1, e de
# acesso à rede (Maven Central, Google Maven) na primeira vez. O modelo de compilação Android do
# Godot (client/android/) instala-se sozinho e não vai para o repositório.
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
FORMATO="${FORMATO:-ambos}"
mkdir -p build/android
"$GODOT" --headless --path . --import >/dev/null 2>&1 || true
export GODOT_ANDROID_KEYSTORE_RELEASE_PATH="$KEYSTORE"
export GODOT_ANDROID_KEYSTORE_RELEASE_USER="${KEYSTORE_ALIAS:-huambo}"
export GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD="$KEYSTORE_PASSWORD"
if [ "$FORMATO" != "aab" ]; then
  "$GODOT" --headless --path . --export-release "Android" build/android/huambo-e-a-banda.apk
fi
if [ "$FORMATO" != "apk" ]; then
  install=""
  [ -d android/build ] || install="--install-android-build-template"
  "$GODOT" --headless --path . $install --export-release "Android AAB" build/android/huambo-e-a-banda.aab
fi
ls -lh build/android/
