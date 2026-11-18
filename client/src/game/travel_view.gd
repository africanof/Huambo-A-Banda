class_name TravelView
extends SubViewportContainer
## Viagem na primeira pessoa (como no Vida na Banda): vês a estrada de dentro do candongueiro,
## do táxi ou da kupapata — a beira da estrada do Huambo a passar, outdoors com anúncios do
## jogo, e o interior do veículo à frente. Arrastar = olhar à volta.

signal finished

const PX_PER_M := 88.0
const ROAD_W := 7.0
const ADS := [
	"Cantina Ekuikui · funge com peixe 1.500 Kz",
	"Banco Planalto · guarda o teu kumbu a salvo",
	"Hotel iU · durma bem no Huambo",
	"Kanda Móvel · saldo e telemóveis",
	"Padaria Planalto · pão quente todas as manhãs",
	"Discoteca Kizomba · sexta à noite",
	"Escola Primária · estudar abre portas",
	"Churrasqueira · frango no carvão",
]

var by := "candongueiro"
var seconds := 9.0
var dest_name := ""
var vp := SubViewport.new()
var root := Node3D.new()
var cam := Camera3D.new()
var speed := 13.0
var _t := 0.0
var _look := 0.0
var _items: Array[Node3D] = []
var _rng := RandomNumberGenerator.new()
var _frame := TextureRect.new()
var _caption := Label.new()
var _done := false


func _ready() -> void:
	stretch = true
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	size = get_viewport().get_visible_rect().size
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(vp)
	vp.own_world_3d = true
	vp.add_child(root)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("9cc6e8")
	env.fog_enabled = true
	env.fog_light_color = Color("cfe0ec")
	env.fog_density = 0.012
	var we := WorldEnvironment.new()
	we.environment = env
	root.add_child(we)
	cam.fov = 72.0
	cam.far = 260.0
	cam.position = Vector3(1.2 if by != "kupapata" else 0.6, 1.5 if by != "kupapata" else 1.7, 0)
	root.add_child(cam)
	_rng.seed = hash(dest_name)
	speed = {"candongueiro": 13.0, "taxi": 15.0, "kupapata": 11.0}.get(by, 13.0)
	_build_road()
	for i in 70:
		_spawn(-float(i) * 4.0 - 6.0)
	# interior do veículo (para-brisas transparente: vê-se a estrada)
	_frame.texture = DemoAssets.texture_of("via_veiculo_" + by)
	_frame.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_frame.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_frame.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_frame)
	_caption.text = "%s para %s" % [{"candongueiro": "Candongueiro", "taxi": "Táxi", "kupapata": "Kupapata"}.get(by, by), dest_name]
	_caption.add_theme_font_override("font", preload("res://assets/fonts/Inter-Bold.otf"))
	_caption.add_theme_font_size_override("font_size", 22)
	_caption.add_theme_color_override("font_outline_color", Color.BLACK)
	_caption.add_theme_constant_override("outline_size", 8)
	_caption.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	_caption.position.y = 18
	_caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(_caption)


func _mat(kind: String, tint := Color.WHITE) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_texture = load("res://assets/demo/chao_%s.png" % kind)
	m.albedo_color = tint
	m.texture_repeat = true
	m.uv1_scale = Vector3(1, 60, 1)
	return m


func _strip(x0: float, x1: float, kind: String, h: float, tint := Color.WHITE) -> void:
	var mi := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(x1 - x0, 260)
	mi.mesh = pm
	var m := _mat(kind, tint)
	m.uv1_scale = Vector3((x1 - x0) / 4.0, 65, 1)
	mi.material_override = m
	mi.position = Vector3((x0 + x1) / 2.0, h, -120)
	root.add_child(mi)
	if kind == "asfalto":
		_road = m


var _road: StandardMaterial3D


func _build_road() -> void:
	var paved := by != "kupapata" or _rng.randf() < 0.5
	_strip(-80, 80, "terra", 0.0)
	_strip(-ROAD_W / 2 - 2.5, ROAD_W / 2 + 2.5, "calcada" if paved else "terra", 0.01, Color.WHITE if paved else Color(0.9, 0.85, 0.8))
	_strip(-ROAD_W / 2, ROAD_W / 2, "asfalto" if paved else "terra", 0.02, Color.WHITE if paved else Color(0.8, 0.72, 0.66))


## Uma coisa da beira da estrada (casas, árvores, pessoas, bancas, outdoors…) a z.
func _spawn(z: float) -> void:
	var kinds := ["facade", "facade", "tree", "tree", "person", "stall", "lamp", "pole", "kiosk", "small", "car", "billboard", "wall"]
	var k: String = kinds[_rng.randi() % kinds.size()]
	var pool: Array = []
	for id: Variant in DemoAssets._kit_objects:
		if str(id).begins_with("via_" + k):
			pool.append(id)
	if pool.is_empty():
		return
	var id: String = pool[_rng.randi() % pool.size()]
	var o := DemoAssets.object(id)
	var side := -1.0 if _rng.randf() < 0.5 else 1.0
	var dist: float = ROAD_W / 2 + {"facade": 9.0, "billboard": 7.0, "wall": 6.0}.get(k, 3.2) + _rng.randf() * 2.5
	if k == "car":
		dist = ROAD_W / 2 - 0.9
	var s := Sprite3D.new()
	s.texture = DemoAssets.texture_of(id)
	s.billboard = BaseMaterial3D.BILLBOARD_DISABLED
	s.shaded = false
	s.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	var h_m: float = {"facade": 9.0, "tree": 7.0, "person": 1.7, "stall": 2.3, "lamp": 6.0, "pole": 7.0, "kiosk": 2.4, "small": 0.9, "car": 1.6, "billboard": 5.5, "wall": 2.2}.get(k, 2.0)
	s.pixel_size = h_m / float(s.texture.get_height())
	s.centered = false
	s.offset = Vector2(-s.texture.get_width() / 2.0, 0)
	s.position = Vector3(side * dist, 0, z)
	s.rotation.y = -side * 0.35 # virado um pouco para a estrada
	root.add_child(s)
	if k == "billboard":
		var l := Label3D.new()
		l.text = ADS[_rng.randi() % ADS.size()]
		l.font = preload("res://assets/fonts/Inter-Bold.otf")
		l.font_size = 64
		l.pixel_size = 0.0045
		l.modulate = Color("2a1d10")
		l.outline_size = 0
		l.width = 900
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.position = Vector3(0, h_m * 0.68, 0.05)
		s.add_child(l)
	_items.append(s)


func _process(delta: float) -> void:
	_t += delta
	# o veículo avança: o mundo passa por nós (a estrada é infinita: as coisas que ficam para trás voltam lá à frente)
	var dz := speed * delta
	for it in _items:
		it.position.z += dz
		if it.position.z > 6.0:
			it.position.z -= 280.0
	if _road:
		_road.uv1_offset.y -= dz / 4.0
	var bob := sin(_t * 9.0) * (0.03 if by == "kupapata" else 0.015)
	cam.position.y = (1.7 if by == "kupapata" else 1.5) + bob
	cam.rotation = Vector3(-0.04, _look, sin(_t * 1.3) * 0.01)
	_frame.position.y = bob * 60.0
	if _t >= seconds and not _done:
		_done = true
		finished.emit()


func _gui_input(e: InputEvent) -> void:
	if (e is InputEventMouseMotion and (e.button_mask & MOUSE_BUTTON_MASK_LEFT)) or e is InputEventScreenDrag:
		_look = clampf(_look - e.relative.x * 0.005, -1.4, 1.4)
		accept_event()
