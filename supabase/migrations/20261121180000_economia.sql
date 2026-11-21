-- Economia entre jogadores: mercado vivo, associações de bairro e lojas dos jogadores.
-- Tudo só para o servidor (service_role): RLS ligado, sem políticas, sem acesso da API pública.

-- ---------------------------------------------------------------- mercado vivo
create table if not exists public.game_market (
  item        text primary key check (char_length(item) between 1 and 32),
  price       double precision not null check (price > 0),
  updated_at  timestamptz not null default now()
);
alter table public.game_market enable row level security;
revoke all on public.game_market from anon, authenticated;

-- Troca atómica: recupera o preço com o tempo, aplica a troca e limita entre metade e o dobro.
create or replace function public.game_market_trade(p_item text, p_base double precision, p_step double precision, p_qty integer, p_recovery_h double precision)
returns double precision language plpgsql security definer set search_path = '' as $$
declare
  cur double precision;
  at timestamptz;
  p double precision;
begin
  insert into public.game_market (item, price, updated_at) values (p_item, p_base, now()) on conflict (item) do nothing;
  select price, updated_at into cur, at from public.game_market where item = p_item for update;
  cur := p_base + (cur - p_base) * exp(-greatest(0, extract(epoch from (now() - at)) / 3600.0) / p_recovery_h);
  if p_qty >= 0 then p := cur * power(1 - p_step, p_qty); else p := cur * power(1 + p_step, -p_qty); end if;
  p := least(p_base * 2, greatest(p_base * 0.5, p));
  update public.game_market set price = p, updated_at = now() where item = p_item;
  return p;
end;
$$;
revoke all on function public.game_market_trade(text, double precision, double precision, integer, double precision) from public, anon, authenticated;

-- ---------------------------------------------------------------- associações de bairro
create table if not exists public.game_assoc (
  bairro    text not null check (char_length(bairro) between 1 and 40),
  semana    text not null check (semana ~ '^[0-9]{4}-W[0-9]{2}$'),
  pontos    bigint not null default 0,
  membros   integer not null default 0,
  primary key (bairro, semana)
);
create table if not exists public.game_assoc_members (
  character_id text not null check (char_length(character_id) between 1 and 64),
  semana       text not null check (semana ~ '^[0-9]{4}-W[0-9]{2}$'),
  bairro       text not null check (char_length(bairro) between 1 and 40),
  pontos       bigint not null default 0,
  primary key (character_id, semana)
);
create index if not exists game_assoc_week_idx on public.game_assoc (semana, pontos desc);
alter table public.game_assoc enable row level security;
alter table public.game_assoc_members enable row level security;
revoke all on public.game_assoc from anon, authenticated;
revoke all on public.game_assoc_members from anon, authenticated;

-- Soma pontos a um membro e à associação do bairro dele (conta membros novos da semana).
create or replace function public.game_assoc_add(p_character text, p_bairro text, p_semana text, p_pontos bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  novo boolean;
  total bigint;
begin
  insert into public.game_assoc_members (character_id, semana, bairro, pontos) values (p_character, p_semana, p_bairro, p_pontos)
  on conflict (character_id, semana) do update set pontos = public.game_assoc_members.pontos + excluded.pontos, bairro = excluded.bairro
  returning (xmax = 0) into novo;
  insert into public.game_assoc (bairro, semana, pontos, membros) values (p_bairro, p_semana, p_pontos, 1)
  on conflict (bairro, semana) do update set pontos = public.game_assoc.pontos + excluded.pontos,
    membros = public.game_assoc.membros + (case when novo then 1 else 0 end)
  returning pontos into total;
  return total;
end;
$$;
revoke all on function public.game_assoc_add(text, text, text, bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------- lojas dos jogadores
create table if not exists public.game_shops (
  id          uuid primary key default gen_random_uuid(),
  owner       text not null unique check (char_length(owner) between 1 and 64),
  owner_name  text not null default '' check (char_length(owner_name) <= 40),
  bairro      text not null check (char_length(bairro) between 1 and 40),
  nome        text not null check (char_length(nome) between 2 and 40),
  caixa       bigint not null default 0 check (caixa >= 0),
  stock       jsonb not null default '{}'::jsonb,
  empregados  jsonb not null default '[]'::jsonb,
  vendas      bigint not null default 0,
  last_tick   timestamptz not null default now(),
  version     integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists game_shops_bairro_idx on public.game_shops (bairro);
alter table public.game_shops enable row level security;
revoke all on public.game_shops from anon, authenticated;
