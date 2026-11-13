class_name ColyseusRoom
extends Node
## Ligação WebSocket a uma sala Colyseus (protocolo 0.18), em GDScript puro.
##
## Decisão: cliente próprio em vez de GDExtension nativa → funciona igual em
## Web, Android, iOS, Windows e Linux sem binários por plataforma.
## Implementa: handshake JOIN_ROOM, ROOM_DATA (msgpack), ERROR, LEAVE_ROOM e PING.
## Não implementa sincronização Schema — o jogo usa snapshots próprios (ver docs).

signal joined()
signal join_failed(reason: String)
signal message(type: Variant, payload: Variant)
signal error(code: int, text: String)
signal left(code: int, reason: String)
signal pong(rtt_ms: int)

enum State { IDLE, CONNECTING, JOINED, LEAVING, CLOSED }

var room_id := ""
var session_id := ""
var reconnection_token := ""
var serializer_id := ""
var state: State = State.IDLE

var _ws := WebSocketPeer.new()
var _ping_sent_at := -1
var _connect_deadline := 0


func _init() -> void:
	# Snapshots são pequenos; buffers modestos poupam memória em telemóveis.
	_ws.inbound_buffer_size = 256 * 1024
	_ws.outbound_buffer_size = 64 * 1024
	_ws.max_queued_packets = 1024


func connect_to(url: String, timeout_ms: int = 10000) -> void:
	state = State.CONNECTING
	_connect_deadline = Time.get_ticks_msec() + timeout_ms
	var err := _ws.connect_to_url(url)
	if err != OK:
		_fail("websocket connect error %d" % err)


func is_joined() -> bool:
	return state == State.JOINED


## Envia uma mensagem de jogo. `payload` é serializado em msgpack.
func send(type: Variant, payload: Variant = null) -> void:
	if state != State.JOINED:
		return
	_ws.put_packet(ColyseusWire.frame_room_data(type, payload, payload != null))


## Mede latência com o PING do protocolo Colyseus (resposta em `pong`).
func ping() -> void:
	if state != State.JOINED or _ping_sent_at >= 0:
		return
	_ping_sent_at = Time.get_ticks_msec()
	_ws.put_packet(PackedByteArray([ColyseusWire.PING]))


## Saída consentida (o servidor não guarda o lugar para reconexão).
func leave() -> void:
	if state == State.JOINED:
		state = State.LEAVING
		_ws.put_packet(PackedByteArray([ColyseusWire.LEAVE_ROOM]))
	elif state == State.CONNECTING:
		_ws.close()


func _process(_delta: float) -> void:
	if state == State.IDLE or state == State.CLOSED:
		return
	_ws.poll()
	match _ws.get_ready_state():
		WebSocketPeer.STATE_OPEN, WebSocketPeer.STATE_CLOSING:
			while _ws.get_available_packet_count() > 0:
				_handle_packet(_ws.get_packet())
				if state == State.CLOSED:
					return
		WebSocketPeer.STATE_CLOSED:
			var code := _ws.get_close_code()
			var reason := _ws.get_close_reason()
			if state == State.CONNECTING:
				_fail("connection closed (%d) %s" % [code, reason])
			else:
				state = State.CLOSED
				left.emit(code, reason)
			return
	if state == State.CONNECTING and Time.get_ticks_msec() > _connect_deadline:
		_ws.close()
		_fail("join timeout")


func _handle_packet(bytes: PackedByteArray) -> void:
	if bytes.is_empty():
		return
	var raw: int = bytes[0]
	var code := raw & ColyseusWire.CODE_MASK
	var r := ColyseusWire.Reader.new(bytes, 1)
	if raw & ColyseusWire.MOD_TIMED:
		r.skip(8) # [uint32 sNow][uint32 inputSeq] — só com defineInput(), que não usamos

	match code:
		ColyseusWire.JOIN_ROOM:
			reconnection_token = r.raw_utf8(r.u8())
			serializer_id = r.raw_utf8(r.u8())
			var handshake_len := int(r.number())
			r.skip(handshake_len)
			# Secções extra [tag][len][payload] são ignoradas (compatibilidade futura).
			if r.failed:
				_fail("malformed JOIN_ROOM")
				return
			_ws.put_packet(PackedByteArray([ColyseusWire.JOIN_ROOM])) # confirmação
			if state == State.CONNECTING:
				state = State.JOINED
				joined.emit()
		ColyseusWire.ERROR:
			var ecode := int(r.number())
			var text := r.string()
			error.emit(ecode, text)
		ColyseusWire.LEAVE_ROOM:
			state = State.LEAVING
			_ws.close()
		ColyseusWire.ROOM_DATA:
			var type: Variant = r.string() if r.is_string_next() else int(r.number())
			if r.failed:
				return
			var payload: Variant = null
			if r.remaining() > 0:
				var res := MsgPack.decode(bytes, r.pos())
				if not res.ok():
					push_warning("ColyseusRoom: payload inválido (%s) tipo=%s" % [res.error, type])
					return
				payload = res.value
			message.emit(type, payload)
		ColyseusWire.ROOM_DATA_BYTES:
			var btype: Variant = r.string() if r.is_string_next() else int(r.number())
			message.emit(btype, bytes.slice(r.pos()))
		ColyseusWire.PING:
			if _ping_sent_at >= 0:
				pong.emit(Time.get_ticks_msec() - _ping_sent_at)
				_ping_sent_at = -1
		ColyseusWire.ROOM_STATE, ColyseusWire.ROOM_STATE_PATCH, ColyseusWire.ROOM_DATA_SCHEMA:
			pass # sem estado Schema neste jogo


func _fail(reason: String) -> void:
	var was_connecting := state == State.CONNECTING
	state = State.CLOSED
	if was_connecting:
		join_failed.emit(reason)
	else:
		left.emit(-1, reason)
