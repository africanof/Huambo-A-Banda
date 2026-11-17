# Guia de arte — Huambo É A Banda

## Regra de ouro
**As imagens do jogo baseiam-se somente em imagens reais e atuais do Huambo.**
Cada edifício, rua, loja, interior, móvel, veículo e personagem parte de fotografias reais e recentes
da cidade, passadas ao gerador como referência visual.

## Processo
1. **Recolha de referências** → `tools/art/ai/refs/` + registo em `refs/REFERENCIAS.md`
   (URL, autor, licença, data de captura, o que mostra). Fontes: Wikimedia Commons, Mapillary,
   fotos cedidas pelo dono do projeto.
2. **Geração** → `tools/art/ai/generate.py` com `refs` obrigatórias por recurso
   (endpoint de edição da OpenAI); estilo comum em `style.json`.
3. **Montagem** → `tools/art/ai/build_assets.py` (recorte, escala real, âncoras, sombras,
   folhas de animação, mosaicos de chão) → `client/assets/demo/`.
4. **Revisão** → folha de contacto lado a lado: referência real × recurso gerado.

## Estilo
Ilustração 2D HD de simulador de vida, vista isométrica 2:1 (como o Vida na Banda), luz do planalto
(cima-esquerda), sombras suaves.
