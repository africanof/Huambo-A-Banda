extends Node2D
## Bairro HD em MULTIJOGADOR (Fase A). O servidor é autoritativo:
##   · a minha personagem anda já no ecrã (previsão) e corrige-se pela posição do servidor;
##   · as outras são interpoladas entre snapshots (~2 snapshots no passado);
##   · o servidor trabalha em centímetros; aqui o mundo está em metros.
## Controlos: setas/WASD · clicar/tocar para andar · roda/pinça = zoom.

const UNIT := 100.0 ## cm por metro
const INTERP_SNAPSHOTS := 2.0
const SEND_INTERVAL_MS := 100

var view := BairroView.new()
var canvas_mod := CanvasModulate.new()
var camera := Camera2D.new()
var hud: GameHud
var avatars: Dictionary = {} ## eid -> DemoCharacter
var buffers: Dictionary = {} ## eid -> Array[[t_servidor, Vector2 m]]
var local_char: DemoCharacter
var speed_m := 1.5
var snapshot_hz := 10
var _clock_offset := 0.0
var _clock_ready := false
var _last_dir := Vector2i.ZERO
var _last_send_ms := -100000
var _click_target: Variant = null


func _ready() -> void:
	RenderingServer.set_default_clear_color(Color("2a2a2e"))
	var w := Net.welcome
	var map_id := str(w.get("district", {}).get("map", {}).get("id", "bairro:cidade_baixa"))
	add_child(view)
	if not view.build(map_id.trim_prefix("bairro:")):
		get_tree().change_scene_to_file("res://src/ui/login_screen.tscn")
		return
	add_child(canvas_mod)
	speed_m = float(w.get("speed", 150)) / UNIT
	snapshot_hz = int(w.get("snapshotHz", 10))
	hud = GameHud.new()
	hud.place_text = str(w.get("district", {}).get("name", ""))
	hud.catalog = w.get("catalog", {}) if typeof(w.get("catalog")) == TYPE_DICTIONARY else {}
	add_child(hud)
	hud.ui_action.connect(_on_hud_action)
	camera.zoom = Vector2(0.5, 0.5)
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = 6.0
	add_child(camera)
	Net.entities_spawned.connect(_on_spawned)
	Net.entities_despawned.connect(_on_despawned)
	Net.snapshot_received.connect(_on_snapshot)
	Net.disconnected.connect(func(_r: String) -> void: get_tree().change_scene_to_file("res://src/ui/login_screen.tscn"))
	for id: int in Net.entities:
		var e: Dictionary = Net.entities[id]
		_spawn(id, e.name, e.pos, e.appearance)


# ------------------------------------------------------------------ entidades

func _spawn(id: int, display_name: String, pos_cm: Vector2, appearance: Dictionary) -> void:
	if avatars.has(id):
		return
	var c := DemoCharacter.new()
	c.cid = "mulher" if int(appearance.get("model", 0)) == 1 else "homem"
	c.world_pos = pos_cm / UNIT
	view.objects.add_child(c)
	c.tag.text = display_name
	var top := int(appearance.get("top", -1))
	c.set_top_hue(null if top < 0 else top / 360.0)
	c.position = Iso.to_screen(c.world_pos)
	avatars[id] = c
	buffers[id] = []
	if id == Net.self_id:
		local_char = c
		c.fixed_speed = speed_m
		c.obstacles = view.obstacles
		c.bounds = Rect2(Vector2.ZERO, view.size)
		camera.position = c.position + Vector2(0, -70)
		camera.reset_smoothing()


func _on_spawned(entries: Array) -> void:
	for e: Array in entries:
		_spawn(int(e[0]), str(e[1]), Vector2(e[2], e[3]), e[4])


func _on_despawned(ids: Array) -> void:
	for id: Variant in ids:
		var c: DemoCharacter = avatars.get(int(id))
		if c and c != local_char:
			c.queue_free()
			avatars.erase(int(id))
			buffers.erase(int(id))


func _on_snapshot(server_time: int, flat: Array) -> void:
	var sample := float(server_time) - Time.get_ticks_msec()
	if not _clock_ready:
		_clock_offset = sample
		_clock_ready = true
	else:
		_clock_offset = lerpf(_clock_offset, sample, 0.5 if sample > _clock_offset else 0.05)
	var interval := 1000.0 / snapshot_hz
	for i in range(0, flat.size() - 2, 3):
		var id := int(flat[i])
		if not buffers.has(id) or id == Net.self_id:
			continue
		var buf: Array = buffers[id]
		var p := Vector2(flat[i + 1], flat[i + 2]) / UNIT
		if buf.is_empty() and avatars.has(id):
			buf.append([server_time - interval, (avatars[id] as DemoCharacter).world_pos])
		elif not buf.is_empty() and server_time - buf[-1][0] > interval * 1.5:
			buf.append([server_time - interval, buf[-1][1]])
		buf.append([server_time, p])
		if buf.size() > 20:
			buffers[id] = buf.slice(buf.size() - 20)


# ------------------------------------------------------------------ ciclo

func _process(delta: float) -> void:
	_update_local(delta)
	_update_remotes(delta)
	if local_char:
		camera.position = local_char.position + Vector2(0, -70)
		hud.set_context(view.place_near(local_char.world_pos))
		view.update_occlusion(local_char.position, delta)
	var now := Time.get_datetime_dict_from_unix_time(int(Time.get_unix_time_from_system()) + 3600) # hora de Angola (UTC+1)
	var minutes := float(now.hour * 60 + now.minute) + float(now.second) / 60.0
	view.apply_hour(minutes / 60.0, canvas_mod)
	hud.set_clock(minutes)
	view.scale_labels(camera.zoom.x, avatars.values().map(func(c: DemoCharacter) -> Control: return c.tag))


func _keyboard_dir() -> Vector2:
	var dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if Input.is_physical_key_pressed(KEY_A): dir.x -= 1
	if Input.is_physical_key_pressed(KEY_D): dir.x += 1
	if Input.is_physical_key_pressed(KEY_W): dir.y -= 1
	if Input.is_physical_key_pressed(KEY_S): dir.y += 1
	return dir


func _update_local(delta: float) -> void:
	if local_char == null:
		return
	var kdir := Iso.screen_dir_to_world(_keyboard_dir())
	if hud.is_busy():
		kdir = Vector2.ZERO # ocupado(a): não anda (andar interromperia a ação no servidor)
		_click_target = null
	var wdir := kdir
	if kdir != Vector2.ZERO:
		_click_target = null
	elif _click_target != null:
		var to: Vector2 = _click_target - local_char.world_pos
		wdir = Vector2.ZERO if to.length() < 0.1 else to.normalized()
		if wdir == Vector2.ZERO:
			_click_target = null
	# teclado/joystick: direção para o servidor (inteiros −100..100), enviada só quando muda.
	# (o clique já enviou MOVE_TO; não o sobrepomos com direções)
	var q := Vector2i(roundi(kdir.x * 100), roundi(kdir.y * 100))
	if _click_target == null and q != _last_dir and Time.get_ticks_msec() - _last_send_ms >= SEND_INTERVAL_MS:
		_last_dir = q
		_last_send_ms = Time.get_ticks_msec()
		if Net.room and q == Vector2i.ZERO:
			Net.room.send(Protocol.C2S_STOP)
		elif Net.room:
			Net.room.send(Protocol.C2S_MOVE_DIR, {"x": q.x, "y": q.y})
	var before := local_char.world_pos
	local_char.step(wdir, delta)
	if _click_target != null and local_char.world_pos.distance_to(before) < 0.0005:
		_click_target = null
	# reconciliação com a posição autoritativa
	var me: Variant = Net.entities.get(Net.self_id)
	if me != null:
		var server_m: Vector2 = (me.pos as Vector2) / UNIT
		var err := server_m.distance_to(local_char.world_pos)
		if wdir == Vector2.ZERO:
			local_char.world_pos = local_char.world_pos.lerp(server_m, minf(1.0, delta * 6.0))
		elif err > speed_m * 0.6 + 0.4:
			local_char.world_pos = local_char.world_pos.lerp(server_m, 0.25)
		local_char.position = Iso.to_screen(local_char.world_pos)


func _update_remotes(delta: float) -> void:
	if not _clock_ready:
		return
	var render_time := Time.get_ticks_msec() + _clock_offset - INTERP_SNAPSHOTS * 1000.0 / snapshot_hz
	for id: int in avatars:
		if id == Net.self_id:
			continue
		var buf: Array = buffers[id]
		if buf.is_empty():
			continue
		while buf.size() >= 2 and buf[1][0] <= render_time:
			buf.pop_front()
		var target: Vector2 = buf[0][1]
		if buf.size() >= 2 and buf[0][0] <= render_time:
			var span: float = maxf(1.0, buf[1][0] - buf[0][0])
			target = (buf[0][1] as Vector2).lerp(buf[1][1], clampf((render_time - buf[0][0]) / span, 0.0, 1.0))
		(avatars[id] as DemoCharacter).drive(target, delta)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		match event.button_index:
			MOUSE_BUTTON_LEFT:
				request_move(Iso.to_world(get_global_mouse_position()))
			MOUSE_BUTTON_WHEEL_UP:
				_zoom(1.12)
			MOUSE_BUTTON_WHEEL_DOWN:
				_zoom(1 / 1.12)
	elif event is InputEventMagnifyGesture:
		_zoom(event.factor)
	elif event is InputEventKey and event.pressed and event.physical_keycode == KEY_E:
		_on_hud_action("entrar")


## Andar até um ponto (metros). O servidor valida o destino; a personagem segue-o localmente.
func request_move(target_m: Vector2) -> void:
	if local_char == null or hud.is_busy():
		return
	_click_target = target_m
	if Net.room:
		Net.room.send(Protocol.C2S_MOVE_TO, {"x": roundi(target_m.x * UNIT), "y": roundi(target_m.y * UNIT)})
	_last_dir = Vector2i.ZERO


func _zoom(f: float) -> void:
	var z := clampf(camera.zoom.x * f, 0.22, 1.6)
	camera.zoom = Vector2(z, z)


func _on_hud_action(what: String) -> void:
	match what:
		"zoom_mais": _zoom(1.25)
		"zoom_menos": _zoom(0.8)
		"sair":
			Net.leave()
			get_tree().change_scene_to_file("res://src/ui/login_screen.tscn")
		"entrar":
			var p := view.place_near(local_char.world_pos) if local_char else {}
			if not p.is_empty() and p.kind == "home":
				DemoState.return_scene = "res://src/game/bairro_world.tscn"
				get_tree().change_scene_to_file("res://src/demo/casa_interior.tscn")
