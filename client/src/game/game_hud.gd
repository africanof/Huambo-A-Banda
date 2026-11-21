class_name GameHud
extends CanvasLayer
## Interface do jogo em rede (Fase A):
##   · barra de cima: bairro, hora de Angola, carteira;
##   · necessidades: fome, energia, humor, saúde;
##   · botão de ação conforme o lugar onde estás (comer, trabalhar, estudar, dormir, entrar);
##   · telemóvel 📱: perfil, vagas de emprego e ajuda;
##   · avisos curtos do servidor.
## Tudo o que mexe em dinheiro ou estado é PEDIDO ao servidor (Net.action); o servidor decide.

signal ui_action(id: String)

const FONT := preload("res://assets/fonts/Inter-SemiBold.otf")
const FONT_BOLD := preload("res://assets/fonts/Inter-Bold.otf")
const FONT_REG := preload("res://assets/fonts/Inter-Regular.otf")
const BG := Tema.PANEL
const ACCENT := Tema.GOLD
const INK := Tema.INK
const NEEDS := [["hunger", "Fome", Tema.NEED_HUNGER], ["energy", "Energia", Tema.NEED_ENERGY], ["mood", "Humor", Tema.NEED_MOOD], ["health", "Saúde", Tema.NEED_HEALTH]]

var place_text := ""
var catalog: Dictionary = {}
var top_label := Label.new()
var need_bars: Dictionary = {}
var actions_box := HBoxContainer.new()
var busy_box := VBoxContainer.new()
var busy_label := Label.new()
var busy_bar := ProgressBar.new()
var toast_label := Label.new()
var toast_panel := PanelContainer.new()
var phone := PanelContainer.new()
var phone_body := VBoxContainer.new()
var phone_tab := "inicio"
var _clock_min := 0.0
var _stats := {"hoje": 0, "online": 0}
var _stats_at := -100000
var menu_panel := PanelContainer.new()
var menu_body := VBoxContainer.new()
var _context: Dictionary = {}
var _toast_until := 0
var _title: Label
var _right := VBoxContainer.new()
var _needs_panel: PanelContainer
var _portrait := TextureRect.new()
var money_label := Label.new()
var sala_button := Button.new()
var _home_tab: Button
var _inside := false
var needs_button := Button.new()
var _dock: PanelContainer
const ACCENT_DARK := Tema.TERRA


func _ready() -> void:
	# --- topo ao centro: retrato + dinheiro (como nos jogos de vida para telemóvel)
	var money_pill := PanelContainer.new()
	var msb := _pill(BG, 36, Tema.GOLD_DEEP)
	msb.content_margin_left = 8
	msb.content_margin_right = 26
	msb.content_margin_top = 6
	msb.content_margin_bottom = 6
	money_pill.add_theme_stylebox_override("panel", msb)
	money_pill.anchor_left = 0.5
	money_pill.anchor_right = 0.5
	money_pill.grow_horizontal = Control.GROW_DIRECTION_BOTH
	money_pill.offset_top = 12
	add_child(money_pill)
	var mh := HBoxContainer.new()
	mh.add_theme_constant_override("separation", 12)
	money_pill.add_child(mh)
	_portrait.custom_minimum_size = Vector2(52, 52)
	_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	var frame := PanelContainer.new()
	var fsb := _pill(Tema.TERRA_DEEP, 28, ACCENT)
	fsb.set_content_margin_all(2)
	fsb.shadow_size = 0
	frame.add_theme_stylebox_override("panel", fsb)
	frame.clip_children = CanvasItem.CLIP_CHILDREN_AND_DRAW
	frame.add_child(_portrait)
	mh.add_child(frame)
	var mv := VBoxContainer.new()
	mv.add_theme_constant_override("separation", -2)
	mv.alignment = BoxContainer.ALIGNMENT_CENTER
	mh.add_child(mv)
	top_label.add_theme_font_override("font", FONT)
	top_label.add_theme_font_size_override("font_size", 13)
	top_label.add_theme_color_override("font_color", Tema.TEXT_MUTED)
	mv.add_child(top_label)
	money_label.add_theme_font_override("font", FONT_BOLD)
	money_label.add_theme_font_size_override("font_size", 26)
	money_label.add_theme_color_override("font_color", ACCENT)
	mv.add_child(money_label)
	_title = top_label

	# --- por baixo: "📍 Sala N ▾" — tocar mostra as salas do bairro (como no Vida na Banda)
	sala_button.anchor_left = 0.5
	sala_button.anchor_right = 0.5
	sala_button.grow_horizontal = Control.GROW_DIRECTION_BOTH
	sala_button.offset_top = 84
	_style_round(sala_button, 16, Color(0.1, 0.08, 0.07, 0.75))
	sala_button.add_theme_font_override("font", FONT)
	sala_button.add_theme_font_size_override("font_size", 14)
	sala_button.text = "Sala 1"
	sala_button.icon = DemoIcons.make("pin", Tema.TEXT, 18)
	sala_button.pressed.connect(_open_rooms)
	add_child(sala_button)
	_refresh_sala.call_deferred()

	# --- topo à esquerda: necessidade mais baixa; tocar abre as quatro
	needs_button.toggle_mode = true
	_style_round(needs_button, 26, BG)
	needs_button.custom_minimum_size = Vector2(150, 56)
	needs_button.position = Vector2(14, 90)
	needs_button.icon = DemoIcons.make("bowl", Tema.OK, 28)
	needs_button.add_theme_font_override("font", FONT_BOLD)
	needs_button.add_theme_font_size_override("font_size", 18)
	needs_button.toggled.connect(func(on: bool) -> void: _needs_panel.visible = on)
	add_child(needs_button)
	var needs := PanelContainer.new()
	needs.add_theme_stylebox_override("panel", _pill(BG, 18))
	needs.position = Vector2(14, 154)
	needs.visible = false
	add_child(needs)
	_needs_panel = needs
	var nv := VBoxContainer.new()
	nv.add_theme_constant_override("separation", 8)
	needs.add_child(nv)
	for n: Array in NEEDS:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var l := _label(n[1], 15, Tema.TEXT, FONT)
		l.custom_minimum_size = Vector2(70, 0)
		row.add_child(l)
		var bar := ProgressBar.new()
		bar.custom_minimum_size = Vector2(130, 14)
		bar.show_percentage = false
		bar.max_value = 100
		var fill := StyleBoxFlat.new()
		fill.bg_color = n[2]
		fill.set_corner_radius_all(7)
		var back := StyleBoxFlat.new()
		back.bg_color = Tema.BTN2
		back.set_corner_radius_all(7)
		bar.add_theme_stylebox_override("fill", fill)
		bar.add_theme_stylebox_override("background", back)
		bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(bar)
		need_bars[n[0]] = bar
		nv.add_child(row)

	# --- botões redondos à direita
	var right := _right
	right.add_theme_constant_override("separation", 12)
	right.anchor_left = 1.0
	right.anchor_right = 1.0
	right.offset_left = -78
	right.offset_right = -14
	right.offset_top = 90
	add_child(right)
	right.add_child(_round("target", "Seguir personagem", func() -> void: ui_action.emit("centrar")))
	right.add_child(_round("rotate", "Rodar a vista (R)", func() -> void: ui_action.emit("rodar")))
	right.add_child(_round("eye", "Ver por cima do ombro / pelos olhos", func() -> void: ui_action.emit("vista3d")))
	right.add_child(_round("plus", "Aproximar", func() -> void: ui_action.emit("zoom_mais")))
	right.add_child(_round("minus", "Afastar", func() -> void: ui_action.emit("zoom_menos")))
	right.add_child(_round("door", "Sair", func() -> void: ui_action.emit("sair")))

	# --- barra de baixo (separadores)
	var dock := PanelContainer.new()
	dock.add_theme_stylebox_override("panel", _pill(BG, 34))
	dock.anchor_left = 0.5
	dock.anchor_right = 0.5
	dock.anchor_top = 1.0
	dock.anchor_bottom = 1.0
	dock.grow_horizontal = Control.GROW_DIRECTION_BOTH
	dock.grow_vertical = Control.GROW_DIRECTION_BEGIN
	dock.offset_bottom = -14
	add_child(dock)
	_dock = dock
	var dh := HBoxContainer.new()
	dh.add_theme_constant_override("separation", 4)
	dock.add_child(dh)
	dh.add_child(_tab("phone", "Telemóvel", true, func() -> void: _toggle_phone()))
	_home_tab = _tab("home", "Casa", false, func() -> void:
		if _inside:
			Net.action("exit")
		else:
			_open_phone("casa"))
	dh.add_child(_home_tab)
	dh.add_child(_tab("map", "Mapa", false, func() -> void: _open_map()))
	dh.add_child(_tab("hand", "Gestos", false, func() -> void: _open_emotes()))
	dh.add_child(_tab("chat", "Falar", false, func() -> void: _open_chat()))

	# --- ações do lugar (em baixo, ao centro)
	actions_box.add_theme_constant_override("separation", 10)
	actions_box.alignment = BoxContainer.ALIGNMENT_CENTER
	actions_box.anchor_left = 0.0
	actions_box.anchor_right = 1.0
	actions_box.anchor_top = 1.0
	actions_box.anchor_bottom = 1.0
	actions_box.offset_top = -170
	actions_box.offset_bottom = -114
	add_child(actions_box)

	# --- ação em curso
	busy_box.anchor_left = 0.5
	busy_box.anchor_right = 0.5
	busy_box.anchor_top = 1.0
	busy_box.anchor_bottom = 1.0
	busy_box.offset_left = -170
	busy_box.offset_right = 170
	busy_box.offset_top = -230
	busy_box.offset_bottom = -180
	busy_label.add_theme_font_override("font", FONT)
	busy_label.add_theme_font_size_override("font_size", 16)
	busy_label.add_theme_color_override("font_outline_color", Color.BLACK)
	busy_label.add_theme_constant_override("outline_size", 5)
	busy_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	busy_box.add_child(busy_label)
	busy_bar.custom_minimum_size = Vector2(0, 14)
	busy_bar.show_percentage = false
	var bf := StyleBoxFlat.new()
	bf.bg_color = ACCENT
	bf.set_corner_radius_all(7)
	busy_bar.add_theme_stylebox_override("fill", bf)
	busy_box.add_child(busy_bar)
	busy_box.visible = false
	add_child(busy_box)

	# --- avisos
	toast_panel.add_theme_stylebox_override("panel", _pill(BG, 18))
	toast_panel.anchor_left = 0.5
	toast_panel.anchor_right = 0.5
	toast_panel.offset_left = -260
	toast_panel.offset_right = 260
	toast_panel.offset_top = 70
	toast_label.add_theme_font_override("font", FONT)
	toast_label.add_theme_font_size_override("font_size", 16)
	toast_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	toast_label.custom_minimum_size = Vector2(480, 0)
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_panel.add_child(toast_label)
	toast_panel.visible = false
	add_child(toast_panel)

	# --- telemóvel e ementa
	for p: PanelContainer in [phone, menu_panel]:
		var tall := p == phone
		p.add_theme_stylebox_override("panel", _pill(PHONE_BG if tall else Color(0.106, 0.075, 0.059, 0.96), 30 if tall else 22))
		p.anchor_left = 1.0
		p.anchor_right = 1.0
		p.anchor_bottom = 1.0
		p.offset_left = -560
		p.offset_right = -206
		p.offset_top = 14
		p.offset_bottom = -110 if tall else 0
		if not tall:
			p.anchor_bottom = 0.0
			p.offset_bottom = 420
		p.visible = false
		add_child(p)
	var ps := ScrollContainer.new()
	ps.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	phone.add_child(ps)
	phone_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	phone_body.add_theme_constant_override("separation", 10)
	ps.add_child(phone_body)
	var ms := ScrollContainer.new()
	ms.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	menu_panel.add_child(ms)
	menu_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	menu_body.add_theme_constant_override("separation", 10)
	ms.add_child(menu_body)

	get_viewport().size_changed.connect(_layout)
	_layout()
	Net.self_updated.connect(func(_me: Dictionary) -> void: refresh())
	Net.toast.connect(show_toast)
	refresh()


# ------------------------------------------------------------------ disposição

## Telemóvel e ementa: painel à direita no ecrã largo; largura do ecrã no estreito.
func _layout() -> void:
	var w := get_viewport().get_visible_rect().size.x
	var compact := w < 900.0
	for p: PanelContainer in [phone, menu_panel]:
		p.anchor_bottom = 1.0
		p.offset_bottom = -110
		if compact:
			p.anchor_left = 0.0
			p.offset_left = 12
			p.offset_right = -12
			p.offset_top = 84
		else:
			p.anchor_left = 1.0
			p.offset_left = -470
			p.offset_right = -92
			p.offset_top = 84
	var tw := minf(480.0, w - 40.0)
	toast_label.custom_minimum_size = Vector2(tw, 0)
	toast_panel.offset_left = -tw / 2.0 - 20.0
	toast_panel.offset_right = tw / 2.0 + 20.0
	toast_panel.offset_top = 90.0


## Retrato da personagem para o topo (recorte da cabeça e tronco da animação parada).
func set_portrait(tex: Texture2D) -> void:
	if tex == null:
		return
	var at := AtlasTexture.new()
	at.atlas = tex
	var sz := tex.get_size()
	at.region = Rect2(sz.x * 0.18, 0, sz.x * 0.64, sz.y * 0.42)
	_portrait.texture = at


# ------------------------------------------------------------------ atualização

func set_clock(minutes: float) -> void:
	_clock_min = minutes
	var h := int(minutes / 60.0)
	var m := int(minutes) % 60
	var money := int(Net.me.get("money", 0))
	var w: Dictionary = Net.me.get("tempo", {}) if typeof(Net.me.get("tempo")) == TYPE_DICTIONARY else {}
	var sky := ""
	if not w.is_empty():
		sky = " · %d°C%s" % [int(w.temp), " CHUVA" if w.ceu in ["chuva", "trovoada"] else ""]
	top_label.text = "%s · %s · %02d:%02d%s" % ["DIA" if h >= 6 and h < 18 else "NOITE", place_text.to_upper(), h, m, sky]
	money_label.text = "%s Kz" % DemoHud._money(money)


func _process(_delta: float) -> void:
	var busy: Variant = Net.me.get("busy")
	if typeof(busy) == TYPE_DICTIONARY:
		busy_box.visible = true
		var total := float(busy.total)
		var left := float(busy.msLeft) - float(Time.get_ticks_msec() - _busy_received)
		busy_bar.value = clampf(100.0 * (1.0 - left / maxf(total, 1.0)), 0, 100)
		busy_label.text = "%s… %ds" % [_busy_text(str(busy.kind)), maxi(0, ceili(left / 1000.0))]
	else:
		busy_box.visible = false
	if toast_panel.visible and Time.get_ticks_msec() > _toast_until:
		toast_panel.visible = false


var _busy_received := 0
var _offer_key := ""
var _offer_open := false


func refresh() -> void:
	_busy_received = Time.get_ticks_msec()
	var n: Dictionary = Net.me.get("needs", {})
	var low := ""
	for k: String in need_bars:
		(need_bars[k] as ProgressBar).value = float(n.get(k, 0))
		if low == "" or float(n.get(k, 0)) < float(n.get(low, 0)):
			low = k
	# botão das necessidades: mostra a mais urgente
	for e: Array in NEEDS:
		if e[0] == low:
			needs_button.text = "%s %d%%" % [e[1], int(n.get(low, 0))]
			needs_button.icon = DemoIcons.make("bowl", e[2], 28) if needs_button.get_meta("low", "") != low else needs_button.icon
			needs_button.set_meta("low", low)
	_rebuild_actions()
	var offer: Variant = Net.me.get("offer")
	var key := JSON.stringify(offer) if typeof(offer) == TYPE_DICTIONARY else ""
	if key != _offer_key:
		_offer_key = key
		if key != "":
			_open_offer(offer)
		elif menu_panel.visible and _offer_open:
			menu_panel.visible = false
		_offer_open = key != ""
	if phone.visible:
		_rebuild_phone()


func show_toast(text: String, ok: bool) -> void:
	toast_label.text = text
	toast_label.add_theme_color_override("font_color", Tema.TEXT)
	# faixa de cor à esquerda: verde-planalto (correu bem) ou terra vermelha (não deu)
	var sb := Tema.box(Tema.PANEL, 18)
	sb.border_width_left = 6
	sb.border_color = Tema.PLANALTO if ok else Tema.TERRA
	sb.content_margin_left = 20
	toast_panel.add_theme_stylebox_override("panel", sb)
	toast_panel.visible = true
	_toast_until = Time.get_ticks_msec() + 3500


## Lugar onde a personagem está (ou {}): define os botões de ação.
func set_context(place: Dictionary) -> void:
	if place.get("id", "") == _context.get("id", ""):
		return
	_context = place
	menu_panel.visible = false
	_rebuild_actions()


## Lá dentro o botão «Casa» passa a «Sair» (como no Vida na Banda).
func set_inside(on: bool) -> void:
	_inside = on
	if _home_tab == null:
		return
	_home_tab.text = "Sair" if on else "Casa"
	_home_tab.icon = DemoIcons.make("door" if on else "home", Tema.TEXT, 30)


## Faz a ação principal do sítio onde estou (o primeiro botão da barra de ações).
func use_context() -> void:
	_rebuild_actions()
	for b in actions_box.get_children():
		if b is Button and not b.is_queued_for_deletion():
			(b as Button).pressed.emit()
			return


func is_busy() -> bool:
	return typeof(Net.me.get("busy")) == TYPE_DICTIONARY


func _rebuild_actions() -> void:
	for c in actions_box.get_children():
		c.queue_free()
	if is_busy():
		actions_box.add_child(_button("Parar", "minus", BG, Tema.TEXT, func() -> void: Net.action("cancel")))
		return
	var inside: Variant = Net.me.get("inside")
	var kind := str(_context.get("kind", ""))
	var my_job: Dictionary = _job(str(Net.me.get("job", "")))
	var prices: Dictionary = catalog.get("prices", {})
	match kind:
		"door":
			var home := str(_context.get("venue", "")) in ["casa", "apartamentos"]
			actions_box.add_child(_button("Entrar — %s" % _context.name, "home" if home else "door", ACCENT, INK, func() -> void: Net.action("enter")))
		"exit":
			pass # o botão "Sair" está sempre visível lá dentro
		"car":
			actions_box.add_child(_button("Viajar de carro", "pin", ACCENT, INK, func() -> void: _open_map()))
		"stop":
			actions_box.add_child(_button("Apanhar transporte (paragem)", "pin", ACCENT, INK, func() -> void: _open_map()))
		"portal":
			var to := str(_context.get("to", ""))
			actions_box.add_child(_button(str(_context.name), "pin", ACCENT, INK, func() -> void: Net.action("travel", to)))
		"food":
			actions_box.add_child(_button("Comer — %s" % _interior_name(), "bag", ACCENT, INK, func() -> void: _open_menu()))
		"sleep":
			actions_box.add_child(_button("Dormir (%s Kz)" % DemoHud._money(int(prices.get("hotel", 0))), "sun", ACCENT, INK, func() -> void: Net.action("sleep")))
		"study":
			var uni: bool = typeof(inside) == TYPE_DICTIONARY and str(inside.get("venue", "")) == "universidade"
			var label := ("Aula de %s (%s Kz)" % [str(Net.me.get("uni", {}).get("cursoNome", "curso")), DemoHud._money(int(Net.me.get("uni", {}).get("preco", 3000)))]) if uni else ("Estudar (%s Kz)" % DemoHud._money(int(prices.get("study", 0))))
			actions_box.add_child(_button(label, "plus", ACCENT, INK, func() -> void: Net.action("study")))
		"home_sleep":
			actions_box.add_child(_button("Dormir na tua cama", "sun", ACCENT, INK, func() -> void: Net.action("sleep")))
		"home_eat":
			actions_box.add_child(_button("Cozinhar (%s Kz)" % DemoHud._money(int(prices.get("homeMeal", 500))), "bag", ACCENT, INK, func() -> void: Net.action("home_eat")))
		"bank":
			actions_box.add_child(_button("Banco", "bag", ACCENT, INK, func() -> void: _open_bank()))
		"service":
			actions_box.add_child(_button("Atendimento — %s" % _interior_name(), "person", ACCENT, INK, func() -> void: _open_services()))
		"work":
			var job_here := str(_context.get("job", ""))
			if my_job.get("place", "") == job_here:
				actions_box.add_child(_button("Trabalhar (%s Kz/turno)" % DemoHud._money(int(my_job.pay)), "bag", ACCENT, INK, func() -> void: Net.action("work")))
			else:
				var j := _job_by_place(job_here)
				if not j.is_empty():
					actions_box.add_child(_button("Vaga: %s" % j.name, "person", BG, Tema.TEXT, func() -> void: _open_phone("vagas")))
	if typeof(inside) == TYPE_DICTIONARY:
		actions_box.add_child(_button("Sair", "door", BG, Tema.TEXT, func() -> void: Net.action("exit")))


## Nome do edifício onde está o lugar atual (interior) ou do próprio lugar.
func _interior_name() -> String:
	var inside: Variant = Net.me.get("inside")
	return str(inside.name) if typeof(inside) == TYPE_DICTIONARY else str(_context.get("name", ""))


func _panel(title: String) -> void:
	for c in menu_body.get_children():
		c.queue_free()
	menu_body.add_child(_label(title, 22, ACCENT, FONT_BOLD, true))
	phone.visible = false
	menu_panel.visible = true


func _close_button() -> void:
	menu_body.add_child(_button("Fechar", "minus", BG, Tema.TEXT, func() -> void: menu_panel.visible = false))


## Mapa: vista geral do bairro e viagem de candongueiro para outros bairros do Huambo.
func _open_map() -> void:
	_panel("Mapa do Huambo")
	menu_body.add_child(_button("Ver o bairro todo / voltar", "map", BG, Tema.TEXT, func() -> void:
		ui_action.emit("mapa")
		menu_panel.visible = false))
	menu_body.add_child(_label("Apanhar candongueiro (%s Kz) para:" % DemoHud._money(int(catalog.get("prices", {}).get("travel", 200))), 16, Tema.TEXT, FONT, true))
	var here := str(Net.welcome.get("district", {}).get("id", ""))
	var http := HTTPRequest.new()
	add_child(http)
	http.request(AppConfig.server_url + "/districts")
	var r: Array = await http.request_completed
	http.queue_free()
	if not menu_panel.visible:
		return
	var list: Variant = JSON.parse_string((r[3] as PackedByteArray).get_string_from_utf8()) if r[0] == HTTPRequest.RESULT_SUCCESS else null
	if typeof(list) != TYPE_ARRAY:
		menu_body.add_child(_label("Não foi possível obter os bairros.", 14, Tema.DANGER, FONT_REG, true))
	else:
		var bairros: Array = (list as Array).filter(func(d: Dictionary) -> bool: return typeof(d.get("map")) == TYPE_DICTIONARY and str(d.map.get("id", "")).begins_with("bairro:"))
		var links: Array = []
		for d: Dictionary in bairros:
			if d.id == here:
				links = d.get("links", [])
		var cm := HuamboMap.new()
		cm.districts = bairros
		cm.here = here
		cm.picked.connect(func(id: String) -> void: _go(id, links.has(id)))
		menu_body.add_child(cm)
		menu_body.add_child(_label("A amarelo: bairros vizinhos a pé (vai ao fim da rua com a placa). Os outros: candongueiro.", 12, Tema.TEXT_MUTED, FONT_REG, true))
		bairros.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return str(a.name).naturalnocasecmp_to(str(b.name)) < 0)
		# catálogo com o postal de cada bairro (como as fotografias das cidades no Vida na Banda)
		menu_body.add_child(_label("Bairros do Huambo", 18, Tema.TEXT, FONT_BOLD))
		var grid := GridContainer.new()
		grid.columns = 2 # o painel tem a mesma largura no telemóvel e ao lado no computador
		grid.add_theme_constant_override("h_separation", 10)
		grid.add_theme_constant_override("v_separation", 10)
		for d: Dictionary in bairros:
			var id := str(d.id)
			grid.add_child(_bairro_card(id, str(d.name), id == here, links.has(id)))
		menu_body.add_child(grid)
	_close_button()


## Cartão do catálogo: postal do bairro + nome + como se vai (a pé / transporte / estás aqui).
func _bairro_card(id: String, name: String, here: bool, walk: bool) -> Control:
	var b := Button.new()
	b.custom_minimum_size = Vector2(0, 168)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.focus_mode = Control.FOCUS_NONE
	var sb := _pill(Tema.CARD, 18, ACCENT if here else Color(0, 0, 0, 0))
	sb.set_content_margin_all(0)
	b.add_theme_stylebox_override("normal", sb)
	var sbh := _pill(Tema.BTN2, 18, ACCENT)
	sbh.set_content_margin_all(0)
	b.add_theme_stylebox_override("hover", sbh)
	b.add_theme_stylebox_override("pressed", sbh)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	var v := VBoxContainer.new()
	v.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_theme_constant_override("separation", 2)
	b.add_child(v)
	var pic := TextureRect.new()
	var path := "res://assets/bairros/thumbs/%s.webp" % id
	pic.texture = load(path) if ResourceLoader.exists(path) else null
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	pic.custom_minimum_size = Vector2(0, 112)
	pic.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pic.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# cantos de cima redondos como o cartão
	var clip := PanelContainer.new()
	var cs := StyleBoxFlat.new()
	cs.bg_color = Tema.TEXT
	cs.corner_radius_top_left = 18
	cs.corner_radius_top_right = 18
	clip.add_theme_stylebox_override("panel", cs)
	clip.clip_children = CanvasItem.CLIP_CHILDREN_ONLY
	clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip.size_flags_vertical = Control.SIZE_EXPAND_FILL
	clip.add_child(pic)
	v.add_child(clip)
	var t := _label(name, 15, Tema.TEXT, FONT_BOLD)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(t)
	var tag := _label("Estás aqui" if here else ("A pé (vizinho)" if walk else "Transporte na paragem"), 12, ACCENT if here else (Tema.OK if walk else Tema.TEXT_FAINT), FONT_REG)
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(tag)
	if here:
		b.pressed.connect(func() -> void: show_toast("Já estás em %s." % name, true))
	else:
		b.pressed.connect(func() -> void: _go(id, walk))
	return b


## Destino escolhido no mapa: vizinho → mostra o caminho (placa no fim da rua); senão candongueiro.
func _go(id: String, walk: bool) -> void:
	menu_panel.visible = false
	if walk:
		ui_action.emit("caminho:" + id)
		return
	_panel("Como queres ir?")
	var at_stop := str(_context.get("kind", "")) == "stop"
	if not at_stop:
		menu_body.add_child(_label("Os candongueiros, kupapatas, táxis e autocarros param na paragem do bairro.", 14, Tema.TEXT, FONT_REG, true))
		menu_body.add_child(_button("Ir a pé até à paragem", "pin", Color("f2c14e"), INK, func() -> void:
			ui_action.emit("paragem")
			menu_panel.visible = false))
	for tr: Dictionary in catalog.get("transports", [{"id": "candongueiro", "name": "Candongueiro", "price": 200}]):
		var how := str(tr.id)
		if how == "carro" and Net.me.get("car") == null:
			continue
		if how != "carro" and not at_stop:
			continue
		menu_body.add_child(_button("%s · %s Kz" % [tr.name, DemoHud._money(int(tr.price))], "pin", ACCENT, INK, func() -> void:
			Net.action_travel(id, how)
			menu_panel.visible = false))
	_close_button()


const GUIDE := [
	["Bem-vindo ao Huambo!", "Toca no chão para andar (ou usa as setas / WASD). Arrasta com o dedo para olhar à volta; belisca ou usa + e − para o zoom."],
	["Entra nos sítios", "Todos os edifícios com nome abrem: cantina, banco, escola, igreja, hotel, discoteca… Chega à porta e toca em «Entrar»."],
	["Andar pela cidade", "As placas no fim das ruas levam-te a pé ao bairro vizinho. Para mais longe, vai à paragem e apanha candongueiro, kupapata, táxi ou autocarro."],
	["Minimapa e salas", "O minimapa no canto mostra-te onde estás — toca nele para o abrir e escolher para onde ir. Em cima, «Sala» deixa-te mudar de sala para estares com amigos."],
	["A tua vida", "Cuida da fome, energia e diversão. No telemóvel procuras trabalho, compras casa e carro. Boa banda!"],
]


## Guia de primeira visita (uma vez por aparelho).
func show_guide(step := 0) -> void:
	if step >= GUIDE.size():
		menu_panel.visible = false
		var cfg := ConfigFile.new()
		cfg.set_value("guia", "visto", true)
		cfg.save("user://guia.cfg")
		return
	_panel("%s  (%d/%d)" % [GUIDE[step][0], step + 1, GUIDE.size()])
	menu_body.add_child(_label(GUIDE[step][1], 17, Tema.TEXT, FONT_REG, true))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.add_child(_button("Saltar", "minus", BG, Tema.TEXT, func() -> void: show_guide(GUIDE.size())))
	row.add_child(_button("Percebi" if step == GUIDE.size() - 1 else "Seguinte", "plus", ACCENT, INK, func() -> void: show_guide(step + 1)))
	menu_body.add_child(row)


static func guide_seen() -> bool:
	var cfg := ConfigFile.new()
	return cfg.load("user://guia.cfg") == OK and bool(cfg.get_value("guia", "visto", false))


## Número da sala onde estou (ordem de criação no servidor).
func _refresh_sala() -> void:
	var rooms: Variant = await Net.get_json("/districts/%s/rooms" % Net.current_district)
	if typeof(rooms) != TYPE_ARRAY or Net.room == null:
		return
	for r: Dictionary in rooms:
		if str(r.roomId) == Net.room.room_id:
			sala_button.text = "Sala %d" % int(r.sala)


## Lista de salas do bairro: quantos estão em cada uma; tocar muda de sala.
func _open_rooms() -> void:
	_panel("Salas — %s" % place_text)
	menu_body.add_child(_label("Cada bairro tem várias salas com outras pessoas. Muda para estar com os teus amigos.", 14, Tema.TEXT, FONT_REG, true))
	var rooms: Variant = await Net.get_json("/districts/%s/rooms" % Net.current_district)
	if not menu_panel.visible:
		return
	if typeof(rooms) != TYPE_ARRAY:
		menu_body.add_child(_label("Não foi possível obter as salas.", 14, Tema.DANGER, FONT_REG, true))
	else:
		for r: Dictionary in rooms:
			var mine: bool = Net.room != null and str(r.roomId) == Net.room.room_id
			var full := int(r.clients) >= int(r.maxClients)
			var rid := str(r.roomId)
			var txt := "Sala %d · %d/%d pessoas%s" % [int(r.sala), int(r.clients), int(r.maxClients), "  (estás aqui)" if mine else ""]
			var b := _button(txt, "person", BG if mine or full else ACCENT, Tema.TEXT if mine or full else INK, func() -> void:
				menu_panel.visible = false
				ui_action.emit("sala:" + rid))
			b.disabled = mine or full
			menu_body.add_child(b)
	_close_button()


func _open_bank() -> void:
	_panel("Banco Planalto")
	menu_body.add_child(_label("Na carteira: %s Kz\nNo banco: %s Kz" % [DemoHud._money(int(Net.me.get("money", 0))), DemoHud._money(int(Net.me.get("bank", 0)))], 16, Tema.TEXT, FONT_REG, true))
	menu_body.add_child(_label("Depositar", 16, Tema.TEXT, FONT, true))
	var row := HBoxContainer.new()
	for v: int in [1000, 10000, 100000]:
		row.add_child(_button(DemoHud._money(v), "plus", ACCENT, INK, func() -> void: Net.action("bank_in", "", v)))
	var all_in := int(Net.me.get("money", 0))
	if all_in > 0:
		row.add_child(_button("Tudo", "plus", ACCENT, INK, func() -> void: Net.action("bank_in", "", all_in)))
	menu_body.add_child(row)
	menu_body.add_child(_label("Levantar", 16, Tema.TEXT, FONT, true))
	var row2 := HBoxContainer.new()
	for v: int in [1000, 10000, 100000]:
		row2.add_child(_button(DemoHud._money(v), "minus", BG, Tema.TEXT, func() -> void: Net.action("bank_out", "", v)))
	var all_out := int(Net.me.get("bank", 0))
	if all_out > 0:
		row2.add_child(_button("Tudo", "minus", BG, Tema.TEXT, func() -> void: Net.action("bank_out", "", all_out)))
	menu_body.add_child(row2)
	_close_button()


func _open_services() -> void:
	var inside: Variant = Net.me.get("inside")
	var venue := str(inside.venue) if typeof(inside) == TYPE_DICTIONARY else ""
	_panel(_interior_name())
	var docs: Dictionary = Net.me.get("docs", {})
	for sv: Dictionary in catalog.get("services", []):
		if sv.venue != venue:
			continue
		var row := HBoxContainer.new()
		var done := sv.has("doc") and bool(docs.get(sv.doc, false))
		row.add_child(_label(str(sv.name) + (" ✓" if done else ""), 15, Tema.TEXT, FONT_REG, true))
		var id: String = sv.id
		if not done:
			row.add_child(_button("%s Kz" % DemoHud._money(int(sv.price)), "bag", ACCENT, INK, func() -> void:
				Net.action("service", id)
				menu_panel.visible = false))
		menu_body.add_child(row)
	_close_button()


## Casas à porta de um edifício de habitação (chega do servidor depois de "Entrar").
func _open_offer(offer: Dictionary) -> void:
	_panel(str(offer.name))
	var buy := int(offer.buy)
	var per_day := int(offer.rentPerDay)
	menu_body.add_child(_label("Renda: %s Kz/dia (7 dias pagam 6) · Comprar: %s Kz" % [DemoHud._money(per_day), DemoHud._money(buy)], 14, Tema.TEXT_MUTED, FONT_REG, true))
	for u: Dictionary in offer.units:
		var box := VBoxContainer.new()
		var state := "é tua" if u.mine else ("livre" if u.free else "ocupada")
		box.add_child(_label("%s — %s" % [u.name, state], 16, Tema.TEXT if u.free else Tema.TEXT_FAINT, FONT, true))
		var id: String = u.id
		if u.free:
			var row := HBoxContainer.new()
			row.add_child(_button("1 dia: %s" % DemoHud._money(per_day), "home", ACCENT, INK, func() -> void: Net.action("rent_house", id, 1)))
			row.add_child(_button("7 dias: %s" % DemoHud._money(per_day * 6), "home", ACCENT, INK, func() -> void: Net.action("rent_house", id, 7)))
			box.add_child(row)
			box.add_child(_button("Comprar: %s Kz" % DemoHud._money(buy), "bag", BG, Tema.TEXT, func() -> void: Net.action("buy_house", id)))
		menu_body.add_child(box)
	_close_button()


# ------------------------------------------------------------------ ementa

func _open_menu() -> void:
	for c in menu_body.get_children():
		c.queue_free()
	menu_body.add_child(_label(str(_context.get("name", "Comer")), 22, ACCENT, FONT_BOLD))
	for item: Dictionary in catalog.get("menus", {}).get(str(_context.get("shop", "")), []):
		var row := HBoxContainer.new()
		var info := _label("%s\n+%d fome%s" % [item.name, int(item.hunger), "" if not item.has("energy") else ", +%d energia" % int(item.energy)], 15, Tema.TEXT, FONT_REG, true)
		row.add_child(info)
		var id: String = item.id
		row.add_child(_button("%s Kz" % DemoHud._money(int(item.price)), "bag", ACCENT, INK, func() -> void:
			Net.action("eat", id)
			menu_panel.visible = false))
		menu_body.add_child(row)
	menu_body.add_child(_button("Fechar", "minus", BG, Tema.TEXT, func() -> void: menu_panel.visible = false))
	phone.visible = false
	menu_panel.visible = true


# ------------------------------------------------------------------ telemóvel

func _toggle_phone() -> void:
	if phone.visible:
		phone.visible = false
	else:
		_open_phone("inicio")


func _open_phone(tab: String) -> void:
	phone_tab = tab
	menu_panel.visible = false
	phone.visible = true
	_rebuild_phone()


## Telemóvel como no Vida na Banda: ecrã inicial (hora, missões do dia, apps) e cada app no seu ecrã.
const PHONE_BG := Tema.PHONE
const APP_DARK := Tema.BTN2
const APP_RED := Tema.TERRA
const APP_YELLOW := Tema.GOLD
## [id, nome, ícone, cor]
const APPS := [
	["missoes", "Missões", "target", "y"], ["perfil", "Perfil", "person", "d"], ["jornal", "Jornal", "more", "d"], ["mapa", "Mapa", "map", "r"],
	["familia", "Família", "home", "d"], ["saude", "Saúde", "plus", "r"], ["amigos", "Amigos", "person", "r"], ["grupos", "Grupos", "hand", "d"],
	["biscatos", "Ganhar dinheiro", "bag", "y"], ["vagas", "Vagas", "bag", "r"], ["estudos", "Estudos", "plus", "d"], ["banco", "Banco", "bag", "d"],
	["cambio", "Câmbio", "rotate", "d"], ["transferir", "Transferir", "person", "y"], ["casa", "Casa", "home", "d"], ["loja", "Loja", "shirt", "y"],
	["radio", "Rádio", "chat", "d"], ["sorte", "Sorte", "target", "d"], ["governo", "Governo", "door", "d"], ["lavras", "Lavras", "plus", "y"],
	["ambicao", "Ambição", "target", "r"], ["ricos", "Ricos", "bag", "y"], ["tempo", "Tempo", "sun", "d"], ["negocio", "Empresas", "bag", "r"],
	["imoveis", "Imóveis", "home", "d"], ["muxima", "Muxima", "chat", "r"], ["roupa", "Guarda-roupa", "shirt", "r"], ["classificados", "Classificados", "bag", "y"],
	["quintal", "Quintal", "home", "y"], ["desporto", "Desporto", "person", "r"], ["quiz", "Saber Huambo", "target", "y"], ["presentes", "Presentes", "hand", "r"],
	["definicoes", "Definições", "more", "d"],
	["ajuda", "Ajuda", "more", "d"],
]
## Cada app tem a cor da sua família (vida, dinheiro, social, cidade): o ecrã lê-se de relance.
const APP_CATEGORY := {
	"missoes": "vida", "perfil": "vida", "familia": "vida", "saude": "vida", "ambicao": "vida", "estudos": "vida", "desporto": "vida",
	"biscatos": "dinheiro", "vagas": "dinheiro", "banco": "dinheiro", "cambio": "dinheiro", "transferir": "dinheiro", "negocio": "dinheiro",
	"imoveis": "dinheiro", "classificados": "dinheiro", "ricos": "dinheiro", "sorte": "dinheiro",
	"amigos": "social", "grupos": "social", "muxima": "social", "radio": "social", "presentes": "social", "quiz": "social", "jornal": "social",
	"mapa": "cidade", "casa": "cidade", "loja": "cidade", "roupa": "cidade", "governo": "cidade", "lavras": "cidade", "quintal": "cidade", "tempo": "cidade",
}
const WEEKDAYS := ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"]
const MONTHS := ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


func _rebuild_phone() -> void:
	for c in phone_body.get_children():
		c.queue_free()
	if phone_tab != "inicio":
		var head := HBoxContainer.new()
		head.add_theme_constant_override("separation", 10)
		head.add_child(_button("Início", "minus", Tema.BTN2, Tema.TEXT, func() -> void: _open_phone("inicio")))
		var t := ""
		for a: Array in APPS:
			if a[0] == phone_tab:
				t = a[1]
		head.add_child(_label(t, 22, ACCENT, FONT_BOLD))
		phone_body.add_child(head)
	match phone_tab:
		"inicio": _phone_start()
		"missoes": _phone_missions()
		"perfil": _phone_profile()
		"familia": _phone_family()
		"vagas": _phone_jobs()
		"estudos": _phone_studies()
		"banco": _phone_bank()
		"quintal": _phone_quintal()
		"desporto": _phone_sport()
		"quiz": _phone_quiz()
		"presentes": _phone_gifts()
		"definicoes": _phone_settings()
		"casa": _phone_home()
		"loja": _phone_shop()
		"saude": _phone_health()
		"governo": _phone_go("Governo", "BI: %s · Registo criminal: %s · Atestado de residência: %s\nTrata dos documentos na Administração do bairro, no Governo Provincial ou no Tribunal." % ["✓" if Net.me.get("docs", {}).get("bi", false) else "—", "✓" if Net.me.get("docs", {}).get("registo", false) else "—", "✓" if Net.me.get("docs", {}).get("residencia", false) else "—"], "administracao", "Ir à Administração")
		"ajuda": _phone_help()
		"sorte": _phone_luck()
		"biscatos": _phone_biscatos()
		"lavras": _phone_lavras()
		"negocio": _phone_business()
		"muxima": _phone_muxima()
		"roupa": _phone_wardrobe()
		"classificados": _phone_classifieds()
		"imoveis": _phone_housing()
		"ambicao": _phone_ambition()
		"ricos": _phone_rich()
		"tempo": _phone_weather()
		"cambio": _phone_cambio()
		"radio": _phone_radio()
		"jornal": _phone_jornal()
		"amigos": _phone_friends()
		"grupos": _phone_groups()
		"transferir": _phone_transfer()
	phone_body.add_child(_button("Fechar o telemóvel", "minus", Tema.BTN2, Tema.TEXT, func() -> void: phone.visible = false))


func _card() -> VBoxContainer:
	var p := PanelContainer.new()
	var sb := _pill(Tema.CARD, 26)
	sb.set_content_margin_all(18)
	sb.shadow_size = 0
	p.add_theme_stylebox_override("panel", sb)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	p.add_child(v)
	phone_body.add_child(p)
	return v


## Ecrã inicial: hora grande, data, cidade, dinheiro, pessoas a jogar hoje, missões e apps.
func _phone_start() -> void:
	var c := _card()
	var h := int(_clock_min / 60.0)
	c.add_child(_label("%02d:%02d" % [h, int(_clock_min) % 60], 64, Tema.TEXT, FONT_BOLD))
	var now := Time.get_datetime_dict_from_unix_time(int(Time.get_unix_time_from_system()) + 3600)
	c.add_child(_label("%s, %d de %s" % [WEEKDAYS[int(now.weekday)], int(now.day), MONTHS[int(now.month) - 1]], 17, Tema.TEXT_FAINT, FONT_REG))
	var row := HBoxContainer.new()
	var city := _label(("Dia" if h >= 6 and h < 18 else "Noite") + " · Huambo · " + place_text, 17, Tema.TEXT, FONT_BOLD)
	city.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(city)
	row.add_child(_label("%s Kz" % DemoHud._money(int(Net.me.get("money", 0))), 18, ACCENT, FONT_BOLD))
	c.add_child(row)
	c.add_child(_label("●  %s pessoas a jogar hoje" % DemoHud._money(int(_stats.hoje)), 16, Tema.OK, FONT))
	for ev: Dictionary in Net.me.get("eventos", []):
		c.add_child(_label("Hoje no Huambo: %s — %s" % [ev.name, ev.texto], 14, ACCENT, FONT_BOLD, true))
	if Time.get_ticks_msec() - _stats_at > 30000:
		_stats_at = Time.get_ticks_msec()
		_fetch_stats()
	# missões do dia
	var ms: Dictionary = Net.me.get("missions", {}) if typeof(Net.me.get("missions")) == TYPE_DICTIONARY else {}
	var items: Array = ms.get("items", [])
	if not items.is_empty():
		var m := _card()
		var done := items.filter(func(x: Dictionary) -> bool: return bool(x.done)).size()
		var to_claim := items.filter(func(x: Dictionary) -> bool: return bool(x.done) and not bool(x.claimed)).size()
		var hr := HBoxContainer.new()
		var ht := _label("Hoje · %d/%d" % [done, items.size()], 18, Tema.TEXT, FONT_BOLD)
		ht.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hr.add_child(ht)
		if to_claim > 0:
			hr.add_child(_label("%d por recolher" % to_claim, 16, ACCENT, FONT_BOLD))
		m.add_child(hr)
		_mission_rows(m, items, ms)
	# apps
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 12)
	for a: Array in APPS:
		grid.add_child(_app(a))
	phone_body.add_child(grid)


func _app(a: Array) -> Control:
	var v := VBoxContainer.new()
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	v.add_theme_constant_override("separation", 4)
	var bg: Color = Tema.app_color(str(APP_CATEGORY.get(str(a[0]), "")))
	var fg := Tema.on(bg)
	var b := Button.new()
	b.icon = DemoIcons.make(str(a[2]), fg, 34)
	b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.custom_minimum_size = Vector2(70, 70)
	b.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_style_round(b, 22, bg)
	var id := str(a[0])
	b.pressed.connect(func() -> void:
		if id == "mapa":
			_open_map()
		else:
			_open_phone(id))
	v.add_child(b)
	var l := _label(str(a[1]), 14, Tema.TEXT, FONT_BOLD)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(l)
	if id == "missoes":
		var ms: Variant = Net.me.get("missions")
		if typeof(ms) == TYPE_DICTIONARY:
			var n: int = (ms.get("items", []) as Array).filter(func(x: Dictionary) -> bool: return bool(x.done) and not bool(x.claimed)).size()
			if n > 0:
				l.text = "Missões (%d)" % n
	return v


func _mission_rows(box: VBoxContainer, items: Array, ms: Dictionary) -> void:
	for i in items.size():
		var it: Dictionary = items[i]
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var mark := "✓" if bool(it.claimed) else ("●" if bool(it.done) else "○")
		var txt := _label("%s  %s" % [mark, it.text], 15, Tema.TEXT if not bool(it.claimed) else Tema.TEXT_FAINT, FONT_REG, true)
		txt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(txt)
		if bool(it.done) and not bool(it.claimed):
			var n := i + 1
			row.add_child(_button("+%s" % DemoHud._money(int(it.reward)), "plus", ACCENT, INK, func() -> void: Net.action("mission_claim", "", n)))
		elif not bool(it.done):
			row.add_child(_label("%s Kz" % DemoHud._money(int(it.reward)), 13, Tema.TEXT_FAINT, FONT_REG))
		box.add_child(row)
	if int(ms.get("progress", 0)) > 0:
		box.add_child(_label("Sítios visitados hoje: %d/3" % int(ms.progress), 13, Tema.TEXT_FAINT, FONT_REG))
	box.add_child(_label("Sequência: %d dia(s) completos · dia completo hoje: +%s Kz" % [int(ms.get("streak", 0)), DemoHud._money(int(ms.get("streakBonus", 0)))], 13, ACCENT, FONT_REG, true))


func _phone_missions() -> void:
	var ms: Dictionary = Net.me.get("missions", {}) if typeof(Net.me.get("missions")) == TYPE_DICTIONARY else {}
	var c := _card()
	c.add_child(_label("Faz as 3 missões de hoje e recolhe os prémios. Completar o dia seguido aumenta o bónus da sequência (até 7 dias).", 15, Tema.TEXT_MUTED, FONT_REG, true))
	_mission_rows(c, ms.get("items", []), ms)


func _phone_family() -> void:
	var b: Variant = Net.me.get("birth")
	var c := _card()
	c.add_child(_label(str(Net.me.get("familyLabel", "")), 18, Tema.TEXT, FONT_BOLD, true))
	if typeof(b) == TYPE_DICTIONARY:
		c.add_child(_label("Pais: %s\nProvíncia de origem: %s\nCresceste em: %s" % [b.pais, b.provincia, b.bairroNome], 15, Tema.TEXT, FONT_REG, true))
	if bool(Net.me.get("parentsToday", false)):
		c.add_child(_label("Já pediste dinheiro aos pais hoje.", 14, Tema.TEXT_FAINT, FONT_REG, true))
	else:
		c.add_child(_button("Pedir dinheiro aos pais", "person", ACCENT, INK, func() -> void: Net.action("parents")))
	_love_section()


## App que mostra o estado e leva-te a pé ao sítio certo do bairro.
func _phone_go(_title: String, text: String, venue: String, go_text: String) -> void:
	var c := _card()
	c.add_child(_label(text, 16, Tema.TEXT, FONT_REG, true))
	c.add_child(_button(go_text, "pin", ACCENT, INK, func() -> void:
		phone.visible = false
		ui_action.emit("ir:" + venue)))


## Banco: saldos, ida ao balcão e depósito a prazo (feito no telemóvel, como o internet banking).
const PRAZO_INFO := [["curto", "30 minutos", "2%"], ["medio", "3 horas", "6%"], ["longo", "24 horas", "15%"]]
const PRAZO_VALORES := [10000, 50000, 100000, 500000]


const REASON_LABELS := [["work", "Salário"], ["salario", "Salário"], ["biscato", "Biscato"], ["eat", "Comida"], ["food", "Comida"], ["service", "Serviço"], ["bank", "Banco"],
	["transfer.in", "Recebido de alguém"], ["transfer.out", "Dado a alguém"], ["mission", "Missão"], ["conquista", "Conquista"], ["lavra", "Lavra"], ["criacao", "Quintal"],
	["prazo", "Depósito a prazo"], ["quiz", "Saber Huambo"], ["presente", "Presente"], ["seguro", "Seguro de saúde"], ["kixi", "Kixikila"], ["classif", "Classificados"],
	["cambio", "Câmbio"], ["casa", "Casa"], ["house", "Casa"], ["rent", "Renda"], ["travel", "Viagem"], ["car", "Carro"], ["negocio", "Empresa"], ["sorte", "Sorte"],
	["radio", "Rádio"], ["roupa", "Roupa"], ["uni", "Universidade"], ["study", "Estudos"], ["parents", "Pais"], ["roubo", "Assalto"], ["policia", "Polícia"],
	["starting_balance", "Saldo inicial"], ["grupo", "Grupo"], ["muxima", "Muxima"], ["casamento", "Casamento"], ["hotel", "Hotel"]]


static func _reason_label(r: String) -> String:
	for x: Array in REASON_LABELS:
		if r.begins_with(str(x[0])):
			return str(x[1])
	return r.split(".")[0].capitalize()


func _phone_bank() -> void:
	_phone_go("Banco", "Na carteira: %s Kz\nNo banco: %s Kz\nDepositar e levantar faz-se ao balcão do banco." % [DemoHud._money(int(Net.me.get("money", 0))), DemoHud._money(int(Net.me.get("bank", 0)))], "banco", "Ir ao banco")
	var c := _card()
	c.add_child(_label("Depósito a prazo", 18, ACCENT, FONT_BOLD))
	var d: Variant = Net.me.get("prazo")
	if typeof(d) == TYPE_DICTIONARY:
		var secs := int(d.faltamS)
		c.add_child(_label("%s Kz a %d%% por %s." % [DemoHud._money(int(d.amount)), roundi(float(d.rate) * 100), d.name], 16, Tema.TEXT, FONT_REG, true))
		if secs > 0:
			c.add_child(_label("Faltam %s. No fim recebes %s Kz. Se levantares antes, recebes só o que puseste." % [_dur(secs), DemoHud._money(int(d.total))], 14, Tema.TEXT_MUTED, FONT_REG, true))
			c.add_child(_button("Levantar já (sem juros)", "minus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("prazo_levantar")))
		else:
			c.add_child(_label("O prazo acabou! Recebes %s Kz." % DemoHud._money(int(d.total)), 16, Tema.OK, FONT_BOLD, true))
			c.add_child(_button("Levantar com juros", "bag", ACCENT, INK, func() -> void: Net.action("prazo_levantar")))
		_extrato_card()
		return
	c.add_child(_label("Põe dinheiro da carteira a render. Escolhe o prazo e a quantia:", 15, Tema.TEXT, FONT_REG, true))
	_extrato_card()
	for p: Array in PRAZO_INFO:
		c.add_child(_label("%s · juros de %s" % [p[1], p[2]], 15, Tema.TEXT, FONT_BOLD))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		for v: int in PRAZO_VALORES:
			var termo := str(p[0])
			var b := _button(_short_kz(v), "plus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("prazo_abrir", termo, v))
			b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(b)
		c.add_child(row)


## Extrato: os últimos movimentos da carteira (o livro-razão do servidor).
func _extrato_card() -> void:
	var c := _card()
	c.add_child(_label("Extrato da carteira", 18, ACCENT, FONT_BOLD))
	var ex: Variant = Net.me.get("extrato")
	if typeof(ex) != TYPE_ARRAY:
		c.add_child(_button("Ver os últimos movimentos", "more", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("extrato")))
		return
	if (ex as Array).is_empty():
		c.add_child(_label("Ainda não há movimentos.", 14, Tema.TEXT_FAINT, FONT_REG))
	for m: Dictionary in ex:
		var row := HBoxContainer.new()
		var when := Time.get_datetime_dict_from_unix_time(int(float(m.at) / 1000.0) + 3600)
		var l := _label("%02d/%02d %02d:%02d  %s" % [int(when.day), int(when.month), int(when.hour), int(when.minute), _reason_label(str(m.reason))], 13, Tema.TEXT, FONT_REG)
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(l)
		var amt := int(m.amount)
		row.add_child(_label(("+" if amt > 0 else "−") + DemoHud._money(absi(amt)), 14, Tema.OK if amt > 0 else Tema.DANGER, FONT_BOLD))
		c.add_child(row)
	c.add_child(_button("Atualizar", "rotate", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("extrato")))


static func _short_kz(v: int) -> String:
	return ("%dk" % (v / 1000)) if v < 1000000 else ("%dM" % (v / 1000000))


static func _dur(secs: int) -> String:
	if secs >= 3600:
		return "%d h %02d min" % [secs / 3600, (secs % 3600) / 60]
	return "%d min %02d s" % [secs / 60, secs % 60]


## Quintal: galinhas, cabritos e porcos — compram-se e vendem-se no mercado, a ração dá-se em qualquer lado.
const ANIMAL_INFO := [["galinha", "Galinha", "2.500 Kz · põe 1 ovo a cada 15 min se tiver ração · vende-se a 3.000 Kz"], ["cabrito", "Cabrito", "15.000 Kz · cresce em 1 hora · vende-se a 24.000 Kz"], ["porco", "Porco", "25.000 Kz · cresce em 2 horas · vende-se a 42.000 Kz"]]


func _phone_quintal() -> void:
	var q: Dictionary = Net.me.get("criacao", {}) if typeof(Net.me.get("criacao")) == TYPE_DICTIONARY else {}
	var animais: Array = q.get("animais", [])
	var c := _card()
	c.add_child(_label("O teu quintal · %d/%d animais" % [animais.size(), int(q.get("max", 12))], 18, ACCENT, FONT_BOLD))
	if animais.is_empty():
		c.add_child(_label("Ainda não tens animais. Compra galinhas, cabritos ou porcos no mercado do bairro.", 15, Tema.TEXT, FONT_REG, true))
	else:
		var counts := {}
		for a: Dictionary in animais:
			var k := str(a.name)
			counts[k] = int(counts.get(k, 0)) + 1
		var parts: Array[String] = []
		for k: String in counts:
			parts.append("%d × %s" % [counts[k], k])
		c.add_child(_label(" · ".join(parts), 16, Tema.TEXT, FONT_REG, true))
		var fed := int(q.get("alimentadosS", 0))
		if fed > 0:
			c.add_child(_label("Alimentados durante mais %s." % _dur(fed), 14, Tema.OK, FONT_REG, true))
		else:
			c.add_child(_label("Os animais têm fome! Sem ração as galinhas não põem e os animais vendem-se mais baratos.", 14, Tema.WARN, FONT_REG, true))
		c.add_child(_button("Dar ração (%s Kz)" % DemoHud._money(int(q.get("racao", 150)) * animais.size()), "plus", ACCENT, INK, func() -> void: Net.action("criacao_alimentar")))
		c.add_child(_label("Ovos guardados: %d" % int(q.get("ovos", 0)), 16, Tema.TEXT, FONT_BOLD))
	var m := _card()
	m.add_child(_label("No mercado", 16, Tema.TEXT, FONT_BOLD))
	for x: Array in ANIMAL_INFO:
		var id := str(x[0])
		m.add_child(_button("Comprar %s" % str(x[1]).to_lower(), "bag", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("criacao_comprar", id)))
		m.add_child(_label(str(x[2]), 12, Tema.TEXT_FAINT, FONT_REG, true))
	if int(q.get("ovos", 0)) > 0:
		m.add_child(_button("Vender os ovos", "bag", ACCENT, INK, func() -> void: Net.action("criacao_vender", "ovos")))
	var seen := {}
	for a: Dictionary in animais:
		var tipo := str(a.tipo)
		if tipo == "galinha" and seen.has(tipo):
			continue
		if int(a.prontoEmS) > 0:
			if not seen.has(tipo + "_cresce"):
				seen[tipo + "_cresce"] = true
				m.add_child(_label("%s a crescer: falta %s." % [a.name, _dur(int(a.prontoEmS))], 13, Tema.TEXT_FAINT, FONT_REG, true))
			continue
		if seen.has(tipo):
			continue
		seen[tipo] = true
		m.add_child(_button("Vender %s" % str(a.name).to_lower(), "bag", ACCENT, INK, func() -> void: Net.action("criacao_vender", tipo)))
	m.add_child(_button("Ir ao mercado", "pin", Tema.BTN2, Tema.TEXT, func() -> void:
		phone.visible = false
		ui_action.emit("ir:mercado")))


## Desporto: treinar dá forma física (adoeces menos), humor e saúde; gasta energia e dá fome.
const SPORT_INFO := [["correr", "Correr pelo bairro", "Na rua · +6 forma · −12 energia"], ["futebol", "Futebol no campo do bairro", "Na rua · +8 forma · +10 humor · −16 energia"], ["casa", "Exercícios em casa", "Em casa · +4 forma · −10 energia"]]


func _phone_sport() -> void:
	var f: Dictionary = Net.me.get("forma", {}) if typeof(Net.me.get("forma")) == TYPE_DICTIONARY else {}
	var c := _card()
	c.add_child(_label("Forma física: %d/100" % int(f.get("valor", 0)), 20, ACCENT, FONT_BOLD))
	var bar := ProgressBar.new()
	bar.max_value = 100
	bar.value = int(f.get("valor", 0))
	bar.show_percentage = false
	bar.custom_minimum_size = Vector2(0, 14)
	c.add_child(bar)
	c.add_child(_label("Treinos hoje: %d/%d. Quem está em forma adoece menos. A forma desce se não treinares." % [int(f.get("treinosHoje", 0)), int(f.get("max", 4))], 14, Tema.TEXT_MUTED, FONT_REG, true))
	for x: Array in SPORT_INFO:
		var id := str(x[0])
		c.add_child(_button(str(x[1]), "person", ACCENT if id != "casa" else Tema.BTN2, INK if id != "casa" else Tema.TEXT, func() -> void: Net.action("treinar", id)))
		c.add_child(_label(str(x[2]), 12, Tema.TEXT_FAINT, FONT_REG, true))


## Definições: tamanho do texto, nomes, efeitos e terminar sessão (guardadas no aparelho).
func _phone_settings() -> void:
	var c := _card()
	c.add_child(_label("Tamanho do texto", 16, ACCENT, FONT_BOLD))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	for x: Array in [[0.85, "Pequeno"], [1.0, "Normal"], [1.2, "Grande"]]:
		var v := float(x[0])
		var sel := is_equal_approx(Definicoes.text_scale, v)
		var b := _button(("✓ " if sel else "") + str(x[1]), "more", ACCENT if sel else Tema.BTN2, INK if sel else Tema.TEXT, func() -> void:
			Definicoes.set_value(get_tree(), "text_scale", v)
			_rebuild_phone.call_deferred())
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(b)
	c.add_child(row)
	var t := _card()
	t.add_child(_label("Ecrã", 16, ACCENT, FONT_BOLD))
	t.add_child(_button(("✓ " if Definicoes.show_names else "✗ ") + "Nomes por cima das pessoas", "person", Tema.BTN2, Tema.TEXT, func() -> void:
		Definicoes.set_value(get_tree(), "show_names", not Definicoes.show_names)
		_rebuild_phone()))
	t.add_child(_label("Desliga a chuva se o telemóvel for lento.", 12, Tema.TEXT_FAINT, FONT_REG, true))
	t.add_child(_button(("✓ " if Definicoes.effects else "✗ ") + "Chuva e efeitos", "sun", Tema.BTN2, Tema.TEXT, func() -> void:
		Definicoes.set_value(get_tree(), "effects", not Definicoes.effects)
		_rebuild_phone()))
	var a := _card()
	a.add_child(_label("Conta", 16, ACCENT, FONT_BOLD))
	a.add_child(_label(("A jogar como %s." % Auth.display_name) if Auth.display_name != "" else "A jogar.", 14, Tema.TEXT_MUTED, FONT_REG, true))
	a.add_child(_label("Segurança: na app Amigos podes bloquear ou denunciar quem te incomoda.", 13, Tema.TEXT_FAINT, FONT_REG, true))
	a.add_child(_button("Terminar sessão", "door", Tema.BTN2, Tema.DANGER, func() -> void:
		phone.visible = false
		Net.leave()
		Auth.sign_out()
		get_tree().change_scene_to_file("res://src/ui/login_screen.tscn")))


## Saber Huambo: 3 perguntas por dia sobre o Huambo e Angola; cada certa dá dinheiro.
func _phone_quiz() -> void:
	var q: Dictionary = Net.me.get("quiz", {}) if typeof(Net.me.get("quiz")) == TYPE_DICTIONARY else {}
	var c := _card()
	c.add_child(_label("Pergunta %d de %d · certas hoje: %d" % [mini(int(q.get("n", 0)) + 1, int(q.get("total", 3))), int(q.get("total", 3)), int(q.get("certasHoje", 0))], 15, Tema.TEXT_MUTED, FONT_REG))
	if q.get("pergunta") == null:
		c.add_child(_label("Já respondeste às perguntas de hoje. Volta amanhã!", 18, ACCENT, FONT_BOLD, true))
	else:
		c.add_child(_label(str(q.pergunta), 19, Tema.TEXT, FONT_BOLD, true))
		var ops: Array = q.get("opcoes", [])
		for k in ops.size():
			var n := k + 1
			c.add_child(_button(str(ops[k]), "more", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("quiz_responder", "", n)))
		c.add_child(_label("Cada resposta certa vale %s Kz." % DemoHud._money(int(q.get("premio", 500))), 13, Tema.TEXT_FAINT, FONT_REG))
	c.add_child(_label("Certas desde sempre: %d" % int(q.get("certas", 0)), 14, Tema.TEXT_FAINT, FONT_REG))


## Presentes: oferecer ao par ou a um amigo (chega mesmo que esteja noutro bairro ou desligado).
const GIFT_INFO := [["chocolate", "Chocolates", 800], ["flores", "Flores", 1500], ["capulana", "Pano (capulana)", 4000], ["perfume", "Perfume", 7000]]
var _gift_to := 0


func _phone_gifts() -> void:
	var who: Array = []
	var pa: Variant = Net.me.get("partner")
	if typeof(pa) == TYPE_DICTIONARY:
		who.append([1000, "%s (%s)" % [pa.name, "marido/mulher" if bool(pa.married) else "namorado/a"]])
	var fr: Array = Net.me.get("friends", [])
	for i in fr.size():
		who.append([i + 1, str(fr[i].name)])
	var c := _card()
	if who.is_empty():
		c.add_child(_label("Ainda não tens amigos nem par. Faz amigos na rua (toca numa pessoa) para lhes ofereceres presentes.", 15, Tema.TEXT, FONT_REG, true))
		return
	if not who.any(func(w: Array) -> bool: return int(w[0]) == _gift_to):
		_gift_to = int(who[0][0])
	c.add_child(_label("Para quem?", 16, ACCENT, FONT_BOLD))
	for w: Array in who:
		var id := int(w[0])
		var sel := id == _gift_to
		c.add_child(_button(("✓ " if sel else "") + str(w[1]), "person", ACCENT if sel else Tema.BTN2, INK if sel else Tema.TEXT, func() -> void:
			_gift_to = id
			_rebuild_phone()))
	var g := _card()
	g.add_child(_label("O quê?", 16, ACCENT, FONT_BOLD))
	for x: Array in GIFT_INFO:
		var gid := str(x[0])
		g.add_child(_button("%s · %s Kz" % [x[1], DemoHud._money(int(x[2]))], "hand", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("presente", gid, _gift_to)))


## Caixa de texto + botão (no telemóvel usa a caixa do browser, onde o teclado funciona).
func _text_row(box: Container, placeholder: String, max_len: int, button: String, cb: Callable) -> LineEdit:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	var le := LineEdit.new()
	le.placeholder_text = placeholder
	le.max_length = max_len
	le.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	le.custom_minimum_size = Vector2(0, 46)
	le.add_theme_font_override("font", FONT_REG)
	le.add_theme_font_size_override("font_size", 16)
	WebTextInput.attach(le, "text")
	var go := func(_t: String = "") -> void:
		if le.text.strip_edges() != "":
			cb.call(le.text.strip_edges())
			le.text = ""
	le.text_submitted.connect(go)
	row.add_child(le)
	row.add_child(_button(button, "plus", ACCENT, INK, func() -> void: go.call()))
	box.add_child(row)
	return le


## Estudos: escola (níveis) e Universidade (cursos superiores no Instituto Superior Politécnico do Huambo).
const COURSES := [["agronomia", "Agronomia", "Engenheiro(a) agrónomo(a) · colhe 50% mais na lavra"], ["medicina", "Medicina", "Médico(a) · 18.000 Kz/turno"], ["direito", "Direito", "Advogado(a) · 16.000 Kz/turno"], ["informatica", "Engenharia Informática", "Técnico(a) de informática · 13.000 Kz/turno"]]


func _phone_studies() -> void:
	var edu := int(Net.me.get("education", 0))
	var c := _card()
	c.add_child(_label("Escola: nível %d de 4 (aulas %d/%d)" % [edu, int(Net.me.get("study", 0)), int(catalog.get("lessonsPerLevel", 3))], 16, Tema.TEXT, FONT_BOLD, true))
	if edu < 4:
		c.add_child(_label("Cada nível desbloqueia empregos melhores. Com o nível 4 podes ir para a Universidade.", 14, Tema.TEXT_MUTED, FONT_REG, true))
		c.add_child(_button("Ir à escola", "pin", ACCENT, INK, func() -> void:
			phone.visible = false
			ui_action.emit("ir:escola")))
		return
	var u: Dictionary = Net.me.get("uni", {})
	var lic: Array = u.get("licenciaturas", [])
	var k := _card()
	k.add_child(_label("Universidade", 18, ACCENT, FONT_BOLD))
	k.add_child(_label("Instituto Superior Politécnico do Huambo (Bairro Académico) · %s Kz por aula · %d aulas por curso" % [DemoHud._money(int(u.get("preco", 3000))), int(u.get("total", 5))], 13, Tema.TEXT_MUTED, FONT_REG, true))
	if u.get("curso") != null:
		k.add_child(_label("A tirar %s: %d/%d aulas" % [u.cursoNome, int(u.aulas), int(u.total)], 16, Tema.TEXT, FONT_BOLD, true))
	for x: Array in COURSES:
		var id := str(x[0])
		if lic.has(id):
			k.add_child(_label("✓ Licenciado/a em %s" % x[1], 14, Tema.OK, FONT_REG, true))
		elif str(u.get("curso", "")) != id:
			k.add_child(_button("Inscrever em %s" % x[1], "plus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("uni_curso", id)))
			k.add_child(_label(str(x[2]), 12, Tema.TEXT_FAINT, FONT_REG, true))
	k.add_child(_button("Ir à Universidade", "pin", ACCENT, INK, func() -> void:
		phone.visible = false
		if Net.current_district == "bairro_academico":
			ui_action.emit("ir:universidade")
		else:
			_go("bairro_academico", false)))


## Saúde: estado, doença atual e onde tratar.
func _phone_health() -> void:
	var n: Dictionary = Net.me.get("needs", {})
	var c := _card()
	c.add_child(_label("Saúde %d%% · Energia %d%% · Fome %d%% · Humor %d%%" % [int(n.get("health", 0)), int(n.get("energy", 0)), int(n.get("hunger", 0)), int(n.get("mood", 0))], 15, Tema.TEXT, FONT_BOLD, true))
	var d: Variant = Net.me.get("doenca")
	if typeof(d) == TYPE_DICTIONARY:
		c.add_child(_label(str(d.name), 18, Tema.DANGER, FONT_BOLD))
		c.add_child(_label(str(d.texto), 14, Tema.TEXT, FONT_REG, true))
	else:
		c.add_child(_label("Estás de boa saúde. Cuidado com a chuva (gripe) e com os mosquitos à noite na época das chuvas (paludismo).", 14, Tema.TEXT_MUTED, FONT_REG, true))
	var r: Variant = Net.me.get("roubo")
	if typeof(r) == TYPE_DICTIONARY:
		c.add_child(_label("Foste assaltado/a (%s Kz). Regista a ocorrência na esquadra nos próximos 30 min para recuperar metade." % DemoHud._money(int(r.amount)), 14, Tema.WARN, FONT_REG, true))
		c.add_child(_button("Ir à esquadra", "pin", ACCENT, INK, func() -> void:
			phone.visible = false
			ui_action.emit("ir:esquadra")))
	var sg: Dictionary = Net.me.get("seguro", {}) if typeof(Net.me.get("seguro")) == TYPE_DICTIONARY else {}
	var ins := _card()
	ins.add_child(_label("Seguro de saúde", 18, ACCENT, FONT_BOLD))
	if bool(sg.get("ativo", false)):
		ins.add_child(_label("Ativo durante mais %s: consultas, vacinas e medicamentos sem pagar." % _dur(int(sg.get("faltamS", 0))), 15, Tema.OK, FONT_REG, true))
	else:
		ins.add_child(_label("Por %s Kz ficas 24 horas com consultas, vacinas e medicamentos pagos pelo seguro." % DemoHud._money(int(sg.get("preco", 4000))), 15, Tema.TEXT, FONT_REG, true))
		ins.add_child(_button("Fazer seguro", "plus", ACCENT, INK, func() -> void: Net.action("seguro_comprar")))
	c = _card()
	c.add_child(_button("Ir ao centro de saúde", "pin", ACCENT, INK, func() -> void:
		phone.visible = false
		ui_action.emit("ir:saude")))
	c.add_child(_button("Ir à farmácia", "pin", Tema.BTN2, Tema.TEXT, func() -> void:
		phone.visible = false
		ui_action.emit("ir:farmacia")))


## Kixikila (na app Grupos): poupança em grupo — todos pagam a quota, quem está na vez recebe tudo.
var _kixi_asked := -100000


func _kixikila_card() -> void:
	if Time.get_ticks_msec() - _kixi_asked > 10000:
		_kixi_asked = Time.get_ticks_msec()
		Net.action("kixi_ver")
	var k: Variant = Net.me.get("kixikila")
	var c := _card()
	c.add_child(_label("Kixikila do grupo", 18, ACCENT, FONT_BOLD))
	if typeof(k) != TYPE_DICTIONARY or str(k.status) == "acabada":
		c.add_child(_label("Poupança em grupo: cada volta todos pagam a mesma quota e um de vocês recebe tudo, à vez.", 14, Tema.TEXT, FONT_REG, true))
		var row := HFlowContainer.new()
		row.add_theme_constant_override("h_separation", 6)
		row.add_theme_constant_override("v_separation", 6)
		for i in 3:
			var q: int = [1000, 5000, 10000][i]
			var n := i + 1
			row.add_child(_button("Criar: %s Kz" % DemoHud._money(q), "plus", ACCENT, INK, func() -> void: Net.action("kixi_criar", "", n)))
		c.add_child(row)
		return
	c.add_child(_label("Quota: %s Kz · %d membros: %s" % [DemoHud._money(int(k.quota)), (k.members as Array).size(), ", ".join(k.members)], 14, Tema.TEXT, FONT_REG, true))
	if str(k.status) == "aberta":
		c.add_child(_label("À espera de membros.", 14, Tema.TEXT_MUTED, FONT_REG))
		if not bool(k.souMembro):
			c.add_child(_button("Aderir", "plus", ACCENT, INK, func() -> void: Net.action("kixi_aderir")))
		if bool(k.souCriador):
			c.add_child(_button("Começar a kixikila", "target", ACCENT, INK, func() -> void: Net.action("kixi_comecar")))
		return
	c.add_child(_label("Volta %d · na vez: %s · pagaram %d/%d" % [int(k.round) + 1, k.vez, int(k.paid), (k.members as Array).size()], 15, Tema.OK, FONT_BOLD, true))
	if bool(k.souMembro) and not bool(k.jaPaguei):
		c.add_child(_button("Pagar a quota (%s Kz)" % DemoHud._money(int(k.quota)), "bag", ACCENT, INK, func() -> void: Net.action("kixi_pagar")))
	c.add_child(_button("Receber (se for a tua vez)", "plus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("kixi_receber")))


## Classificados: comprar e vender colheita e dólares entre jogadores.
var _ads: Array = []
var _ads_at := -100000
var _sell_item := "milho"
var _sell_qty := 10


func _phone_classifieds() -> void:
	var c := _card()
	c.add_child(_label("Vender", 18, ACCENT, FONT_BOLD))
	var col: Dictionary = Net.me.get("colheita", {})
	var usd := int(Net.me.get("cambio", {}).get("usd", 0))
	c.add_child(_label("Tens: %s · %d USD" % [", ".join(col.keys().map(func(k: String) -> String: return "%s %d kg" % [k.replace("_", "-"), int(col[k])])) if not col.is_empty() else "sem colheita", usd], 13, Tema.TEXT_MUTED, FONT_REG, true))
	var items := HFlowContainer.new()
	items.add_theme_constant_override("h_separation", 6)
	items.add_theme_constant_override("v_separation", 6)
	for it: Array in [["milho", "Milho"], ["feijao", "Feijão"], ["batata_doce", "Batata-doce"], ["usd", "Dólares"]]:
		var id := str(it[0])
		items.add_child(_button(str(it[1]), "bag", ACCENT if _sell_item == id else Tema.BTN2, INK if _sell_item == id else Tema.TEXT, func() -> void:
			_sell_item = id
			_rebuild_phone()))
	c.add_child(items)
	var qty := HFlowContainer.new()
	qty.add_theme_constant_override("h_separation", 6)
	for q: int in [5, 10, 20, 50]:
		qty.add_child(_button("%d %s" % [q, "USD" if _sell_item == "usd" else "kg"], "plus", ACCENT if _sell_qty == q else Tema.BTN2, INK if _sell_qty == q else Tema.TEXT, func() -> void:
			_sell_qty = q
			_rebuild_phone()))
	c.add_child(qty)
	_text_row(c, "Preço total em Kz (ex.: 1500)", 7, "Anunciar", func(t: String) -> void:
		Net.action_text("classif_vender", str(t.to_int()), _sell_qty, _sell_item)
		_ads_at = -100000)
	var f := _card()
	f.add_child(_label("À venda no Huambo", 18, ACCENT, FONT_BOLD))
	if Time.get_ticks_msec() - _ads_at > 15000:
		_ads_at = Time.get_ticks_msec()
		_load_ads()
	if _ads.is_empty():
		f.add_child(_label("Ainda não há anúncios.", 14, Tema.TEXT_FAINT, FONT_REG))
	var my_name := str(Net.entities.get(Net.self_id, {}).get("name", ""))
	for a: Dictionary in _ads:
		var what := "%d %s" % [int(a.qty), "USD" if str(a.item) == "usd" else "kg de " + str(a.item).replace("_", "-")]
		f.add_child(_label("%s — %s Kz" % [what, DemoHud._money(int(a.price))], 15, Tema.TEXT, FONT_BOLD, true))
		f.add_child(_label("%s · %s" % [a.sellerName, a.bairro], 12, Tema.TEXT_FAINT, FONT_REG))
		var aid := str(a.id)
		if str(a.sellerName) == my_name:
			f.add_child(_button("Retirar o meu anúncio", "minus", Tema.BTN2, Tema.TEXT, func() -> void:
				Net.action_text("classif_cancelar", aid)
				_ads_at = -100000))
		else:
			f.add_child(_button("Comprar", "bag", ACCENT, INK, func() -> void:
				Net.action_text("classif_comprar", aid)
				_ads_at = -100000))


func _load_ads() -> void:
	var r: Variant = await Net.get_json("/classificados")
	if typeof(r) == TYPE_ARRAY:
		_ads = r
		if phone.visible and phone_tab == "classificados":
			_rebuild_phone()


## SMS recebidos (aparecem como aviso e ficam na app Amigos).
var sms_log: Array = []


func on_sms(who: String, text: String) -> void:
	sms_log.append([who, text])
	if sms_log.size() > 20:
		sms_log.pop_front()
	show_toast("SMS de %s: «%s»" % [who, text], true)


## Guarda-roupa: roupa de fardo comprada no mercado; vestir é de graça.
const WARDROBE := [[0, "Camisa vermelha"], [29, "Camisa laranja"], [54, "Camisa amarela"], [119, "Camisa verde"], [180, "Camisa azul-turquesa"], [223, "Camisa azul"], [270, "Camisa roxa"], [317, "Camisa cor-de-rosa"]]


func _phone_wardrobe() -> void:
	var mine: Array = Net.me.get("roupas", [-1])
	var c := _card()
	c.add_child(_label("O teu guarda-roupa", 18, ACCENT, FONT_BOLD))
	var row := HFlowContainer.new()
	row.add_theme_constant_override("h_separation", 6)
	row.add_theme_constant_override("v_separation", 6)
	for h: Variant in mine:
		var hue := int(h)
		var name := "Roupa de sempre" if hue < 0 else "Camisa (%d°)" % hue
		for w: Array in WARDROBE:
			if int(w[0]) == hue:
				name = str(w[1])
		var b := _button("Vestir: " + name, "shirt", Color.from_hsv(hue / 360.0, 0.55, 0.8) if hue >= 0 else Tema.BTN2, Tema.TEXT, func() -> void: Net.action("roupa_vestir", "", hue + 2))
		row.add_child(b)
	c.add_child(row)
	var k := _card()
	k.add_child(_label("Roupa de fardo — bancas do mercado (1.500 Kz)", 16, Tema.TEXT, FONT_BOLD, true))
	k.add_child(_label("Compra-se estando no mercado do bairro.", 13, Tema.TEXT_FAINT, FONT_REG, true))
	var grid := HFlowContainer.new()
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 6)
	for i in WARDROBE.size():
		var w: Array = WARDROBE[i]
		if mine.has(int(w[0])):
			continue
		var n := i + 1
		grid.add_child(_button(str(w[1]), "bag", Color.from_hsv(float(w[0]) / 360.0, 0.55, 0.85), Tema.TEXT, func() -> void: Net.action("roupa_comprar", "", n)))
	k.add_child(grid)
	k.add_child(_button("Ir ao mercado", "pin", Tema.BTN2, Tema.TEXT, func() -> void:
		phone.visible = false
		ui_action.emit("ir:mercado")))


## Muxima: o que as pessoas do Huambo publicam (texto + bairro), com «gostos».
var _feed: Array = []
var _feed_at := -100000


func _phone_muxima() -> void:
	var c := _card()
	c.add_child(_label("Publica o que estás a viver no Huambo:", 15, Tema.TEXT, FONT_REG, true))
	_text_row(c, "Escreve a tua publicação…", 160, "Publicar", func(t: String) -> void:
		Net.action_text("muxima_publicar", t)
		_feed_at = -100000
		get_tree().create_timer(0.8).timeout.connect(func() -> void:
			if phone.visible and phone_tab == "muxima":
				_rebuild_phone()))
	var f := _card()
	f.add_child(_label("Muxima — últimas publicações", 17, ACCENT, FONT_BOLD))
	if Time.get_ticks_msec() - _feed_at > 15000:
		_feed_at = Time.get_ticks_msec()
		_load_feed()
	if _feed.is_empty():
		f.add_child(_label("Ainda ninguém publicou. Sê o primeiro!", 14, Tema.TEXT_FAINT, FONT_REG, true))
	for p: Dictionary in _feed:
		f.add_child(_label("%s · %s" % [p.name, p.bairro], 14, ACCENT, FONT_BOLD))
		f.add_child(_label(str(p.text), 15, Tema.TEXT, FONT_REG, true))
		var pid := str(p.id)
		f.add_child(_button("Gosto (%d)" % int(p.likes), "plus", Tema.BTN2, Tema.TEXT, func() -> void:
			Net.action_text("muxima_gosto", pid)
			_feed_at = -100000
			get_tree().create_timer(0.6).timeout.connect(func() -> void: _load_feed())))


func _load_feed() -> void:
	var r: Variant = await Net.get_json("/muxima")
	if typeof(r) == TYPE_ARRAY:
		_feed = r
		if phone.visible and phone_tab == "muxima":
			_rebuild_phone()


## Namoro e casamento (na app Família).
func _love_section() -> void:
	var c := _card()
	c.add_child(_label("Amor", 18, ACCENT, FONT_BOLD))
	for kind: Array in [["loveReq", "pediu-te em namoro!", "namoro_aceitar", "namoro_recusar"], ["weddingReq", "pediu-te em casamento!", "casar_aceitar", "casar_recusar"]]:
		var r: Variant = Net.me.get(kind[0])
		if typeof(r) == TYPE_DICTIONARY:
			c.add_child(_label("%s %s" % [r.name, kind[1]], 17, Color("ffb3c7"), FONT_BOLD, true))
			var row := HBoxContainer.new()
			row.add_theme_constant_override("separation", 6)
			var yes := str(kind[2])
			var no := str(kind[3])
			row.add_child(_button("Aceitar", "plus", ACCENT, INK, func() -> void: Net.action(yes)))
			row.add_child(_button("Recusar", "minus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action(no)))
			c.add_child(row)
	var p: Variant = Net.me.get("partner")
	if typeof(p) == TYPE_DICTIONARY:
		c.add_child(_label("%s com %s%s" % ["Casado/a" if bool(p.married) else "A namorar", p.name, " (ligado/a agora)" if bool(p.online) else ""], 16, Tema.TEXT, FONT_REG, true))
		c.add_child(_label("Estar perto do teu par anima o humor.", 13, Tema.TEXT_FAINT, FONT_REG, true))
		if not bool(p.married):
			c.add_child(_label("Para casar: entrem os dois na igreja do bairro (%s Kz, paga quem pede)." % DemoHud._money(20000), 14, Tema.TEXT_MUTED, FONT_REG, true))
			c.add_child(_button("Pedir em casamento", "plus", ACCENT, INK, func() -> void: Net.action("casar")))
			c.add_child(_button("Acabar o namoro", "minus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("terminar")))
		else:
			c.add_child(_button("Pedir o divórcio (no Tribunal ou Administração)", "minus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("terminar")))
		return
	c.add_child(_label("Estás solteiro/a. Pede alguém que esteja perto em namoro:", 14, Tema.TEXT_MUTED, FONT_REG, true))
	var me_e: Variant = Net.entities.get(Net.self_id)
	var any := false
	for id: int in Net.entities:
		if id != Net.self_id and me_e != null and (Net.entities[id].pos as Vector2).distance_to(me_e.pos) <= 800.0:
			any = true
			var eid := id
			c.add_child(_button("Pedir %s em namoro" % Net.entities[id].name, "plus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("namoro_pedir", str(eid))))
	if not any:
		c.add_child(_label("Ninguém perto de ti agora.", 13, Tema.TEXT_FAINT, FONT_REG))


## Empresas: abrir um negócio na Administração (com BI); rende por hora até 12 h.
const BUSINESSES := [["quiosque", "Quiosque de saldo e recargas", 50000, 2000], ["cantina", "Cantina", 150000, 6000], ["candongueiro", "Candongueiro (táxi azul e branco)", 400000, 15000]]


func _phone_business() -> void:
	var b: Variant = Net.me.get("negocio")
	var c := _card()
	if typeof(b) == TYPE_DICTIONARY:
		c.add_child(_label(str(b.name), 19, ACCENT, FONT_BOLD, true))
		c.add_child(_label("Nível %d · %s Kz por hora (junta até %d h)" % [int(b.nivel), DemoHud._money(int(b.perHour)), int(b.maxHoras)], 15, Tema.TEXT, FONT_REG, true))
		c.add_child(_label("Lucro por recolher: %s Kz" % DemoHud._money(int(b.pendente)), 18, Tema.OK, FONT_BOLD))
		c.add_child(_button("Recolher o lucro", "bag", ACCENT, INK, func() -> void: Net.action("negocio_recolher")))
		if b.melhorar != null:
			c.add_child(_button("Melhorar (%s Kz)" % DemoHud._money(int(b.melhorar)), "plus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("negocio_melhorar")))
		c.add_child(_button("Vender o negócio (metade do investido)", "minus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("negocio_vender")))
		return
	c.add_child(_label("Abre o teu negócio: o dinheiro entra mesmo quando não estás a jogar (até 12 horas). O alvará tira-se na Administração do bairro e precisas de BI.", 15, Tema.TEXT, FONT_REG, true))
	for x: Array in BUSINESSES:
		var id := str(x[0])
		c.add_child(_label("%s — %s Kz · %s Kz/hora" % [x[1], DemoHud._money(int(x[2])), DemoHud._money(int(x[3]))], 15, Tema.TEXT, FONT_BOLD, true))
		c.add_child(_button("Abrir (estando na Administração)", "plus", ACCENT, INK, func() -> void: Net.action("negocio_abrir", id)))
	c.add_child(_button("Ir à Administração", "pin", Tema.BTN2, Tema.TEXT, func() -> void:
		phone.visible = false
		ui_action.emit("ir:administracao")))


## Imóveis: casas e prédios do bairro com frações livres, preços e caminho até lá.
var _housing_asked := 0


func _phone_housing() -> void:
	var c := _card()
	c.add_child(_label("Imóveis em %s" % place_text, 18, ACCENT, FONT_BOLD, true))
	var l: Variant = Net.me.get("imoveis")
	if typeof(l) != TYPE_ARRAY or Time.get_ticks_msec() - _housing_asked > 30000:
		if Time.get_ticks_msec() - _housing_asked > 3000:
			_housing_asked = Time.get_ticks_msec()
			Net.action("imoveis")
		if typeof(l) != TYPE_ARRAY:
			c.add_child(_label("A procurar…", 14, Tema.TEXT_FAINT, FONT_REG))
			return
	if (l as Array).is_empty():
		c.add_child(_label("Não há casas à venda neste bairro.", 14, Tema.TEXT_FAINT, FONT_REG))
	for h: Dictionary in l:
		c.add_child(_label("%s — %s" % [h.name, ("%d livre(s) de %d" % [int(h.free), int(h.total)]) if int(h.total) > 1 else ("livre" if int(h.free) > 0 else "ocupada")], 15, Tema.OK if int(h.free) > 0 else Tema.TEXT_FAINT, FONT_BOLD, true))
		c.add_child(_label("Comprar %s Kz · arrendar %s Kz/dia" % [DemoHud._money(int(h.buy)), DemoHud._money(int(h.rentPerDay))], 13, Tema.TEXT_MUTED, FONT_REG))
		if int(h.free) > 0:
			var at := Vector2(float(h.x) / 100.0, float(h.y) / 100.0)
			c.add_child(_button("Ir ver", "pin", Tema.BTN2, Tema.TEXT, func() -> void:
				phone.visible = false
				ui_action.emit("ir_ponto:%f,%f" % [at.x, at.y])))


## Lavras: semear, regar, colher na Chipipa e vender no mercado.
const CROP_INFO := [["milho", "Milho", "Semente 300 Kz · 30 min · 20 kg · 60 Kz/kg"], ["feijao", "Feijão", "Semente 400 Kz · 20 min · 12 kg · 110 Kz/kg"], ["batata_doce", "Batata-doce", "Semente 250 Kz · 15 min · 18 kg · 45 Kz/kg"]]


func _phone_lavras() -> void:
	var c := _card()
	c.add_child(_label("A tua lavra na Chipipa", 18, ACCENT, FONT_BOLD))
	var l: Variant = Net.me.get("lavra")
	if typeof(l) == TYPE_DICTIONARY:
		var secs := int(l.readyInS)
		if secs > 0:
			c.add_child(_label("%s a crescer: pronto daqui a %d min %02d s." % [l.name, secs / 60, secs % 60], 16, Tema.TEXT, FONT_REG, true))
		else:
			c.add_child(_label("%s pronto para colher!" % l.name, 16, Tema.OK, FONT_BOLD, true))
		if not bool(l.watered):
			c.add_child(_label("Ainda não regaste: sem rega (e sem chuva) a colheita fica a metade.", 14, Tema.WARN, FONT_REG, true))
			c.add_child(_button("Regar", "plus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("lavra_regar")))
		if secs <= 0:
			c.add_child(_button("Colher", "bag", ACCENT, INK, func() -> void: Net.action("lavra_colher")))
	else:
		c.add_child(_label("A lavra está vazia. O que queres semear?", 15, Tema.TEXT, FONT_REG, true))
		for x: Array in CROP_INFO:
			var id := str(x[0])
			c.add_child(_button("Semear %s" % x[1], "plus", ACCENT, INK, func() -> void: Net.action("lavra_semear", id)))
			c.add_child(_label(str(x[2]), 12, Tema.TEXT_FAINT, FONT_REG, true))
	var col: Dictionary = Net.me.get("colheita", {})
	var k := _card()
	k.add_child(_label("Colheita guardada", 16, Tema.TEXT, FONT_BOLD))
	if col.is_empty():
		k.add_child(_label("Nada guardado.", 14, Tema.TEXT_FAINT, FONT_REG))
	else:
		for crop: String in col:
			k.add_child(_label("%s: %d kg" % [crop.replace("_", "-").capitalize(), int(col[crop])], 15, Tema.TEXT, FONT_REG))
		k.add_child(_button("Vender no mercado", "bag", ACCENT, INK, func() -> void: Net.action("lavra_vender")))
		k.add_child(_button("Ir ao mercado", "pin", Tema.BTN2, Tema.TEXT, func() -> void:
			phone.visible = false
			ui_action.emit("ir:mercado")))


## Ambição de vida: um grande objetivo, medido no que tens de verdade.
const AMBITIONS := [["rico", "Juntar 1.000.000 Kz", "20.000 Kz"], ["casa", "Ter casa própria", "15.000 Kz"], ["doutor", "Nível máximo de estudos", "15.000 Kz"], ["popular", "Ter 10 amigos", "10.000 Kz"], ["carro", "Ter carro próprio", "10.000 Kz"], ["agricultor", "Colher 200 kg na lavra", "10.000 Kz"]]


func _phone_ambition() -> void:
	var a: Variant = Net.me.get("ambicao")
	var feitas: Array = Net.me.get("ambicoesFeitas", [])
	var c := _card()
	if typeof(a) == TYPE_DICTIONARY:
		c.add_child(_label("A tua ambição", 14, Tema.TEXT_FAINT, FONT_REG))
		c.add_child(_label(str(a.text), 19, ACCENT, FONT_BOLD, true))
		var bar := ProgressBar.new()
		bar.max_value = 100
		bar.value = float(a.progress) * 100.0
		bar.custom_minimum_size = Vector2(0, 18)
		c.add_child(bar)
		if float(a.progress) >= 1.0:
			c.add_child(_button("Recolher o prémio (%s Kz)" % DemoHud._money(int(a.reward)), "plus", ACCENT, INK, func() -> void: Net.action("ambicao_recolher")))
		else:
			c.add_child(_label("Prémio: %s Kz" % DemoHud._money(int(a.reward)), 14, Tema.TEXT, FONT_REG))
	else:
		c.add_child(_label("Escolhe a tua ambição de vida. O jogo mede o progresso e paga um prémio quando a cumprires.", 15, Tema.TEXT, FONT_REG, true))
	var l := _card()
	l.add_child(_label("Ambições", 16, Tema.TEXT, FONT_BOLD))
	for x: Array in AMBITIONS:
		var id := str(x[0])
		if feitas.has(id):
			l.add_child(_label("✓ %s (cumprida)" % x[1], 14, Tema.OK, FONT_REG, true))
		else:
			l.add_child(_button("%s · %s" % [x[1], x[2]], "target", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("ambicao_escolher", id)))


## Ricos: quem tem mais dinheiro (só contas).
var _rich: Array = []


func _phone_rich() -> void:
	var c := _card()
	c.add_child(_label("Os mais ricos do Huambo", 18, ACCENT, FONT_BOLD))
	if _rich.is_empty():
		c.add_child(_label("A carregar…", 14, Tema.TEXT_FAINT, FONT_REG))
		var r: Variant = await Net.get_json("/ricos")
		if typeof(r) == TYPE_ARRAY:
			_rich = r if not (r as Array).is_empty() else [{"name": "", "total": -1}]
			if phone.visible and phone_tab == "ricos":
				_rebuild_phone()
		return
	if _rich.size() == 1 and int(_rich[0].total) < 0:
		c.add_child(_label("Ainda não há ninguém na lista. Cria conta e junta dinheiro para apareceres aqui!", 15, Tema.TEXT, FONT_REG, true))
	for i in _rich.size():
		var x: Dictionary = _rich[i]
		if int(x.total) < 0:
			continue
		c.add_child(_label("%d. %s — %s Kz" % [i + 1, x.name, DemoHud._money(int(x.total))], 15, ACCENT if i < 3 else Tema.TEXT, FONT_BOLD if i < 3 else FONT_REG, true))
	c.add_child(_label("Conta a carteira e o banco de quem joga com conta.", 12, Tema.TEXT_FAINT, FONT_REG, true))
	c.add_child(_button("Atualizar", "rotate", Tema.BTN2, Tema.TEXT, func() -> void:
		_rich = []
		_rebuild_phone()))


## Tempo no Huambo (época das chuvas / cacimbo).
func _phone_weather() -> void:
	var w: Dictionary = Net.me.get("tempo", {})
	if w.is_empty():
		return
	var c := _card()
	c.add_child(_label("%d °C" % int(w.temp), 52, Tema.TEXT, FONT_BOLD))
	c.add_child(_label("%s · %s" % [w.texto, "época das chuvas" if w.epoca == "chuvas" else "cacimbo"], 17, Tema.TEXT, FONT_REG, true))
	if w.ceu in ["chuva", "trovoada"]:
		c.add_child(_label("Na rua a chuva estraga o humor: entra num sítio coberto. A chuva também rega a tua lavra.", 14, Tema.WARN, FONT_REG, true))
	var p := _card()
	p.add_child(_label("Próximas horas", 16, Tema.TEXT, FONT_BOLD))
	for f: Dictionary in w.get("previsao", []):
		p.add_child(_label("%02dh — %s, %d °C" % [int(f.hora), f.texto, int(f.temp)], 15, Tema.TEXT, FONT_REG, true))


## Ganhar dinheiro: biscatos sem estudos nem documentos.
func _phone_biscatos() -> void:
	var b: Dictionary = Net.me.get("biscatos", {"feitos": 0, "max": 6})
	var c := _card()
	c.add_child(_label("Biscatos de hoje: %d/%d. Não precisas de estudos nem documentos." % [int(b.feitos), int(b.max)], 15, Tema.TEXT, FONT_REG, true))
	for x: Array in [["engraxar", "Engraxar sapatos", "Na paragem · 300–500 Kz", "paragem"], ["lavar", "Lavar carros", "Na paragem · 500–800 Kz", "paragem"], ["carregar", "Carregar sacos", "No mercado · 600–900 Kz", "ir:mercado"], ["zungar", "Zungar (vender na rua)", "Em qualquer rua · 300–1.000 Kz", ""]]:
		var id := str(x[0])
		var where := str(x[3])
		c.add_child(_label(str(x[1]), 17, Tema.TEXT, FONT_BOLD))
		c.add_child(_label(str(x[2]), 13, Tema.TEXT_FAINT, FONT_REG))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		row.add_child(_button("Fazer aqui", "bag", ACCENT, INK, func() -> void:
			phone.visible = false
			Net.action("biscato", id)))
		if where != "":
			row.add_child(_button("Ir para lá", "pin", Tema.BTN2, Tema.TEXT, func() -> void:
				phone.visible = false
				ui_action.emit(where)))
		c.add_child(row)


## Câmbio: dólares à taxa do dia (o cambista compra mais barato do que vende).
func _phone_cambio() -> void:
	var cm: Dictionary = Net.me.get("cambio", {})
	if cm.is_empty():
		return
	var c := _card()
	c.add_child(_label("Taxa de hoje: 1 USD = %s Kz" % DemoHud._money(int(cm.rate)), 18, ACCENT, FONT_BOLD, true))
	c.add_child(_label("Comprar: %s Kz · Vender: %s Kz\nTens %d USD · usados hoje %d/%d USD" % [DemoHud._money(int(cm.buy)), DemoHud._money(int(cm.sell)), int(cm.usd), int(cm.usadoHoje), int(cm.limite)], 15, Tema.TEXT, FONT_REG, true))
	for op: Array in [["cambio_compra", "Comprar"], ["cambio_venda", "Vender"]]:
		var a := str(op[0])
		c.add_child(_label(str(op[1]) + " dólares", 16, Tema.TEXT, FONT_BOLD))
		var row := HFlowContainer.new() # quebra a linha no ecrã estreito do telemóvel
		row.add_theme_constant_override("h_separation", 6)
		row.add_theme_constant_override("v_separation", 6)
		for v: int in [10, 50, 100, 500]:
			row.add_child(_button("%d USD" % v, "plus" if a == "cambio_compra" else "minus", ACCENT if a == "cambio_compra" else Tema.BTN2, INK if a == "cambio_compra" else Tema.TEXT, func() -> void: Net.action(a, "", v)))
		c.add_child(row)
	c.add_child(_label("A taxa muda todos os dias: compra barato e vende caro!", 13, Tema.TEXT_FAINT, FONT_REG, true))


## Rádio do Bairro: ouvir (bom para o humor) ou mandar uma dedicatória que todo o bairro ouve.
var radio_log: Array = []


func _phone_radio() -> void:
	var c := _card()
	c.add_child(_label("Rádio do Bairro — %s" % place_text, 18, ACCENT, FONT_BOLD, true))
	c.add_child(_button("Ouvir a rádio (humor +8)", "chat", ACCENT, INK, func() -> void: Net.action("radio_ouvir")))
	c.add_child(_label("Dedicatória (%s Kz): toda a gente neste bairro ouve." % DemoHud._money(500), 15, Tema.TEXT, FONT_REG, true))
	_text_row(c, "Ex.: Para a minha mãe, com carinho", 120, "No ar", func(t: String) -> void: Net.radio(t))
	if not radio_log.is_empty():
		c.add_child(_label("Últimas dedicatórias", 15, Tema.TEXT_MUTED, FONT_BOLD))
		for l: Array in radio_log.slice(maxi(0, radio_log.size() - 6)):
			c.add_child(_label("%s: «%s»" % [l[0], l[1]], 14, Tema.TEXT, FONT_REG, true))


func on_radio(who: String, text: String) -> void:
	radio_log.append([who, text])
	if radio_log.size() > 20:
		radio_log.pop_front()
	show_toast("Rádio do Bairro — %s: «%s»" % [who, text], true)
	if phone.visible and phone_tab == "radio":
		_rebuild_phone()


## Jornal do Huambo: notícias de hoje, câmbio, grupos.
var _jornal: Dictionary = {}


func _phone_jornal() -> void:
	var c := _card()
	c.add_child(_label("Jornal do Huambo", 22, ACCENT, FONT_BOLD))
	if _jornal.is_empty():
		c.add_child(_label("A carregar as notícias…", 15, Tema.TEXT_FAINT, FONT_REG))
		_fetch_jornal()
		return
	c.add_child(_label("%s · Câmbio: 1 USD = %s Kz" % [str(_jornal.get("dia", "")), DemoHud._money(int(_jornal.get("cambio", {}).get("rate", 0)))], 13, Tema.TEXT_FAINT, FONT_REG, true))
	var news: Array = _jornal.get("noticias", [])
	if news.is_empty():
		c.add_child(_label("Ainda não há notícias hoje. Compra uma casa, ganha a sorte grande ou manda uma dedicatória para apareceres no jornal!", 15, Tema.TEXT, FONT_REG, true))
	for n: Dictionary in news:
		c.add_child(_label("• " + str(n.text), 15, Tema.TEXT, FONT_REG, true))
	var gs: Array = _jornal.get("grupos", [])
	if not gs.is_empty():
		c.add_child(_label("Grupos com mais membros", 16, ACCENT, FONT_BOLD))
		for g: Dictionary in gs.slice(0, 5):
			c.add_child(_label("%s — %d membros" % [g.name, int(g.members)], 14, Tema.TEXT, FONT_REG, true))
	c.add_child(_button("Atualizar", "rotate", Tema.BTN2, Tema.TEXT, func() -> void:
		_jornal = {}
		_rebuild_phone()))


func _fetch_jornal() -> void:
	var r: Variant = await Net.get_json("/jornal")
	if typeof(r) == TYPE_DICTIONARY:
		_jornal = r
		if phone.visible and phone_tab in ["jornal", "grupos"]:
			_rebuild_phone()


## Amigos: pedir a quem está perto; ver se estão ligados e onde; ir ter com eles.
func _phone_friends() -> void:
	var req: Variant = Net.me.get("friendReq")
	if typeof(req) == TYPE_DICTIONARY:
		var r := _card()
		r.add_child(_label("%s quer ser teu amigo." % req.name, 17, ACCENT, FONT_BOLD, true))
		var row := HBoxContainer.new()
		row.add_child(_button("Aceitar", "plus", ACCENT, INK, func() -> void: Net.action("amigo_aceitar")))
		row.add_child(_button("Recusar", "minus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("amigo_recusar")))
		r.add_child(row)
	var c := _card()
	var fr: Array = Net.me.get("friends", [])
	c.add_child(_label("Os teus amigos (%d)" % fr.size(), 18, Tema.TEXT, FONT_BOLD))
	if fr.is_empty():
		c.add_child(_label("Ainda não tens amigos. Aproxima-te de alguém e convida-o aqui em baixo.", 15, Tema.TEXT_MUTED, FONT_REG, true))
	for i in fr.size():
		var f: Dictionary = fr[i]
		var line := "%s — %s" % [f.name, ("ligado em %s" % f.bairro) if bool(f.online) else "desligado"]
		c.add_child(_label(line, 15, Tema.OK if bool(f.online) else Tema.TEXT_FAINT, FONT_REG, true))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		if bool(f.online):
			var dist := str(f.district)
			var room_id := str(f.roomId)
			row.add_child(_button("Ir ter com", "pin", ACCENT, INK, func() -> void:
				phone.visible = false
				if dist == Net.current_district:
					if Net.room == null or room_id != Net.room.room_id:
						ui_action.emit("sala:" + room_id)
					else:
						show_toast("Já estão no mesmo sítio! Procura-o à tua volta.", true)
				else:
					_go(dist, false)))
		var idx := i + 1
		row.add_child(_button("Remover", "minus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("amigo_remover", "", idx)))
		c.add_child(row)
		_text_row(c, "SMS para %s (20 Kz de saldo)" % f.name, 120, "SMS", func(t: String) -> void: Net.action_text("sms", t, idx))
	# convidar quem está perto
	var me_e: Variant = Net.entities.get(Net.self_id)
	var near := []
	for id: int in Net.entities:
		if id != Net.self_id and me_e != null and (Net.entities[id].pos as Vector2).distance_to(me_e.pos) <= 1600.0:
			near.append([id, str(Net.entities[id].name)])
	var n := _card()
	n.add_child(_label("Pessoas perto de ti", 16, Tema.TEXT, FONT_BOLD))
	if near.is_empty():
		n.add_child(_label("Ninguém perto. Vai a um sítio com gente (mercado, cantina, paragem).", 14, Tema.TEXT_FAINT, FONT_REG, true))
	for x: Array in near:
		var eid := int(x[0])
		n.add_child(_label(str(x[1]), 15, Tema.TEXT, FONT_BOLD))
		var prow := HBoxContainer.new()
		prow.add_theme_constant_override("separation", 6)
		var inv := _button("Convidar", "plus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("amigo_pedir", str(eid)))
		inv.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		prow.add_child(inv)
		prow.add_child(_button("Bloquear", "minus", Tema.BTN2, Tema.DANGER, func() -> void: Net.action("bloquear", str(eid))))
		prow.add_child(_button("Denunciar", "more", Tema.BTN2, Tema.DANGER, func() -> void:
			_report_eid = eid
			_report_name = str(x[1])
			_rebuild_phone()))
		n.add_child(prow)
		if _report_eid == eid:
			_report_card(n, eid)
	# bloqueados
	var bl: Array = Net.me.get("bloqueados", [])
	if not bl.is_empty():
		var bc := _card()
		bc.add_child(_label("Bloqueados", 16, Tema.TEXT, FONT_BOLD))
		bc.add_child(_label("Não vês o que dizem nem recebes pedidos, SMS, presentes ou dinheiro deles.", 13, Tema.TEXT_FAINT, FONT_REG, true))
		for i in bl.size():
			var bi := i + 1
			var br := HBoxContainer.new()
			var bn := _label(str(bl[i].name), 15, Tema.TEXT, FONT_REG)
			bn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			br.add_child(bn)
			br.add_child(_button("Desbloquear", "plus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("desbloquear", "", bi)))
			bc.add_child(br)


## Denúncia: escolher o motivo (e, se quiser, explicar). Vai para a equipa de moderação.
var _report_eid := -1
var _report_name := ""


func _report_card(box: Container, eid: int) -> void:
	var d: Dictionary = Net.me.get("denuncias", {}) if typeof(Net.me.get("denuncias")) == TYPE_DICTIONARY else {}
	box.add_child(_label("Denunciar %s — porquê?" % _report_name, 15, ACCENT, FONT_BOLD, true))
	var motivos: Dictionary = d.get("motivos", {})
	for k: String in motivos:
		var motivo := k
		box.add_child(_button(str(motivos[k]), "more", Tema.BTN2, Tema.TEXT, func() -> void:
			if _report_note != "":
				Net.action_text("denunciar", _report_note, eid, motivo)
			else:
				Net.action("denunciar", motivo, eid)
			_report_eid = -1
			_report_note = ""
			_rebuild_phone()))
	_text_row(box, "Explica (opcional), depois escolhe o motivo", 150, "OK", func(t: String) -> void:
		_report_note = t
		show_toast("Explicação guardada. Agora escolhe o motivo.", true))
	box.add_child(_label("Denúncias hoje: %d/%d. As falas recentes da pessoa seguem com a denúncia." % [int(d.get("hoje", 0)), int(d.get("max", 5))], 12, Tema.TEXT_FAINT, FONT_REG, true))
	box.add_child(_button("Cancelar", "minus", Tema.BTN2, Tema.TEXT, func() -> void:
		_report_eid = -1
		_rebuild_phone()))


var _report_note := ""


## Grupos: criar (conta, 5.000 Kz), entrar, sair e falar com o grupo em qualquer bairro.
func _phone_groups() -> void:
	var g: Variant = Net.me.get("group")
	var c := _card()
	if typeof(g) == TYPE_DICTIONARY:
		c.add_child(_label("O teu grupo: %s" % g.name, 18, ACCENT, FONT_BOLD, true))
		c.add_child(_label("Fala com todos os membros ligados, em qualquer bairro:", 14, Tema.TEXT_MUTED, FONT_REG, true))
		_text_row(c, "Mensagem para o grupo…", 120, "Enviar", func(t: String) -> void: Net.say(t, true))
		var lines: Array = Net.chat_log.filter(func(l: Dictionary) -> bool: return bool(l.get("g", false)))
		for l: Dictionary in lines.slice(maxi(0, lines.size() - 8)):
			c.add_child(_label("%s: %s" % [l.n, l.t], 14, Tema.TEXT, FONT_REG, true))
		c.add_child(_button("Sair do grupo", "minus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("grupo_sair")))
		_kixikila_card()
		return
	c.add_child(_label("Ainda não estás num grupo. Junta-te a um ou cria o teu (5.000 Kz, só com conta).", 15, Tema.TEXT, FONT_REG, true))
	_text_row(c, "Nome do grupo (3 a 30 letras)", 30, "Criar", func(t: String) -> void: Net.action_text("grupo_criar", t))
	var l := _card()
	l.add_child(_label("Grupos do Huambo", 17, Tema.TEXT, FONT_BOLD))
	if _jornal.is_empty():
		l.add_child(_label("A carregar…", 14, Tema.TEXT_FAINT, FONT_REG))
		_fetch_jornal()
		return
	var gs: Array = _jornal.get("grupos", [])
	if gs.is_empty():
		l.add_child(_label("Ainda não há grupos. Sê o primeiro!", 14, Tema.TEXT_FAINT, FONT_REG))
	for x: Dictionary in gs:
		var gid := str(x.id)
		l.add_child(_button("Entrar: %s (%d)" % [x.name, int(x.members)], "plus", Tema.BTN2, Tema.TEXT, func() -> void:
			Net.action_text("grupo_entrar", gid)
			_jornal = {}))


## Sorte do dia: grátis, uma vez por dia; o servidor sorteia o prémio.
func _phone_luck() -> void:
	var c := _card()
	c.add_child(_label("Roda a sorte uma vez por dia, de graça. Podes ganhar até 10.000 Kz.", 16, Tema.TEXT, FONT_REG, true))
	if bool(Net.me.get("sorteHoje", false)):
		c.add_child(_label("Já rodaste hoje. Volta amanhã!", 16, ACCENT, FONT_BOLD, true))
	else:
		c.add_child(_button("Rodar a sorte", "target", ACCENT, INK, func() -> void: Net.action("sorte")))


## Transferir: dar dinheiro a alguém que está perto (cara a cara).
func _phone_transfer() -> void:
	var c := _card()
	c.add_child(_label("Dá dinheiro a uma pessoa que esteja perto de ti (até 8 m). Entre 100 e 100.000 Kz de cada vez.", 15, Tema.TEXT_MUTED, FONT_REG, true))
	if Auth.is_guest:
		c.add_child(_label("Precisas de uma conta (Criar conta) para transferir dinheiro.", 15, Tema.DANGER, FONT_REG, true))
		return
	var me: Variant = Net.entities.get(Net.self_id)
	var near: Array = []
	for id: int in Net.entities:
		if id == Net.self_id or me == null:
			continue
		var e: Dictionary = Net.entities[id]
		if (e.pos as Vector2).distance_to(me.pos) <= 800.0:
			near.append([id, str(e.name)])
	if near.is_empty():
		c.add_child(_label("Não há ninguém perto de ti. Aproxima-te de outro jogador.", 15, ACCENT, FONT_REG, true))
		return
	for n: Array in near:
		var who := str(n[1])
		var eid := int(n[0])
		c.add_child(_label(who, 18, Tema.TEXT, FONT_BOLD))
		var row := HFlowContainer.new()
		row.add_theme_constant_override("h_separation", 6)
		row.add_theme_constant_override("v_separation", 6)
		for v: int in [500, 1000, 5000, 10000]:
			row.add_child(_button(DemoHud._money(v), "plus", ACCENT, INK, func() -> void: Net.action("transfer", str(eid), v)))
		c.add_child(row)


## Falar (como no Vida na Banda): quem está perto ouve; frases rápidas ou escrever.
const QUICK_PHRASES := ["Bom dia!", "Tudo bem, mano?", "Bué fixe!", "Vamos dar uma volta?", "Kota, uma ajuda?", "Até logo!"]
var _chat_edit: LineEdit


func _open_chat() -> void:
	_panel("Falar")
	menu_body.add_child(_label("Quem está perto de ti (15 m) ouve o que dizes.", 13, Tema.TEXT_MUTED, FONT_REG, true))
	var log_box := VBoxContainer.new()
	log_box.add_theme_constant_override("separation", 4)
	var lines: Array = Net.chat_log.slice(maxi(0, Net.chat_log.size() - 10))
	if lines.is_empty():
		log_box.add_child(_label("Ainda ninguém falou aqui.", 14, Tema.TEXT_FAINT, FONT_REG, true))
	for l: Dictionary in lines:
		log_box.add_child(_label("%s: %s" % [l.n, l.t], 15, ACCENT if int(l.id) == Net.self_id else Tema.TEXT, FONT_REG, true))
	menu_body.add_child(log_box)
	var grid := GridContainer.new()
	grid.columns = 2
	for ph: String in QUICK_PHRASES:
		var t := ph
		grid.add_child(_button(t, "chat", Tema.BTN2, Tema.TEXT, func() -> void:
			Net.say(t)
			menu_panel.visible = false))
	menu_body.add_child(grid)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	_chat_edit = LineEdit.new()
	_chat_edit.placeholder_text = "Escreve aqui…"
	_chat_edit.max_length = 120
	_chat_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_chat_edit.custom_minimum_size = Vector2(0, 46)
	_chat_edit.add_theme_font_override("font", FONT_REG)
	_chat_edit.add_theme_font_size_override("font_size", 16)
	WebTextInput.attach(_chat_edit, "text")
	var send := func(_t: String = "") -> void:
		if _chat_edit.text.strip_edges() != "":
			Net.say(_chat_edit.text)
			_chat_edit.text = ""
			menu_panel.visible = false
	_chat_edit.text_submitted.connect(send)
	row.add_child(_chat_edit)
	row.add_child(_button("Enviar", "chat", ACCENT, INK, func() -> void: send.call()))
	menu_body.add_child(row)
	_close_button()


func _open_emotes() -> void:
	_panel("Gestos")
	var grid := GridContainer.new()
	grid.columns = 3
	for e: Array in [["acenar", "Acenar", "hand"], ["dancar", "Dançar", "person"], ["aplaudir", "Aplaudir", "hand"], ["rir", "Rir", "person"], ["celebrar", "Celebrar", "plus"], ["resmungar", "Resmungar", "minus"]]:
		var id := str(e[0])
		grid.add_child(_button(str(e[1]), str(e[2]), ACCENT, INK, func() -> void:
			Net.emote(id)
			menu_panel.visible = false))
	menu_body.add_child(grid)
	_close_button()


func _fetch_stats() -> void:
	var r: Variant = await Net.get_json("/stats")
	if typeof(r) == TYPE_DICTIONARY:
		_stats = r
		if phone.visible and phone_tab == "inicio":
			_rebuild_phone()


func _achievements_card() -> void:
	var list: Array = Net.me.get("conquistas", [])
	if list.is_empty():
		return
	var c := _card()
	var done := list.filter(func(x: Dictionary) -> bool: return bool(x.feita))
	c.add_child(_label("Conquistas %d/%d" % [done.size(), list.size()], 17, ACCENT, FONT_BOLD))
	var due := list.filter(func(x: Dictionary) -> bool: return bool(x.feita) and not bool(x.paga))
	if not due.is_empty():
		var total := 0
		for x: Dictionary in due:
			total += int(x.reward)
		c.add_child(_button("Recolher prémios (+%s Kz)" % DemoHud._money(total), "plus", ACCENT, INK, func() -> void: Net.action("conquistas_recolher")))
	for x: Dictionary in list:
		c.add_child(_label(("✓ " if bool(x.feita) else "○ ") + "%s — %s" % [x.name, x.text], 14, Tema.OK if bool(x.feita) else Tema.TEXT_FAINT, FONT_REG, true))


func _phone_profile() -> void:
	_achievements_card()
	var me := Net.me
	var job := _job(str(me.get("job", "")))
	var lines := [
		"%s" % me.get("familyLabel", ""),
		"Dinheiro: %s Kz" % DemoHud._money(int(me.get("money", 0))),
		"Estudos: nível %d (aulas %d/%d)" % [int(me.get("education", 0)), int(me.get("study", 0)), int(catalog.get("lessonsPerLevel", 3))],
		"Emprego: %s" % (job.name if not job.is_empty() else "sem emprego"),
		"Turnos hoje: %d" % int(me.get("shifts", 0)),
		"No banco: %s Kz" % DemoHud._money(int(me.get("bank", 0))),
		"Saldo do telemóvel: %s Kz" % DemoHud._money(int(me.get("phoneCredit", 0))),
		"Documentos: BI %s · Registo criminal %s" % ["✓" if me.get("docs", {}).get("bi", false) else "—", "✓" if me.get("docs", {}).get("registo", false) else "—"],
	]
	for l: String in lines:
		phone_body.add_child(_label(l, 16, Tema.TEXT, FONT_REG, true))
	if bool(me.get("parentsToday", false)):
		phone_body.add_child(_label("Já pediste dinheiro aos pais hoje.", 14, Tema.TEXT_FAINT, FONT_REG, true))
	else:
		phone_body.add_child(_button("Pedir dinheiro aos pais", "person", ACCENT, INK, func() -> void: Net.action("parents")))
	if float(me.get("needs", {}).get("energy", 100)) < 30:
		phone_body.add_child(_button("Dormir no banco da paragem (grátis)", "sun", Tema.BTN2, Tema.TEXT, func() -> void:
			Net.action("sleep_rua")
			phone.visible = false))


func _phone_home() -> void:
	var homes: Array = Net.me.get("homes", [])
	phone_body.add_child(_label("A minha casa", 20, ACCENT, FONT_BOLD))
	if homes.is_empty():
		phone_body.add_child(_label("Ainda não tens casa. Vai à porta da Casa à venda ou de um prédio (Prédio Kuito, Prédio da Rua Cinco) e toca em Entrar para arrendar ou comprar.", 15, Tema.TEXT, FONT_REG, true))
		var h: Dictionary = catalog.get("housing", {})
		for k: String in h:
			phone_body.add_child(_label("%s: renda %s Kz/dia · compra %s Kz" % ["Casa" if k == "casa" else "Apartamento", DemoHud._money(int(h[k].rentPerDay)), DemoHud._money(int(h[k].buy))], 14, Tema.TEXT_MUTED, FONT_REG, true))
	for hm: Dictionary in homes:
		var until := "comprada" if hm.tenure == "buy" else "renda paga até %s" % Time.get_datetime_string_from_unix_time(int(float(hm.paidUntil) / 1000.0) + 3600, true).substr(0, 16)
		phone_body.add_child(_label("%s — %s" % [hm.name, until], 16, Tema.TEXT, FONT, true))
	phone_body.add_child(_label("Em casa: dorme de graça na tua cama e cozinha por 500 Kz.", 13, Tema.TEXT_FAINT, FONT_REG, true))


## Loja: carros (ficam estacionados à porta de casa; tocar no carro → Viajar).
func _phone_shop() -> void:
	phone_body.add_child(_label("Carros", 20, ACCENT, FONT_BOLD))
	var mine := str(Net.me.get("car", "")) if Net.me.get("car") != null else ""
	for c: Dictionary in catalog.get("cars", []):
		var box := VBoxContainer.new()
		box.add_child(_label("%s — %s Kz" % [c.name, DemoHud._money(int(c.price))], 16, Tema.TEXT, FONT, true))
		var id := str(c.id)
		if id == mine:
			box.add_child(_label("É o teu carro.", 14, Tema.OK, FONT_REG, true))
		else:
			box.add_child(_button("Comprar", "bag", ACCENT, INK, func() -> void: Net.action("buy_car", id)))
		phone_body.add_child(box)
	phone_body.add_child(_label("Precisas de casa para o estacionar. Viajar de carro custa só o combustível (300 Kz).", 13, Tema.TEXT_FAINT, FONT_REG, true))


func _phone_jobs() -> void:
	var my := str(Net.me.get("job", ""))
	var edu := int(Net.me.get("education", 0))
	phone_body.add_child(_label("Vagas no Huambo", 20, ACCENT, FONT_BOLD))
	for j: Dictionary in catalog.get("jobs", []):
		var box := VBoxContainer.new()
		box.add_child(_label("%s — %s Kz/turno" % [j.name, DemoHud._money(int(j.pay))], 16, Tema.TEXT, FONT, true))
		var req := "sem estudos" if int(j.education) == 0 else "estudos nível %d" % int(j.education)
		for dk: String in j.get("docs", []):
			req += " · " + ("BI" if dk == "bi" else "registo criminal")
		box.add_child(_label("%s · %s" % [j.where, req], 13, Tema.TEXT_MUTED, FONT_REG, true))
		var id: String = j.id
		if id == my:
			box.add_child(_button("Despedir-me", "minus", Tema.BTN2, Tema.TEXT, func() -> void: Net.action("quit_job")))
		elif edu >= int(j.education):
			box.add_child(_button("Aceitar", "plus", ACCENT, INK, func() -> void: Net.action("take_job", id)))
		phone_body.add_child(box)
	phone_body.add_child(_label("Os 2 primeiros turnos do dia pagam por inteiro; depois cada turno paga menos (85%, 65%, 45%, 20%).", 13, Tema.TEXT_FAINT, FONT_REG, true))


func _phone_help() -> void:
	for l: String in [
		"Come antes que a fome acabe: a cantina é a refeição mais barata.",
		"Todos os edifícios com nome abrem: aproxima-te da porta e toca em Entrar.",
		"Dorme no Hotel iU ou na tua casa. Sem dinheiro, dorme no banco da paragem.",
		"Arrenda ou compra casa à porta da Casa à venda ou dos prédios.",
		"Guarda dinheiro no Banco Planalto. BI no Governo Provincial; registo criminal no Tribunal.",
		"Aceita uma vaga em Vagas e vai ao local de trabalho para fazer turnos.",
		"Estuda na Escola Primária para desbloquear empregos melhores.",
		"Uma vez por dia podes pedir dinheiro aos teus pais.",
		"Andar: setas ou WASD, ou toca no chão.",
	]:
		phone_body.add_child(_label("• " + l, 15, Tema.TEXT, FONT_REG, true))


# ------------------------------------------------------------------ utilitários

func _job(id: String) -> Dictionary:
	for j: Dictionary in catalog.get("jobs", []):
		if j.id == id:
			return j
	return {}


func _job_by_place(place_job: String) -> Dictionary:
	for j: Dictionary in catalog.get("jobs", []):
		if j.place == place_job:
			return j
	return {}


func _busy_text(kind: String) -> String:
	return {"work": "A trabalhar", "study": "Na aula", "biscato": "Biscato", "sleep": "A dormir", "sleep_rua": "A dormir na paragem", "sleep_casa": "A dormir em casa"}.get(kind, "Ocupado")


func _label(text: String, size: int, color: Color, font: Font, wrap := false) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", font)
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l


func _pill(c: Color, r: int, border := Color(0, 0, 0, 0)) -> StyleBoxFlat:
	# cartões do telemóvel levam contorno fino; o resto, a borda pedida
	var sb := Tema.box(c, r, 0, Tema.STROKE if c == Tema.CARD or c == Tema.PANEL or c == Tema.PHONE else Color(0, 0, 0, 0))
	if border.a > 0.0:
		sb.border_color = border
		sb.set_border_width_all(3)
	return sb


func _style_round(b: Button, r: int, bg: Color) -> void:
	var step := 4 if bg.a > 0.95 else 0 # só as cores cheias levam degrau; os painéis translúcidos ficam lisos
	var stroke := Tema.STROKE if bg.a <= 0.95 and bg.a > 0.0 else Color(0, 0, 0, 0)
	b.add_theme_stylebox_override("normal", Tema.box(bg, r, step, stroke))
	b.add_theme_stylebox_override("hover", Tema.box(bg.lightened(0.08), r, step, stroke))
	b.add_theme_stylebox_override("pressed", Tema.box(bg.lightened(0.14), r, 0, stroke))
	b.add_theme_stylebox_override("hover_pressed", Tema.box(bg.lightened(0.14), r, 0, stroke))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	b.focus_mode = Control.FOCUS_NONE
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, Tema.TEXT)


## Botão redondo só com ícone (coluna da direita).
func _round(icon: String, tip: String, cb: Callable) -> Button:
	var b := Button.new()
	b.icon = DemoIcons.make(icon, ACCENT, 28)
	b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.tooltip_text = tip
	b.custom_minimum_size = Vector2(60, 60)
	_style_round(b, 30, BG)
	b.pressed.connect(cb)
	return b


## Separador da barra de baixo: ícone por cima do texto.
func _tab(icon: String, text: String, main: bool, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.icon = DemoIcons.make(icon, Tema.TEXT, 30)
	b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.vertical_icon_alignment = VERTICAL_ALIGNMENT_TOP
	b.custom_minimum_size = Vector2(84, 74)
	b.add_theme_font_override("font", FONT_BOLD)
	b.add_theme_font_size_override("font_size", 14)
	b.add_theme_constant_override("h_separation", 2)
	_style_round(b, 28, ACCENT_DARK if main else Color(0, 0, 0, 0))
	b.pressed.connect(cb)
	return b


func _button(text: String, icon: String, bg: Color, fg: Color, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.set_meta("label", text)
	if icon != "":
		b.icon = DemoIcons.make("phone" if icon == "phone_icon" else icon, fg)
	b.custom_minimum_size = Vector2(0, 46)
	b.add_theme_font_override("font", FONT)
	b.add_theme_font_size_override("font_size", 16)
	for st: String in ["font_color", "font_hover_color", "font_pressed_color"]:
		b.add_theme_color_override(st, fg)
	b.add_theme_constant_override("h_separation", 10)
	# botão «físico»: degrau por baixo que desaparece ao carregar
	var step := 0 if bg.a < 0.5 else 4
	b.add_theme_stylebox_override("normal", Tema.box(bg, 23, step))
	b.add_theme_stylebox_override("hover", Tema.box(bg.lightened(0.08), 23, step))
	var pr := Tema.box(bg.darkened(0.08), 23, 0)
	pr.content_margin_top = 8 + step
	pr.shadow_size = 2
	b.add_theme_stylebox_override("pressed", pr)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(cb)
	return b
