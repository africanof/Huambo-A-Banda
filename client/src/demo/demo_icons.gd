class_name DemoIcons
extends RefCounted
## Ícones vetoriais nítidos (desenhados em alta resolução e reduzidos → sem serrilhado).

const S := 96 ## resolução interna
const OUT := 24 ## tamanho final


static func make(kind: String, color: Color) -> Texture2D:
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
		"trash":
			_rect(img, Rect2(22, 30, 52, 58), c)
			_rect(img, Rect2(14, 18, 68, 8), c)
			_rect(img, Rect2(38, 8, 20, 10), c)
	img.resize(OUT, OUT, Image.INTERPOLATE_LANCZOS)
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
