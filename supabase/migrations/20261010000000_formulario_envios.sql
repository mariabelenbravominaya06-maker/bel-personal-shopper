-- Bel Personal Shopper: formulario de envío y dashboard privado.
--
-- Seguridad:
-- * Todas las tablas tienen RLS. El público (rol anon) no puede leer ni escribir
--   ninguna tabla directamente.
-- * El formulario público solo usa dos funciones: buscar_cliente() y enviar_formulario().
--   Ninguna devuelve datos personales completos.
-- * El dashboard usa el rol authenticated y solo funciona para usuarios que estén
--   en la tabla administradores.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

-- Deja solo los dígitos del teléfono y convierte el formato local de Ecuador
-- (0991234567) al internacional (593991234567).
create or replace function public.normalizar_telefono(p text)
returns text language sql immutable as $$
  select case
    when d ~ '^0\d{9}$' then '593' || substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s
$$;

-- Minúsculas y espacios simples, para comparar nombres.
create or replace function public.normalizar_nombre(p text)
returns text language sql immutable as $$
  select lower(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'))
$$;

-- Oculta todo menos los últimos 4 caracteres.
create or replace function public.enmascarar(p text)
returns text language sql immutable as $$
  select case when p is null or p = '' then p
              else repeat('*', greatest(length(p) - 4, 0)) || right(p, 4) end
$$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.administradores (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  email     text not null,
  creado_en timestamptz not null default now()
);

create table if not exists public.clientes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  documento      text,
  whatsapp       text not null,
  whatsapp_norm  text generated always as (public.normalizar_telefono(whatsapp)) stored,
  nombre_norm    text generated always as (public.normalizar_nombre(nombre)) stored,
  email          text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists clientes_whatsapp_norm_key on public.clientes (whatsapp_norm);
create index if not exists clientes_documento_idx on public.clientes (documento);
create index if not exists clientes_nombre_norm_idx on public.clientes (nombre_norm);

create table if not exists public.pedidos (
  id                       uuid primary key default gen_random_uuid(),
  numero                   bigint generated always as identity,
  codigo                   text generated always as ('BP-' || lpad(numero::text, 4, '0')) stored,
  cliente_id               uuid not null references public.clientes (id) on delete restrict,
  estado                   text not null default 'NUEVO' check (estado in (
                             'NUEVO', 'VENTA CONFIRMADA', 'PAGO CONFIRMADO',
                             'DATOS DE ENVÍO PENDIENTES', 'DATOS DE ENVÍO COMPLETOS',
                             'COMPRADO', 'ENVIADO', 'ENTREGADO', 'CANCELADO')),
  estado_formulario        text not null default 'PENDIENTE' check (estado_formulario in ('PENDIENTE', 'COMPLETO')),
  origen                   text not null default 'MANUAL' check (origen in ('FORMULARIO', 'MANUAL')),
  notas                    text,
  idempotency_key          uuid unique,
  formulario_completado_en timestamptz,
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now(),

  -- Valores (solo administradora). Montos en USD.
  valor_productos       numeric(12,2) not null default 0 check (valor_productos >= 0),
  cantidad_productos    integer       not null default 0 check (cantidad_productos >= 0),
  tax_porcentaje        numeric(6,3)  not null default 0 check (tax_porcentaje >= 0 and tax_porcentaje <= 100),
  libras                numeric(10,2) not null default 0 check (libras >= 0),
  valor_libra           numeric(10,2) not null default 0 check (valor_libra >= 0),
  comision_por_producto numeric(10,2) not null default 4 check (comision_por_producto >= 0),
  pagado                numeric(12,2) not null default 0 check (pagado >= 0),

  -- Calculados por la base de datos (no se pueden editar).
  tax_monto    numeric(12,2) generated always as (round(valor_productos * tax_porcentaje / 100, 2)) stored,
  costo_envio  numeric(12,2) generated always as (round(libras * valor_libra, 2)) stored,
  comision     numeric(12,2) generated always as (round(cantidad_productos * comision_por_producto, 2)) stored,
  total        numeric(12,2) generated always as (
                 valor_productos
                 + round(valor_productos * tax_porcentaje / 100, 2)
                 + round(libras * valor_libra, 2)
                 + round(cantidad_productos * comision_por_producto, 2)) stored,
  saldo        numeric(12,2) generated always as (
                 valor_productos
                 + round(valor_productos * tax_porcentaje / 100, 2)
                 + round(libras * valor_libra, 2)
                 + round(cantidad_productos * comision_por_producto, 2)
                 - pagado) stored
);
create index if not exists pedidos_cliente_idx on public.pedidos (cliente_id);
create index if not exists pedidos_creado_idx on public.pedidos (creado_en desc);

-- Copia fija de los datos de envío de cada pedido.
create table if not exists public.datos_envio (
  pedido_id             uuid primary key references public.pedidos (id) on delete cascade,
  nombre                text not null,
  documento             text,
  whatsapp              text not null,
  email                 text,
  pais                  text not null default 'Ecuador',
  provincia             text,
  ciudad                text,
  codigo_postal         text,
  calle_principal       text,
  numero                text,
  calle_secundaria      text,
  referencia            text,
  contacto_alt_nombre   text,
  contacto_alt_telefono text,
  instrucciones         text,
  confirmo_datos        boolean not null default false,
  consentimiento        boolean not null default false,
  enviado_en            timestamptz,
  actualizado_en        timestamptz not null default now()
);

create table if not exists public.historial_cambios (
  id             bigint generated always as identity primary key,
  pedido_id      uuid references public.pedidos (id) on delete cascade,
  tabla          text not null,
  campo          text not null,
  valor_anterior text,
  valor_nuevo    text,
  usuario_id     uuid,
  creado_en      timestamptz not null default now()
);
create index if not exists historial_pedido_idx on public.historial_cambios (pedido_id, creado_en desc);

-- Registro de intentos para limitar búsquedas y envíos del formulario público.
create table if not exists public.intentos_publicos (
  id        bigint generated always as identity primary key,
  tipo      text not null,
  clave     text not null,
  creado_en timestamptz not null default now()
);
create index if not exists intentos_publicos_idx on public.intentos_publicos (tipo, clave, creado_en desc);

-- ---------------------------------------------------------------------------
-- Permisos (RLS)
-- ---------------------------------------------------------------------------

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.administradores where user_id = auth.uid())
$$;

alter table public.administradores   enable row level security;
alter table public.clientes          enable row level security;
alter table public.pedidos           enable row level security;
alter table public.datos_envio       enable row level security;
alter table public.historial_cambios enable row level security;
alter table public.intentos_publicos enable row level security;

revoke all on public.administradores, public.clientes, public.pedidos, public.datos_envio,
              public.historial_cambios, public.intentos_publicos from anon;

drop policy if exists admin_ve_su_registro on public.administradores;
create policy admin_ve_su_registro on public.administradores
  for select to authenticated using (user_id = auth.uid());

drop policy if exists admin_clientes on public.clientes;
create policy admin_clientes on public.clientes
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists admin_pedidos on public.pedidos;
create policy admin_pedidos on public.pedidos
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists admin_datos_envio on public.datos_envio;
create policy admin_datos_envio on public.datos_envio
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists admin_historial on public.historial_cambios;
create policy admin_historial on public.historial_cambios
  for select to authenticated using (public.es_admin());
-- intentos_publicos: sin políticas; solo lo usan las funciones del servidor.

-- ---------------------------------------------------------------------------
-- Fechas de actualización e historial de cambios
-- ---------------------------------------------------------------------------

create or replace function public.tocar_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists clientes_actualizado on public.clientes;
create trigger clientes_actualizado before update on public.clientes
  for each row execute function public.tocar_actualizado_en();
drop trigger if exists pedidos_actualizado on public.pedidos;
create trigger pedidos_actualizado before update on public.pedidos
  for each row execute function public.tocar_actualizado_en();
drop trigger if exists datos_envio_actualizado on public.datos_envio;
create trigger datos_envio_actualizado before update on public.datos_envio
  for each row execute function public.tocar_actualizado_en();

-- Guarda un renglón por cada campo que cambió. El documento se guarda enmascarado.
create or replace function public.registrar_cambios()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_pedido uuid := (case when tg_table_name = 'pedidos' then v_new ->> 'id' else v_new ->> 'pedido_id' end)::uuid;
  k text;
  v_ant text;
  v_nue text;
begin
  for k in select jsonb_object_keys(v_new) loop
    continue when k in ('actualizado_en', 'tax_monto', 'costo_envio', 'comision', 'total', 'saldo');
    v_ant := v_old ->> k;
    v_nue := v_new ->> k;
    if v_ant is distinct from v_nue then
      if k = 'documento' then
        v_ant := public.enmascarar(v_ant);
        v_nue := public.enmascarar(v_nue);
      end if;
      insert into public.historial_cambios (pedido_id, tabla, campo, valor_anterior, valor_nuevo, usuario_id)
      values (v_pedido, tg_table_name, k, v_ant, v_nue, auth.uid());
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists pedidos_historial on public.pedidos;
create trigger pedidos_historial after update on public.pedidos
  for each row execute function public.registrar_cambios();
drop trigger if exists datos_envio_historial on public.datos_envio;
create trigger datos_envio_historial after update on public.datos_envio
  for each row execute function public.registrar_cambios();

-- ---------------------------------------------------------------------------
-- Funciones internas del formulario
-- ---------------------------------------------------------------------------

-- IP del cliente según los encabezados que entrega Supabase (puede ser null).
create or replace function public.ip_solicitud()
returns text language sql stable as $$
  select split_part(coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)
$$;

-- Registra un intento y devuelve true si se superó el límite.
create or replace function public.limite_superado(p_tipo text, p_clave text, p_max int, p_ventana interval)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if p_clave is null or p_clave = '' then
    return false;
  end if;
  delete from public.intentos_publicos where creado_en < now() - interval '1 day';
  select count(*) into n from public.intentos_publicos
   where tipo = p_tipo and clave = p_clave and creado_en > now() - p_ventana;
  insert into public.intentos_publicos (tipo, clave) values (p_tipo, p_clave);
  return n >= p_max;
end $$;

-- Busca un cliente por WhatsApp o nombre completo + últimos 4 dígitos del documento.
create or replace function public._encontrar_cliente(p_consulta text, p_doc4 text)
returns public.clientes language sql stable security definer set search_path = public as $$
  select c.*
    from public.clientes c
   where c.documento is not null
     and right(c.documento, 4) = p_doc4
     and (
       (length(public.normalizar_telefono(p_consulta)) >= 8
          and c.whatsapp_norm = public.normalizar_telefono(p_consulta))
       or c.nombre_norm = public.normalizar_nombre(p_consulta)
     )
   order by c.actualizado_en desc
   limit 1
$$;

create or replace function public._texto(p jsonb, k text, p_max int)
returns text language plpgsql immutable as $$
declare v text := nullif(trim(coalesce(p ->> k, '')), '');
begin
  if v is not null and length(v) > p_max then
    raise exception 'campo_largo:%', k using errcode = 'P0001';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Funciones públicas (las usa el formulario con la clave anon)
-- ---------------------------------------------------------------------------

-- Devuelve solo si encontró al cliente, con nombre y WhatsApp enmascarados.
create or replace function public.buscar_cliente(p_consulta text, p_doc4 text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c public.clientes;
  v_ip text := public.ip_solicitud();
  v_clave text := coalesce(nullif(public.normalizar_telefono(p_consulta), ''), public.normalizar_nombre(p_consulta));
  v_tiene_dir boolean;
begin
  if public.limite_superado('busqueda_ip', v_ip, 5, interval '10 minutes')
     or public.limite_superado('busqueda', v_clave, 5, interval '10 minutes') then
    return jsonb_build_object('encontrado', false, 'error', 'demasiados_intentos');
  end if;

  if coalesce(p_doc4, '') !~ '^\d{4}$' or length(trim(coalesce(p_consulta, ''))) < 3 then
    return jsonb_build_object('encontrado', false);
  end if;

  c := public._encontrar_cliente(p_consulta, p_doc4);
  if c.id is null then
    return jsonb_build_object('encontrado', false);
  end if;

  select exists (
    select 1 from public.pedidos p join public.datos_envio d on d.pedido_id = p.id
     where p.cliente_id = c.id and d.calle_principal is not null
  ) into v_tiene_dir;

  return jsonb_build_object(
    'encontrado', true,
    'nombre', (select string_agg(left(w, 1) || '***', ' ') from unnest(string_to_array(trim(c.nombre), ' ')) w),
    'whatsapp', '••••' || right(c.whatsapp_norm, 4),
    'tiene_direccion', v_tiene_dir
  );
end $$;

-- Guarda el formulario y crea un pedido nuevo. Devuelve solo el código del pedido.
create or replace function public.enviar_formulario(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_key       uuid;
  v_existente text;
  v_tipo      text := p ->> 'tipo';
  v_ip        text := public.ip_solicitud();
  c           public.clientes;
  v_usar_dir  boolean := coalesce((p ->> 'usar_direccion_anterior')::boolean, false);
  d_ant       public.datos_envio;
  v_pedido    public.pedidos;
  -- campos
  v_nombre text; v_doc text; v_wa text; v_email text;
  v_prov text; v_ciudad text; v_cp text; v_calle1 text; v_num text; v_calle2 text; v_ref text;
  v_alt_n text; v_alt_t text; v_instr text;
  v_provincias text[] := array['Azuay','Bolívar','Cañar','Carchi','Chimborazo','Cotopaxi','El Oro',
    'Esmeraldas','Galápagos','Guayas','Imbabura','Loja','Los Ríos','Manabí','Morona Santiago','Napo',
    'Orellana','Pastaza','Pichincha','Santa Elena','Santo Domingo de los Tsáchilas','Sucumbíos',
    'Tungurahua','Zamora Chinchipe'];
begin
  -- Campo oculto contra robots.
  if coalesce(p ->> 'sitio_web', '') <> '' then
    raise exception 'rechazado' using errcode = 'P0001';
  end if;

  begin
    v_key := (p ->> 'idempotency_key')::uuid;
  exception when others then
    raise exception 'solicitud_invalida' using errcode = 'P0001';
  end;
  if v_key is null then
    raise exception 'solicitud_invalida' using errcode = 'P0001';
  end if;

  -- Si el mismo envío llega dos veces, devuelve el pedido ya creado.
  select codigo into v_existente from public.pedidos where idempotency_key = v_key;
  if v_existente is not null then
    return jsonb_build_object('ok', true, 'codigo', v_existente);
  end if;

  if public.limite_superado('envio_ip', v_ip, 20, interval '1 hour') then
    raise exception 'demasiados_intentos' using errcode = 'P0001';
  end if;

  if coalesce((p ->> 'confirmo_datos')::boolean, false) is not true
     or coalesce((p ->> 'consentimiento')::boolean, false) is not true then
    raise exception 'falta_confirmacion' using errcode = 'P0001';
  end if;

  v_alt_n := public._texto(p, 'contacto_alt_nombre', 120);
  v_alt_t := public._texto(p, 'contacto_alt_telefono', 30);
  v_instr := public._texto(p, 'instrucciones', 500);
  if v_alt_t is not null and length(public.normalizar_telefono(v_alt_t)) not between 7 and 15 then
    raise exception 'campo_invalido:contacto_alt_telefono' using errcode = 'P0001';
  end if;

  if v_tipo = 'registrado' then
    c := public._encontrar_cliente(p ->> 'consulta', p ->> 'doc4');
    if c.id is null then
      raise exception 'cliente_no_encontrado' using errcode = 'P0001';
    end if;
    v_nombre := c.nombre; v_doc := c.documento; v_wa := c.whatsapp; v_email := c.email;
  elsif v_tipo = 'nuevo' then
    v_nombre := public._texto(p, 'nombre', 120);
    v_doc    := upper(regexp_replace(coalesce(public._texto(p, 'documento', 20), ''), '[\s.-]', '', 'g'));
    v_wa     := public._texto(p, 'whatsapp', 25);
    v_email  := lower(public._texto(p, 'email', 120));
    if v_nombre is null or length(v_nombre) < 3 then
      raise exception 'campo_invalido:nombre' using errcode = 'P0001';
    end if;
    if v_doc !~ '^[A-Z0-9]{5,20}$' then
      raise exception 'campo_invalido:documento' using errcode = 'P0001';
    end if;
    if v_wa is null or v_wa !~ '^\+' or length(public.normalizar_telefono(v_wa)) not between 8 and 15
       or regexp_replace(v_wa, '[\s()+-]', '', 'g') !~ '^\d+$' then
      raise exception 'campo_invalido:whatsapp' using errcode = 'P0001';
    end if;
    if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then
      raise exception 'campo_invalido:email' using errcode = 'P0001';
    end if;
  else
    raise exception 'solicitud_invalida' using errcode = 'P0001';
  end if;

  if public.limite_superado('envio_whatsapp', public.normalizar_telefono(v_wa), 3, interval '1 hour') then
    raise exception 'demasiados_intentos' using errcode = 'P0001';
  end if;

  -- Dirección
  if v_tipo = 'registrado' and v_usar_dir then
    select d.* into d_ant
      from public.datos_envio d join public.pedidos pe on pe.id = d.pedido_id
     where pe.cliente_id = c.id and d.calle_principal is not null
     order by coalesce(d.enviado_en, pe.creado_en) desc
     limit 1;
    if d_ant.pedido_id is null then
      raise exception 'sin_direccion_anterior' using errcode = 'P0001';
    end if;
    v_prov := d_ant.provincia; v_ciudad := d_ant.ciudad; v_cp := d_ant.codigo_postal;
    v_calle1 := d_ant.calle_principal; v_num := d_ant.numero; v_calle2 := d_ant.calle_secundaria;
    v_ref := d_ant.referencia;
    v_alt_n := coalesce(v_alt_n, d_ant.contacto_alt_nombre);
    v_alt_t := coalesce(v_alt_t, d_ant.contacto_alt_telefono);
  else
    v_prov   := public._texto(p, 'provincia', 60);
    v_ciudad := public._texto(p, 'ciudad', 80);
    v_cp     := public._texto(p, 'codigo_postal', 10);
    v_calle1 := public._texto(p, 'calle_principal', 150);
    v_num    := public._texto(p, 'numero', 40);
    v_calle2 := public._texto(p, 'calle_secundaria', 150);
    v_ref    := public._texto(p, 'referencia', 300);
    if v_prov is null or not (v_prov = any (v_provincias)) then
      raise exception 'campo_invalido:provincia' using errcode = 'P0001';
    end if;
    if v_ciudad is null then raise exception 'campo_invalido:ciudad' using errcode = 'P0001'; end if;
    if v_calle1 is null then raise exception 'campo_invalido:calle_principal' using errcode = 'P0001'; end if;
    if v_ref is null then raise exception 'campo_invalido:referencia' using errcode = 'P0001'; end if;
    if v_cp is not null and v_cp !~ '^\d{6}$' then
      raise exception 'campo_invalido:codigo_postal' using errcode = 'P0001';
    end if;
  end if;

  -- Cliente nuevo: reutiliza la ficha si ya existe el WhatsApp o el documento.
  if v_tipo = 'nuevo' then
    select * into c from public.clientes
     where whatsapp_norm = public.normalizar_telefono(v_wa)
        or documento = v_doc
     order by (whatsapp_norm = public.normalizar_telefono(v_wa)) desc, actualizado_en desc
     limit 1;
    if c.id is null then
      insert into public.clientes (nombre, documento, whatsapp, email)
      values (v_nombre, v_doc, v_wa, v_email)
      returning * into c;
    else
      -- El documento y el WhatsApp ya registrados no se cambian desde el formulario público.
      update public.clientes
         set email = coalesce(v_email, email),
             documento = coalesce(documento, v_doc)
       where id = c.id;
    end if;
  end if;

  insert into public.pedidos (cliente_id, estado, estado_formulario, origen, idempotency_key, formulario_completado_en)
  values (c.id, 'DATOS DE ENVÍO COMPLETOS', 'COMPLETO', 'FORMULARIO', v_key, now())
  on conflict (idempotency_key) do nothing
  returning * into v_pedido;

  if v_pedido.id is null then
    -- Otro envío idéntico ganó la carrera.
    select codigo into v_existente from public.pedidos where idempotency_key = v_key;
    return jsonb_build_object('ok', true, 'codigo', v_existente);
  end if;

  insert into public.datos_envio (
    pedido_id, nombre, documento, whatsapp, email, provincia, ciudad, codigo_postal,
    calle_principal, numero, calle_secundaria, referencia, contacto_alt_nombre,
    contacto_alt_telefono, instrucciones, confirmo_datos, consentimiento, enviado_en)
  values (
    v_pedido.id, v_nombre, v_doc, v_wa, v_email, v_prov, v_ciudad, v_cp,
    v_calle1, v_num, v_calle2, v_ref, v_alt_n, v_alt_t, v_instr, true, true, now());

  insert into public.historial_cambios (pedido_id, tabla, campo, valor_nuevo)
  values (v_pedido.id, 'pedidos', 'creado', 'El cliente envió el formulario');

  return jsonb_build_object('ok', true, 'codigo', v_pedido.codigo);
end $$;

-- ---------------------------------------------------------------------------
-- Función del dashboard: pedido manual
-- ---------------------------------------------------------------------------

create or replace function public.crear_pedido_manual(p_nombre text, p_whatsapp text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  c public.clientes;
  v_pedido public.pedidos;
begin
  if not public.es_admin() then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_nombre, ''))) < 3 or length(public.normalizar_telefono(p_whatsapp)) not between 8 and 15 then
    raise exception 'campo_invalido' using errcode = 'P0001';
  end if;
  select * into c from public.clientes where whatsapp_norm = public.normalizar_telefono(p_whatsapp);
  if c.id is null then
    insert into public.clientes (nombre, whatsapp) values (trim(p_nombre), trim(p_whatsapp)) returning * into c;
  end if;
  insert into public.pedidos (cliente_id, estado, estado_formulario, origen)
  values (c.id, 'NUEVO', 'PENDIENTE', 'MANUAL')
  returning * into v_pedido;
  insert into public.datos_envio (pedido_id, nombre, documento, whatsapp, email)
  values (v_pedido.id, c.nombre, c.documento, c.whatsapp, c.email);
  insert into public.historial_cambios (pedido_id, tabla, campo, valor_nuevo, usuario_id)
  values (v_pedido.id, 'pedidos', 'creado', 'Pedido creado a mano', auth.uid());
  return jsonb_build_object('id', v_pedido.id, 'codigo', v_pedido.codigo);
end $$;

-- ---------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------

-- Solo se tocan las funciones de esta migración.
revoke execute on function
  public.normalizar_telefono(text), public.normalizar_nombre(text), public.enmascarar(text),
  public.es_admin(), public.tocar_actualizado_en(), public.registrar_cambios(), public.ip_solicitud(),
  public.limite_superado(text, text, int, interval), public._encontrar_cliente(text, text),
  public._texto(jsonb, text, int), public.buscar_cliente(text, text), public.enviar_formulario(jsonb),
  public.crear_pedido_manual(text, text)
  from public, anon, authenticated;
grant execute on function public.buscar_cliente(text, text) to anon, authenticated;
grant execute on function public.enviar_formulario(jsonb) to anon, authenticated;
grant execute on function public.crear_pedido_manual(text, text) to authenticated;
grant execute on function public.es_admin() to authenticated;
-- Funciones usadas por columnas calculadas, triggers y políticas.
grant execute on function public.normalizar_telefono(text), public.normalizar_nombre(text),
  public.enmascarar(text), public.tocar_actualizado_en() to anon, authenticated;

-- Tiempo real para el dashboard (respeta RLS).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.pedidos;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
