class_name Definicoes
extends RefCounted
## Definições do jogador, guardadas no aparelho: tamanho do texto, nomes por cima das pessoas e efeitos.

const FILE := "user://definicoes.cfg"
const TEXT_SIZES := [0.85, 1.0, 1.2]
static var text_scale := 1.0 ## tamanho do texto e dos botões
static var show_names := true ## nomes por cima das pessoas
static var effects := true ## chuva e outros efeitos (desligar ajuda telemóveis fracos)
static var vol_musica := 0.6 ## 0 = sem música
static var vol_sons := 0.8 ## sons da interface e do ambiente (0 = sem sons)
static var _loaded := false


static func load_once() -> void:
	if _loaded:
		return
	_loaded = true
	var cf := ConfigFile.new()
	if cf.load(FILE) != OK:
		return
	var t := float(cf.get_value("ui", "text_scale", 1.0))
	text_scale = t if TEXT_SIZES.has(t) else 1.0
	show_names = bool(cf.get_value("ui", "show_names", true))
	effects = bool(cf.get_value("ui", "effects", true))
	vol_musica = clampf(float(cf.get_value("som", "musica", 0.6)), 0.0, 1.0)
	vol_sons = clampf(float(cf.get_value("som", "sons", 0.8)), 0.0, 1.0)


## Muda uma definição, guarda-a e aplica-a já (ecrã e personagens).
static func set_value(tree: SceneTree, key: String, value: Variant) -> void:
	load_once()
	match key:
		"text_scale":
			text_scale = float(value) if TEXT_SIZES.has(float(value)) else 1.0
		"show_names":
			show_names = bool(value)
		"effects":
			effects = bool(value)
		"vol_musica":
			vol_musica = clampf(float(value), 0.0, 1.0)
		"vol_sons":
			vol_sons = clampf(float(value), 0.0, 1.0)
	var cf := ConfigFile.new()
	cf.set_value("ui", "text_scale", text_scale)
	cf.set_value("ui", "show_names", show_names)
	cf.set_value("ui", "effects", effects)
	cf.set_value("som", "musica", vol_musica)
	cf.set_value("som", "sons", vol_sons)
	cf.save(FILE)
	var ui := tree.root.get_node_or_null("UiScale")
	if ui:
		ui.call("_apply")
	tree.call_group("definicoes", "_on_definicoes")
	if key.begins_with("vol_"):
		Som.apply_volumes()
