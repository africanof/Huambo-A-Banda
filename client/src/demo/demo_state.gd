class_name DemoState
extends RefCounted
## Estado da demo partilhado entre a rua e o interior (personagem, hora, casa, carteira).
## Na integração final isto vem do servidor/Supabase (tabelas characters, houses, wallets).

const SAVE := "user://demo_casa.json"

static var cid := "homem"
static var top_hue: Variant = null
static var zoom := 0.42
static var time_min := 10.0 * 60.0
static var return_pos := Vector2.ZERO
static var return_scene := "res://src/demo/bairro_demo.tscn"
static var wallet := 350000 ## Kz (dinheiro de jogo)
static var furniture: Array = [] ## [{id, x, y, flip}]
static var _loaded := false


static func load_house() -> void:
	if _loaded:
		return
	_loaded = true
	if not FileAccess.file_exists(SAVE):
		return
	var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(SAVE))
	if typeof(d) == TYPE_DICTIONARY:
		wallet = int(d.get("wallet", wallet))
		furniture = d.get("furniture", [])


static func save_house() -> void:
	var f := FileAccess.open(SAVE, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify({"wallet": wallet, "furniture": furniture}))
