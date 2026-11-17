extends Control
## Ecrã de entrada: convidado ou conta Supabase, e escolha do bairro.

const DISTRICTS := [["huambo_centro", "Huambo — Centro"]]

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
	for i in DISTRICTS.size():
		district_option.add_item(DISTRICTS[i][1], i)
		if DISTRICTS[i][0] == AppConfig.default_district:
			district_option.select(i)
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


func _selected_district() -> String:
	return DISTRICTS[district_option.get_selected_id()][0]


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
	_set_busy(true, "A entrar no bairro…")
	err = await Net.join_district(_selected_district())
	if err != "":
		_set_busy(false, err)
		return
	get_tree().change_scene_to_file("res://src/world/world.tscn")


func _set_busy(busy: bool, text: String) -> void:
	status_label.text = text
	for b: Button in [guest_button, login_button, signup_button]:
		b.disabled = busy
