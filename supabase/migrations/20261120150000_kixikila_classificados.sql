-- Kixikila (poupança em grupo) e Classificados (compra e venda entre jogadores). Só o servidor escreve.
create table if not exists public.game_kixikila (
  id          uuid primary key default gen_random_uuid(),
  group_id    text not null unique,
  quota       integer not null check (quota > 0),
  members     jsonb not null default '[]'::jsonb,
  round       integer not null default 0,
  paid        jsonb not null default '[]'::jsonb,
  status      text not null default 'aberta' check (status in ('aberta', 'a_correr', 'acabada')),
  creator     text not null,
  created_at  timestamptz not null default now()
);
alter table public.game_kixikila enable row level security;

create or replace function public.game_kixikila_join(p_id uuid, p_member jsonb)
returns setof public.game_kixikila language sql security definer set search_path = '' as $$
  update public.game_kixikila set members = members || jsonb_build_array(p_member)
  where id = p_id and status = 'aberta'
    and not exists (select 1 from jsonb_array_elements(members) m where m->>'id' = p_member->>'id')
    and jsonb_array_length(members) < 20
  returning *;
$$;

create or replace function public.game_kixikila_start(p_id uuid, p_creator text)
returns setof public.game_kixikila language sql security definer set search_path = '' as $$
  update public.game_kixikila set status = 'a_correr'
  where id = p_id and status = 'aberta' and creator = p_creator and jsonb_array_length(members) >= 2
  returning *;
$$;

create or replace function public.game_kixikila_paid(p_id uuid, p_round integer, p_character text)
returns setof public.game_kixikila language sql security definer set search_path = '' as $$
  update public.game_kixikila set paid = paid || to_jsonb(p_character)
  where id = p_id and status = 'a_correr' and round = p_round
    and not (paid ? p_character)
    and exists (select 1 from jsonb_array_elements(members) m where m->>'id' = p_character)
  returning *;
$$;

-- fecha a volta: devolve o estado ANTES de fechar (para saber quem recebe)
create or replace function public.game_kixikila_close(p_id uuid, p_round integer)
returns setof public.game_kixikila language plpgsql security definer set search_path = '' as $$
declare k public.game_kixikila;
begin
  select * into k from public.game_kixikila where id = p_id for update;
  if not found or k.status <> 'a_correr' or k.round <> p_round or jsonb_array_length(k.paid) < jsonb_array_length(k.members) then
    return;
  end if;
  update public.game_kixikila
    set round = round + 1, paid = '[]'::jsonb,
        status = case when round + 1 >= jsonb_array_length(members) then 'acabada' else status end
    where id = p_id;
  return next k;
end;
$$;
revoke all on function public.game_kixikila_join(uuid, jsonb), public.game_kixikila_start(uuid, text),
  public.game_kixikila_paid(uuid, integer, text), public.game_kixikila_close(uuid, integer) from public, anon, authenticated;

create table if not exists public.game_listings (
  id           uuid primary key default gen_random_uuid(),
  seller       text not null,
  seller_name  text not null,
  bairro       text not null,
  item         text not null check (item in ('milho', 'feijao', 'batata_doce', 'usd')),
  qty          integer not null check (qty between 1 and 100000),
  price        integer not null check (price between 100 and 1000000),
  status       text not null default 'open' check (status in ('open', 'sold', 'cancelled')),
  buyer        text,
  created_at   timestamptz not null default now()
);
create index if not exists game_listings_open on public.game_listings (status, created_at desc);
create index if not exists game_listings_seller on public.game_listings (seller, status);
alter table public.game_listings enable row level security;
create policy "listings: authenticated reads" on public.game_listings for select to authenticated using (true);
