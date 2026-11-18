extends SceneTree
func _init() -> void:
	var bad := 0
	for f in ["res://src/game/travel_view.gd", "res://src/game/view3d.gd", "res://src/game/huambo_map.gd", "res://src/game/bairro_view.gd"]:
		var s: Script = load(f)
		if s == null or not s.can_instantiate():
			print("FALHA ", f); bad += 1
	print("verificados, falhas=", bad)
	quit(bad)
