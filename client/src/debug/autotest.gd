extends Node
## Teste ponta-a-ponta do jogo REAL (cenas, autoloads e rede verdadeiros).
## Ativado com:  godot --headless --path client -- --autotest [--name=Robo] [--expect-peers=2]
## Sai com código 0 em sucesso, 1 em falha (usado pelo CI).

const TIMEOUT_S := 600.0

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
	if bairro and AppConfig.has_flag("views"):
		await _views_loop()
	if bairro and AppConfig.has_flag("social"):
		var why: String = await _social_loop()
		if why != "":
			_finish(false, why)
			return
	if bairro and AppConfig.has_flag("portas"):
		var falhas: Array = await _doors_loop()
		if not falhas.is_empty():
			_finish(false, "portas: " + ", ".join(falhas))
			return

	_finish(true, "")


## Dois jogadores perto: cada um fala e faz um gesto; tem de ouvir o outro. Também roda a sorte.
func _social_loop() -> String:
	var me_name := str(AppConfig.args.get("name", "eu"))
	var got_emote := [false]
	Net.emote_received.connect(func(id: int, _e: String) -> void:
		if id != Net.self_id:
			got_emote[0] = true)
	await get_tree().create_timer(1.0).timeout
	Net.say("Olá, sou o %s!" % me_name)
	Net.emote("acenar")
	var t0 := Time.get_ticks_msec()
	var heard: Variant = await _wait_for(func() -> Variant:
		for l: Dictionary in Net.chat_log:
			if int(l.id) != Net.self_id:
				return true
		return false if Time.get_ticks_msec() - t0 > 20000 else null)
	if not heard:
		return "não ouvi o outro jogador"
	await _wait_for(func() -> Variant: return true if got_emote[0] or Time.get_ticks_msec() - t0 > 20000 else null)
	if not got_emote[0]:
		return "não vi o gesto do outro jogador"
	print("[autotest] ouvi: %s" % ", ".join(Net.chat_log.map(func(l: Dictionary) -> String: return "%s: %s" % [l.n, l.t])))
	var m0 := int(Net.me.get("money", 0))
	Net.action("sorte")
	await _wait_for(func() -> Variant: return true if bool(Net.me.get("sorteHoje", false)) else null)
	print("[autotest] sorte do dia: %+d Kz" % (int(Net.me.get("money", 0)) - m0))
	# amizade: o primeiro (ordem alfabética) convida, o outro aceita
	var other := -1
	for id: int in Net.entities:
		if id != Net.self_id:
			other = id
	var my_name := str(Net.entities.get(Net.self_id, {}).get("name", me_name))
	if my_name < str(Net.entities[other].name):
		Net.action("amigo_pedir", str(other))
	t0 = Time.get_ticks_msec()
	var friends: Variant = await _wait_for(func() -> Variant:
		if typeof(Net.me.get("friendReq")) == TYPE_DICTIONARY:
			Net.action("amigo_aceitar")
		if (Net.me.get("friends", []) as Array).size() >= 1:
			return true
		return false if Time.get_ticks_msec() - t0 > 20000 else null)
	if not friends:
		return "amizade não ficou feita"
	print("[autotest] amigos: %s" % [Net.me.friends])
	# rádio: dedicatória de cada um; tem de ouvir a do outro
	var heard_radio := [false]
	Net.radio_received.connect(func(who: String, _t: String) -> void:
		if who != my_name:
			heard_radio[0] = true)
	Net.radio("Dedicatória do %s para o Huambo" % me_name)
	t0 = Time.get_ticks_msec()
	await _wait_for(func() -> Variant: return true if heard_radio[0] or Time.get_ticks_msec() - t0 > 15000 else null)
	if not heard_radio[0]:
		return "não ouvi a rádio do outro"
	# biscato na rua (zungar) paga ao fim de uns segundos
	var m1 := int(Net.me.get("money", 0))
	Net.action("biscato", "zungar")
	t0 = Time.get_ticks_msec()
	var paid: Variant = await _wait_for(func() -> Variant:
		if int(Net.me.get("biscatos", {}).get("feitos", 0)) >= 1:
			return true
		return false if Time.get_ticks_msec() - t0 > 25000 else null)
	if not paid:
		return "biscato não pagou"
	print("[autotest] biscato: %+d Kz" % (int(Net.me.get("money", 0)) - m1))
	# câmbio: compra 1 dólar
	Net.action("cambio_compra", "", 1)
	await _wait_for(func() -> Variant: return true if int(Net.me.get("cambio", {}).get("usd", 0)) >= 1 or Time.get_ticks_msec() - t0 > 40000 else null)
	if int(Net.me.get("cambio", {}).get("usd", 0)) < 1:
		return "câmbio falhou"
	# lavra: semear batata-doce e regar; ambição: escolher
	Net.action("lavra_semear", "batata_doce")
	Net.action("lavra_regar")
	Net.action("ambicao_escolher", "agricultor")
	t0 = Time.get_ticks_msec()
	var farm: Variant = await _wait_for(func() -> Variant:
		var l: Variant = Net.me.get("lavra")
		var a: Variant = Net.me.get("ambicao")
		if typeof(l) == TYPE_DICTIONARY and bool(l.watered) and typeof(a) == TYPE_DICTIONARY:
			return true
		return false if Time.get_ticks_msec() - t0 > 15000 else null)
	if not farm:
		return "lavra/ambição falhou"
	print("[autotest] lavra: %s · ambição: %s · tempo: %s" % [Net.me.lavra, Net.me.ambicao.text, Net.me.tempo.texto])
	# jornal tem a dedicatória
	var j: Variant = await Net.get_json("/jornal")
	if typeof(j) != TYPE_DICTIONARY or not (j.noticias as Array).any(func(n: Dictionary) -> bool: return str(n.kind) == "radio"):
		return "jornal sem a dedicatória"
	print("[autotest] jornal: %d notícias, câmbio %s" % [(j.noticias as Array).size(), j.cambio.rate])
	await get_tree().create_timer(3.0).timeout # deixa o outro também acabar
	return ""


## Como um jogador: toca em cada edifício com nome do bairro (a personagem anda até à porta e entra
## sozinha), confirma que ficou lá dentro e sai pelo botão «Sair». Devolve as portas que falharam.
func _doors_loop() -> Array:
	var tree := get_tree()
	var w: Node = tree.current_scene
	await _wait_for(func() -> Variant: return true if Net.me.has("money") else null)
	var falhas: Array = []
	var n := 0
	for p: Dictionary in w.view.places:
		if p.kind != "door" or str(p.get("venue", "")) in ["casa", "apartamentos"]:
			continue
		n += 1
		var want := str(p.interiors[0])
		# toque no edifício (centro da imagem) → anda e entra
		var sprite_hit := Vector2.INF
		var entry: Variant = w.view._building_sprites.get(BairroView.door_key(str(p.id)))
		if entry != null:
			var sp: Sprite2D = entry[0]
			sprite_hit = sp.position + Vector2(0, -sp.texture.get_height() * sp.scale.y * 0.35)
		var target: Dictionary = w.view.door_at(sprite_hit) if sprite_hit != Vector2.INF else {}
		if str(target.get("id", "")) != str(p.id):
			falhas.append("%s (toque no edifício não deu a porta certa)" % p.name)
			target = p
		w._go_station(target)
		var t0 := Time.get_ticks_msec()
		var ok: Variant = await _wait_for(func() -> Variant:
			var ins: Variant = Net.me.get("inside")
			if typeof(ins) == TYPE_DICTIONARY and str(ins.id) == want:
				return true
			return false if Time.get_ticks_msec() - t0 > 60000 else null)
		if not ok:
			var me_e: Variant = Net.entities.get(Net.self_id)
			print("[autotest] falhou %s: eu=%s servidor=%s porta=%s tentativas=%d pendente=%s alvo=%s caminho=%d" % [p.name, w.local_char.world_pos, (me_e.pos / 100.0) if me_e else "?", p.at, w._pending_tries, w._pending_station, w._click_target, w._path.size()])
			falhas.append("%s (não entrou)" % p.name)
			continue
		print("[autotest] entrei: %s (%.1f s)" % [p.name, (Time.get_ticks_msec() - t0) / 1000.0])
		await tree.create_timer(0.4).timeout
		Net.action("exit")
		await _wait_for(func() -> Variant: return true if typeof(Net.me.get("inside")) != TYPE_DICTIONARY else null)
		await tree.create_timer(0.4).timeout
	print("[autotest] portas: %d, falhas: %d" % [n, falhas.size()])
	return falhas


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
	# transporte só na 🚏 paragem
	var w0: Node = tree.current_scene
	for p: Dictionary in w0.view.places:
		if p.kind == "stop":
			var sp := Vector2(p.at[0], p.at[1])
			w0.request_move(sp)
			await _wait_for(func() -> Variant:
				var me: Variant = Net.entities.get(Net.self_id)
				return true if me != null and ((me.pos as Vector2) / 100.0).distance_to(sp) < 1.5 else null)
	print("[autotest] na paragem")
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
	world.request_move(door)
	await _wait_for(func() -> Variant:
		var me: Variant = Net.entities.get(Net.self_id)
		return true if me != null and ((me.pos as Vector2) / 100.0).distance_to(door) < 2.0 else null)
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
	if AppConfig.has_flag("walk"):
		await _walk_loop()


## A pé: ir até à placa no fim da rua e passar para o bairro vizinho real.
func _walk_loop() -> void:
	var tree := get_tree()
	var world: Node = tree.current_scene
	var here := str(Net.welcome.district.id)
	var portal: Dictionary = {}
	for p: Dictionary in world.view.places:
		if p.kind == "portal":
			portal = p
			break
	var dest := str(portal.to)
	world.request_move(Vector2(portal.at[0], portal.at[1]))
	await _wait_for(func() -> Variant:
		var me: Variant = Net.entities.get(Net.self_id)
		return true if me != null and ((me.pos as Vector2) / 100.0).distance_to(Vector2(portal.at[0], portal.at[1])) < 2.5 else null)
	print("[autotest] cheguei à placa para %s" % portal.name)
	await _shot("a_pe_placa")
	var m0 := int(Net.me.money)
	Net.action("travel", dest)
	await _wait_for(func() -> Variant:
		var s := tree.current_scene
		return true if s and s.name == "BairroWorld" and s.local_char != null and str(Net.welcome.get("district", {}).get("id", "")) == dest and Net.entities.has(Net.self_id) and Net.me.has("money") else null)
	world = tree.current_scene
	# apareceu no fim da rua que vem do bairro de onde saiu
	var back: Dictionary = {}
	for p: Dictionary in world.view.places:
		if p.kind == "portal" and str(p.to) == here:
			back = p
	var me_pos: Vector2 = (Net.entities[Net.self_id].pos as Vector2) / 100.0
	var d := me_pos.distance_to(Vector2(back.at[0], back.at[1])) if not back.is_empty() else 999.0
	print("[autotest] a pé até %s: dinheiro %d → %d, a %.1f m da placa de volta" % [Net.welcome.district.name, m0, int(Net.me.money), d])
	await _shot("a_pe_chegada")
	if int(Net.me.money) != m0 or d > 12.0:
		_finish(false, "viagem a pé errada")


## Volta pelos modos de vista (rua e interior) com capturas, para revisão visual.
func _views_loop() -> void:
	var tree := get_tree()
	var world: Node = tree.current_scene
	await tree.create_timer(6.0).timeout
	print("[autotest] rua estável: %d fps" % Engine.get_frames_per_second())
	await _shot("rua_aerea")
	# telemóvel (ecrã inicial e uma app)
	if AppConfig.has_flag("telemovel"):
		world.hud._open_phone("inicio")
		await tree.create_timer(4.0).timeout
		await _shot("tel_inicio")
		world.hud._open_phone("missoes")
		await tree.create_timer(2.0).timeout
		await _shot("tel_missoes")
		for app: String in ["lavras", "ambicao", "ricos", "tempo"]:
			world.hud._open_phone(app)
			await tree.create_timer(2.5).timeout
			await _shot("tel_" + app)
		world.hud.phone.visible = false
		world.hud._open_map()
		await tree.create_timer(5.0).timeout
		var sc: ScrollContainer = world.hud.menu_panel.get_child(0)
		sc.scroll_vertical = 520
		await tree.create_timer(2.0).timeout
		await _shot("mapa_catalogo")
		sc.scroll_vertical = 1300
		await tree.create_timer(2.0).timeout
		await _shot("mapa_catalogo2")
		world.hud.menu_panel.visible = false
		world.hud._open_chat()
		await tree.create_timer(2.0).timeout
		await _shot("falar_painel")
		world.hud.menu_panel.visible = false
		Net.say("Bom dia, Huambo! Tudo bem?")
		Net.emote("dancar")
		await tree.create_timer(1.5).timeout
		await _shot("falar_balao")
	# bordas do bairro: o que se vê para lá dos limites (só paisagem)
	if AppConfig.has_flag("bordas"):
		var cam: Camera2D = world.camera
		var z0: Vector2 = cam.zoom
		world._follow = false
		cam.position_smoothing_enabled = false
		for e: Array in [["longe", Vector2(0.5, 0.5), 0.22], ["borda_e", Vector2(0.0, 0.5), 0.4], ["borda_s", Vector2(0.5, 1.0), 0.4], ["borda_n", Vector2(0.5, 0.0), 0.4]]:
			cam.zoom = Vector2.ONE * float(e[2])
			cam.position = Iso.to_screen(world.view.size * (e[1] as Vector2))
			await tree.process_frame
			await tree.create_timer(7.0).timeout
			await _shot("bairro_" + str(e[0]))
		cam.zoom = z0
		cam.position_smoothing_enabled = true
		world._follow = true
	for i in 3:
		world._on_hud_action("rodar")
		await tree.create_timer(1.2).timeout
		await _shot("rua_rodar%d" % (i + 1))
	world._on_hud_action("rodar")
	await tree.create_timer(1.2).timeout
	world._on_hud_action("vista3d")
	await tree.create_timer(2.5).timeout
	await _shot("rua_ombro")
	world.view3d.yaw += PI / 2
	await tree.create_timer(1.0).timeout
	await _shot("rua_ombro_lado")
	world._on_hud_action("vista3d")
	await tree.create_timer(1.5).timeout
	await _shot("rua_olhos")
	world._on_hud_action("vista3d")
	await tree.create_timer(1.0).timeout
	# entrar num edifício com nome (o mais perto)
	var me: Vector2 = (Net.entities[Net.self_id].pos as Vector2) / 100.0
	var door: Dictionary = {}
	for p: Dictionary in world.view.places:
		if p.kind == "door" and str(p.get("venue", "")) not in ["casa", "apartamentos"]:
			if door.is_empty() or Vector2(p.at[0], p.at[1]).distance_to(me) < Vector2(door.at[0], door.at[1]).distance_to(me):
				door = p
	var dp := Vector2(door.at[0], door.at[1])
	world.request_move(dp)
	await _wait_for(func() -> Variant:
		var m: Variant = Net.entities.get(Net.self_id)
		return true if m != null and ((m.pos as Vector2) / 100.0).distance_to(dp) < 2.0 else null)
	await _shot("porta")
	Net.action("enter")
	await _wait_for(func() -> Variant: return true if _inside_venue() != "" else null)
	await tree.create_timer(1.5).timeout
	await _shot("interior_aereo")
	for i in 3:
		world._on_hud_action("rodar")
		await tree.create_timer(1.2).timeout
		await _shot("interior_rodar%d" % (i + 1))
	world._on_hud_action("rodar")
	await tree.create_timer(1.0).timeout
	world._on_hud_action("vista3d")
	await tree.create_timer(2.5).timeout
	await _shot("interior_ombro")
	world._on_hud_action("vista3d")
	await tree.create_timer(1.5).timeout
	await _shot("interior_olhos")
	world._on_hud_action("vista3d")
	await tree.create_timer(1.0).timeout
	print("[autotest] vistas OK")


## Capturas de ecrã opcionais (CAPTURE_DIR) para revisão visual.
func _shot(name: String) -> void:
	if OS.has_feature("web"):
		# no navegador: o Playwright tira a captura quando vê esta linha
		await get_tree().create_timer(0.8).timeout
		var w: Node = get_tree().current_scene
		if w and "_fade" in w:
			print("[autotest] %s: escurecimento=%.2f rot=%d fps=%d" % [name, w._fade.color.a, Iso.rot, Engine.get_frames_per_second()])
		print("[shot] " + name)
		await get_tree().create_timer(0.7).timeout
		return
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
