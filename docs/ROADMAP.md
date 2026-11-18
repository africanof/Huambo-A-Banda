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
