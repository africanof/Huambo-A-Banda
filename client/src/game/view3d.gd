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
var room_bounds := Rect2() ## dentro de uma sala: a câmara não sai das paredes
var _boards: Array = [] ## [Sprite3D, id base] — painéis que mudam de arte com o lado da câmara
var _board_rot := -1
var _env: Environment
var _cam_dist := 3.6 ## distância atual da câmara (encurta quando há uma parede atrás)


## Luz do dia/noite igual à vista aérea; lá dentro, luz acesa.
func set_light(col: Color, night: float, inside: bool) -> void:
	self_modulate = Color.WHITE if inside else col
	if _env:
		var day := Color("9cc6e8")
		var dusk := Color("1b2140")
		_env.background_color = day.lerp(dusk, 0.0 if inside else night)
		_env.fog_light_color = Color("c9dcea").lerp(Color("2a3150"), 0.0 if inside else night)


## Projeção isométrica relativa (px do jogo) de um deslocamento no chão, vista do ângulo r.
static func rel(r: int, dx: float, dy: float) -> Vector2:
	var v := Vector2(dx, dy)
	match r:
		1: v = Vector2(-dy, dx)
		2: v = Vector2(-dx, -dy)
		3: v = Vector2(dy, -dx)
	return Vector2((v.x - v.y) * 64.0, (v.x + v.y) * 32.0)


## Ângulo de arte (0–3) mais parecido com a direção para onde a câmara 3D olha.
func art_rot() -> int:
	var fwd := Vector2(sin(yaw), cos(yaw))
	var looks := [Vector2(-1, -1), Vector2(-1, 1), Vector2(1, 1), Vector2(1, -1)]
	var best := 0
	for r in 4:
		if fwd.dot(looks[r].normalized()) > fwd.dot(looks[best].normalized()):
			best = r
	return best


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
	_env = env
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
	for i: Dictionary in v.interiors:
		_room(i)


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
		[[Vector3(x, 0, y + d), Vector3(x + w, 0, y + d), Vector3(x + w, hm, y + d), Vector3(x, hm, y + d)], A, F - A, up, 1.0, texture], # frente-esquerda
		[[Vector3(x + w, 0, y), Vector3(x + w, 0, y + d), Vector3(x + w, hm, y + d), Vector3(x + w, hm, y)], B, F - B, up, 0.88, texture], # frente-direita
		[[Vector3(x, hm, y), Vector3(x + w, hm, y), Vector3(x + w, hm, y + d), Vector3(x, hm, y + d)],
			F + rel.call(-w, -d) + up, rel.call(w, 0.0), rel.call(0.0, d), 1.0, texture], # telhado
	]
	var back_id := DemoAssets.angle_id(str(b.id), 2)
	if back_id != str(b.id):
		# traseiras verdadeiras: a arte vista por trás (canto da frente = (x, y))
		var ob := DemoAssets.object(back_id)
		var tb := DemoAssets.texture_of(back_id)
		var sb := float(ob.get("scale", sc))
		var F2 := Vector2(ob.anchor[0], ob.anchor[1])
		var Pyw: Vector2 = F2 + View3D.rel(2, w, 0) / sb # (x+w, y)
		var Pxd: Vector2 = F2 + View3D.rel(2, 0, d) / sb # (x, y+d)
		var h2 := _wall_height_px(tb, Pyw, Pxd)
		var up2 := Vector2(0, -hpx * sc / sb)
		faces.append([[Vector3(x + w, 0, y), Vector3(x, 0, y), Vector3(x, hm, y), Vector3(x + w, hm, y)], Pyw, F2 - Pyw, up2, 0.8, tb])
		faces.append([[Vector3(x, 0, y + d), Vector3(x, 0, y), Vector3(x, hm, y), Vector3(x, hm, y + d)], Pxd, F2 - Pxd, up2, 0.75, tb])
	else:
		faces.append([[Vector3(x + w, 0, y), Vector3(x, 0, y), Vector3(x, hm, y), Vector3(x + w, hm, y)], A, F - A, up, 0.8, texture])
		faces.append([[Vector3(x, 0, y + d), Vector3(x, 0, y), Vector3(x, hm, y), Vector3(x, hm, y + d)], B, F - B, up, 0.75, texture])
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
		mat.set_shader_parameter("tex", f[5])
		mat.set_shader_parameter("tsize", (f[5] as Texture2D).get_size())
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
	_boards.append([s, id])


## Troca a arte dos painéis (árvores, carros, bancas, móveis) para o lado de onde a câmara olha.
func _update_boards() -> void:
	var r := art_rot()
	if r == _board_rot:
		return
	_board_rot = r
	for bd: Array in _boards:
		var s: Sprite3D = bd[0]
		var aid := DemoAssets.angle_id(str(bd[1]), r)
		var o := DemoAssets.object(aid)
		s.texture = DemoAssets.texture_of(aid)
		s.pixel_size = float(o.get("scale", 1.0)) / PX_PER_M
		s.offset = Vector2(-float(o.anchor[0]), -(s.texture.get_height() - float(o.anchor[1])))


## Sala 3D: chão e as 4 paredes pintados com a arte da sala (as paredes da frente vêm da arte
## da sala vista do outro lado, quando existe); a mobília em painéis.
func _room(i: Dictionary) -> void:
	var rid := str(i.get("room", ""))
	var o := DemoAssets.object(rid)
	if o.is_empty():
		return
	var r: Array = i.rect
	var x := float(r[0])
	var y := float(r[1])
	var w := float(r[2])
	var d := float(r[3])
	var t0 := DemoAssets.texture_of(rid)
	var rs := float(i.get("room_scale", 1.0)) # sala maior do que a arte original
	var s0 := float(o.get("scale", 1.0)) * rs
	var F := Vector2(o.anchor[0], o.anchor[1])
	var back: Vector2 = F + View3D.rel(0, -w, -d) / s0
	var hpx := _top_above(t0, back)
	var hm := clampf(hpx * s0 / PX_PER_M, 2.6, 4.0)
	var up := Vector2(0, -hm * PX_PER_M / s0)
	var faces := [
		[[Vector3(x, 0, y), Vector3(x + w, 0, y), Vector3(x + w, 0, y + d), Vector3(x, 0, y + d)], back, View3D.rel(0, w, 0) / s0, View3D.rel(0, 0, d) / s0, 1.0, t0], # chão
		[[Vector3(x, 0, y), Vector3(x, 0, y + d), Vector3(x, hm, y + d), Vector3(x, hm, y)], back, View3D.rel(0, 0, d) / s0, up, 0.9, t0], # parede x0
		[[Vector3(x, 0, y), Vector3(x + w, 0, y), Vector3(x + w, hm, y), Vector3(x, hm, y)], back, View3D.rel(0, w, 0) / s0, up, 1.0, t0], # parede y0
	]
	var rid2 := DemoAssets.angle_id(rid, 2)
	var o2 := DemoAssets.object(rid2)
	var t2 := DemoAssets.texture_of(rid2)
	var s2 := float(o2.get("scale", s0 / rs)) * rs
	var back2: Vector2 = Vector2(o2.anchor[0], o2.anchor[1]) + View3D.rel(2, w, d) / s2 if rid2 != rid else back
	var up2 := Vector2(0, -hm * PX_PER_M / s2)
	var r2 := 2 if rid2 != rid else 0
	faces.append([[Vector3(x + w, 0, y + d), Vector3(x + w, 0, y), Vector3(x + w, hm, y), Vector3(x + w, hm, y + d)], back2,
		View3D.rel(r2, 0, -d if r2 == 2 else d) / s2, up2, 0.9, t2]) # parede x0+w
	faces.append([[Vector3(x + w, 0, y + d), Vector3(x, 0, y + d), Vector3(x, hm, y + d), Vector3(x + w, hm, y + d)], back2,
		View3D.rel(r2, -w if r2 == 2 else w, 0) / s2, up2, 1.0, t2]) # parede y0+d
	for f: Array in faces:
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		var c: Array = f[0]
		var uvs := [Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)]
		for k: int in [0, 1, 2, 0, 2, 3]:
			st.set_uv(uvs[k])
			st.add_vertex(c[k])
		var mi := MeshInstance3D.new()
		mi.mesh = st.commit()
		var mat := ShaderMaterial.new()
		mat.shader = FACADE
		mat.set_shader_parameter("tex", f[5])
		mat.set_shader_parameter("tsize", (f[5] as Texture2D).get_size())
		mat.set_shader_parameter("p0", f[1])
		mat.set_shader_parameter("eu", f[2])
		mat.set_shader_parameter("ev", f[3])
		mat.set_shader_parameter("shade", f[4])
		mi.material_override = mat
		root.add_child(mi)
	# teto (só se vê de baixo: em 1.ª pessoa já não aparece o céu por cima das paredes)
	var ceil_mi := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(w, d)
	pm.flip_faces = true
	ceil_mi.mesh = pm
	var cm := StandardMaterial3D.new()
	cm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	cm.albedo_color = Color("eae4da")
	ceil_mi.material_override = cm
	ceil_mi.position = Vector3(x + w / 2.0, hm, y + d / 2.0)
	root.add_child(ceil_mi)
	for fu: Dictionary in i.get("furniture", []):
		var fo := DemoAssets.object(str(fu.id))
		if fo.is_empty():
			continue
		var fp := Vector2(fo.footprint[0], fo.footprint[1])
		_billboard(str(fu.id), Vector2(fu.at[0], fu.at[1]) + fp / 2.0)


## Altura (px) da arte por cima de um ponto da imagem (canto do fundo da sala).
func _top_above(texture: Texture2D, p: Vector2) -> float:
	var img := texture.get_image()
	if img == null:
		return 300.0
	if img.is_compressed():
		img.decompress()
	var cx := clampi(int(p.x), 0, img.get_width() - 1)
	for yy in range(0, int(p.y)):
		if img.get_pixel(cx, yy).a > 0.5:
			return p.y - yy
	return 300.0


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
			var rm := ShaderMaterial.new()
			rm.shader = preload("res://src/demo/recolor3d.gdshader")
			s.material_override = rm
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
		# 8 direções: ângulo entre para onde a pessoa vai e para onde a câmara olha
		var fwd := Vector2(sin(yaw), cos(yaw))
		var rel := rad_to_deg(fwd.angle_to(c.last_dir)) # 0 = de costas para nós, ±180 = de frente
		var ar := absf(rel)
		var dir := "back" if ar < 22.5 else ("up" if ar < 67.5 else ("side" if ar < 112.5 else ("down" if ar < 157.5 else "front")))
		if not s3.sprite_frames.has_animation("walk_" + dir):
			dir = "up" if ar < 90.0 else "down"
		var anim := ("walk_" if moving else "idle_") + dir
		if s3.animation != anim:
			s3.play(anim)
		s3.speed_scale = c.body.speed_scale
		s3.flip_h = rel < 0.0 if dir != "side" else rel > 0.0
		# a mesma cor de roupa escolhida pelo jogador
		var m2: ShaderMaterial = c.body.material
		var m3: ShaderMaterial = s3.material_override
		if m3 and tex:
			m3.set_shader_parameter("texture_albedo", tex) # o quadro atual da animação
		if m2 and m3:
			m3.set_shader_parameter("enabled", m2.get_shader_parameter("enabled"))
			m3.set_shader_parameter("target_hue", m2.get_shader_parameter("target_hue"))
			m3.set_shader_parameter("source_hue", m2.get_shader_parameter("source_hue"))
		s3.visible = not (mode == "olhos" and id == self_id)
		var lbl: Label3D = s3.get_child(0) if s3.get_child_count() > 0 else null
		if lbl:
			lbl.visible = id != self_id


# ------------------------------------------------------------------ câmara e controlos

func update_camera(me: Vector2, delta: float) -> void:
	_update_boards()
	# telemóvel na vertical: o ângulo de visão fixa-se na largura (senão a imagem fica "apertada")
	var vs := get_viewport().get_visible_rect().size
	cam.keep_aspect = Camera3D.KEEP_WIDTH if vs.y > vs.x else Camera3D.KEEP_HEIGHT
	cam.fov = 80.0 if vs.y > vs.x else 70.0
	var fwd := Vector3(sin(yaw), 0, cos(yaw))
	var eye := Vector3(me.x, 1.6, me.y)
	if mode == "olhos":
		cam.position = eye
	else:
		# por cima do ombro: atrás e acima; se houver parede ou edifício no caminho, a câmara
		# aproxima-se (nunca entra dentro de um edifício nem sai da sala)
		var free := _free_distance(me, -Vector2(fwd.x, fwd.z), 4.2)
		_cam_dist = lerpf(_cam_dist, free, clampf(delta * (12.0 if free < _cam_dist else 3.0), 0.0, 1.0))
		var h := 2.0 + _cam_dist * 0.22 + maxf(0.0, 2.6 - _cam_dist) * 0.55 # perto de uma parede: sobe
		var want := Vector3(me.x, h, me.y) - fwd * _cam_dist
		if room_bounds.has_area():
			want.y = 2.7 # salas: câmara junto ao teto, a olhar para baixo
		cam.position = cam.position.lerp(want, clampf(delta * 10.0, 0.0, 1.0)) if cam.position != Vector3.ZERO else want
		# a personagem fica sempre à mesma distância mínima (nunca a cara a encher o ecrã)
		var target := Vector3(me.x, 1.1, me.y) + fwd * clampf(_cam_dist, 1.0, 4.0) # câmara perto → olha mais para a personagem
		if vs.y > vs.x:
			target.y -= 0.9 # na vertical a personagem sobe no ecrã (fica acima da barra de baixo)
		if room_bounds.has_area():
			target = Vector3(me.x, 0.9, me.y) + fwd * 1.5
		cam.look_at(target + Vector3(0, tan(pitch) * 4.0, 0), Vector3.UP)
		return
	var look := eye + fwd * 10.0 + Vector3(0, tan(pitch) * 10.0, 0)
	cam.look_at(look, Vector3.UP)


## Distância livre (m) da personagem na direção dir, até ao primeiro obstáculo (edifícios, paredes da sala).
func _free_distance(from: Vector2, dir: Vector2, max_d: float) -> float:
	var d := max_d
	var obs: Array = _view.obstacles if _view else []
	for r: Rect2 in obs:
		if r.size.x * r.size.y < 2.0:
			continue # postes e árvores pequenas não empurram a câmara
		var t := _ray_rect(from, dir, r.grow(0.35))
		if t >= 0.0 and t < d:
			d = t
	if room_bounds.has_area():
		var g := room_bounds.grow(-0.35)
		for t: float in [_ray_exit(from.x, dir.x, g.position.x, g.end.x), _ray_exit(from.y, dir.y, g.position.y, g.end.y)]:
			d = minf(d, t)
	return maxf(0.6, d - 0.2)


static func _ray_exit(p: float, v: float, lo: float, hi: float) -> float:
	if absf(v) < 1e-6:
		return INF
	return ((hi if v > 0 else lo) - p) / v


## Interseção raio–retângulo (método das lajes); −1 se não toca. Se o ponto está dentro, 0.
static func _ray_rect(o: Vector2, d: Vector2, r: Rect2) -> float:
	var tmin := -INF
	var tmax := INF
	for i in 2:
		var oo := o[i]
		var dd := d[i]
		var lo := r.position[i]
		var hi := r.end[i]
		if absf(dd) < 1e-9:
			if oo < lo or oo > hi:
				return -1.0
			continue
		var t1 := (lo - oo) / dd
		var t2 := (hi - oo) / dd
		tmin = maxf(tmin, minf(t1, t2))
		tmax = minf(tmax, maxf(t1, t2))
	if tmax < 0.0 or tmin > tmax:
		return -1.0
	return maxf(0.0, tmin)


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
	kb.bg_color = Tema.GOLD
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
