extends Node2D
## Desenha o bairro a partir da geometria autoritativa enviada pelo servidor.

var map: Movement.MapData


func set_map(m: Movement.MapData) -> void:
	map = m
	queue_redraw()


func _draw() -> void:
	if map == null:
		return
	draw_rect(Rect2(0, 0, map.width, map.height), Color("7fb069"))
	var grid := Color(0, 0, 0, 0.05)
	for x in range(0, int(map.width) + 1, 100):
		draw_line(Vector2(x, 0), Vector2(x, map.height), grid)
	for y in range(0, int(map.height) + 1, 100):
		draw_line(Vector2(0, y), Vector2(map.width, y), grid)
	for r in map.obstacles:
		draw_rect(Rect2(r.position + Vector2(6, 8), r.size), Color(0, 0, 0, 0.18))
		draw_rect(r, Color("e9d8a6"))
		draw_rect(Rect2(r.position, Vector2(r.size.x, r.size.y * 0.35)), Color("bb3e03"))
		draw_rect(r, Color("5a3e2b"), false, 3.0)
	draw_rect(Rect2(0, 0, map.width, map.height), Color("2d3a1e"), false, 6.0)
