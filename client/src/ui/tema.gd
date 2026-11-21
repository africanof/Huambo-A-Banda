class_name Tema
extends RefCounted
## Tema «Planalto»: as cores da interface tiradas do próprio Huambo.
##
##   · Terra escura (cacau)  — fundos quentes em vez de preto neutro: o chão do planalto à noite.
##   · Milho dourado         — cor principal da marca (botão principal, dinheiro, destaques).
##   · Terra vermelha        — a laterite das ruas de terra: ações fortes, alertas, o Telemóvel.
##   · Jacarandá             — as árvores roxas das avenidas: tudo o que é social.
##   · Verde do planalto     — lavras, eucaliptos: saúde, ganhos, coisas boas.
##   · Céu do cacimbo        — azul seco de julho: informação, energia.
##
## Regras: texto creme (nunca branco puro) sobre fundos quentes; cada cor tem uma função;
## botões com «degrau» (borda de baixo mais escura) para parecerem físicos ao toque.

# superfícies (do fundo para a frente)
const PHONE := Color("1b130f") ## fundo do telemóvel
const PANEL := Color(0.106, 0.075, 0.059, 0.92) ## painéis por cima do mapa (barra, doca, avisos)
const CARD := Color("2a1e19") ## cartões dentro do telemóvel
const CARD_HI := Color("35261f") ## cartão em destaque / hover
const BTN2 := Color("3d2c24") ## botão secundário
const STROKE := Color(1.0, 0.86, 0.66, 0.10) ## contorno fino dos cartões

# texto
const TEXT := Color("f7efe2") ## texto principal (creme)
const TEXT_MUTED := Color("d6c6b4") ## texto secundário
const TEXT_FAINT := Color("a6927f") ## notas, legendas
const INK := Color("2a1a0c") ## texto sobre dourado

# cores de marca
const GOLD := Color("f2b632") ## milho dourado
const GOLD_DEEP := Color("c98c12")
const TERRA := Color("c4492d") ## terra vermelha do planalto
const TERRA_DEEP := Color("8e2f1b")
const JACARANDA := Color("7d5cc4")
const PLANALTO := Color("2f8f62") ## verde
const CACIMBO := Color("4f9fd1") ## azul do céu seco

# estados
const OK := Color("86dba0")
const WARN := Color("ffc861")
const DANGER := Color("ff9a85")

# necessidades (barras): cada uma com a sua cor de marca
const NEED_HUNGER := Color("eba33a")
const NEED_ENERGY := CACIMBO
const NEED_MOOD := Color("d66fae")
const NEED_HEALTH := Color("4fbf7f")


## Cor da app por categoria: vida (terra), dinheiro (milho), social (jacarandá), cidade (planalto), sistema.
static func app_color(cat: String) -> Color:
	match cat:
		"vida":
			return TERRA
		"dinheiro":
			return GOLD
		"social":
			return JACARANDA
		"cidade":
			return PLANALTO
	return BTN2


## Texto que se lê bem sobre uma cor de fundo (tinta escura no dourado, creme no resto).
static func on(bg: Color) -> Color:
	return INK if bg.get_luminance() > 0.55 else TEXT


## Caixa arredondada com «degrau» por baixo (botões) ou contorno fino (cartões).
static func box(bg: Color, radius: int, step := 0, stroke := Color(0, 0, 0, 0)) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.set_corner_radius_all(radius)
	sb.content_margin_left = 16
	sb.content_margin_right = 16
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8 + step
	if step > 0:
		sb.border_width_bottom = step
		sb.border_color = bg.darkened(0.38)
	elif stroke.a > 0.0:
		sb.set_border_width_all(1)
		sb.border_color = stroke
	sb.shadow_color = Color(0.05, 0.02, 0.0, 0.32)
	sb.shadow_size = 6
	sb.shadow_offset = Vector2(0, 3)
	sb.anti_aliasing = true
	return sb
