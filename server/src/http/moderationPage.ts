/**
 * Página do painel de moderação (servida em /moderacao). Sem dependências externas.
 * Tudo o que vem dos jogadores entra na página como texto (textContent), nunca como HTML.
 */
export const MODERATION_PAGE = `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Moderação · Huambo É A Banda</title>
<style>
  :root { --bg:#1b130f; --card:#2a1e19; --btn:#3d2c24; --stroke:rgba(255,219,168,.12); --text:#f7efe2; --muted:#d6c6b4; --faint:#a6927f;
          --gold:#f2b632; --ink:#2a1a0c; --terra:#c4492d; --verde:#2f8f62; --jac:#7d5cc4; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { padding:18px 16px; border-bottom:4px solid var(--gold); background:#21170f; }
  header h1 { margin:0; font-size:20px; color:var(--gold); }
  header p { margin:4px 0 0; color:var(--faint); font-size:13px; }
  main { max-width:900px; margin:0 auto; padding:16px; }
  .card { background:var(--card); border:1px solid var(--stroke); border-radius:16px; padding:14px 16px; margin:0 0 12px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  button, select, input { font:inherit; border-radius:12px; border:0; padding:9px 14px; }
  input, select { background:var(--btn); color:var(--text); border:1px solid var(--stroke); }
  button { background:var(--btn); color:var(--text); cursor:pointer; border-bottom:3px solid rgba(0,0,0,.35); }
  button.gold { background:var(--gold); color:var(--ink); }
  button.terra { background:var(--terra); }
  button.verde { background:var(--verde); }
  button:active { border-bottom-width:0; margin-top:3px; }
  .tabs button.on { background:var(--gold); color:var(--ink); }
  .who { font-weight:700; }
  .meta { color:var(--faint); font-size:13px; }
  .falas { margin:8px 0; padding:8px 12px; border-left:3px solid var(--jac); background:rgba(125,92,196,.08); border-radius:8px; color:var(--muted); font-size:14px; }
  .falas div { margin:2px 0; }
  .empty { color:var(--faint); text-align:center; padding:24px; }
  #msg { min-height:20px; color:var(--gold); margin:8px 0; }
  .hidden { display:none; }
</style>
</head>
<body>
<header>
  <h1>Moderação · Huambo É A Banda</h1>
  <p>Denúncias dos jogadores, silenciar e banir. A chave fica só nesta janela do browser.</p>
</header>
<main>
  <section id="login" class="card">
    <p>Chave do painel (a variável ADMIN_TOKEN do servidor):</p>
    <div class="row"><input id="key" type="password" autocomplete="off" style="flex:1;min-width:220px"><button class="gold" id="enter">Entrar</button></div>
  </section>
  <section id="app" class="hidden">
    <div class="row tabs" style="margin-bottom:12px">
      <button data-tab="novo" class="on">Novas</button><button data-tab="visto">Vistas</button><button data-tab="resolvido">Resolvidas</button><button data-tab="castigos">Castigos em vigor</button>
      <span style="flex:1"></span><button id="refresh">Atualizar</button><button id="logout">Sair</button>
    </div>
    <div id="msg"></div>
    <div id="list"></div>
  </section>
</main>
<script>
(function () {
  var key = sessionStorage.getItem("hb-mod") || "";
  var tab = "novo";
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
  function when(ms) { var d = new Date(ms); return d.toLocaleString("pt-PT", { timeZone: "Africa/Luanda", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  function say(t) { $("msg").textContent = t; }
  function api(path, body) {
    return fetch("/mod/api" + path, { method: body ? "POST" : "GET", headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ("erro " + r.status)); return j; }); });
  }
  function show(logged) { $("login").classList.toggle("hidden", logged); $("app").classList.toggle("hidden", !logged); }
  function sanctionRow(card, characterId, name, reportId) {
    var r = el("div", "row");
    var sel = el("select");
    [["1", "1 hora"], ["24", "1 dia"], ["168", "1 semana"], ["720", "30 dias"], ["-1", "Para sempre"]].forEach(function (o) { var op = el("option", null, o[1]); op.value = o[0]; sel.appendChild(op); });
    sel.value = "24";
    var reason = el("input"); reason.placeholder = "Motivo (o jogador vê)"; reason.maxLength = 200; reason.style.flex = "1"; reason.style.minWidth = "160px";
    var mute = el("button", "gold", "Silenciar");
    var ban = el("button", "terra", "Banir");
    function apply(kind) {
      var h = Number(sel.value);
      var body = { characterId: characterId, name: name || "", muteHours: kind === "mute" ? h : 0, banHours: kind === "ban" ? h : 0, reason: reason.value || "" };
      if (reportId) body.reportId = reportId;
      if (kind === "ban" && !confirm("Banir " + (name || "esta pessoa") + "? Sai já do jogo e não volta a entrar durante esse tempo.")) return;
      api("/castigos", body).then(function () { say("Feito: " + (kind === "ban" ? "banido/a" : "silenciado/a") + " " + (name || "")); load(); }).catch(function (e) { say(e.message); });
    }
    mute.onclick = function () { apply("mute"); };
    ban.onclick = function () { apply("ban"); };
    r.appendChild(sel); r.appendChild(reason); r.appendChild(mute); r.appendChild(ban);
    card.appendChild(r);
  }
  function renderReports(list) {
    var box = $("list"); box.textContent = "";
    if (!list.length) { box.appendChild(el("div", "empty", "Nada por aqui.")); return; }
    list.forEach(function (d) {
      var c = el("div", "card");
      var top = el("div", "row");
      top.appendChild(el("span", "who", d.reportedName || d.reported));
      top.appendChild(el("span", "meta", "denunciado/a por " + (d.reporterName || d.reporter) + " · " + d.bairro + " · " + when(d.at)));
      c.appendChild(top);
      c.appendChild(el("div", null, "Motivo: " + d.reason));
      var f = el("div", "falas");
      if (!d.context || !d.context.length) f.appendChild(el("div", null, "(sem falas registadas)"));
      (d.context || []).forEach(function (t) { f.appendChild(el("div", null, "«" + t + "»")); });
      c.appendChild(f);
      sanctionRow(c, d.reported, d.reportedName, d.id);
      var r2 = el("div", "row"); r2.style.marginTop = "8px";
      if (d.status !== "visto") { var b1 = el("button", null, "Marcar como vista"); b1.onclick = function () { api("/denuncias/" + d.id, { status: "visto" }).then(load).catch(function (e) { say(e.message); }); }; r2.appendChild(b1); }
      if (d.status !== "resolvido") { var b2 = el("button", "verde", "Resolvida sem castigo"); b2.onclick = function () { api("/denuncias/" + d.id, { status: "resolvido" }).then(load).catch(function (e) { say(e.message); }); }; r2.appendChild(b2); }
      c.appendChild(r2);
      box.appendChild(c);
    });
  }
  function renderSanctions(list) {
    var box = $("list"); box.textContent = "";
    if (!list.length) { box.appendChild(el("div", "empty", "Ninguém está castigado.")); return; }
    var now = Date.now();
    list.forEach(function (s) {
      var c = el("div", "card");
      c.appendChild(el("div", "who", s.name || s.characterId));
      var parts = [];
      if (s.muteUntil > now) parts.push("silenciado/a até " + when(s.muteUntil));
      if (s.banUntil > now) parts.push("banido/a até " + when(s.banUntil));
      c.appendChild(el("div", "meta", parts.join(" · ") + (s.reason ? " · motivo: " + s.reason : "")));
      var r = el("div", "row"); r.style.marginTop = "8px";
      var lift = el("button", "verde", "Levantar o castigo");
      lift.onclick = function () { api("/castigos", { characterId: s.characterId, name: s.name, muteHours: 0, banHours: 0, reason: "levantado" }).then(function () { say("Castigo levantado: " + (s.name || "")); load(); }).catch(function (e) { say(e.message); }); };
      r.appendChild(lift); c.appendChild(r);
      box.appendChild(c);
    });
  }
  function load() {
    say("");
    var p = tab === "castigos" ? api("/castigos").then(function (j) { renderSanctions(j.castigos); }) : api("/denuncias?status=" + tab).then(function (j) { renderReports(j.denuncias); });
    return p.catch(function (e) { if (/chave/.test(e.message)) { sessionStorage.removeItem("hb-mod"); key = ""; show(false); } say(e.message); });
  }
  $("enter").onclick = function () { key = $("key").value.trim(); api("/castigos").then(function () { sessionStorage.setItem("hb-mod", key); show(true); load(); }).catch(function (e) { say(""); alert(e.message); }); };
  $("key").onkeydown = function (e) { if (e.key === "Enter") $("enter").onclick(); };
  $("refresh").onclick = load;
  $("logout").onclick = function () { sessionStorage.removeItem("hb-mod"); key = ""; show(false); };
  Array.prototype.forEach.call(document.querySelectorAll(".tabs [data-tab]"), function (b) {
    b.onclick = function () { tab = b.getAttribute("data-tab"); Array.prototype.forEach.call(document.querySelectorAll(".tabs [data-tab]"), function (x) { x.classList.toggle("on", x === b); }); load(); };
  });
  if (key) { show(true); load(); }
})();
</script>
</body>
</html>`;
