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
var phone_tab := "perfil"
var menu_panel := PanelContainer.new()
var menu_body := VBoxContainer.new()
var _context: Dictionary = {}
var _toast_until := 0
var _title: Label
var _right := VBoxContainer.new()
var _needs_panel: PanelContainer
var _portrait := TextureRect.new()
var money_label := Label.new()
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
	right.add_child(_round("pin", "Onde estou", func() -> void: ui_action.emit("centrar")))
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
	dh.add_child(_tab("home", "Casa", false, func() -> void: _open_phone("casa")))
	dh.add_child(_tab("map", "Mapa", false, func() -> void: ui_action.emit("mapa")))
	dh.add_child(_tab("hand", "Gestos", false, func() -> void: show_toast("Gestos: brevemente.", true)))
	dh.add_child(_tab("chat", "Falar", false, func() -> void: show_toast("Conversar: brevemente.", true)))

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
		p.add_theme_stylebox_override("panel", _pill(Color(0.1, 0.09, 0.09, 0.95), 22))
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
	var h := int(minutes / 60.0)
	var m := int(minutes) % 60
	var money := int(Net.me.get("money", 0))
	top_label.text = "%s %s · %02d:%02d" % ["☀" if h >= 6 and h < 18 else "☾", place_text.to_upper(), h, m]
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
		_open_phone(phone_tab)


func _open_phone(tab: String) -> void:
	phone_tab = tab
	menu_panel.visible = false
	phone.visible = true
	_rebuild_phone()


func _rebuild_phone() -> void:
	for c in phone_body.get_children():
		c.queue_free()
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 6)
	for t: Array in [["perfil", "Perfil"], ["casa", "Casa"], ["vagas", "Vagas"], ["ajuda", "Ajuda"]]:
		var tab_id: String = t[0]
		var active := tab_id == phone_tab
		tabs.add_child(_button(t[1], "", ACCENT if active else Color(1, 1, 1, 0.08), INK if active else Color.WHITE, func() -> void: _open_phone(tab_id)))
	phone_body.add_child(tabs)
	match phone_tab:
		"perfil": _phone_profile()
		"casa": _phone_home()
		"vagas": _phone_jobs()
		"ajuda": _phone_help()


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
