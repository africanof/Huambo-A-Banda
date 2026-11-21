class_name Instalar
extends RefCounted
## Instalar o jogo no telemóvel (aplicação web): ícone no ecrã principal, ecrã inteiro, sem barra do browser.
## Android/Chrome: o browser oferece instalar (guardamos esse convite em window.hbInstall, no index.html).
## iPhone: não há convite; explica-se «Partilhar → Adicionar ao ecrã principal».


static func _js(code: String) -> Variant:
	if not OS.has_feature("web"):
		return null
	return JavaScriptBridge.eval(code, true)


## Já está a correr como app instalada?
static func installed() -> bool:
	return int(_js("(window.matchMedia('(display-mode: fullscreen)').matches || window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) ? 1 : 0") if OS.has_feature("web") else 0) == 1


static func can_prompt() -> bool:
	return OS.has_feature("web") and int(_js("window.hbInstall ? 1 : 0")) == 1


static func is_ios() -> bool:
	return OS.has_feature("web") and int(_js("/iphone|ipad|ipod/i.test(navigator.userAgent) ? 1 : 0")) == 1


## Mostra o convite do browser (Android/Chrome/Edge).
static func prompt() -> void:
	_js("if (window.hbInstall) { window.hbInstall.prompt(); window.hbInstall = null; }")


## Texto para o botão/ajuda, ou "" quando não há nada a oferecer.
static func offer() -> String:
	if not OS.has_feature("web") or installed():
		return ""
	if can_prompt():
		return "prompt"
	if is_ios():
		return "ios"
	return ""
