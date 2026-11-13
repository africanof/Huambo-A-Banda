-- Catálogo inicial (dados de desenvolvimento). Executado por `supabase db reset`.
insert into public.item_definitions (id, name, category, base_price, stackable, max_stack) values
  ('sofa_basico',      'Sofá básico',      'furniture', 350, false, 1),
  ('cama_simples',     'Cama simples',     'furniture', 420, false, 1),
  ('mesa_madeira',     'Mesa de madeira',  'furniture', 200, false, 1),
  ('funge_pirao',      'Funge',            'food',       15, true, 20),
  ('muamba_galinha',   'Muamba de galinha','food',       40, true, 10),
  ('camisola_banda',   'Camisola Banda',   'clothing',   80, false, 1),
  ('vaso_planta',      'Vaso com planta',  'decor',      60, false, 1)
on conflict (id) do nothing;

insert into public.houses (district, plot_key, price) values
  ('cidade_baixa', 'lote_01', 5000),
  ('cidade_baixa', 'lote_02', 5000),
  ('cidade_baixa', 'lote_03', 7500),
  ('sao_joao',     'lote_01', 4000)
on conflict (district, plot_key) do nothing;
