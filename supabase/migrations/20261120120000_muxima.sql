-- Muxima: publicações curtas dos jogadores (texto + bairro) e «gostos» (um por pessoa). Só o servidor escreve.
create table if not exists public.game_posts (
  id            uuid primary key default gen_random_uuid(),
  character_id  text not null,
  name          text not null check (char_length(name) between 1 and 40),
  bairro        text not null check (char_length(bairro) between 1 and 60),
  text          text not null check (char_length(text) between 1 and 160),
  likes         integer not null default 0 check (likes >= 0),
  created_at    timestamptz not null default now()
);
create index if not exists game_posts_created on public.game_posts (created_at desc);
alter table public.game_posts enable row level security;
create policy "posts: authenticated reads" on public.game_posts for select to authenticated using (true);

create table if not exists public.game_post_likes (
  post_id       uuid not null references public.game_posts (id) on delete cascade,
  character_id  text not null,
  primary key (post_id, character_id)
);
alter table public.game_post_likes enable row level security;

create or replace function public.game_post_like(p_post_id uuid, p_character_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.game_post_likes (post_id, character_id) values (p_post_id, p_character_id);
  update public.game_posts set likes = likes + 1 where id = p_post_id;
  return true;
exception when unique_violation or foreign_key_violation then
  return false;
end;
$$;
revoke all on function public.game_post_like(uuid, text) from public, anon, authenticated;
