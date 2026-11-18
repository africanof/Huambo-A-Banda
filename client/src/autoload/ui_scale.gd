extends Node
## Escala da interface conforme o ecrã real do aparelho.
##
## O projeto foi desenhado a 1280x720. Num telemóvel (sobretudo na vertical) isso
## encolhia tudo para ~1/3. Aqui escolhe-se o tamanho lógico para que o lado curto
## do ecrã tenha entre 520 e 720 unidades, conforme o tamanho físico (px CSS / dp):
## no PC fica igual ao desenho original; no telemóvel letras e botões ficam legíveis.

const SHORT_MIN := 520.0
const SHORT_MAX := 720.0
const DENSITY := 1.25 ## unidades lógicas por px CSS (ou dp)

## true quando o ecrã está na vertical (a interface pode reorganizar-se)
var portrait := false
signal changed


func _ready() -> void:
	get_window().size_changed.connect(_apply)
	_apply()


func _device_ratio() -> float:
	if OS.has_feature("web"):
		return maxf(1.0, DisplayServer.screen_get_scale())
	if OS.has_feature("mobile"):
		return maxf(1.0, DisplayServer.screen_get_dpi() / 160.0)
	return 1.0


func logical_size_for(px: Vector2, ratio: float) -> Vector2i:
	var short_px := minf(px.x, px.y)
	if short_px <= 0.0:
		return Vector2i(1280, 720)
	var short_logical := clampf(short_px / ratio * DENSITY, SHORT_MIN, SHORT_MAX)
	var k := short_logical / short_px
	return Vector2i(roundi(px.x * k), roundi(px.y * k))


func _apply() -> void:
	var win := get_window()
	var px := Vector2(win.size)
	win.content_scale_size = logical_size_for(px, _device_ratio())
	var p := px.y > px.x
	if p != portrait:
		portrait = p
	changed.emit()
