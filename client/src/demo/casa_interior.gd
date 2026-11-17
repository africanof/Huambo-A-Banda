extends Node2D
## Interior da casa do jogador: decoração com móveis HD.
##   · Loja (painel à direita): escolher um móvel → aparece um "fantasma" que segue o
##     rato/dedo, verde se cabe, vermelho se não → clicar para comprar e colocar.
##   · Clicar num móvel colocado → pegar para mudar de sítio; Espelhar (F); Vender (50%).
##   · A personagem anda pela sala e colide com os móveis (tapetes não bloqueiam).
##   · A decoração e a carteira ficam gravadas (local nesta demo; tabela houses.layout no Supabase depois).

const ROOM := Vector2(8, 7) ## metros
const GRID := 0.5

var objects := Node2D.new()
var player := DemoCharacter.new()
var camera := Camera2D.new()
var ui := CanvasLayer.new()
var wallet_label := Label.new()
var info_label := Label.new()
var ghost: Sprite2D
var holding: Dictionary = {} ## {id, flip, from: índice ou -1 (nova compra)}
var placed_nodes: Array[Sprite2D] = []


func _ready() -> void:
	RenderingServer.set_default_clear_color(Color("1c1a1f"))
	DemoState.load_house()
	var room := DemoAssets.make_sprite("interior_sala")
	room.position = Iso.to_screen(ROOM)
	room.z_index = -10
	add_child(room)
	objects.y_sort_enabled = true
	add_child(objects)
	player.cid = DemoState.cid
	player.world_pos = Vector2(ROOM.x - 1.2, ROOM.y - 1.0)
	player.bounds = Rect2(Vector2(0.45, 0.45), ROOM - Vector2(0.6, 0.6))
	objects.add_child(player)
	player.set_top_hue(DemoState.top_hue)
	camera.zoom = Vector2(0.8, 0.8)
	camera.position = Iso.to_screen(ROOM / 2) + Vector2(140, -60)
	add_child(camera)
	_build_ui()
	_rebuild_furniture()


# ------------------------------------------------------------------ móveis

func _footprint(item: Dictionary) -> Rect2:
	var o := DemoAssets.object(item.id)
	var fp := Vector2(o.footprint[0], o.footprint[1])
	if item.get("flip", false):
		fp = Vector2(fp.y, fp.x)
	return Rect2(Vector2(item.x, item.y), fp)


func _is_floor(id: String) -> bool:
	return DemoAssets.object(id).get("floor", false)


func _rebuild_furniture() -> void:
	for n in placed_nodes:
		n.queue_free()
	placed_nodes.clear()
	var blocking: Array[Rect2] = []
	for i in DemoState.furniture.size():
		var item: Dictionary = DemoState.furniture[i]
		var s := DemoAssets.make_sprite(item.id)
		s.flip_h = item.get("flip", false)
		if s.flip_h:
			s.offset.x = -(s.texture.get_width() - float(DemoAssets.object(item.id).anchor[0]))
		var r := _footprint(item)
		s.position = Iso.to_screen(r.end)
		s.set_meta("index", i)
		if _is_floor(item.id):
			s.z_index = -6
		else:
			blocking.append(r)
		objects.add_child(s)
		placed_nodes.append(s)
	player.obstacles = blocking
	wallet_label.text = "Carteira: %s Kz" % DemoHud._money(DemoState.wallet)


func _fits(item: Dictionary, ignore: int) -> bool:
	var r := _footprint(item)
	if r.position.x < 0.2 or r.position.y < 0.2 or r.end.x > ROOM.x - 0.1 or r.end.y > ROOM.y - 0.1:
		return false
	if _is_floor(item.id):
		return true
	for i in DemoState.furniture.size():
		if i == ignore or _is_floor(DemoState.furniture[i].id):
			continue
		if _footprint(DemoState.furniture[i]).grow(-0.05).intersects(r):
			return false
	if r.grow(0.2).has_point(player.world_pos):
		return false
	return true


func _start_holding(id: String, flip: bool, from: int) -> void:
	_cancel_holding()
	holding = {"id": id, "flip": flip, "from": from, "x": 0.0, "y": 0.0}
	ghost = DemoAssets.make_sprite(id)
	ghost.modulate = Color(1, 1, 1, 0.65)
	ghost.z_index = 40
	add_child(ghost)
	_update_ghost()
	info_label.text = "Clica no chão para pousar · F espelha · Esc cancela" if from < 0 else "A mudar de sítio · F espelha · Vender ou Esc"


func _cancel_holding() -> void:
	if ghost:
		ghost.queue_free()
		ghost = null
	if not holding.is_empty() and holding.from >= 0:
		placed_nodes[holding.from].visible = true
	holding = {}
	info_label.text = "Escolhe um móvel na loja ou clica num móvel para o mudar de sítio."


func _update_ghost() -> void:
	if not ghost:
		return
	var w := Iso.to_world(get_global_mouse_position())
	var o := DemoAssets.object(holding.id)
	var fp := Vector2(o.footprint[0], o.footprint[1])
	if holding.flip:
		fp = Vector2(fp.y, fp.x)
	holding.x = snappedf(w.x - fp.x / 2, GRID)
	holding.y = snappedf(w.y - fp.y / 2, GRID)
	ghost.flip_h = holding.flip
	ghost.offset = -Vector2(o.anchor[0], o.anchor[1])
	if holding.flip:
		ghost.offset.x = -(ghost.texture.get_width() - float(o.anchor[0]))
	ghost.position = Iso.to_screen(Vector2(holding.x, holding.y) + fp)
	var ok := _fits(holding, holding.from)
	ghost.modulate = Color(0.7, 1.0, 0.7, 0.75) if ok else Color(1.0, 0.55, 0.55, 0.6)


func _place() -> void:
	if not _fits(holding, holding.from):
		return
	var item := {"id": holding.id, "x": holding.x, "y": holding.y, "flip": holding.flip}
	if holding.from >= 0:
		DemoState.furniture[holding.from] = item
	else:
		var price := int(DemoAssets.object(holding.id).price)
		if DemoState.wallet < price:
			info_label.text = "Não tens kwanzas suficientes."
			return
		DemoState.wallet -= price
		DemoState.furniture.append(item)
	holding = {}
	ghost.queue_free()
	ghost = null
	DemoState.save_house()
	_rebuild_furniture()
	info_label.text = "Pousado. Clica num móvel para o mudar de sítio."


func _sell_holding() -> void:
	if holding.is_empty() or holding.from < 0:
		_cancel_holding()
		return
	var price := int(DemoAssets.object(holding.id).price)
	DemoState.wallet += price / 2
	DemoState.furniture.remove_at(holding.from)
	holding = {}
	ghost.queue_free()
	ghost = null
	DemoState.save_house()
	_rebuild_furniture()
	info_label.text = "Vendido por %s Kz." % DemoHud._money(price / 2)


func _furniture_at(screen_pos: Vector2) -> int:
	var best := -1
	var best_y := -INF
	for n in placed_nodes:
		var local := n.to_local(screen_pos)
		var r := Rect2(n.offset, n.texture.get_size())
		if r.has_point(local):
			var px := Vector2i(local - n.offset)
			if n.flip_h:
				px.x = n.texture.get_width() - 1 - px.x
			var img := n.texture.get_image()
			if img and img.get_pixelv(px.clamp(Vector2i.ZERO, img.get_size() - Vector2i.ONE)).a > 0.3 and n.position.y > best_y:
				best = n.get_meta("index")
				best_y = n.position.y
	return best


# ------------------------------------------------------------------ entrada e ciclo

func _process(delta: float) -> void:
	var dir := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	if Input.is_physical_key_pressed(KEY_A): dir.x -= 1
	if Input.is_physical_key_pressed(KEY_D): dir.x += 1
	if Input.is_physical_key_pressed(KEY_W): dir.y -= 1
	if Input.is_physical_key_pressed(KEY_S): dir.y += 1
	player.step(Iso.screen_dir_to_world(dir), delta)
	_update_ghost()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if not holding.is_empty():
			_place()
		else:
			var i := _furniture_at(get_global_mouse_position())
			if i >= 0:
				var item: Dictionary = DemoState.furniture[i]
				placed_nodes[i].visible = false
				_start_holding(item.id, item.get("flip", false), i)
	elif event is InputEventKey and event.pressed:
		match event.physical_keycode:
			KEY_F:
				if not holding.is_empty():
					holding.flip = not holding.flip
			KEY_ESCAPE:
				_cancel_holding()
			KEY_DELETE:
				_sell_holding()


func _build_ui() -> void:
	add_child(ui)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", DemoHud._pill(Color(0.1, 0.09, 0.09, 0.9), 20))
	panel.anchor_left = 1.0
	panel.anchor_right = 1.0
	panel.anchor_bottom = 1.0
	panel.offset_left = -300
	panel.offset_right = -14
	panel.offset_top = 14
	panel.offset_bottom = -14
	ui.add_child(panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	panel.add_child(v)
	var title := Label.new()
	title.text = "Loja de móveis"
	title.add_theme_font_override("font", DemoHud.FONT_BOLD)
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", Color("ffd166"))
	v.add_child(title)
	wallet_label.add_theme_font_override("font", DemoHud.FONT)
	wallet_label.add_theme_font_size_override("font_size", 16)
	v.add_child(wallet_label)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	v.add_child(scroll)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	scroll.add_child(grid)
	for id: String in DemoAssets.manifest().objects:
		var o: Dictionary = DemoAssets.object(id)
		if o.category != "furniture":
			continue
		var b := Button.new()
		b.custom_minimum_size = Vector2(126, 128)
		b.icon = DemoAssets.tex(id + ".png")
		b.expand_icon = true
		b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		b.vertical_icon_alignment = VERTICAL_ALIGNMENT_TOP
		b.text = "%s\n%s Kz" % [o.label, DemoHud._money(int(o.price))]
		b.add_theme_font_override("font", DemoHud.FONT)
		b.add_theme_font_size_override("font_size", 12)
		b.add_theme_stylebox_override("normal", DemoHud._pill(Color(1, 1, 1, 0.07), 14))
		b.add_theme_stylebox_override("hover", DemoHud._pill(Color(1, 1, 1, 0.16), 14))
		b.add_theme_stylebox_override("pressed", DemoHud._pill(Color(1, 0.82, 0.4, 0.3), 14))
		b.focus_mode = Control.FOCUS_NONE
		b.pressed.connect(_start_holding.bind(id, false, -1))
		grid.add_child(b)
	var row := HBoxContainer.new()
	v.add_child(row)
	for spec: Array in [["Espelhar", "flip", func() -> void: if not holding.is_empty(): holding.flip = not holding.flip],
			["Vender", "trash", _sell_holding]]:
		var b := Button.new()
		b.text = spec[0]
		b.icon = DemoIcons.make(spec[1], Color.WHITE)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.add_theme_font_override("font", DemoHud.FONT)
		b.add_theme_stylebox_override("normal", DemoHud._pill(Color(1, 1, 1, 0.1), 16))
		b.focus_mode = Control.FOCUS_NONE
		b.pressed.connect(spec[2])
		row.add_child(b)
	var exit := Button.new()
	exit.text = "Sair para a rua"
	exit.icon = DemoIcons.make("door", Color("2a1d10"))
	exit.custom_minimum_size = Vector2(0, 48)
	exit.add_theme_font_override("font", DemoHud.FONT_BOLD)
	exit.add_theme_color_override("font_color", Color("2a1d10"))
	exit.add_theme_stylebox_override("normal", DemoHud._pill(Color(0.95, 0.72, 0.18), 22))
	exit.focus_mode = Control.FOCUS_NONE
	exit.pressed.connect(func() -> void: get_tree().change_scene_to_file("res://src/demo/bairro_demo.tscn"))
	v.add_child(exit)
	info_label.add_theme_font_override("font", DemoHud.FONT)
	info_label.add_theme_font_size_override("font_size", 15)
	info_label.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
	info_label.add_theme_constant_override("outline_size", 4)
	info_label.position = Vector2(18, 16)
	ui.add_child(info_label)
	info_label.text = "Escolhe um móvel na loja ou clica num móvel para o mudar de sítio."
