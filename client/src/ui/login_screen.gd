extends Control
## Ecrã de entrada (inspirado no Vida na Banda): o bairro vivo por trás, criação da personagem
## (nome, homem/mulher com pré-visualização animada, cor da roupa, 🎲 aleatório, 18+) e
## «Começar a vida». Onde nasces decide-o a lotaria da vida, já dentro do jogo.

const FONT := preload("res://assets/fonts/Inter-SemiBold.otf")
const FONT_BOLD := preload("res://assets/fonts/Inter-Bold.otf")
const FONT_REG := preload("res://assets/fonts/Inter-Regular.otf")
const ACCENT := Color(0.95, 0.72, 0.18)
const ACCENT_DARK := Color("b5341f")
const INK := Color("2a1d10")
const CARD := Color(0.08, 0.07, 0.07, 0.9)
## matizes de roupa (0..1); -1 = a original da arte
const HUES := [-1.0, 0.0, 0.08, 0.15, 0.33, 0.5, 0.62, 0.75, 0.88]
const NAMES_M := ["Kalunga", "Tchissola", "Ngola", "Sapalo", "Chipenda", "Cassoma", "Epalanga", "Jamba", "Kandimba", "Tchivinda", "Sacuvaia", "Chimuco"]
const NAMES_F := ["Nhanga", "Lussati", "Chilombo", "Ngueza", "Esperança", "Florinda", "Kaluquembe", "Tchiumba", "Ndalu", "Celeste", "Wezy", "Kissanga"]

var mode := "jogar" ## jogar (convidado) | criar (conta) | entrar (conta)
var model := 0 ## 0 homem, 1 mulher
var hue := -1.0
var name_edit := LineEdit.new()
var email_edit := LineEdit.new()
var password_edit := LineEdit.new()
var adult := CheckBox.new()
var status_label := Label.new()
var start_button := Button.new()
var guest_button: Button ## compatibilidade (autoteste)
var login_button: Button
var signup_button: Button
var _tabs := HBoxContainer.new()
var _char_box := VBoxContainer.new()
var _acc_box := VBoxContainer.new()
var _preview: DemoCharacter
var _swatches := HBoxContainer.new()
var _model_buttons: Array[Button] = []
var _bg_cam := Camera2D.new()
var _bg_view := BairroView.new()
var _bg_t := 0.0
var _card := PanelContainer.new()
var _bg_mod := CanvasModulate.new()


func _ready() -> void:
	if AppConfig.has_flag("demo") or OS.has_feature("demo"):
		get_tree().change_scene_to_file.call_deferred("res://src/demo/bairro_demo.tscn")
		return
	_build_background()
	_build_ui()
	_set_mode("jogar")
	_randomize(false)
	Net.last_error = ""
	if AppConfig.has_flag("autotest") and not get_tree().root.has_node("Autotest"):
		var t := preload("res://src/debug/autotest.gd").new()
		t.name = "Autotest"
		get_tree().root.add_child.call_deferred(t)


# ------------------------------------------------------------------ fundo: o bairro vivo

func _build_background() -> void:
	var svc := SubViewportContainer.new()
	svc.stretch = true
	svc.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	svc.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(svc)
	var vp := SubViewport.new()
	vp.transparent_bg = false
	svc.add_child(vp)
	var world := Node2D.new()
	vp.add_child(world)
	world.add_child(_bg_view)
	world.add_child(_bg_mod)
	_bg_view.build("cidade_baixa")
	_bg_cam.zoom = Vector2(0.42, 0.42)
	world.add_child(_bg_cam)
	# véu escuro em baixo e à esquerda para o texto ler-se bem
	var veil := TextureRect.new()
	var g := GradientTexture2D.new()
	g.fill_from = Vector2(0, 0)
	g.fill_to = Vector2(0, 1)
	var gr := Gradient.new()
	gr.set_color(0, Color(0.05, 0.03, 0.02, 0.15))
	gr.set_color(1, Color(0.05, 0.03, 0.02, 0.8))
	g.gradient = gr
	veil.texture = g
	veil.stretch_mode = TextureRect.STRETCH_SCALE
	veil.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(veil)


func _process(delta: float) -> void:
	# câmara a passear devagar pela avenida da Cidade Baixa
	_bg_t += delta
	var p := Vector2(30.0 + sin(_bg_t * 0.05) * 26.0, 24.0 + sin(_bg_t * 0.07) * 6.0)
	_bg_cam.position = Iso.to_screen(p)
	var now := Time.get_datetime_dict_from_unix_time(int(Time.get_unix_time_from_system()) + 3600)
	_bg_view.apply_hour(float(now.hour) + now.minute / 60.0, _bg_mod)


# ------------------------------------------------------------------ cartão

func _build_ui() -> void:
	# rolagem no ecrã todo; o cartão fica ao centro (e rola no telemóvel baixo)
	var scroll := ScrollContainer.new()
	scroll.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll)
	var center := CenterContainer.new()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.add_child(center)
	var sb := StyleBoxFlat.new()
	sb.bg_color = CARD
	sb.set_corner_radius_all(28)
	sb.set_content_margin_all(24)
	sb.shadow_color = Color(0, 0, 0, 0.4)
	sb.shadow_size = 14
	_card.add_theme_stylebox_override("panel", sb)
	center.add_child(_card)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	_card.add_child(v)
	v.add_child(_label("Huambo É A Banda", 34, ACCENT, FONT_BOLD, HORIZONTAL_ALIGNMENT_CENTER))
	v.add_child(_label("Ninguém escolhe onde nasce: podes nascer na Chiva ou na Cidade Alta. Arranja trabalho, casa, amigos e faz a tua vida no Huambo — com gente real a jogar contigo.", 14, Color(1, 1, 1, 0.8), FONT_REG, HORIZONTAL_ALIGNMENT_CENTER, true))
	# separadores
	_tabs.alignment = BoxContainer.ALIGNMENT_CENTER
	_tabs.add_theme_constant_override("separation", 6)
	v.add_child(_tabs)
	for t: Array in [["jogar", "Jogar já"], ["criar", "Criar conta"], ["entrar", "Entrar"]]:
		if t[0] != "jogar" and not Auth.supabase_enabled():
			continue
		var id: String = t[0]
		var b := _button(t[1], Color(1, 1, 1, 0.08), Color.WHITE, func() -> void: _set_mode(id))
		b.set_meta("tab", id)
		_tabs.add_child(b)
	# conta (email + senha)
	_acc_box.add_theme_constant_override("separation", 8)
	v.add_child(_acc_box)
	_style_edit(email_edit, "Email")
	email_edit.virtual_keyboard_type = LineEdit.KEYBOARD_TYPE_EMAIL_ADDRESS
	_acc_box.add_child(email_edit)
	_style_edit(password_edit, "Senha")
	password_edit.secret = true
	_acc_box.add_child(password_edit)
	# personagem
	_char_box.add_theme_constant_override("separation", 10)
	v.add_child(_char_box)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_style_edit(name_edit, "Nome da personagem")
	name_edit.max_length = 20
	name_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_edit.text_submitted.connect(func(_t: String) -> void: _on_start())
	row.add_child(name_edit)
	var dice := _button("Sorte", Color(1, 1, 1, 0.12), Color.WHITE, func() -> void: _randomize(true))
	dice.tooltip_text = "Nome e visual ao acaso"
	row.add_child(dice)
	_char_box.add_child(row)
	_char_box.add_child(_label("O teu visual", 15, Color(1, 1, 1, 0.75), FONT, HORIZONTAL_ALIGNMENT_LEFT))
	var look := HBoxContainer.new()
	look.add_theme_constant_override("separation", 14)
	look.alignment = BoxContainer.ALIGNMENT_CENTER
	_char_box.add_child(look)
	# pré-visualização animada (a personagem a andar no lugar)
	var stage := SubViewportContainer.new()
	stage.custom_minimum_size = Vector2(150, 190)
	stage.stretch = true
	var svp := SubViewport.new()
	svp.transparent_bg = true
	stage.add_child(svp)
	_preview = DemoCharacter.new()
	_preview.position = Vector2(75, 182)
	svp.add_child(_preview)
	look.add_child(stage)
	var right := VBoxContainer.new()
	right.add_theme_constant_override("separation", 10)
	right.alignment = BoxContainer.ALIGNMENT_CENTER
	look.add_child(right)
	var models := HBoxContainer.new()
	models.add_theme_constant_override("separation", 8)
	for m: Array in [[0, "Homem"], [1, "Mulher"]]:
		var mi: int = m[0]
		var b := _button(m[1], Color(1, 1, 1, 0.08), Color.WHITE, func() -> void: _set_model(mi))
		_model_buttons.append(b)
		models.add_child(b)
	right.add_child(models)
	right.add_child(_label("Cor da roupa", 13, Color(1, 1, 1, 0.65), FONT_REG, HORIZONTAL_ALIGNMENT_LEFT))
	var grid := GridContainer.new()
	grid.columns = 5
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	right.add_child(grid)
	for h: float in HUES:
		var sw := Button.new()
		sw.custom_minimum_size = Vector2(34, 34)
		sw.focus_mode = Control.FOCUS_NONE
		var st := StyleBoxFlat.new()
		st.bg_color = Color(0.55, 0.55, 0.55) if h < 0.0 else Color.from_hsv(h, 0.75, 0.85)
		st.set_corner_radius_all(17)
		st.set_border_width_all(3)
		st.border_color = Color(1, 1, 1, 0.0)
		sw.add_theme_stylebox_override("normal", st)
		sw.add_theme_stylebox_override("hover", st)
		sw.add_theme_stylebox_override("pressed", st)
		sw.tooltip_text = "Original" if h < 0.0 else ""
		sw.set_meta("hue", h)
		sw.pressed.connect(func() -> void: _set_hue(h))
		grid.add_child(sw)
		_swatches.add_child(Control.new()) # só para contar
	_swatch_grid = grid
	adult.text = "Tenho 18 anos ou mais. O jogo tem namoro e romance (sem nada explícito)."
	adult.add_theme_font_override("font", FONT_REG)
	adult.add_theme_font_size_override("font_size", 13)
	adult.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	adult.custom_minimum_size = Vector2(300, 0)
	_char_box.add_child(adult)
	# botão principal
	start_button = _button("Começar a vida", ACCENT, INK, func() -> void: _on_start())
	start_button.custom_minimum_size = Vector2(0, 56)
	start_button.add_theme_font_size_override("font_size", 20)
	v.add_child(start_button)
	guest_button = start_button
	login_button = start_button
	signup_button = start_button
	status_label.add_theme_font_override("font", FONT_REG)
	status_label.add_theme_font_size_override("font_size", 14)
	status_label.add_theme_color_override("font_color", Color("ffd2c4"))
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(status_label)
	v.add_child(_label("PC: setas ou WASD para andar · E para entrar · R para rodar · V para mudar de vista", 11, Color(1, 1, 1, 0.45), FONT_REG, HORIZONTAL_ALIGNMENT_CENTER, true))
	get_viewport().size_changed.connect(_fit)
	_fit()


var _swatch_grid: GridContainer


func _fit() -> void:
	var w := get_viewport().get_visible_rect().size.x
	_card.custom_minimum_size = Vector2(minf(460.0, w - 24.0), 0)


func _set_mode(m: String) -> void:
	mode = m
	_acc_box.visible = m != "jogar"
	_char_box.visible = m != "entrar"
	start_button.text = {"jogar": "Começar a vida", "criar": "Criar conta e começar", "entrar": "Entrar"}[m]
	for b: Node in _tabs.get_children():
		var on: bool = b.get_meta("tab") == m
		_paint(b, ACCENT if on else Color(1, 1, 1, 0.08), INK if on else Color.WHITE)
	status_label.text = ""


func _set_model(m: int) -> void:
	model = m
	_preview.cid = "mulher" if m == 1 else "homem"
	_preview.set_character(_preview.cid)
	_preview.set_top_hue(null if hue < 0.0 else hue)
	for i in _model_buttons.size():
		_paint(_model_buttons[i], ACCENT if i == m else Color(1, 1, 1, 0.08), INK if i == m else Color.WHITE)


func _set_hue(h: float) -> void:
	hue = h
	_preview.set_top_hue(null if h < 0.0 else h)
	for sw: Button in _swatch_grid.get_children():
		var st: StyleBoxFlat = sw.get_theme_stylebox("normal")
		st.border_color = Color.WHITE if is_equal_approx(float(sw.get_meta("hue")), h) else Color(1, 1, 1, 0)


## 🎲 Sorte: nome e visual ao acaso (a família e o bairro sorteiam-se ao nascer).
func _randomize(change_name: bool) -> void:
	_set_model(randi() % 2)
	_set_hue(HUES[randi() % HUES.size()])
	if change_name or name_edit.text == "":
		var pool: Array = NAMES_F if model == 1 else NAMES_M
		name_edit.text = str(pool[randi() % pool.size()])


func _on_guest() -> void:
	mode = "jogar"
	adult.button_pressed = true
	await _on_start()


func _on_start() -> void:
	if mode != "entrar":
		if name_edit.text.strip_edges().length() < 2:
			status_label.text = "Escolhe um nome com pelo menos 2 letras."
			return
		if not adult.button_pressed:
			status_label.text = "Confirma que tens 18 anos ou mais."
			return
	var step: Callable
	match mode:
		"jogar": step = func() -> String: return await Auth.sign_in_guest(name_edit.text.strip_edges())
		"criar": step = func() -> String: return await Auth.sign_up_email(email_edit.text.strip_edges(), password_edit.text, name_edit.text.strip_edges())
		_: step = func() -> String: return await Auth.sign_in_email(email_edit.text.strip_edges(), password_edit.text)
	await _run(step)


## Autentica, grava o visual escolhido e entra no bairro onde estava (ou na Cidade Baixa:
## uma personagem nova é levada pela lotaria da vida ao bairro onde cresce).
func _run(auth_step: Callable) -> void:
	_set_busy(true, "A autenticar…")
	var err: String = await auth_step.call()
	if err != "":
		_set_busy(false, err)
		return
	var district := AppConfig.default_district
	if mode != "entrar":
		var body := {"name": name_edit.text.strip_edges(), "appearance": {"body": 0, "shirt": 0, "model": model, "top": -1 if hue < 0.0 else int(hue * 360.0)}}
		var res: Variant = await Net.post_json("/me/character", body)
		if typeof(res) == TYPE_DICTIONARY and res.get("lastDistrict") != null:
			district = str(res.lastDistrict)
	else:
		var me: Variant = await Net.get_json("/me/character")
		if typeof(me) == TYPE_DICTIONARY and me.get("lastDistrict") != null:
			district = str(me.lastDistrict)
	if AppConfig.args.has("district"):
		district = str(AppConfig.args.district)
	_set_busy(true, "A preparar o bairro…")
	err = await Packs.ensure_bairro(district)
	if err != "":
		_set_busy(false, err)
		return
	_set_busy(true, "A entrar no Huambo…")
	err = await Net.join_district(district)
	if err != "":
		_set_busy(false, err)
		return
	if Net.welcome.is_empty():
		await Net.welcomed
	var map_id := str(Net.welcome.get("district", {}).get("map", {}).get("id", ""))
	get_tree().change_scene_to_file("res://src/game/bairro_world.tscn" if map_id.begins_with("bairro:") else "res://src/world/world.tscn")


func _set_busy(busy: bool, text: String) -> void:
	status_label.text = text
	status_label.add_theme_color_override("font_color", Color(1, 1, 1, 0.8) if busy else Color("ffd2c4"))
	start_button.disabled = busy


# ------------------------------------------------------------------ estilo

func _label(t: String, fs: int, col: Color, font: Font, align: HorizontalAlignment, wrap := false) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_font_override("font", font)
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", col)
	l.horizontal_alignment = align
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.custom_minimum_size = Vector2(300, 0)
	return l


func _style_edit(e: LineEdit, placeholder: String) -> void:
	e.placeholder_text = placeholder
	e.custom_minimum_size = Vector2(0, 46)
	e.add_theme_font_override("font", FONT)
	e.add_theme_font_size_override("font_size", 17)
	var st := StyleBoxFlat.new()
	st.bg_color = Color(1, 1, 1, 0.1)
	st.set_corner_radius_all(14)
	st.content_margin_left = 14
	st.content_margin_right = 14
	e.add_theme_stylebox_override("normal", st)
	var fo := st.duplicate()
	fo.border_color = ACCENT
	fo.set_border_width_all(2)
	e.add_theme_stylebox_override("focus", fo)


func _button(t: String, bg: Color, fg: Color, cb: Callable) -> Button:
	var b := Button.new()
	b.text = t
	b.custom_minimum_size = Vector2(0, 44)
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_override("font", FONT_BOLD)
	b.add_theme_font_size_override("font_size", 16)
	_paint(b, bg, fg)
	b.pressed.connect(cb)
	return b


func _paint(b: Button, bg: Color, fg: Color) -> void:
	for s: String in ["normal", "hover", "pressed", "disabled"]:
		var st := StyleBoxFlat.new()
		st.bg_color = bg.lightened(0.1) if s == "hover" else (bg.darkened(0.1) if s == "pressed" else bg)
		st.set_corner_radius_all(22)
		st.content_margin_left = 18
		st.content_margin_right = 18
		b.add_theme_stylebox_override(s, st)
	for s: String in ["font_color", "font_hover_color", "font_pressed_color", "font_disabled_color"]:
		b.add_theme_color_override(s, fg)
