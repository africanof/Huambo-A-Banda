class_name Moradores
extends Node
## Moradores: gente do bairro que não é jogador (só neste telemóvel, para a cidade nunca estar vazia).
## Saem de uma porta (cantina, mercado, escola…), atravessam o bairro pelo caminho e entram noutra.
## Às vezes param um bocado; quando passas perto, cumprimentam. Mais gente de dia, menos à noite
## e à chuva, e menos quando já há muitos jogadores reais no bairro.
## Usam a arte das personagens do jogo (com roupa de cores variadas); não têm nome por cima.

const GREETINGS := [
	"Bom dia, mano!", "Boa tarde!", "Boa noite, kamba.", "Tá bom?", "Wakolapo?", "Então, tudo fixe?",
	"Bom dia, mamã!", "Olá, vizinho!", "Hoje está frio no planalto…", "Vais ao mercado?", "Ndakolapo!",
]
const MAX := 22

var _world: Node
var _view: BairroView
var _find: Callable ## (from: Vector2, to: Vector2) -> Array[Vector2]
var _npcs: Array[Dictionary] = [] ## {id, c, path, wait, greeted, fade, leaving}
var _next_id := 0
var _doors: Array[Vector2] = []
var _spawn_t := 0.0
var _rng := RandomNumberGenerator.new()
var night := 0.0 ## 0 = dia, 1 = noite (o mundo diz)
var raining := false
var players := 0 ## jogadores reais no bairro


func setup(world: Node, view: BairroView, find_path: Callable) -> void:
	_world = world
	_find = find_path
	_rng.randomize()
	set_view(view)


## A vista foi reconstruída (rodar): as pessoas mudam para a nova.
func set_view(view: BairroView) -> void:
	_view = view
	_doors.clear()
	for p: Dictionary in view.places:
		if str(p.get("kind", "")) == "door" or str(p.get("kind", "")) == "portal":
			_doors.append(Vector2(p.at[0], p.at[1]))
	for n: Dictionary in _npcs:
		var c: DemoCharacter = n.c
		if is_instance_valid(c):
			c.reparent(view.objects, false)
			c.obstacles = view.obstacles
			c.position = Iso.to_screen(c.world_pos)


## id estável (negativo, para não chocar com os jogadores) → personagem; para as vistas 3D.
func characters() -> Dictionary:
	var out := {}
	for n: Dictionary in _npcs:
		if is_instance_valid(n.c):
			out[-1000 - int(n.id)] = n.c
	return out


func _want() -> int:
	if _doors.size() < 2:
		return 0
	var base := clampi(int(_doors.size() * 1.3), 8, MAX)
	var k := lerpf(1.0, 0.3, night) * (0.45 if raining else 1.0)
	return maxi(0, int(base * k) - players)


func _process(delta: float) -> void:
	if _view == null or _find.is_null():
		return
	var me: DemoCharacter = _world.local_char if _world and "local_char" in _world else null
	# aparecer aos poucos (não todos de uma vez)
	_spawn_t -= delta
	if _spawn_t <= 0.0 and _npcs.size() < _want() and me != null:
		_spawn_t = _rng.randf_range(0.4, 1.4)
		_spawn()
	for i in range(_npcs.size() - 1, -1, -1):
		var n: Dictionary = _npcs[i]
		var c: DemoCharacter = n.c
		if not is_instance_valid(c):
			_npcs.remove_at(i)
			continue
		# a entrar/sair pela porta: aparece e desaparece suavemente
		if n.fade != 0.0:
			c.modulate.a = clampf(c.modulate.a + n.fade * delta * 2.0, 0.0, 1.0)
			if n.fade < 0.0 and c.modulate.a <= 0.0:
				c.queue_free()
				_npcs.remove_at(i)
				continue
			if n.fade > 0.0 and c.modulate.a >= 1.0:
				n.fade = 0.0
		if float(n.wait) > 0.0:
			n.wait = float(n.wait) - delta
			c.step(Vector2.ZERO, delta)
		elif (n.path as Array).is_empty():
			if not n.leaving:
				n.leaving = true
				n.fade = -1.0 # chegou à porta: entra
			c.step(Vector2.ZERO, delta)
		else:
			var to: Vector2 = (n.path as Array)[0]
			var d := to - c.world_pos
			if d.length() < 0.25:
				(n.path as Array).pop_front()
				if _rng.randf() < 0.12 and not (n.path as Array).is_empty():
					n.wait = _rng.randf_range(1.5, 4.5) # para um bocado (a olhar, a falar ao telefone…)
			else:
				var before := c.world_pos
				c.step(d.normalized(), delta, d.length())
				if c.world_pos.distance_to(before) < 0.0001:
					n.stuck = float(n.get("stuck", 0.0)) + delta
					if float(n.stuck) > 1.5:
						n.path = [] # encalhou: desiste e entra na porta mais perto
				else:
					n.stuck = 0.0
		# cumprimentar quem passa perto
		if me != null and c.modulate.a > 0.9 and not n.greeted and c.world_pos.distance_to(me.world_pos) < 2.6:
			n.greeted = true
			if _rng.randf() < 0.45:
				c.say(GREETINGS[_rng.randi() % GREETINGS.size()], 3.5)


func _spawn() -> void:
	var a: Vector2 = _doors[_rng.randi() % _doors.size()]
	var b: Vector2 = _doors[_rng.randi() % _doors.size()]
	if a.distance_to(b) < 6.0:
		return
	var path: Array = _find.call(a, b)
	if path.size() < 2:
		return
	var c := DemoCharacter.new()
	c.cid = "mulher" if _rng.randf() < 0.5 else "homem"
	c.world_pos = path[0]
	c.obstacles = _view.obstacles
	c.bounds = Rect2(Vector2.ZERO, _view.size)
	c.fixed_speed = _rng.randf_range(1.2, 1.9) # andar calmo de quem vai à sua vida
	_view.objects.add_child(c)
	c.tag.visible = false
	c.tag.text = ""
	c.set_top_hue(_rng.randf())
	c.modulate.a = 0.0
	c.position = Iso.to_screen(c.world_pos)
	_next_id += 1
	_npcs.append({"id": _next_id, "c": c, "path": path.slice(1), "wait": 0.0, "greeted": false, "fade": 1.0, "leaving": false})


func clear() -> void:
	for n: Dictionary in _npcs:
		if is_instance_valid(n.c):
			(n.c as DemoCharacter).queue_free()
	_npcs.clear()
