class_name Movement
extends RefCounted
## Espelho EXATO de server/src/game/movement.ts, usado para previsão local.
## Testado contra fixtures geradas pelo servidor (tests/fixtures/movement.json).

const PLAYER_RADIUS := 14.0
const WALK_SPEED := 160.0


## Mapa do bairro tal como chega no WELCOME.
class MapData:
	var width := 0.0
	var height := 0.0
	var obstacles: Array[Rect2] = []

	static func from_welcome(district: Dictionary) -> MapData:
		var m := MapData.new()
		m.width = float(district.get("width", 0))
		m.height = float(district.get("height", 0))
		for o: Variant in district.get("obstacles", []):
			if typeof(o) == TYPE_ARRAY and o.size() == 4:
				m.obstacles.append(Rect2(float(o[0]), float(o[1]), float(o[2]), float(o[3])))
		return m


static func point_in_rect(x: float, y: float, r: Rect2, pad: float) -> bool:
	return x > r.position.x - pad and x < r.position.x + r.size.x + pad \
		and y > r.position.y - pad and y < r.position.y + r.size.y + pad


static func is_walkable(m: MapData, x: float, y: float) -> bool:
	if x < PLAYER_RADIUS or y < PLAYER_RADIUS or x > m.width - PLAYER_RADIUS or y > m.height - PLAYER_RADIUS:
		return false
	for r in m.obstacles:
		if point_in_rect(x, y, r, PLAYER_RADIUS):
			return false
	return true


## Devolve o destino ajustado aos limites, ou null se não for caminhável.
static func sanitize_target(m: MapData, x: float, y: float) -> Variant:
	var cx := clampf(x, PLAYER_RADIUS, m.width - PLAYER_RADIUS)
	var cy := clampf(y, PLAYER_RADIUS, m.height - PLAYER_RADIUS)
	if not is_walkable(m, cx, cy):
		return null
	return Vector2(cx, cy)


## Estado mutável de quem anda. has_target = false equivale a tx/ty = null no servidor.
class Mover:
	var pos := Vector2.ZERO
	var target := Vector2.ZERO
	var has_target := false


## Um passo de simulação. Devolve true se se moveu.
static func step(m: MapData, mv: Mover, dt: float, speed: float = WALK_SPEED) -> bool:
	if not mv.has_target:
		return false
	var dx := mv.target.x - mv.pos.x
	var dy := mv.target.y - mv.pos.y
	var dist := sqrt(dx * dx + dy * dy)
	var max_step := speed * dt

	if dist <= max_step:
		if is_walkable(m, mv.target.x, mv.target.y):
			mv.pos = mv.target
		mv.has_target = false
		return true

	var nx := mv.pos.x + (dx / dist) * max_step
	var ny := mv.pos.y + (dy / dist) * max_step
	if is_walkable(m, nx, ny):
		mv.pos = Vector2(nx, ny)
		return true
	var sx := signf(dx) * minf(absf(dx), max_step)
	var sy := signf(dy) * minf(absf(dy), max_step)
	if absf(sx) > 0.01 and is_walkable(m, mv.pos.x + sx, mv.pos.y):
		mv.pos.x += sx
		return true
	if absf(sy) > 0.01 and is_walkable(m, mv.pos.x, mv.pos.y + sy):
		mv.pos.y += sy
		return true
	mv.has_target = false
	return false
