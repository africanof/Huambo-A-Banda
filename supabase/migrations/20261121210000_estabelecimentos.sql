-- Estabelecimentos reais do mapa comprados por jogadores (um dono por interior). Só o servidor.
create table if not exists public.game_venues (
  interior_id text primary key check (char_length(interior_id) between 1 and 80),
  owner       text not null check (char_length(owner) between 1 and 64),
  owner_name  text not null default '' check (char_length(owner_name) <= 40),
  bairro      text not null check (char_length(bairro) between 1 and 40),
  venue       text not null check (char_length(venue) between 1 and 32),
  nome        text not null check (char_length(nome) between 1 and 60),
  nivel       integer not null default 1 check (nivel between 1 and 10),
  caixa       bigint not null default 0 check (caixa >= 0),
  investido   bigint not null default 0 check (investido >= 0),
  last_tick   timestamptz not null default now(),
  version     integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists game_venues_owner_idx on public.game_venues (owner);
create index if not exists game_venues_bairro_idx on public.game_venues (bairro);
alter table public.game_venues enable row level security;
revoke all on public.game_venues from anon, authenticated;
