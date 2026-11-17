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
- Personagens: aparência, roupa e penteados de pessoas reais do Huambo de hoje (sem usar a cara
  de uma pessoa identificável como modelo de uma personagem).
- Não usar arte desenhada por código para personagens/cenários; o código trata de animação,
  interação, colisões, personalização e persistência.

## Perspetiva e jogabilidade
- Vista isométrica 2D igual à do Vida na Banda (setas/WASD, tocar para andar, zoom, etiquetas nos edifícios).

## Arquitetura
- Não destruir a arquitetura multijogador (Colyseus + Supabase + Redis). Servidor autoritativo.
- Testar cada etapa antes de avançar.
