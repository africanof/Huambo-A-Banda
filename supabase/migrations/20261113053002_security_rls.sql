-- =============================================================================
-- Segurança: RLS, privilégios e funções do servidor de jogo
-- =============================================================================

alter table public.profiles            enable row level security;
alter table public.characters          enable row level security;
alter table public.wallets             enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.item_definitions    enable row level security;
alter table public.inventory_items     enable row level security;
alter table public.houses              enable row level security;

-- Defesa em profundidade: mesmo que alguém crie uma política por engano,
-- os clientes não têm privilégio de escrita nestas tabelas.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke select on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;
grant select on public.item_definitions, public.houses to anon;

-- O único campo que o próprio jogador pode alterar diretamente: o nome do perfil.
grant update (display_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Políticas (só leitura dos próprios dados)
-- ---------------------------------------------------------------------------
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "profiles: rename own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "characters: read own" on public.characters
  for select to authenticated
  using (owner_id = (select auth.uid()) and deleted_at is null);

create policy "wallets: read own" on public.wallets
  for select to authenticated
  using (exists (select 1 from public.characters c
                 where c.id = wallets.character_id and c.owner_id = (select auth.uid())));

create policy "wallet_tx: read own" on public.wallet_transactions
  for select to authenticated
  using (exists (select 1 from public.characters c
                 where c.id = wallet_transactions.character_id and c.owner_id = (select auth.uid())));

create policy "inventory: read own" on public.inventory_items
  for select to authenticated
  using (exists (select 1 from public.characters c
                 where c.id = inventory_items.character_id and c.owner_id = (select auth.uid())));

create policy "items: public catalog" on public.item_definitions
  for select to anon, authenticated using (true);

create policy "houses: public map" on public.houses
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- Funções exclusivas do servidor de jogo (service_role)
-- ---------------------------------------------------------------------------

-- Grava posições em lote: uma ida à base de dados por sala, não por jogador.
create or replace function public.game_save_positions(payload jsonb)
returns integer
language sql
security definer
set search_path = ''
as $$
  with rows as (
    select (r ->> 'id')::uuid as id,
           (r ->> 'district')   as district,
           (r ->> 'x')::integer as x,
           (r ->> 'y')::integer as y
    from jsonb_array_elements(payload) as r
  ), upd as (
    update public.characters c
       set last_district = rows.district, pos_x = rows.x, pos_y = rows.y
      from rows
     where c.id = rows.id
    returning 1
  )
  select count(*)::integer from upd;
$$;

-- Aplica um movimento de dinheiro de forma atómica e idempotente.
-- Repetir a mesma idempotency_key devolve o resultado original sem duplicar.
create or replace function public.game_wallet_apply(
  p_character_id uuid,
  p_amount bigint,
  p_reason text,
  p_idempotency_key text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing bigint;
  v_balance  bigint;
begin
  select balance_after into v_existing
    from public.wallet_transactions where idempotency_key = p_idempotency_key;
  if found then
    return v_existing;
  end if;

  update public.wallets
     set balance = balance + p_amount, updated_at = now()
   where character_id = p_character_id and balance + p_amount >= 0
  returning balance into v_balance;

  if not found then
    if not exists (select 1 from public.wallets where character_id = p_character_id) then
      raise exception 'wallet not found' using errcode = 'no_data_found';
    end if;
    raise exception 'insufficient funds' using errcode = 'check_violation';
  end if;

  insert into public.wallet_transactions (character_id, amount, balance_after, reason, idempotency_key)
  values (p_character_id, p_amount, v_balance, p_reason, p_idempotency_key);

  return v_balance;
end;
$$;

revoke all on function public.game_save_positions(jsonb) from public, anon, authenticated;
revoke all on function public.game_wallet_apply(uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.tg_character_wallet() from public, anon, authenticated;
grant execute on function public.game_save_positions(jsonb) to service_role;
grant execute on function public.game_wallet_apply(uuid, bigint, text, text) to service_role;

-- Tabelas criadas em migrações futuras também nascem sem escrita para clientes.
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke select on tables from anon;
