class_name View3D
extends SubViewportContainer
## Vistas 3D como no Vida na Banda: «por cima do ombro» (3.ª pessoa) e «olhos» (1.ª pessoa).
## O mundo é o mesmo do jogo 2D (metros, servidor autoritativo); aqui só se desenha em 3D:
##   · chão e ruas reais com as mesmas texturas;
##   · edifícios como caixas com a planta real, pintadas com a própria arte isométrica
##     (cada fachada é recortada da imagem por um shader, sem trabalho no processador);
##   · árvores, candeeiros, carros e pessoas como painéis virados para a câmara.
## Arrastar = olhar à volta; joystick (ou WASD) = andar na direção para onde se olha.

const PX_PER_M := 88.0 ## altura: píxeis do jogo por metro (personagem ≈ 1,7 m)
const FACADE := preload("res://src/game/facade.gdshader")

var mode := "ombro" ## "ombro" | "olhos"
var yaw := 0.0 ## rad, 0 = a olhar para +y do mundo (sul)
var pitch := -0.12
var vp := SubViewport.new()
var root := Node3D.new()
var cam := Camera3D.new()
var people: Dictionary = {} ## eid -> AnimatedSprite3D
var joy := Vector2.ZERO ## x = direita, y = frente (−1..1)
var _joy_ui: Control
var _joy_knob: Control
var _joy_finger := -1
var _look_finger := -1
var _view: BairroView


func _ready() -> void:
	stretch = true
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	size = get_viewport().get_visible_rect().size
	get_viewport().size_changed.connect(func() -> void: size = get_viewport().get_visible_rect().size)
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(vp)
	vp.add_child(root)
	vp.own_world_3d = true
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("9cc6e8") # céu do planalto
	env.fog_enabled = true
	env.fog_light_color = Color("c9dcea")
	env.fog_density = 0.008
	var we := WorldEnvironment.new()
	we.environment = env
	root.add_child(we)
	cam.fov = 70.0
	cam.near = 0.05
	cam.far = 400.0
	root.add_child(cam)
	_build_joystick()


# ------------------------------------------------------------------ construção

func build(v: BairroView) -> void:
	_view = v
	var data := v.data
	var size := v.size
	var m := BairroView.MARGIN
	_ground(Rect2(-m, -m, size.x + 2 * m, size.y + 2 * m), str(data.ground[0].kind) if data.get("osm", false) else "terra")
	if data.get("osm", false):
		_roads(data.get("roads", []))
	else:
		_tile_ground(v)
	for b: Dictionary in data.buildings:
		_building(b)
	for p: Dictionary in data.props:
		_billboard(str(p.id), Vector2(p.at[0], p.at[1]))
	for pt: Dictionary in data.get("portals", []):
		_label3d("→ " + str(pt.name), Vector3(pt.at[0], 2.2, pt.at[1]), 64)


func _mat(kind: String) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_texture = load("res://assets/demo/chao_%s.png" % kind)
	m.uv1_triplanar = false
	m.texture_repeat = true
	return m


func _ground(r: Rect2, kind: String) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_quad(st, [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)], 0.0)
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = _mat(kind)
	root.add_child(mi)


## Quadrilátero no chão (metros) com UV fixos ao mundo: 4 m por repetição da textura.
func _quad(st: SurfaceTool, pts: Array, h: float) -> void:
	for i: int in [0, 1, 2, 0, 2, 3]:
		var p: Vector2 = pts[i]
		st.set_uv(p / 4.0)
		st.add_vertex(Vector3(p.x, h, p.y))


func _roads(roads: Array) -> void:
	var sts := {}
	for k: String in ["calcada", "asfalto", "terra"]:
		sts[k] = SurfaceTool.new()
		sts[k].begin(Mesh.PRIMITIVE_TRIANGLES)
	for pass_i in 2:
		for r: Dictionary in roads:
			var paved := bool(r.paved)
			var hw := float(r.w) / 2.0 + (0.0 if pass_i == 1 else (2.0 if paved else 0.8))
			var k := "calcada" if pass_i == 0 and paved else ("asfalto" if paved else "terra")
			var h := 0.01 + 0.01 * pass_i
			var pts: Array = r.pts
			for i in range(pts.size() - 1):
				var a := Vector2(pts[i][0], pts[i][1])
				var b := Vector2(pts[i + 1][0], pts[i + 1][1])
				if a.distance_to(b) < 0.05:
					continue
				var n := (b - a).normalized().orthogonal() * hw
				_quad(sts[k], [a + n, b + n, b - n, a - n], h)
			for q: Array in pts:
				var c := Vector2(q[0], q[1])
				for j in 10:
					var a0 := c + Vector2.from_angle(TAU * j / 10.0) * hw
					var a1 := c + Vector2.from_angle(TAU * (j + 1) / 10.0) * hw
					_quad(sts[k], [c, a0, a1, a1], h)
	for k: String in sts:
		var mi := MeshInstance3D.new()
		mi.mesh = sts[k].commit()
		var mat := _mat(k)
		if k == "terra":
			mat.albedo_color = Color(0.85, 0.78, 0.72)
		mi.material_override = mat
		root.add_child(mi)


## Bairros com chão por mosaicos (Cidade Baixa): avenida, passeios e relva.
func _tile_ground(v: BairroView) -> void:
	var t := float(v.data.tile)
	var sts := {}
	for i in range(int(v.size.x / t)):
		for j in range(int(v.size.y / t)):
			var k := v._ground_kind(i * t + 0.1, j * t + 0.1)
			if k == "terra":
				continue
			if not sts.has(k):
				sts[k] = SurfaceTool.new()
				sts[k].begin(Mesh.PRIMITIVE_TRIANGLES)
			var p := Vector2(i, j) * t
			_quad(sts[k], [p, p + Vector2(t, 0), p + Vector2(t, t), p + Vector2(0, t)], 0.01)
	for k: String in sts:
		var mi := MeshInstance3D.new()
		mi.mesh = sts[k].commit()
		mi.material_override = _mat(k)
		root.add_child(mi)


## Edifício: caixa com a planta real; as 4 paredes e o telhado pintados com a arte isométrica.
func _building(b: Dictionary) -> void:
	var o := DemoAssets.object(str(b.id))
	if o.is_empty():
		return
	var texture := DemoAssets.texture_of(str(b.id))
	var sc := float(o.get("scale", 1.0))
	var w := float(b.fp[0])
	var d := float(b.fp[1])
	var x := float(b.at[0])
	var y := float(b.at[1])
	var F := Vector2(o.anchor[0], o.anchor[1]) # canto da frente (px da textura)
	var rel := func(dx: float, dy: float) -> Vector2: return Vector2((dx - dy) * 64.0, (dx + dy) * 32.0) / sc
	var A: Vector2 = F + rel.call(-w, 0.0) # canto esquerdo da base
	var B: Vector2 = F + rel.call(0.0, -d) # canto direito da base
	var hpx := _wall_height_px(texture, A, B)
	var up := Vector2(0, -hpx)
	var hm := hpx * sc / PX_PER_M
	var tsz := texture.get_size()
	# faces: [cantos 3D (u0v0, u1v0, u1v1, u0v1), p0, eu, ev, sombra]
	var faces := [
		[[Vector3(x, 0, y + d), Vector3(x + w, 0, y + d), Vector3(x + w, hm, y + d), Vector3(x, hm, y + d)], A, F - A, up, 1.0], # frente-esquerda
		[[Vector3(x + w, 0, y), Vector3(x + w, 0, y + d), Vector3(x + w, hm, y + d), Vector3(x + w, hm, y)], B, F - B, up, 0.88], # frente-direita
		[[Vector3(x + w, 0, y), Vector3(x, 0, y), Vector3(x, hm, y), Vector3(x + w, hm, y)], A, F - A, up, 0.8], # traseiras (repete a frente)
		[[Vector3(x, 0, y + d), Vector3(x, 0, y), Vector3(x, hm, y), Vector3(x, hm, y + d)], B, F - B, up, 0.75],
		[[Vector3(x, hm, y), Vector3(x + w, hm, y), Vector3(x + w, hm, y + d), Vector3(x, hm, y + d)],
			F + rel.call(-w, -d) + up, rel.call(w, 0.0), rel.call(0.0, d), 1.0], # telhado
	]
	for f: Array in faces:
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		var c: Array = f[0]
		var uvs := [Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)]
		for i: int in [0, 1, 2, 0, 2, 3]:
			st.set_uv(uvs[i])
			st.add_vertex(c[i])
		var mi := MeshInstance3D.new()
		mi.mesh = st.commit()
		var mat := ShaderMaterial.new()
		mat.shader = FACADE
		mat.set_shader_parameter("tex", texture)
		mat.set_shader_parameter("tsize", tsz)
		mat.set_shader_parameter("p0", f[1])
		mat.set_shader_parameter("eu", f[2])
		mat.set_shader_parameter("ev", f[3])
		mat.set_shader_parameter("shade", f[4])
		mi.material_override = mat
		root.add_child(mi)
	if str(b.get("label", "")) != "" or o.has("name"):
		_label3d(str(b.get("label", o.get("name", ""))), Vector3(x + w / 2, hm + 1.2, y + d / 2), 48)


## Altura das paredes (px da textura): onde começa a arte por cima dos cantos esquerdo e direito.
func _wall_height_px(texture: Texture2D, A: Vector2, B: Vector2) -> float:
	var img := texture.get_image()
	if img == null:
		return 120.0
	if img.is_compressed():
		img.decompress()
	var hs: Array[float] = []
	for corner: Vector2 in [A, B]:
		for dx: int in [3, 6, 9, -3, -6, -9]:
			var cx := clampi(int(corner.x) + dx, 0, img.get_width() - 1)
			for yy in range(0, int(corner.y)):
				if img.get_pixel(cx, yy).a > 0.5:
					hs.append(corner.y - yy)
					break
	if hs.is_empty():
		return 120.0
	hs.sort()
	return maxf(40.0, hs[hs.size() / 2])


func _billboard(id: String, at: Vector2) -> void:
	var o := DemoAssets.object(id)
	if o.is_empty():
		return
	var s := Sprite3D.new()
	s.texture = DemoAssets.texture_of(id)
	s.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	s.shaded = false
	s.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	s.pixel_size = float(o.get("scale", 1.0)) / PX_PER_M
	s.centered = false
	s.offset = Vector2(-float(o.anchor[0]), -(s.texture.get_height() - float(o.anchor[1])))
	s.position = Vector3(at.x, 0, at.y)
	root.add_child(s)


func _label3d(text: String, at: Vector3, fs: int) -> void:
	var l := Label3D.new()
	l.text = text
	l.font = preload("res://assets/fonts/Inter-SemiBold.otf")
	l.font_size = fs
	l.pixel_size = 0.006
	l.outline_size = 12
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.no_depth_test = false
	l.position = at
	root.add_child(l)


# ------------------------------------------------------------------ pessoas

func sync_people(avatars: Dictionary, self_id: int) -> void:
	for id: int in people.keys():
		if not avatars.has(id):
			people[id].queue_free()
			people.erase(id)
	for id: int in avatars:
		var c: DemoCharacter = avatars[id]
		if not people.has(id):
			var s := AnimatedSprite3D.new()
			s.sprite_frames = c.body.sprite_frames
			s.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
			s.shaded = false
			s.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
			s.pixel_size = 0.5 / PX_PER_M
			s.centered = false
			var tag := Label3D.new()
			tag.text = c.tag.text
			tag.font_size = 40
			tag.pixel_size = 0.005
			tag.outline_size = 10
			tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			tag.position = Vector3(0, 2.1, 0)
			s.add_child(tag)
			root.add_child(s)
			people[id] = s
		var s3: AnimatedSprite3D = people[id]
		s3.position = Vector3(c.world_pos.x, 0, c.world_pos.y)
		# o mesmo quadro do 2D, mas «de frente» ou «de costas» em relação a esta câmara
		var tex: Texture2D = c.body.sprite_frames.get_frame_texture(c.body.animation, c.body.frame)
		if tex:
			s3.offset = Vector2(-tex.get_width() * 0.5, 0)
		var moving := str(c.body.animation).begins_with("walk")
		var fwd := Vector2(sin(yaw), cos(yaw))
		var toward_cam := c.last_dir.dot(fwd) < 0.0 if c.last_dir != Vector2.ZERO else true
		var anim := ("walk_" if moving else "idle_") + ("down" if toward_cam else "up")
		if s3.animation != anim:
			s3.play(anim)
		s3.speed_scale = c.body.speed_scale
		s3.flip_h = c.last_dir.cross(fwd) > 0.0 if toward_cam else c.last_dir.cross(fwd) < 0.0
		s3.visible = not (mode == "olhos" and id == self_id)


# ------------------------------------------------------------------ câmara e controlos

func update_camera(me: Vector2, delta: float) -> void:
	var fwd := Vector3(sin(yaw), 0, cos(yaw))
	var eye := Vector3(me.x, 1.6, me.y)
	if mode == "olhos":
		cam.position = eye
	else:
		var want := Vector3(me.x, 2.3, me.y) - fwd * 3.6
		cam.position = cam.position.lerp(want, clampf(delta * 8.0, 0.0, 1.0)) if cam.position != Vector3.ZERO else want
	var look := eye + fwd * 10.0 + Vector3(0, tan(pitch) * 10.0, 0)
	cam.look_at(look, Vector3.UP)


## Direção de andar no mundo (metros): joystick/WASD relativos à direção para onde se olha.
func move_dir(keys: Vector2) -> Vector2:
	var j := joy if joy != Vector2.ZERO else Vector2(keys.x, -keys.y)
	if j == Vector2.ZERO:
		return Vector2.ZERO
	var fwd := Vector2(sin(yaw), cos(yaw))
	var right := Vector2(-fwd.y, fwd.x) * -1.0
	return (fwd * j.y + right * j.x).limit_length(1.0)


func _gui_input(e: InputEvent) -> void:
	# arrastar fora do joystick = olhar à volta (rato ou dedo)
	if e is InputEventMouseMotion and (e.button_mask & MOUSE_BUTTON_MASK_LEFT) and _joy_finger == -1:
		yaw -= e.relative.x * 0.006
		pitch = clampf(pitch - e.relative.y * 0.004, -0.9, 0.6)
		accept_event()
	elif e is InputEventScreenDrag and e.index == _look_finger:
		yaw -= e.relative.x * 0.006
		pitch = clampf(pitch - e.relative.y * 0.004, -0.9, 0.6)
		accept_event()
	elif e is InputEventScreenTouch:
		if e.pressed and _look_finger == -1 and e.index != _joy_finger:
			_look_finger = e.index
		elif not e.pressed and e.index == _look_finger:
			_look_finger = -1


func _build_joystick() -> void:
	_joy_ui = Panel.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0, 0, 0, 0.35)
	sb.set_corner_radius_all(70)
	_joy_ui.add_theme_stylebox_override("panel", sb)
	_joy_ui.size = Vector2(140, 140)
	_joy_ui.anchor_top = 1.0
	_joy_ui.anchor_bottom = 1.0
	_joy_ui.position = Vector2(28, -0)
	add_child(_joy_ui)
	_joy_knob = Panel.new()
	var kb := StyleBoxFlat.new()
	kb.bg_color = Color(0.95, 0.72, 0.18, 0.9)
	kb.set_corner_radius_all(30)
	_joy_knob.add_theme_stylebox_override("panel", kb)
	_joy_knob.size = Vector2(60, 60)
	_joy_knob.position = Vector2(40, 40)
	_joy_knob.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_joy_ui.add_child(_joy_knob)
	_joy_ui.gui_input.connect(_on_joy)
	resized.connect(func() -> void: _joy_ui.position = Vector2(28, size.y - 140 - 130))
	_joy_ui.position = Vector2(28, size.y - 140 - 130)


func _on_joy(e: InputEvent) -> void:
	var p := Vector2.INF
	if e is InputEventMouseButton:
		if e.pressed:
			_joy_finger = 0
			p = e.position
		else:
			_joy_finger = -1
	elif e is InputEventMouseMotion and _joy_finger == 0:
		p = e.position
	elif e is InputEventScreenTouch:
		_joy_finger = e.index if e.pressed else -1
		if e.pressed:
			p = e.position
	elif e is InputEventScreenDrag and e.index == _joy_finger:
		p = e.position
	if _joy_finger == -1:
		joy = Vector2.ZERO
		_joy_knob.position = Vector2(40, 40)
		_joy_ui.accept_event()
		return
	if p != Vector2.INF:
		var v := (p - Vector2(70, 70)) / 70.0
		if v.length() > 1.0:
			v = v.normalized()
		joy = Vector2(v.x, -v.y) if v.length() > 0.12 else Vector2.ZERO
		_joy_knob.position = Vector2(40, 40) + v * 45.0
	_joy_ui.accept_event()
