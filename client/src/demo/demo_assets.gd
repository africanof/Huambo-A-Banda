class_name DemoAssets
extends RefCounted
## Recursos gráficos HD do bairro de demonstração (gerados por IA e montados por
## tools/art/ai/build_assets.py). Lê o manifest e cria texturas, SpriteFrames, etc.

const DIR := "res://assets/demo/"

static var _manifest: Dictionary = {}
static var _tex := {}


static func manifest() -> Dictionary:
	if _manifest.is_empty():
		_manifest = JSON.parse_string(FileAccess.get_file_as_string(DIR + "manifest.json"))
	return _manifest


static func tex(file: String) -> Texture2D:
	if not _tex.has(file):
		_tex[file] = load(DIR + file)
	return _tex[file]


static func object(id: String) -> Dictionary:
	var o: Dictionary = manifest().objects.get(id, {})
	return o if not o.is_empty() else _kit_objects.get(id, {})


## Objetos dos kits de bairro (pacotes descarregados sob pedido, ver Packs).
static var _kit_objects := {}
static var _kits_loaded := {}

const KITS_DIR := "res://assets/kits/"


static func kit_available(kit: String) -> bool:
	return FileAccess.file_exists(KITS_DIR + kit + "/manifest.json")


## Junta os objetos de um kit ao catálogo (o pacote já tem de estar carregado).
static func load_kit(kit: String) -> bool:
	if _kits_loaded.has(kit):
		return true
	if not kit_available(kit):
		return false
	var m: Variant = JSON.parse_string(FileAccess.get_file_as_string(KITS_DIR + kit + "/manifest.json"))
	if typeof(m) != TYPE_DICTIONARY:
		return false
	_kit_objects.merge(m.objects, true)
	_kits_loaded[kit] = true
	return true


static func texture_of(id: String) -> Texture2D:
	var o := object(id)
	if o.has("path"):
		if not _tex.has(o.path):
			_tex[o.path] = load(o.path)
		return _tex[o.path]
	return tex(id + ".png")


## Arte deste objeto vista do ângulo r (0–3); se não houver, a de frente.
static func angle_id(id: String, r: int) -> String:
	if r == 0:
		return id
	var a := "%s@%d" % [id, r]
	return a if not object(a).is_empty() else id


## Objetos com escrita (placas, anúncios, letreiros, bandeiras, edifícios com nome): nunca espelhar.
const NO_MIRROR := ["sign", "billboard", "bairro", "bandeira", "atm", "unitel", "movicel", "kiosk", "paragem", "stop", "facade", "stall", "banca"]


## Pode-se mostrar espelhada (arte de IA sem letras) quando falta a arte desse ângulo?
## Espelhar um objeto isométrico troca os dois lados da base — é o que a vista rodada 90° pede.
static func mirrorable(id: String) -> bool:
	var o := object(id)
	match str(o.get("category", "")):
		"room", "furniture":
			return true
		"building":
			return str(o.get("venue", "")) == "casa" # casas de família, sem letreiro
		"prop", "roadside":
			for w: String in NO_MIRROR:
				if w in id:
					return false
			return true
	return false


## Tem arte para ver este objeto no ângulo r (própria ou espelhada)?
static func has_view(id: String, r: int) -> bool:
	return r == 0 or angle_id(id, r) != id or (r % 2 == 1 and mirrorable(id))


## Sprite para o ângulo r: a arte desse lado se existir; senão, nos ângulos 90°/270°,
## a arte original espelhada (se não tiver letras); senão a original.
static func make_view_sprite(id: String, r: int) -> Sprite2D:
	var aid := angle_id(id, r)
	if aid != id:
		return make_sprite(aid)
	var s := make_sprite(id)
	if r % 2 == 1 and s.texture and mirrorable(id):
		var o := object(id)
		s.flip_h = true
		s.offset.x = -(s.texture.get_width() - float(o.anchor[0]))
	return s


## Sprite de um objeto com a âncora (base mais à frente) na origem do nó.
static func make_sprite(id: String) -> Sprite2D:
	var o := object(id)
	var s := Sprite2D.new()
	s.texture = texture_of(id)
	s.centered = false
	s.offset = -Vector2(o.anchor[0], o.anchor[1])
	# kits de bairro: textura no tamanho original, ampliada ao desenhar (menos memória no telemóvel)
	var k := float(o.get("scale", 1.0))
	if k != 1.0:
		s.scale = Vector2(k, k)
	return s


static func shadow_texture(id: String) -> Texture2D:
	var path := DIR + id + "_sombra.png"
	return load(path) if ResourceLoader.exists(path) else null


## SpriteFrames de uma personagem: idle_down, walk_down, idle_up, walk_up.
static func character_frames(cid: String) -> SpriteFrames:
	var c: Dictionary = manifest().characters[cid]
	var fw := int(c.frame_size[0])
	var fh := int(c.frame_size[1])
	var sf := SpriteFrames.new()
	sf.remove_animation("default")
	for d: String in ["down", "up", "front", "side", "back"]:
		if not c.anims.has(d):
			continue
		var a: Dictionary = c.anims[d]
		var sheet := tex(a.file)
		sf.add_animation("idle_" + d)
		sf.set_animation_speed("idle_" + d, 1.0)
		sf.add_frame("idle_" + d, _region(sheet, 0, fw, fh))
		sf.add_animation("walk_" + d)
		sf.set_animation_speed("walk_" + d, 11.0)
		for i in range(int(a.walk_from), int(a.frames)):
			sf.add_frame("walk_" + d, _region(sheet, i, fw, fh))
	return sf


static func _region(sheet: Texture2D, i: int, fw: int, fh: int) -> AtlasTexture:
	var at := AtlasTexture.new()
	at.atlas = sheet
	at.region = Rect2(i * fw, 0, fw, fh)
	return at
