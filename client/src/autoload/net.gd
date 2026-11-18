extends Node
## Camada de rede do jogo: traduz mensagens Colyseus em sinais de jogo.
## As cenas só falam com o Net — nunca com o WebSocket diretamente.

signal welcomed(welcome: Dictionary)
signal entities_spawned(entries: Array)
signal entities_despawned(ids: Array)
signal snapshot_received(server_time: int, flat: Array)
signal notice(code: int, text: String)
signal disconnected(reason: String)
signal latency_updated(rtt_ms: int)
signal self_updated(me: Dictionary)
signal toast(text: String, ok: bool)

const ROOM_DISTRICT := "district"

var room: ColyseusRoom
var self_id := -1
## Modelo do mundo visto pelo cliente: id -> {name, pos: Vector2, appearance, t}.
## Mantido aqui para que a cena do mundo possa ser criada depois das primeiras mensagens.
var entities: Dictionary = {}
var last_error := ""
## O meu estado de vida (dinheiro, necessidades, emprego…) enviado pelo servidor.
var me: Dictionary = {}
var welcome: Dictionary = {}
var rtt_ms := 0

var _client := ColyseusClient.new()
var _ping_timer := Timer.new()


func _ready() -> void:
	_client.name = "ColyseusClient"
	add_child(_client)
	_ping_timer.wait_time = 2.0
	_ping_timer.timeout.connect(func() -> void: if room: room.ping())
	add_child(_ping_timer)


func is_connected_to_world() -> bool:
	return room != null and room.is_joined()


## Entra num bairro. Devolve "" em caso de sucesso, ou a mensagem de erro.
func join_district(district: String) -> String:
	await Auth.ensure_fresh_token()
	leave()
	_client.endpoint = AppConfig.server_url
	_client.auth_token = Auth.access_token
	var res: ColyseusClient.JoinResult = await _client.join_or_create(ROOM_DISTRICT, {
		"v": Protocol.PROTOCOL_VERSION,
		"district": district,
	})
	if res.room == null:
		return _humanize(res.code, res.error)
	room = res.room
	room.message.connect(_on_message)
	room.left.connect(_on_left)
	room.error.connect(func(code: int, text: String) -> void: notice.emit(code, text))
	room.pong.connect(func(ms: int) -> void:
		rtt_ms = ms
		latency_updated.emit(ms))
	_ping_timer.start()
	return ""


func leave() -> void:
	_ping_timer.stop()
	if room:
		room.leave()
		room.queue_free()
		room = null
	self_id = -1
	welcome = {}
	me = {}
	entities.clear()


## Pede uma ação de vida ao servidor (o servidor decide).
func action(a: String, item: String = "") -> void:
	if room:
		var msg := {"a": a}
		if item != "":
			msg["i"] = item
		room.send(Protocol.C2S_ACTION, msg)


func move_to(world_pos: Vector2) -> void:
	if room:
		room.send(Protocol.C2S_MOVE_TO, {"x": roundi(world_pos.x), "y": roundi(world_pos.y)})


func _on_message(type: Variant, payload: Variant) -> void:
	match type:
		Protocol.S2C_WELCOME:
			if typeof(payload) != TYPE_DICTIONARY:
				return
			welcome = payload
			self_id = int(payload.get("selfId", -1))
			welcomed.emit(welcome)
		Protocol.S2C_SPAWN:
			if typeof(payload) != TYPE_ARRAY:
				return
			var valid: Array = []
			for e: Variant in payload:
				if typeof(e) == TYPE_ARRAY and e.size() >= 5:
					entities[int(e[0])] = {"name": str(e[1]), "pos": Vector2(e[2], e[3]), "appearance": e[4] if typeof(e[4]) == TYPE_DICTIONARY else {}}
					valid.append(e)
			entities_spawned.emit(valid)
		Protocol.S2C_DESPAWN:
			if typeof(payload) != TYPE_ARRAY:
				return
			for id: Variant in payload:
				entities.erase(int(id))
			entities_despawned.emit(payload)
		Protocol.S2C_SNAPSHOT:
			if typeof(payload) != TYPE_DICTIONARY or typeof(payload.get("e")) != TYPE_ARRAY:
				return
			var flat: Array = payload.e
			for i in range(0, flat.size() - 2, 3):
				var ent: Variant = entities.get(int(flat[i]))
				if ent != null:
					ent.pos = Vector2(flat[i + 1], flat[i + 2])
			snapshot_received.emit(int(payload.get("t", 0)), flat)
		Protocol.S2C_SELF:
			if typeof(payload) == TYPE_DICTIONARY:
				me = payload
				self_updated.emit(me)
		Protocol.S2C_TOAST:
			if typeof(payload) == TYPE_DICTIONARY:
				toast.emit(str(payload.get("t", "")), bool(payload.get("ok", true)))
		Protocol.S2C_NOTICE:
			if typeof(payload) == TYPE_DICTIONARY:
				notice.emit(int(payload.get("code", 0)), str(payload.get("msg", "")))


func _on_left(code: int, reason: String) -> void:
	_ping_timer.stop()
	if room:
		room.queue_free()
	room = null
	entities.clear()
	last_error = _humanize(code, reason)
	disconnected.emit(last_error)


func _humanize(code: int, text: String) -> String:
	match code:
		401, 525: return "Sessão inválida. Entra de novo."
		Protocol.ERR_PROTOCOL_MISMATCH: return "Versão do jogo desatualizada. Atualiza a aplicação."
		Protocol.ERR_INVALID_DISTRICT: return "Bairro desconhecido."
		Protocol.ERR_DUPLICATE_SESSION: return "A tua conta entrou noutro dispositivo."
		Protocol.ERR_SERVER_SHUTDOWN: return "O servidor está a reiniciar."
	return text if text != "" else "Ligação perdida."
