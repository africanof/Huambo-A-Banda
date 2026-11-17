extends Node2D
## Bairro de demonstração do novo estilo gráfico HD (vista isométrica 2D, como o
## Vida na Banda). Uma avenida da Cidade Baixa do Huambo com passeios, uma rua de
## terra vermelha, edifícios coloniais, cantina, padaria, prédio dos anos 60,
## árvores do planalto, candeeiros, kupapata, zungueira, ciclo dia/noite e a casa
## do jogador (com interior decorável).
##
## Controlos: setas/WASD (Shift corre) · clicar/tocar para andar · roda/pinça = zoom
## · E = entrar em casa.

const MAP := Vector2(96, 48) ## metros
const TILE_M := 4.0

## Planta do bairro (metros). footprint = [x, y, largura, profundidade]
const BUILDINGS := [
	{"id": "correios", "at": Vector2(2, 6)},
	{"id": "casa_colonial", "at": Vector2(15, 6)},
	{"id": "cantina", "at": Vector2(35, 9)},
	{"id": "predio_castanho", "at": Vector2(46, 7)},
	{"id": "banco", "at": Vector2(60, 7)},
	{"id": "loja_telecom", "at": Vector2(72, 7)},
	{"id": "predio_rosa", "at": Vector2(84, 6)},
	{"id": "governo", "at": Vector2(2, 34)},
	{"id": "padaria", "at": Vector2(21, 35)},
	{"id": "predio_60", "at": Vector2(48, 36)},
	{"id": "escola", "at": Vector2(60, 35)},
	{"id": "tribunal", "at": Vector2(80, 35)},
]
## Adereços, todos gerados a partir de fotografias reais do Huambo (ver tools/art/ai/refs/REFERENCIAS.md)
const PROPS := [
	["obelisco", Vector2(36.5, 41.5)],
	["jacaranda", Vector2(1.5, 17.6)], ["jacaranda", Vector2(13.4, 17.4)], ["arvore_eucalipto", Vector2(33.4, 16.8)],
	["jacaranda", Vector2(43.5, 17.4)], 
	["palmeira", Vector2(6, 30.6)], ["palmeira", Vector2(18, 30.6)], ["palmeira", Vector2(40, 30.6)], ["palmeira", Vector2(54, 30.6)],
	["jacaranda", Vector2(31.5, 37.5)], ["arvore_eucalipto", Vector2(41.5, 45.5)], ["palmeira", Vector2(33, 44.5)], ["palmeira", Vector2(40.5, 38.5)],
	["candeeiro", Vector2(8, 19.4)], ["candeeiro", Vector2(22, 19.4)], ["candeeiro", Vector2(38, 19.4)], ["candeeiro", Vector2(52, 19.4)],
	["candeeiro", Vector2(12, 28.6)], ["candeeiro", Vector2(30, 28.6)], ["candeeiro", Vector2(48, 28.6)],
	["kupapata", Vector2(33.5, 20.6)], ["kupapata", Vector2(27, 29.8)], ["kupapata", Vector2(26, 29.3)],
	["bancada_zungueira", Vector2(23.5, 30.6)], ["bancada_mercado", Vector2(70, 30.6)], ["bancada_mercado", Vector2(72.5, 30.6)],
	["arvore_avenida", Vector2(58.5, 17.6)], ["arvore_avenida", Vector2(66, 17.6)], ["arvore_avenida", Vector2(78, 17.6)], ["arvore_avenida", Vector2(90, 17.6)],
	["arvore_avenida", Vector2(62, 30.6)], ["arvore_avenida", Vector2(78, 30.6)], ["arvore_avenida", Vector2(90, 30.6)],
	["candeeiro", Vector2(70, 19.4)], ["candeeiro", Vector2(86, 19.4)], ["candeeiro", Vector2(66, 28.6)], ["candeeiro", Vector2(84, 28.6)],
	["kupapata", Vector2(75, 20.6)], ["palmeira", Vector2(94, 30.6)],
]
const DOOR := Vector2(20.0, 14.8) ## porta da casa (lado da avenida)

var world_root := Node2D.new() ## camadas do mundo
var ground := TileMapLayer.new()
var markings := Node2D.new()
var shadows := Node2D.new()
var objects := Node2D.new() ## y-sort: edifícios, adereços e personagens
var labels := Node2D.new()
var lights := Node2D.new()
var canvas_mod := CanvasModulate.new()
var player := DemoCharacter.new()
var camera := Camera2D.new()
var hud: DemoHud
var obstacles: Array[Rect2] = []
var lamp_lights: Array[PointLight2D] = []
var time_min := 10.0 * 60.0 ## hora do dia em minutos
var time_speed := 4.0 ## minutos de jogo por segundo real
var click_target: Variant = null


func _ready() -> void:
	RenderingServer.set_default_clear_color(Color("2a2a2e"))
	add_child(world_root)
	for n: Node2D in [ground, markings, shadows, objects, lights, labels]:
		world_root.add_child(n)
	ground.z_index = -10
	markings.z_index = -9
	shadows.z_index = -5
	objects.y_sort_enabled = true
	labels.z_index = 50
	add_child(canvas_mod)
	_build_ground()
	_build_markings()
	_build_buildings()
	_build_props()
	_build_player()
	hud = DemoHud.new()
	add_child(hud)
	hud.action.connect(_on_hud_action)
	if DemoState.return_pos != Vector2.ZERO:
		player.world_pos = DemoState.return_pos
	time_min = DemoState.time_min
	_apply_time()


# ------------------------------------------------------------------ construção

func _build_ground() -> void:
	var m: Dictionary = DemoAssets.manifest().tiles
	var ts := TileSet.new()
	ts.tile_shape = TileSet.TILE_SHAPE_ISOMETRIC
	ts.tile_layout = TileSet.TILE_LAYOUT_DIAMOND_DOWN
	ts.tile_size = Vector2i(m.tile_size[0], m.tile_size[1])
	var src := TileSetAtlasSource.new()
	src.texture = DemoAssets.tex(m.file)
	src.texture_region_size = ts.tile_size
	var names: Array = m.names
	for i in names.size():
		src.create_tile(Vector2i(i, 0))
	ts.add_source(src, 0)
	ground.tile_set = ts
	var idx := func(n: String) -> int: return names.find(n)
	var cols := int(MAP.x / TILE_M)
	var rows := int(MAP.y / TILE_M)
	for i in cols:
		for j in rows:
			var y := j * TILE_M
			var x := i * TILE_M
			var kind := "terra"
			if y >= 20 and y < 28:
				kind = "asfalto"
			elif (y >= 16 and y < 20) or (y >= 28 and y < 32):
				kind = "calcada"
			elif x >= 28 and x < 32:
				kind = "terra"
			elif (y < 16 and x >= 12 and x < 28) or (y >= 32 and x >= 32 and x < 44) or (y >= 32 and x >= 60 and x < 76):
				kind = "relva"
			ground.set_cell(Vector2i(i, j), 0, Vector2i(idx.call(kind), 0))
	# alinha o centro do tile (0,0) com o centro do quadrado de 4 m (2, 2) do mundo
	ground.position = Iso.to_screen(Vector2(TILE_M / 2, TILE_M / 2)) - ground.map_to_local(Vector2i(0, 0))


func _quad(r: Rect2, color: Color, parent: Node2D) -> void:
	var p := Polygon2D.new()
	p.polygon = Iso.rect_poly(r)
	p.color = color
	parent.add_child(p)


func _build_markings() -> void:
	# lancis pintados às riscas preto-e-branco, como nas avenidas do Huambo de hoje
	for y in [19.8, 28.0]:
		var k := 0
		var lx := 0.0
		while lx < MAP.x:
			if not (lx >= 27.5 and lx < 32.5):
				_quad(Rect2(lx, y, 0.6, 0.22), Color("f2f0ea") if k % 2 == 0 else Color("1d1d20"), markings)
			lx += 0.6
			k += 1
	# linha central tracejada (interrompida no cruzamento)
	var x := 0.5
	while x < MAP.x:
		if not (x > 26 and x < 33):
			_quad(Rect2(x, 23.9, 2.0, 0.2), Color(0.96, 0.95, 0.9, 0.85), markings)
		x += 4.0
	# passadeira (zebra) junto à cantina
	for k in 7:
		_quad(Rect2(22.2 + k * 0.0, 20.3 + k * 1.1, 3.2, 0.55), Color(0.97, 0.97, 0.95, 0.9), markings)
	# sarjeta escura ao longo do asfalto
	_quad(Rect2(0, 20.15, MAP.x, 0.25), Color(0, 0, 0, 0.18), markings)
	_quad(Rect2(0, 27.6, MAP.x, 0.25), Color(0, 0, 0, 0.18), markings)


func _build_buildings() -> void:
	for b: Dictionary in BUILDINGS:
		var o := DemoAssets.object(b.id)
		if o.is_empty():
			continue
		var fp: Array = o.footprint
		var at: Vector2 = b.at
		var front := at + Vector2(fp[0], fp[1]) ## canto mais à frente (âncora)
		var s := DemoAssets.make_sprite(b.id)
		s.position = Iso.to_screen(front)
		objects.add_child(s)
		obstacles.append(Rect2(at, Vector2(fp[0], fp[1])))
		_add_shadow(b.id, s.position)
		var name_text: String = b.get("label", o.get("name", ""))
		if name_text != "":
			_add_label(name_text, s.position + Vector2(0, -float(o.anchor[1]) - 16), b.id == "casa_colonial")


func _build_props() -> void:
	for p: Array in PROPS:
		var id: String = p[0]
		var at: Vector2 = p[1]
		var o := DemoAssets.object(id)
		if o.is_empty():
			continue
		var s := DemoAssets.make_sprite(id)
		s.position = Iso.to_screen(at)
		objects.add_child(s)
		var fp: Array = o.footprint
		obstacles.append(Rect2(at - Vector2(fp[0], fp[1]) * 0.5, Vector2(fp[0], fp[1])))
		_add_shadow(id, s.position)
		if o.get("light", false):
			_add_lamp_light(s.position + Vector2(0, -float(o.anchor[1]) * 0.86))
		if o.has("name"):
			_add_label(o.name, s.position + Vector2(0, -float(o.anchor[1]) - 12), false)


func _add_shadow(id: String, at: Vector2) -> void:
	var t := DemoAssets.shadow_texture(id)
	if t == null:
		return
	var o := DemoAssets.object(id)
	var sh := Sprite2D.new()
	sh.texture = t
	sh.centered = false
	sh.offset = -Vector2(o.shadow_anchor[0], o.shadow_anchor[1])
	sh.position = at
	sh.modulate = Color(1, 1, 1, 0.9)
	shadows.add_child(sh)


func _add_lamp_light(at: Vector2) -> void:
	var l := PointLight2D.new()
	var g := GradientTexture2D.new()
	g.width = 512
	g.height = 512
	g.fill = GradientTexture2D.FILL_RADIAL
	g.fill_from = Vector2(0.5, 0.5)
	g.fill_to = Vector2(1, 0.5)
	var gr := Gradient.new()
	gr.set_color(0, Color(1, 0.86, 0.6, 1))
	gr.set_color(1, Color(1, 0.8, 0.5, 0))
	g.gradient = gr
	l.texture = g
	l.position = at + Vector2(0, 120)
	l.scale = Vector2(1.4, 0.9)
	l.energy = 0.0
	l.blend_mode = Light2D.BLEND_MODE_ADD
	lights.add_child(l)
	lamp_lights.append(l)


func _add_label(text: String, at: Vector2, is_home: bool) -> void:
	var pill := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.09, 0.08, 0.08, 0.86) if not is_home else Color(0.95, 0.72, 0.18, 0.95)
	sb.set_corner_radius_all(14)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 4
	sb.content_margin_bottom = 4
	pill.add_theme_stylebox_override("panel", sb)
	var l := Label.new()
	l.text = ("⌂  " if is_home else "") + text
	l.add_theme_font_override("font", preload("res://assets/fonts/Inter-SemiBold.otf"))
	l.add_theme_font_size_override("font_size", 22)
	l.add_theme_color_override("font_color", Color.WHITE if not is_home else Color("2a1d10"))
	pill.add_child(l)
	labels.add_child(pill)
	pill.reset_size()
	pill.position = at - Vector2(pill.size.x / 2, pill.size.y)


func _build_player() -> void:
	player.cid = DemoState.cid
	player.world_pos = Vector2(24, 24)
	player.obstacles = obstacles
	player.bounds = Rect2(Vector2.ZERO, MAP)
	objects.add_child(player)
	player.set_top_hue(DemoState.top_hue)
	camera.zoom = Vector2(DemoState.zoom, DemoState.zoom)
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = 6.0
	player.add_child(camera)
	camera.position = Vector2(0, -70)


# ------------------------------------------------------------------ ciclo

func _process(delta: float) -> void:
	var dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if Input.is_physical_key_pressed(KEY_A):
		dir.x -= 1
	if Input.is_physical_key_pressed(KEY_D):
		dir.x += 1
	if Input.is_physical_key_pressed(KEY_W):
		dir.y -= 1
	if Input.is_physical_key_pressed(KEY_S):
		dir.y += 1
	var wdir := Iso.screen_dir_to_world(dir)
	if wdir != Vector2.ZERO:
		click_target = null
	elif click_target != null:
		var to: Vector2 = click_target - player.world_pos
		if to.length() < 0.15:
			click_target = null
		else:
			wdir = to.normalized()
	player.running = Input.is_physical_key_pressed(KEY_SHIFT)
	var before := player.world_pos
	player.step(wdir, delta)
	if click_target != null and player.world_pos.distance_to(before) < 0.001:
		click_target = null # bloqueado
	time_min = fmod(time_min + delta * time_speed, 24.0 * 60.0)
	_apply_time()
	hud.set_clock(time_min)
	hud.set_door_visible(player.world_pos.distance_to(DOOR) < 2.2)
	DemoState.time_min = time_min
	_scale_labels()


## Etiquetas legíveis em qualquer zoom (contrariam a escala da câmara, como no Vida na Banda).
func _scale_labels() -> void:
	var k := clampf(0.55 / camera.zoom.x, 1.0, 2.8)
	for pill: Control in labels.get_children():
		pill.pivot_offset = Vector2(pill.size.x / 2, pill.size.y)
		pill.scale = Vector2(k, k)
	player.tag.pivot_offset = Vector2(player.tag.size.x / 2, player.tag.size.y)
	player.tag.scale = Vector2(k, k)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		match event.button_index:
			MOUSE_BUTTON_LEFT:
				click_target = Iso.to_world(get_global_mouse_position())
			MOUSE_BUTTON_WHEEL_UP:
				_zoom(1.12)
			MOUSE_BUTTON_WHEEL_DOWN:
				_zoom(1 / 1.12)
	elif event is InputEventMagnifyGesture:
		_zoom(event.factor)
	elif event is InputEventKey and event.pressed and event.physical_keycode == KEY_E:
		_on_hud_action("entrar")


func _zoom(f: float) -> void:
	var z := clampf(camera.zoom.x * f, 0.22, 1.6)
	camera.zoom = Vector2(z, z)
	DemoState.zoom = z


## Luz do dia: madrugada azul, manhã dourada, meio-dia neutro, pôr do sol laranja, noite azul-escura.
func _apply_time() -> void:
	var h := time_min / 60.0
	var keys := [[0.0, Color(0.26, 0.3, 0.5)], [5.0, Color(0.3, 0.33, 0.52)], [6.5, Color(0.95, 0.75, 0.62)],
		[8.0, Color(1, 0.97, 0.92)], [16.5, Color(1, 0.97, 0.9)], [18.0, Color(1, 0.7, 0.5)],
		[19.2, Color(0.45, 0.42, 0.62)], [20.5, Color(0.27, 0.3, 0.5)], [24.0, Color(0.26, 0.3, 0.5)]]
	var col: Color = keys[0][1]
	for i in range(keys.size() - 1):
		if h >= keys[i][0] and h <= keys[i + 1][0]:
			var t: float = (h - keys[i][0]) / (keys[i + 1][0] - keys[i][0])
			col = (keys[i][1] as Color).lerp(keys[i + 1][1], t)
	canvas_mod.color = col
	var night := clampf((0.8 - col.v) / 0.35, 0.0, 1.0)
	for l in lamp_lights:
		l.energy = night * 1.1
	shadows.modulate.a = 1.0 - night * 0.85


func _on_hud_action(what: String) -> void:
	match what:
		"personagem":
			DemoState.cid = "mulher" if player.cid == "homem" else "homem"
			DemoState.top_hue = null
			player.set_character(DemoState.cid)
		"cor":
			var hues := [null, 0.0, 0.08, 0.33, 0.75, 0.9, 0.5]
			var i := hues.find(DemoState.top_hue)
			DemoState.top_hue = hues[(i + 1) % hues.size()]
			player.set_top_hue(DemoState.top_hue)
		"tempo":
			time_min = 20.0 * 60.0 if time_min < 18.0 * 60.0 and time_min > 6.0 * 60.0 else 11.0 * 60.0
		"zoom_mais":
			_zoom(1.25)
		"zoom_menos":
			_zoom(0.8)
		"entrar":
			if player.world_pos.distance_to(DOOR) < 2.2:
				DemoState.return_pos = DOOR + Vector2(0, 1.2)
				get_tree().change_scene_to_file("res://src/demo/casa_interior.tscn")
