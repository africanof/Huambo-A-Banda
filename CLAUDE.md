# Huambo É A Banda — regras do projeto

## Arte (regra obrigatória, definida pelo dono do projeto)
- **Todas as imagens do jogo têm de ser baseadas SOMENTE em imagens reais e atuais do Huambo, Angola.**
  Nada de cidades genéricas nem de "imaginação" sem referência.
- A arte é gerada com o modelo de imagem da OpenAI (tools/art/ai), **sempre a partir de fotografias
  de referência reais e recentes do Huambo** passadas como imagens de entrada (endpoint de edição),
  nunca só a partir de texto.
- Cada recurso gerado regista as fotografias de referência usadas (origem, autor, licença, data) em
  `tools/art/ai/refs/REFERENCIAS.md`. Usar só fotos com licença que o permita (ex.: Wikimedia Commons
  CC-BY/CC-BY-SA, Mapillary CC-BY-SA, ou fotos cedidas pelo dono do projeto).
- Preferir fotografias dos últimos anos (ver data de captura); fotos antigas só como apoio histórico.
- **Economia de geração (regra do dono do projeto):** cada imagem pedida à IA GPT tem de conter
  **mais de 100 itens/objetos** (folha de recursos em grelha, fundo transparente, à resolução máxima
  disponível); depois o pipeline recorta cada objeto (tools/art/ai/process.py) e regista os recortes
  no manifesto. Nunca gerar um objeto por imagem.
- Personagens: aparência, roupa e penteados de pessoas reais do Huambo de hoje (sem usar a cara
  de uma pessoa identificável como modelo de uma personagem).
- Não usar arte desenhada por código para personagens/cenários; o código trata de animação,
  interação, colisões, personalização e persistência.

## Perspetiva e jogabilidade
- Vista isométrica 2D igual à do Vida na Banda (setas/WASD, tocar para andar, zoom, etiquetas nos edifícios).

## Lugares (regra obrigatória, definida pelo dono do projeto)
- **Qualquer sítio ou lugar do jogo tem de ser totalmente funcional conforme a sua designação**
  (casa, hotel, discoteca, cantina, banco, escola, igreja, etc.).
- As personagens podem **entrar** em todos os edifícios com nome e **interagir** com o que esse
  lugar oferece na vida real do Huambo (dormir no hotel, dançar/beber na discoteca, comer na cantina…).
- Não pôr no mapa edifícios "de fachada" com nome e sem função; o casario decorativo sem nome
  à volta dos bairros é só cenário e não deve ter etiqueta.
- Cada lugar novo entra com: interior, ações no servidor (autoritativo, validado), e testes.

## Arquitetura
- Não destruir a arquitetura multijogador (Colyseus + Supabase + Redis). Servidor autoritativo.
- Testar cada etapa antes de avançar.
