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

### Interiores e bordas como no Vida na Banda
- Lá dentro a sala enche o ecrã (cabe pela largura e pela altura, com espaço para o HUD) sobre fundo escuro.
- Marcadores a saltitar por cima de cada sítio onde se faz alguma coisa (balcão, cama, quadro, «Sair»), com ícone e
  nome; tocar leva-te lá e abre logo a ação (o servidor continua a validar).
- Pessoal da casa no posto (tia da cantina, enfermeira, bancária, professora, rececionista…) que cumprimenta quem chega.
- Nome da divisão no chão numa plaquinha escura; o botão «Casa» passa a «Sair».
- Sem arte de um lado, as salas e casas mostram a arte espelhada nas vistas de 90°/270° (nunca o que tem letras).
- Bordas do bairro: as ruas continuam para lá do limite até ao horizonte, com casario cerrado à volta
  (só paisagem; a personagem não sai do bairro).

### Telemóvel, missões e minimapa (como no Vida na Banda)
- Ecrã inicial do telemóvel: hora grande, data, dia/noite, bairro, dinheiro e «N pessoas a jogar hoje» (GET /stats).
- Missões do dia («Hoje · 0/3»): 3 por pessoa e por dia, cada uma completada por uma ação real validada no servidor
  (turno, refeição, aula, viagem, depósito, balcão, dormir, entrar em 3 sítios); prémio a recolher uma só vez
  (idempotente) e bónus do dia completo que cresce com a sequência de dias seguidos (até 7).
- Apps que funcionam: Missões, Perfil, Família (pais, origem, pedir dinheiro), Mapa, Vagas, Estudos, Banco, Casa,
  Loja, Saúde, Governo (documentos), Ajuda; as apps de sítios levam-te a pé à porta certa do bairro.
- Minimapa redondo a seguir a personagem, com «N»; tocar abre o bairro todo.
- Interiores com o passeio e a rua do lado da porta e chão claro à volta.

### Falar, gestos, sorte e transferir (como no Vida na Banda)
- Falar: quem está a até 15 m ouve; texto limpo no servidor (até 120 letras, sem caracteres de controlo,
  palavrões tapados), máximo 5 mensagens em 10 s; balão por cima da cabeça; frases rápidas; caixa de texto
  que funciona no telemóvel. Conta para a missão «Falar com outro jogador».
- Gestos: acenar, dançar, aplaudir, rir, celebrar, resmungar — animação curta da própria personagem, visível a quem está perto.
- Sorte do dia (telemóvel): grátis, 1×/dia, prémio sorteado no servidor (até 10.000 Kz), pago uma só vez.
- Transferir (telemóvel): dar 500–10.000 Kz (limites 100–100.000) a quem está a até 8 m; só contas
  (convidados não enviam nem recebem); débito antes do crédito, com chaves de idempotência.
