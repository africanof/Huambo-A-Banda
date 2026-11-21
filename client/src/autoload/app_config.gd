extends Node
## Configuração em camadas: ficheiro do projeto → ficheiro do utilizador → argumentos/URL.

var server_url := "http://127.0.0.1:2567"
## Servidor publicado (a app de Android/iOS liga-se sempre a este, nunca ao servidor local)
var public_url := "https://huambo-a-banda.onrender.com"
var default_district := "cidade_baixa"
var supabase_url := ""
var supabase_key := ""
var args := {} ## argumentos --chave=valor passados depois de "--"


func _ready() -> void:
	_load_file("res://config/client.cfg")
	_load_file("user://client.cfg")
	_load_args()
	_load_web_query()
	# app instalada (APK): sem argumentos, vai para o servidor publicado
	if OS.has_feature("mobile") and not OS.has_feature("web") and not args.has("server"):
		server_url = public_url
	server_url = server_url.rstrip("/")


func has_flag(flag: String) -> bool:
	return args.has(flag)


func _load_file(path: String) -> void:
	var cfg := ConfigFile.new()
	if cfg.load(path) != OK:
		return
	server_url = cfg.get_value("server", "url", server_url)
	default_district = cfg.get_value("server", "default_district", default_district)
	supabase_url = cfg.get_value("supabase", "url", supabase_url)
	supabase_key = cfg.get_value("supabase", "publishable_key", supabase_key)
	public_url = cfg.get_value("server", "public_url", public_url)


func _load_args() -> void:
	for a in OS.get_cmdline_user_args():
		if not a.begins_with("--"):
			continue
		var kv := a.substr(2).split("=", true, 1)
		args[kv[0]] = kv[1] if kv.size() > 1 else "true"
	server_url = args.get("server", server_url)
	default_district = args.get("district", default_district)
	supabase_url = args.get("supabase-url", supabase_url)
	supabase_key = args.get("supabase-key", supabase_key)


func _load_web_query() -> void:
	if not OS.has_feature("web"):
		return
	# parâmetros da URL (?autotest=1&name=…) funcionam como os argumentos --chave=valor
	var qs: Variant = JavaScriptBridge.eval("JSON.stringify(Object.fromEntries(new URLSearchParams(window.location.search)))", true)
	if typeof(qs) == TYPE_STRING:
		var d: Variant = JSON.parse_string(qs)
		if typeof(d) == TYPE_DICTIONARY:
			for k: String in d:
				if k != "server" and str(k).length() < 32:
					args[k] = str(d[k]) if str(d[k]) != "" else "true"
	var q: Variant = JavaScriptBridge.eval("new URLSearchParams(window.location.search).get('server') || ''", true)
	if typeof(q) == TYPE_STRING and (q as String).begins_with("http"):
		server_url = q
		return
	# Jogo online: o servidor está no mesmo endereço que a página (ex.: https://1-2-3-4.sslip.io).
	var origin: Variant = JavaScriptBridge.eval("window.location.protocol.startsWith('http') ? window.location.origin : ''", true)
	if typeof(origin) == TYPE_STRING and (origin as String).begins_with("http"):
		server_url = origin
