shader_type spatial;
// Fachada 3D pintada com a arte isométrica 2D: cada ponto da face (u ao longo da parede,
// v de baixo para cima) vai buscar o píxel correspondente do paralelogramo da fachada na imagem.
render_mode unshaded, cull_disabled;

uniform sampler2D tex : source_color, filter_linear_mipmap;
uniform vec2 tsize;   // tamanho da textura (px)
uniform vec2 p0;      // px do canto (u=0, v=0)
uniform vec2 eu;      // px ao longo de u (0→1)
uniform vec2 ev;      // px ao longo de v (0→1)
uniform float shade = 1.0;

void fragment() {
	vec2 px = p0 + UV.x * eu + UV.y * ev;
	vec4 c = texture(tex, px / tsize);
	if (c.a < 0.5) {
		// sem arte neste ponto (beiral, telhado recortado): parede lisa com a cor média
		c = vec4(texture(tex, (p0 + 0.5 * eu + 0.2 * ev) / tsize).rgb, 1.0);
	}
	ALBEDO = c.rgb * shade;
}
