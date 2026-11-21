-- Denúncias de jogadores (moderação). Só o servidor (service_role) escreve; a API pública não lê nem escreve.
create table if not exists public.game_reports (
  id            bigint generated always as identity primary key,
  reporter      text not null check (char_length(reporter) between 1 and 64),
  reporter_name text not null default '' check (char_length(reporter_name) <= 40),
  reported      text not null check (char_length(reported) between 1 and 64),
  reported_name text not null default '' check (char_length(reported_name) <= 40),
  reason        text not null check (char_length(reason) between 2 and 200),
  bairro        text not null default '' check (char_length(bairro) <= 40),
  context       jsonb not null default '[]'::jsonb,
  status        text not null default 'novo' check (status in ('novo', 'visto', 'resolvido')),
  created_at    timestamptz not null default now()
);

create index if not exists game_reports_reported_idx on public.game_reports (reported, created_at desc);
create index if not exists game_reports_status_idx on public.game_reports (status, created_at desc);

alter table public.game_reports enable row level security;
revoke all on public.game_reports from anon, authenticated;
