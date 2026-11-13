class_name ColyseusWire
extends RefCounted
## Codificação dos CABEÇALHOS do protocolo Colyseus 0.18.
##
## Atenção: o Colyseus usa os prefixos do msgpack mas com inteiros em
## LITTLE-endian (encode.number / encode.string do @colyseus/schema). Os
## PAYLOADS das mensagens, esses sim, são msgpack normal (big-endian) — ver MsgPack.

# Códigos de protocolo (bits 0..4 do primeiro byte)
const JOIN_ROOM := 10
const ERROR := 11
const LEAVE_ROOM := 12
const ROOM_DATA := 13
const ROOM_STATE := 14
const ROOM_STATE_PATCH := 15
const ROOM_DATA_SCHEMA := 16
const ROOM_DATA_BYTES := 17
const PING := 18

const CODE_MASK := 0x1f
const MOD_TIMED := 0x80
const MOD_UNRELIABLE := 0x40


## Cursor de leitura sobre um pacote recebido.
class Reader:
	var buf := StreamPeerBuffer.new()
	var size := 0
	var failed := false

	func _init(bytes: PackedByteArray, start: int = 0) -> void:
		buf.big_endian = false
		buf.data_array = bytes
		size = bytes.size()
		buf.seek(start)

	func pos() -> int:
		return buf.get_position()

	func remaining() -> int:
		return size - buf.get_position()

	func _need(n: int) -> bool:
		if remaining() < n:
			failed = true
			return false
		return true

	func u8() -> int:
		return buf.get_u8() if _need(1) else 0

	func raw_utf8(n: int) -> String:
		if n == 0 or not _need(n):
			return ""
		return buf.get_utf8_string(n)

	## Equivalente a decode.stringCheck do Colyseus.
	func is_string_next() -> bool:
		if remaining() < 1:
			return false
		var p: int = buf.data_array[buf.get_position()]
		return (p < 0xc0 and p > 0xa0) or p == 0xd9 or p == 0xda or p == 0xdb

	## Equivalente a decode.number do Colyseus (prefixo msgpack, payload little-endian).
	func number() -> float:
		if not _need(1):
			return 0
		var p := buf.get_u8()
		if p < 0x80:
			return p
		if p > 0xdf:
			return p - 0x100
		match p:
			0xca: return buf.get_float() if _need(4) else 0.0
			0xcb: return buf.get_double() if _need(8) else 0.0
			0xcc: return buf.get_u8() if _need(1) else 0
			0xcd: return buf.get_u16() if _need(2) else 0
			0xce: return buf.get_u32() if _need(4) else 0
			0xcf: return buf.get_u64() if _need(8) else 0
			0xd0: return buf.get_8() if _need(1) else 0
			0xd1: return buf.get_16() if _need(2) else 0
			0xd2: return buf.get_32() if _need(4) else 0
			0xd3: return buf.get_64() if _need(8) else 0
		failed = true
		return 0

	## Equivalente a decode.string do Colyseus.
	func string() -> String:
		if not _need(1):
			return ""
		var p := buf.get_u8()
		var n := 0
		if p < 0xc0:
			n = p & 0x1f
		elif p == 0xd9:
			n = buf.get_u8() if _need(1) else 0
		elif p == 0xda:
			n = buf.get_u16() if _need(2) else 0
		elif p == 0xdb:
			n = buf.get_u32() if _need(4) else 0
		else:
			failed = true
			return ""
		return raw_utf8(n)

	func skip(n: int) -> void:
		if _need(n):
			buf.seek(buf.get_position() + n)


## Escreve um "type" de mensagem (número ou string) como o Colyseus espera.
static func write_type(out: StreamPeerBuffer, type: Variant) -> void:
	out.big_endian = false
	if typeof(type) == TYPE_STRING or typeof(type) == TYPE_STRING_NAME:
		var b := str(type).to_utf8_buffer()
		var n := b.size()
		if n < 32:
			out.put_u8(0xa0 | n)
		elif n < 0x100:
			out.put_u8(0xd9); out.put_u8(n)
		else:
			out.put_u8(0xda); out.put_u16(n)
		out.put_data(b)
	else:
		var i: int = int(type)
		assert(i >= 0 and i < 0x80, "tipos numéricos devem ser 0..127 (fixint)")
		out.put_u8(i)


static func frame_room_data(type: Variant, payload: Variant, has_payload: bool) -> PackedByteArray:
	var out := StreamPeerBuffer.new()
	out.put_u8(ROOM_DATA)
	write_type(out, type)
	var bytes := out.data_array
	if has_payload:
		bytes.append_array(MsgPack.encode(payload))
	return bytes
