extends Control
## Ecrã de entrada: convidado ou conta Supabase, e escolha do bairro.

const DISTRICTS := [["cidade_baixa", "Cidade Baixa"], ["bairro_fatima", "Bairro de Fátima"], ["huambo_centro", "Huambo — mapa completo (protótipo)"]]

@onready var name_edit: LineEdit = %NameEdit
@onready var district_option: OptionButton = %DistrictOption
@onready var guest_button: Button = %GuestButton
@onready var email_edit: LineEdit = %EmailEdit
@onready var password_edit: LineEdit = %PasswordEdit
@onready var login_button: Button = %LoginButton
@onready var signup_button: Button = %SignupButton
@onready var account_box: Control = %AccountBox
@onready var status_label: Label = %StatusLabel


func _ready() -> void:
	if AppConfig.has_flag("demo") or OS.has_feature("demo"):
		# demonstração do novo estilo gráfico HD (sem servidor)
		get_tree().change_scene_to_file.call_deferred("res://src/demo/bairro_demo.tscn")
		return
	_fill_districts(DISTRICTS)
	_load_districts()
	account_box.visible = Auth.supabase_enabled()
	guest_button.pressed.connect(_on_guest)
	login_button.pressed.connect(_on_login)
	signup_button.pressed.connect(_on_signup)
	name_edit.text_submitted.connect(func(_t: String) -> void: _on_guest())
	status_label.text = Net.last_error
	Net.last_error = ""
	if AppConfig.has_flag("autotest") and not get_tree().root.has_node("Autotest"):
		var t := preload("res://src/debug/autotest.gd").new()
		t.name = "Autotest"
		get_tree().root.add_child.call_deferred(t)


var _districts: Array = []


func _fill_districts(list: Array) -> void:
	_districts = list
	district_option.clear()
	for i in list.size():
		district_option.add_item(list[i][1], i)
		if list[i][0] == AppConfig.default_district:
			district_option.select(i)


## Lista de bairros do servidor (Cidade Baixa primeiro, depois por ordem alfabética).
func _load_districts() -> void:
	var http := HTTPRequest.new()
	add_child(http)
	if http.request(AppConfig.server_url + "/districts") != OK:
		return
	var r: Array = await http.request_completed
	http.queue_free()
	if r[0] != HTTPRequest.RESULT_SUCCESS:
		return
	var data: Variant = JSON.parse_string((r[3] as PackedByteArray).get_string_from_utf8())
	if typeof(data) != TYPE_ARRAY:
		return
	var list := []
	for d: Dictionary in data:
		var m: Variant = d.get("map")
		if typeof(m) == TYPE_DICTIONARY and str(m.get("id", "")).begins_with("bairro:"):
			list.append([str(d.id), str(d.name)])
	list.sort_custom(func(a: Array, b: Array) -> bool: return a[0] == "cidade_baixa" or (b[0] != "cidade_baixa" and a[1].naturalnocasecmp_to(b[1]) < 0))
	if not list.is_empty():
		var sel := _selected_district()
		_fill_districts(list)
		for i in list.size():
			if list[i][0] == sel:
				district_option.select(i)


func _selected_district() -> String:
	var i := district_option.get_selected_id()
	return _districts[i][0] if i >= 0 and i < _districts.size() else "cidade_baixa"


func _on_guest() -> void:
	await _run(func() -> String: return await Auth.sign_in_guest(name_edit.text.strip_edges()))


func _on_login() -> void:
	await _run(func() -> String: return await Auth.sign_in_email(email_edit.text.strip_edges(), password_edit.text))


func _on_signup() -> void:
	await _run(func() -> String: return await Auth.sign_up_email(email_edit.text.strip_edges(), password_edit.text, name_edit.text.strip_edges()))


## Autentica e entra no bairro, mostrando o progresso.
func _run(auth_step: Callable) -> void:
	_set_busy(true, "A autenticar…")
	var err: String = await auth_step.call()
	if err != "":
		_set_busy(false, err)
		return
	_set_busy(true, "A preparar o bairro…")
	err = await Packs.ensure_bairro(_selected_district())
	if err != "":
		_set_busy(false, err)
		return
	_set_busy(true, "A entrar no bairro…")
	err = await Net.join_district(_selected_district())
	if err != "":
		_set_busy(false, err)
		return
	if Net.welcome.is_empty():
		await Net.welcomed
	var map_id := str(Net.welcome.get("district", {}).get("map", {}).get("id", ""))
	get_tree().change_scene_to_file("res://src/game/bairro_world.tscn" if map_id.begins_with("bairro:") else "res://src/world/world.tscn")


func _set_busy(busy: bool, text: String) -> void:
	status_label.text = text
	for b: Button in [guest_button, login_button, signup_button]:
		b.disabled = busy
