# Demonstração do novo estilo gráfico HD

Bairro de demonstração (para aprovação antes de aplicar ao jogo inteiro): uma avenida da Cidade Baixa,
rua de terra, Correios, casa do jogador (com interior decorável), cantina, padaria, prédios, zungueira,
kupapatas, eucaliptos, mulembas, buganvílias, candeeiros, ciclo dia/noite.

    godot --path client -- --demo

Controlos: setas/WASD (Shift corre) · clicar/tocar para andar · roda/pinça = zoom · E = entrar em casa.
Dentro de casa: loja de móveis → escolher → pousar no chão; clicar num móvel para o mudar; F espelha; Vender.

Capturas: `docs/img/demo_*.jpg` · vídeo: `docs/img/demo_bairro.mp4`
(geradas com `client/tests/capture_demo.gd` sob renderização real).

## Origem da arte
- Gerada com o modelo de imagem da OpenAI (`tools/art/ai/generate.py`, specs em `tools/art/ai/specs/`),
  montada por `tools/art/ai/build_assets.py`.
- **Estado face à regra do projeto (CLAUDE.md):** esta primeira versão foi gerada a partir de descrições
  baseadas em pesquisa sobre o Huambo, **antes** de a regra "só imagens reais e atuais" existir. Vai ser
  regenerada a partir das fotografias reais (refs/REFERENCIAS.md), passadas como imagens de entrada.
