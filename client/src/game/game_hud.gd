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


func _ready() -> void:
	# --- barra de cima
	var top := PanelContainer.new()
	top.add_theme_stylebox_override("panel", _pill(BG, 22))
	top.position = Vector2(16, 14)
	add_child(top)
	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 14)
	top.add_child(hb)
	hb.add_child(_label("Huambo É A Banda", 20, ACCENT, FONT_BOLD))
	top_label.add_theme_font_override("font", FONT)
	top_label.add_theme_font_size_override("font_size", 18)
	hb.add_child(top_label)

	# --- necessidades
	var needs := PanelContainer.new()
	needs.add_theme_stylebox_override("panel", _pill(BG, 18))
	needs.position = Vector2(16, 70)
	add_child(needs)
	var nv := VBoxContainer.new()
	nv.add_theme_constant_override("separation", 6)
	needs.add_child(nv)
	for n: Array in NEEDS:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var l := _label(n[1], 14, Color.WHITE, FONT)
		l.custom_minimum_size = Vector2(64, 0)
		row.add_child(l)
		var bar := ProgressBar.new()
		bar.custom_minimum_size = Vector2(130, 12)
		bar.show_percentage = false
		bar.max_value = 100
		var fill := StyleBoxFlat.new()
		fill.bg_color = n[2]
		fill.set_corner_radius_all(6)
		var back := StyleBoxFlat.new()
		back.bg_color = Color(1, 1, 1, 0.12)
		back.set_corner_radius_all(6)
		bar.add_theme_stylebox_override("fill", fill)
		bar.add_theme_stylebox_override("background", back)
		bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(bar)
		need_bars[n[0]] = bar
		nv.add_child(row)

	# --- botões da direita
	var right := VBoxContainer.new()
	right.add_theme_constant_override("separation", 10)
	right.anchor_left = 1.0
	right.anchor_right = 1.0
	right.offset_left = -190
	right.offset_right = -16
	right.offset_top = 14
	add_child(right)
	right.add_child(_button("Telemóvel", "phone_icon", BG, Color.WHITE, func() -> void: _toggle_phone()))
	right.add_child(_button("Aproximar", "plus", BG, Color.WHITE, func() -> void: ui_action.emit("zoom_mais")))
	right.add_child(_button("Afastar", "minus", BG, Color.WHITE, func() -> void: ui_action.emit("zoom_menos")))
	right.add_child(_button("Sair", "door", BG, Color.WHITE, func() -> void: ui_action.emit("sair")))

	# --- ações do lugar (em baixo, ao centro)
	actions_box.add_theme_constant_override("separation", 10)
	actions_box.alignment = BoxContainer.ALIGNMENT_CENTER
	actions_box.anchor_left = 0.0
	actions_box.anchor_right = 1.0
	actions_box.anchor_top = 1.0
	actions_box.anchor_bottom = 1.0
	actions_box.offset_top = -92
	actions_box.offset_bottom = -36
	add_child(actions_box)

	# --- ação em curso
	busy_box.anchor_left = 0.5
	busy_box.anchor_right = 0.5
	busy_box.anchor_top = 1.0
	busy_box.anchor_bottom = 1.0
	busy_box.offset_left = -170
	busy_box.offset_right = 170
	busy_box.offset_top = -150
	busy_box.offset_bottom = -100
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

	Net.self_updated.connect(func(_me: Dictionary) -> void: refresh())
	Net.toast.connect(show_toast)
	refresh()


# ------------------------------------------------------------------ atualização

func set_clock(minutes: float) -> void:
	var h := int(minutes / 60.0)
	var m := int(minutes) % 60
	var money := int(Net.me.get("money", 0))
	top_label.text = "%s  %s · %02d:%02d   ·   %s Kz" % ["☀" if h >= 6 and h < 18 else "☾", place_text, h, m, DemoHud._money(money)]


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


func refresh() -> void:
	_busy_received = Time.get_ticks_msec()
	var n: Dictionary = Net.me.get("needs", {})
	for k: String in need_bars:
		(need_bars[k] as ProgressBar).value = float(n.get(k, 0))
	_rebuild_actions()
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
	if _context.is_empty():
		return
	var kind := str(_context.get("kind", ""))
	var my_job: Dictionary = _job(str(Net.me.get("job", "")))
	match kind:
		"food":
			actions_box.add_child(_button("Comer — %s" % _context.name, "bag", ACCENT, INK, func() -> void: _open_menu()))
		"sleep":
			actions_box.add_child(_button("Dormir (%s Kz)" % DemoHud._money(int(catalog.get("prices", {}).get("hotel", 0))), "sun", ACCENT, INK, func() -> void: Net.action("sleep")))
		"home":
			actions_box.add_child(_button("Entrar em casa (E)", "home", ACCENT, INK, func() -> void: ui_action.emit("entrar")))
		"work":
			var job_here := str(_context.get("job", ""))
			if my_job.get("place", "") == job_here:
				actions_box.add_child(_button("Trabalhar (%s Kz/turno)" % DemoHud._money(int(my_job.pay)), "bag", ACCENT, INK, func() -> void: Net.action("work")))
			else:
				var j := _job_by_place(job_here)
				if not j.is_empty():
					actions_box.add_child(_button("Vaga: %s" % j.name, "person", BG, Color.WHITE, func() -> void: _open_phone("vagas")))
			if job_here == "professor":
				actions_box.add_child(_button("Estudar (%s Kz)" % DemoHud._money(int(catalog.get("prices", {}).get("study", 0))), "plus", BG, Color.WHITE, func() -> void: Net.action("study")))


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
	for t: Array in [["perfil", "Perfil"], ["vagas", "Vagas"], ["ajuda", "Ajuda"]]:
		var tab_id: String = t[0]
		var active := tab_id == phone_tab
		tabs.add_child(_button(t[1], "", ACCENT if active else Color(1, 1, 1, 0.08), INK if active else Color.WHITE, func() -> void: _open_phone(tab_id)))
	phone_body.add_child(tabs)
	match phone_tab:
		"perfil": _phone_profile()
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


func _phone_jobs() -> void:
	var my := str(Net.me.get("job", ""))
	var edu := int(Net.me.get("education", 0))
	phone_body.add_child(_label("Vagas no Huambo", 20, ACCENT, FONT_BOLD))
	for j: Dictionary in catalog.get("jobs", []):
		var box := VBoxContainer.new()
		box.add_child(_label("%s — %s Kz/turno" % [j.name, DemoHud._money(int(j.pay))], 16, Color.WHITE, FONT, true))
		var req := "sem estudos" if int(j.education) == 0 else "estudos nível %d" % int(j.education)
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
		"Dorme no hotel para repor a energia. Sem dinheiro, dorme no banco da paragem.",
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
	return {"work": "A trabalhar", "study": "Na aula", "sleep": "A dormir", "sleep_rua": "A dormir na paragem"}.get(kind, "Ocupado")


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


func _pill(c: Color, r: int) -> StyleBoxFlat:
	return DemoHud._pill(c, r)


func _button(text: String, icon: String, bg: Color, fg: Color, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
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
