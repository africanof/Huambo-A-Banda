# Roteiro

Cada etapa só começa quando a anterior passa no CI (servidor, base de dados e
ponta-a-ponta com clientes Godot reais).

## ✅ Etapa 1 — Fundação (concluída)
- Monorepo, CI, Docker, Redis, Cloudflare (documentação + cabeçalhos)
- Servidor Colyseus autoritativo: bairros, instâncias, AOI, snapshots, persistência
- Supabase: perfis, personagens, carteira + ledger, inventário, casas, RLS
- Cliente Godot: protocolo Colyseus em GDScript, login, mundo, clique-para-andar,
  previsão local, interpolação remota

## 🔄 Etapa 3 — Jogo completo (mecânicas de simulador de vida social, adaptadas ao Huambo)
- ✅ A1 Bairro HD em multijogador (planta partilhada cliente/servidor, previsão e interpolação)
- ✅ A2 Vida: família sorteada, carteira (livro-razão), fome/energia/humor/saúde, comer (cantina, padaria),
  dormir (hotel, banco da paragem), 8 empregos do Huambo com turnos de pagamento decrescente, estudar,
  pedir dinheiro aos pais, telemóvel (perfil, vagas, ajuda)
- ⏭ B Casa: arrendar/comprar, renda diária, armazém de móveis, decorar gravado, visitas
- ⏭ C Social: conversa, amizades, mensagens, namoro (18+), noivado, alambamento, casamento, bebé, árvore
- ⏭ D Negócios: quiosque → loja → praça, vendas às 18h, contas ao sábado, gerente, gerador, publicidade, filiais, roubos, banco
- ⏭ E Cidade: bairros reais (Cidade Alta, São João, Académico, Fátima…), transporte, carro, aeroporto Albano Machado, igreja, rádio
- ⏭ F Jogos e rua: Ludo, desafios, roubos, prisão e fiança

## Etapa 2 — Contas e presets de exportação
- Testar login/registo com um projeto Supabase real (preencher `config/client.cfg`)
- Guardar o refresh token de forma segura por plataforma
- `export_presets.cfg` para Web, Android, iOS, Windows e Linux + build Web no Cloudflare Pages
- Reconexão automática do cliente (o servidor já guarda o lugar 15 s)

## Etapa 3 — Mundo
- Tilemap real e arte (atlas com compressão ETC2/ASTC)
- Pathfinding (AStarGrid2D no cliente + servidor) em vez de deslizar nos obstáculos
- Chat por proximidade (com filtro e rate limit) e emotes

## Etapa 4 — Vida "Sims"
- Necessidades (fome, energia, diversão, social, higiene) simuladas no servidor
- Interações com objetos; inventário e loja usando `game_wallet_apply`

## Etapa 5 — Casas
- Compra de lotes, salas privadas por casa, modo construção com validação no servidor

## Etapa 6 — Escala e operação
- Teste de carga distribuído a 10 000 CCU, métricas (Prometheus), alertas
- Moderação: denúncias, banimentos (`profiles.banned_until`), registos de auditoria


### Fase B — Lugares funcionais e Casa (feito)
- Todos os 12 edifícios com nome têm interior caminhável (18 salas, incluindo 4 apartamentos por prédio);
  entrar/sair = teletransporte no mesmo mundo multijogador (AOI e servidor autoritativo intactos).
- Cada lugar faz o que o nome diz: cantina/padaria (comer ao balcão), hotel (dormir no quarto), escola (aulas),
  banco (depositar/levantar, atómico no Supabase), Governo (BI), Tribunal (registo criminal), correios
  (encomendas/cartas), loja de telemóveis (saldo), e cada um tem o seu posto de trabalho.
- Casas: comprar ou arrendar (1 ou 7 dias) à porta; só o dono entra; dormir grátis e cozinhar em casa;
  renda acabada = despejo. Supabase: `game_property_claim` e `game_bank_move` (dinheiro e casa na mesma transação).
- Pendente: arte própria de cada interior (precisa de fotos reais de interiores do Huambo), decoração em rede,
  visitas a casas de amigos (Fase C), discoteca e igreja (edifícios novos com arte de referência).

### Cidade a crescer — kits de bairro gerados por IA
- Regra: cada imagem gerada contém um bairro inteiro (>100 objetos, letreiros com o nome do bairro);
  `tools/art/ai/cut_kit.py` recorta, `build_kit.py` monta (pegada isométrica, escala), `tools/bairros/gen_<bairro>.py` desenha a planta.
- Bairro de Fátima (1.º kit): escola, liceu, centro de saúde, igreja, mercado, esquadra, farmácia, discoteca,
  hospedaria, cantina, churrasqueira, administração, prédio (4 apartamentos), 8 casas e ~100 adereços — todos funcionais.
- Viagem entre bairros de candongueiro (200 Kz) pelo Mapa.
- Feito: os 21 bairros reais do Huambo que faltavam (nomes do OpenStreetMap): Cidade Alta, Bairro Académico,
  São Pedro, Aviação, Bairro Militar, Benfica, Cacilhas, Canata, São José, São João, Kapango, Bomba Alta, Cacoio,
  Cahumba, Cambiote, Chiva, Lossambo, Salucombo, Samutaca, Vila Graça, Xipuli — 1 imagem cada, nomes automáticos
  (`tools/art/ai/name_kits.py`), plantas (`tools/bairros/gen_bairro.py`).
- Pacotes por bairro (~1 MB) descarregados só quando se vai lá (`Packs`), guardados no aparelho; jogo base ~22 MB.

### Limitações resolvidas
- Interiores próprios por tipo de lugar: 2 kits de IA (>100 objetos cada), 16 salas e ~170 móveis
  (igreja com altar e bancos, hospital com camas e consultório, discoteca com DJ e pista…);
  disposição automática com caminho livre da porta a cada ponto (`build_bairros.py: auto_layout`).
- Adereços próprios de cada bairro (árvores, candeeiros, postes, veículos, bancas do seu kit; `classify_props.py`).
- Ruas reais do OpenStreetMap em cada bairro (`osm_bairros.py`, `gen_osm.py`), edifícios ao longo das ruas,
  saídas a pé nos fins de rua para o bairro vizinho real (sempre ida e volta; cidade toda ligada), mapa da cidade
  com as posições reais, caminho automático (A*) no cliente.
- Arte dos kits em WebP: 295 MB → 67 MB; PNG antigos retirados do histórico do ramo.

### Modos de vista (como no Vida na Banda)
- 🔄 Rodar a vista 90° (4 orientações, transição suave, escolha guardada; tecla R). Dentro dos edifícios a vista fica fixa.
- Vista aérea com a câmara a seguir; arrastar = olhar à volta; botão «Seguir personagem»; zoom com dois dedos/roda.
- 👁 Por cima do ombro (3.ª pessoa) e pelos olhos (1.ª pessoa) em 3D: ruas reais, edifícios em caixa pintados com a
  própria arte isométrica (shader), árvores/pessoas em painéis; joystick ou WASD; arrastar para olhar (tecla V).
- Viagens na primeira pessoa: candongueiro (200 Kz, 9 s), kupapata (500 Kz, 13 s) e táxi (1.500 Kz, 9 s), vistas de
  dentro do veículo com a beira da estrada do Huambo e outdoors com anúncios do jogo (kit de IA com >100 objetos).
