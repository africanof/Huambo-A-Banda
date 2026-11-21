class_name DemoHud
extends CanvasLayer
## Interface da rua: relógio, carteira, botões arredondados com ícones vetoriais e
## o botão contextual "Entrar em casa" (como os menus do Vida na Banda, mas HD).

signal action(what: String)

const FONT := preload("res://assets/fonts/Inter-SemiBold.otf")
const FONT_BOLD := preload("res://assets/fonts/Inter-Bold.otf")

var clock := Label.new()
var door_btn: Button
## Botões do painel direito: [id, texto, ícone]. O jogo em rede usa um conjunto próprio.
var button_specs: Array = [["personagem", "Trocar personagem", "person"], ["cor", "Cor da roupa", "shirt"],
	["tempo", "Dia / Noite", "sun"], ["zoom_mais", "Aproximar", "plus"], ["zoom_menos", "Afastar", "minus"]]
var place_text := "Cidade Baixa"


func _ready() -> void:
	var top := PanelContainer.new()
	top.add_theme_stylebox_override("panel", _pill(Color(0.08, 0.07, 0.07, 0.82), 22))
	top.position = Vector2(16, 14)
	add_child(top)
	var hb := HBoxContainer.new()
	hb.add_theme_constant_override("separation", 14)
	top.add_child(hb)
	var title := Label.new()
	title.text = "Huambo É A Banda"
	title.add_theme_font_override("font", FONT_BOLD)
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", Color("ffd166"))
	hb.add_child(title)
	clock.add_theme_font_override("font", FONT)
	clock.add_theme_font_size_override("font_size", 18)
	clock.add_theme_color_override("font_color", Tema.TEXT)
	hb.add_child(clock)

	var right := VBoxContainer.new()
	right.add_theme_constant_override("separation", 10)
	right.anchor_left = 1.0
	right.anchor_right = 1.0
	right.offset_left = -210
	right.offset_right = -16
	right.offset_top = 14
	add_child(right)
	for b: Array in button_specs:
		right.add_child(_button(b[0], b[1], b[2], Color(0.08, 0.07, 0.07, 0.82), Tema.TEXT))

	door_btn = _button("entrar", "Entrar em casa  (E)", "home", Tema.GOLD, Tema.INK)
	door_btn.anchor_left = 0.5
	door_btn.anchor_right = 0.5
	door_btn.anchor_top = 1.0
	door_btn.anchor_bottom = 1.0
	door_btn.offset_left = -130
	door_btn.offset_right = 130
	door_btn.offset_top = -86
	door_btn.offset_bottom = -30
	door_btn.visible = false
	add_child(door_btn)

	var hint := Label.new()
	hint.text = "Setas/WASD para andar · Shift corre · clica no chão · roda do rato = zoom"
	hint.add_theme_font_override("font", FONT)
	hint.add_theme_font_size_override("font_size", 14)
	hint.add_theme_color_override("font_color", Tema.TEXT_MUTED)
	hint.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	hint.add_theme_constant_override("outline_size", 4)
	hint.anchor_top = 1.0
	hint.anchor_bottom = 1.0
	hint.offset_left = 18
	hint.offset_top = -30
	add_child(hint)


func set_clock(minutes: float) -> void:
	var h := int(minutes / 60.0)
	var m := int(minutes) % 60
	var icon := "Dia" if h >= 6 and h < 18 else "Noite"
	clock.text = "%s  %s · %02d:%02d   ·   %s Kz" % [icon, place_text, h, m, _money(DemoState.wallet)]


func set_door_visible(v: bool) -> void:
	door_btn.visible = v


static func _money(v: int) -> String:
	var s := str(v)
	var out := ""
	while s.length() > 3:
		out = "." + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return s + out


static func _pill(c: Color, r: int) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = c
	sb.set_corner_radius_all(r)
	sb.content_margin_left = 16
	sb.content_margin_right = 16
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	sb.shadow_color = Color(0, 0, 0, 0.25)
	sb.shadow_size = 6
	sb.shadow_offset = Vector2(0, 3)
	return sb


func _button(id: String, text: String, icon: String, bg: Color, fg: Color) -> Button:
	var b := Button.new()
	b.text = text
	b.icon = DemoIcons.make(icon, fg)
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.custom_minimum_size = Vector2(0, 46)
	b.add_theme_font_override("font", FONT)
	b.add_theme_font_size_override("font_size", 16)
	b.add_theme_color_override("font_color", fg)
	b.add_theme_color_override("font_hover_color", fg)
	b.add_theme_color_override("font_pressed_color", fg)
	b.add_theme_constant_override("h_separation", 10)
	var normal := _pill(bg, 23)
	var hover := _pill(bg.lightened(0.12), 23)
	b.add_theme_stylebox_override("normal", normal)
	b.add_theme_stylebox_override("hover", hover)
	b.add_theme_stylebox_override("pressed", _pill(bg.darkened(0.1), 23))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(func() -> void: action.emit(id))
	return b
