-- Testes de segurança das migrações. Cada bloco falha com exceção se a regra for violada.
\set ON_ERROR_STOP on

-- Dados: duas contas, A e B.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'a@test', '{"display_name":"Ana"}'),
  ('22222222-2222-4222-8222-222222222222', 'b@test', '{}');

set role service_role;
insert into public.characters (owner_id, name) values
  ('11111111-1111-4111-8111-111111111111', 'Ana'),
  ('22222222-2222-4222-8222-222222222222', 'Bento');
reset role;

do $$ begin
  assert (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'Ana', 'profile from metadata';
  assert (select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222') like 'Morador%', 'default profile name';
  assert (select count(*) from public.wallets where balance = 500) = 2, 'starting wallets';
  assert (select count(*) from public.wallet_transactions where reason = 'starting_balance') = 2, 'starting ledger';
end $$;

-- ---------- Como jogador A (authenticated) ----------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', false);

do $$ begin
  assert (select count(*) from public.characters) = 1, 'A sees only own character';
  assert (select count(*) from public.wallets) = 1, 'A sees only own wallet';
  assert (select count(*) from public.profiles) = 1, 'A sees only own profile';
  assert (select count(*) from public.item_definitions) > 0, 'catalog is public';
end $$;

-- A não pode dar dinheiro a si próprio.
do $$ begin
  begin
    update public.wallets set balance = 999999;
    raise exception 'FAIL: wallet update allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.wallet_transactions (character_id, amount, balance_after, reason, idempotency_key)
      select id, 1000, 1500, 'hack', 'hack-key-0001' from public.characters limit 1;
    raise exception 'FAIL: ledger insert allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.game_wallet_apply((select id from public.characters limit 1), 1000, 'hack', 'hack-key-0002');
    raise exception 'FAIL: game_wallet_apply callable by client';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.game_save_positions('[]'::jsonb);
    raise exception 'FAIL: game_save_positions callable by client';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.characters (owner_id, name) values ('11111111-1111-4111-8111-111111111111', 'Clone');
    raise exception 'FAIL: client created character';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A pode mudar o próprio nome, mas não o de B, nem o campo banned_until.
update public.profiles set display_name = 'Ana Maria';
do $$ begin
  begin
    update public.profiles set banned_until = null;
    raise exception 'FAIL: banned_until writable';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin
  assert (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111') = 'Ana Maria', 'rename own';
  assert (select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222') like 'Morador%', 'other untouched';
end $$;

-- ---------- Anónimo ----------
set role anon;
select set_config('request.jwt.claims', '', false);
do $$ begin
  assert (select count(*) from public.item_definitions) > 0, 'anon reads catalog';
  begin
    perform 1 from public.characters;
    raise exception 'FAIL: anon reads characters';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- Servidor de jogo (service_role) ----------
set role service_role;
do $$
declare
  cid uuid := (select id from public.characters where name = 'Ana');
  b bigint;
begin
  b := public.game_wallet_apply(cid, -200, 'shop.buy:sofa_basico', 'order-0000001');
  assert b = 300, 'debit applied';
  b := public.game_wallet_apply(cid, -200, 'shop.buy:sofa_basico', 'order-0000001');
  assert b = 300, 'idempotent replay';
  begin
    perform public.game_wallet_apply(cid, -1000, 'shop.buy:cama', 'order-0000002');
    raise exception 'FAIL: overdraft';
  exception when check_violation then null;
  end;
  assert (select balance from public.wallets where character_id = cid) = 300, 'balance consistent';
  assert (select count(*) from public.wallet_transactions where character_id = cid) = 2, 'ledger rows';

  begin
    update public.wallet_transactions set amount = 1 where character_id = cid;
    raise exception 'FAIL: ledger mutable';
  exception when raise_exception then null;
  end;

  assert public.game_save_positions(jsonb_build_array(jsonb_build_object('id', cid, 'district', 'cidade_baixa', 'x', 10, 'y', 20))) = 1, 'save positions';
  assert (select pos_x from public.characters where id = cid) = 10, 'position saved';

  insert into public.characters (owner_id, name) values ('11111111-1111-4111-8111-111111111111', 'Ana2'), ('11111111-1111-4111-8111-111111111111', 'Ana3');
  begin
    insert into public.characters (owner_id, name) values ('11111111-1111-4111-8111-111111111111', 'Ana4');
    raise exception 'FAIL: character limit';
  exception when check_violation then null;
  end;
end $$;
reset role;

\echo 'ALL SUPABASE SECURITY TESTS PASSED'
