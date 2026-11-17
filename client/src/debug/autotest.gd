extends Node
## Teste ponta-a-ponta do jogo REAL (cenas, autoloads e rede verdadeiros).
## Ativado com:  godot --headless --path client -- --autotest [--name=Robo] [--expect-peers=2]
## Sai com código 0 em sucesso, 1 em falha (usado pelo CI).

const TIMEOUT_S := 40.0

var _started := 0


func _ready() -> void:
	_started = Time.get_ticks_msec()
	_run()


func _process(_delta: float) -> void:
	if Time.get_ticks_msec() - _started > TIMEOUT_S * 1000.0:
		_finish(false, "timeout global")


func _run() -> void:
	var tree := get_tree()
	var login: Node = await _wait_for(func() -> Variant: return tree.current_scene if tree.current_scene and tree.current_scene.name == "LoginScreen" else null)
	login.name_edit.text = AppConfig.args.get("name", "Robo")
	login._on_guest()

	var world: Node = await _wait_for(func() -> Variant:
		var s := tree.current_scene
		return s if s and s.name in ["World", "BairroWorld"] and s.local_char != null else null)
	var bairro: bool = world.name == "BairroWorld"
	var me0: Dictionary = await _wait_for(func() -> Variant: return Net.entities.get(Net.self_id))
	var start: Vector2 = me0.pos
	print("[autotest] no mundo (%s) como eid=%d em %s" % [world.name, Net.self_id, start])

	# Escolhe um destino caminhável perto e pede para andar.
	var target: Variant = null
	for off: Vector2 in [Vector2(120, 0), Vector2(-120, 0), Vector2(0, 120), Vector2(0, -120)]:
		if bairro:
			var t_m: Vector2 = (start + off) / 100.0
			var free := true
			for r: Rect2 in world.view.obstacles:
				if r.grow(0.4).has_point(t_m):
					free = false
			if free:
				target = start + off
				world.request_move(t_m)
				break
		else:
			target = Movement.sanitize_target(world.map, start.x + off.x, start.y + off.y)
			if target != null:
				world.request_move(target)
				break

	# Confirmação AUTORITATIVA: a posição vem dos snapshots do servidor.
	await _wait_for(func() -> Variant:
		var me: Variant = Net.entities.get(Net.self_id)
		return true if me != null and (me.pos as Vector2).distance_to(target) < 2.0 else null)
	print("[autotest] servidor confirmou o movimento até %s" % [target])

	var peers := int(AppConfig.args.get("expect-peers", "1"))
	if peers > 1:
		await _wait_for(func() -> Variant: return true if (world.avatars.size() if bairro else world.characters.size()) >= peers else null)
		print("[autotest] vejo %d jogadores" % (world.avatars.size() if bairro else world.characters.size()))
		# Fica mais um pouco para os outros clientes também nos verem.
		await tree.create_timer(3.0).timeout

	_finish(true, "")


func _wait_for(cond: Callable) -> Variant:
	while true:
		var v: Variant = cond.call()
		if v != null:
			return v
		await get_tree().process_frame
	return null


func _finish(ok: bool, reason: String) -> void:
	set_process(false)
	if ok:
		print("AUTOTEST OK")
	else:
		printerr("AUTOTEST FAIL: ", reason)
	Net.leave()
	get_tree().quit(0 if ok else 1)
