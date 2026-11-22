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
var _path: Array[Vector2] = [] ## pontos seguintes (metros) depois de _click_target


func _ready() -> void:
	RenderingServer.set_default_clear_color(Color("2a2a2e"))
	var w := Net.welcome
	var map_id := str(w.get("district", {}).get("map", {}).get("id", "bairro:cidade_baixa"))
	_bairro_id = map_id.trim_prefix("bairro:")
	_rot_user = _load_rot()
	Iso.rot = _rot_user
	add_child(view)
	if not view.build(map_id.trim_prefix("bairro:")):
		get_tree().change_scene_to_file("res://src/ui/login_screen.tscn")
		return
	add_child(canvas_mod)
	_attach_marker()
	moradores = Moradores.new()
	add_child(moradores)
	moradores.setup(self, view, _find_path)
	speed_m = float(w.get("speed", 450)) / UNIT
	snapshot_hz = int(w.get("snapshotHz", 10))
	hud = GameHud.new()
	hud.layer = 2 # a chuva (camada 1) cai por cima do bairro e por baixo dos botões
	hud.place_text = str(w.get("district", {}).get("name", ""))
	hud.catalog = w.get("catalog", {}) if typeof(w.get("catalog")) == TYPE_DICTIONARY else {}
	add_child(hud)
	hud.ui_action.connect(_on_hud_action)
	# minimapa no canto (como no Vida na Banda): tocar abre-o; no grande, tocar leva-te lá
	minimap.view = view
	minimap.anchor_top = 1.0
	minimap.anchor_bottom = 1.0
	_minimap_small()
	minimap.go_to.connect(_on_minimap)
	hud.add_child(minimap)
	add_child(decor)
	if not AppConfig.has_flag("autotest") and not GameHud.guide_seen() and not _lottery_pending():
		hud.show_guide.call_deferred()
	# telemóvel na vertical: mais perto, a personagem fica bem visível
	var z0 := 0.68 if get_viewport().get_visible_rect().size.x < 700.0 else 0.5
	camera.zoom = Vector2(z0, z0)
	_set_street_limits()
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = 6.0
	_marker = DestMarker.new()
	# no chão: fica logo antes das pessoas e edifícios na ordem do mapa (por cima do chão e das ruas)
	_marker.visible = false
	_attach_marker()
	add_child(camera)
	var fl := CanvasLayer.new()
	fl.layer = 40
	add_child(fl)
	_fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fade.color = Color(0, 0, 0, 0)
	fl.add_child(_fade)
	Net.entities_spawned.connect(_on_spawned)
	Net.entities_despawned.connect(_on_despawned)
	Net.snapshot_received.connect(_on_snapshot)
	Net.disconnected.connect(func(_r: String) -> void:
		if not _travelling:
			get_tree().change_scene_to_file("res://src/ui/login_screen.tscn"))
	Net.self_updated.connect(_on_self)
	# falar e gestos: balão por cima de quem falou / anima quem fez o gesto
	Net.chat_received.connect(func(id: int, who: String, text: String) -> void:
		if id < 0: # mensagem do grupo (vem de qualquer bairro)
			hud.show_toast("%s: %s" % [who, text], true)
			return
		var c: DemoCharacter = avatars.get(id)
		if c:
			c.say(text))
	Net.radio_received.connect(func(who: String, text: String) -> void: hud.on_radio(who, text))
	Net.sms_received.connect(func(who: String, text: String) -> void: hud.on_sms(who, text))
	Net.appearance_changed.connect(func(id: int, a: Dictionary) -> void:
		var c: DemoCharacter = avatars.get(id)
		if c:
			var top := int(a.get("top", -1))
			c.set_top_hue(null if top < 0 else top / 360.0)
			var ent: Variant = Net.entities.get(id)
			if ent != null and str(ent.name) != "":
				c.tag.text = str(ent.name)
			if id == Net.self_id:
				hud.set_portrait(c.body.sprite_frames.get_frame_texture("idle_down", 0) if c.body.sprite_frames else null))
	Net.emote_received.connect(func(id: int, e: String) -> void:
		var c: DemoCharacter = avatars.get(id)
		if c:
			c.play_emote(e))
	Net.self_updated.connect(func(_m: Dictionary) -> void: _update_parked_car())
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
		hud.set_portrait(c.body.sprite_frames.get_frame_texture("idle_down", 0) if c.body.sprite_frames else null)


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
		if _follow:
			# a câmara segue com suavidade e olha um pouco para onde a personagem vai
			var want_lead := local_char.screen_dir * 55.0 if local_char.is_moving() else Vector2.ZERO
			_lead = _lead.lerp(want_lead, clampf(delta * 2.5, 0.0, 1.0))
			camera.position = local_char.position + Vector2(0, -70) + _lead
			if _room_center != Vector2.INF:
				camera.position = _room_center # lá dentro: a sala inteira fica no ecrã
		hud.set_context(view.place_near(local_char.world_pos))
		minimap.me = local_char.world_pos
		if decor.is_active():
			decor.update(local_char.world_pos, delta)
		# chegou à estação tocada: abre logo o que se faz ali (como no Vida na Banda)
		if _pending_station != "" and str(hud._context.get("id", "")) == _pending_station:
			# chegou (ou parou já ao alcance): faz logo a ação — entrar, comer, dormir…
			var pc: Dictionary = hud._context
			var close := local_char.world_pos.distance_to(Vector2(pc.at[0], pc.at[1])) < float(pc.radius) * 0.6
			if close or (_click_target == null and _path.is_empty()):
				_pending_station = ""
				hud.use_context()
		elif _pending_station != "" and _click_target == null and _path.is_empty() and not _pending_place.is_empty():
			# caminho longo (as rotas vão aos pedaços): parou a meio, continua até ao sítio
			var keep := _pending_place
			var dist := local_char.world_pos.distance_to(Vector2(keep.at[0], keep.at[1]))
			# só conta como tentativa falhada se não se aproximou desde a última vez
			if dist < _pending_best - 0.5:
				_pending_best = dist
				_pending_tries = 0
			else:
				_pending_tries += 1
			if _pending_tries >= 2 and Net.room:
				# não avança localmente: pede ao servidor que leve a personagem (a posição dele corrige a nossa)
				Net.room.send(Protocol.C2S_MOVE_TO, {"x": roundi(float(keep.at[0]) * UNIT), "y": roundi(float(keep.at[1]) * UNIT)})
			if _pending_tries > 4:
				_pending_station = ""
				hud.show_toast("Não consegui chegar a %s. Tenta aproximar-te mais." % str(keep.get("name", "esse sítio")), false)
			else:
				request_move(Vector2(keep.at[0], keep.at[1]))
				_pending_station = str(keep.id)
		minimap.visible = mode3d == "" and _room_center == Vector2.INF and not hud.phone.visible and not hud.menu_panel.visible
		if mode3d != "" and view3d:
			var room := view.interior_at(local_char.world_pos)
			view3d.room_bounds = Rect2() if room.is_empty() else Rect2(room.rect[0], room.rect[1], room.rect[2], room.rect[3])
			var people := avatars.duplicate()
			if moradores:
				people.merge(moradores.characters())
			view3d.sync_people(people, Net.self_id)
			view3d.follow(local_char.last_dir if local_char.is_moving() else Vector2.ZERO, delta)
			view3d.update_camera(local_char.world_pos, delta)
		view.update_occlusion(local_char.position, delta, local_char.world_pos)
		_update_inside()
	var now := Time.get_datetime_dict_from_unix_time(int(Time.get_unix_time_from_system()) + 3600) # hora de Angola (UTC+1)
	var minutes := float(now.hour * 60 + now.minute) + float(now.second) / 60.0
	var night := view.apply_hour(minutes / 60.0, canvas_mod)
	if moradores:
		moradores.night = clampf(night, 0.0, 1.0)
		var tw: Variant = Net.me.get("tempo")
		moradores.raining = typeof(tw) == TYPE_DICTIONARY and str(tw.ceu) in ["chuva", "trovoada"]
		moradores.players = maxi(0, avatars.size() - 1)
	if _inside_id != "" and _inside_id != "?":
		canvas_mod.color = Color(1.0, 0.97, 0.92) # dentro dos edifícios há luz acesa, de dia ou de noite
	if view3d and mode3d != "":
		view3d.set_light(canvas_mod.color, night, _inside_id != "" and _inside_id != "?")
	hud.set_clock(minutes)
	_update_sound(minutes)
	view.scale_labels(camera.zoom.x, avatars.values().map(func(c: DemoCharacter) -> Control: return c.tag))


var _travelling := false
var _marker: DestMarker
var moradores: Moradores


var _marker_layer: CanvasLayer


## O marcador fica numa camada própria que acompanha o mapa (não escurece à noite e vê-se sempre).
func _attach_marker() -> void:
	if _marker == null:
		return
	if _marker_layer == null:
		_marker_layer = CanvasLayer.new()
		_marker_layer.layer = 1
		_marker_layer.follow_viewport_enabled = true
		add_child(_marker_layer)
	if _marker.get_parent() != _marker_layer:
		if _marker.get_parent():
			_marker.get_parent().remove_child(_marker)
		_marker_layer.add_child(_marker)
	_marker.queue_redraw()
## antecipação da câmara: olha um pouco para onde a personagem vai (px do ecrã)
var _lead := Vector2.ZERO


## Música e ambiente conforme a hora, a chuva e o sítio (rua ou dentro).
func _update_sound(minutes: float) -> void:
	var h := minutes / 60.0
	var is_night := h >= 19.0 or h < 6.0
	var inside := _inside_id != "" and _inside_id != "?"
	Som.music("noite" if is_night else "planalto")
	var w: Variant = Net.me.get("tempo")
	var raining: bool = typeof(w) == TYPE_DICTIONARY and str(w.ceu) in ["chuva", "trovoada"]
	if inside or mode3d == "car" or _travelling:
		Som.ambient("")
	elif raining:
		Som.ambient("chuva")
	else:
		Som.ambient("grilos" if is_night else "passaros")


## O servidor cobrou o candongueiro: muda de sala (bairro) e recarrega o mundo.
static var _birth_shown := false


var _rain: CPUParticles2D
var _rain_layer: CanvasLayer


## Chuva na rua (época das chuvas): gotas a cair por cima do bairro, por baixo dos botões.
## Lá dentro (interiores) e nas vistas 3D não chove.
func _update_rain(me: Dictionary) -> void:
	var w: Variant = me.get("tempo")
	var raining: bool = typeof(w) == TYPE_DICTIONARY and str(w.ceu) in ["chuva", "trovoada"] and _room_center == Vector2.INF and mode3d == "" and Definicoes.effects
	if raining and _rain == null:
		_rain_layer = CanvasLayer.new()
		_rain_layer.layer = 1
		add_child(_rain_layer)
		_rain = CPUParticles2D.new()
		_rain.amount = 260
		_rain.lifetime = 0.9
		_rain.preprocess = 1.0
		_rain.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
		var vs := get_viewport().get_visible_rect().size
		_rain.position = Vector2(vs.x / 2.0, -20)
		_rain.emission_rect_extents = Vector2(vs.x * 0.7, 10)
		_rain.direction = Vector2(-0.18, 1)
		_rain.spread = 2.0
		_rain.gravity = Vector2(0, 900)
		_rain.initial_velocity_min = 700
		_rain.initial_velocity_max = 900
		_rain.scale_amount_min = 1.0
		_rain.scale_amount_max = 1.6
		var g := GradientTexture2D.new()
		g.width = 2
		g.height = 18
		g.fill_to = Vector2(0, 1)
		var gr := Gradient.new()
		gr.set_color(0, Color(1, 1, 1, 0.0))
		gr.set_color(1, Color(1, 1, 1, 0.8))
		g.gradient = gr
		_rain.texture = g
		_rain.color = Color(0.85, 0.9, 1.0, 0.7)
		_rain_layer.add_child(_rain)
		var dim := ColorRect.new()
		dim.color = Color(0.1, 0.12, 0.18, 0.18)
		dim.set_anchors_preset(Control.PRESET_FULL_RECT)
		dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_rain_layer.add_child(dim)
	elif not raining and _rain != null:
		_rain_layer.queue_free()
		_rain = null
		_rain_layer = null


var _invite_sent := false


func _on_self(me: Dictionary) -> void:
	_update_rain(me)
	# entrou pela ligação de convite (?convite=CÓDIGO): usa-o uma vez, sozinho
	if not _invite_sent and AppConfig.args.has("convite") and typeof(me.get("convite")) == TYPE_DICTIONARY and bool(me.convite.get("podeUsar", false)):
		_invite_sent = true
		Net.action_text("convite_usar", str(AppConfig.args.convite))
	var b: Variant = me.get("birth")
	if typeof(b) == TYPE_DICTIONARY and bool(b.get("nova", false)) and not _birth_shown:
		# 🎲 a lotaria da vida: primeiro a revelação, depois a ida para o bairro onde cresceu
		_birth_shown = true
		_lottery_open = true
		var lot := BirthLottery.new()
		lot.birth = b
		add_child(lot)
		await lot.done
		_lottery_open = false
		_show_guide_later = true
		if not AppConfig.has_flag("autotest") and not GameHud.guide_seen():
			hud.show_guide()
		_on_self(Net.me)
		return
	if _lottery_open:
		return
	var t: Variant = me.get("travel")
	if _travelling or typeof(t) != TYPE_DICTIONARY:
		return
	if bool(t.get("birth", false)):
		# o autoteste de vida joga no bairro onde entrou (lugares conhecidos), salvo se pedir a lotaria
		if AppConfig.has_flag("autotest") and not AppConfig.has_flag("lotaria"):
			return
		_travelling = true
		hud.show_toast("A caminho de casa…", true)
		var e1: String = await Packs.ensure_bairro(str(t.district))
		if e1 == "":
			e1 = await Net.join_district(str(t.district))
		if e1 != "":
			_travelling = false
			hud.show_toast(e1, false)
			return
		if Net.welcome.is_empty():
			await Net.welcomed
		get_tree().change_scene_to_file("res://src/game/bairro_world.tscn")
		return
	_travelling = true
	var on_foot := bool(t.get("onFoot", false))
	if on_foot:
		hud.show_toast("A caminhar para o bairro vizinho…", true)
	var trip: TravelView = null
	if not on_foot:
		# viagem vista de dentro do veículo (como no Vida na Banda), enquanto o bairro descarrega
		trip = TravelView.new()
		trip.by = str(t.get("by", "candongueiro"))
		trip.seconds = float(t.get("seconds", 9))
		trip.dest_name = _district_name(str(t.district))
		hud.add_child(trip)
		var layer := CanvasLayer.new()
		layer.layer = 60
		add_child(layer)
		trip.reparent(layer)
	var err: String = await Packs.ensure_bairro(str(t.district))
	if trip and err == "" and not trip._done:
		await trip.finished
	if err == "":
		# a pé: aparece no fim da rua que vem do bairro de onde saiu
		err = await Net.join_district(str(t.district), ("from_" + str(t.get("from", ""))) if on_foot else "")
	if err != "":
		# a viagem falhou (sem rede, pacote estragado…): fecha a vista da viagem e avisa
		print("[viagem] falhou: ", err)
		_travelling = false
		if trip:
			trip.get_parent().queue_free()
		hud.show_toast(err + " Tenta outra vez.", false)
		return
	if Net.welcome.is_empty():
		await Net.welcomed
	get_tree().change_scene_to_file("res://src/game/bairro_world.tscn")


var _bairro_id := ""
var _lottery_open := false
static var _show_guide_later := false
var minimap := Minimap.new()
var decor := InteriorDecor.new()
var _pending_station := ""
var _pending_place: Dictionary = {}
var _pending_tries := 0
var _pending_best := INF


func _lottery_pending() -> bool:
	var b: Variant = Net.me.get("birth")
	return typeof(b) == TYPE_DICTIONARY and bool(b.get("nova", false)) and not _birth_shown


func _minimap_small() -> void:
	minimap.big = false
	minimap.anchor_left = 0.0
	minimap.anchor_right = 0.0
	minimap.anchor_top = 1.0
	minimap.anchor_bottom = 1.0
	# canto de baixo à esquerda, por cima da barra (não tapa os botões da direita)
	minimap.offset_left = 14
	minimap.offset_right = 14 + 140
	minimap.offset_top = -270
	minimap.offset_bottom = -130


func _on_minimap(w: Vector2) -> void:
	if w == Vector2.INF:
		# abre em grande, ocupa quase o ecrã
		minimap.big = true
		minimap.anchor_left = 0.0
		minimap.anchor_right = 1.0
		minimap.anchor_top = 0.0
		minimap.anchor_bottom = 1.0
		minimap.offset_left = 20
		minimap.offset_right = -20
		minimap.offset_top = 130
		minimap.offset_bottom = -130
		return
	_minimap_small()
	if Rect2(Vector2.ZERO, view.size).has_point(w):
		request_move(w)

var _car_sprite: Node2D
var _car_key := ""
const CAR_SPRITES := {"corolla_usado": "f_carro", "hilux": "f_hilux", "jipe": "f_carro2"}


## O meu carro fica estacionado à frente da minha casa neste bairro (tocar → Viajar de carro).
func _update_parked_car() -> void:
	var car: Variant = Net.me.get("car")
	var home_door := Vector2.INF
	for h: Dictionary in Net.me.get("homes", []):
		for i: Dictionary in view.interiors:
			if str(i.id) == str(h.unit):
				for p: Dictionary in view.places:
					if str(p.id) == str(i.get("building", "")):
						home_door = Vector2(p.at[0], p.at[1])
	var key := "%s|%s|%d" % [car, home_door, Iso.rot]
	if key == _car_key:
		return
	_car_key = key
	if _car_sprite:
		_car_sprite.queue_free()
		_car_sprite = null
	view.places = view.places.filter(func(p: Dictionary) -> bool: return str(p.kind) != "car")
	if car == null or home_door == Vector2.INF:
		return
	var at := home_door + Vector2(2.6, 1.4)
	_car_sprite = DemoAssets.make_sprite(CAR_SPRITES.get(str(car), "f_carro"))
	_car_sprite.position = Iso.to_screen(at)
	view.objects.add_child(_car_sprite)
	view.places.append({"id": "car", "kind": "car", "name": "O teu carro", "at": [at.x, at.y], "radius": 2.4})


func _district_name(id: String) -> String:
	for p: Dictionary in view.places:
		if p.kind == "portal" and str(p.get("to", "")) == id:
			return str(p.name).trim_prefix("A pé para ")
	return BairroView.load_data(id).get("name", id)
var view3d: View3D ## vistas 3D (ombro / olhos), criadas só quando são pedidas
var mode3d := "" ## "" = vista aérea isométrica
var _rot_user := 0 ## rotação escolhida pelo jogador (na rua); dentro dos edifícios a vista fica a 0
var _fade := ColorRect.new()
var _rotating := false


## A câmara não sai da cidade desenhada (bairro + casario à volta).
func _set_street_limits() -> void:
	var m := BairroView.MARGIN - 6.0
	var bb := Rect2(Iso.to_screen(Vector2(-m, -m)), Vector2.ZERO)
	for corner: Vector2 in [Vector2(view.size.x + m, -m), Vector2(-m, view.size.y + m), view.size + Vector2(m, m)]:
		bb = bb.expand(Iso.to_screen(corner))
	camera.limit_left = int(bb.position.x)
	camera.limit_right = int(bb.end.x)
	camera.limit_top = int(bb.position.y)
	camera.limit_bottom = int(bb.end.y)
	_street_limits = Rect2i(camera.limit_left, camera.limit_top, camera.limit_right - camera.limit_left, camera.limit_bottom - camera.limit_top)


func _load_rot() -> int:
	var cfg := ConfigFile.new()
	return int(cfg.get_value("vista", "rot", 0)) % 4 if cfg.load("user://vista.cfg") == OK else 0


func _save_rot() -> void:
	var cfg := ConfigFile.new()
	cfg.load("user://vista.cfg")
	cfg.set_value("vista", "rot", _rot_user)
	cfg.save("user://vista.cfg")


## 🔄 Rodar a vista 90° (o mundo e o servidor ficam iguais: só muda a projeção).
func rotate_view() -> void:
	var inside := view.interior_at(local_char.world_pos) if local_char else {}
	# lá dentro, salta os lados da sala que ainda não têm arte
	var step := 1
	if not inside.is_empty():
		while step < 4 and not view.room_has_angle(inside, (_rot_user + step) % 4):
			step += 1
		if step == 4:
			hud.show_toast("Esta sala ainda não tem arte dos outros lados.", false)
			return
	if _rotating:
		return # a rodar: ignora toques repetidos (num telemóvel lento sobrepunham-se)
	_rotating = true
	_rot_user = (_rot_user + step) % 4
	_save_rot()
	await _apply_rot(_rot_user, true)
	_rotating = false


## Reconstrói o bairro com a nova projeção e põe as personagens no novo desenho.
func _apply_rot(r: int, animate: bool) -> void:
	if r == Iso.rot:
		return
	if animate:
		_fade.color = Color(0, 0, 0, 0)
		var tw := create_tween()
		tw.tween_property(_fade, "color:a", 0.85, 0.18)
		await tw.finished
	Iso.rot = r
	var old := view
	view = BairroView.new()
	add_child(view)
	move_child(view, old.get_index())
	view.build(_bairro_id)
	for c: DemoCharacter in avatars.values():
		c.reparent(view.objects, false)
		c.position = Iso.to_screen(c.world_pos)
	_attach_marker()
	if moradores:
		moradores.set_view(view)
	if local_char:
		local_char.obstacles = view.obstacles
	old.queue_free()
	_car_key = ""
	_car_sprite = null
	_update_parked_car()
	var inside := _inside_id
	_inside_id = "?"
	_set_street_limits()
	if inside != "" and inside != "?":
		_inside_id = ""
	if local_char:
		camera.position = local_char.position + Vector2(0, -70)
		camera.reset_smoothing()
	if animate:
		var tw2 := create_tween()
		tw2.tween_property(_fade, "color:a", 0.0, 0.22)
		await tw2.finished
	_fade.color.a = 0.0


var _inside_id := "?"
var _room_center := Vector2.INF
var _street_zoom := 0.0
var _street_limits := Rect2i()


## Dentro de um edifício: limites da sala para andar, câmara presa à sala, fundo escuro.
func _update_inside() -> void:
	var i := view.interior_at(local_char.world_pos)
	var id := str(i.get("id", ""))
	if id == _inside_id:
		return
	var want := _rot_user if i.is_empty() or view.room_has_angle(i, _rot_user) else 0
	if want != Iso.rot:
		_apply_rot(want, false)
		i = view.interior_at(local_char.world_pos)
	_inside_id = id
	_room_center = Vector2.INF
	# ao entrar o destino já foi cumprido; ao sair mantém-se (pode já ter tocado noutro edifício)
	if not i.is_empty() or str(_pending_place.get("interior", "")) != "":
		_pending_station = ""
	Som.play("porta")
	if i.is_empty():
		decor.clear()
		hud.set_inside(false)
	else:
		decor.build(view, i)
		hud.set_inside(true)
	if i.is_empty():
		if _street_zoom > 0.0:
			camera.zoom = Vector2(_street_zoom, _street_zoom)
			_street_zoom = 0.0
		local_char.bounds = Rect2(Vector2.ZERO, view.size)
		camera.limit_left = _street_limits.position.x
		camera.limit_top = _street_limits.position.y
		camera.limit_right = _street_limits.end.x
		camera.limit_bottom = _street_limits.end.y
		RenderingServer.set_default_clear_color(Color("8a5a3c"))
	else:
		var r: Array = i.rect
		var rect := Rect2(r[0], r[1], r[2], r[3])
		local_char.bounds = rect
		# como no Vida na Banda: a sala enche o ecrã (pela largura e pela altura), com espaço para o HUD
		var room_id := str(i.get("room", "interior_sala"))
		var rid := DemoAssets.angle_id(room_id, Iso.rot)
		var flipped := rid == room_id and Iso.rot % 2 == 1 and DemoAssets.mirrorable(room_id)
		var ro := DemoAssets.object(rid)
		var k := float(ro.get("scale", 1.0)) * float(i.get("room_scale", 1.0))
		var room_px := Vector2(ro.size[0], ro.size[1]) * k if not ro.is_empty() else Vector2(900, 700)
		var vs := get_viewport().get_visible_rect().size
		var top_ui := 110.0
		var bottom_ui := 175.0 if vs.x >= 760.0 else 215.0
		var fit := minf((vs.x - 40.0) / room_px.x, (vs.y - top_ui - bottom_ui) / room_px.y)
		if _street_zoom == 0.0:
			_street_zoom = camera.zoom.x
		camera.zoom = Vector2.ONE * clampf(fit, 0.3, 1.4)
		# centro da arte da sala (a âncora é o canto da frente, em baixo), ajustado ao espaço livre do HUD
		var anchor := Vector2(ro.anchor[0], ro.anchor[1]) * k if not ro.is_empty() else room_px
		var dx := room_px.x / 2.0 - anchor.x
		_room_center = Iso.to_screen(Iso.front_corner(rect)) + Vector2(-dx if flipped else dx, room_px.y / 2.0 - anchor.y) + Vector2(0, (bottom_ui - top_ui) / 2.0 / camera.zoom.x)
		var bb := Rect2(Iso.to_screen(rect.position), Vector2.ZERO)
		for c: Vector2 in [Vector2(rect.end.x, rect.position.y), Vector2(rect.position.x, rect.end.y), rect.end]:
			bb = bb.expand(Iso.to_screen(c))
		bb = bb.grow(700)
		camera.limit_left = int(bb.position.x)
		camera.limit_top = int(bb.position.y)
		camera.limit_right = int(bb.end.x)
		camera.limit_bottom = int(bb.end.y)
		RenderingServer.set_default_clear_color(Color("cfc6b4")) # chão claro à volta da sala (como no Vida na Banda)


## Para onde olhar ao entrar em 3D: dentro de uma sala, para o centro dela; na rua, para a
## direção com mais espaço livre (a câmara fica atrás, do lado oposto).
func _best_yaw() -> float:
	var me := local_char.world_pos
	var room := view.interior_at(me)
	if not room.is_empty():
		var c := Rect2(room.rect[0], room.rect[1], room.rect[2], room.rect[3]).get_center()
		var v := c - me
		if v.length() < 0.5:
			v = Vector2(-1, -1)
		return atan2(v.x, v.y)
	var best := 0.0
	var score := -INF
	for i in 16:
		var a := TAU * i / 16.0
		var fwd := Vector2(sin(a), cos(a))
		var sc := view3d._free_distance(me, -fwd, 6.0) * 2.0 + view3d._free_distance(me, fwd, 12.0) + fwd.dot(local_char.last_dir) * 2.0
		if sc > score:
			score = sc
			best = a
	return best


func _set_mode3d(m: String) -> void:
	mode3d = m
	if m == "":
		if view3d:
			view3d.visible = false
		view.visible = true
		hud.show_toast("Vista aérea.", true)
		return
	if view3d == null:
		view3d = View3D.new()
		hud.add_child(view3d)
		hud.move_child(view3d, 0) # por baixo dos botões do HUD
		view3d.build(view)
		view3d.tapped.connect(func(w: Vector2) -> void:
			# tocar no chão nas vistas 3D: anda até lá (uma porta perto do toque faz entrar)
			var st := view.door_at(Iso.to_screen(w))
			if not st.is_empty() and Vector2(st.at[0], st.at[1]).distance_to(w) < 2.5:
				_go_station(st)
			else:
				request_move(w))
		if local_char:
			view3d.yaw = atan2(local_char.last_dir.x, local_char.last_dir.y)
	view3d.mode = m
	if local_char:
		view3d.yaw = _best_yaw()
		view3d.cam.position = Vector3.ZERO
	view3d.visible = true
	view.visible = false
	hud.show_toast("Por cima do ombro: arrasta para olhar, joystick ou WASD para andar." if m == "ombro" else "Pelos olhos (1.ª pessoa).", true)


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
	if mode3d != "" and view3d:
		kdir = view3d.move_dir(_keyboard_dir())
	if hud.is_busy():
		kdir = Vector2.ZERO # ocupado(a): não anda (andar interromperia a ação no servidor)
		_click_target = null
	var wdir := kdir
	if kdir != Vector2.ZERO:
		_click_target = null
		_follow = true
	elif _click_target != null:
		var to: Vector2 = _click_target - local_char.world_pos
		wdir = Vector2.ZERO if to.length() < 0.1 else to.normalized()
		# curvas suaves: perto de um ponto do caminho já começa a virar para o seguinte
		if not _path.is_empty() and to.length() < CORNER_M:
			var nxt0: Vector2 = (_path[0] as Vector2) - local_char.world_pos
			if nxt0.length() > 0.05:
				var k := to.length() / CORNER_M
				wdir = (to.normalized() * k + nxt0.normalized() * (1.0 - k)).normalized()
			if to.length() < 0.22:
				wdir = Vector2.ZERO # passa já ao ponto seguinte (abaixo)
		if wdir == Vector2.ZERO:
			# chegou a este ponto do caminho: segue logo para o próximo (no mesmo fotograma)
			_click_target = _path.pop_front() if not _path.is_empty() else null
			if _click_target != null:
				var nxt: Vector2 = _click_target - local_char.world_pos
				wdir = Vector2.ZERO if nxt.length() < 0.1 else nxt.normalized()
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
	var left := INF
	if kdir == Vector2.ZERO and _click_target != null:
		left = (_click_target as Vector2).distance_to(local_char.world_pos) # não passa do ponto do caminho
	if not _path.is_empty() and kdir == Vector2.ZERO:
		left = INF # nas curvas suaves não trava no ponto do caminho
	local_char.step(wdir, delta, left)
	if _marker and _marker.visible:
		if _click_target == null and _path.is_empty() or kdir != Vector2.ZERO or mode3d != "":
			_marker.clear()
		else:
			var rest: Array[Vector2] = [local_char.world_pos]
			if _click_target != null:
				rest.append(_click_target)
			rest.append_array(_path)
			_marker.path = rest
	if _click_target != null and wdir != Vector2.ZERO and local_char.world_pos.distance_to(before) < 0.0005:
		_click_target = null
		_path.clear()
	# reconciliação com a posição autoritativa
	var me: Variant = Net.entities.get(Net.self_id)
	if me != null:
		var server_m: Vector2 = (me.pos as Vector2) / UNIT
		var err := server_m.distance_to(local_char.world_pos)
		if err > 3.0:
			# teletransporte (entrar/sair de um edifício): salta já para a nova posição
			local_char.world_pos = server_m
			_click_target = null
			_path.clear()
			camera.position = Iso.to_screen(server_m) + Vector2(0, -70)
			camera.reset_smoothing()
		elif wdir == Vector2.ZERO:
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


const CORNER_M := 0.45 ## raio (m) com que a personagem arredonda as esquinas do caminho

## Câmara como no Vida na Banda: tocar = andar; arrastar = olhar à volta (a câmara deixa de
## seguir até a personagem andar ou carregares em «Seguir personagem»); dois dedos = zoom.
var _follow := true
var _press_pos := Vector2.INF
var _dragging := false
var _touches := {}
var _pinch_d := 0.0
const DRAG_PX := 12.0


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed:
			_touches[event.index] = event.position
		else:
			_touches.erase(event.index)
		_pinch_d = 0.0
		return
	if event is InputEventScreenDrag:
		_touches[event.index] = event.position
		if _touches.size() >= 2:
			var pts: Array = _touches.values()
			var d: float = (pts[0] as Vector2).distance_to(pts[1])
			if _pinch_d > 0.0:
				_zoom(d / _pinch_d)
			_pinch_d = d
			_dragging = true # um gesto de dois dedos nunca é um toque para andar
		return
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_press_pos = event.position
			_dragging = false
		else:
			if not _dragging and _press_pos != Vector2.INF and _touches.size() <= 1:
				var st := decor.hit(get_global_mouse_position()) if decor.is_active() else view.door_at(get_global_mouse_position())
				if not st.is_empty():
					_go_station(st)
				else:
					request_move(Iso.to_world(get_global_mouse_position()))
			_press_pos = Vector2.INF
			_dragging = false
		return
	if event is InputEventMouseMotion and _press_pos != Vector2.INF and _touches.size() <= 1:
		if not _dragging and event.position.distance_to(_press_pos) > DRAG_PX:
			_dragging = true
			_follow = false
		if _dragging:
			camera.position -= event.relative / camera.zoom
		return
	if event is InputEventMouseButton and event.pressed:
		match event.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				_zoom(1.12)
			MOUSE_BUTTON_WHEEL_DOWN:
				_zoom(1 / 1.12)
	elif event is InputEventMagnifyGesture:
		_zoom(event.factor)
	elif event is InputEventKey and event.pressed and event.physical_keycode == KEY_E:
		_on_hud_action("entrar")
	elif event is InputEventKey and event.pressed and not event.echo and event.physical_keycode == KEY_R:
		_on_hud_action("rodar")
	elif event is InputEventKey and event.pressed and not event.echo and event.physical_keycode == KEY_V:
		_on_hud_action("vista3d")


## Andar até um ponto (metros). Com caminho (A*) à volta dos edifícios; o servidor valida cada troço.
## Tocar numa estação lá dentro: anda até lá e abre o que se faz ali; a porta faz sair.
func _go_station(p: Dictionary) -> void:
	if str(p.kind) == "exit":
		Net.action("exit")
		return
	var at := Vector2(p.at[0], p.at[1])
	if local_char and local_char.world_pos.distance_to(at) < float(p.radius) * 0.8:
		hud.set_context(p)
		hud.use_context()
		return
	request_move(at)
	_pending_station = str(p.id)
	_pending_place = p
	_pending_tries = 0
	_pending_best = INF


func request_move(target_m: Vector2) -> void:
	if local_char == null or hud.is_busy():
		return
	_pending_station = ""
	_follow = true
	var route := _find_path(local_char.world_pos, target_m)
	if route.size() >= 2 and Net.room:
		route = route.slice(1, mini(route.size(), 24))
		_click_target = route[0]
		_path.assign(route.slice(1))
		if _marker and mode3d == "":
			_marker.show_at(route[-1], route)
		var flat: Array = []
		for p: Vector2 in route:
			flat.append(roundi(p.x * UNIT))
			flat.append(roundi(p.y * UNIT))
		Net.room.send(Protocol.C2S_MOVE_PATH, {"p": flat})
		_last_dir = Vector2i.ZERO
		return
	_path.clear()
	_click_target = target_m
	if _marker and mode3d == "":
		var one: Array[Vector2] = [target_m]
		_marker.show_at(target_m, one)
	if Net.room:
		Net.room.send(Protocol.C2S_MOVE_TO, {"x": roundi(target_m.x * UNIT), "y": roundi(target_m.y * UNIT)})
	_last_dir = Vector2i.ZERO


## A* numa grelha de 0,5 m (obstáculos alargados pelo raio do corpo), depois simplificado por linha de vista.
func _find_path(from: Vector2, to: Vector2) -> Array[Vector2]:
	var out: Array[Vector2] = []
	var bounds := local_char.bounds
	var G := 0.5
	var free := func(p: Vector2) -> bool:
		if not bounds.grow(-0.4).has_point(p):
			return false
		for r: Rect2 in view.obstacles:
			if r.grow(0.42).has_point(p):
				return false
		return true
	if free.call(from) == false:
		# partida encostada a uma parede (ex.: a porta de um edifício): começa no ponto livre mais perto
		for rad: float in [0.5, 1.0, 1.5, 2.0, 3.0]:
			var got := false
			for k in 16:
				var c0: Vector2 = from + Vector2.from_angle(TAU * k / 16.0) * rad
				if free.call(c0):
					from = c0
					got = true
					break
			if got:
				break
	if free.call(to) == false:
		# destino tapado (porta encostada à parede, toque em cima de um edifício): o ponto livre mais perto
		var found := false
		for rad: float in [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]:
			var best := Vector2.INF
			for k in 16:
				var c: Vector2 = to + Vector2.from_angle(TAU * k / 16.0) * rad
				if free.call(c) and (best == Vector2.INF or c.distance_to(from) < best.distance_to(from)):
					best = c
			if best != Vector2.INF:
				to = best
				found = true
				break
		if not found:
			return out
	var los := func(a: Vector2, b: Vector2) -> bool:
		var n := maxi(1, ceili(a.distance_to(b) / 0.25))
		for i in range(1, n + 1):
			if not free.call(a.lerp(b, float(i) / n)):
				return false
		return true
	if los.call(from, to):
		out.assign([from, to])
		return out
	var astar := AStarGrid2D.new()
	var o := bounds.position
	astar.region = Rect2i(0, 0, int(bounds.size.x / G) + 1, int(bounds.size.y / G) + 1)
	astar.cell_size = Vector2(G, G)
	astar.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	astar.update()
	# só marca as células perto dos obstáculos (rápido mesmo com centenas de obstáculos)
	for r: Rect2 in view.obstacles:
		var g := r.grow(0.42)
		if not g.intersects(bounds):
			continue
		for i in range(int((g.position.x - o.x) / G), int((g.end.x - o.x) / G) + 1):
			for j in range(int((g.position.y - o.y) / G), int((g.end.y - o.y) / G) + 1):
				var c := Vector2i(i, j)
				if astar.is_in_boundsv(c) and g.has_point(o + Vector2(i, j) * G):
					astar.set_point_solid(c)
	var a := Vector2i(((from - o) / G).round())
	var b := Vector2i(((to - o) / G).round())
	if not astar.is_in_boundsv(a) or not astar.is_in_boundsv(b) or astar.is_point_solid(b):
		return out
	astar.set_point_solid(a, false)
	var cells := astar.get_id_path(a, b)
	if cells.is_empty():
		return out
	var pts: Array[Vector2] = [from]
	for c: Vector2i in cells:
		pts.append(o + Vector2(c) * G)
	pts.append(to)
	# linha de vista: salta pontos intermédios
	out.append(from)
	var i := 0
	while i < pts.size() - 1:
		var j := pts.size() - 1
		while j > i + 1 and not los.call(pts[i], pts[j]):
			j -= 1
		out.append(pts[j])
		i = j
	return out


func _zoom(f: float) -> void:
	var z := clampf(camera.zoom.x * f, 0.22, 1.6)
	camera.zoom = Vector2(z, z)


func _on_hud_action(what: String) -> void:
	match what:
		"zoom_mais": _zoom(1.25)
		"zoom_menos": _zoom(0.8)
		var w when w.begins_with("caminho:"):
			# vai a pé até à placa no fim da rua que dá para esse bairro
			var to := w.trim_prefix("caminho:")
			for p: Dictionary in view.places:
				if p.kind == "portal" and str(p.get("to", "")) == to:
					request_move(Vector2(p.at[0], p.at[1]))
					hud.show_toast("A caminho da saída para %s…" % str(p.name).trim_prefix("A pé para "), true)
		var w when w.begins_with("ir_ponto:"):
			var xy := w.trim_prefix("ir_ponto:").split(",")
			if typeof(Net.me.get("inside")) == TYPE_DICTIONARY:
				Net.action("exit")
				await get_tree().create_timer(0.6).timeout
			request_move(Vector2(xy[0].to_float(), xy[1].to_float()))
			hud.show_toast("A caminho…", true)
		var w when w.begins_with("ir:"):
			# app do telemóvel: leva-te a pé à porta do sítio desse tipo neste bairro (o mais perto)
			var venue := w.trim_prefix("ir:")
			var best: Dictionary = {}
			var bd := INF
			for p: Dictionary in view.places:
				if p.kind == "door" and str(p.get("venue", "")) == venue:
					var d := local_char.world_pos.distance_to(Vector2(p.at[0], p.at[1])) if local_char else 0.0
					if d < bd:
						bd = d
						best = p
			if best.is_empty():
				hud.show_toast("Não há esse sítio neste bairro. Abre o Mapa e vai a outro bairro.", false)
			else:
				if typeof(Net.me.get("inside")) == TYPE_DICTIONARY:
					Net.action("exit")
					await get_tree().create_timer(0.6).timeout
				request_move(Vector2(best.at[0], best.at[1]))
				hud.show_toast("A caminho: %s" % str(best.name), true)
		"paragem":
			for p: Dictionary in view.places:
				if p.kind == "stop":
					request_move(Vector2(p.at[0], p.at[1]))
					hud.show_toast("A caminho da paragem…", true)
		var w when w.begins_with("sala:"):
			var err := await Net.join_district(Net.current_district, "", w.trim_prefix("sala:"))
			if err != "":
				hud.show_toast(err, false)
				await Net.join_district(Net.current_district)
			get_tree().change_scene_to_file("res://src/game/bairro_world.tscn")
		"rodar":
			if mode3d != "":
				_set_mode3d("")
			rotate_view()
		"vista3d":
			# como no Vida na Banda: aérea → por cima do ombro → pelos olhos → aérea
			_set_mode3d({"": "ombro", "ombro": "olhos", "olhos": ""}[mode3d])
		"centrar":
			_follow = true
			if local_char:
				camera.position = local_char.position + Vector2(0, -70)
		"mapa":
			# vista geral do bairro e volta
			var z := 0.55 if camera.zoom.x < 0.3 else 0.24
			camera.zoom = Vector2(z, z)
		"sair":
			Net.leave()
			get_tree().change_scene_to_file("res://src/ui/login_screen.tscn")
		"entrar":
			# tecla E: entra no edifício (ou sai, se já estiver lá dentro); o servidor decide
			Net.action("exit" if typeof(Net.me.get("inside")) == TYPE_DICTIONARY else "enter")
