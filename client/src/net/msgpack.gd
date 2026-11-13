class_name MsgPack
extends RefCounted
## Codec MessagePack (big-endian, especificação oficial) usado nos payloads
## das mensagens Colyseus (o servidor usa msgpackr com useRecords: false).
##
## Suporta: nil, bool, int, float, String, PackedByteArray, Array, Dictionary.


## Resultado de uma descodificação: valor + posição seguinte + erro.
class Result:
	var value: Variant = null
	var offset: int = 0
	var error: String = ""

	func ok() -> bool:
		return error.is_empty()


# ------------------------------------------------------------------ encode

static func encode(value: Variant) -> PackedByteArray:
	var buf := StreamPeerBuffer.new()
	buf.big_endian = true
	_write(buf, value, 0)
	return buf.data_array


static func _write(buf: StreamPeerBuffer, v: Variant, depth: int) -> void:
	if depth > 32:
		push_error("MsgPack: estrutura demasiado profunda")
		buf.put_u8(0xc0)
		return
	match typeof(v):
		TYPE_NIL:
			buf.put_u8(0xc0)
		TYPE_BOOL:
			buf.put_u8(0xc3 if v else 0xc2)
		TYPE_INT:
			_write_int(buf, v)
		TYPE_FLOAT:
			# Inteiros representáveis viajam como int (menos bytes, igual ao msgpackr).
			var f: float = v
			if is_finite(f) and f == floorf(f) and absf(f) < 9.0e15:
				_write_int(buf, int(f))
			else:
				buf.put_u8(0xcb)
				buf.put_double(f)
		TYPE_STRING, TYPE_STRING_NAME:
			_write_str(buf, str(v))
		TYPE_PACKED_BYTE_ARRAY:
			var b: PackedByteArray = v
			if b.size() < 0x100:
				buf.put_u8(0xc4); buf.put_u8(b.size())
			elif b.size() < 0x10000:
				buf.put_u8(0xc5); buf.put_u16(b.size())
			else:
				buf.put_u8(0xc6); buf.put_u32(b.size())
			buf.put_data(b)
		TYPE_ARRAY, TYPE_PACKED_INT32_ARRAY, TYPE_PACKED_INT64_ARRAY, TYPE_PACKED_FLOAT32_ARRAY, TYPE_PACKED_FLOAT64_ARRAY, TYPE_PACKED_STRING_ARRAY:
			var n: int = v.size()
			if n < 16:
				buf.put_u8(0x90 | n)
			elif n < 0x10000:
				buf.put_u8(0xdc); buf.put_u16(n)
			else:
				buf.put_u8(0xdd); buf.put_u32(n)
			for item: Variant in v:
				_write(buf, item, depth + 1)
		TYPE_DICTIONARY:
			var d: Dictionary = v
			var n := d.size()
			if n < 16:
				buf.put_u8(0x80 | n)
			elif n < 0x10000:
				buf.put_u8(0xde); buf.put_u16(n)
			else:
				buf.put_u8(0xdf); buf.put_u32(n)
			for k: Variant in d:
				_write(buf, k, depth + 1)
				_write(buf, d[k], depth + 1)
		TYPE_VECTOR2, TYPE_VECTOR2I:
			_write(buf, {"x": v.x, "y": v.y}, depth + 1)
		_:
			push_error("MsgPack: tipo não suportado %s" % type_string(typeof(v)))
			buf.put_u8(0xc0)


static func _write_int(buf: StreamPeerBuffer, i: int) -> void:
	if i >= 0:
		if i < 0x80:
			buf.put_u8(i)
		elif i < 0x100:
			buf.put_u8(0xcc); buf.put_u8(i)
		elif i < 0x10000:
			buf.put_u8(0xcd); buf.put_u16(i)
		elif i < 0x100000000:
			buf.put_u8(0xce); buf.put_u32(i)
		else:
			buf.put_u8(0xcf); buf.put_u64(i)
	else:
		if i >= -32:
			buf.put_u8(i & 0xff)
		elif i >= -128:
			buf.put_u8(0xd0); buf.put_8(i)
		elif i >= -32768:
			buf.put_u8(0xd1); buf.put_16(i)
		elif i >= -2147483648:
			buf.put_u8(0xd2); buf.put_32(i)
		else:
			buf.put_u8(0xd3); buf.put_64(i)


static func _write_str(buf: StreamPeerBuffer, s: String) -> void:
	var b := s.to_utf8_buffer()
	var n := b.size()
	if n < 32:
		buf.put_u8(0xa0 | n)
	elif n < 0x100:
		buf.put_u8(0xd9); buf.put_u8(n)
	elif n < 0x10000:
		buf.put_u8(0xda); buf.put_u16(n)
	else:
		buf.put_u8(0xdb); buf.put_u32(n)
	buf.put_data(b)


# ------------------------------------------------------------------ decode

## Descodifica um valor a partir de `offset`. Nunca lança: erros vêm em Result.error.
static func decode(bytes: PackedByteArray, offset: int = 0) -> Result:
	var buf := StreamPeerBuffer.new()
	buf.big_endian = true
	buf.data_array = bytes
	buf.seek(offset)
	var r := Result.new()
	r.value = _read(buf, r, 0)
	r.offset = buf.get_position()
	if r.ok() and r.offset > bytes.size():
		r.error = "truncated"
	return r


static func _need(buf: StreamPeerBuffer, r: Result, n: int) -> bool:
	if buf.get_available_bytes() < n:
		r.error = "truncated"
		return false
	return true


static func _read(buf: StreamPeerBuffer, r: Result, depth: int) -> Variant:
	if depth > 32:
		r.error = "too deep"
		return null
	if not _need(buf, r, 1):
		return null
	var p := buf.get_u8()
	if p < 0x80:
		return p
	if p >= 0xe0:
		return p - 0x100
	if p & 0xe0 == 0xa0:
		return _read_str(buf, r, p & 0x1f)
	if p & 0xf0 == 0x90:
		return _read_array(buf, r, p & 0x0f, depth)
	if p & 0xf0 == 0x80:
		return _read_map(buf, r, p & 0x0f, depth)
	match p:
		0xc0: return null
		0xc2: return false
		0xc3: return true
		0xc4: return _read_bin(buf, r, _len(buf, r, 1))
		0xc5: return _read_bin(buf, r, _len(buf, r, 2))
		0xc6: return _read_bin(buf, r, _len(buf, r, 4))
		0xca: return buf.get_float() if _need(buf, r, 4) else null
		0xcb: return buf.get_double() if _need(buf, r, 8) else null
		0xcc: return buf.get_u8() if _need(buf, r, 1) else null
		0xcd: return buf.get_u16() if _need(buf, r, 2) else null
		0xce: return buf.get_u32() if _need(buf, r, 4) else null
		0xcf: return buf.get_u64() if _need(buf, r, 8) else null
		0xd0: return buf.get_8() if _need(buf, r, 1) else null
		0xd1: return buf.get_16() if _need(buf, r, 2) else null
		0xd2: return buf.get_32() if _need(buf, r, 4) else null
		0xd3: return buf.get_64() if _need(buf, r, 8) else null
		0xd9: return _read_str(buf, r, _len(buf, r, 1))
		0xda: return _read_str(buf, r, _len(buf, r, 2))
		0xdb: return _read_str(buf, r, _len(buf, r, 4))
		0xdc: return _read_array(buf, r, _len(buf, r, 2), depth)
		0xdd: return _read_array(buf, r, _len(buf, r, 4), depth)
		0xde: return _read_map(buf, r, _len(buf, r, 2), depth)
		0xdf: return _read_map(buf, r, _len(buf, r, 4), depth)
		0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xc7, 0xc8, 0xc9:
			r.error = "ext types not supported"
			return null
	r.error = "invalid prefix 0x%02x" % p
	return null


static func _len(buf: StreamPeerBuffer, r: Result, width: int) -> int:
	if not _need(buf, r, width):
		return -1
	match width:
		1: return buf.get_u8()
		2: return buf.get_u16()
		_: return buf.get_u32()


static func _read_str(buf: StreamPeerBuffer, r: Result, n: int) -> Variant:
	if n < 0 or not _need(buf, r, n):
		return null
	if n == 0:
		return ""
	return buf.get_utf8_string(n)


static func _read_bin(buf: StreamPeerBuffer, r: Result, n: int) -> Variant:
	if n < 0 or not _need(buf, r, n):
		return null
	return buf.get_data(n)[1]


static func _read_array(buf: StreamPeerBuffer, r: Result, n: int, depth: int) -> Variant:
	if n < 0 or not _need(buf, r, n): # cada elemento ocupa >= 1 byte
		return null
	var out := []
	out.resize(n)
	for i in n:
		out[i] = _read(buf, r, depth + 1)
		if not r.ok():
			return null
	return out


static func _read_map(buf: StreamPeerBuffer, r: Result, n: int, depth: int) -> Variant:
	if n < 0 or not _need(buf, r, n * 2):
		return null
	var out := {}
	for i in n:
		var k: Variant = _read(buf, r, depth + 1)
		if not r.ok():
			return null
		var v: Variant = _read(buf, r, depth + 1)
		if not r.ok():
			return null
		out[k] = v
	return out
