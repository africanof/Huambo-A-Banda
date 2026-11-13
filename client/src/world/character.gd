class_name Character
extends Node2D
## Personagem de teste desenhada por código (sem texturas → leve em telemóveis).
##
## - Local: previsão com o mesmo algoritmo do servidor + correção suave.
## - Remota: interpolação entre snapshots, renderizada ~2 snapshots no passado.

const BODY_COLORS: Array[Color] = [
	Color("8d5524"), Color("c68642"), Color("e0ac69"), Color("5c3a1e"), Color("a0662f"), Color("3b2414"),
]
const SHIRT_COLORS: Array[Color] = [
	Color("e63946"), Color("f1c40f"), Color("2a9d8f"), Color("264653"), Color("e76f51"),
	Color("8e44ad"), Color("27ae60"), Color("2980b9"), Color("ecf0f1"), Color("111111"),
]

var eid := -1
var display_name := ""
var is_local := false
var body_color := BODY_COLORS[0]
var shirt_color := SHIRT_COLORS[0]

# --- local
var mover := Movement.Mover.new()
var map: Movement.MapData
var server_pos := Vector2.ZERO

# --- remota: buffer de [tempo_servidor_ms, posição]
var _buffer: Array = []
var _snapshot_interval_ms := 100.0
var _walk_phase := 0.0
var _last_pos := Vector2.ZERO
var _moving := false

@onready var _label: Label = $NameLabel


func setup(id: int, name_text: String, appearance: Dictionary, start: Vector2, local: bool, map_data: Movement.MapData, snapshot_hz: int) -> void:
	eid = id
	display_name = name_text
	is_local = local
	map = map_data
	position = start
	server_pos = start
	_last_pos = start
	mover.pos = start
	_snapshot_interval_ms = 1000.0 / maxf(1.0, float(snapshot_hz))
	body_color = BODY_COLORS[int(appearance.get("body", 0)) % BODY_COLORS.size()]
	shirt_color = SHIRT_COLORS[int(appearance.get("shirt", 0)) % SHIRT_COLORS.size()]
	name = "Character_%d" % id


func _ready() -> void:
	_label.text = display_name
	if is_local:
		_label.add_theme_color_override("font_color", Color("ffd166"))


## Local: começa a andar já (previsão) enquanto o pedido segue para o servidor.
func predict_move_to(target: Vector2) -> void:
	mover.pos = position
	mover.target = target
	mover.has_target = true


## Posição autoritativa recebida num snapshot.
func on_server_position(server_time: int, pos: Vector2) -> void:
	if is_local:
		server_pos = pos
		return
	# Depois de uma pausa, ancora o ponto anterior para não "arrastar" a interpolação.
	if not _buffer.is_empty() and server_time - _buffer[-1][0] > _snapshot_interval_ms * 1.5:
		_buffer.append([server_time - _snapshot_interval_ms, _buffer[-1][1]])
	_buffer.append([server_time, pos])
	if _buffer.size() > 20:
		_buffer = _buffer.slice(_buffer.size() - 20)


func update_remote(render_time: float) -> void:
	if _buffer.is_empty():
		return
	while _buffer.size() >= 2 and _buffer[1][0] <= render_time:
		_buffer.pop_front()
	if _buffer.size() >= 2 and _buffer[0][0] <= render_time:
		var a: Array = _buffer[0]
		var b: Array = _buffer[1]
		var span: float = maxf(1.0, b[0] - a[0])
		position = (a[1] as Vector2).lerp(b[1], clampf((render_time - a[0]) / span, 0.0, 1.0))
	elif _buffer.size() == 1 and _buffer[0][0] <= render_time:
		position = _buffer[0][1]


func _physics_process(delta: float) -> void:
	if not is_local or map == null:
		return
	if mover.has_target:
		mover.pos = position
		Movement.step(map, mover, delta)
		position = mover.pos
		# Divergência grande (ex.: servidor recusou o caminho): puxa para a verdade.
		var err := server_pos.distance_to(position)
		if err > Movement.WALK_SPEED * 0.6 + 32.0:
			position = position.lerp(server_pos, 0.2)
	else:
		# Parado: converge suavemente para a posição autoritativa.
		position = position.lerp(server_pos, minf(1.0, delta * 8.0))


func _process(delta: float) -> void:
	var moved := position.distance_squared_to(_last_pos) > 0.04
	_last_pos = position
	if moved:
		_walk_phase += delta * 14.0
	if moved != _moving or moved:
		_moving = moved
		queue_redraw()


func _draw() -> void:
	var bob := sin(_walk_phase) * 2.0 if _moving else 0.0
	draw_set_transform(Vector2(0, 0), 0, Vector2(1, 0.45))
	draw_circle(Vector2(0, 0), 14, Color(0, 0, 0, 0.25))
	draw_set_transform(Vector2.ZERO, 0, Vector2.ONE)
	draw_rect(Rect2(-9, -30 + bob, 18, 22), shirt_color)
	draw_rect(Rect2(-9, -10, 7, 10), Color("2d3047"))
	draw_rect(Rect2(2, -10, 7, 10), Color("2d3047"))
	draw_circle(Vector2(0, -38 + bob), 9, body_color)
	if is_local:
		draw_arc(Vector2(0, 0), 17, 0, TAU, 24, Color(1, 0.82, 0.4, 0.8), 2.0)
