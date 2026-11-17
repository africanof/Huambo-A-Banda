class_name DemoCharacter
extends Node2D
## Personagem HD do bairro de demonstração.
## Arte: folhas de animação geradas por IA (tools/art/ai). Programação: movimento
## no mundo isométrico, escolha de direção, animação, sombra e personalização.

signal moved(world_pos: Vector2)

const WALK_SPEED := 3.2 ## m/s
const RUN_SPEED := 6.0
const RADIUS := 0.35 ## m (colisão)

## Matiz original da peça de cima de cada personagem (para a personalização).
const TOP_HUE := {"homem": [0.58, 0.07, 0.2, 0.45], "mulher": [0.135, 0.03, 0.55, 0.55]}

var cid := "homem"
var world_pos := Vector2.ZERO
var facing_up := false
var facing_left := false
var running := false
var obstacles: Array[Rect2] = [] ## pegadas no mundo (m)
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
	_moving = dir_world != Vector2.ZERO
	if _moving:
		var v := dir_world.normalized() * (RUN_SPEED if running else WALK_SPEED) * delta
		_try_move(v)
		var s := Iso.to_screen(dir_world)
		if absf(s.y) > 0.01:
			facing_up = s.y < 0
		if absf(s.x) > 0.01:
			facing_left = s.x < 0
	body.speed_scale = 1.6 if running else 1.0
	_update_anim()
	position = Iso.to_screen(world_pos)
	if _moving:
		moved.emit(world_pos)


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


func _update_anim() -> void:
	var anim := ("walk_" if _moving else "idle_") + ("up" if facing_up else "down")
	if body.animation != anim:
		body.play(anim)
	body.flip_h = facing_left
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
