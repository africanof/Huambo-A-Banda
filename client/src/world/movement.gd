class_name Movement
extends RefCounted
## Espelho EXATO de server/src/game/movement.ts, usado para previsão local.
## Testado contra fixtures geradas pelo servidor (tests/fixtures/movement.json).

const PLAYER_RADIUS := 14.0 ## mapas de retângulos (testes)
const WALK_SPEED := 160.0
## Pegada dos pés em mapas de grelha (igual ao servidor).
const FOOT: Array[Vector2] = [Vector2(0, 0), Vector2(-6, 0), Vector2(6, 0), Vector2(0, -4), Vector2(0, 3)]
const MAX_PATH_POINTS := 24


## Mapa tal como o servidor o vê: limites + retângulos OU grelha de colisão.
class MapData:
	var width := 0.0
	var height := 0.0
	var obstacles: Array[Rect2] = []
	var cell := 0
	var cols := 0
	var rows := 0
	var bits := PackedByteArray()

	func has_grid() -> bool:
		return cols > 0

	static func from_welcome(district: Dictionary) -> MapData:
		var m := MapData.new()
		m.width = float(district.get("width", 0))
		m.height = float(district.get("height", 0))
		for o: Variant in district.get("obstacles", []):
			if typeof(o) == TYPE_ARRAY and o.size() == 4:
				m.obstacles.append(Rect2(float(o[0]), float(o[1]), float(o[2]), float(o[3])))
		return m

	static func from_map_json(d: Dictionary) -> MapData:
		var m := MapData.new()
		m.width = float(d.width)
		m.height = float(d.height)
		var g: Dictionary = d.grid
		m.cell = int(g.cell)
		m.cols = int(g.cols)
		m.rows = int(g.rows)
		m.bits = Marshalls.base64_to_raw(g.bits)
		return m

	func cell_blocked(x: float, y: float) -> bool:
		var c := floori(x / cell)
		var r := floori(y / cell)
		if c < 0 or r < 0 or c >= cols or r >= rows:
			return true
		var i := r * cols + c
		return (bits[i >> 3] & (1 << (i & 7))) != 0


static func point_in_rect(x: float, y: float, r: Rect2, pad: float) -> bool:
	return x > r.position.x - pad and x < r.position.x + r.size.x + pad \
		and y > r.position.y - pad and y < r.position.y + r.size.y + pad


static func is_walkable(m: MapData, x: float, y: float) -> bool:
	if m.has_grid():
		for f in FOOT:
			if m.cell_blocked(x + f.x, y + f.y):
				return false
		return true
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


static func segment_walkable(m: MapData, a: Vector2, b: Vector2) -> bool:
	var n := maxi(1, ceili(a.distance_to(b) / 4.0))
	for i in range(1, n + 1):
		var p := a.lerp(b, float(i) / n)
		if not is_walkable(m, p.x, p.y):
			return false
	return true


## Estado mutável de quem anda (igual ao Mover do servidor).
class Mover:
	var pos := Vector2.ZERO
	var target := Vector2.ZERO
	var has_target := false
	var path: Array[Vector2] = [] ## pontos depois do target
	var dir := Vector2.ZERO ## direção contínua (não normalizada)

	func stop() -> void:
		has_target = false
		path.clear()
		dir = Vector2.ZERO


static func _try_move(m: MapData, mv: Mover, nx: float, ny: float, sx: float, sy: float) -> bool:
	if is_walkable(m, nx, ny):
		mv.pos = Vector2(nx, ny)
		return true
	if absf(sx) > 0.01 and is_walkable(m, mv.pos.x + sx, mv.pos.y):
		mv.pos.x += sx
		return true
	if absf(sy) > 0.01 and is_walkable(m, mv.pos.x, mv.pos.y + sy):
		mv.pos.y += sy
		return true
	return false


## Um passo de simulação. Devolve true se se moveu.
static func step(m: MapData, mv: Mover, dt: float, speed: float = WALK_SPEED) -> bool:
	var max_step := speed * dt
	if mv.dir != Vector2.ZERO:
		var u := mv.dir / mv.dir.length()
		return _try_move(m, mv, mv.pos.x + u.x * max_step, mv.pos.y + u.y * max_step, u.x * max_step, u.y * max_step)

	if not mv.has_target:
		return false
	var dx := mv.target.x - mv.pos.x
	var dy := mv.target.y - mv.pos.y
	var dist := sqrt(dx * dx + dy * dy)

	if dist <= max_step:
		if is_walkable(m, mv.target.x, mv.target.y):
			mv.pos = mv.target
		if not mv.path.is_empty():
			mv.target = mv.path.pop_front()
		else:
			mv.has_target = false
		return true

	var sx := signf(dx) * minf(absf(dx), max_step)
	var sy := signf(dy) * minf(absf(dy), max_step)
	if _try_move(m, mv, mv.pos.x + (dx / dist) * max_step, mv.pos.y + (dy / dist) * max_step, sx, sy):
		return true
	mv.stop()
	return false
