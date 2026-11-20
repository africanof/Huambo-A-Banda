class_name BairroView
extends Node2D
## Desenha um bairro HD isométrico a partir de res://assets/bairros/<id>.json
## (a mesma planta que o servidor usa para colisões e lugares).
## Camadas: chão (TileMapLayer) → marcações → sombras → objetos com y-sort → luzes → etiquetas.

var data: Dictionary = {}
var size := Vector2.ZERO ## metros
var obstacles: Array[Rect2] = [] ## metros
var places: Array = []
var ground := TileMapLayer.new()
var markings := Node2D.new()
var shadows := Node2D.new()
var objects := Node2D.new() ## personagens entram aqui (y-sort)
var lights := Node2D.new()
var labels := Node2D.new()
## à volta do bairro jogável desenha-se mais cidade (ruas e casas decorativas),
## para que o ecrã do telemóvel fique sempre cheio, sem vazio nas bordas
const MARGIN := 64.0
## casas/árvores usadas no casario à volta (sem letreiros únicos)
const FILLER_BUILDINGS := {"casa_colonial": [10, 8], "predio_castanho": [8, 7], "predio_rosa": [8, 8], "predio_60": [9, 7]}
const FILLER_TREES := ["palmeira", "arvore_avenida", "jacaranda", "arvore_eucalipto"]
var occluders: Array[Sprite2D] = []
var interiors: Array = [] ## dados dos interiores (rect em metros)
var osm := false ## bairro com as ruas reais do OpenStreetMap
var _mask := PackedByteArray() ## 1 m: 0 terra, 1 passeio, 2 rua (para o casario à volta)
var _mask_o := Vector2.ZERO
var _mask_w := 0 ## edifícios/árvores que podem tapar a personagem


static func load_data(id: String) -> Dictionary:
	var d: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://assets/bairros/%s.json" % id))
	return d if typeof(d) == TYPE_DICTIONARY else {}


func build(bairro_id: String) -> bool:
	data = load_data(bairro_id)
	if data.is_empty():
		push_error("BairroView: bairro em falta: " + bairro_id)
		return false
	for k: Variant in data.get("kits", []):
		DemoAssets.load_kit(str(k)) # pacote já carregado por Packs (ou ficheiros locais no editor)
	size = Vector2(data.size[0], data.size[1])
	for n: Node2D in [ground, markings, shadows, objects, lights, labels]:
		add_child(n)
	ground.z_index = -10
	markings.z_index = -9
	shadows.z_index = -5
	objects.y_sort_enabled = true
	labels.z_index = 50
	for r: Array in data.obstacles:
		obstacles.append(Rect2(r[0], r[1], r[2], r[3]))
	places = data.places
	osm = bool(data.get("osm", false))
	if osm:
		_extend_roads()
		_build_road_mask()
	if osm:
		_build_flat_ground()
	else:
		_build_ground()
	if osm:
		_build_roads()
	else:
		_build_markings()
	_build_surroundings()
	_build_portals()
	RenderingServer.set_default_clear_color(Color("8a5a3c")) # cor da terra: nunca aparece "vazio"
	_build_interiors()
	for b: Dictionary in data.buildings:
		var fp: Array = b.fp
		var at := Vector2(b.at[0], b.at[1])
		var pos := Iso.to_screen(Iso.front_corner(Rect2(at, Vector2(fp[0], fp[1]))))
		_add_object(b.id, pos, Rect2(at, Vector2(fp[0], fp[1])))
		if str(b.label) != "":
			var o := DemoAssets.object(b.id)
			_add_label(b.label, pos + Vector2(0, -_top(o) - 16), _is_home(b))
	for p: Dictionary in data.props:
		var pos := Iso.to_screen(Vector2(p.at[0], p.at[1]))
		var po := DemoAssets.object(p.id)
		var pfp := Vector2(po.footprint[0], po.footprint[1]) if po.has("footprint") else Vector2.ONE
		var o := _add_object(p.id, pos, Rect2(Vector2(p.at[0], p.at[1]) - pfp / 2.0, pfp))
		if o.get("light", false):
			_add_lamp_light(pos + Vector2(0, -_top(o) * 0.86))
		if o.has("name") and o.get("category", "") != "building":
			_add_label(o.name, pos + Vector2(0, -_top(o) - 12), false)
	return true


## Altura (px no mundo) do topo do objeto acima da sua base.
func _top(o: Dictionary) -> float:
	return float(o.anchor[1]) * float(o.get("scale", 1.0))


func _is_home(b: Dictionary) -> bool:
	for p: Dictionary in places:
		if p.kind == "door" and str(p.get("venue", "")) in ["casa", "apartamentos"] and str(p.id).begins_with("%s@%s,%s" % [b.id, b.at[0], b.at[1]]):
			return true
	return false


## Lugar interativo mais próximo dentro do raio (ou {}).
func place_near(world_m: Vector2) -> Dictionary:
	var best := {}
	var best_d := INF
	for p: Dictionary in places:
		var d := world_m.distance_to(Vector2(p.at[0], p.at[1]))
		if d < float(p.radius) and d < best_d:
			best = p
			best_d = d
	return best


func _inside(x: float, y: float) -> bool:
	return x >= 0.0 and y >= 0.0 and x < size.x and y < size.y


## Fora do bairro: grelha de ruas que continua as do bairro (avenida a y≈24, rua a x≈30).
func _outer_kind(x: float, y: float) -> String:
	var dy := fposmod(y - 24.0 + 14.0, 28.0) - 14.0 # distância à avenida mais próxima
	var dx := fposmod(x - 30.0 + 13.0, 26.0) - 13.0
	if absf(dy) < 3.0 or absf(dx) < 3.0:
		return "asfalto"
	if absf(dy) < 5.0 or absf(dx) < 5.0:
		return "calcada"
	return "terra"


func _ground_kind(x: float, y: float) -> String:
	if osm:
		var i := int(x - _mask_o.x)
		var j := int(y - _mask_o.y)
		if i < 0 or j < 0 or i >= _mask_w or j >= _mask_w:
			return "terra"
		var v := _mask[j * _mask_w + i]
		return "asfalto" if v == 2 else ("calcada" if v == 1 else str(data.ground[0].kind))
	if not _inside(x, y):
		# a avenida e a rua do bairro continuam com a mesma largura
		if y >= 20.0 and y < 28.0:
			return "asfalto"
		if (y >= 16.0 and y < 20.0) or (y >= 28.0 and y < 32.0):
			return "calcada"
		return _outer_kind(x, y)
	for rule: Dictionary in data.ground:
		var ok := true
		if rule.has("x"):
			ok = ok and x >= float(rule.x[0]) and x < float(rule.x[1])
		if rule.has("y"):
			ok = ok and y >= float(rule.y[0]) and y < float(rule.y[1])
		if ok:
			return rule.kind
	return "terra"


func _build_ground() -> void:
	var m: Dictionary = DemoAssets.manifest().tiles
	var t := float(data.tile)
	var ts := TileSet.new()
	ts.tile_shape = TileSet.TILE_SHAPE_ISOMETRIC
	ts.tile_layout = TileSet.TILE_LAYOUT_DIAMOND_DOWN
	ts.tile_size = Vector2i(m.tile_size[0], m.tile_size[1])
	var src := TileSetAtlasSource.new()
	src.texture = DemoAssets.tex(m.file)
	src.texture_region_size = ts.tile_size
	var names: Array = m.names
	for i in names.size():
		src.create_tile(Vector2i(i, 0))
	ts.add_source(src, 0)
	ground.tile_set = ts
	var m0 := int(MARGIN / t)
	for i in range(-m0, int(size.x / t) + m0):
		for j in range(-m0, int(size.y / t) + m0):
			var gk := str(data.ground[0].kind) if osm else _ground_kind(i * t, j * t)
			# com a vista rodada, o mosaico (i, j) vai para a célula rodada (a grelha roda sobre si própria)
			var rc := Iso.rotate(Vector2(i + 0.5, j + 0.5) * t)
			ground.set_cell(Vector2i(floori(rc.x / t), floori(rc.y / t)), 0, Vector2i(names.find(gk), 0))
	# centro da célula (0, 0) no espaço rodado → ecrã (projeção sem rotação)
	ground.position = Vector2(0, t * Iso.PY) - ground.map_to_local(Vector2i(0, 0))


## Interiores dos edifícios: sala + mobília, cada um na sua posição longe da rua
## (o servidor teletransporta a personagem ao entrar/sair).
func _build_interiors() -> void:
	interiors = data.get("interiors", [])
	for i: Dictionary in interiors:
		var r: Array = i.rect
		var room := DemoAssets.make_view_sprite(str(i.get("room", "interior_sala")), Iso.rot)
		room.position = Iso.to_screen(Iso.front_corner(Rect2(r[0], r[1], r[2], r[3])))
		room.z_index = -10
		add_child(room)
		for f: Dictionary in i.furniture:
			var o := DemoAssets.object(f.id)
			if o.is_empty():
				continue
			var fp := Vector2(o.footprint[0], o.footprint[1])
			var s := DemoAssets.make_view_sprite(str(f.id), Iso.rot)
			s.position = Iso.to_screen(Iso.front_corner(Rect2(Vector2(f.at[0], f.at[1]), fp)))
			if o.get("floor", false):
				s.z_index = -6
				add_child(s)
			else:
				objects.add_child(s)


## A sala tem arte para este ângulo (para poder rodar a vista lá dentro)?
func room_has_angle(i: Dictionary, r: int) -> bool:
	return DemoAssets.has_view(str(i.get("room", "")), r)


## Interior que contém um ponto (metros), ou {} se estiver na rua.
func interior_at(p: Vector2) -> Dictionary:
	for i: Dictionary in interiors:
		var r: Array = i.rect
		if Rect2(r[0], r[1], r[2], r[3]).has_point(p):
			return i
	return {}


## Chão de uma só cor de terreno (bairros de ruas reais): um polígono com a textura a repetir,
## em vez de milhares de mosaicos (muito mais leve no telemóvel).
func _build_flat_ground() -> void:
	var m := MARGIN
	var r := Rect2(-m, -m, size.x + 2.0 * m, size.y + 2.0 * m)
	var p := Polygon2D.new()
	var pts := PackedVector2Array()
	var uv := PackedVector2Array()
	for c: Vector2 in [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]:
		pts.append(Iso.to_screen(c))
		uv.append(c * 128.0)
	p.polygon = pts
	p.uv = uv
	p.texture = load("res://assets/demo/chao_%s.png" % str(data.ground[0].kind))
	p.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	ground.add_child(p)


## Como no Vida na Banda: as ruas que chegam ao limite do bairro continuam lá para fora até ao
## horizonte (só paisagem: a personagem fica sempre dentro do bairro), com casario à volta.
func _extend_roads() -> void:
	var roads: Array = (data.get("roads", []) as Array).filter(func(r: Dictionary) -> bool: return not bool(r.get("fora", false)))
	var inner := Rect2(Vector2.ZERO, size)
	var extra: Array = []
	for r: Dictionary in roads:
		var pts: Array = r.pts
		if pts.size() < 2:
			continue
		for end in [[0, 1], [pts.size() - 1, pts.size() - 2]]:
			var p := Vector2(pts[end[0]][0], pts[end[0]][1])
			var q := Vector2(pts[end[1]][0], pts[end[1]][1])
			var to_edge := minf(minf(p.x, size.x - p.x), minf(p.y, size.y - p.y))
			if to_edge > 5.0 or p.distance_to(q) < 0.5:
				continue
			var dir := (p - q).normalized()
			# segue para fora: se a rua corre ao longo da borda, vira para o lado de fora mais próximo
			var out := dir
			if inner.grow(-0.5).has_point(p + dir * 6.0):
				out = Vector2(-1, 0) if p.x < 5.0 else (Vector2(1, 0) if size.x - p.x < 5.0 else (Vector2(0, -1) if p.y < 5.0 else Vector2(0, 1)))
			var far := p + out * (MARGIN + 12.0)
			var mid := p + out * (MARGIN * 0.45) + out.orthogonal() * sin(p.x + p.y) * 3.0 # curva suave
			extra.append({"name": str(r.get("name", "")), "paved": r.paved, "w": r.w, "pts": [[p.x, p.y], [mid.x, mid.y], [far.x, far.y]], "fora": true})
	data["roads"] = roads + extra


## Grelha de 1 m com ruas e passeios (só para decidir onde há casario à volta).
func _build_road_mask() -> void:
	_mask_o = Vector2(-MARGIN, -MARGIN)
	_mask_w = int(size.x + MARGIN * 2.0)
	_mask.resize(_mask_w * _mask_w)
	_mask.fill(0)
	for r: Dictionary in data.get("roads", []):
		var pts: Array = r.pts
		var hw := float(r.w) / 2.0
		for k in range(pts.size() - 1):
			var a := Vector2(pts[k][0], pts[k][1])
			var b := Vector2(pts[k + 1][0], pts[k + 1][1])
			var bb := Rect2(a, Vector2.ZERO).expand(b).grow(hw + 2.5)
			for j in range(int(bb.position.y - _mask_o.y), int(bb.end.y - _mask_o.y) + 1):
				for i in range(int(bb.position.x - _mask_o.x), int(bb.end.x - _mask_o.x) + 1):
					if i < 0 or j < 0 or i >= _mask_w or j >= _mask_w:
						continue
					var c := Vector2(i + 0.5, j + 0.5) + _mask_o
					var d := c.distance_to(Geometry2D.get_closest_point_to_segment(c, a, b))
					var v := 2 if d < hw else (1 if d < hw + 2.0 else 0)
					if v > _mask[j * _mask_w + i]:
						_mask[j * _mask_w + i] = v


## Ruas reais: faixas com textura (passeio por baixo, alcatrão ou terra batida por cima).
func _build_roads() -> void:
	var tex := {}
	for k: String in ["asfalto", "calcada", "terra", "relva"]:
		tex[k] = load("res://assets/demo/chao_%s.png" % k)
	for a: Dictionary in data.get("areas", []):
		var poly := PackedVector2Array()
		for q: Array in a.pts:
			poly.append(Vector2(q[0], q[1]))
		_tex_poly(poly, tex["relva"], Color.WHITE)
	var roads: Array = data.get("roads", [])
	for pass_i in 2: # 0 = passeios/berma, 1 = faixa
		for r: Dictionary in roads:
			var paved := bool(r.paved)
			var hw := float(r.w) / 2.0 + (0.0 if pass_i == 1 else (2.0 if paved else 0.8))
			var t: Texture2D = tex["calcada"] if pass_i == 0 and paved else (tex["asfalto"] if paved else tex["terra"])
			var col := Color.WHITE if paved or pass_i == 0 else Color(0.82, 0.74, 0.68)
			if pass_i == 0 and not paved:
				col = Color(0.9, 0.84, 0.78)
			var pts: Array = r.pts
			for k in range(pts.size() - 1):
				var a := Vector2(pts[k][0], pts[k][1])
				var b := Vector2(pts[k + 1][0], pts[k + 1][1])
				if a.distance_to(b) < 0.05:
					continue
				var n := (b - a).normalized().orthogonal() * hw
				_tex_poly(PackedVector2Array([a + n, b + n, b - n, a - n]), t, col)
			for q: Array in pts: # juntas redondas
				var c := Vector2(q[0], q[1])
				var circ := PackedVector2Array()
				for i in 12:
					circ.append(c + Vector2.from_angle(TAU * i / 12.0) * hw)
				_tex_poly(circ, t, col)


## Polígono em metros → ecrã isométrico, com a textura fixa ao chão (4 m por repetição).
func _tex_poly(world: PackedVector2Array, t: Texture2D, col: Color) -> void:
	var p := Polygon2D.new()
	var scr := PackedVector2Array()
	var uv := PackedVector2Array()
	for w in world:
		scr.append(Iso.to_screen(w))
		uv.append(w * 128.0)
	p.polygon = scr
	p.uv = uv
	p.texture = t
	p.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	p.color = col
	markings.add_child(p)


## Placas nas pontas das ruas: "A pé para <bairro vizinho>".
func _build_portals() -> void:
	for pt: Dictionary in data.get("portals", []):
		_add_label("→ " + str(pt.name), Iso.to_screen(Vector2(pt.at[0], pt.at[1])) + Vector2(0, -40), false)


## Casario decorativo à volta do bairro (mesma arte do Huambo, sem letreiros nem interação).
func _build_surroundings() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(str(data.get("id", "")))
	var ids: Array = FILLER_BUILDINGS.keys()
	var fps := FILLER_BUILDINGS.duplicate()
	var trees := FILLER_TREES.duplicate()
	if osm: # casario à volta com as casas e árvores do próprio bairro
		var own := {}
		for b: Dictionary in data.buildings:
			if str(b.get("label", "")).begins_with("Casa"):
				own[b.id] = b.fp
		if not own.is_empty():
			fps = own
			ids = own.keys()
		var own_trees := []
		for p: Dictionary in data.props:
			if "_tree" in str(p.id) and not own_trees.has(p.id):
				own_trees.append(p.id)
		if not own_trees.is_empty():
			trees = own_trees
	var area := Rect2(-MARGIN, -MARGIN, size.x + MARGIN * 2.0, size.y + MARGIN * 2.0)
	var keep_out := Rect2(-2, -2, size.x + 4, size.y + 4)
	var y := area.position.y
	while y < area.end.y:
		var x := area.position.x
		while x < area.end.x:
			var id: String = ids[rng.randi() % ids.size()]
			var fp: Array = fps[id]
			var lot := Rect2(x, y, float(fp[0]), float(fp[1]))
			if not lot.intersects(keep_out) and _lot_free(lot):
				if rng.randf() < 0.78:
					_add_object(id, Iso.to_screen(Iso.front_corner(lot)))
				else:
					_add_object(trees[rng.randi() % trees.size()], Iso.to_screen(lot.get_center()))
				x += lot.size.x + rng.randf_range(0.6, 1.6)
			else:
				x += 1.5
		y += 1.5


## Um lote só leva casa se for todo terra (não invade ruas nem passeios).
func _lot_free(lot: Rect2) -> bool:
	var px := lot.position.x
	while px <= lot.end.x:
		var py := lot.position.y
		while py <= lot.end.y:
			if _inside(px, py) or _ground_kind(px, py) not in ["terra", "relva"]:
				return false
			py += 2.0
		px += 2.0
	return not _taken.any(func(r: Rect2) -> bool: return r.grow(0.5).intersects(lot)) and _take(lot)


var _taken: Array[Rect2] = []


func _take(lot: Rect2) -> bool:
	_taken.append(lot)
	return true


func _quad(r: Rect2, color: Color) -> void:
	var p := Polygon2D.new()
	p.polygon = Iso.rect_poly(r)
	p.color = color
	markings.add_child(p)


## Marcações da avenida: lancis às riscas preto-e-branco, linha central e passadeira.
func _build_markings() -> void:
	var road_y: Array = [0.0, 0.0]
	for rule: Dictionary in data.ground:
		if rule.kind == "asfalto" and rule.has("y"):
			road_y = [float(rule.y[0]), float(rule.y[1])]
	if road_y[1] <= road_y[0]:
		return
	var gap: Array = [0.0, 0.0]
	for rule: Dictionary in data.ground:
		if rule.kind == "terra" and rule.has("x") and not rule.has("y"):
			gap = [float(rule.x[0]) - 0.5, float(rule.x[1]) + 0.5]
	for y in [road_y[0] - 0.2, road_y[1]]:
		var k := 0
		var lx := 0.0
		while lx < size.x:
			if not (lx >= gap[0] and lx < gap[1]):
				_quad(Rect2(lx, y, 0.6, 0.22), Color("f2f0ea") if k % 2 == 0 else Color("1d1d20"))
			lx += 0.6
			k += 1
	var mid: float = (float(road_y[0]) + float(road_y[1])) / 2.0
	var x := 0.5
	while x < size.x:
		if not (x > gap[0] - 1 and x < gap[1] + 1):
			_quad(Rect2(x, mid - 0.1, 2.0, 0.2), Color(0.96, 0.95, 0.9, 0.85))
		x += 4.0
	for k in 7:
		_quad(Rect2(22.2, road_y[0] + 0.3 + k * 1.1, 3.2, 0.55), Color(0.97, 0.97, 0.95, 0.9))
	_quad(Rect2(0, road_y[0] + 0.15, size.x, 0.25), Color(0, 0, 0, 0.18))
	_quad(Rect2(0, road_y[1] - 0.4, size.x, 0.25), Color(0, 0, 0, 0.18))


## Edifícios e árvores à frente da personagem ficam transparentes (como nos jogos de vida
## isométricos), para nunca perderes a tua personagem de vista.
func update_occlusion(char_pos: Vector2, delta: float, char_world := Vector2.INF) -> void:
	var body := Rect2(char_pos + Vector2(-14, -80), Vector2(28, 76))
	var k := clampf(delta * 10.0, 0.0, 1.0)
	var cw := Iso.rotate(char_world) if char_world != Vector2.INF else Vector2.INF
	for s: Sprite2D in occluders:
		var r := Rect2(s.position + s.offset * s.scale, s.texture.get_size() * s.scale)
		var target := 1.0
		if s.position.y > char_pos.y and r.intersects(body) and _behind(s, cw) and _opaque_over(s, body):
			target = 0.42
		s.modulate.a = lerpf(s.modulate.a, target, k)


## A personagem está mesmo ATRÁS do objeto (não à frente das fachadas visíveis)?
## Na vista (rodada), "à frente" = coordenada maior em x' ou em y' do que a pegada.
func _behind(s: Sprite2D, cw: Vector2) -> bool:
	var fp: Rect2 = s.get_meta("fp", Rect2())
	if cw == Vector2.INF or not fp.has_area():
		return true
	var mx := -INF
	var my := -INF
	for c: Vector2 in [fp.position, Vector2(fp.end.x, fp.position.y), fp.end, Vector2(fp.position.x, fp.end.y)]:
		var rc := Iso.rotate(c)
		mx = maxf(mx, rc.x)
		my = maxf(my, rc.y)
	return cw.x < mx - 0.1 and cw.y < my - 0.1


## Verifica se há píxeis opacos do sprite por cima do corpo (evita apagar uma árvore
## só porque o retângulo da imagem toca na personagem).
func _opaque_over(s: Sprite2D, body: Rect2) -> bool:
	var img: Image = _images.get(s.texture)
	if img == null:
		img = s.texture.get_image()
		if img == null:
			return true
		if img.is_compressed():
			img.decompress()
		# máscara reduzida (1/4): pouca memória no telemóvel, chega para saber se tapa
		img.resize(maxi(1, img.get_width() / 4), maxi(1, img.get_height() / 4), Image.INTERPOLATE_NEAREST)
		_images[s.texture] = img
	var origin := s.position + s.offset * s.scale
	for fx: float in [0.2, 0.5, 0.8]:
		for fy: float in [0.15, 0.45, 0.75]:
			var p := (body.position + body.size * Vector2(fx, fy) - origin) / s.scale / 4.0
			if p.x >= 0 and p.y >= 0 and p.x < img.get_width() and p.y < img.get_height():
				if img.get_pixel(int(p.x), int(p.y)).a > 0.5:
					return true
	return false


var _images: Dictionary = {}


func _add_object(id: String, pos: Vector2, footprint := Rect2()) -> Dictionary:
	var o := DemoAssets.object(id)
	if o.is_empty():
		return o
	# com a vista rodada, a arte desse lado (se existir)
	var aid := DemoAssets.angle_id(id, Iso.rot)
	var s := DemoAssets.make_view_sprite(id, Iso.rot)
	if aid != id:
		o = DemoAssets.object(aid)
		id = aid
	s.position = pos
	objects.add_child(s)
	if s.texture and s.texture.get_height() * s.scale.y > 90:
		s.set_meta("fp", footprint)
		occluders.append(s)
	var t := DemoAssets.shadow_texture(id)
	if t:
		var sh := Sprite2D.new()
		sh.texture = t
		sh.centered = false
		sh.offset = -Vector2(o.shadow_anchor[0], o.shadow_anchor[1])
		if s.flip_h:
			sh.flip_h = true
			sh.offset.x = -(t.get_width() - float(o.shadow_anchor[0]))
		sh.position = pos
		sh.modulate = Color(1, 1, 1, 0.9)
		shadows.add_child(sh)
	return o


static var _lamp_tex: GradientTexture2D
static var _lamp_mat: CanvasItemMaterial
var lamp_glows: Array[Sprite2D] = []
var _night := 0.0
const MAX_LIGHTS := 6


func _add_lamp_light(at: Vector2) -> void:
	# brilho do candeeiro: sprite aditivo (o mesmo efeito de uma luz 2D, sem redesenhar o que ilumina;
	# num telemóvel as luzes 2D custavam ~4× o tempo de cada imagem)
	if _lamp_tex == null:
		_lamp_tex = GradientTexture2D.new()
		_lamp_tex.width = 256
		_lamp_tex.height = 256
		_lamp_tex.fill = GradientTexture2D.FILL_RADIAL
		_lamp_tex.fill_from = Vector2(0.5, 0.5)
		_lamp_tex.fill_to = Vector2(1, 0.5)
		var gr := Gradient.new()
		gr.set_color(0, Color(1, 0.86, 0.6, 0.85))
		gr.set_color(1, Color(1, 0.8, 0.5, 0))
		_lamp_tex.gradient = gr
		_lamp_mat = CanvasItemMaterial.new()
		_lamp_mat.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
	var pool := Sprite2D.new() # mancha de luz no chão
	pool.texture = _lamp_tex
	pool.material = _lamp_mat
	pool.position = at + Vector2(0, 120)
	pool.scale = Vector2(2.6, 1.3)
	pool.visible = false
	shadows.add_child(pool)
	var bulb := Sprite2D.new() # halo à volta da lâmpada
	bulb.texture = _lamp_tex
	bulb.material = _lamp_mat
	bulb.position = at
	bulb.scale = Vector2(0.5, 0.5)
	bulb.z_index = 40
	bulb.visible = false
	lights.add_child(bulb)
	lamp_glows.append(pool)
	lamp_glows.append(bulb)


func _add_label(text: String, at: Vector2, is_home: bool) -> void:
	var pill := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.09, 0.08, 0.08, 0.86) if not is_home else Color(0.95, 0.72, 0.18, 0.95)
	sb.set_corner_radius_all(14)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 4
	sb.content_margin_bottom = 4
	pill.add_theme_stylebox_override("panel", sb)
	var l := Label.new()
	l.text = ("⌂  " if is_home else "") + text
	l.add_theme_font_override("font", preload("res://assets/fonts/Inter-SemiBold.otf"))
	l.add_theme_font_size_override("font_size", 22)
	l.add_theme_color_override("font_color", Color.WHITE if not is_home else Color("2a1d10"))
	pill.add_child(l)
	labels.add_child(pill)
	pill.reset_size()
	pill.position = at - Vector2(pill.size.x / 2, pill.size.y)


## Etiquetas legíveis em qualquer zoom.
func scale_labels(zoom: float, extra: Array = []) -> void:
	var k := clampf(0.75 / zoom, 1.3, 2.2)
	for c: Control in labels.get_children() + extra:
		c.pivot_offset = Vector2(c.size.x / 2, c.size.y)
		c.scale = Vector2(k, k)


## Hora do dia (0..24) → cor ambiente, candeeiros e sombras. Devolve o fator "noite" (0..1).
func apply_hour(h: float, canvas_mod: CanvasModulate) -> float:
	var keys := [[0.0, Color(0.26, 0.3, 0.5)], [5.0, Color(0.3, 0.33, 0.52)], [6.5, Color(0.95, 0.75, 0.62)],
		[8.0, Color(1, 0.97, 0.92)], [16.5, Color(1, 0.97, 0.9)], [18.0, Color(1, 0.7, 0.5)],
		[19.2, Color(0.45, 0.42, 0.62)], [20.5, Color(0.27, 0.3, 0.5)], [24.0, Color(0.26, 0.3, 0.5)]]
	var col: Color = keys[0][1]
	for i in range(keys.size() - 1):
		if h >= keys[i][0] and h <= keys[i + 1][0]:
			col = (keys[i][1] as Color).lerp(keys[i + 1][1], (h - keys[i][0]) / (keys[i + 1][0] - keys[i][0]))
	canvas_mod.color = col
	var night := clampf((0.8 - col.v) / 0.35, 0.0, 1.0)
	_night = night
	for g in lamp_glows:
		g.visible = night > 0.02
		g.modulate = Color(1, 1, 1, night)
	shadows.modulate.a = 1.0 - night * 0.6
	return night
