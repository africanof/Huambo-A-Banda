class_name Iso
extends RefCounted
## Projeção isométrica 2:1 (como no Vida na Banda).
## Mundo em METROS (x, y no plano do chão); ecrã em píxeis.
##   1 m ao longo de x → (+64, +32) px ; 1 m ao longo de y → (−64, +32) px

const PX := 64.0 ## meia largura de 1 m
const PY := 32.0 ## meia altura de 1 m


static func to_screen(w: Vector2) -> Vector2:
	return Vector2((w.x - w.y) * PX, (w.x + w.y) * PY)


static func to_world(s: Vector2) -> Vector2:
	var a := s.x / PX
	var b := s.y / PY
	return Vector2((a + b) * 0.5, (b - a) * 0.5)


## Direção de ecrã (setas/WASD) → direção no mundo.
static func screen_dir_to_world(d: Vector2) -> Vector2:
	if d == Vector2.ZERO:
		return Vector2.ZERO
	var w := to_world(d.normalized() * 100.0)
	return w.normalized()


## Polígono no ecrã de um retângulo do chão (x, y, largura, profundidade em metros).
static func rect_poly(r: Rect2) -> PackedVector2Array:
	return PackedVector2Array([
		to_screen(r.position),
		to_screen(Vector2(r.end.x, r.position.y)),
		to_screen(r.end),
		to_screen(Vector2(r.position.x, r.end.y)),
	])
