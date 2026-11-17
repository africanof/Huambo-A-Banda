# Demonstração do novo estilo gráfico HD

Bairro de demonstração (para aprovação antes de aplicar ao jogo inteiro): uma avenida da Cidade Baixa,
rua de terra, Correios, casa do jogador (com interior decorável), cantina, padaria, prédios, zungueira,
kupapatas, eucaliptos, mulembas, buganvílias, candeeiros, ciclo dia/noite.

    godot --path client -- --demo

Controlos: setas/WASD (Shift corre) · clicar/tocar para andar · roda/pinça = zoom · E = entrar em casa.
Dentro de casa: loja de móveis → escolher → pousar no chão; clicar num móvel para o mudar; F espelha; Vender.

Capturas: `docs/img/demo_*.jpg` · vídeo: `docs/img/demo_bairro.mp4`
(geradas com `client/tests/capture_demo.gd` sob renderização real).

## Origem da arte (v2 — a partir de fotografias reais)
- Exterior, personagens e chão: gerados pelo modelo de imagem da OpenAI **a partir de fotografias reais do Huambo**
  passadas como imagem de entrada (`tools/art/ai/specs/bairro_v2.json`; fontes, autores e licenças em
  `tools/art/ai/refs/REFERENCIAS.md`): Correios, Governo Provincial, obelisco da Praça Agostinho Neto, prédio da
  Rua Cinco, casa colonial, cantina, padaria, jacarandá, palmeira, eucalipto, candeeiro, kupapata, zungueira.
- **v3 (fotografias oficiais atuais, huambo.gov.ao, 2025–2026):** Hotel iU (prédios rosa), prédio castanho, Banco
  Planalto (fictício), Escola Primária, loja de telecomunicações (marca fictícia), Tribunal da Comarca, banca do mercado,
  árvore das avenidas, asfalto novo, calçada de betão, relva dos separadores e o interior da casa (acabamentos reais).
- **Provisório:** móveis (ainda não há fotografias reais de interiores do Huambo).
- Marcha sem deslizar: a velocidade vem da animação (*root motion*): `build_assets.py` mede quanto o pé assente
  recua em cada ciclo e o jogo avança exatamente essa distância. Teste visual: `client/tests/capture_walk.gd`
  → `docs/img/demo_marcha.mp4`.
