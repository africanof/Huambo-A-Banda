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
	return manifest().objects.get(id, {})


## Sprite de um objeto com a âncora (base mais à frente) na origem do nó.
static func make_sprite(id: String) -> Sprite2D:
	var o := object(id)
	var s := Sprite2D.new()
	s.texture = tex(id + ".png")
	s.centered = false
	s.offset = -Vector2(o.anchor[0], o.anchor[1])
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
	for d: String in ["down", "up"]:
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
