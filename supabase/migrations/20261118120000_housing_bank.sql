-- =============================================================================
-- Fase B: casas (comprar/arrendar) e banco.
-- Tudo o que mexe em dinheiro acontece numa só transação com game_wallet_apply:
-- ou a casa/conta muda E o dinheiro sai, ou nada acontece.
-- =============================================================================

alter table public.houses
  add column if not exists tenure text check (tenure in ('buy', 'rent')),
  add column if not exists paid_until timestamptz;

-- plot_key = id da fração (ex.: predio_castanho_2)
alter table public.houses drop constraint if exists houses_plot_key_check;
alter table public.houses add constraint houses_plot_key_check check (plot_key ~ '^[a-z0-9_]{1,40}$');

create table if not exists public.bank_accounts (
  character_id uuid primary key references public.characters (id) on delete cascade,
  balance      bigint not null default 0 check (balance >= 0),
  updated_at   timestamptz not null default now()
);
alter table public.bank_accounts enable row level security;
create policy "bank: owner reads" on public.bank_accounts
  for select to authenticated
  using (character_id in (select id from public.characters where owner_id = (select auth.uid())));

-- Comprar (p_days null) ou arrendar (p_days dias) uma fração. Devolve a linha.
create or replace function public.game_property_claim(
  p_district text,
  p_plot_key text,
  p_character_id uuid,
  p_days integer,
  p_price bigint,
  p_idempotency_key text
)
returns public.houses
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.houses;
  v_active boolean;
begin
  insert into public.houses (district, plot_key, price)
  values (p_district, p_plot_key, p_price)
  on conflict (district, plot_key) do nothing;

  select * into h from public.houses
   where district = p_district and plot_key = p_plot_key
   for update;

  v_active := h.owner_character_id is not null
              and (h.tenure = 'buy' or h.paid_until > now());

  if v_active and h.owner_character_id <> p_character_id then
    raise exception 'property taken' using errcode = 'unique_violation';
  end if;
  if v_active and h.tenure = 'buy' then
    raise exception 'already owner' using errcode = 'unique_violation';
  end if;

  perform public.game_wallet_apply(p_character_id, -p_price,
    case when p_days is null then 'house.buy' else 'house.rent' end, p_idempotency_key);

  update public.houses set
    owner_character_id = p_character_id,
    price = p_price,
    tenure = case when p_days is null then 'buy' else 'rent' end,
    paid_until = case
      when p_days is null then null
      when v_active then h.paid_until + make_interval(days => p_days)
      else now() + make_interval(days => p_days)
    end
  where id = h.id
  returning * into h;
  return h;
end;
$$;

-- Depositar (p_amount > 0) ou levantar (p_amount < 0). Devolve [carteira, banco].
create or replace function public.game_bank_move(
  p_character_id uuid,
  p_amount bigint,
  p_idempotency_key text
)
returns bigint[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet bigint;
  v_bank bigint;
begin
  if exists (select 1 from public.wallet_transactions where idempotency_key = p_idempotency_key) then
    select balance into v_wallet from public.wallets where character_id = p_character_id;
    select balance into v_bank from public.bank_accounts where character_id = p_character_id;
    return array[coalesce(v_wallet, 0), coalesce(v_bank, 0)];
  end if;
  insert into public.bank_accounts (character_id) values (p_character_id) on conflict do nothing;
  update public.bank_accounts set balance = balance + p_amount, updated_at = now()
   where character_id = p_character_id and balance + p_amount >= 0
  returning balance into v_bank;
  if not found then
    raise exception 'insufficient funds' using errcode = 'check_violation';
  end if;
  v_wallet := public.game_wallet_apply(p_character_id, -p_amount,
    case when p_amount > 0 then 'bank.deposit' else 'bank.withdraw' end, p_idempotency_key);
  return array[v_wallet, v_bank];
end;
$$;

revoke all on function public.game_property_claim(text, text, uuid, integer, bigint, text) from public, anon, authenticated;
revoke all on function public.game_bank_move(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.game_property_claim(text, text, uuid, integer, bigint, text) to service_role;
grant execute on function public.game_bank_move(uuid, bigint, text) to service_role;
