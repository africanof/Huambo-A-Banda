extends Node2D
## Bairro de demonstração do novo estilo gráfico HD (vista isométrica 2D, como o
## Vida na Banda). Uma avenida da Cidade Baixa do Huambo com passeios, uma rua de
## terra vermelha, edifícios coloniais, cantina, padaria, prédio dos anos 60,
## árvores do planalto, candeeiros, kupapata, zungueira, ciclo dia/noite e a casa
## do jogador (com interior decorável).
##
## Controlos: setas/WASD (Shift corre) · clicar/tocar para andar · roda/pinça = zoom
## · E = entrar em casa.

const BAIRRO := "cidade_baixa"
var MAP := Vector2.ZERO
var DOOR := Vector2.ZERO

var view := BairroView.new()
var objects: Node2D
var labels: Node2D
var canvas_mod := CanvasModulate.new()
var player := DemoCharacter.new()
var camera := Camera2D.new()
var hud: DemoHud
var time_min := 10.0 * 60.0 ## hora do dia em minutos
var time_speed := 4.0 ## minutos de jogo por segundo real
var click_target: Variant = null


func _ready() -> void:
	RenderingServer.set_default_clear_color(Color("2a2a2e"))
	add_child(view)
	view.build(BAIRRO)
	MAP = view.size
	objects = view.objects
	labels = view.labels
	for p: Dictionary in view.places:
		if p.kind == "home":
			DOOR = Vector2(p.at[0], p.at[1])
	add_child(canvas_mod)
	_build_player()
	hud = DemoHud.new()
	add_child(hud)
	hud.action.connect(_on_hud_action)
	if DemoState.return_pos != Vector2.ZERO:
		player.world_pos = DemoState.return_pos
	time_min = DemoState.time_min
	_apply_time()


func _build_player() -> void:
	player.cid = DemoState.cid
	player.world_pos = Vector2(24, 24)
	player.obstacles = view.obstacles
	player.bounds = Rect2(Vector2.ZERO, MAP)
	objects.add_child(player)
	player.set_top_hue(DemoState.top_hue)
	camera.zoom = Vector2(DemoState.zoom, DemoState.zoom)
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = 6.0
	player.add_child(camera)
	camera.position = Vector2(0, -70)


# ------------------------------------------------------------------ ciclo

func _process(delta: float) -> void:
	var dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if Input.is_physical_key_pressed(KEY_A):
		dir.x -= 1
	if Input.is_physical_key_pressed(KEY_D):
		dir.x += 1
	if Input.is_physical_key_pressed(KEY_W):
		dir.y -= 1
	if Input.is_physical_key_pressed(KEY_S):
		dir.y += 1
	var wdir := Iso.screen_dir_to_world(dir)
	if wdir != Vector2.ZERO:
		click_target = null
	elif click_target != null:
		var to: Vector2 = click_target - player.world_pos
		if to.length() < 0.15:
			click_target = null
		else:
			wdir = to.normalized()
	player.running = Input.is_physical_key_pressed(KEY_SHIFT)
	var before := player.world_pos
	player.step(wdir, delta)
	if click_target != null and player.world_pos.distance_to(before) < 0.001:
		click_target = null # bloqueado
	time_min = fmod(time_min + delta * time_speed, 24.0 * 60.0)
	_apply_time()
	hud.set_clock(time_min)
	hud.set_door_visible(player.world_pos.distance_to(DOOR) < 2.2)
	DemoState.time_min = time_min
	_scale_labels()


func _scale_labels() -> void:
	view.scale_labels(camera.zoom.x, [player.tag])


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		match event.button_index:
			MOUSE_BUTTON_LEFT:
				click_target = Iso.to_world(get_global_mouse_position())
			MOUSE_BUTTON_WHEEL_UP:
				_zoom(1.12)
			MOUSE_BUTTON_WHEEL_DOWN:
				_zoom(1 / 1.12)
	elif event is InputEventMagnifyGesture:
		_zoom(event.factor)
	elif event is InputEventKey and event.pressed and event.physical_keycode == KEY_E:
		_on_hud_action("entrar")


func _zoom(f: float) -> void:
	var z := clampf(camera.zoom.x * f, 0.22, 1.6)
	camera.zoom = Vector2(z, z)
	DemoState.zoom = z


func _apply_time() -> void:
	view.apply_hour(time_min / 60.0, canvas_mod)


func _on_hud_action(what: String) -> void:
	match what:
		"personagem":
			DemoState.cid = "mulher" if player.cid == "homem" else "homem"
			DemoState.top_hue = null
			player.set_character(DemoState.cid)
		"cor":
			var hues := [null, 0.0, 0.08, 0.33, 0.75, 0.9, 0.5]
			var i := hues.find(DemoState.top_hue)
			DemoState.top_hue = hues[(i + 1) % hues.size()]
			player.set_top_hue(DemoState.top_hue)
		"tempo":
			time_min = 20.0 * 60.0 if time_min < 18.0 * 60.0 and time_min > 6.0 * 60.0 else 11.0 * 60.0
		"zoom_mais":
			_zoom(1.25)
		"zoom_menos":
			_zoom(0.8)
		"entrar":
			if player.world_pos.distance_to(DOOR) < 2.2:
				DemoState.return_pos = DOOR + Vector2(0, 1.2)
				get_tree().change_scene_to_file("res://src/demo/casa_interior.tscn")
