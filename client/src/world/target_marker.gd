extends Node2D
## Marcador do destino do clique.

func _draw() -> void:
	draw_arc(Vector2.ZERO, 10, 0, TAU, 20, Color(1, 1, 1, 0.9), 2.0)
	draw_arc(Vector2.ZERO, 4, 0, TAU, 12, Color(1, 0.82, 0.4, 0.9), 2.0)
