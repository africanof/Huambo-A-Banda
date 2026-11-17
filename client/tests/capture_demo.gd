extends SceneTree
## Captura de ecrãs da demo (apenas para revisão; corre com renderização real).
var out := OS.get_environment("CAPTURE_DIR")

func _initialize() -> void:
	_run()

func _shot(name: String) -> void:
	await process_frame
	await process_frame
	var img := root.get_texture().get_image()
	img.save_png(out + "/" + name + ".png")
	print("captura ", name, " ", img.get_size())

func _run() -> void:
	DemoState.zoom = 0.62
	DemoState.time_min = 10.5 * 60
	change_scene_to_file("res://src/demo/bairro_demo.tscn")
	for i in 20: await process_frame
	var scene := current_scene
	scene.player.world_pos = Vector2(20, 18.2)
	scene.time_speed = 0.0
	for i in 30:
		scene.player.step(Vector2(1, 0).normalized(), 1.0 / 60.0)
		await process_frame
	await _shot("rua_dia")
	# vídeo: caminhar pela avenida, trocar de personagem a meio, ao entardecer
	scene.camera.zoom = Vector2(0.5, 0.5)
	scene.player.world_pos = Vector2(10, 18.5)
	scene.time_min = 16.8 * 60
	scene.time_speed = 60.0
	var dirs := [Vector2(1, 0), Vector2(1, 0), Vector2(0, 1), Vector2(1, 0), Vector2(0, -1)]
	var f := 0
	for d in dirs:
		for i in 45:
			scene.player.step(d, 1.0 / 30.0)
			scene.time_min += 1.0
			scene._apply_time()
			await process_frame
			if i % 1 == 0:
				var img := root.get_texture().get_image()
				img.save_jpg(out + "/video/f%04d.jpg" % f, 0.9)
				f += 1
		if d == Vector2(0, 1):
			scene.player.set_character("mulher")
	scene.time_speed = 0.0
	scene.time_min = 10.5 * 60
	scene._apply_time()
	scene.camera.zoom = Vector2(0.3, 0.3)
	for i in 10: await process_frame
	await _shot("rua_visao_geral")
	scene.player.world_pos = Vector2(72, 24)
	for i in 30: await process_frame
	await _shot("rua_leste")
	scene.time_min = 20.5 * 60
	scene._apply_time()
	for i in 5: await process_frame
	await _shot("rua_noite")
	scene.time_min = 11 * 60
	scene._apply_time()
	scene.camera.zoom = Vector2(1.1, 1.1)
	scene.player.set_character("mulher")
	for i in 20:
		scene.player.step(Vector2(0, 1), 1.0 / 60.0)
		await process_frame
	await _shot("rua_zoom_mulher")
	DemoState.furniture = [
		{"id": "movel_tapete", "x": 2.5, "y": 2.0, "flip": false},
		{"id": "movel_sofa", "x": 1.0, "y": 1.0, "flip": false},
		{"id": "movel_mesa_centro", "x": 3.0, "y": 2.5, "flip": false},
		{"id": "movel_tv", "x": 3.0, "y": 4.5, "flip": false},
		{"id": "movel_planta", "x": 0.5, "y": 5.5, "flip": false},
		{"id": "movel_candeeiro", "x": 0.5, "y": 0.5, "flip": false},
		{"id": "movel_mesa_jantar", "x": 5.0, "y": 1.0, "flip": false},
	]
	DemoState._loaded = true
	change_scene_to_file("res://src/demo/casa_interior.tscn")
	for i in 20: await process_frame
	await _shot("interior")
	quit()
