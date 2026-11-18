class_name DemoIcons
extends RefCounted
## Ícones vetoriais nítidos (desenhados em alta resolução e reduzidos → sem serrilhado).

const S := 96 ## resolução interna
const OUT := 24 ## tamanho final


static func make(kind: String, color: Color, out := OUT) -> Texture2D:
	var img := Image.create(S, S, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var c := color
	match kind:
		"person":
			_circle(img, Vector2(48, 28), 16, c)
			_ellipse(img, Vector2(48, 82), 30, 26, c)
		"shirt":
			_poly(img, [Vector2(30, 14), Vector2(40, 22), Vector2(56, 22), Vector2(66, 14), Vector2(88, 30), Vector2(78, 46), Vector2(70, 40), Vector2(70, 84), Vector2(26, 84), Vector2(26, 40), Vector2(18, 46), Vector2(8, 30)], c)
		"sun":
			_circle(img, Vector2(48, 48), 18, c)
			for i in 8:
				var a := TAU * i / 8.0
				_circle(img, Vector2(48, 48) + Vector2(cos(a), sin(a)) * 34, 6, c)
		"plus":
			_rect(img, Rect2(42, 16, 12, 64), c)
			_rect(img, Rect2(16, 42, 64, 12), c)
		"minus":
			_rect(img, Rect2(16, 42, 64, 12), c)
		"home":
			_poly(img, [Vector2(48, 10), Vector2(88, 46), Vector2(78, 46), Vector2(78, 86), Vector2(18, 86), Vector2(18, 46), Vector2(8, 46)], c)
			_rect(img, Rect2(40, 58, 16, 28), Color(0, 0, 0, 0))
		"bag":
			_rect(img, Rect2(16, 34, 64, 52), c)
			_ring(img, Vector2(48, 32), 16, 6, c)
		"door":
			_rect(img, Rect2(26, 10, 44, 78), c)
			_circle(img, Vector2(60, 50), 5, Color(0, 0, 0, 0))
		"flip":
			_poly(img, [Vector2(10, 48), Vector2(34, 22), Vector2(34, 74)], c)
			_poly(img, [Vector2(86, 48), Vector2(62, 22), Vector2(62, 74)], c)
			_rect(img, Rect2(44, 14, 8, 68), c)
		"phone":
			_rect(img, Rect2(28, 6, 40, 84), c)
			_rect(img, Rect2(33, 16, 30, 58), Color(0, 0, 0, 0))
			_circle(img, Vector2(48, 82), 4, Color(0, 0, 0, 0))
		"trash":
			_rect(img, Rect2(22, 30, 52, 58), c)
			_rect(img, Rect2(14, 18, 68, 8), c)
			_rect(img, Rect2(38, 8, 20, 10), c)
		"rotate":
			_ring(img, Vector2(48, 50), 30, 10, c)
			for y in range(50, 82):
				for x in range(14, 82):
					var d := Vector2(x, y).distance_to(Vector2(48, 50))
					if absf(d - 30) <= 5 and x > 48:
						_px(img, x, y, c)
			_poly(img, [Vector2(4, 50), Vector2(32, 50), Vector2(18, 70)], c)
		"eye":
			_ellipse(img, Vector2(48, 48), 42, 24, c)
			_ellipse(img, Vector2(48, 48), 34, 17, Color(0, 0, 0, 0))
			_circle(img, Vector2(48, 48), 14, c)
		"target":
			_ring(img, Vector2(48, 48), 30, 8, c)
			for y in range(48, 80):
				for x in range(10, 88):
					if absf(Vector2(x, y).distance_to(Vector2(48, 48)) - 30) <= 4:
						_px(img, x, y, c)
			_circle(img, Vector2(48, 48), 10, c)
			_rect(img, Rect2(44, 4, 8, 14), c)
			_rect(img, Rect2(44, 78, 8, 14), c)
			_rect(img, Rect2(4, 44, 14, 8), c)
			_rect(img, Rect2(78, 44, 14, 8), c)
		"pin":
			_circle(img, Vector2(48, 36), 28, c)
			_poly(img, [Vector2(24, 50), Vector2(72, 50), Vector2(48, 92)], c)
			_circle(img, Vector2(48, 36), 11, Color(0, 0, 0, 0))
		"map":
			_poly(img, [Vector2(8, 22), Vector2(34, 12), Vector2(34, 76), Vector2(8, 86)], c)
			_poly(img, [Vector2(38, 12), Vector2(58, 22), Vector2(58, 86), Vector2(38, 76)], c)
			_poly(img, [Vector2(62, 22), Vector2(88, 12), Vector2(88, 76), Vector2(62, 86)], c)
		"hand":
			for i in 4:
				_rect(img, Rect2(22 + i * 14, 14 + absi(i - 1) * 4, 10, 46), c)
				_circle(img, Vector2(27 + i * 14, 14 + absi(i - 1) * 4), 5, c)
			_poly(img, [Vector2(6, 44), Vector2(16, 40), Vector2(26, 58), Vector2(20, 66)], c)
			_ellipse(img, Vector2(48, 66), 28, 24, c)
		"chat":
			_rect(img, Rect2(10, 14, 76, 54), c)
			_poly(img, [Vector2(24, 66), Vector2(44, 66), Vector2(22, 88)], c)
			_rect(img, Rect2(20, 26, 56, 30), Color(0, 0, 0, 0))
		"more":
			for i in 3:
				_circle(img, Vector2(20 + i * 28, 48), 9, c)
		"bowl":
			_ellipse(img, Vector2(48, 52), 40, 30, c)
			_rect(img, Rect2(0, 0, 96, 52), Color(0, 0, 0, 0))
			_rect(img, Rect2(8, 48, 80, 6), c)
			for i in 3:
				_rect(img, Rect2(30 + i * 16, 14 + (i % 2) * 6, 6, 26), c)
	img.resize(out, out, Image.INTERPOLATE_LANCZOS)
	return ImageTexture.create_from_image(img)


static func _px(img: Image, x: int, y: int, c: Color) -> void:
	if x >= 0 and y >= 0 and x < S and y < S:
		img.set_pixel(x, y, c)


static func _circle(img: Image, ctr: Vector2, r: float, c: Color) -> void:
	_ellipse(img, ctr, r, r, c)


static func _ellipse(img: Image, ctr: Vector2, rx: float, ry: float, c: Color) -> void:
	for y in range(int(ctr.y - ry), int(ctr.y + ry) + 1):
		for x in range(int(ctr.x - rx), int(ctr.x + rx) + 1):
			if pow((x - ctr.x) / rx, 2) + pow((y - ctr.y) / ry, 2) <= 1.0:
				_px(img, x, y, c)


static func _ring(img: Image, ctr: Vector2, r: float, w: float, c: Color) -> void:
	for y in range(int(ctr.y - r - w), int(ctr.y + r + w) + 1):
		for x in range(int(ctr.x - r - w), int(ctr.x + r + w) + 1):
			var d := Vector2(x, y).distance_to(ctr)
			if absf(d - r) <= w / 2 and y <= ctr.y:
				_px(img, x, y, c)


static func _rect(img: Image, r: Rect2, c: Color) -> void:
	for y in range(int(r.position.y), int(r.end.y)):
		for x in range(int(r.position.x), int(r.end.x)):
			_px(img, x, y, c)


static func _poly(img: Image, pts: Array, c: Color) -> void:
	var packed := PackedVector2Array(pts)
	var r := Rect2(packed[0], Vector2.ZERO)
	for p in packed:
		r = r.expand(p)
	for y in range(int(r.position.y), int(r.end.y) + 1):
		for x in range(int(r.position.x), int(r.end.x) + 1):
			if Geometry2D.is_point_in_polygon(Vector2(x, y), packed):
				_px(img, x, y, c)
