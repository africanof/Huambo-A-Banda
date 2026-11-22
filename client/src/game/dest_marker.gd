class_name DestMarker
extends Node2D
## Marcador do destino na vista aérea (como nos jogos de vida para telemóvel): um anel no chão
## que pulsa onde tocaste, e pontinhos a mostrar o caminho. Some quando a personagem chega.
## É interface (não é arte do cenário), por isso desenha-se aqui.

var target := Vector2.INF ## metros
var path: Array[Vector2] = [] ## pontos que faltam (metros)
var _t := 0.0
var _life := 0.0


func show_at(world: Vector2, route: Array[Vector2]) -> void:
	target = world
	path = route.duplicate()
	_t = 0.0
	_life = 1.0
	visible = true
	queue_redraw()


func clear() -> void:
	target = Vector2.INF
	path.clear()
	visible = false


func _process(delta: float) -> void:
	if target == Vector2.INF:
		return
	_t += delta
	queue_redraw()


func _draw() -> void:
	if target == Vector2.INF:
		return
	# tamanho constante no ecrã, seja qual for o zoom
	var z := maxf(0.05, get_viewport().get_canvas_transform().get_scale().x)
	var u := 1.0 / z
	var c := Iso.to_screen(target)
	var pulse := 0.5 + 0.5 * sin(_t * 6.0)
	# anel achatado (está deitado no chão isométrico), com contorno escuro para se ver em qualquer chão
	for k in 2:
		var r := (22.0 + 8.0 * pulse + k * 9.0) * u
		var col := Tema.GOLD
		col.a = (0.95 - 0.3 * pulse) * (1.0 if k == 0 else 0.45)
		_ellipse(c, r, r * 0.5, Color(0, 0, 0, 0.35 * col.a), (6.0 - k) * u)
		_ellipse(c, r, r * 0.5, col, (3.5 - k) * u)
	draw_circle(c, 5.0 * u, Color(Tema.GOLD, 0.95))
	# pontinhos ao longo do caminho que falta
	var pts: Array[Vector2] = []
	pts.append_array(path)
	for i in range(pts.size() - 1):
		var a := Iso.to_screen(pts[i])
		var b := Iso.to_screen(pts[i + 1])
		var n := int(a.distance_to(b) / (34.0 * u))
		for j in range(1, n):
			draw_circle(a.lerp(b, float(j) / n), 3.5 * u, Color(1, 1, 1, 0.7))


func _ellipse(c: Vector2, rx: float, ry: float, col: Color, w: float) -> void:
	var pts := PackedVector2Array()
	for i in 33:
		var a := TAU * i / 32.0
		pts.append(c + Vector2(cos(a) * rx, sin(a) * ry))
	draw_polyline(pts, col, w, true)
