extends Node
## Autenticação: convidado (token emitido pelo servidor de jogo) ou conta
## Supabase (email + palavra-passe via API REST do Supabase Auth).
##
## O token de acesso vai no cabeçalho Authorization do matchmaking; o servidor
## verifica a assinatura. O cliente nunca vê a chave secreta do Supabase.

signal signed_in(display_name: String)
signal signed_out()

var access_token := ""
var refresh_token := ""
var display_name := ""
var user_id := ""
var is_guest := false
var _expires_at := 0
var _anonymous := false
const SESSION_FILE := "user://sessao.cfg"


func is_signed_in() -> bool:
	return not access_token.is_empty()


func supabase_enabled() -> bool:
	return AppConfig.supabase_url != "" and AppConfig.supabase_key != ""


## Entra como convidado. Devolve "" em caso de sucesso, ou a mensagem de erro.
func sign_in_guest(requested_name: String) -> String:
	var res := await _post_json(AppConfig.server_url + "/auth/guest", {"name": requested_name}, [])
	if res.status != 200:
		return _error_text(res, "Não foi possível entrar como convidado")
	_set_session(res.data.get("token", ""), "", int(res.data.get("expiresIn", 3600)))
	user_id = str(res.data.get("userId", ""))
	display_name = str(res.data.get("name", requested_name))
	is_guest = true
	signed_in.emit(display_name)
	return ""


## «Jogar já» com progresso guardado: conta anónima do Supabase (sem email), que fica neste aparelho.
## Se o projeto não permitir contas anónimas, entra como convidado do servidor (progresso não fica guardado).
func sign_in_quick(requested_name: String) -> String:
	if supabase_enabled():
		var res := await _post_json(AppConfig.supabase_url + "/auth/v1/signup",
			{"data": {"display_name": requested_name}}, _supabase_headers())
		if res.status == 200 and res.data.has("access_token"):
			return _apply_supabase_session(res, "")
	return await sign_in_guest(requested_name)


## Volta a entrar com a sessão guardada neste aparelho (sem pedir email outra vez).
func resume() -> bool:
	if not supabase_enabled():
		return false
	var cfg := ConfigFile.new()
	if cfg.load(SESSION_FILE) != OK:
		return false
	var rt := str(cfg.get_value("sessao", "refresh_token", ""))
	if rt == "":
		return false
	var res := await _post_json(AppConfig.supabase_url + "/auth/v1/token?grant_type=refresh_token",
		{"refresh_token": rt}, _supabase_headers())
	if _apply_supabase_session(res, "") != "":
		if res.status == 400 or res.status == 401:
			DirAccess.remove_absolute(SESSION_FILE) # sessão revogada ou caducada
		return false
	return true


## Conta anónima → conta com email (o progresso continua o mesmo).
func is_anonymous() -> bool:
	return _anonymous


func sign_in_email(email: String, password: String) -> String:
	if not supabase_enabled():
		return "Supabase não configurado (config/client.cfg)"
	var res := await _post_json(AppConfig.supabase_url + "/auth/v1/token?grant_type=password",
		{"email": email, "password": password}, _supabase_headers())
	return _apply_supabase_session(res, "Email ou palavra-passe inválidos")


func sign_up_email(email: String, password: String, wanted_name: String) -> String:
	if not supabase_enabled():
		return "Supabase não configurado (config/client.cfg)"
	var res := await _post_json(AppConfig.supabase_url + "/auth/v1/signup",
		{"email": email, "password": password, "data": {"display_name": wanted_name}}, _supabase_headers())
	if res.status == 200 and not res.data.has("access_token"):
		return "Conta criada. Confirma o email antes de entrar."
	return _apply_supabase_session(res, "Não foi possível criar a conta")


## Renova o token de acesso (contas Supabase) antes de expirar.
func ensure_fresh_token() -> void:
	if is_guest or refresh_token.is_empty():
		return
	if Time.get_unix_time_from_system() < _expires_at - 60:
		return
	var res := await _post_json(AppConfig.supabase_url + "/auth/v1/token?grant_type=refresh_token",
		{"refresh_token": refresh_token}, _supabase_headers())
	_apply_supabase_session(res, "")


func sign_out() -> void:
	DirAccess.remove_absolute(SESSION_FILE)
	access_token = ""
	refresh_token = ""
	display_name = ""
	user_id = ""
	is_guest = false
	signed_out.emit()


# ------------------------------------------------------------------ internos

func _apply_supabase_session(res: Dictionary, fallback: String) -> String:
	if res.status != 200 or not res.data.has("access_token"):
		return _error_text(res, fallback)
	_set_session(res.data.access_token, res.data.get("refresh_token", ""), int(res.data.get("expires_in", 3600)))
	var user: Dictionary = res.data.get("user", {})
	user_id = str(user.get("id", ""))
	display_name = str(user.get("user_metadata", {}).get("display_name", user.get("email", "")))
	_anonymous = bool(user.get("is_anonymous", false))
	is_guest = false
	# guarda a sessão neste aparelho (no Web fica no armazenamento do browser)
	var cfg := ConfigFile.new()
	cfg.set_value("sessao", "refresh_token", refresh_token)
	cfg.set_value("sessao", "nome", display_name)
	cfg.save(SESSION_FILE)
	signed_in.emit(display_name)
	return ""


func _set_session(token: String, refresh: String, expires_in: int) -> void:
	access_token = token
	refresh_token = refresh
	_expires_at = int(Time.get_unix_time_from_system()) + expires_in


func _supabase_headers() -> PackedStringArray:
	return PackedStringArray(["apikey: " + AppConfig.supabase_key])


func _error_text(res: Dictionary, fallback: String) -> String:
	if res.status == 429:
		return "Demasiadas tentativas. Espera um pouco."
	if res.status == 0:
		return "Sem ligação ao servidor."
	var d: Dictionary = res.data
	return str(d.get("msg", d.get("error_description", d.get("error", fallback))))


func _post_json(url: String, body: Dictionary, extra_headers: PackedStringArray) -> Dictionary:
	var http := HTTPRequest.new()
	http.timeout = 10.0
	add_child(http)
	var headers := PackedStringArray(["Content-Type: application/json"])
	headers.append_array(extra_headers)
	var err := http.request(url, headers, HTTPClient.METHOD_POST, JSON.stringify(body))
	if err != OK:
		http.queue_free()
		return {"status": 0, "data": {}}
	var r: Array = await http.request_completed
	http.queue_free()
	if r[0] != HTTPRequest.RESULT_SUCCESS:
		return {"status": 0, "data": {}}
	var data: Variant = JSON.parse_string((r[3] as PackedByteArray).get_string_from_utf8())
	return {"status": r[1], "data": data if typeof(data) == TYPE_DICTIONARY else {}}
