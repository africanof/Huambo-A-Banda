-- Moderação: castigos por personagem e estado das denúncias. Só o servidor (service_role) lê e escreve.
create table if not exists public.game_sanctions (
  character_id  text primary key check (char_length(character_id) between 1 and 64),
  name          text not null default '' check (char_length(name) <= 40),
  muted_until   timestamptz,
  banned_until  timestamptz,
  reason        text not null default '' check (char_length(reason) <= 200),
  updated_at    timestamptz not null default now()
);

alter table public.game_sanctions enable row level security;
revoke all on public.game_sanctions from anon, authenticated;
