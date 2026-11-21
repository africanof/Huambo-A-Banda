-- Caixa de entrada de quem está desligado (SMS e presentes). Só o servidor (service_role) lê e escreve.
create table if not exists public.game_inbox (
  id            bigint generated always as identity primary key,
  to_character  text not null check (char_length(to_character) between 1 and 64),
  kind          text not null check (kind in ('sms', 'gift')),
  from_name     text not null default '' check (char_length(from_name) <= 40),
  from_id       text check (char_length(from_id) <= 64),
  text          text check (char_length(text) <= 200),
  name          text check (char_length(name) <= 40),
  mood          integer check (mood between 0 and 100),
  created_at    timestamptz not null default now()
);

create index if not exists game_inbox_to_idx on public.game_inbox (to_character, created_at);

alter table public.game_inbox enable row level security;
revoke all on public.game_inbox from anon, authenticated;
