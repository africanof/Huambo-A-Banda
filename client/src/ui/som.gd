class_name Som
extends RefCounted
## Som do jogo: música (semba de dia, kizomba à noite), ambiente (pássaros, grilos, chuva) e
## sons da interface. Os ficheiros estão em assets/audio (compostos por tools/audio/compor.py).
## Volumes nas Definições (Definicoes.vol_musica / vol_sons). No browser o som só começa depois
## do primeiro toque (regra dos browsers); o motor trata disso sozinho.

const DIR := "res://assets/audio/"
const UI := ["toque", "telemovel", "moedas", "sucesso", "erro", "sms", "porta"]
const MUSIC_DB := -9.0 ## a música fica por baixo de tudo
const AMB_DB := -12.0
const FADE := 1.6

static var _node: Node
static var _music: AudioStreamPlayer
static var _amb: AudioStreamPlayer
static var _sfx: Array[AudioStreamPlayer] = []
static var _next := 0
static var _music_name := ""
static var _amb_name := ""
static var _cache := {}
static var _last_toque := 0


static func _root() -> Node:
	if _node != null and is_instance_valid(_node):
		return _node
	var tree := Engine.get_main_loop() as SceneTree
	if tree == null:
		return null
	_node = Node.new()
	_node.name = "Som"
	_node.process_mode = Node.PROCESS_MODE_ALWAYS
	tree.root.add_child.call_deferred(_node)
	_music = AudioStreamPlayer.new()
	_amb = AudioStreamPlayer.new()
	_node.add_child(_music)
	_node.add_child(_amb)
	_sfx.clear()
	for i in 6:
		var p := AudioStreamPlayer.new()
		_node.add_child(p)
		_sfx.append(p)
	_music_name = ""
	_amb_name = ""
	return _node


static func _stream(n: String, loop: bool) -> AudioStream:
	if _cache.has(n):
		return _cache[n]
	var path := DIR + n + ".ogg"
	if not ResourceLoader.exists(path):
		return null
	var s: AudioStream = load(path)
	if s is AudioStreamOggVorbis:
		(s as AudioStreamOggVorbis).loop = loop
	_cache[n] = s
	return s


static func _lin(v: float) -> float:
	return -80.0 if v <= 0.001 else linear_to_db(v)


## Som curto da interface (toque, moedas, sucesso, erro, sms, porta, telemovel).
static func play(n: String) -> void:
	Definicoes.load_once()
	if Definicoes.vol_sons <= 0.001 or _root() == null:
		return
	# o «toque» dos botões não se acumula quando se carrega muito depressa
	if n == "toque":
		var now := Time.get_ticks_msec()
		if now - _last_toque < 60:
			return
		_last_toque = now
	var s := _stream(n, false)
	if s == null:
		return
	var p := _sfx[_next % _sfx.size()]
	_next += 1
	p.stream = s
	p.volume_db = _lin(Definicoes.vol_sons) - (6.0 if n == "toque" else 0.0)
	p.play()


## Música de fundo ("planalto", "noite" ou "" para calar), com passagem suave.
static func music(n: String) -> void:
	Definicoes.load_once()
	if _root() == null or n == _music_name:
		return
	_music_name = n
	_crossfade(_music, n, MUSIC_DB + _lin(Definicoes.vol_musica))


## Ambiente ("passaros", "grilos", "chuva" ou "").
static func ambient(n: String) -> void:
	Definicoes.load_once()
	if _root() == null or n == _amb_name:
		return
	_amb_name = n
	_crossfade(_amb, n, AMB_DB + _lin(Definicoes.vol_sons))


static func _crossfade(p: AudioStreamPlayer, n: String, target_db: float) -> void:
	if not p.is_inside_tree():
		# o nó ainda está a entrar na árvore: tenta no fotograma seguinte
		(Engine.get_main_loop() as SceneTree).process_frame.connect(func() -> void: _crossfade(p, n, target_db), CONNECT_ONE_SHOT)
		return
	var tw := p.create_tween()
	if p.playing:
		tw.tween_property(p, "volume_db", -60.0, FADE * 0.5)
	tw.tween_callback(func() -> void:
		var s := _stream(n, true) if n != "" else null
		if s == null or target_db <= -60.0:
			p.stop()
			return
		p.stream = s
		p.volume_db = -60.0
		p.play())
	if n != "" and target_db > -60.0:
		tw.tween_property(p, "volume_db", target_db, FADE)


## Depois de mudar o volume nas Definições.
static func apply_volumes() -> void:
	if _root() == null:
		return
	if _music.playing:
		_music.volume_db = MUSIC_DB + _lin(Definicoes.vol_musica)
	if Definicoes.vol_musica <= 0.001:
		_music.stop()
	elif not _music.playing and _music_name != "":
		var n := _music_name
		_music_name = ""
		music(n)
	if _amb.playing:
		_amb.volume_db = AMB_DB + _lin(Definicoes.vol_sons)
	if Definicoes.vol_sons <= 0.001:
		_amb.stop()
	elif not _amb.playing and _amb_name != "":
		var a := _amb_name
		_amb_name = ""
		ambient(a)
