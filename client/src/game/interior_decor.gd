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
	"governo": "Gabinete", "loja_telecom": "Loja",
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
	"study": {"escola": ["Professora", 1, 120, ["Bom dia, turma! Abram os cadernos.", "Quem fez o trabalho de casa?"]]},
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
		var col := Color(0.95, 0.72, 0.18) if kind != "exit" else Color(0.09, 0.08, 0.08, 0.9)
		var fg := Color("2a1d10") if kind != "exit" else Color.WHITE
		var node := _pill(label, DemoIcons.make(str(KIND_ICON.get(kind, "target")), fg, 22), col, fg, 20)
		var base := Iso.to_screen(Vector2(p.at[0], p.at[1])) + Vector2(-node.size.x / 2.0, -170.0)
		node.position = base
		add_child(node)
		_markers.append({"node": node, "base": base, "place": p})
		_add_staff(view, rect, p, venue)


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
		var c: DemoCharacter = s.c
		if not is_instance_valid(c):
			continue
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
