extends Node2D
## Cena principal do bairro: cria as personagens, trata o clique/toque para andar
## e liga a rede às personagens.

const CharacterScene := preload("res://src/world/character.tscn")
const INTERP_SNAPSHOTS := 2.0 ## remotas renderizadas ~2 snapshots no passado
const MIN_SEND_INTERVAL_MS := 120 ## limite de pedidos de movimento (anti-flood)

@onready var ground: Node2D = $Ground
@onready var entities_root: Node2D = $Entities
@onready var camera: Camera2D = $Camera2D
@onready var marker: Node2D = $TargetMarker
@onready var hud_label: Label = $HUD/Panel/Info
@onready var leave_button: Button = $HUD/Panel/Leave

var map: Movement.MapData
var characters: Dictionary = {} ## eid -> Character
var local_char: Character
var snapshot_hz := 10
var _clock_offset := 0.0 ## tempo_servidor ≈ ticks_locais + offset
var _clock_ready := false
var _last_send_ms := -100000
var _pending_target: Variant = null


func _ready() -> void:
	Net.welcomed.connect(_on_welcome)
	Net.entities_spawned.connect(_on_spawned)
	Net.entities_despawned.connect(_on_despawned)
	Net.snapshot_received.connect(_on_snapshot)
	Net.disconnected.connect(_on_disconnected)
	Net.latency_updated.connect(func(_ms: int) -> void: _refresh_hud())
	leave_button.pressed.connect(_on_leave_pressed)
	marker.visible = false
	if not Net.welcome.is_empty():
		_on_welcome(Net.welcome)
		for id: int in Net.entities:
			var e: Dictionary = Net.entities[id]
			_spawn(id, e.name, e.pos, e.appearance)


func _on_welcome(welcome: Dictionary) -> void:
	map = Movement.MapData.from_welcome(welcome.get("district", {}))
	snapshot_hz = int(welcome.get("snapshotHz", 10))
	ground.set_map(map)
	camera.limit_left = 0
	camera.limit_top = 0
	camera.limit_right = int(map.width)
	camera.limit_bottom = int(map.height)
	_refresh_hud()


func _on_spawned(entries: Array) -> void:
	for e: Array in entries:
		_spawn(int(e[0]), str(e[1]), Vector2(e[2], e[3]), e[4])


func _spawn(id: int, display_name: String, pos: Vector2, appearance: Dictionary) -> void:
	if characters.has(id) or map == null:
		return
	var c: Character = CharacterScene.instantiate()
	c.setup(id, display_name, appearance, pos, id == Net.self_id, map, snapshot_hz)
	entities_root.add_child(c)
	characters[id] = c
	if c.is_local:
		local_char = c
		camera.position = pos
		camera.reset_smoothing()
	_refresh_hud()


func _on_despawned(ids: Array) -> void:
	for id: Variant in ids:
		var c: Character = characters.get(int(id))
		if c:
			characters.erase(int(id))
			c.queue_free()
	_refresh_hud()


func _on_snapshot(server_time: int, flat: Array) -> void:
	var sample := float(server_time) - Time.get_ticks_msec()
	if not _clock_ready:
		_clock_offset = sample
		_clock_ready = true
	else:
		# Suaviza o jitter; adianta-se rápido se o servidor parecer "à frente".
		_clock_offset = lerpf(_clock_offset, sample, 0.5 if sample > _clock_offset else 0.05)
	for i in range(0, flat.size() - 2, 3):
		var c: Character = characters.get(int(flat[i]))
		if c:
			c.on_server_position(server_time, Vector2(flat[i + 1], flat[i + 2]))


func _process(_delta: float) -> void:
	if _clock_ready:
		var render_time := Time.get_ticks_msec() + _clock_offset - INTERP_SNAPSHOTS * 1000.0 / snapshot_hz
		for c: Character in characters.values():
			if not c.is_local:
				c.update_remote(render_time)
	if local_char:
		camera.position = local_char.position
		if marker.visible and local_char.position.distance_to(marker.position) < 4.0:
			marker.visible = false
	if _pending_target != null and Time.get_ticks_msec() - _last_send_ms >= MIN_SEND_INTERVAL_MS:
		_send_move(_pending_target)


func _unhandled_input(event: InputEvent) -> void:
	# Toque em ecrãs táteis chega como clique (emulate_mouse_from_touch).
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		request_move(get_global_mouse_position())
		get_viewport().set_input_as_handled()


## Pedido de movimento (também usado pelo autoteste).
func request_move(world_pos: Vector2) -> void:
	if map == null or local_char == null:
		return
	var target: Variant = Movement.sanitize_target(map, world_pos.x, world_pos.y)
	if target == null:
		return
	local_char.predict_move_to(target)
	marker.position = target
	marker.visible = true
	_pending_target = target


func _send_move(target: Vector2) -> void:
	_pending_target = null
	_last_send_ms = Time.get_ticks_msec()
	Net.move_to(target)


func _refresh_hud() -> void:
	var district_name: String = Net.welcome.get("district", {}).get("name", "?")
	hud_label.text = "%s  ·  %d por perto  ·  %d ms" % [district_name, characters.size(), Net.rtt_ms]


func _on_leave_pressed() -> void:
	Net.leave()
	get_tree().change_scene_to_file("res://src/ui/login_screen.tscn")


func _on_disconnected(_reason: String) -> void:
	get_tree().change_scene_to_file("res://src/ui/login_screen.tscn")
