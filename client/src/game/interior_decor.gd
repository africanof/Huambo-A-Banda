class_name InteriorDecor
extends Node2D
## O que se vê lá dentro de um edifício, como no Vida na Banda:
## - um marcador a saltitar por cima de cada sítio onde se faz alguma coisa (balcão, cama, quadro…),
##   com ícone e nome; tocar leva-te lá e abre só o que se faz ali;
## - o pessoal da casa no seu posto (a tia da cantina, a enfermeira, o bancário…), que te cumprimenta;
## - o nome da divisão pintado no chão, numa plaquinha escura.
## Só apresentação: as ações continuam a ser pedidas ao servidor (autoritativo).

const FONT := preload("res://assets/fonts/Inter-SemiBold.otf")
const FONT_BOLD := preload("res://assets/fonts/Inter-Bold.otf")

## Nome da divisão por tipo de lugar.
const ROOM_NAME := {
	"escola": "Sala de aula", "saude": "Consultório", "cantina": "Sala de refeições", "banco": "Balcões",
	"igreja": "Nave", "discoteca": "Pista", "hotel": "Receção", "casa": "Sala", "apartamentos": "Sala",
	"mercado": "Bancas", "farmacia": "Balcão", "administracao": "Atendimento", "esquadra": "Atendimento",
	"padaria": "Loja", "churrasqueira": "Sala de refeições", "correios": "Balcões", "tribunal": "Sala de audiências",
	"governo": "Gabinete", "loja_telecom": "Loja", "universidade": "Anfiteatro",
}

## Ícone do marcador por tipo de estação.
const KIND_ICON := {
	"food": "bowl", "home_eat": "bowl", "sleep": "sun", "home_sleep": "sun", "study": "plus",
	"bank": "bag", "service": "person", "work": "bag", "exit": "door",
}

## Pessoal da casa: quem está no posto de cada estação, conforme o sítio, e o que diz.
## [nome, modelo (0 homem, 1 mulher), cor da roupa (0..360), falas]
const STAFF := {
	"food": {
		"cantina": ["Tia da cantina", 1, 20, ["Bom dia, filho! Hoje há funje com calulu.", "Senta, que a comida já sai!", "Quer gasosa para acompanhar?"]],
		"churrasqueira": ["Churrasqueiro", 0, 0, ["O frango está no ponto!", "Mais um bocadinho de jindungo?"]],
		"padaria": ["Padeira", 1, 40, ["Pão quentinho, acabou de sair!", "Quantos pães vai levar?"]],
		"discoteca": ["Barman", 0, 270, ["O que vai ser hoje?", "A pista está quente!"]],
		"hotel": ["Empregado de mesa", 0, 210, ["Faça favor, a mesa está pronta."]],
		"_": ["Empregada", 1, 30, ["Bem-vindo! O que vai comer?"]],
	},
	"bank": {"_": ["Bancária", 1, 220, ["Bom dia. Depósito ou levantamento?", "Próximo, por favor!"]]},
	"service": {
		"saude": ["Enfermeira", 1, 190, ["Bom dia. Tem cartão de consulta?", "Sente-se, o doutor já o atende."]],
		"farmacia": ["Farmacêutica", 1, 150, ["Traz a receita?", "Tome de 8 em 8 horas, está bem?"]],
		"correios": ["Funcionário dos Correios", 0, 50, ["Encomenda ou carta?"]],
		"esquadra": ["Agente", 0, 230, ["Boa tarde, cidadão. Em que posso ajudar?"]],
		"administracao": ["Funcionária", 1, 300, ["Traga o BI e duas fotografias.", "Senha número…?"]],
		"governo": ["Secretária", 1, 330, ["Tem audiência marcada?"]],
		"tribunal": ["Oficial de justiça", 0, 0, ["Silêncio na sala, por favor."]],
		"loja_telecom": ["Vendedora", 1, 0, ["Saldo, internet ou cartão novo?"]],
		"igreja": ["Padre", 0, 0, ["A paz do Senhor esteja convosco."]],
		"_": ["Atendente", 1, 100, ["Bom dia, em que posso ajudar?"]],
	},
	"sleep": {"hotel": ["Rececionista", 1, 260, ["Bem-vindo ao hotel! Quer um quarto?"]]},
	"study": {"escola": ["Professora", 1, 120, ["Bom dia, turma! Abram os cadernos.", "Quem fez o trabalho de casa?"]], "universidade": ["Professor Doutor", 0, 220, ["Bom dia, caros estudantes. Hoje há matéria nova.", "O exame é na próxima semana!"]]},
}

var _interior: Dictionary = {}
var _markers: Array = [] # [{node, base: Vector2, place}]
var _staff: Array = [] # [{c: DemoCharacter, lines: Array, said: float, bubble: PanelContainer}]
var _t := 0.0


func _ready() -> void:
	z_index = 60


func clear() -> void:
	for m: Dictionary in _markers:
		if is_instance_valid(m.node):
			m.node.queue_free()
	_markers.clear()
	for s: Dictionary in _staff:
		if is_instance_valid(s.c):
			s.c.queue_free()
	_staff.clear()
	for c in get_children():
		c.queue_free()
	_interior = {}


func build(view: BairroView, interior: Dictionary) -> void:
	clear()
	_interior = interior
	var r: Array = interior.rect
	var rect := Rect2(r[0], r[1], r[2], r[3])
	var venue := str(interior.get("venue", ""))
	_street_around(view, rect, interior)
	# nome da divisão no chão, mais para a frente da sala
	var front := Iso.front_corner(rect)
	var spot := rect.get_center().lerp(front, 0.55)
	var plate := _pill(str(ROOM_NAME.get(venue, "Sala")).to_upper(), null, Color(0.08, 0.06, 0.05, 0.55), Color(1, 1, 1, 0.93), 18)
	plate.position = Iso.to_screen(spot) - plate.size / 2.0
	plate.z_index = -8 # fica no chão, por cima da sala (por baixo das pessoas e da mobília)
	plate.z_as_relative = false
	add_child(plate)
	# estações
	for p: Dictionary in view.places:
		if str(p.get("interior", "")) != str(interior.id):
			continue
		var kind := str(p.kind)
		var label := "Sair" if kind == "exit" else str(p.name)
		var col := Tema.GOLD if kind != "exit" else Tema.PANEL
		var fg := Tema.INK if kind != "exit" else Tema.TEXT
		var node := _pill(label, DemoIcons.make(str(KIND_ICON.get(kind, "target")), fg, 22), col, fg, 20)
		var base := Iso.to_screen(Vector2(p.at[0], p.at[1])) + Vector2(-node.size.x / 2.0, -170.0)
		node.position = base
		add_child(node)
		_markers.append({"node": node, "base": base, "place": p})
		_add_staff(view, rect, p, venue)


const T_ASFALTO := preload("res://assets/demo/chao_asfalto.png")
const T_CALCADA := preload("res://assets/demo/chao_calcada.png")


## Como no Vida na Banda: a sala vê-se no seu sítio, com o passeio e a rua do lado da porta
## (só cenário à volta; lá dentro anda-se só na sala).
func _street_around(view: BairroView, rect: Rect2, interior: Dictionary) -> void:
	var exit := rect.get_center()
	for p: Dictionary in view.places:
		if str(p.get("interior", "")) == str(interior.id) and str(p.kind) == "exit":
			exit = Vector2(p.at[0], p.at[1])
	# lado da sala onde está a porta: a rua passa desse lado
	var d := [exit.x - rect.position.x, rect.end.x - exit.x, exit.y - rect.position.y, rect.end.y - exit.y]
	var side := d.find(d.min())
	var L := 14.0
	var walk := 2.0
	var road := 8.0
	var strips: Array = [] # [Rect2, textura]
	match side:
		0: # oeste
			strips = [[Rect2(rect.position.x - walk, rect.position.y - L, walk, rect.size.y + 2 * L), T_CALCADA], [Rect2(rect.position.x - walk - road, rect.position.y - L, road, rect.size.y + 2 * L), T_ASFALTO]]
		1: # este
			strips = [[Rect2(rect.end.x, rect.position.y - L, walk, rect.size.y + 2 * L), T_CALCADA], [Rect2(rect.end.x + walk, rect.position.y - L, road, rect.size.y + 2 * L), T_ASFALTO]]
		2: # norte
			strips = [[Rect2(rect.position.x - L, rect.position.y - walk, rect.size.x + 2 * L, walk), T_CALCADA], [Rect2(rect.position.x - L, rect.position.y - walk - road, rect.size.x + 2 * L, road), T_ASFALTO]]
		_: # sul
			strips = [[Rect2(rect.position.x - L, rect.end.y, rect.size.x + 2 * L, walk), T_CALCADA], [Rect2(rect.position.x - L, rect.end.y + walk, rect.size.x + 2 * L, road), T_ASFALTO]]
	for st: Array in strips:
		_ground_poly(st[0], st[1])
	# traço ao meio da estrada
	var r: Rect2 = strips[1][0]
	var along_x := r.size.x > r.size.y
	var n := int((r.size.x if along_x else r.size.y) / 3.0)
	for k in n:
		var seg := Rect2(r.position.x + k * 3.0, r.get_center().y - 0.08, 1.6, 0.16) if along_x else Rect2(r.get_center().x - 0.08, r.position.y + k * 3.0, 0.16, 1.6)
		var q := Polygon2D.new()
		q.polygon = Iso.rect_poly(seg)
		q.color = Color(1, 1, 1, 0.75)
		q.z_as_relative = false
		q.z_index = -11
		add_child(q)


func _ground_poly(r: Rect2, t: Texture2D) -> void:
	var p := Polygon2D.new()
	var scr := PackedVector2Array()
	var uv := PackedVector2Array()
	for w: Vector2 in [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]:
		scr.append(Iso.to_screen(w))
		uv.append(w * 128.0)
	p.polygon = scr
	p.uv = uv
	p.texture = t
	p.texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	p.z_as_relative = false
	p.z_index = -12 # por baixo da sala
	add_child(p)


## Funcionário no posto da estação, um passo para o fundo da sala (atrás do balcão).
func _add_staff(view: BairroView, rect: Rect2, p: Dictionary, venue: String) -> void:
	var by_venue: Dictionary = STAFF.get(str(p.kind), {})
	if by_venue.is_empty():
		return
	var who: Array = by_venue.get(venue, by_venue.get("_", []))
	if who.is_empty():
		return
	var at := Vector2(p.at[0], p.at[1])
	var back := rect.get_center() * 2.0 - Iso.front_corner(rect) # canto do fundo, em qualquer rotação
	var pos := at + (back - at).normalized() * 1.1
	pos = pos.clamp(rect.position + Vector2(0.4, 0.4), rect.end - Vector2(0.4, 0.4))
	var c := DemoCharacter.new()
	c.cid = "mulher" if int(who[1]) == 1 else "homem"
	c.world_pos = pos
	view.objects.add_child(c)
	c.tag.text = str(who[0])
	c.set_top_hue(float(who[2]) / 360.0)
	c.position = Iso.to_screen(pos)
	# olha para a estação (para quem lá chega)
	c.screen_dir = (Iso.to_screen(at) - Iso.to_screen(pos)).normalized()
	c.facing_up = c.screen_dir.y < 0.0
	c.facing_left = c.screen_dir.x < 0.0
	_staff.append({"c": c, "lines": who[3], "said": -100.0, "bubble": null, "n": 0})


## Estação tocada (posição no mundo do ecrã/canvas), ou {}.
func hit(canvas_pos: Vector2) -> Dictionary:
	for m: Dictionary in _markers:
		var n: Control = m.node
		if is_instance_valid(n) and n.get_global_rect().grow(18).has_point(canvas_pos):
			return m.place
	# tocar no próprio sítio (balcão, cama…): raio generoso à volta do ponto
	for m: Dictionary in _markers:
		var at := Iso.to_screen(Vector2(m.place.at[0], m.place.at[1]))
		if canvas_pos.distance_to(at + Vector2(0, -40)) < 70.0 and str(m.place.kind) != "exit":
			return m.place
	return {}


func is_active() -> bool:
	return not _interior.is_empty()


func update(me: Vector2, delta: float) -> void:
	_t += delta
	for i in _markers.size():
		var m: Dictionary = _markers[i]
		if is_instance_valid(m.node):
			m.node.position = m.base + Vector2(0, sin(_t * 3.2 + i) * 7.0)
	for s: Dictionary in _staff:
		# a vista rodou e o bairro foi refeito: este funcionário já não existe (volta a ser criado ao entrar)
		if not is_instance_valid(s.c):
			continue
		var c: DemoCharacter = s.c
		if is_instance_valid(s.bubble):
			s.bubble.position = c.position + Vector2(-s.bubble.size.x / 2.0, -290)
		# cumprimenta quem chega perto (de 25 em 25 s no máximo)
		if c.world_pos.distance_to(me) < 2.6 and _t - float(s.said) > 25.0:
			s.said = _t
			var lines: Array = s.lines
			_say(s, str(lines[int(s.n) % lines.size()]))
			s.n = int(s.n) + 1


func _say(s: Dictionary, text: String) -> void:
	if is_instance_valid(s.bubble):
		s.bubble.queue_free()
	var b := _pill(text, null, Color(1, 1, 1, 0.96), Color("2a1d10"), 19)
	add_child(b)
	s.bubble = b
	b.position = (s.c as DemoCharacter).position + Vector2(-b.size.x / 2.0, -290)
	var tw := create_tween()
	tw.tween_interval(4.5)
	tw.tween_property(b, "modulate:a", 0.0, 0.5)
	tw.tween_callback(b.queue_free)


func _pill(text: String, icon: Texture2D, bg: Color, fg: Color, fs: int) -> PanelContainer:
	var pill := PanelContainer.new()
	pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.set_corner_radius_all(18)
	sb.content_margin_left = 12
	sb.content_margin_right = 14
	sb.content_margin_top = 5
	sb.content_margin_bottom = 5
	sb.shadow_color = Color(0, 0, 0, 0.25)
	sb.shadow_size = 4
	pill.add_theme_stylebox_override("panel", sb)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 6)
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pill.add_child(h)
	if icon:
		var tr := TextureRect.new()
		tr.texture = icon
		tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		tr.custom_minimum_size = Vector2(24, 24)
		h.add_child(tr)
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", FONT_BOLD if icon else FONT)
	l.add_theme_font_size_override("font_size", fs)
	l.add_theme_color_override("font_color", fg)
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	h.add_child(l)
	pill.reset_size()
	return pill
