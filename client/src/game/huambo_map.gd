class_name HuamboMap
extends Control
## Mapa da cidade do Huambo: bairros nas posições reais (lat/lon do OpenStreetMap), ligações a pé
## entre vizinhos e o bairro onde estás. Tocar num bairro escolhe o destino.

signal picked(id: String)

const FONT := preload("res://assets/fonts/Inter-SemiBold.otf")
var districts: Array = [] ## [{id, name, geo:{lat,lon}, links:[...]}]
var here := ""
var _pos := {}


func _ready() -> void:
	custom_minimum_size = Vector2(0, 340)
	mouse_filter = Control.MOUSE_FILTER_STOP
	resized.connect(queue_redraw)


func _layout() -> void:
	_pos.clear()
	var lat := Vector2(INF, -INF)
	var lon := Vector2(INF, -INF)
	for d: Dictionary in districts:
		if typeof(d.get("geo")) != TYPE_DICTIONARY:
			continue
		lat = Vector2(minf(lat.x, d.geo.lat), maxf(lat.y, d.geo.lat))
		lon = Vector2(minf(lon.x, d.geo.lon), maxf(lon.y, d.geo.lon))
	var pad := 26.0
	var w := size.x - pad * 2.0
	var h := size.y - pad * 2.0
	var kx := cos(deg_to_rad((lat.x + lat.y) / 2.0)) # metros por grau de longitude
	var sx := (lon.y - lon.x) * kx
	var sy := lat.y - lat.x
	var k := minf(w / maxf(sx, 1e-6), h / maxf(sy, 1e-6))
	var off := Vector2((w - sx * k) / 2.0, (h - sy * k) / 2.0) + Vector2(pad, pad)
	for d: Dictionary in districts:
		if typeof(d.get("geo")) == TYPE_DICTIONARY:
			_pos[d.id] = off + Vector2((d.geo.lon - lon.x) * kx * k, (lat.y - d.geo.lat) * k)


func _draw() -> void:
	_layout()
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.55, 0.36, 0.24, 0.35), true)
	var mine: Array = []
	for d: Dictionary in districts:
		if d.id == here:
			mine = d.get("links", [])
	for d: Dictionary in districts:
		for to: Variant in d.get("links", []):
			if _pos.has(d.id) and _pos.has(to) and str(d.id) < str(to):
				var hot: bool = (d.id == here and mine.has(to)) or (to == here)
				draw_line(_pos[d.id], _pos[to], Tema.GOLD if hot else Color(1, 1, 1, 0.35), 3.0 if hot else 1.5, true)
	for d: Dictionary in districts:
		if not _pos.has(d.id):
			continue
		var p: Vector2 = _pos[d.id]
		var is_here: bool = d.id == here
		draw_circle(p, 9.0 if is_here else 6.0, Tema.TERRA if is_here else (Tema.GOLD if mine.has(d.id) else Tema.TEXT))
	# nomes: primeiro o bairro atual e os vizinhos; os outros só se não se sobrepuserem
	var order := districts.duplicate()
	order.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return _rank(a, mine) < _rank(b, mine))
	var used: Array[Rect2] = []
	for d: Dictionary in order:
		if not _pos.has(d.id):
			continue
		var p: Vector2 = _pos[d.id]
		var fs := 13 if d.id == here else 11
		var w := FONT.get_string_size(str(d.name), HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var placed := false
		for off: Vector2 in [Vector2(9, 4), Vector2(-w - 9, 4), Vector2(-w / 2, -10), Vector2(-w / 2, 18)]:
			var r := Rect2(p + off - Vector2(0, fs), Vector2(w, fs + 2))
			if used.any(func(u: Rect2) -> bool: return u.intersects(r)) or not Rect2(Vector2.ZERO, size).encloses(r):
				continue
			used.append(r)
			draw_string(FONT, p + off, str(d.name), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Tema.TEXT if d.id != here else Tema.GOLD)
			placed = true
			break
		if not placed and d.id == here:
			draw_string(FONT, p + Vector2(9, 4), str(d.name), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Tema.GOLD)


func _rank(d: Dictionary, mine: Array) -> int:
	return 0 if d.id == here else (1 if mine.has(d.id) else 2)


func _gui_input(e: InputEvent) -> void:
	var tap: bool = (e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT) or (e is InputEventScreenTouch and e.pressed)
	if not tap:
		return
	var best := ""
	var bd := 28.0
	for id: Variant in _pos:
		var d: float = (_pos[id] as Vector2).distance_to(e.position)
		if d < bd:
			bd = d
			best = str(id)
	if best != "" and best != here:
		picked.emit(best)
		accept_event()
