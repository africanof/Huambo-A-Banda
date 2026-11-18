class_name Iso
extends RefCounted
## Projeção isométrica 2:1 (como no Vida na Banda).
## Mundo em METROS (x, y no plano do chão); ecrã em píxeis.
##   1 m ao longo de x → (+64, +32) px ; 1 m ao longo de y → (−64, +32) px

const PX := 64.0 ## meia largura de 1 m
const PY := 32.0 ## meia altura de 1 m

## 🔄 Rotação da vista (0–3, 90° de cada vez, como no Vida na Banda): o mundo fica igual,
## só a projeção roda à volta da origem.
static var rot := 0


## Mundo → mundo rodado (só a rotação; linear).
static func rotate(w: Vector2) -> Vector2:
	match rot:
		1: return Vector2(-w.y, w.x)
		2: return Vector2(-w.x, -w.y)
		3: return Vector2(w.y, -w.x)
	return w


static func unrotate(w: Vector2) -> Vector2:
	match rot:
		1: return Vector2(w.y, -w.x)
		2: return Vector2(-w.x, -w.y)
		3: return Vector2(-w.y, w.x)
	return w


static func to_screen(w: Vector2) -> Vector2:
	var r := rotate(w)
	return Vector2((r.x - r.y) * PX, (r.x + r.y) * PY)


static func to_world(s: Vector2) -> Vector2:
	var a := s.x / PX
	var b := s.y / PY
	return unrotate(Vector2((a + b) * 0.5, (b - a) * 0.5))


## Canto do retângulo do chão mais à frente no ecrã (onde assenta a base de um edifício).
static func front_corner(r: Rect2) -> Vector2:
	var best := r.position
	for c: Vector2 in [Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]:
		if to_screen(c).y > to_screen(best).y + 0.01:
			best = c
	return best


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
