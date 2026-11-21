// Huambo É A Banda — service worker mínimo: torna o jogo instalável e mostra uma página
// simpática quando não há rede. NÃO guarda o jogo em cache (cada visita traz a versão mais recente).
const OFFLINE = "offline.html";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("hb-offline-v1").then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // tudo o resto vai direto à rede
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
