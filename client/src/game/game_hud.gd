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
const BG := Color(0.08, 0.07, 0.07, 0.86)
const ACCENT := Color(0.95, 0.72, 0.18)
const INK := Color("2a1d10")
const NEEDS := [["hunger", "Fome", Color("e9a23b")], ["energy", "Energia", Color("4fa3e0")], ["mood", "Humor", Color("e46fa8")], ["health", "Saúde", Color("5cbf6a")]]

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
const ACCENT_DARK := Color("b5341f")


func _ready() -> void:
	# --- topo ao centro: retrato + dinheiro (como nos jogos de vida para telemóvel)
	var money_pill := PanelContainer.new()
	var msb := _pill(BG, 36, ACCENT_DARK)
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
	var fsb := _pill(Color("6b2a17"), 28, ACCENT)
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
	top_label.add_theme_color_override("font_color", Color(1, 1, 1, 0.7))
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
	sala_button.icon = DemoIcons.make("pin", Color.WHITE, 18)
	sala_button.pressed.connect(_open_rooms)
	add_child(sala_button)
	_refresh_sala.call_deferred()

	# --- topo à esquerda: necessidade mais baixa; tocar abre as quatro
	needs_button.toggle_mode = true
	_style_round(needs_button, 26, BG)
	needs_button.custom_minimum_size = Vector2(150, 56)
	needs_button.position = Vector2(14, 90)
	needs_button.icon = DemoIcons.make("bowl", Color("8fe08a"), 28)
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
		var l := _label(n[1], 15, Color.WHITE, FONT)
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
		back.bg_color = Color(1, 1, 1, 0.12)
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
		p.add_theme_stylebox_override("panel", _pill(PHONE_BG if tall else Color(0.1, 0.09, 0.09, 0.95), 30 if tall else 22))
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
	top_label.text = "%s · %s · %02d:%02d" % ["DIA" if h >= 6 and h < 18 else "NOITE", place_text.to_upper(), h, m]
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
	toast_label.add_theme_color_override("font_color", Color.WHITE if ok else Color("ffb4a8"))
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
	_home_tab.icon = DemoIcons.make("door" if on else "home", Color.WHITE, 30)


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
		actions_box.add_child(_button("Parar", "minus", BG, Color.WHITE, func() -> void: Net.action("cancel")))
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
			actions_box.add_child(_button("Estudar (%s Kz)" % DemoHud._money(int(prices.get("study", 0))), "plus", ACCENT, INK, func() -> void: Net.action("study")))
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
					actions_box.add_child(_button("Vaga: %s" % j.name, "person", BG, Color.WHITE, func() -> void: _open_phone("vagas")))
	if typeof(inside) == TYPE_DICTIONARY:
		actions_box.add_child(_button("Sair", "door", BG, Color.WHITE, func() -> void: Net.action("exit")))


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
	menu_body.add_child(_button("Fechar", "minus", BG, Color.WHITE, func() -> void: menu_panel.visible = false))


## Mapa: vista geral do bairro e viagem de candongueiro para outros bairros do Huambo.
func _open_map() -> void:
	_panel("Mapa do Huambo")
	menu_body.add_child(_button("Ver o bairro todo / voltar", "map", BG, Color.WHITE, func() -> void:
		ui_action.emit("mapa")
		menu_panel.visible = false))
	menu_body.add_child(_label("Apanhar candongueiro (%s Kz) para:" % DemoHud._money(int(catalog.get("prices", {}).get("travel", 200))), 16, Color.WHITE, FONT, true))
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
		menu_body.add_child(_label("Não foi possível obter os bairros.", 14, Color("ffb4a8"), FONT_REG, true))
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
		menu_body.add_child(_label("A amarelo: bairros vizinhos a pé (vai ao fim da rua com a placa). Os outros: candongueiro.", 12, Color(1, 1, 1, 0.7), FONT_REG, true))
		bairros.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return str(a.name).naturalnocasecmp_to(str(b.name)) < 0)
		for d: Dictionary in bairros:
			if str(d.id) == here:
				continue
			var id := str(d.id)
			var walk := links.has(id)
			menu_body.add_child(_button(("%s  (a pé)" if walk else "%s") % d.name, "pin", ACCENT if not walk else Color("f2c14e"), INK, func() -> void: _go(id, walk)))
	_close_button()


## Destino escolhido no mapa: vizinho → mostra o caminho (placa no fim da rua); senão candongueiro.
func _go(id: String, walk: bool) -> void:
	menu_panel.visible = false
	if walk:
		ui_action.emit("caminho:" + id)
		return
	_panel("Como queres ir?")
	var at_stop := str(_context.get("kind", "")) == "stop"
	if not at_stop:
		menu_body.add_child(_label("Os candongueiros, kupapatas, táxis e autocarros param na paragem do bairro.", 14, Color.WHITE, FONT_REG, true))
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
	menu_body.add_child(_label(GUIDE[step][1], 17, Color.WHITE, FONT_REG, true))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.add_child(_button("Saltar", "minus", BG, Color.WHITE, func() -> void: show_guide(GUIDE.size())))
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
	menu_body.add_child(_label("Cada bairro tem várias salas com outras pessoas. Muda para estar com os teus amigos.", 14, Color.WHITE, FONT_REG, true))
	var rooms: Variant = await Net.get_json("/districts/%s/rooms" % Net.current_district)
	if not menu_panel.visible:
		return
	if typeof(rooms) != TYPE_ARRAY:
		menu_body.add_child(_label("Não foi possível obter as salas.", 14, Color("ffb4a8"), FONT_REG, true))
	else:
		for r: Dictionary in rooms:
			var mine: bool = Net.room != null and str(r.roomId) == Net.room.room_id
			var full := int(r.clients) >= int(r.maxClients)
			var rid := str(r.roomId)
			var txt := "Sala %d · %d/%d pessoas%s" % [int(r.sala), int(r.clients), int(r.maxClients), "  (estás aqui)" if mine else ""]
			var b := _button(txt, "person", BG if mine or full else ACCENT, Color.WHITE if mine or full else INK, func() -> void:
				menu_panel.visible = false
				ui_action.emit("sala:" + rid))
			b.disabled = mine or full
			menu_body.add_child(b)
	_close_button()


func _open_bank() -> void:
	_panel("Banco Planalto")
	menu_body.add_child(_label("Na carteira: %s Kz\nNo banco: %s Kz" % [DemoHud._money(int(Net.me.get("money", 0))), DemoHud._money(int(Net.me.get("bank", 0)))], 16, Color.WHITE, FONT_REG, true))
	menu_body.add_child(_label("Depositar", 16, Color.WHITE, FONT, true))
	var row := HBoxContainer.new()
	for v: int in [1000, 10000, 100000]:
		row.add_child(_button(DemoHud._money(v), "plus", ACCENT, INK, func() -> void: Net.action("bank_in", "", v)))
	var all_in := int(Net.me.get("money", 0))
	if all_in > 0:
		row.add_child(_button("Tudo", "plus", ACCENT, INK, func() -> void: Net.action("bank_in", "", all_in)))
	menu_body.add_child(row)
	menu_body.add_child(_label("Levantar", 16, Color.WHITE, FONT, true))
	var row2 := HBoxContainer.new()
	for v: int in [1000, 10000, 100000]:
		row2.add_child(_button(DemoHud._money(v), "minus", BG, Color.WHITE, func() -> void: Net.action("bank_out", "", v)))
	var all_out := int(Net.me.get("bank", 0))
	if all_out > 0:
		row2.add_child(_button("Tudo", "minus", BG, Color.WHITE, func() -> void: Net.action("bank_out", "", all_out)))
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
		row.add_child(_label(str(sv.name) + (" ✓" if done else ""), 15, Color.WHITE, FONT_REG, true))
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
	menu_body.add_child(_label("Renda: %s Kz/dia (7 dias pagam 6) · Comprar: %s Kz" % [DemoHud._money(per_day), DemoHud._money(buy)], 14, Color(1, 1, 1, 0.75), FONT_REG, true))
	for u: Dictionary in offer.units:
		var box := VBoxContainer.new()
		var state := "é tua" if u.mine else ("livre" if u.free else "ocupada")
		box.add_child(_label("%s — %s" % [u.name, state], 16, Color.WHITE if u.free else Color(1, 1, 1, 0.5), FONT, true))
		var id: String = u.id
		if u.free:
			var row := HBoxContainer.new()
			row.add_child(_button("1 dia: %s" % DemoHud._money(per_day), "home", ACCENT, INK, func() -> void: Net.action("rent_house", id, 1)))
			row.add_child(_button("7 dias: %s" % DemoHud._money(per_day * 6), "home", ACCENT, INK, func() -> void: Net.action("rent_house", id, 7)))
			box.add_child(row)
			box.add_child(_button("Comprar: %s Kz" % DemoHud._money(buy), "bag", BG, Color.WHITE, func() -> void: Net.action("buy_house", id)))
		menu_body.add_child(box)
	_close_button()


# ------------------------------------------------------------------ ementa

func _open_menu() -> void:
	for c in menu_body.get_children():
		c.queue_free()
	menu_body.add_child(_label(str(_context.get("name", "Comer")), 22, ACCENT, FONT_BOLD))
	for item: Dictionary in catalog.get("menus", {}).get(str(_context.get("shop", "")), []):
		var row := HBoxContainer.new()
		var info := _label("%s\n+%d fome%s" % [item.name, int(item.hunger), "" if not item.has("energy") else ", +%d energia" % int(item.energy)], 15, Color.WHITE, FONT_REG, true)
		row.add_child(info)
		var id: String = item.id
		row.add_child(_button("%s Kz" % DemoHud._money(int(item.price)), "bag", ACCENT, INK, func() -> void:
			Net.action("eat", id)
			menu_panel.visible = false))
		menu_body.add_child(row)
	menu_body.add_child(_button("Fechar", "minus", BG, Color.WHITE, func() -> void: menu_panel.visible = false))
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
const PHONE_BG := Color("1d1517")
const APP_DARK := Color("2e2426")
const APP_RED := Color("c8102e")
const APP_YELLOW := Color("f5c400")
## [id, nome, ícone, cor]
const APPS := [
	["missoes", "Missões", "target", "y"], ["perfil", "Perfil", "person", "d"], ["familia", "Família", "home", "d"], ["mapa", "Mapa", "map", "r"],
	["vagas", "Vagas", "bag", "r"], ["estudos", "Estudos", "plus", "d"], ["banco", "Banco", "bag", "y"], ["casa", "Casa", "home", "d"],
	["loja", "Loja", "shirt", "y"], ["saude", "Saúde", "plus", "r"], ["governo", "Governo", "door", "d"], ["sorte", "Sorte", "target", "y"],
	["transferir", "Transferir", "person", "y"], ["ajuda", "Ajuda", "more", "d"],
]
const WEEKDAYS := ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"]
const MONTHS := ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


func _rebuild_phone() -> void:
	for c in phone_body.get_children():
		c.queue_free()
	if phone_tab != "inicio":
		var head := HBoxContainer.new()
		head.add_theme_constant_override("separation", 10)
		head.add_child(_button("Início", "minus", Color(1, 1, 1, 0.08), Color.WHITE, func() -> void: _open_phone("inicio")))
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
		"estudos": _phone_go("Estudos", "Nível %d · aulas %d/%d. Cada nível desbloqueia empregos melhores." % [int(Net.me.get("education", 0)), int(Net.me.get("study", 0)), int(catalog.get("lessonsPerLevel", 3))], "escola", "Ir à escola")
		"banco": _phone_go("Banco", "Na carteira: %s Kz\nNo banco: %s Kz\nDepositar e levantar faz-se ao balcão do banco." % [DemoHud._money(int(Net.me.get("money", 0))), DemoHud._money(int(Net.me.get("bank", 0)))], "banco", "Ir ao banco")
		"casa": _phone_home()
		"loja": _phone_shop()
		"saude": _phone_go("Saúde", "Saúde: %d%% · Energia: %d%% · Fome: %d%%\nConsultas no centro de saúde; medicamentos na farmácia." % [int(Net.me.get("needs", {}).get("health", 0)), int(Net.me.get("needs", {}).get("energy", 0)), int(Net.me.get("needs", {}).get("hunger", 0))], "saude", "Ir ao centro de saúde")
		"governo": _phone_go("Governo", "BI: %s · Registo criminal: %s · Atestado de residência: %s\nTrata dos documentos na Administração do bairro, no Governo Provincial ou no Tribunal." % ["✓" if Net.me.get("docs", {}).get("bi", false) else "—", "✓" if Net.me.get("docs", {}).get("registo", false) else "—", "✓" if Net.me.get("docs", {}).get("residencia", false) else "—"], "administracao", "Ir à Administração")
		"ajuda": _phone_help()
		"sorte": _phone_luck()
		"transferir": _phone_transfer()
	phone_body.add_child(_button("Fechar o telemóvel", "minus", Color(1, 1, 1, 0.1), Color.WHITE, func() -> void: phone.visible = false))


func _card() -> VBoxContainer:
	var p := PanelContainer.new()
	var sb := _pill(Color(1, 1, 1, 0.06), 26)
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
	c.add_child(_label("%02d:%02d" % [h, int(_clock_min) % 60], 64, Color("f3ead8"), FONT_BOLD))
	var now := Time.get_datetime_dict_from_unix_time(int(Time.get_unix_time_from_system()) + 3600)
	c.add_child(_label("%s, %d de %s" % [WEEKDAYS[int(now.weekday)], int(now.day), MONTHS[int(now.month) - 1]], 17, Color(1, 1, 1, 0.6), FONT_REG))
	var row := HBoxContainer.new()
	var city := _label(("Dia" if h >= 6 and h < 18 else "Noite") + " · Huambo · " + place_text, 17, Color.WHITE, FONT_BOLD)
	city.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(city)
	row.add_child(_label("%s Kz" % DemoHud._money(int(Net.me.get("money", 0))), 18, ACCENT, FONT_BOLD))
	c.add_child(row)
	c.add_child(_label("●  %s pessoas a jogar hoje" % DemoHud._money(int(_stats.hoje)), 16, Color("7ee08a"), FONT))
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
		var ht := _label("Hoje · %d/%d" % [done, items.size()], 18, Color.WHITE, FONT_BOLD)
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
	var bg: Color = {"y": APP_YELLOW, "r": APP_RED, "d": APP_DARK}[a[3]]
	var fg := INK if a[3] == "y" else Color.WHITE
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
	var l := _label(str(a[1]), 14, Color.WHITE, FONT_BOLD)
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
		var txt := _label("%s  %s" % [mark, it.text], 15, Color.WHITE if not bool(it.claimed) else Color(1, 1, 1, 0.45), FONT_REG, true)
		txt.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(txt)
		if bool(it.done) and not bool(it.claimed):
			var n := i + 1
			row.add_child(_button("+%s" % DemoHud._money(int(it.reward)), "plus", ACCENT, INK, func() -> void: Net.action("mission_claim", "", n)))
		elif not bool(it.done):
			row.add_child(_label("%s Kz" % DemoHud._money(int(it.reward)), 13, Color(1, 1, 1, 0.5), FONT_REG))
		box.add_child(row)
	if int(ms.get("progress", 0)) > 0:
		box.add_child(_label("Sítios visitados hoje: %d/3" % int(ms.progress), 13, Color(1, 1, 1, 0.55), FONT_REG))
	box.add_child(_label("Sequência: %d dia(s) completos · dia completo hoje: +%s Kz" % [int(ms.get("streak", 0)), DemoHud._money(int(ms.get("streakBonus", 0)))], 13, ACCENT, FONT_REG, true))


func _phone_missions() -> void:
	var ms: Dictionary = Net.me.get("missions", {}) if typeof(Net.me.get("missions")) == TYPE_DICTIONARY else {}
	var c := _card()
	c.add_child(_label("Faz as 3 missões de hoje e recolhe os prémios. Completar o dia seguido aumenta o bónus da sequência (até 7 dias).", 15, Color(1, 1, 1, 0.75), FONT_REG, true))
	_mission_rows(c, ms.get("items", []), ms)


func _phone_family() -> void:
	var b: Variant = Net.me.get("birth")
	var c := _card()
	c.add_child(_label(str(Net.me.get("familyLabel", "")), 18, Color.WHITE, FONT_BOLD, true))
	if typeof(b) == TYPE_DICTIONARY:
		c.add_child(_label("Pais: %s\nProvíncia de origem: %s\nCresceste em: %s" % [b.pais, b.provincia, b.bairroNome], 15, Color.WHITE, FONT_REG, true))
	if bool(Net.me.get("parentsToday", false)):
		c.add_child(_label("Já pediste dinheiro aos pais hoje.", 14, Color(1, 1, 1, 0.6), FONT_REG, true))
	else:
		c.add_child(_button("Pedir dinheiro aos pais", "person", ACCENT, INK, func() -> void: Net.action("parents")))


## App que mostra o estado e leva-te a pé ao sítio certo do bairro.
func _phone_go(_title: String, text: String, venue: String, go_text: String) -> void:
	var c := _card()
	c.add_child(_label(text, 16, Color.WHITE, FONT_REG, true))
	c.add_child(_button(go_text, "pin", ACCENT, INK, func() -> void:
		phone.visible = false
		ui_action.emit("ir:" + venue)))


## Sorte do dia: grátis, uma vez por dia; o servidor sorteia o prémio.
func _phone_luck() -> void:
	var c := _card()
	c.add_child(_label("Roda a sorte uma vez por dia, de graça. Podes ganhar até 10.000 Kz.", 16, Color.WHITE, FONT_REG, true))
	if bool(Net.me.get("sorteHoje", false)):
		c.add_child(_label("Já rodaste hoje. Volta amanhã!", 16, ACCENT, FONT_BOLD, true))
	else:
		c.add_child(_button("Rodar a sorte", "target", ACCENT, INK, func() -> void: Net.action("sorte")))


## Transferir: dar dinheiro a alguém que está perto (cara a cara).
func _phone_transfer() -> void:
	var c := _card()
	c.add_child(_label("Dá dinheiro a uma pessoa que esteja perto de ti (até 8 m). Entre 100 e 100.000 Kz de cada vez.", 15, Color(1, 1, 1, 0.8), FONT_REG, true))
	if Auth.is_guest:
		c.add_child(_label("Precisas de uma conta (Criar conta) para transferir dinheiro.", 15, Color("ffb4a8"), FONT_REG, true))
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
		c.add_child(_label(who, 18, Color.WHITE, FONT_BOLD))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		for v: int in [500, 1000, 5000, 10000]:
			row.add_child(_button(DemoHud._money(v), "plus", ACCENT, INK, func() -> void: Net.action("transfer", str(eid), v)))
		c.add_child(row)


## Falar (como no Vida na Banda): quem está perto ouve; frases rápidas ou escrever.
const QUICK_PHRASES := ["Bom dia!", "Tudo bem, mano?", "Bué fixe!", "Vamos dar uma volta?", "Kota, uma ajuda?", "Até logo!"]
var _chat_edit: LineEdit


func _open_chat() -> void:
	_panel("Falar")
	menu_body.add_child(_label("Quem está perto de ti (15 m) ouve o que dizes.", 13, Color(1, 1, 1, 0.65), FONT_REG, true))
	var log_box := VBoxContainer.new()
	log_box.add_theme_constant_override("separation", 4)
	var lines: Array = Net.chat_log.slice(maxi(0, Net.chat_log.size() - 10))
	if lines.is_empty():
		log_box.add_child(_label("Ainda ninguém falou aqui.", 14, Color(1, 1, 1, 0.5), FONT_REG, true))
	for l: Dictionary in lines:
		log_box.add_child(_label("%s: %s" % [l.n, l.t], 15, ACCENT if int(l.id) == Net.self_id else Color.WHITE, FONT_REG, true))
	menu_body.add_child(log_box)
	var grid := GridContainer.new()
	grid.columns = 2
	for ph: String in QUICK_PHRASES:
		var t := ph
		grid.add_child(_button(t, "chat", Color(1, 1, 1, 0.08), Color.WHITE, func() -> void:
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


func _phone_profile() -> void:
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
		phone_body.add_child(_label(l, 16, Color.WHITE, FONT_REG, true))
	if bool(me.get("parentsToday", false)):
		phone_body.add_child(_label("Já pediste dinheiro aos pais hoje.", 14, Color(1, 1, 1, 0.6), FONT_REG, true))
	else:
		phone_body.add_child(_button("Pedir dinheiro aos pais", "person", ACCENT, INK, func() -> void: Net.action("parents")))
	if float(me.get("needs", {}).get("energy", 100)) < 30:
		phone_body.add_child(_button("Dormir no banco da paragem (grátis)", "sun", Color(1, 1, 1, 0.1), Color.WHITE, func() -> void:
			Net.action("sleep_rua")
			phone.visible = false))


func _phone_home() -> void:
	var homes: Array = Net.me.get("homes", [])
	phone_body.add_child(_label("A minha casa", 20, ACCENT, FONT_BOLD))
	if homes.is_empty():
		phone_body.add_child(_label("Ainda não tens casa. Vai à porta da Casa à venda ou de um prédio (Prédio Kuito, Prédio da Rua Cinco) e toca em Entrar para arrendar ou comprar.", 15, Color.WHITE, FONT_REG, true))
		var h: Dictionary = catalog.get("housing", {})
		for k: String in h:
			phone_body.add_child(_label("%s: renda %s Kz/dia · compra %s Kz" % ["Casa" if k == "casa" else "Apartamento", DemoHud._money(int(h[k].rentPerDay)), DemoHud._money(int(h[k].buy))], 14, Color(1, 1, 1, 0.7), FONT_REG, true))
	for hm: Dictionary in homes:
		var until := "comprada" if hm.tenure == "buy" else "renda paga até %s" % Time.get_datetime_string_from_unix_time(int(float(hm.paidUntil) / 1000.0) + 3600, true).substr(0, 16)
		phone_body.add_child(_label("%s — %s" % [hm.name, until], 16, Color.WHITE, FONT, true))
	phone_body.add_child(_label("Em casa: dorme de graça na tua cama e cozinha por 500 Kz.", 13, Color(1, 1, 1, 0.6), FONT_REG, true))


## Loja: carros (ficam estacionados à porta de casa; tocar no carro → Viajar).
func _phone_shop() -> void:
	phone_body.add_child(_label("Carros", 20, ACCENT, FONT_BOLD))
	var mine := str(Net.me.get("car", "")) if Net.me.get("car") != null else ""
	for c: Dictionary in catalog.get("cars", []):
		var box := VBoxContainer.new()
		box.add_child(_label("%s — %s Kz" % [c.name, DemoHud._money(int(c.price))], 16, Color.WHITE, FONT, true))
		var id := str(c.id)
		if id == mine:
			box.add_child(_label("É o teu carro.", 14, Color("8fe08a"), FONT_REG, true))
		else:
			box.add_child(_button("Comprar", "bag", ACCENT, INK, func() -> void: Net.action("buy_car", id)))
		phone_body.add_child(box)
	phone_body.add_child(_label("Precisas de casa para o estacionar. Viajar de carro custa só o combustível (300 Kz).", 13, Color(1, 1, 1, 0.6), FONT_REG, true))


func _phone_jobs() -> void:
	var my := str(Net.me.get("job", ""))
	var edu := int(Net.me.get("education", 0))
	phone_body.add_child(_label("Vagas no Huambo", 20, ACCENT, FONT_BOLD))
	for j: Dictionary in catalog.get("jobs", []):
		var box := VBoxContainer.new()
		box.add_child(_label("%s — %s Kz/turno" % [j.name, DemoHud._money(int(j.pay))], 16, Color.WHITE, FONT, true))
		var req := "sem estudos" if int(j.education) == 0 else "estudos nível %d" % int(j.education)
		for dk: String in j.get("docs", []):
			req += " · " + ("BI" if dk == "bi" else "registo criminal")
		box.add_child(_label("%s · %s" % [j.where, req], 13, Color(1, 1, 1, 0.65), FONT_REG, true))
		var id: String = j.id
		if id == my:
			box.add_child(_button("Despedir-me", "minus", Color(1, 1, 1, 0.1), Color.WHITE, func() -> void: Net.action("quit_job")))
		elif edu >= int(j.education):
			box.add_child(_button("Aceitar", "plus", ACCENT, INK, func() -> void: Net.action("take_job", id)))
		phone_body.add_child(box)
	phone_body.add_child(_label("Os 2 primeiros turnos do dia pagam por inteiro; depois cada turno paga menos (85%, 65%, 45%, 20%).", 13, Color(1, 1, 1, 0.6), FONT_REG, true))


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
		phone_body.add_child(_label("• " + l, 15, Color.WHITE, FONT_REG, true))


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
	return {"work": "A trabalhar", "study": "Na aula", "sleep": "A dormir", "sleep_rua": "A dormir na paragem", "sleep_casa": "A dormir em casa"}.get(kind, "Ocupado")


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
	var sb := DemoHud._pill(c, r)
	if border.a > 0.0:
		sb.border_color = border
		sb.set_border_width_all(3)
	return sb


func _style_round(b: Button, r: int, bg: Color) -> void:
	b.add_theme_stylebox_override("normal", _pill(bg, r))
	b.add_theme_stylebox_override("hover", _pill(bg.lightened(0.12), r))
	b.add_theme_stylebox_override("pressed", _pill(bg.lightened(0.18), r))
	b.add_theme_stylebox_override("hover_pressed", _pill(bg.lightened(0.18), r))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	b.focus_mode = Control.FOCUS_NONE
	for st: String in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color"]:
		b.add_theme_color_override(st, Color.WHITE)


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
	b.icon = DemoIcons.make(icon, Color.WHITE, 30)
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
	b.add_theme_stylebox_override("normal", _pill(bg, 23))
	b.add_theme_stylebox_override("hover", _pill(bg.lightened(0.12), 23))
	b.add_theme_stylebox_override("pressed", _pill(bg.darkened(0.1), 23))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(cb)
	return b
