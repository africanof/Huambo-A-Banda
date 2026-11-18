extends Node
## Teste ponta-a-ponta do jogo REAL (cenas, autoloads e rede verdadeiros).
## Ativado com:  godot --headless --path client -- --autotest [--name=Robo] [--expect-peers=2]
## Sai com código 0 em sucesso, 1 em falha (usado pelo CI).

const TIMEOUT_S := 300.0

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

	if bairro and AppConfig.has_flag("life"):
		await _life_loop(world)
		await _places_loop(world)
	if bairro and AppConfig.has_flag("travel"):
		await _travel_loop()

	_finish(true, "")


## Ciclo de vida completo contra o servidor real: dinheiro inicial → pais → emprego → turno pago.
func _life_loop(world: Node) -> void:
	await _wait_for(func() -> Variant: return true if Net.me.has("money") else null)
	var m0 := int(Net.me.money)
	print("[autotest] família: %s · dinheiro inicial: %d Kz" % [Net.me.familyLabel, m0])
	Net.action("parents")
	await _wait_for(func() -> Variant: return true if bool(Net.me.get("parentsToday", false)) else null)
	print("[autotest] pais: %d → %d Kz" % [m0, int(Net.me.money)])
	Net.action("take_job", "zunga")
	await _wait_for(func() -> Variant: return true if str(Net.me.get("job", "")) == "zunga" else null)
	print("[autotest] emprego aceite: zunga")
	world.hud._open_phone("vagas")
	await _shot("jogo_telemovel_vagas")
	world.hud._open_phone("perfil")
	await _shot("jogo_telemovel_perfil")
	world.hud.phone.visible = false
	for wp: Vector2 in [Vector2(21.5, 27.0), Vector2(21.5, 32.0)]:
		world.request_move(wp)
		await _wait_for(func() -> Variant:
			var me: Variant = Net.entities.get(Net.self_id)
			return true if me != null and ((me.pos as Vector2) / 100.0).distance_to(wp) < 0.05 else null)
	await get_tree().create_timer(0.5).timeout
	var before := int(Net.me.money)
	Net.action("work")
	await _wait_for(func() -> Variant: return true if typeof(Net.me.get("busy")) == TYPE_DICTIONARY else null)
	print("[autotest] a trabalhar…")
	await get_tree().create_timer(4.0).timeout
	await _shot("jogo_a_trabalhar")
	await _wait_for(func() -> Variant: return true if int(Net.me.get("shifts", 0)) >= 1 else null)
	var gained := int(Net.me.money) - before
	print("[autotest] turno pago: +%d Kz" % gained)
	await _shot("jogo_turno_pago")
	# ir à cantina e abrir a ementa
	for wp: Vector2 in [Vector2(30.0, 24.0), Vector2(38.0, 16.0)]:
		world.request_move(wp)
		await _wait_for(func() -> Variant:
			var me: Variant = Net.entities.get(Net.self_id)
			return true if me != null and ((me.pos as Vector2) / 100.0).distance_to(wp) < 0.05 else null)
	await get_tree().create_timer(0.6).timeout
	world.hud._open_menu()
	await _shot("jogo_cantina_ementa")
	world.hud.menu_panel.visible = false
	if gained != 2000:
		_finish(false, "pagamento inesperado: %d" % gained)


## Andar por pontos (metros) e esperar que o servidor confirme cada um.
func _walk(world: Node, pts: Array) -> void:
	for wp: Vector2 in pts:
		world.request_move(wp)
		var t0 := Time.get_ticks_msec()
		await _wait_for(func() -> Variant:
			var me: Variant = Net.entities.get(Net.self_id)
			if Time.get_ticks_msec() - t0 > 15000:
				t0 = Time.get_ticks_msec()
				print("[autotest] ainda a andar para %s; servidor diz %s" % [wp, (me.pos as Vector2) / 100.0 if me != null else null])
			return true if me != null and ((me.pos as Vector2) / 100.0).distance_to(wp) < 0.08 else null)


func _spot(world: Node, interior: String, kind: String) -> Vector2:
	for p: Dictionary in world.view.places:
		if str(p.get("interior", "")) == interior and p.kind == kind:
			return Vector2(p.at[0], p.at[1])
	return Vector2.ZERO


func _inside_venue() -> String:
	var i: Variant = Net.me.get("inside")
	return str(i.venue) if typeof(i) == TYPE_DICTIONARY else ""


## Edifícios: entrar, usar o que o lugar oferece, sair (cantina, prédio, banco).
func _places_loop(world: Node) -> void:
	# já estamos à porta da cantina (fim do ciclo de vida)
	Net.action("enter")
	await _wait_for(func() -> Variant: return true if _inside_venue() == "cantina" else null)
	print("[autotest] entrei na cantina")
	await _walk(world, [_spot(world, "cantina", "food")])
	var m0 := int(Net.me.money)
	Net.action("eat", "arroz_feijao")
	await _wait_for(func() -> Variant: return true if int(Net.me.money) == m0 - 1000 else null)
	print("[autotest] comi na cantina: %d → %d Kz" % [m0, int(Net.me.money)])
	await _shot("jogo_dentro_cantina")
	Net.action("exit")
	await _wait_for(func() -> Variant: return true if _inside_venue() == "" else null)
	print("[autotest] saí para a rua")
	# Prédio Kuito: ver apartamentos (e arrendar se houver dinheiro)
	await _walk(world, [Vector2(40.0, 15.4), Vector2(40.0, 21.0), Vector2(50.0, 21.0), Vector2(50.0, 15.4)])
	Net.action("enter")
	await _wait_for(func() -> Variant: return true if typeof(Net.me.get("offer")) == TYPE_DICTIONARY else null)
	var offer: Dictionary = Net.me.offer
	print("[autotest] prédio: %d apartamentos à porta" % offer.units.size())
	await _shot("jogo_apartamentos_oferta")
	if int(Net.me.money) >= int(offer.rentPerDay):
		var unit := str(offer.units[0].id)
		Net.action("rent_house", unit, 1)
		await _wait_for(func() -> Variant: return true if _inside_venue() == "apartamentos" else null)
		print("[autotest] arrendei e entrei: %s" % unit)
		await _walk(world, [_spot(world, unit, "home_sleep")])
		Net.action("sleep")
		await _wait_for(func() -> Variant: return true if typeof(Net.me.get("busy")) == TYPE_DICTIONARY else null)
		await _shot("jogo_em_casa")
		Net.action("cancel")
		await _wait_for(func() -> Variant: return true if Net.me.get("busy") == null else null)
		Net.action("exit")
		await _wait_for(func() -> Variant: return true if _inside_venue() == "" else null)
	else:
		print("[autotest] sem dinheiro para arrendar (%d Kz)" % int(Net.me.money))
		world.hud.menu_panel.visible = false
	# Banco: depositar 500 Kz
	await _walk(world, [Vector2(50.0, 21.0), Vector2(64.0, 21.0), Vector2(64.0, 15.4)])
	Net.action("enter")
	await _wait_for(func() -> Variant: return true if _inside_venue() == "banco" else null)
	await _walk(world, [_spot(world, "banco", "bank")])
	Net.action("bank_in", "", 500)
	await _wait_for(func() -> Variant: return true if int(Net.me.get("bank", 0)) == 500 else null)
	print("[autotest] depositei 500 Kz no banco")
	world.hud._open_bank()
	await _shot("jogo_banco")
	world.hud.menu_panel.visible = false
	Net.action("exit")
	await _wait_for(func() -> Variant: return true if _inside_venue() == "" else null)
	print("[autotest] edifícios OK")


## Candongueiro para o Bairro de Fátima, e lá: Centro de Saúde (consulta).
func _travel_loop() -> void:
	var tree := get_tree()
	var dest := str(AppConfig.args.get("travel", "true"))
	if dest == "true" or dest == "1":
		dest = "bairro_fatima"
	Net.action("travel", dest)
	var world: Node = await _wait_for(func() -> Variant:
		var s := tree.current_scene
		return s if s and s.name == "BairroWorld" and s.local_char != null and str(Net.welcome.get("district", {}).get("id", "")) == dest and Net.entities.has(Net.self_id) else null)
	print("[autotest] cheguei ao %s" % Net.welcome.district.name)
	await _wait_for(func() -> Variant: return true if Net.me.has("money") else null)
	await _shot("fatima_chegada")
	var door := Vector2.ZERO
	for p: Dictionary in world.view.places:
		if p.kind == "door" and str(p.get("venue", "")) == "saude":
			door = Vector2(p.at[0], p.at[1])
	await _walk(world, [Vector2(47.0, 39.4), Vector2(door.x, 39.4), door + Vector2(0, 0.2)])
	Net.action("enter")
	await _wait_for(func() -> Variant: return true if _inside_venue() == "saude" else null)
	print("[autotest] entrei no Centro de Saúde")
	await _walk(world, [_spot(world, str(Net.me.inside.id), "service")])
	var m0 := int(Net.me.money)
	Net.action("service", "consulta" if m0 >= 3000 else "vacina")
	await _wait_for(func() -> Variant: return true if int(Net.me.money) < m0 else null)
	print("[autotest] consulta feita: %d → %d Kz" % [m0, int(Net.me.money)])
	Net.action("exit")
	await _wait_for(func() -> Variant: return true if _inside_venue() == "" else null)
	print("[autotest] viagem OK")


## Capturas de ecrã opcionais (CAPTURE_DIR) para revisão visual.
func _shot(name: String) -> void:
	var dir := OS.get_environment("CAPTURE_DIR")
	if dir == "" or DisplayServer.get_name() == "headless":
		return
	await get_tree().process_frame
	await get_tree().process_frame
	get_tree().root.get_texture().get_image().save_png(dir + "/" + name + ".png")


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
	if AppConfig.has_flag("stay"):
		return # continua no mundo (capturas de ecrã)
	Net.leave()
	get_tree().quit(0 if ok else 1)
