-- Lista de productos de cada pedido. El precio es SIN tax: el tax se calcula
-- aparte con el porcentaje del pedido.
-- Cuando un pedido tiene productos, su "valor productos" y su "cantidad de
-- productos" se calculan solos con esta lista.

create table if not exists public.productos_pedido (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references public.pedidos (id) on delete cascade,
  descripcion     text not null check (length(trim(descripcion)) between 1 and 200),
  enlace          text check (enlace is null or (enlace ~* '^https?://' and length(enlace) <= 1000)),
  cantidad        integer not null default 1 check (cantidad between 1 and 999),
  precio_unitario numeric(12,2) not null default 0 check (precio_unitario >= 0),
  subtotal        numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index if not exists productos_pedido_pedido_idx on public.productos_pedido (pedido_id, creado_en);

alter table public.productos_pedido enable row level security;
revoke all on public.productos_pedido from anon;

create policy admin_productos on public.productos_pedido
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create trigger productos_pedido_actualizado before update on public.productos_pedido
  for each row execute function public.tocar_actualizado_en();

-- Recalcula el valor (sin tax) y la cantidad del pedido con su lista de productos.
create or replace function public.sincronizar_productos()
returns trigger language plpgsql set search_path = public as $$
declare
  v_pedido uuid := case when tg_op = 'DELETE' then old.pedido_id else new.pedido_id end;
begin
  update public.pedidos p
     set valor_productos    = coalesce(s.valor, 0),
         cantidad_productos = coalesce(s.cantidad, 0)
    from (select sum(subtotal) as valor, sum(cantidad)::int as cantidad
            from public.productos_pedido where pedido_id = v_pedido) s
   where p.id = v_pedido
     and (p.valor_productos is distinct from coalesce(s.valor, 0)
          or p.cantidad_productos is distinct from coalesce(s.cantidad, 0));
  if tg_op = 'UPDATE' and old.pedido_id is distinct from new.pedido_id then
    update public.pedidos p
       set valor_productos    = coalesce((select sum(subtotal) from public.productos_pedido where pedido_id = old.pedido_id), 0),
           cantidad_productos = coalesce((select sum(cantidad)::int from public.productos_pedido where pedido_id = old.pedido_id), 0)
     where p.id = old.pedido_id;
  end if;
  return null;
end $$;

create trigger productos_pedido_sincronizar
  after insert or update or delete on public.productos_pedido
  for each row execute function public.sincronizar_productos();

revoke execute on function public.sincronizar_productos() from public, anon, authenticated;
