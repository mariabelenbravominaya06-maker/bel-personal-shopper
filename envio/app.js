(function () {
  "use strict";

  const PROVINCIAS = ["Azuay", "Bolívar", "Cañar", "Carchi", "Chimborazo", "Cotopaxi", "El Oro", "Esmeraldas",
    "Galápagos", "Guayas", "Imbabura", "Loja", "Los Ríos", "Manabí", "Morona Santiago", "Napo", "Orellana",
    "Pastaza", "Pichincha", "Santa Elena", "Santo Domingo de los Tsáchilas", "Sucumbíos", "Tungurahua",
    "Zamora Chinchipe"];

  const MENSAJES = {
    obligatorio: "Este campo es obligatorio.",
    nombre: "Escribe el nombre y apellido de quien recibe.",
    documento: "Escribe la cédula o documento sin espacios (5 a 20 caracteres).",
    whatsapp: "Escribe tu número con código de país, por ejemplo +593 991234567.",
    email: "Revisa el correo, por ejemplo nombre@gmail.com.",
    provincia: "Elige una provincia.",
    ciudad: "Escribe la ciudad o cantón.",
    calle_principal: "Escribe la calle principal.",
    referencia: "Escribe una referencia para encontrar la dirección.",
    codigo_postal: "El código postal de Ecuador tiene 6 números.",
    contacto_alt_telefono: "Revisa el teléfono alternativo.",
    doc4: "Escribe exactamente 4 números.",
  };

  const app = document.getElementById("app");
  const cfg = window.BEL_CONFIG || {};
  const configurado = cfg.supabaseUrl && cfg.supabaseUrl.startsWith("https://") && window.supabase;
  const sb = configurado ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) : null;

  const nuevaClave = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15);
      return (c === "x" ? r : (r & 3) | 8).toString(16);
    });

  const st = {
    paso: "tipo", tipo: null, datos: { whatsapp: "+593 " }, errores: {}, aviso: "",
    encontrado: null, usarDir: true, enviando: false, codigo: null, clave: nuevaClave(), salida: null,
  };

  // Próxima fecha de envío que la administradora dejó abierta (solo la fecha).
  function textoSalida(iso) {
    const d = new Date(iso + "T12:00:00");
    const t = d.toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const flujo = () => st.tipo === "registrado" ? ["tipo", "buscar", "direccion", "confirmar"] : ["tipo", "personal", "direccion", "confirmar"];

  function cabecera(titulo, sub) {
    const i = flujo().indexOf(st.paso);
    return `<header class="f-head"><a class="marca" href="../"><img src="../assets/logo-bel.png" alt="" width="40" height="40"><span><b>Bel Personal Shopper</b><small>Tu estilo, sin fronteras</small></span></a><h1 style="font-size:1.5rem">${titulo}</h1><p>${sub}</p>
      <div class="progress" aria-label="Paso ${i + 1} de 4">${[0, 1, 2, 3].map((n) => `<span class="${n <= i ? "on" : ""}"></span>`).join("")}</div></header>`;
  }

  function campo(id, etiqueta, o) {
    o = o || {};
    const e = st.errores[id];
    const v = st.datos[id] != null ? st.datos[id] : "";
    const ctrl = o.area
      ? `<textarea id="${id}" maxlength="${o.max || 300}" placeholder="${esc(o.ph || "")}" ${e ? 'aria-invalid="true"' : ""} aria-describedby="${id}-msg">${esc(v)}</textarea>`
      : `<input id="${id}" type="${o.type || "text"}" maxlength="${o.max || 150}" placeholder="${esc(o.ph || "")}" value="${esc(v)}" ${o.attrs || ""} ${e ? 'aria-invalid="true"' : ""} aria-describedby="${id}-msg">`;
    return `<div class="field ${e ? "err" : ""}"><label for="${id}">${etiqueta}${o.opt ? ' <span class="opt">(opcional)</span>' : ""}</label>${ctrl}<span class="msg" id="${id}-msg">${e ? esc(e) : ""}</span></div>`;
  }

  function botones(sig) {
    return `<div class="actions"><button type="button" class="btn btn-ghost" id="atras">Atrás</button><button type="submit" class="btn btn-primary" id="siguiente" ${st.enviando ? "disabled" : ""}>${sig}</button></div>`;
  }

  function vista() {
    if (!configurado) {
      return `${"<header class='f-head'><span class='marca'><img src='../assets/logo-bel.png' alt='' width='40' height='40'><span><b>Bel Personal Shopper</b><small>Tu estilo, sin fronteras</small></span></span><h1 style='font-size:1.5rem'>Formulario no disponible</h1></header>"}
        <div class="f-body"><p class="alert">El formulario todavía no está conectado. Escríbenos por WhatsApp para enviarnos tus datos.</p></div>`;
    }
    const d = st.datos;
    if (st.paso === "tipo") {
      return cabecera("Datos para tu envío", "Completa tus datos para que tu compra llegue a Ecuador. Toma unos 2 minutos.") + `
        <form class="f-body" novalidate>
          <div class="choice" role="group" aria-label="Tipo de cliente">
            <button type="button" data-tipo="nuevo" aria-pressed="${st.tipo === "nuevo"}"><b>Soy cliente nuevo</b><span>Es mi primera compra con Bel.</span></button>
            <button type="button" data-tipo="registrado" aria-pressed="${st.tipo === "registrado"}"><b>Ya he comprado antes</b><span>Busca mis datos de forma segura.</span></button>
          </div>
          ${st.salida ? `<p class="salida"><span aria-hidden="true">✈️</span> Próxima salida a Ecuador: <b>${esc(textoSalida(st.salida))}</b></p>` : ""}
          <p class="callout">Tus datos se usan solo para gestionar tu pedido, el envío y la atención relacionada. No pedimos contraseñas ni datos bancarios.</p>
          <div class="actions"><button type="submit" class="btn btn-primary" id="siguiente" ${st.tipo ? "" : "disabled"}>Continuar</button></div>
        </form>`;
    }
    if (st.paso === "buscar") {
      return cabecera("Encuentra tus datos", "Escribe tu WhatsApp o tu nombre completo, y los últimos 4 dígitos de tu documento.") + `
        <form class="f-body" novalidate>
          ${campo("consulta", "WhatsApp o nombre completo", { ph: "Ej. 0991234567", max: 120, attrs: 'autocomplete="off"' })}
          ${campo("doc4", "Últimos 4 dígitos de tu documento", { ph: "Ej. 4521", max: 4, attrs: 'inputmode="numeric" autocomplete="off"' })}
          ${st.aviso ? `<p class="callout" role="alert">${esc(st.aviso)}</p>` : ""}
          ${st.encontrado ? `<p class="found">Te encontramos: ${esc(st.encontrado.nombre)} · WhatsApp ${esc(st.encontrado.whatsapp)}</p>` : ""}
          ${botones(st.encontrado ? "Continuar" : (st.enviando ? "Buscando…" : "Buscar"))}
        </form>`;
    }
    if (st.paso === "personal") {
      return cabecera("Datos del destinatario", "Quién recibe el paquete en Ecuador.") + `
        <form class="f-body" novalidate>
          ${campo("nombre", "Nombre completo del destinatario", { ph: "Nombre y apellidos", max: 120, attrs: 'autocomplete="name"' })}
          ${campo("documento", "Número de cédula o documento", { max: 20, attrs: 'autocomplete="off"' })}
          ${campo("whatsapp", "WhatsApp con código de país", { type: "tel", max: 25, attrs: 'autocomplete="tel"' })}
          ${campo("email", "Correo electrónico", { type: "email", opt: true, max: 120, attrs: 'autocomplete="email"' })}
          ${botones("Continuar")}
        </form>`;
    }
    if (st.paso === "direccion") {
      const usar = st.tipo === "registrado" && st.usarDir;
      const puedeUsar = st.tipo === "registrado" && st.encontrado && st.encontrado.tiene_direccion;
      return cabecera("Dirección de entrega", "Mientras más detalle, más fácil llega tu paquete.") + `
        <form class="f-body" novalidate>
          ${puedeUsar ? `<div class="choice" role="group" aria-label="Dirección">
            <button type="button" data-dir="1" aria-pressed="${st.usarDir}"><b>Usar la dirección de mi último pedido</b><span>Por seguridad no la mostramos aquí.</span></button>
            <button type="button" data-dir="0" aria-pressed="${!st.usarDir}"><b>Ingresar otra dirección</b><span>Para enviar a un lugar distinto.</span></button></div>` : ""}
          ${usar ? "" : `
          <div class="field"><label for="pais">País</label><select id="pais" disabled><option>Ecuador</option></select></div>
          <div class="field ${st.errores.provincia ? "err" : ""}"><label for="provincia">Provincia</label>
            <select id="provincia" aria-describedby="provincia-msg"><option value="">Elige tu provincia</option>${PROVINCIAS.map((p) => `<option ${d.provincia === p ? "selected" : ""}>${p}</option>`).join("")}</select>
            <span class="msg" id="provincia-msg">${esc(st.errores.provincia || "")}</span></div>
          <div class="row2">${campo("ciudad", "Ciudad o cantón", { max: 80 })}${campo("codigo_postal", "Código postal", { opt: true, max: 6, attrs: 'inputmode="numeric"' })}</div>
          ${campo("calle_principal", "Calle principal", { max: 150, attrs: 'autocomplete="address-line1"' })}
          <div class="row2">${campo("numero", "Número, casa o depto.", { opt: true, max: 40 })}${campo("calle_secundaria", "Calle secundaria", { opt: true, max: 150 })}</div>
          ${campo("referencia", "Referencia para encontrar la dirección", { area: true, max: 300, ph: "Ej. casa blanca de dos pisos, frente al parque" })}`}
          ${campo("contacto_alt_nombre", "Persona alternativa de contacto", { opt: true, max: 120 })}
          ${campo("contacto_alt_telefono", "Teléfono alternativo", { type: "tel", opt: true, max: 30 })}
          ${botones("Continuar")}
        </form>`;
    }
    if (st.paso === "confirmar") {
      const dir = st.tipo === "registrado" && st.usarDir && st.encontrado && st.encontrado.tiene_direccion
        ? "Dirección de tu último pedido"
        : [d.calle_principal, d.numero, d.calle_secundaria, d.ciudad, d.provincia, "Ecuador"].filter(Boolean).join(", ");
      const quien = st.tipo === "nuevo"
        ? `<b>${esc(d.nombre)}</b><span>${esc(d.whatsapp)}</span>`
        : `<b>${esc(st.encontrado.nombre)}</b><span>WhatsApp ${esc(st.encontrado.whatsapp)}</span>`;
      return cabecera("Revisa y envía", "Confirma que todo esté correcto.") + `
        <form class="f-body" novalidate>
          <div class="summary">${quien}<span>${esc(dir)}</span></div>
          ${campo("instrucciones", "Instrucciones especiales para la entrega", { area: true, opt: true, max: 500, ph: "Ej. entregar después de las 3 pm" })}
          <label class="check"><input type="checkbox" id="confirmo_datos" ${d.confirmo_datos ? "checked" : ""}><span>Revisé mis datos y son correctos.</span></label>
          <label class="check"><input type="checkbox" id="consentimiento" ${d.consentimiento ? "checked" : ""}><span>Acepto que mis datos se usen solo para gestionar mi pedido, el envío y la atención relacionada.</span></label>
          <div class="hp" aria-hidden="true"><label for="sitio_web">No llenar</label><input id="sitio_web" tabindex="-1" autocomplete="off"></div>
          ${st.errores.confirmar ? `<p class="msg" style="color:var(--danger)" role="alert">${esc(st.errores.confirmar)}</p>` : ""}
          ${st.aviso ? `<p class="alert" role="alert">${esc(st.aviso)}</p>` : ""}
          ${botones(st.enviando ? "Enviando…" : "Enviar datos")}
        </form>`;
    }
    return `<div class="f-body done"><div class="badge-ok" aria-hidden="true">✓</div><h1 style="font-size:1.6rem">¡Datos recibidos!</h1>
      <p style="color:var(--muted)">Tu número de pedido es</p><span class="ref">${esc(st.codigo)}</span>
      <p style="color:var(--muted);max-width:30ch">Guárdalo o envíalo a Bel por WhatsApp si tienes preguntas.</p></div>`;
  }

  function guardar() {
    app.querySelectorAll("input,select,textarea").forEach((el) => {
      if (el.id === "pais") return;
      st.datos[el.id] = el.type === "checkbox" ? el.checked : el.value;
    });
  }

  function pintar(enfocarError) {
    app.innerHTML = vista();
    const form = app.querySelector("form");
    if (form) form.addEventListener("submit", (e) => { e.preventDefault(); siguiente(); });
    app.querySelectorAll("[data-tipo]").forEach((b) => b.addEventListener("click", () => { st.tipo = b.dataset.tipo; pintar(); }));
    app.querySelectorAll("[data-dir]").forEach((b) => b.addEventListener("click", () => { guardar(); st.usarDir = b.dataset.dir === "1"; pintar(); }));
    const atras = document.getElementById("atras");
    if (atras) atras.addEventListener("click", () => {
      guardar(); st.errores = {}; st.aviso = "";
      const f = flujo(); st.paso = f[Math.max(0, f.indexOf(st.paso) - 1)];
      if (st.paso === "buscar") st.encontrado = null;
      pintar(); window.scrollTo(0, 0);
    });
    if (enfocarError) {
      const err = app.querySelector(".err input,.err select,.err textarea");
      if (err) err.focus();
    }
  }

  const v = (k) => String(st.datos[k] == null ? "" : st.datos[k]).trim();
  const soloDigitos = (s) => s.replace(/\D/g, "");

  function validarPersonal() {
    const e = {};
    if (v("nombre").length < 3) e.nombre = MENSAJES.nombre;
    if (!/^[A-Za-z0-9]{5,20}$/.test(v("documento").replace(/[\s.-]/g, ""))) e.documento = MENSAJES.documento;
    const wa = v("whatsapp").replace(/[\s()-]/g, "");
    if (!/^\+\d{8,15}$/.test(wa)) e.whatsapp = MENSAJES.whatsapp;
    if (v("email") && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v("email"))) e.email = MENSAJES.email;
    return e;
  }

  function validarDireccion() {
    const e = {};
    const nueva = !(st.tipo === "registrado" && st.usarDir && st.encontrado && st.encontrado.tiene_direccion);
    if (nueva) {
      if (!PROVINCIAS.includes(v("provincia"))) e.provincia = MENSAJES.provincia;
      if (!v("ciudad")) e.ciudad = MENSAJES.ciudad;
      if (!v("calle_principal")) e.calle_principal = MENSAJES.calle_principal;
      if (!v("referencia")) e.referencia = MENSAJES.referencia;
      if (v("codigo_postal") && !/^\d{6}$/.test(v("codigo_postal"))) e.codigo_postal = MENSAJES.codigo_postal;
    }
    const alt = soloDigitos(v("contacto_alt_telefono"));
    if (v("contacto_alt_telefono") && (alt.length < 7 || alt.length > 15)) e.contacto_alt_telefono = MENSAJES.contacto_alt_telefono;
    return e;
  }

  async function siguiente() {
    if (st.enviando) return;
    guardar(); st.errores = {}; st.aviso = "";

    if (st.paso === "tipo") { st.paso = st.tipo === "nuevo" ? "personal" : "buscar"; pintar(); return; }

    if (st.paso === "buscar") {
      if (st.encontrado) { st.paso = "direccion"; st.usarDir = !!st.encontrado.tiene_direccion; pintar(); return; }
      if (v("consulta").length < 3) st.errores.consulta = MENSAJES.obligatorio;
      if (!/^\d{4}$/.test(v("doc4"))) st.errores.doc4 = MENSAJES.doc4;
      if (Object.keys(st.errores).length) { pintar(true); return; }
      st.enviando = true; pintar();
      try {
        const { data, error } = await sb.rpc("buscar_cliente", { p_consulta: v("consulta"), p_doc4: v("doc4") });
        if (error) throw error;
        if (data && data.encontrado) st.encontrado = data;
        else if (data && data.error === "demasiados_intentos") st.aviso = "Hiciste demasiados intentos. Espera 10 minutos y vuelve a probar, o regístrate como cliente nuevo.";
        else st.aviso = "No encontramos tus datos. Revisa lo que escribiste o regístrate como cliente nuevo.";
      } catch (err) {
        st.aviso = "No pudimos conectarnos. Revisa tu internet e intenta de nuevo.";
      }
      st.enviando = false; pintar(); return;
    }

    if (st.paso === "personal") {
      st.errores = validarPersonal();
      if (Object.keys(st.errores).length) { pintar(true); return; }
      st.paso = "direccion"; pintar(); window.scrollTo(0, 0); return;
    }

    if (st.paso === "direccion") {
      st.errores = validarDireccion();
      if (Object.keys(st.errores).length) { pintar(true); return; }
      st.paso = "confirmar"; pintar(); window.scrollTo(0, 0); return;
    }

    if (st.paso === "confirmar") {
      if (!st.datos.confirmo_datos || !st.datos.consentimiento) {
        st.errores.confirmar = "Marca las dos casillas para enviar."; pintar(); return;
      }
      st.enviando = true; pintar();
      const usarAnterior = st.tipo === "registrado" && st.usarDir && !!(st.encontrado && st.encontrado.tiene_direccion);
      const p = {
        tipo: st.tipo, idempotency_key: st.clave, sitio_web: v("sitio_web"),
        confirmo_datos: true, consentimiento: true, usar_direccion_anterior: usarAnterior,
        instrucciones: v("instrucciones"), contacto_alt_nombre: v("contacto_alt_nombre"), contacto_alt_telefono: v("contacto_alt_telefono"),
      };
      if (st.tipo === "registrado") { p.consulta = v("consulta"); p.doc4 = v("doc4"); }
      else Object.assign(p, { nombre: v("nombre"), documento: v("documento").replace(/[\s.-]/g, ""), whatsapp: v("whatsapp"), email: v("email") });
      if (!usarAnterior) ["provincia", "ciudad", "codigo_postal", "calle_principal", "numero", "calle_secundaria", "referencia"].forEach((k) => { p[k] = v(k); });

      try {
        const { data, error } = await sb.rpc("enviar_formulario", { p });
        if (error) throw error;
        st.codigo = data.codigo; st.paso = "listo"; st.enviando = false; pintar(); window.scrollTo(0, 0); return;
      } catch (err) {
        st.enviando = false;
        const msg = (err && err.message) || "";
        const campoErr = msg.startsWith("campo_invalido:") ? msg.split(":")[1] : null;
        if (campoErr) {
          st.errores[campoErr] = MENSAJES[campoErr] || MENSAJES.obligatorio;
          st.paso = ["nombre", "documento", "whatsapp", "email"].includes(campoErr) ? "personal" : "direccion";
          pintar(true); return;
        }
        if (msg === "demasiados_intentos") st.aviso = "Recibimos varios envíos con este número. Espera una hora o escríbenos por WhatsApp.";
        else if (msg === "cliente_no_encontrado") st.aviso = "Ya no pudimos verificar tus datos. Vuelve atrás y búscate de nuevo.";
        else if (msg === "sin_direccion_anterior") { st.usarDir = false; st.paso = "direccion"; st.aviso = ""; st.errores = {}; pintar(); return; }
        else st.aviso = "No pudimos guardar tus datos. Revisa tu internet e intenta de nuevo; no se duplicará tu pedido.";
        pintar();
      }
    }
  }

  pintar();
  if (sb) {
    sb.rpc("proxima_salida").then(({ data }) => {
      if (typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data)) { st.salida = data; if (st.paso === "tipo") pintar(); }
    }, () => {});
  }
})();
