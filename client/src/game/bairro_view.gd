class_name BairroView
extends Node2D
## Desenha um bairro HD isométrico a partir de res://assets/bairros/<id>.json
## (a mesma planta que o servidor usa para colisões e lugares).
## Camadas: chão (TileMapLayer) → marcações → sombras → objetos com y-sort → luzes → etiquetas.

var data: Dictionary = {}
var size := Vector2.ZERO ## metros
var obstacles: Array[Rect2] = [] ## metros
var places: Array = []
var ground := TileMapLayer.new()
var markings := Node2D.new()
var shadows := Node2D.new()
var objects := Node2D.new() ## personagens entram aqui (y-sort)
var lights := Node2D.new()
var labels := Node2D.new()
var lamp_lights: Array[PointLight2D] = []


static func load_data(id: String) -> Dictionary:
	var d: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://assets/bairros/%s.json" % id))
	return d if typeof(d) == TYPE_DICTIONARY else {}


func build(bairro_id: String) -> bool:
	data = load_data(bairro_id)
	if data.is_empty():
		push_error("BairroView: bairro em falta: " + bairro_id)
		return false
	size = Vector2(data.size[0], data.size[1])
	for n: Node2D in [ground, markings, shadows, objects, lights, labels]:
		add_child(n)
	ground.z_index = -10
	markings.z_index = -9
	shadows.z_index = -5
	objects.y_sort_enabled = true
	labels.z_index = 50
	for r: Array in data.obstacles:
		obstacles.append(Rect2(r[0], r[1], r[2], r[3]))
	places = data.places
	_build_ground()
	_build_markings()
	for b: Dictionary in data.buildings:
		var fp: Array = b.fp
		var at := Vector2(b.at[0], b.at[1])
		var pos := Iso.to_screen(at + Vector2(fp[0], fp[1]))
		_add_object(b.id, pos)
		if str(b.label) != "":
			var o := DemoAssets.object(b.id)
			_add_label(b.label, pos + Vector2(0, -float(o.anchor[1]) - 16), _is_home(b))
	for p: Dictionary in data.props:
		var pos := Iso.to_screen(Vector2(p.at[0], p.at[1]))
		var o := _add_object(p.id, pos)
		if o.get("light", false):
			_add_lamp_light(pos + Vector2(0, -float(o.anchor[1]) * 0.86))
		if o.has("name"):
			_add_label(o.name, pos + Vector2(0, -float(o.anchor[1]) - 12), false)
	return true


func _is_home(b: Dictionary) -> bool:
	for p: Dictionary in places:
		if p.kind == "home" and str(p.id).begins_with(str(b.id) + "@"):
			return true
	return false


## Lugar interativo mais próximo dentro do raio (ou {}).
func place_near(world_m: Vector2) -> Dictionary:
	var best := {}
	var best_d := INF
	for p: Dictionary in places:
		var d := world_m.distance_to(Vector2(p.at[0], p.at[1]))
		if d < float(p.radius) and d < best_d:
			best = p
			best_d = d
	return best


func _ground_kind(x: float, y: float) -> String:
	for rule: Dictionary in data.ground:
		var ok := true
		if rule.has("x"):
			ok = ok and x >= float(rule.x[0]) and x < float(rule.x[1])
		if rule.has("y"):
			ok = ok and y >= float(rule.y[0]) and y < float(rule.y[1])
		if ok:
			return rule.kind
	return "terra"


func _build_ground() -> void:
	var m: Dictionary = DemoAssets.manifest().tiles
	var t := float(data.tile)
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
	for i in int(size.x / t):
		for j in int(size.y / t):
			ground.set_cell(Vector2i(i, j), 0, Vector2i(names.find(_ground_kind(i * t, j * t)), 0))
	ground.position = Iso.to_screen(Vector2(t / 2, t / 2)) - ground.map_to_local(Vector2i(0, 0))


func _quad(r: Rect2, color: Color) -> void:
	var p := Polygon2D.new()
	p.polygon = Iso.rect_poly(r)
	p.color = color
	markings.add_child(p)


## Marcações da avenida: lancis às riscas preto-e-branco, linha central e passadeira.
func _build_markings() -> void:
	var road_y: Array = [0.0, 0.0]
	for rule: Dictionary in data.ground:
		if rule.kind == "asfalto" and rule.has("y"):
			road_y = [float(rule.y[0]), float(rule.y[1])]
	if road_y[1] <= road_y[0]:
		return
	var gap: Array = [0.0, 0.0]
	for rule: Dictionary in data.ground:
		if rule.kind == "terra" and rule.has("x") and not rule.has("y"):
			gap = [float(rule.x[0]) - 0.5, float(rule.x[1]) + 0.5]
	for y in [road_y[0] - 0.2, road_y[1]]:
		var k := 0
		var lx := 0.0
		while lx < size.x:
			if not (lx >= gap[0] and lx < gap[1]):
				_quad(Rect2(lx, y, 0.6, 0.22), Color("f2f0ea") if k % 2 == 0 else Color("1d1d20"))
			lx += 0.6
			k += 1
	var mid: float = (float(road_y[0]) + float(road_y[1])) / 2.0
	var x := 0.5
	while x < size.x:
		if not (x > gap[0] - 1 and x < gap[1] + 1):
			_quad(Rect2(x, mid - 0.1, 2.0, 0.2), Color(0.96, 0.95, 0.9, 0.85))
		x += 4.0
	for k in 7:
		_quad(Rect2(22.2, road_y[0] + 0.3 + k * 1.1, 3.2, 0.55), Color(0.97, 0.97, 0.95, 0.9))
	_quad(Rect2(0, road_y[0] + 0.15, size.x, 0.25), Color(0, 0, 0, 0.18))
	_quad(Rect2(0, road_y[1] - 0.4, size.x, 0.25), Color(0, 0, 0, 0.18))


func _add_object(id: String, pos: Vector2) -> Dictionary:
	var o := DemoAssets.object(id)
	if o.is_empty():
		return o
	var s := DemoAssets.make_sprite(id)
	s.position = pos
	objects.add_child(s)
	var t := DemoAssets.shadow_texture(id)
	if t:
		var sh := Sprite2D.new()
		sh.texture = t
		sh.centered = false
		sh.offset = -Vector2(o.shadow_anchor[0], o.shadow_anchor[1])
		sh.position = pos
		sh.modulate = Color(1, 1, 1, 0.9)
		shadows.add_child(sh)
	return o


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


## Etiquetas legíveis em qualquer zoom.
func scale_labels(zoom: float, extra: Array = []) -> void:
	var k := clampf(0.55 / zoom, 1.0, 2.8)
	for c: Control in labels.get_children() + extra:
		c.pivot_offset = Vector2(c.size.x / 2, c.size.y)
		c.scale = Vector2(k, k)


## Hora do dia (0..24) → cor ambiente, candeeiros e sombras. Devolve o fator "noite" (0..1).
func apply_hour(h: float, canvas_mod: CanvasModulate) -> float:
	var keys := [[0.0, Color(0.26, 0.3, 0.5)], [5.0, Color(0.3, 0.33, 0.52)], [6.5, Color(0.95, 0.75, 0.62)],
		[8.0, Color(1, 0.97, 0.92)], [16.5, Color(1, 0.97, 0.9)], [18.0, Color(1, 0.7, 0.5)],
		[19.2, Color(0.45, 0.42, 0.62)], [20.5, Color(0.27, 0.3, 0.5)], [24.0, Color(0.26, 0.3, 0.5)]]
	var col: Color = keys[0][1]
	for i in range(keys.size() - 1):
		if h >= keys[i][0] and h <= keys[i + 1][0]:
			col = (keys[i][1] as Color).lerp(keys[i + 1][1], (h - keys[i][0]) / (keys[i + 1][0] - keys[i][0]))
	canvas_mod.color = col
	var night := clampf((0.8 - col.v) / 0.35, 0.0, 1.0)
	for l in lamp_lights:
		l.energy = night * 1.1
	shadows.modulate.a = 1.0 - night * 0.85
	return night
