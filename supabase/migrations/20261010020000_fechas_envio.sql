-- Fechas de envío: normalmente dos salidas al mes. Cada pedido puede ir en una fecha.
-- La administradora agrupa los pedidos, ve el resumen y cambia el estado de todos a la vez.

create table if not exists public.fechas_envio (
  id             uuid primary key default gen_random_uuid(),
  fecha          date not null unique,
  estado         text not null default 'ABIERTA' check (estado in ('ABIERTA', 'ENVIADA', 'ENTREGADA')),
  notas          text check (notas is null or length(notas) <= 500),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table public.fechas_envio enable row level security;
revoke all on public.fechas_envio from anon;

create policy admin_fechas on public.fechas_envio
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

create trigger fechas_envio_actualizado before update on public.fechas_envio
  for each row execute function public.tocar_actualizado_en();

-- Sin borrado en cascada: una fecha con pedidos no se puede eliminar.
alter table public.pedidos add column if not exists fecha_envio_id uuid references public.fechas_envio (id);
create index if not exists pedidos_fecha_envio_idx on public.pedidos (fecha_envio_id);

-- Cambia el estado de una fecha y, si sale o llega, el de todos sus pedidos.
-- Los pedidos cancelados no se tocan. El historial de cada pedido lo guarda su trigger.
create or replace function public.marcar_fecha_envio(p_id uuid, p_estado text)
returns integer language plpgsql volatile security definer set search_path = public as $$
declare
  n integer := 0;
begin
  if not public.es_admin() then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if p_estado not in ('ABIERTA', 'ENVIADA', 'ENTREGADA') then
    raise exception 'campo_invalido:estado' using errcode = 'P0001';
  end if;
  update public.fechas_envio set estado = p_estado where id = p_id;
  if not found then
    raise exception 'campo_invalido:fecha' using errcode = 'P0001';
  end if;
  if p_estado = 'ENVIADA' then
    update public.pedidos set estado = 'ENVIADO'
     where fecha_envio_id = p_id and estado not in ('ENVIADO', 'ENTREGADO', 'CANCELADO');
    get diagnostics n = row_count;
  elsif p_estado = 'ENTREGADA' then
    update public.pedidos set estado = 'ENTREGADO'
     where fecha_envio_id = p_id and estado not in ('ENTREGADO', 'CANCELADO');
    get diagnostics n = row_count;
  end if;
  return n;
end $$;

-- Próxima salida para mostrarla en el formulario público. Solo devuelve una fecha.
create or replace function public.proxima_salida()
returns date language sql stable security definer set search_path = public as $$
  select min(fecha) from public.fechas_envio
   where estado = 'ABIERTA' and fecha >= (now() at time zone 'America/Guayaquil')::date
$$;

revoke execute on function public.marcar_fecha_envio(uuid, text), public.proxima_salida() from public, anon, authenticated;
grant execute on function public.marcar_fecha_envio(uuid, text) to authenticated;
grant execute on function public.proxima_salida() to anon, authenticated;
