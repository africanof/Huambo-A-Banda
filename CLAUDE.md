# Huambo É A Banda — regras do projeto

## Arte (regra obrigatória, definida pelo dono do projeto)
- **Contexto do Huambo (regra atualizada pelo dono do projeto):** nem tudo precisa de ser baseado em
  fotografias reais. A IA pode gerar arte a partir de texto, **desde que tenha em conta o contexto real
  do Huambo, Angola** (arquitetura do planalto, materiais, cores, vegetação, comércio, sinalética em
  português, carros/kupapatas, roupa e pessoas de hoje). Nada de cidades genéricas.
- Quando existirem fotografias reais de referência (marcos, edifícios conhecidos), usam-se como imagens
  de entrada (endpoint de edição) e regista-se a origem em `tools/art/ai/refs/REFERENCIAS.md`
  (só fotos com licença que o permita ou cedidas pelo dono do projeto).
- **Alargar a cidade (regra do dono do projeto):** cada imagem gerada pela IA GPT deve conter **um bairro
  inteiro e estruturado** — escolas, hospital/centro de saúde, igreja, mercado, comércio, casas, etc. —
  com a **designação do bairro** (nome real do bairro do Huambo nas placas/letreiros).
- **Economia de geração (regra do dono do projeto):** cada imagem pedida à IA GPT tem de conter
  **mais de 100 itens/objetos** (à resolução máxima disponível); depois o pipeline recorta cada objeto
  (tools/art/ai/process.py) e regista os recortes no manifesto. Nunca gerar um objeto por imagem.
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
