-- =============================================================================
-- Huambo É A Banda — esquema base
--
-- Princípios:
--   1. RLS ativo em TODAS as tabelas. Sem política = acesso negado.
--   2. O cliente (anon/authenticated) só LÊ os seus próprios dados.
--      Todas as escritas de jogo passam pelo servidor de jogo (service_role).
--   3. A economia é um livro-razão (ledger) imutável; o saldo só muda através
--      de game_wallet_apply(), que é atómica, idempotente e nunca fica negativa.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 2 and 20),
  banned_until  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- Cria o perfil automaticamente quando uma conta é registada.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    case
      when requested is not null and char_length(requested) between 2 and 20 then requested
      else 'Morador' || (1000 + floor(random() * 9000))::int
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Personagens
-- ---------------------------------------------------------------------------
create table public.characters (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  name           text not null check (char_length(name) between 2 and 20),
  appearance     jsonb not null default '{}'::jsonb check (jsonb_typeof(appearance) = 'object'),
  -- Necessidades estilo "Sims" (0..100). A simulação vive no servidor.
  needs          jsonb not null default '{"hunger":100,"energy":100,"fun":100,"social":100,"hygiene":100}'::jsonb,
  last_district  text check (last_district ~ '^[a-z0-9_]{2,32}$'),
  pos_x          integer,
  pos_y          integer,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index characters_owner_idx on public.characters (owner_id) where deleted_at is null;

create trigger characters_updated_at before update on public.characters
  for each row execute function public.tg_set_updated_at();

-- Máximo de 3 personagens ativas por conta.
create or replace function public.tg_characters_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.characters c
      where c.owner_id = new.owner_id and c.deleted_at is null) >= 3 then
    raise exception 'character limit reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger characters_limit before insert on public.characters
  for each row execute function public.tg_characters_limit();

-- ---------------------------------------------------------------------------
-- Economia: carteiras + livro-razão
-- ---------------------------------------------------------------------------
create table public.wallets (
  character_id  uuid primary key references public.characters (id) on delete cascade,
  balance       bigint not null default 0 check (balance >= 0),
  updated_at    timestamptz not null default now()
);

create table public.wallet_transactions (
  id               bigint generated always as identity primary key,
  character_id     uuid not null references public.characters (id) on delete cascade,
  amount           bigint not null check (amount <> 0),
  balance_after    bigint not null check (balance_after >= 0),
  reason           text not null check (reason ~ '^[a-z0-9_.:-]{2,64}$'),
  idempotency_key  text not null unique check (char_length(idempotency_key) between 8 and 128),
  created_at       timestamptz not null default now()
);

create index wallet_tx_character_idx on public.wallet_transactions (character_id, created_at desc);

-- O livro-razão é imutável, mesmo para o service_role.
create or replace function public.tg_ledger_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'wallet_transactions is append-only';
end;
$$;

create trigger wallet_tx_immutable before update or delete on public.wallet_transactions
  for each row execute function public.tg_ledger_immutable();

-- Cada personagem nova recebe carteira com saldo inicial (registado no ledger).
create or replace function public.tg_character_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.wallets (character_id, balance) values (new.id, 500);
  insert into public.wallet_transactions (character_id, amount, balance_after, reason, idempotency_key)
  values (new.id, 500, 500, 'starting_balance', 'start:' || new.id::text);
  return new;
end;
$$;

create trigger characters_wallet after insert on public.characters
  for each row execute function public.tg_character_wallet();

-- ---------------------------------------------------------------------------
-- Catálogo de itens e inventário
-- ---------------------------------------------------------------------------
create table public.item_definitions (
  id          text primary key check (id ~ '^[a-z0-9_]{2,48}$'),
  name        text not null,
  category    text not null check (category in ('furniture', 'food', 'clothing', 'tool', 'decor')),
  base_price  bigint not null check (base_price >= 0),
  stackable   boolean not null default false,
  max_stack   integer not null default 1 check (max_stack between 1 and 999),
  metadata    jsonb not null default '{}'::jsonb
);

create table public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.characters (id) on delete cascade,
  item_id       text not null references public.item_definitions (id),
  quantity      integer not null default 1 check (quantity between 1 and 999),
  metadata      jsonb not null default '{}'::jsonb,
  acquired_at   timestamptz not null default now()
);

create index inventory_character_idx on public.inventory_items (character_id);

-- ---------------------------------------------------------------------------
-- Casas / lotes
-- ---------------------------------------------------------------------------
create table public.houses (
  id                  uuid primary key default gen_random_uuid(),
  district            text not null check (district ~ '^[a-z0-9_]{2,32}$'),
  plot_key            text not null check (plot_key ~ '^[a-z0-9_]{1,32}$'),
  owner_character_id  uuid references public.characters (id) on delete set null,
  price               bigint not null check (price >= 0),
  layout              jsonb not null default '{"objects":[]}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (district, plot_key)
);

create index houses_owner_idx on public.houses (owner_character_id);

create trigger houses_updated_at before update on public.houses
  for each row execute function public.tg_set_updated_at();
