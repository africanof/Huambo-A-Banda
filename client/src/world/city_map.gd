class_name CityMap
extends RefCounted
## Mapa real carregado de res://assets/maps/<id>.json (gerado por tools/mapgen a partir do OSM).
## Guarda as features já indexadas por "chunk" para desenho em streaming.

const CHUNK := 1024

var id := ""
var name := ""
var version := ""
var attribution := ""
var width := 0
var height := 0
var data: MapData
var bairros: Array = []
var roads: Array = []
var rails: Array = []
var areas: Array = []
var buildings: Array = []
var monuments: Array = []
var trees := PackedInt32Array()
var labels: Array = []
var pois: Array = []
## chunk key -> índices
var road_index := {}
var area_index := {}
var building_index := {}
var tree_index := {}
var label_index := {}

static var _cache := {}

const MapData = Movement.MapData


static func load_map(map_id: String) -> CityMap:
	if _cache.has(map_id):
		return _cache[map_id]
	var path := "res://assets/maps/%s.json" % map_id
	var text := FileAccess.get_file_as_string(path)
	if text.is_empty():
		push_error("CityMap: mapa em falta: " + path)
		return null
	var d: Variant = JSON.parse_string(text)
	if typeof(d) != TYPE_DICTIONARY:
		push_error("CityMap: JSON inválido: " + path)
		return null
	var m := CityMap.new()
	m._init_from(d)
	_cache[map_id] = m
	return m


static func chunk_key(cx: int, cy: int) -> int:
	return cx * 4096 + cy


func _init_from(d: Dictionary) -> void:
	id = d.id
	name = d.name
	version = d.version
	attribution = d.attribution
	width = int(d.width)
	height = int(d.height)
	data = MapData.from_map_json(d)
	bairros = d.bairros
	roads = d.roads
	rails = d.rails
	areas = d.areas
	buildings = d.buildings
	monuments = d.monuments
	trees = PackedInt32Array(d.trees)
	labels = d.labels
	pois = d.pois
	# Converte coordenadas para PackedVector2Array uma vez, e indexa por chunk.
	for i in roads.size():
		var r: Dictionary = roads[i]
		r.pts = _to_points(r.p)
		_index(road_index, i, r.pts, float(r.w))
	for i in areas.size():
		var a: Dictionary = areas[i]
		a.pts = _to_points(a.p)
		_index(area_index, i, a.pts, 8.0)
	for i in rails.size():
		rails[i] = _to_points(rails[i])
	for i in buildings.size():
		var b: Dictionary = buildings[i]
		var pts := _to_points(b.p)
		var max_y := -INF
		var sum := Vector2.ZERO
		for p in pts:
			max_y = maxf(max_y, p.y)
			sum += p
		b.base = Vector2(sum.x / pts.size(), max_y)
		b.pts = pts
		var k := chunk_key(int(b.base.x) / CHUNK, int(b.base.y) / CHUNK)
		if not building_index.has(k):
			building_index[k] = PackedInt32Array()
		building_index[k].append(i)
	for i in range(0, trees.size(), 2):
		var k := chunk_key(trees[i] / CHUNK, trees[i + 1] / CHUNK)
		if not tree_index.has(k):
			tree_index[k] = PackedInt32Array()
		tree_index[k].append(i)
	for i in labels.size():
		var lb: Dictionary = labels[i]
		var k := chunk_key(int(lb.x) / CHUNK, int(lb.y) / CHUNK)
		if not label_index.has(k):
			label_index[k] = PackedInt32Array()
		label_index[k].append(i)


func bairro(bairro_id: String) -> Dictionary:
	for b: Dictionary in bairros:
		if b.id == bairro_id:
			return b
	return bairros[0]


static func _to_points(flat: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	out.resize(flat.size() / 2)
	for i in out.size():
		out[i] = Vector2(flat[i * 2], flat[i * 2 + 1])
	return out


func _index(index: Dictionary, i: int, pts: PackedVector2Array, pad: float) -> void:
	var r := Rect2(pts[0], Vector2.ZERO)
	for p in pts:
		r = r.expand(p)
	r = r.grow(pad)
	for cx in range(maxi(0, int(r.position.x) / CHUNK), int(r.end.x) / CHUNK + 1):
		for cy in range(maxi(0, int(r.position.y) / CHUNK), int(r.end.y) / CHUNK + 1):
			var k := chunk_key(cx, cy)
			if not index.has(k):
				index[k] = PackedInt32Array()
			index[k].append(i)
