shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_opaque;
uniform sampler2D texture_albedo : source_color, filter_linear_mipmap;
// Versão 3D (personagens nas vistas 3D). Personalização de roupa: troca o matiz dos píxeis cuja cor está perto da cor
// original da peça (por matiz, saturação e luminosidade), preservando o
// sombreamento e as pregas desenhadas. Pele, cabelo e fundo não são tocados.

uniform float source_hue = 0.58;   // matiz da peça original (0..1)
uniform float hue_tolerance = 0.06;
uniform float min_saturation = 0.25;
uniform float min_value = 0.35;
uniform float target_hue = 0.58;
uniform float target_saturation = 1.0; // multiplicador
uniform float target_value = 1.0;      // multiplicador
uniform bool enabled = false;

vec3 rgb2hsv(vec3 c) {
	vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
	vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
	vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
	float d = q.x - min(q.w, q.y);
	float e = 1.0e-10;
	return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
	vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void fragment() {
	vec4 col = texture(texture_albedo, UV);
	if (col.a < 0.5) { discard; }
	if (enabled && col.a > 0.0) {
		vec3 hsv = rgb2hsv(col.rgb);
		float dh = abs(hsv.x - source_hue);
		dh = min(dh, 1.0 - dh);
		float w = (1.0 - smoothstep(hue_tolerance * 0.6, hue_tolerance, dh))
			* smoothstep(min_saturation * 0.7, min_saturation, hsv.y)
			* smoothstep(min_value * 0.8, min_value, hsv.z);
		vec3 shifted = hsv2rgb(vec3(target_hue, clamp(hsv.y * target_saturation, 0.0, 1.0), clamp(hsv.z * target_value, 0.0, 1.0)));
		col.rgb = mix(col.rgb, shifted, w);
	}
	ALBEDO = col.rgb;
}
