-- Convites (crescer pelo WhatsApp): código por jogador e quem entrou com cada código. Só o servidor.
create table if not exists public.game_invites (
  code        text primary key check (code ~ '^[A-Z0-9]{6}$'),
  owner       text not null unique check (char_length(owner) between 1 and 64),
  owner_name  text not null default '' check (char_length(owner_name) <= 40),
  created_at  timestamptz not null default now()
);
create table if not exists public.game_invite_uses (
  invitee      text primary key check (char_length(invitee) between 1 and 64),
  invitee_name text not null default '' check (char_length(invitee_name) <= 40),
  code         text not null references public.game_invites (code) on delete cascade,
  owner        text not null check (char_length(owner) between 1 and 64),
  rewarded     boolean not null default false,
  rewarded_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists game_invite_uses_owner_idx on public.game_invite_uses (owner);
alter table public.game_invites enable row level security;
alter table public.game_invite_uses enable row level security;
revoke all on public.game_invites from anon, authenticated;
revoke all on public.game_invite_uses from anon, authenticated;
