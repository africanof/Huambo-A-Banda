class_name BirthLottery
extends CanvasLayer
## 🎲 A lotaria da vida (como no Vida na Banda): uma roleta passa pelas famílias possíveis,
## abranda e pára na tua; depois diz quem são os teus pais, de onde é a família, onde
## cresceste e com quanto começas. O botão leva-te para o teu bairro.

signal done

const FONT := preload("res://assets/fonts/Inter-SemiBold.otf")
const FONT_BOLD := preload("res://assets/fonts/Inter-Bold.otf")
const FONT_REG := preload("res://assets/fonts/Inter-Regular.otf")
const ACCENT := Color(0.95, 0.72, 0.18)
## família → [título, frase, casa (arte do jogo), cor]
const CLASSES := {
	"humilde": ["Luta do Bairro", "A vida não vai ser fácil… mas no Huambo ninguém desiste.", "f_casa6", Color("c0703f")],
	"media": ["Filho/a da Classe Média", "Nem rico nem pobre: estudo, trabalho e um bocadinho de sorte.", "f_predio", Color("4d9be0")],
	"rica": ["Família Rica", "Nasceste com a vida bem encaminhada. Agora é não estragar.", "casa_colonial", Color("e3b341")],
	"muito_rica": ["Elite do Planalto", "Nasceste com a vida feita. O Huambo é teu… se souberes gerir.", "governo", Color("ffcb00")],
}
const ORDER := ["humilde", "media", "rica", "muito_rica"]

var birth: Dictionary = {}
var _card := PanelContainer.new()
var _card_style := StyleBoxFlat.new()
var _house := TextureRect.new()
var _title := Label.new()
var _text := Label.new()
var _go := Button.new()


func _ready() -> void:
	layer = 70
	var dim := ColorRect.new()
	dim.color = Color(0.03, 0.02, 0.02, 0.88)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 14)
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	center.add_child(v)
	v.add_child(_lbl("A lotaria da vida", 30, ACCENT, FONT_BOLD))
	v.add_child(_lbl("Ninguém escolhe onde nasce…", 16, Color(1, 1, 1, 0.75), FONT_REG))
	_card_style.set_corner_radius_all(26)
	_card_style.set_content_margin_all(18)
	_card_style.set_border_width_all(4)
	_card_style.border_color = Color(1, 1, 1, 0.85)
	_card.add_theme_stylebox_override("panel", _card_style)
	_card.custom_minimum_size = Vector2(300, 260)
	_card.pivot_offset = Vector2(150, 130)
	var cv := VBoxContainer.new()
	cv.alignment = BoxContainer.ALIGNMENT_CENTER
	_card.add_child(cv)
	_house.custom_minimum_size = Vector2(260, 180)
	_house.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_house.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	cv.add_child(_house)
	_title.add_theme_font_override("font", FONT_BOLD)
	_title.add_theme_font_size_override("font_size", 22)
	_title.add_theme_color_override("font_outline_color", Color.BLACK)
	_title.add_theme_constant_override("outline_size", 6)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	cv.add_child(_title)
	var cc := CenterContainer.new()
	cc.add_child(_card)
	v.add_child(cc)
	_text.add_theme_font_override("font", FONT_REG)
	_text.add_theme_font_size_override("font_size", 16)
	_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_text.custom_minimum_size = Vector2(minf(440, get_viewport().get_visible_rect().size.x - 40), 0)
	_text.modulate.a = 0.0
	v.add_child(_text)
	_go.text = "Começar a vida"
	_go.custom_minimum_size = Vector2(260, 54)
	_go.add_theme_font_override("font", FONT_BOLD)
	_go.add_theme_font_size_override("font_size", 19)
	var gs := StyleBoxFlat.new()
	gs.bg_color = ACCENT
	gs.set_corner_radius_all(26)
	for s: String in ["normal", "hover", "pressed"]:
		_go.add_theme_stylebox_override(s, gs)
	for s: String in ["font_color", "font_hover_color", "font_pressed_color"]:
		_go.add_theme_color_override(s, Color("2a1d10"))
	_go.modulate.a = 0.0
	_go.disabled = true
	_go.pressed.connect(_finish)
	var gc := CenterContainer.new()
	gc.add_child(_go)
	v.add_child(gc)
	_spin()


func _paint(classe: String) -> void:
	var c: Array = CLASSES.get(classe, CLASSES.media)
	_card_style.bg_color = (c[3] as Color).darkened(0.35)
	_title.text = c[0]
	var o := DemoAssets.object(c[2])
	if not o.is_empty():
		_house.texture = DemoAssets.texture_of(c[2])


## A roleta: começa rápida e vai abrandando até parar na tua família.
func _spin() -> void:
	var fim := str(birth.get("classe", "media"))
	var step := 0.07
	var total := 0.0
	var i := 0
	while total < 2.6:
		_paint(ORDER[i % ORDER.size()])
		i += 1
		var tw := create_tween()
		_card.scale = Vector2(0.94, 0.94)
		tw.tween_property(_card, "scale", Vector2.ONE, step * 0.8)
		await get_tree().create_timer(step).timeout
		total += step
		step *= 1.13
	_paint(fim)
	var tw2 := create_tween()
	_card.scale = Vector2(1.18, 1.18)
	tw2.tween_property(_card, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	var c: Array = CLASSES.get(fim, CLASSES.media)
	var prov := str(birth.get("provincia", "Huambo"))
	_text.text = "%s\n\nNasceste filho/a de %s.%s Cresceste em %s.\nComeças com %s Kz." % [
		c[1], birth.get("pais", ""), "" if prov == "Huambo" else " A tua família é de %s." % prov,
		birth.get("bairroNome", birth.get("bairro", "")), DemoHud._money(int(birth.get("kumbu", 0)))]
	var tw3 := create_tween()
	tw3.tween_interval(0.45)
	tw3.tween_property(_text, "modulate:a", 1.0, 0.4)
	tw3.tween_property(_go, "modulate:a", 1.0, 0.3)
	await tw3.finished
	_go.disabled = false
	if _auto():
		await get_tree().create_timer(0.6).timeout
		_finish()


func _finish() -> void:
	if _go.disabled and not _auto():
		return
	_go.disabled = true
	done.emit()
	var tw := create_tween()
	tw.tween_property(get_child(0), "modulate:a", 0.0, 0.3)
	await tw.finished
	queue_free()


func _lbl(t: String, fs: int, col: Color, font: Font) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_font_override("font", font)
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", col)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return l


## Autoteste: fecha sozinho (AppConfig só existe no jogo; aqui via árvore para compilar em testes).
func _auto() -> bool:
	var ac := get_tree().root.get_node_or_null("AppConfig")
	return ac != null and ac.has_flag("autotest")
