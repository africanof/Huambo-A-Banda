extends SceneTree
## Teste visual da marcha: câmara FIXA, personagem atravessa o ecrã. Grava frames para vídeo.
var out := OS.get_environment("CAPTURE_DIR")

func _initialize() -> void:
	_run()

func _run() -> void:
	DemoState.time_min = 10.5 * 60
	change_scene_to_file("res://src/demo/bairro_demo.tscn")
	for i in 20: await process_frame
	var scene := current_scene
	scene.time_speed = 0.0
	scene.set_process(false) # o teclado não interfere
	var cam: Camera2D = scene.camera
	cam.get_parent().remove_child(cam)
	scene.add_child(cam)
	cam.position_smoothing_enabled = false
	cam.zoom = Vector2(1.0, 1.0)
	var f := 0
	for cid in ["homem", "mulher"]:
		scene.player.set_character(cid)
		for leg in [[Vector2(14, 18.4), Vector2(1, 0)], [Vector2(22, 17.0), Vector2(0, 1)], [Vector2(22, 19.5), Vector2(0, -1)]]:
			scene.player.world_pos = leg[0]
			cam.position = Iso.to_screen(leg[0] + leg[1] * 2.2) + Vector2(0, -60)
			for i in 75: # 2,5 s a 30 fps
				scene.player.running = false
				scene.player.step(leg[1], 1.0 / 30.0)
				await process_frame
				root.get_texture().get_image().save_jpg(out + "/walk/f%04d.jpg" % f, 0.9)
				f += 1
	print("frames ", f)
	quit()
