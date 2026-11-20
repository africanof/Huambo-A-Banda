class_name Minimap
extends Control
## Minimapa do bairro (como no Vida na Banda): ruas, edifícios, paragem, saídas a pé e tu.
## Pequeno no canto; tocar abre-o em grande e tocar num sítio leva-te lá a andar.

signal go_to(world_m: Vector2)

const FONT := preload("res://assets/fonts/Inter-SemiBold.otf")
var view: BairroView
var me := Vector2.ZERO
var big := false
var _k := 1.0
var _off := Vector2.ZERO


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true


func _process(_d: float) -> void:
	queue_redraw()


func _fit() -> void:
	# o bairro em projeção isométrica (igual à vista), encolhido para caber
	var bb := Rect2(Iso.to_screen(Vector2.ZERO), Vector2.ZERO)
	for c: Vector2 in [Vector2(view.size.x, 0), Vector2(0, view.size.y), view.size]:
		bb = bb.expand(Iso.to_screen(c))
	var pad := 14.0 if big else 6.0
	_k = minf((size.x - pad * 2) / bb.size.x, (size.y - pad * 2) / bb.size.y)
	_off = (size - bb.size * _k) / 2.0 - bb.position * _k


func _p(w: Vector2) -> Vector2:
	return Iso.to_screen(w) * _k + _off


func _draw() -> void:
	if view == null or view.size == Vector2.ZERO:
		return
	_fit()
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.08, 0.07, 0.07, 0.82), true)
	# chão do bairro
	var g := PackedVector2Array([_p(Vector2.ZERO), _p(Vector2(view.size.x, 0)), _p(view.size), _p(Vector2(0, view.size.y))])
	draw_colored_polygon(g, Color("8a5a3c") if str(view.data.ground[0].kind) == "terra" else Color("4f7a3a"))
	# ruas
	for r: Dictionary in view.data.get("roads", []):
		var pts := PackedVector2Array()
		for q: Array in r.pts:
			pts.append(_p(Vector2(q[0], q[1])))
		if pts.size() >= 2:
			draw_polyline(pts, Color("8d8b86") if bool(r.paved) else Color("c9a27a"), maxf(1.5, float(r.w) * _k * 64.0 * 0.9), true)
	if not view.osm:
		for rule: Dictionary in view.data.ground:
			if str(rule.kind) == "asfalto" and rule.has("y"):
				var y0: float = rule.y[0]
				var y1: float = rule.y[1]
				draw_colored_polygon(PackedVector2Array([_p(Vector2(0, y0)), _p(Vector2(view.size.x, y0)), _p(Vector2(view.size.x, y1)), _p(Vector2(0, y1))]), Color("8d8b86"))
	# edifícios: com nome a cor, casas a cinzento
	for b: Dictionary in view.data.buildings:
		var r := Rect2(b.at[0], b.at[1], b.fp[0], b.fp[1])
		var home := str(b.get("label", "")).begins_with("Casa")
		var poly := PackedVector2Array([_p(r.position), _p(Vector2(r.end.x, r.position.y)), _p(r.end), _p(Vector2(r.position.x, r.end.y))])
		draw_colored_polygon(poly, Color("d9cbb4") if home else Color("f2c14e"))
	# paragem, saídas e lugares com nome (no mapa grande)
	for p: Dictionary in view.places:
		var at := _p(Vector2(p.at[0], p.at[1]))
		match str(p.kind):
			"stop":
				draw_circle(at, 7.0 if big else 4.0, Color("2f7fd1"))
				if big:
					draw_string(FONT, at + Vector2(9, 4), "Paragem", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color.WHITE)
			"portal":
				draw_circle(at, 6.0 if big else 3.0, Color("8fe08a"))
				if big:
					draw_string(FONT, at + Vector2(8, 4), str(p.name).trim_prefix("A pé para "), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color("c8f5c3"))
			"door":
				if big and not str(p.get("venue", "")) in ["casa", "apartamentos"]:
					draw_string(FONT, at + Vector2(-30, 14), str(p.name).substr(0, 22), HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, 1, 1, 0.85))
	# eu
	var m := _p(me)
	draw_circle(m, 8.0 if big else 5.0, Color.WHITE)
	draw_circle(m, 6.0 if big else 3.5, Color("e8452c"))
	draw_rect(Rect2(Vector2.ZERO, size), Color(1, 1, 1, 0.25), false, 2.0)


func _gui_input(e: InputEvent) -> void:
	var tap: bool = (e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT) or (e is InputEventScreenTouch and e.pressed)
	if not tap:
		return
	accept_event()
	if not big:
		go_to.emit(Vector2.INF) # pede para abrir em grande
		return
	var w := Iso.to_world((e.position - _off) / _k)
	if Rect2(Vector2.ZERO, view.size).has_point(w):
		go_to.emit(w)
