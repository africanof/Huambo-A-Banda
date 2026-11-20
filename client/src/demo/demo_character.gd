class_name DemoCharacter
extends Node2D
## Personagem HD do bairro de demonstração.
## Arte: folhas de animação geradas por IA (tools/art/ai). Programação: movimento
## no mundo isométrico, escolha de direção, animação, sombra e personalização.

signal moved(world_pos: Vector2)

## Root motion: a velocidade vem da própria animação. A passada de cada folha (metros que o
## pé assente "empurra" num ciclo de 8 frames) é medida na arte por build_assets.py; o corpo
## avança exatamente isso por ciclo → os pés ficam presos ao chão, sem deslizar.
const CADENCE_WALK := 2.0 ## ciclos de marcha por segundo (passo natural)
const CADENCE_RUN := 3.0
const BASE_FPS := 11.0 ## fps definidos nas SpriteFrames
const RADIUS := 0.35 ## m (colisão)

## Matiz original da peça de cima de cada personagem (para a personalização).
const TOP_HUE := {"homem": [0.58, 0.07, 0.2, 0.45], "mulher": [0.135, 0.03, 0.55, 0.55]}

var cid := "homem"
var world_pos := Vector2.ZERO
var facing_up := false
var facing_left := false
var last_dir := Vector2.DOWN ## última direção de movimento no mundo (para as vistas 3D)
var running := false
var obstacles: Array[Rect2] = [] ## pegadas no mundo (m)
## > 0: velocidade fixa (m/s) imposta pelo servidor; a cadência dos passos acompanha-a.
var fixed_speed := 0.0
var bounds := Rect2(0, 0, 64, 48)

var body := AnimatedSprite2D.new()
var shadow := Sprite2D.new()
var tag := Label.new()
var _moving := false


func _ready() -> void:
	y_sort_enabled = false
	shadow.texture = _shadow_texture()
	shadow.modulate = Color(0, 0, 0, 0.32)
	shadow.z_index = -4
	shadow.z_as_relative = false
	add_child(shadow)
	body.scale = Vector2(0.5, 0.5)
	body.centered = false
	var mat := ShaderMaterial.new()
	mat.shader = preload("res://src/demo/recolor.gdshader")
	body.material = mat
	add_child(body)
	tag.add_theme_font_override("font", preload("res://assets/fonts/Inter-SemiBold.otf"))
	tag.add_theme_font_size_override("font_size", 15)
	tag.add_theme_color_override("font_color", Color.WHITE)
	tag.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.75))
	tag.add_theme_constant_override("outline_size", 5)
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tag.size = Vector2(160, 20)
	add_child(tag)
	set_character(cid)


func set_character(id: String) -> void:
	cid = id
	var c: Dictionary = DemoAssets.manifest().characters[id]
	body.sprite_frames = DemoAssets.character_frames(id)
	var fs: Array = c.frame_size
	var anchor: Array = c.anchor
	body.offset = -Vector2(anchor[0], anchor[1])
	tag.text = c.name
	tag.position = Vector2(-80, -float(anchor[1]) * 0.5 - 26)
	var h: Array = TOP_HUE.get(id, [0.0, 0.0, 1.0, 1.0])
	var m: ShaderMaterial = body.material
	m.set_shader_parameter("source_hue", h[0])
	m.set_shader_parameter("hue_tolerance", h[1])
	m.set_shader_parameter("min_saturation", h[2])
	m.set_shader_parameter("min_value", h[3])
	m.set_shader_parameter("enabled", false)
	_update_anim()


## Personalização: cor da peça de cima (matiz 0..1); null repõe a original.
func set_top_hue(hue: Variant) -> void:
	var m: ShaderMaterial = body.material
	m.set_shader_parameter("enabled", hue != null)
	if hue != null:
		m.set_shader_parameter("target_hue", float(hue))


func step(dir_world: Vector2, delta: float) -> void:
	var before := world_pos
	var cadence := CADENCE_RUN if running else CADENCE_WALK
	if dir_world != Vector2.ZERO:
		var spd := fixed_speed * (1.0 if not running else 1.0) if fixed_speed > 0.0 else stride_for(dir_world) * cadence
		var v := dir_world.normalized() * spd * delta
		_try_move(v)
	# só "anda" se de facto saiu do sítio (encostado a uma parede fica parado)
	var dist := world_pos.distance_to(before)
	_moving = dist > 0.0001
	if _moving:
		last_dir = (world_pos - before).normalized()
		var s := Iso.to_screen(world_pos - before)
		screen_dir = s.normalized()
		if absf(s.y) > 0.01:
			facing_up = s.y < 0
		if absf(s.x) > 0.01:
			facing_left = s.x < 0
	if fixed_speed > 0.0 and _moving:
		cadence = (dist / maxf(delta, 0.0001)) / stride_for(world_pos - before)
	body.speed_scale = cadence * 8.0 / BASE_FPS if _moving else 1.0
	_update_anim()
	position = Iso.to_screen(world_pos)
	if _moving:
		moved.emit(world_pos)


## Personagem de outro jogador: a posição vem da rede (interpolada); a animação segue o deslocamento real.
func drive(new_pos: Vector2, delta: float) -> void:
	var d := new_pos - world_pos
	var dist := d.length()
	world_pos = new_pos
	_moving = dist > 0.002
	if _moving:
		last_dir = d.normalized()
		var s := Iso.to_screen(d)
		screen_dir = s.normalized()
		if absf(s.y) > 0.01:
			facing_up = s.y < 0
		if absf(s.x) > 0.01:
			facing_left = s.x < 0
		var cadence := (dist / maxf(delta, 0.0001)) / stride_for(d)
		body.speed_scale = clampf(cadence, 0.5, 8.0) * 8.0 / BASE_FPS
	else:
		body.speed_scale = 1.0
	_update_anim()
	position = Iso.to_screen(world_pos)


## Passada (m por ciclo) da folha que vai ser usada para esta direção.
func stride_for(dir_world: Vector2) -> float:
	var up := Iso.to_screen(dir_world).y < -0.01 or (absf(Iso.to_screen(dir_world).y) <= 0.01 and facing_up)
	var a: Dictionary = DemoAssets.manifest().characters[cid].anims["up" if up else "down"]
	return float(a.get("stride_m", 0.5))


func _try_move(v: Vector2) -> void:
	for candidate: Vector2 in [world_pos + v, world_pos + Vector2(v.x, 0), world_pos + Vector2(0, v.y)]:
		if _free(candidate):
			world_pos = candidate
			return


func _free(p: Vector2) -> bool:
	if not bounds.grow(-RADIUS).has_point(p):
		return false
	for r in obstacles:
		if r.grow(RADIUS).has_point(p):
			return false
	return true


## Direção no ecrã do último movimento (para escolher entre 8 direções).
var screen_dir := Vector2(0, 1)


func _update_anim() -> void:
	var dir := ("up" if facing_up else "down")
	var flip := facing_left
	# 8 direções: na horizontal do ecrã usa o perfil; na vertical, frente ou costas; nas diagonais, 3/4
	var a := rad_to_deg(screen_dir.angle()) # 0 = direita, 90 = baixo
	var frames := body.sprite_frames
	if frames and frames.has_animation("walk_side"):
		if absf(a) < 22.5 or absf(a) > 157.5:
			dir = "side"
			flip = absf(a) > 90.0
		elif absf(a - 90.0) < 22.5:
			dir = "front"
		elif absf(a + 90.0) < 22.5:
			dir = "back"
	var anim := ("walk_" if _moving else "idle_") + dir
	if body.animation != anim:
		body.play(anim)
	body.flip_h = flip
	# a âncora fica no centro, por isso o espelho não desloca a personagem
	body.offset.x = -float(DemoAssets.manifest().characters[cid].anchor[0])


static func _shadow_texture() -> Texture2D:
	var g := GradientTexture2D.new()
	g.width = 90
	g.height = 40
	g.fill = GradientTexture2D.FILL_RADIAL
	g.fill_from = Vector2(0.5, 0.5)
	g.fill_to = Vector2(1.0, 0.5)
	var gr := Gradient.new()
	gr.set_color(0, Color(1, 1, 1, 1))
	gr.set_color(1, Color(1, 1, 1, 0))
	g.gradient = gr
	var t := g
	return t
