-- Grupos do jogo (associações, clubes, igrejas, kambas). Só o servidor (service role) escreve.
create table if not exists public.game_groups (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 3 and 30),
  owner_character_id  uuid references public.characters (id) on delete set null,
  members             integer not null default 1 check (members >= 0),
  created_at          timestamptz not null default now()
);
create unique index if not exists game_groups_name_lower on public.game_groups (lower(name));
create index if not exists game_groups_owner on public.game_groups (owner_character_id);
alter table public.game_groups enable row level security;
create policy "groups: anyone authenticated reads" on public.game_groups for select to authenticated using (true);

create or replace function public.game_group_adjust(p_group_id uuid, p_delta integer)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.game_groups set members = greatest(0, members + p_delta) where id = p_group_id;
$$;
revoke all on function public.game_group_adjust(uuid, integer) from public, anon, authenticated;
