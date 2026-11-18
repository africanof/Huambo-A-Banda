-- Fase A2: estado de vida da personagem (necessidades, família, emprego, turnos…).
-- Escrito só pelo servidor de jogo; o jogador pode LER (política "characters: read own").
alter table public.characters
  add column if not exists life jsonb check (life is null or jsonb_typeof(life) = 'object');

-- Gravação em lote: posição e (opcionalmente) estado de vida.
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
           (r ->> 'y')::integer as y,
           (r -> 'life')        as life
    from jsonb_array_elements(payload) as r
  ), upd as (
    update public.characters c
       set last_district = rows.district,
           pos_x = rows.x,
           pos_y = rows.y,
           life = coalesce(rows.life, c.life)
      from rows
     where c.id = rows.id
    returning 1
  )
  select count(*)::integer from upd;
$$;

revoke all on function public.game_save_positions(jsonb) from public, anon, authenticated;
grant execute on function public.game_save_positions(jsonb) to service_role;
