-- Simplified configurator: price per rim size, SUV body style, BMW X5 M Competition (F95 LCI).

alter table public.wheels add column price_by_size jsonb not null default '{}'::jsonb;

-- Placeholder pricing from the existing 20" set price; edit per size in /admin.
-- Every design is offered 19"–22" so it also fits the X5 M (21"/22").
update public.wheels set
  price_by_size = jsonb_build_object(
    '19"', price_per_set - 600,
    '20"', price_per_set,
    '21"', price_per_set + 700,
    '22"', price_per_set + 1500),
  standard_sizes = array['19"', '20"', '21"', '22"'];

alter table public.cars drop constraint cars_body_style_check;
alter table public.cars add constraint cars_body_style_check check (body_style in ('coupe', 'sedan', 'suv'));

insert into public.cars (id, name, badge, generation, chassis_code, engine, power, torque, acceleration,
  recommended_wheel_fitment, body_style, model_length_m, sort_order)
values ('x5m_f95', 'BMW X5 M Competition', 'X5 M F95', 'F95 LCI', 'F95 X5 M', '4.4L S68 Twin-Turbo V8 Mild Hybrid',
  '617 HP / 625 PS', '750 Nm (553 lb-ft)', '0-100 km/h in 3.8s',
  '{"front":"21 x 10.5J","rear":"22 x 11.5J","pcd":"5x112","cb":"66.6mm"}'::jsonb, 'suv', 4.94, 4)
on conflict (id) do nothing;

-- Calipers are no longer a customer option; keep the table but hide it from the configurator.
update public.calipers set active = (id = 'm_blue');
