extends SceneTree
## Testes unitários do cliente (headless):
##   godot --headless --path client -s res://tests/run_tests.gd
## Usa fixtures geradas pelo código REAL do servidor (npm run fixtures).

var failures := 0
var passed := 0


func _initialize() -> void:
	test_msgpack_roundtrip()
	test_msgpack_matches_msgpackr()
	test_msgpack_rejects_garbage()
	test_colyseus_wire_numbers()
	test_room_data_frame()
	test_movement_parity()
	print("\n%d passaram, %d falharam" % [passed, failures])
	quit(1 if failures > 0 else 0)


func check(cond: bool, label: String) -> void:
	if cond:
		passed += 1
	else:
		failures += 1
		printerr("FALHOU: ", label)


func load_json(path: String) -> Variant:
	return JSON.parse_string(FileAccess.get_file_as_string(path))


## Igualdade profunda tolerante a int/float (JSON devolve sempre float).
func deep_eq(a: Variant, b: Variant) -> bool:
	if typeof(a) in [TYPE_INT, TYPE_FLOAT] and typeof(b) in [TYPE_INT, TYPE_FLOAT]:
		return is_equal_approx(float(a), float(b))
	if typeof(a) == TYPE_ARRAY and typeof(b) == TYPE_ARRAY:
		if a.size() != b.size():
			return false
		for i in a.size():
			if not deep_eq(a[i], b[i]):
				return false
		return true
	if typeof(a) == TYPE_DICTIONARY and typeof(b) == TYPE_DICTIONARY:
		if a.size() != b.size():
			return false
		for k: Variant in a:
			if not b.has(k) or not deep_eq(a[k], b[k]):
				return false
		return true
	return typeof(a) == typeof(b) and a == b


func test_msgpack_roundtrip() -> void:
	var values: Array = [null, true, false, 0, 1, 200, 70000, 1 << 40, -1, -100, -40000, 1.5, "olá Huambo", [1, "a", [2]], {"x": 10, "y": [1, 2]}, PackedByteArray([1, 2, 3])]
	for v: Variant in values:
		var r := MsgPack.decode(MsgPack.encode(v))
		check(r.ok() and deep_eq(r.value, v), "roundtrip %s" % [v])


func test_msgpack_matches_msgpackr() -> void:
	var fx: Dictionary = load_json("res://tests/fixtures/wire.json")
	for item: Dictionary in fx.msgpack:
		var bytes: PackedByteArray = (item.hex as String).hex_decode()
		var r := MsgPack.decode(bytes)
		check(r.ok() and deep_eq(r.value, item.json) and r.offset == bytes.size(), "decode msgpackr %s" % item.hex)
		# msgpackr escreve objetos sempre como map16; nós usamos fixmap (mais curto).
		# Ambos são msgpack válido, por isso para mapas exigimos só equivalência semântica.
		var mine := MsgPack.encode(item.json)
		if JSON.stringify(item.json).contains("{"):
			check(deep_eq(MsgPack.decode(mine).value, item.json), "encode mapa %s" % [item.json])
		else:
			check(mine.hex_encode() == item.hex, "encode igual ao msgpackr %s" % [item.json])


func test_msgpack_rejects_garbage() -> void:
	check(not MsgPack.decode(PackedByteArray([0xdc, 0xff, 0xff])).ok(), "array truncado")
	check(not MsgPack.decode(PackedByteArray([0xd9, 50, 65])).ok(), "string truncada")
	check(not MsgPack.decode(PackedByteArray([0xc1])).ok(), "prefixo inválido")
	var deep := PackedByteArray()
	for i in 100:
		deep.append(0x91)
	check(not MsgPack.decode(deep).ok(), "profundidade excessiva")


func test_colyseus_wire_numbers() -> void:
	var fx: Dictionary = load_json("res://tests/fixtures/wire.json")
	for item: Dictionary in fx.numbers:
		var r := ColyseusWire.Reader.new((item.hex as String).hex_decode())
		check(is_equal_approx(r.number(), float(item.n)) and not r.failed, "colyseus number %s" % item.hex)
	for item: Dictionary in fx.strings:
		var bytes: PackedByteArray = (item.hex as String).hex_decode()
		var r := ColyseusWire.Reader.new(bytes)
		check(r.string() == item.s and r.remaining() == 0, "colyseus string %s" % item.hex)


func test_room_data_frame() -> void:
	var frame := ColyseusWire.frame_room_data(Protocol.C2S_MOVE_TO, {"x": 10, "y": 20}, true)
	check(frame[0] == ColyseusWire.ROOM_DATA and frame[1] == Protocol.C2S_MOVE_TO, "cabeçalho ROOM_DATA")
	var r := MsgPack.decode(frame, 2)
	check(r.ok() and deep_eq(r.value, {"x": 10, "y": 20}), "payload ROOM_DATA")


func test_movement_parity() -> void:
	var fx: Dictionary = load_json("res://tests/fixtures/movement.json")
	var m := Movement.MapData.from_welcome(fx.district)
	for c: Dictionary in fx.cases:
		var mv := Movement.Mover.new()
		mv.pos = Vector2(c.start[0], c.start[1])
		mv.target = Vector2(c.target[0], c.target[1])
		mv.has_target = true
		var max_err := 0.0
		var flags_ok := true
		for p: Array in c.path:
			Movement.step(m, mv, c.dt)
			max_err = maxf(max_err, mv.pos.distance_to(Vector2(p[0], p[1])))
			flags_ok = flags_ok and mv.has_target == p[2]
		# Vector2 do Godot é float32; o servidor usa float64 → tolerância sub-píxel.
		check(max_err < 0.05 and flags_ok, "paridade de movimento %s→%s (erro %.4f)" % [c.start, c.target, max_err])
