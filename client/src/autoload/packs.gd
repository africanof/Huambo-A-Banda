extends Node
## Pacotes de arte por bairro (kits gerados por IA), descarregados só quando são precisos.
##
## O jogo base traz a Cidade Baixa; cada outro bairro tem o seu .pck (~2 MB) servido pelo
## servidor de jogo em /packs/<kit>.pck. Fica guardado no aparelho (user://packs) com a versão
## no nome: só se descarrega outra vez quando a arte muda.

signal progress(text: String)

const CACHE := "user://packs/"


## Garante a arte de um bairro (pelo id do bairro). Devolve "" ou a mensagem de erro.
func ensure_bairro(district: String) -> String:
	if not FileAccess.file_exists("res://assets/bairros/%s.json" % district):
		return "" # mapa antigo (grelha) ou bairro sem kits
	var d := BairroView.load_data(district)
	return await ensure(d.get("kits", []), d.get("kit_versions", {}))


## Garante que os kits estão carregados. Devolve "" ou a mensagem de erro.
func ensure(kits: Array, versions: Dictionary) -> String:
	for k: Variant in kits:
		var kit := str(k)
		if DemoAssets.load_kit(kit):
			continue # já carregado, ou incluído no projeto (editor, testes)
		var ver := str(versions.get(kit, "0"))
		var local := CACHE + "%s-%s.pck" % [kit, ver]
		if not FileAccess.file_exists(local):
			progress.emit("A descarregar o bairro…")
			var err := await _download("%s/packs/%s.pck?v=%s" % [AppConfig.server_url, kit, ver], local)
			if err != "":
				return err
		if not ProjectSettings.load_resource_pack(local, true):
			DirAccess.remove_absolute(local) # pacote estragado: descarrega de novo da próxima vez
			return "Não foi possível abrir o pacote do bairro."
		if not DemoAssets.load_kit(kit):
			return "O pacote do bairro está incompleto."
	return ""


func _download(url: String, path: String) -> String:
	DirAccess.make_dir_recursive_absolute(CACHE)
	var http := HTTPRequest.new()
	http.download_file = path + ".part"
	http.timeout = 120.0
	add_child(http)
	var started := http.request(url)
	if started != OK:
		http.queue_free()
		return "Sem ligação ao servidor."
	var r: Array = await http.request_completed
	http.queue_free()
	if r[0] != HTTPRequest.RESULT_SUCCESS or int(r[1]) != 200:
		DirAccess.remove_absolute(path + ".part")
		return "Falhou a descarga do bairro (%s)." % str(r[1])
	DirAccess.rename_absolute(path + ".part", path)
	return ""
