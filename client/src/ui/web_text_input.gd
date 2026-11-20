class_name WebTextInput
extends RefCounted
## Escrever no telemóvel (jogo Web): o teclado do Android (Gboard, com sugestões) não envia as letras
## ao motor do jogo dentro do browser — o nome «não aparecia». Aqui, ao tocar num campo, abre-se
## por cima dele uma caixa de texto normal do browser (com o mesmo aspeto); o que se escreve
## passa logo para o campo do jogo. Fora do Web (ou no computador) não faz nada.

static var _target: LineEdit
static var _cb_input: JavaScriptObject
static var _cb_done: JavaScriptObject


static func needed() -> bool:
	return OS.has_feature("web") and DisplayServer.is_touchscreen_available()


## kind: "text", "email" ou "password".
static func attach(le: LineEdit, kind := "text") -> void:
	if not needed():
		return
	le.virtual_keyboard_enabled = false # o teclado vem da caixa do browser
	le.focus_entered.connect(func() -> void: _open(le, kind))


static func _open(le: LineEdit, kind: String) -> void:
	_target = le
	var win := JavaScriptBridge.get_interface("window")
	if _cb_input == null:
		_cb_input = JavaScriptBridge.create_callback(func(args: Array) -> void:
			if is_instance_valid(_target):
				_target.text = str(args[0])
				_target.text_changed.emit(_target.text))
		_cb_done = JavaScriptBridge.create_callback(func(args: Array) -> void:
			if is_instance_valid(_target):
				_target.text = str(args[0])
				_target.release_focus()
				if args.size() > 1 and int(args[1]) == 1: # carregou em Enter (fechar o teclado não conta)
					_target.text_submitted.emit(_target.text))
		win.hbInput = _cb_input
		win.hbDone = _cb_done
	# posição do campo em fração do ecrã do jogo → píxeis da página
	var vs := le.get_viewport().get_visible_rect().size
	var r := le.get_global_rect()
	var js := """
(function(){
  var el = document.getElementById('hb-input');
  if (!el) { el = document.createElement('input'); el.id = 'hb-input'; document.body.appendChild(el); }
  el.type = %s; el.value = %s; el.maxLength = %d; el.placeholder = %s;
  el.autocomplete = 'off'; el.autocapitalize = %s; el.spellcheck = false;
  var c = document.querySelector('canvas'), b = c.getBoundingClientRect();
  Object.assign(el.style, {position:'fixed', left:(b.left + %f*b.width)+'px', top:(b.top + %f*b.height)+'px',
    width:(%f*b.width)+'px', height:(%f*b.height)+'px', fontSize:'18px', zIndex:1000, padding:'0 14px',
    border:'2px solid #f2b82e', borderRadius:'16px', background:'#2b2626', color:'#ffffff', outline:'none',
    boxSizing:'border-box', fontFamily:'Inter, system-ui, sans-serif', display:'block'});
  el.oninput = function(){ window.hbInput(el.value); };
  el._enter = 0;
  el.onkeydown = function(e){ if (e.key === 'Enter') { el._enter = 1; el.blur(); } };
  el._t0 = Date.now();
  el.onblur = function(){
    // o toque que abriu a caixa ainda está a acabar (o jogo tenta ficar com o foco): volta a focar
    if (!el._enter && Date.now() - el._t0 < 900) { setTimeout(function(){ el.focus(); }, 0); return; }
    el.style.display = 'none'; window.hbDone(el.value, el._enter);
  };
  // depois do toque acabar (senão o jogo volta a ficar com o foco e a caixa fecha-se)
  setTimeout(function(){ el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) {} }, 30);
})();
""" % [
		JSON.stringify(kind), JSON.stringify(le.text), le.max_length if le.max_length > 0 else 64,
		JSON.stringify(le.placeholder_text), JSON.stringify("words" if kind == "text" else "off"),
		r.position.x / vs.x, r.position.y / vs.y, r.size.x / vs.x, r.size.y / vs.y,
	]
	JavaScriptBridge.eval(js, true)
	# o campo do jogo larga o foco (senão o motor liga a sua própria caixa escondida e rouba o foco)
	le.release_focus.call_deferred()
