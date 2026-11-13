class_name ColyseusClient
extends Node
## Matchmaking HTTP do Colyseus + criação da ligação à sala.
##
##   var res := await client.join_or_create("district", {"v": 1, "district": "cidade_baixa"})
##   if res.room: ...  else: print(res.error)

## Resultado de uma tentativa de entrada.
class JoinResult:
	var room: ColyseusRoom
	var error := ""
	var code := 0

var endpoint := "http://127.0.0.1:2567" ## http(s)://host[:porta]
var auth_token := ""


func join_or_create(room_name: String, options: Dictionary = {}) -> JoinResult:
	return await _matchmake("joinOrCreate", room_name, options)


func join_by_id(room_id: String, options: Dictionary = {}) -> JoinResult:
	return await _matchmake("joinById", room_id, options)


func _matchmake(method: String, target: String, options: Dictionary) -> JoinResult:
	var result := JoinResult.new()
	var http := HTTPRequest.new()
	http.timeout = 10.0
	add_child(http)
	var headers := PackedStringArray(["Content-Type: application/json", "Accept: application/json"])
	if not auth_token.is_empty():
		headers.append("Authorization: Bearer " + auth_token)
	var url := "%s/matchmake/%s/%s" % [endpoint.rstrip("/"), method, target.uri_encode()]
	var err := http.request(url, headers, HTTPClient.METHOD_POST, JSON.stringify(options))
	if err != OK:
		http.queue_free()
		result.error = "http request error %d" % err
		return result

	var response: Array = await http.request_completed
	http.queue_free()
	var status: int = response[1]
	var body: PackedByteArray = response[3]
	if response[0] != HTTPRequest.RESULT_SUCCESS:
		result.error = "network error %d" % response[0]
		return result

	var data: Variant = JSON.parse_string(body.get_string_from_utf8())
	if status != 200 or typeof(data) != TYPE_DICTIONARY:
		result.code = int(data.get("code", status)) if typeof(data) == TYPE_DICTIONARY else status
		result.error = str(data.get("error", "HTTP %d" % status)) if typeof(data) == TYPE_DICTIONARY else "HTTP %d" % status
		return result

	var room := ColyseusRoom.new()
	room.name = "Room_%s" % data.get("roomId", "")
	room.room_id = str(data.get("roomId", ""))
	room.session_id = str(data.get("sessionId", ""))
	add_child(room)
	room.connect_to(_ws_url(data))
	var ok: Array = [false, ""]
	var on_joined := func() -> void: ok[0] = true
	var on_failed := func(reason: String) -> void: ok[1] = reason
	room.joined.connect(on_joined)
	room.join_failed.connect(on_failed)
	while not ok[0] and ok[1] == "":
		await get_tree().process_frame
	room.joined.disconnect(on_joined)
	room.join_failed.disconnect(on_failed)
	if not ok[0]:
		room.queue_free()
		result.error = ok[1]
		return result
	result.room = room
	return result


func _ws_url(seat: Dictionary) -> String:
	var secure := endpoint.begins_with("https://")
	var scheme := "wss://" if secure else "ws://"
	var host: String
	if seat.has("publicAddress") and str(seat.publicAddress) != "":
		host = str(seat.publicAddress) # processo específico (escala horizontal)
	else:
		host = endpoint.split("://", true, 1)[1].rstrip("/")
	return "%s%s/%s/%s?sessionId=%s" % [scheme, host, seat.processId, seat.roomId, str(seat.sessionId).uri_encode()]
