// Panel privado de pedidos. Solo funciona con una cuenta registrada en la tabla "administradores":
// la base de datos (RLS) bloquea cualquier lectura o cambio de otra cuenta.
(function () {
  "use strict";

  var CFG = window.BEL_CONFIG || {};
  var app = document.getElementById("app");
  var configurado = CFG.supabaseUrl && CFG.supabaseUrl.indexOf("PEGA_AQUI") === -1 &&
    CFG.supabaseAnonKey && CFG.supabaseAnonKey.indexOf("PEGA_AQUI") === -1 && window.supabase;

  if (!configurado) {
    app.innerHTML = '<div class="login"><div class="alert">Falta configurar el proyecto de Supabase en <b>assets/config.js</b>.</div></div>';
    return;
  }

  var sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  var ENLACE = CFG.enlaceFormulario || "https://belpersonalshopper.com/envio/";

  var LOGO = "../assets/logo-bel.png";
  var CORONA = '<div class="corona" aria-hidden="true"><svg viewBox="0 0 22 16" fill="currentColor"><path d="M1 4l5 4 5-7 5 7 5-4-2 10H3z"/><rect x="3" y="14" width="16" height="2" rx="1"/></svg></div>';
  var ICONOS = {
    caja: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
    casa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    cobro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9v.01M17 15v.01"/></svg>',
    corona: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"/></svg>',
    avion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 13.5L3 11l1.5-1.5 7.5 1L16.5 6a2 2 0 0 1 3 3L15 13.5l1 7.5-1.5 1.5-2.5-7.5-3.5 3.5V21L7 19.5 5.5 17 3 15.5h2.5z"/></svg>'
  };
  function marca(sub) {
    return '<div class="marca"><img src="' + LOGO + '" alt="" width="40" height="40"><div><b>Bel Personal Shopper</b><small>' + esc(sub) + "</small></div></div>";
  }
  var ESTADOS = ["NUEVO", "VENTA CONFIRMADA", "PAGO CONFIRMADO", "DATOS DE ENVÍO PENDIENTES",
    "DATOS DE ENVÍO COMPLETOS", "COMPRADO", "ENVIADO", "ENTREGADO", "CANCELADO"];
  var VALORES = [
    ["valor_productos", "Valor productos sin tax ($)", "0.01"],
    ["cantidad_productos", "Cantidad de productos", "1"],
    ["tax_porcentaje", "Tax (%)", "0.001"],
    ["libras", "Libras", "0.01"],
    ["valor_libra", "Valor libra ($)", "0.01"],
    ["comision_por_producto", "Comisión por producto ($)", "0.01"],
    ["pagado", "Pagado ($)", "0.01"]
  ];
  var ENVIO = [
    ["nombre", "Nombre de quien recibe"], ["documento", "Cédula o pasaporte"], ["whatsapp", "WhatsApp"],
    ["email", "Correo"], ["provincia", "Provincia"], ["ciudad", "Ciudad"], ["codigo_postal", "Código postal"],
    ["calle_principal", "Calle principal"], ["numero", "Número"], ["calle_secundaria", "Calle secundaria"],
    ["referencia", "Referencia"], ["contacto_alt_nombre", "Contacto alterno"],
    ["contacto_alt_telefono", "Teléfono alterno"], ["instrucciones", "Instrucciones de entrega"]
  ];

  var st = {
    usuario: null, pedidos: [], cargando: false, error: "",
    filtros: { q: "", estado: "", desde: "", hasta: "", saldo: "", salida: "" },
    abierto: null, historial: [], editandoEnvio: false,
    fechas: [], vista: leerPref("bel_vista", "pedidos") === "fechas" ? "fechas" : "pedidos",
    fechaAbierta: null, confirmar: null, filtrosAbiertos: false,
    vistoHasta: leerVisto(), sonido: leerPref("bel_sonido", "1") === "1", quitar: null
  };

  // Preferencias guardadas solo en este navegador.
  function leerPref(k, def) { try { var v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } }
  function guardarPref(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  function leerVisto() { var v = leerPref("bel_visto_hasta", ""); return v || new Date().toISOString(); }

  // ---------- Utilidades ----------
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
  function usd(v) { return "$" + num(v).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fecha(v) {
    if (!v) return "";
    return new Date(v).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
  }
  function fechaHora(v) {
    if (!v) return "";
    return new Date(v).toLocaleString("es-EC", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  function diaLocal(v) {
    var d = new Date(v);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  // Fechas de envío (guardadas como día sin hora).
  function diaFecha(iso) { return new Date(iso + "T12:00:00"); }
  function fechaCorta(iso) { return iso ? diaFecha(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short" }) : ""; }
  function fechaLarga(iso) {
    var t = diaFecha(iso).toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" }).replace(",", "");
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function diasHasta(iso) {
    var hoy = diaFecha(diaLocal(new Date()));
    return Math.round((diaFecha(iso) - hoy) / 86400000);
  }
  function relativo(iso) {
    var n = diasHasta(iso);
    return n === 0 ? "hoy" : n === 1 ? "mañana" : n === -1 ? "ayer" : n > 0 ? "en " + n + " días" : "hace " + (-n) + " días";
  }
  function buscarFecha(id) {
    for (var i = 0; i < st.fechas.length; i++) if (st.fechas[i].id === id) return st.fechas[i];
    return null;
  }
  var ESTADO_FECHA = { ABIERTA: "Abierta", ENVIADA: "Enviada", ENTREGADA: "Entregada" };
  function pillFecha(f) {
    var cls = f.estado === "ENTREGADA" ? "p-ok" : f.estado === "ENVIADA" ? "p-gold" : "p-st";
    return '<span class="pill ' + cls + '">' + ESTADO_FECHA[f.estado] + "</span>";
  }
  function pedidosDeFecha(f) { return st.pedidos.filter(function (p) { return p.fecha_envio_id === f.id; }); }
  function resumenFecha(f) {
    var ps = pedidosDeFecha(f), act = ps.filter(function (p) { return p.estado !== "CANCELADO"; });
    var s = function (k) { return r2(act.reduce(function (t, p) { return t + num(p[k]); }, 0)); };
    var conSaldo = act.filter(function (p) { return num(p.saldo) > 0; });
    return { pedidos: ps, activos: act, libras: s("libras"), total: s("total"), pagado: s("pagado"),
      saldo: r2(conSaldo.reduce(function (t, p) { return t + num(p.saldo); }, 0)), conSaldo: conSaldo };
  }
  function ordenFechas() {
    var peso = { ABIERTA: 0, ENVIADA: 1, ENTREGADA: 2 };
    return st.fechas.slice().sort(function (a, b) {
      if (peso[a.estado] !== peso[b.estado]) return peso[a.estado] - peso[b.estado];
      return a.estado === "ABIERTA" ? a.fecha.localeCompare(b.fecha) : b.fecha.localeCompare(a.fecha);
    });
  }
  function proximaFecha() {
    var hoy = diaLocal(new Date());
    return ordenFechas().filter(function (f) { return f.estado === "ABIERTA" && f.fecha >= hoy; })[0] || null;
  }
  function libras(n) { return num(n).toLocaleString("es-EC", { maximumFractionDigits: 2 }) + " lb"; }

  function digitos(tel) {
    var d = String(tel || "").replace(/\D/g, "");
    if (/^0\d{9}$/.test(d)) d = "593" + d.slice(1);
    return d;
  }
  function envioDe(p) {
    var e = p.datos_envio;
    if (Array.isArray(e)) e = e[0];
    return e || null;
  }
  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  }
  function toast(texto) {
    var t = document.createElement("div");
    t.className = "toast"; t.setAttribute("role", "status"); t.textContent = texto;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2400);
  }
  function copiar(texto) {
    var listo = function () { toast("Copiado"); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texto).then(listo, function () { copiarRespaldo(texto); listo(); });
    } else { copiarRespaldo(texto); listo(); }
  }
  function copiarRespaldo(texto) {
    var ta = document.createElement("textarea");
    ta.value = texto; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  function mensajeError(err) {
    var m = (err && (err.message || err.error_description)) || "";
    if (/Invalid login credentials/i.test(m)) return "Correo o contraseña incorrectos.";
    if (/Email not confirmed/i.test(m)) return "Primero confirma tu correo desde el mensaje que te envió Supabase.";
    if (/no_autorizado|permission denied|row-level security/i.test(m)) return "Esta cuenta no tiene permiso para esta acción.";
    if (/duplicate key|unique/i.test(m)) return "Esa fecha ya existe.";
    if (/foreign key/i.test(m)) return "Esa fecha todavía tiene pedidos. Quítalos primero.";
    if (/check constraint/i.test(m)) return "Algún valor no es válido (no se aceptan negativos y el tax va de 0 a 100 %).";
    if (/campo_invalido:(\w+)/.test(m)) return "Revisa el campo " + m.match(/campo_invalido:(\w+)/)[1].replace(/_/g, " ") + ".";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Sin conexión. Revisa tu internet e intenta de nuevo.";
    return "No se pudo completar. Intenta de nuevo.";
  }

  // Misma fórmula que la base de datos (columnas calculadas).
  function calcular(v) {
    var prod = num(v.valor_productos);
    var tax = r2(prod * num(v.tax_porcentaje) / 100);
    var envio = r2(num(v.libras) * num(v.valor_libra));
    var com = r2(num(v.cantidad_productos) * num(v.comision_por_producto));
    var total = r2(prod + tax + envio + com);
    return { tax: tax, envio: envio, comision: com, total: total, saldo: r2(total - num(v.pagado)) };
  }

  function direccionTexto(e) {
    if (!e) return "";
    var linea = [e.calle_principal, e.numero ? "N° " + e.numero : "", e.calle_secundaria ? "y " + e.calle_secundaria : ""]
      .filter(Boolean).join(" ");
    return [
      e.nombre, e.documento ? "Cédula/Pasaporte: " + e.documento : "", "WhatsApp: " + (e.whatsapp || ""),
      linea, e.referencia ? "Referencia: " + e.referencia : "",
      [e.ciudad, e.provincia, e.pais].filter(Boolean).join(", ") + (e.codigo_postal ? " · CP " + e.codigo_postal : ""),
      e.contacto_alt_nombre || e.contacto_alt_telefono ? "Contacto alterno: " + [e.contacto_alt_nombre, e.contacto_alt_telefono].filter(Boolean).join(" · ") : "",
      e.instrucciones ? "Instrucciones: " + e.instrucciones : ""
    ].filter(Boolean).join("\n");
  }

  // ---------- Sesión ----------
  function pantallaLogin(aviso) {
    app.innerHTML =
      '<div class="login"><form id="f-login" novalidate>' +
      '<img class="logo" src="' + LOGO + '" alt="Bel Personal Shopper" width="96" height="96">' +
      '<h1>Bel Personal Shopper</h1>' + CORONA + '<p class="lema">Tu estilo, sin fronteras</p>' +
      '<p class="acceso">Panel de pedidos · acceso privado</p>' +
      (aviso ? '<div class="alert" role="alert">' + esc(aviso) + "</div>" : "") +
      '<div class="field"><label for="l-email">Correo</label><input id="l-email" type="email" autocomplete="username" required></div>' +
      '<div class="field"><label for="l-pass">Contraseña</label><input id="l-pass" type="password" autocomplete="current-password" required></div>' +
      '<button class="btn btn-primary" type="submit">Entrar</button></form></div>';
    document.getElementById("f-login").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var btn = ev.target.querySelector("button");
      var email = document.getElementById("l-email").value.trim();
      var pass = document.getElementById("l-pass").value;
      if (!email || !pass) { pantallaLogin("Escribe tu correo y contraseña."); return; }
      btn.disabled = true; btn.textContent = "Entrando…";
      sb.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
        if (r.error) { pantallaLogin(mensajeError(r.error)); return; }
        verificarAdmin(r.data.user);
      });
    });
  }

  function verificarAdmin(usuario) {
    sb.rpc("es_admin").then(function (r) {
      if (r.error || r.data !== true) {
        sb.auth.signOut();
        pantallaLogin("Esta cuenta no tiene acceso al panel.");
        return;
      }
      st.usuario = usuario;
      pantallaPanel();
      cargar();
      escucharCambios();
    });
  }

  function salir() {
    sb.removeAllChannels();
    st.usuario = null; st.pedidos = []; st.abierto = null;
    document.body.style.overflow = "";
    sb.auth.signOut().then(function () {
      pantallaLogin();
    });
  }

  // ---------- Datos ----------
  var SELECT = "*, clientes(nombre, whatsapp), datos_envio(*), productos_pedido(*)";

  function cargar() {
    st.cargando = true; pintarLista();
    Promise.all([
      sb.from("pedidos").select(SELECT).order("creado_en", { ascending: false }).limit(1000),
      sb.from("fechas_envio").select("*").order("fecha", { ascending: true })
    ]).then(function (rs) {
      var r = rs[0], rf = rs[1];
      st.cargando = false;
      if (r.error) { st.error = mensajeError(r.error); } else { st.error = ""; st.pedidos = r.data || []; }
      if (!rf.error) st.fechas = rf.data || [];
      pintarResumen(); pintarLista(); pintarFechas();
      if (st.abierto) {
        var p = buscarPedido(st.abierto);
        if (p) refrescarPanelSuave(p); else cerrarPanel();
      } else if (st.fechaAbierta) {
        if (buscarFecha(st.fechaAbierta)) refrescarPanelSuave(); else cerrarPanel();
      }
    });
  }

  function buscarPedido(id) {
    for (var i = 0; i < st.pedidos.length; i++) if (st.pedidos[i].id === id) return st.pedidos[i];
    return null;
  }
  function reemplazar(p) {
    for (var i = 0; i < st.pedidos.length; i++) if (st.pedidos[i].id === p.id) { st.pedidos[i] = p; return; }
    st.pedidos.unshift(p);
  }

  var temporizador = null;
  function escucharCambios() {
    sb.removeAllChannels();
    var recargar = function () { clearTimeout(temporizador); temporizador = setTimeout(cargar, 600); };
    sb.channel("pedidos-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, function (cambio) {
        if (cambio && cambio.eventType === "INSERT") sonarAviso();
        recargar();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "datos_envio" }, recargar)
      .subscribe();
  }

  // ---------- Pantalla principal ----------
  function pantallaPanel() {
    var f = st.filtros;
    app.innerHTML =
      '<header class="top"><div class="top-in">' + marca("Panel de pedidos") +
      '<nav class="tabs" aria-label="Secciones">' +
      '<button type="button" id="t-pedidos" data-vista="pedidos">Pedidos</button>' +
      '<button type="button" id="t-fechas" data-vista="fechas">Fechas de envío</button></nav>' +
      '<div class="acciones">' +
      '<button class="btn btn-sm btn-primary" id="b-nuevo" type="button">+ Pedido</button>' +
      '<button class="btn btn-sm aviso-nuevos" id="b-nuevos" type="button" hidden title="Marcar como vistos"></button>' +
      '<button class="btn btn-sm btn-ghost ico" id="b-sonido" type="button" aria-pressed="' + st.sonido + '"></button>' +
      '<button class="btn btn-sm btn-ghost" id="b-excel" type="button" title="Descargar Excel de los pedidos filtrados">Excel</button>' +
      '<button class="btn btn-sm btn-ghost" id="b-enlace" type="button" title="Copiar enlace del formulario">🔗 Enlace</button>' +
      "</div>" +
      '<button class="btn btn-sm btn-ghost" id="b-salir" type="button">Salir</button></div></header>' +
      '<main class="wrap">' +
      '<section id="v-pedidos" class="vista">' +
      '<div id="proximo"></div>' +
      '<section class="stats" id="resumen" aria-label="Resumen"></section>' +
      '<section class="filters' + (st.filtrosAbiertos ? " abierto" : "") + '" id="filtros" aria-label="Filtros">' +
      '<input class="q" id="f-q" type="search" placeholder="Buscar cliente, pedido o teléfono" value="' + esc(f.q) + '" aria-label="Buscar">' +
      '<button class="btn btn-sm btn-ghost b-filtros" id="b-filtros" type="button" aria-expanded="' + st.filtrosAbiertos + '">Filtros</button>' +
      '<select id="f-estado" aria-label="Estado"><option value="">Todos los estados</option>' +
      ESTADOS.map(function (e) { return '<option' + (f.estado === e ? " selected" : "") + ">" + esc(e) + "</option>"; }).join("") +
      "</select>" +
      '<select id="f-saldo" aria-label="Saldo"><option value="">Todos los saldos</option>' +
      '<option value="debe"' + (f.saldo === "debe" ? " selected" : "") + ">Con saldo pendiente</option>" +
      '<option value="pagado"' + (f.saldo === "pagado" ? " selected" : "") + ">Pagados</option></select>" +
      '<select id="f-salida" aria-label="Fecha de envío"></select>' +
      '<input id="f-desde" type="date" value="' + esc(f.desde) + '" aria-label="Creados desde">' +
      '<input id="f-hasta" type="date" value="' + esc(f.hasta) + '" aria-label="Creados hasta">' +
      "</section>" +
      '<div id="lista"></div></section>' +
      '<section id="v-fechas" class="vista">' +
      '<div class="fechas-top"><div><h2>Fechas de envío</h2><p class="hint">Agrupa los pedidos que salen juntos. Normalmente son dos al mes.</p></div>' +
      '<div class="btns"><button class="btn btn-sm btn-primary" id="b-fecha-nueva" type="button">+ Nueva fecha</button>' +
      '<button class="btn btn-sm btn-ghost" id="b-fechas-mes" type="button">Crear las 2 del mes</button></div></div>' +
      '<div id="fechas"></div></section>' +
      "</main>" +
      '<footer class="pie">' + CORONA + '<p class="lema">Tu estilo, sin fronteras</p></footer>' +
      '<div id="detalle"></div>' +
      '<dialog id="d-nuevo"><form method="dialog" id="f-nuevo" novalidate><h3>Nuevo pedido manual</h3>' +
      '<p style="color:var(--muted);font-size:.9rem">Para clientes que escriben por WhatsApp. Luego completas los datos de envío y los valores.</p>' +
      '<div class="field"><label for="n-nombre">Nombre del cliente</label><input id="n-nombre" autocomplete="off" maxlength="120"></div>' +
      '<div class="field"><label for="n-whatsapp">WhatsApp</label><input id="n-whatsapp" type="tel" placeholder="+593 99 123 4567" maxlength="25"></div>' +
      '<p class="msg" id="n-err" style="color:var(--danger);font-size:.88rem" hidden></p>' +
      '<div class="btns"><button class="btn btn-sm btn-ghost" value="cancel" type="submit" formnovalidate>Cancelar</button>' +
      '<button class="btn btn-sm btn-primary" id="n-ok" type="button">Crear pedido</button></div></form></dialog>' +
      '<dialog id="d-fecha"><form method="dialog" novalidate><h3>Nueva fecha de envío</h3>' +
      '<div class="field"><label for="nf-fecha">Día que sale el envío</label><input id="nf-fecha" type="date"></div>' +
      '<p class="msg" id="nf-err" style="color:var(--danger);font-size:.88rem" hidden></p>' +
      '<div class="btns"><button class="btn btn-sm btn-ghost" value="cancel" type="submit" formnovalidate>Cancelar</button>' +
      '<button class="btn btn-sm btn-primary" id="nf-ok" type="button">Crear fecha</button></div></form></dialog>' +
      '<dialog id="d-mes"><form method="dialog" novalidate><h3>Crear las 2 fechas del mes</h3>' +
      '<p class="hint">Puedes cambiar los días antes de crearlas. Si una ya existe, se salta.</p>' +
      '<div class="field"><label for="nm-mes">Mes</label><input id="nm-mes" type="month"></div>' +
      '<div class="row2"><div class="field"><label for="nm-1">Primer envío</label><input id="nm-1" type="date"></div>' +
      '<div class="field"><label for="nm-2">Segundo envío</label><input id="nm-2" type="date"></div></div>' +
      '<p class="msg" id="nm-err" style="color:var(--danger);font-size:.88rem" hidden></p>' +
      '<div class="btns"><button class="btn btn-sm btn-ghost" value="cancel" type="submit" formnovalidate>Cancelar</button>' +
      '<button class="btn btn-sm btn-primary" id="nm-ok" type="button">Crear fechas</button></div></form></dialog>';

    document.getElementById("b-salir").onclick = salir;
    document.getElementById("b-excel").onclick = descargarExcel;
    document.getElementById("b-nuevos").onclick = marcarVistos;
    document.getElementById("b-sonido").onclick = function () {
      st.sonido = !st.sonido; guardarPref("bel_sonido", st.sonido ? "1" : "0"); pintarAvisos();
      if (st.sonido) sonarAviso(true);
    };
    document.getElementById("b-enlace").onclick = function () { copiar(ENLACE); };
    document.getElementById("b-nuevo").onclick = abrirNuevo;
    document.getElementById("n-ok").onclick = crearManual;
    document.getElementById("b-filtros").onclick = function () {
      st.filtrosAbiertos = !st.filtrosAbiertos;
      document.getElementById("filtros").classList.toggle("abierto", st.filtrosAbiertos);
      this.setAttribute("aria-expanded", String(st.filtrosAbiertos));
    };
    document.querySelectorAll(".tabs [data-vista]").forEach(function (b) {
      b.onclick = function () { cambiarVista(b.getAttribute("data-vista")); };
    });
    document.getElementById("b-fecha-nueva").onclick = abrirNuevaFecha;
    document.getElementById("b-fechas-mes").onclick = abrirFechasMes;
    document.getElementById("nf-ok").onclick = crearFecha;
    document.getElementById("nm-ok").onclick = crearFechasMes;
    document.getElementById("nm-mes").onchange = rellenarMes;
    ["q", "estado", "saldo", "salida", "desde", "hasta"].forEach(function (k) {
      var el = document.getElementById("f-" + k);
      el.addEventListener(k === "q" ? "input" : "change", function () { st.filtros[k] = el.value; pintarLista(); pintarFiltroActivo(); });
    });
    cambiarVista(st.vista);
    pintarResumen(); pintarLista(); pintarFechas();
  }

  function cambiarVista(v) {
    st.vista = v; guardarPref("bel_vista", v);
    document.getElementById("v-pedidos").hidden = v !== "pedidos";
    document.getElementById("v-fechas").hidden = v !== "fechas";
    document.querySelectorAll(".tabs [data-vista]").forEach(function (b) {
      b.setAttribute("aria-current", b.getAttribute("data-vista") === v ? "page" : "false");
    });
  }

  function pintarFiltroActivo() {
    var f = st.filtros, n = [f.estado, f.saldo, f.salida, f.desde, f.hasta].filter(Boolean).length;
    var b = document.getElementById("b-filtros");
    if (b) b.textContent = n ? "Filtros (" + n + ")" : "Filtros";
  }

  function opcionesSalida() {
    var el = document.getElementById("f-salida");
    if (!el) return;
    var f = st.filtros.salida;
    el.innerHTML = '<option value="">Todas las salidas</option><option value="sin"' + (f === "sin" ? " selected" : "") + ">Sin fecha de envío</option>" +
      ordenFechas().map(function (x) {
        return '<option value="' + esc(x.id) + '"' + (f === x.id ? " selected" : "") + ">Envío " + esc(fechaCorta(x.fecha)) + " · " + ESTADO_FECHA[x.estado] + "</option>";
      }).join("");
  }

  function pintarResumen() {
    pintarAvisos();
    opcionesSalida(); pintarFiltroActivo();
    var el = document.getElementById("resumen");
    if (!el) return;
    var ahora = new Date(), mes = ahora.getFullYear() + "-" + String(ahora.getMonth() + 1).padStart(2, "0");
    var activos = 0, pendientes = 0, porCobrar = 0, comMes = 0;
    st.pedidos.forEach(function (p) {
      if (p.estado === "CANCELADO") return;
      if (p.estado !== "ENTREGADO") activos++;
      if (p.estado_formulario === "PENDIENTE") pendientes++;
      if (num(p.saldo) > 0) porCobrar += num(p.saldo);
      if (diaLocal(p.creado_en).slice(0, 7) === mes) comMes += num(p.comision);
    });
    el.innerHTML =
      '<div class="stat"><span>Pedidos activos</span><b>' + activos + "</b></div>" +
      '<div class="stat"><span>Datos de envío pendientes</span><b>' + pendientes + "</b></div>" +
      '<div class="stat y"><span>Por cobrar</span><b>' + usd(porCobrar) + "</b></div>" +
      '<div class="stat y"><span>Comisiones del mes</span><b>' + usd(comMes) + "</b></div>";
    pintarProximo();
  }

  // Tarjeta del próximo envío arriba de los pedidos.
  function pintarProximo() {
    var el = document.getElementById("proximo");
    if (!el) return;
    var f = proximaFecha();
    if (!f) {
      el.innerHTML = '<div class="proximo vacio"><i>' + ICONOS.avion + '</i><span>No hay una próxima fecha de envío programada.</span>' +
        '<button class="btn btn-sm btn-ghost" id="b-prox" type="button">Programar</button></div>';
      document.getElementById("b-prox").onclick = function () { cambiarVista("fechas"); abrirNuevaFecha(); };
      return;
    }
    var r = resumenFecha(f);
    el.innerHTML = '<button class="proximo" id="b-prox" type="button"><i>' + ICONOS.avion + "</i>" +
      '<span class="tx"><span class="t">Próximo envío: <b>' + esc(fechaLarga(f.fecha)) + "</b> · " + esc(relativo(f.fecha)) + "</span>" +
      '<span class="m">' + r.activos.length + (r.activos.length === 1 ? " pedido" : " pedidos") + " · " + esc(libras(r.libras)) +
      (r.conSaldo.length ? ' · <span class="alerta">' + r.conSaldo.length + " con saldo</span>" : "") + "</span></span>" +
      '<span class="ver">Ver</span></button>';
    document.getElementById("b-prox").onclick = function () { abrirFecha(f.id); };
  }

  function filtrados() {
    var f = st.filtros, q = norm(f.q), qd = String(f.q || "").replace(/\D/g, "");
    return st.pedidos.filter(function (p) {
      if (f.estado && p.estado !== f.estado) return false;
      if (f.saldo === "debe" && !(num(p.saldo) > 0)) return false;
      if (f.saldo === "pagado" && num(p.saldo) > 0) return false;
      if (f.salida === "sin" && p.fecha_envio_id) return false;
      if (f.salida && f.salida !== "sin" && p.fecha_envio_id !== f.salida) return false;
      var dia = diaLocal(p.creado_en);
      if (f.desde && dia < f.desde) return false;
      if (f.hasta && dia > f.hasta) return false;
      if (q) {
        var c = p.clientes || {}, e = envioDe(p) || {};
        var texto = norm([p.codigo, c.nombre, e.nombre, e.ciudad].join(" "));
        var tel = digitos(c.whatsapp) + " " + digitos(e.whatsapp);
        var porTel = qd.length >= 4 && tel.indexOf(qd.replace(/^0/, "")) !== -1;
        if (texto.indexOf(q) === -1 && !porTel) return false;
      }
      return true;
    });
  }

  function pillEstado(p) {
    var cls = p.estado === "ENTREGADO" ? "p-ok" : p.estado === "CANCELADO" ? "p-gris" :
      (p.estado === "VENTA CONFIRMADA" || p.estado === "PAGO CONFIRMADO") ? "p-gold" :
      p.estado === "DATOS DE ENVÍO PENDIENTES" ? "p-pend" : "p-st";
    return '<span class="pill ' + cls + '">' + esc(p.estado) + "</span>";
  }
  function pillForm(p) {
    return p.estado_formulario === "COMPLETO" ? '<span class="pill p-ok">Completo</span>' : '<span class="pill p-pend">Pendiente</span>';
  }
  function salidaDe(p) {
    var f = p.fecha_envio_id && buscarFecha(p.fecha_envio_id);
    return f ? fechaCorta(f.fecha) : "";
  }

  function pintarLista() {
    var el = document.getElementById("lista");
    if (!el) return;
    if (st.error) { el.innerHTML = '<div class="alert" role="alert">' + esc(st.error) + ' <button class="btn btn-sm btn-ghost" id="b-reint" type="button">Reintentar</button></div>'; document.getElementById("b-reint").onclick = cargar; return; }
    if (st.cargando && !st.pedidos.length) { el.innerHTML = '<p class="empty">Cargando pedidos…</p>'; return; }
    var lista = filtrados();
    if (!lista.length) {
      el.innerHTML = '<p class="empty">' + (st.pedidos.length ? "Ningún pedido coincide con los filtros." : "Todavía no hay pedidos. Cuando alguien llene el formulario aparecerá aquí.") + "</p>";
      return;
    }
    var filas = lista.map(function (p) {
      var c = p.clientes || {}, sal = salidaDe(p);
      return '<tr data-id="' + esc(p.id) + '" tabindex="0"' + (esNuevo(p) ? ' class="nuevo"' : "") + '><td class="cod">' + esc(p.codigo) +
        (esNuevo(p) ? '<span class="tag-nuevo">Nuevo</span>' : "") + "</td><td>" + esc(new Date(p.creado_en).toLocaleDateString("es-EC", { day: "numeric", month: "short" })) +
        '</td><td class="cli">' + esc(c.nombre) + "<small>" + esc(c.whatsapp) + "</small></td><td>" + pillEstado(p) +
        "</td><td>" + (sal ? '<span class="sal">' + esc(sal) + "</span>" : '<span class="nada">—</span>') + "</td><td>" + pillForm(p) +
        '</td><td class="num">' + num(p.cantidad_productos) + '</td><td class="num">' + usd(p.valor_productos) +
        '</td><td class="num">' + usd(p.tax_monto) + '</td><td class="num">' + usd(p.costo_envio) +
        '</td><td class="num">' + usd(p.comision) + '</td><td class="num"><b>' + usd(p.total) +
        '</b></td><td class="num">' + usd(p.pagado) + '</td><td class="num' + (num(p.saldo) > 0 ? " debe" : "") + '">' + usd(p.saldo) + "</td></tr>";
    }).join("");
    var items = lista.map(function (p) {
      var c = p.clientes || {}, sal = salidaDe(p);
      return '<button class="item' + (esNuevo(p) ? " nuevo" : "") + '" type="button" data-id="' + esc(p.id) + '">' +
        '<div class="r"><b class="nom"><span class="cod">' + esc(p.codigo) + "</span> " + esc(c.nombre) +
        (esNuevo(p) ? '<span class="tag-nuevo">Nuevo</span>' : "") + "</b>" +
        '<span class="' + (num(p.saldo) > 0 ? "debe" : "pagado") + '">' + (num(p.saldo) > 0 ? "Debe " + usd(p.saldo) : "Pagado") + "</span></div>" +
        '<div class="r"><span class="chips">' + pillEstado(p) + (sal ? '<span class="sal">✈ ' + esc(sal) + "</span>" : "") +
        (p.estado_formulario === "PENDIENTE" ? '<span class="pill p-pend">Sin datos</span>' : "") + "</span>" +
        "<small>Total " + usd(p.total) + "</small></div></button>";
    }).join("");
    el.innerHTML =
      '<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Creado</th><th>Cliente</th><th>Estado</th><th>Salida</th><th>Form.</th>' +
      '<th class="num">Cant.</th><th class="num">Productos</th><th class="num">Tax</th><th class="num">Envío</th><th class="num">Comisión</th>' +
      '<th class="num">Total</th><th class="num">Pagado</th><th class="num">Debe</th></tr></thead><tbody>' + filas + "</tbody></table></div>" +
      '<div class="list">' + items + "</div>";
    el.querySelectorAll("[data-id]").forEach(function (n) {
      n.addEventListener("click", function () { abrirPanel(n.getAttribute("data-id")); });
      if (n.tagName === "TR") n.addEventListener("keydown", function (ev) { if (ev.key === "Enter") abrirPanel(n.getAttribute("data-id")); });
    });
  }

  // ---------- Pedido manual ----------
  function abrirNuevo() {
    var d = document.getElementById("d-nuevo");
    document.getElementById("n-nombre").value = "";
    document.getElementById("n-whatsapp").value = "";
    document.getElementById("n-err").hidden = true;
    d.showModal();
  }
  function crearManual() {
    var nombre = document.getElementById("n-nombre").value.trim();
    var wa = document.getElementById("n-whatsapp").value.replace(/[\s()-]/g, "");
    var err = document.getElementById("n-err"), btn = document.getElementById("n-ok");
    if (nombre.length < 3) { err.textContent = "Escribe el nombre del cliente."; err.hidden = false; return; }
    if (!/^\+\d{8,15}$/.test(wa)) { err.textContent = "Escribe el WhatsApp con código de país, por ejemplo +593991234567."; err.hidden = false; return; }
    btn.disabled = true;
    silencioHasta = Date.now() + 8000; // el pedido manual lo creas tú: no suena
    sb.rpc("crear_pedido_manual", { p_nombre: nombre, p_whatsapp: wa }).then(function (r) {
      btn.disabled = false;
      if (r.error) { err.textContent = mensajeError(r.error); err.hidden = false; return; }
      document.getElementById("d-nuevo").close();
      var res = r.data || {};
      toast("Pedido " + (res.codigo || "") + " creado");
      cargar();
    });
  }

  // ---------- Detalle ----------
  function abrirPanel(id) {
    st.abierto = id; st.fechaAbierta = null; st.editandoEnvio = false; st.historial = []; st.quitar = null;
    pintarPanel();
    cargarHistorial();
  }
  function cerrarPanel() {
    st.abierto = null; st.fechaAbierta = null; st.confirmar = null;
    document.getElementById("detalle").innerHTML = "";
    document.body.style.overflow = "";
  }
  function cargarHistorial() {
    var id = st.abierto;
    sb.from("historial_cambios").select("campo, valor_anterior, valor_nuevo, creado_en, tabla")
      .eq("pedido_id", id).order("creado_en", { ascending: false }).limit(100).then(function (r) {
        if (st.abierto !== id) return;
        st.historial = r.error ? null : (r.data || []);
        var h = document.getElementById("hist");
        if (h) h.innerHTML = htmlHistorial();
      });
  }
  // Cuando llega un cambio en tiempo real no se borra lo que se está escribiendo.
  function refrescarPanelSuave() {
    var panel = document.getElementById("panel");
    if (!panel) return;
    if (panel.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (st.fechaAbierta) { pintarPanelFecha(); return; }
    pintarPanel(); cargarHistorial();
  }

  function htmlHistorial() {
    if (st.historial === null) return "<small>No se pudo cargar el historial.</small>";
    if (!st.historial.length) return "<small>Sin cambios registrados.</small>";
    return st.historial.map(function (h) {
      if (h.campo === "fecha_envio_id") {
        var nf = function (id) { var f = id && buscarFecha(id); return id ? (f ? fechaCorta(f.fecha) : "fecha eliminada") : "sin fecha"; };
        return "<div>Fecha de envío: " + esc(nf(h.valor_anterior)) + " → " + esc(nf(h.valor_nuevo)) + "<br><small>" + esc(fechaHora(h.creado_en)) + "</small></div>";
      }
      var cambio = h.campo === "creado" ? "Pedido creado" :
        esc(h.campo.replace(/_/g, " ")) + ": " + esc(h.valor_anterior == null ? "—" : h.valor_anterior) + " → " + esc(h.valor_nuevo == null ? "—" : h.valor_nuevo);
      return "<div>" + cambio + "<br><small>" + esc(fechaHora(h.creado_en)) + "</small></div>";
    }).join("");
  }

  function htmlTotales(c) {
    return "<div><span>Tax</span><span>" + usd(c.tax) + "</span></div>" +
      "<div><span>Envío</span><span>" + usd(c.envio) + "</span></div>" +
      "<div><span>Comisión</span><span>" + usd(c.comision) + "</span></div>" +
      '<div class="big"><span>Total</span><span>' + usd(c.total) + "</span></div>" +
      '<div class="big"><span>Debe</span><span>' + usd(c.saldo) + "</span></div>";
  }

  function pintarPanel() {
    var p = buscarPedido(st.abierto);
    if (!p) { cerrarPanel(); return; }
    var c = p.clientes || {}, e = envioDe(p), wa = digitos((e && e.whatsapp) || c.whatsapp);
    var tieneDir = e && e.calle_principal;
    var saludo = "Hola " + ((c.nombre || "").split(" ")[0] || "") + ", para enviar tu pedido necesito tus datos de envío. Puedes llenarlos aquí: " + ENLACE;

    var prods = productosDe(p), conLista = prods.length > 0;
    var valores = VALORES.map(function (v) {
      var fijo = conLista && (v[0] === "valor_productos" || v[0] === "cantidad_productos");
      return '<div class="field"><label for="v-' + v[0] + '">' + esc(v[1]) + '</label><input id="v-' + v[0] +
        '" type="number" inputmode="decimal" min="0"' + (v[0] === "tax_porcentaje" ? ' max="100"' : "") + ' step="' + v[2] +
        '" value="' + esc(p[v[0]]) + '"' + (fijo ? " readonly" : "") + "></div>";
    }).join("");

    var envio;
    if (st.editandoEnvio || !e) {
      var base = e || {};
      envio = '<form id="f-envio" novalidate style="display:flex;flex-direction:column;gap:10px">' +
        ENVIO.map(function (k) {
          var largo = k[0] === "referencia" || k[0] === "instrucciones";
          return '<div class="field"><label for="e-' + k[0] + '">' + esc(k[1]) + "</label>" +
            (largo ? '<textarea id="e-' + k[0] + '" maxlength="300">' + esc(base[k[0]]) + "</textarea>"
              : '<input id="e-' + k[0] + '" maxlength="150" value="' + esc(base[k[0]]) + '">') + "</div>";
        }).join("") +
        '<div class="btns">' + (e ? '<button class="btn btn-sm btn-ghost" id="b-env-cancel" type="button">Cancelar</button>' : "") +
        '<button class="btn btn-sm btn-primary" type="submit">Guardar datos de envío</button></div></form>';
    } else {
      envio = (tieneDir ? '<div class="addr">' + esc(direccionTexto(e)) + "</div>" : '<p class="callout">El cliente todavía no ha llenado sus datos de envío.</p>') +
        '<div class="btns">' + (tieneDir ? '<button class="btn btn-sm btn-ghost" id="b-copiar-dir" type="button">Copiar dirección completa</button>' : "") +
        '<button class="btn btn-sm btn-ghost" id="b-editar-env" type="button">Editar datos</button></div>' +
        (e.enviado_en ? "<small style=\"color:var(--muted)\">Enviado por el cliente el " + esc(fechaHora(e.enviado_en)) + "</small>" : "");
    }

    document.body.style.overflow = "hidden";
    document.getElementById("detalle").innerHTML =
      '<div class="overlay" id="ov"></div><aside class="panel" id="panel" role="dialog" aria-modal="true" aria-label="Pedido ' + esc(p.codigo) + '">' +
      '<div class="panel-head"><img src="' + LOGO + '" alt="" width="34" height="34"><h2>' + esc(p.codigo) + '</h2><button class="btn btn-sm btn-ghost" id="b-cerrar" type="button">Cerrar</button></div>' +
      '<div class="panel-body">' +
      '<section class="sec"><div><b>' + esc(c.nombre) + "</b><br><small style=\"color:var(--muted)\">" + esc(c.whatsapp) + " · creado " + esc(fechaHora(p.creado_en)) +
      " · " + (p.origen === "FORMULARIO" ? "desde el formulario" : "manual") + "</small></div>" +
      '<div class="btns g2">' + (wa ? '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="https://wa.me/' + esc(wa) + '">💬 Abrir chat</a>' +
        '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="https://wa.me/' + esc(wa) + "?text=" + encodeURIComponent(saludo) + '" title="Enviar enlace del formulario por WhatsApp">📝 Pedir datos</a>' +
        '<a class="btn btn-sm btn-wa" id="b-cuenta" target="_blank" rel="noopener" href="https://wa.me/' + esc(wa) + "?text=" + encodeURIComponent(mensajeCuenta(p)) + '" title="Enviar la cuenta por WhatsApp">💵 Enviar cuenta</a>' : "") +
      '<button class="btn btn-sm btn-ghost" id="b-copiar-enlace" type="button">🔗 Copiar enlace</button></div></section>' +

      '<section class="sec"><h3>Estado y salida</h3><div class="row2"><div class="field"><label for="p-estado">Estado del pedido</label><select id="p-estado">' +
      ESTADOS.map(function (s) { return "<option" + (s === p.estado ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") +
      '</select></div><div class="field"><label for="p-fecha">Fecha de envío</label><select id="p-fecha"><option value="">Sin fecha</option>' +
      ordenFechas().filter(function (f) { return f.estado !== "ENTREGADA" || f.id === p.fecha_envio_id; }).map(function (f) {
        return '<option value="' + esc(f.id) + '"' + (f.id === p.fecha_envio_id ? " selected" : "") + ">" + esc(fechaCorta(f.fecha)) + " · " + ESTADO_FECHA[f.estado] + "</option>";
      }).join("") +
      '</select></div></div><div class="field"><label for="p-notas">Notas internas <span class="opt">(solo tú las ves)</span></label><textarea id="p-notas" maxlength="1000">' +
      esc(p.notas) + '</textarea></div><div class="btns"><button class="btn btn-sm btn-primary" id="b-estado" type="button">Guardar estado, salida y notas</button></div>' +
      "<small style=\"color:var(--muted)\">Formulario: " + (p.estado_formulario === "COMPLETO" ? "completo" : "pendiente") + ". Los pagos se confirman a mano; nada cambia solo.</small></section>" +

      htmlProductos(p, prods) +
      '<section class="sec"><h3>Valores</h3>' +
      (conLista ? '<p class="hint">El valor de productos (sin tax) y la cantidad se calculan con la lista de productos.</p>' : "") +
      '<div class="grid3">' + valores + '</div>' +
      '<div class="totals" id="totales">' + htmlTotales(calcular(p)) + "</div>" +
      '<p class="msg" id="v-err" style="color:var(--danger);font-size:.88rem" hidden></p>' +
      '<div class="btns"><button class="btn btn-sm btn-primary" id="b-valores" type="button">Guardar valores</button></div>' +
      '<p class="hint">La cuenta por WhatsApp usa los valores guardados.</p></section>' +

      '<section class="sec"><h3>Datos de envío</h3>' + envio + "</section>" +
      '<section class="sec"><h3>Historial de cambios</h3><div class="hist" id="hist">' + htmlHistorial() + "</div></section>" +
      "</div></aside>";

    document.getElementById("ov").onclick = cerrarPanel;
    document.getElementById("b-cerrar").onclick = cerrarPanel;
    document.getElementById("b-copiar-enlace").onclick = function () { copiar(ENLACE); };
    document.getElementById("b-estado").onclick = function () { guardarEstado(p); };
    document.getElementById("b-valores").onclick = function () { guardarValores(p, conLista); };
    conectarProductos(p);
    VALORES.forEach(function (v) {
      document.getElementById("v-" + v[0]).addEventListener("input", function () {
        document.getElementById("totales").innerHTML = htmlTotales(calcular(leerValores()));
      });
    });
    var bc = document.getElementById("b-copiar-dir");
    if (bc) bc.onclick = function () { copiar(direccionTexto(e)); };
    var be = document.getElementById("b-editar-env");
    if (be) be.onclick = function () { st.editandoEnvio = true; pintarPanel(); };
    var bx = document.getElementById("b-env-cancel");
    if (bx) bx.onclick = function () { st.editandoEnvio = false; pintarPanel(); };
    var fe = document.getElementById("f-envio");
    if (fe) fe.addEventListener("submit", function (ev) { ev.preventDefault(); guardarEnvio(p, e); });
    document.getElementById("panel").addEventListener("keydown", function (ev) { if (ev.key === "Escape") cerrarPanel(); });
  }

  function leerValores() {
    var o = {};
    VALORES.forEach(function (v) { o[v[0]] = document.getElementById("v-" + v[0]).value; });
    return o;
  }

  function guardarCambiosPedido(p, cambios, btn, ok) {
    btn.disabled = true;
    sb.from("pedidos").update(cambios).eq("id", p.id).select(SELECT).single().then(function (r) {
      btn.disabled = false;
      if (r.error) { toast(mensajeError(r.error)); return; }
      reemplazar(r.data); pintarResumen(); pintarLista(); pintarPanel(); cargarHistorial();
      toast(ok);
    });
  }

  function guardarEstado(p) {
    var estado = document.getElementById("p-estado").value;
    var notas = document.getElementById("p-notas").value.trim();
    var fechaId = document.getElementById("p-fecha").value || null;
    guardarCambiosPedido(p, { estado: estado, notas: notas || null, fecha_envio_id: fechaId }, document.getElementById("b-estado"), "Estado guardado");
  }

  function guardarValores(p, conLista) {
    var v = leerValores(), err = document.getElementById("v-err"), cambios = {}, malo = "";
    VALORES.forEach(function (d) {
      if (conLista && (d[0] === "valor_productos" || d[0] === "cantidad_productos")) return;
      var t = String(v[d[0]]).trim(), n = t === "" ? 0 : Number(t);
      if (!isFinite(n) || n < 0) malo = malo || d[1];
      else if (d[0] === "tax_porcentaje" && n > 100) malo = malo || d[1];
      else if (d[0] === "cantidad_productos" && !Number.isInteger(n)) malo = malo || d[1];
      cambios[d[0]] = n;
    });
    if (malo) { err.textContent = "Revisa «" + malo + "»: debe ser un número válido, sin negativos" + (malo.indexOf("Tax") === 0 ? " y hasta 100 %" : "") + "."; err.hidden = false; return; }
    err.hidden = true;
    guardarCambiosPedido(p, cambios, document.getElementById("b-valores"), "Valores guardados");
  }

  function guardarEnvio(p, existente) {
    var datos = {};
    ENVIO.forEach(function (k) {
      var t = document.getElementById("e-" + k[0]).value.trim();
      datos[k[0]] = t === "" ? null : t;
    });
    if (!datos.nombre || !datos.whatsapp) { toast("Nombre y WhatsApp son obligatorios."); return; }
    var btn = document.querySelector("#f-envio button[type=submit]");
    btn.disabled = true;
    var q = existente
      ? sb.from("datos_envio").update(datos).eq("pedido_id", p.id)
      : sb.from("datos_envio").insert(Object.assign({ pedido_id: p.id }, datos));
    q.then(function (r) {
      btn.disabled = false;
      if (r.error) { toast(mensajeError(r.error)); return; }
      st.editandoEnvio = false;
      toast("Datos de envío guardados");
      sb.from("pedidos").select(SELECT).eq("id", p.id).single().then(function (r2) {
        if (!r2.error) reemplazar(r2.data);
        pintarLista(); pintarPanel(); cargarHistorial();
      });
    });
  }

  // ---------- Productos del pedido (precios sin tax) ----------
  function productosDe(p) {
    var l = p.productos_pedido || [];
    return l.slice().sort(function (a, b) { return String(a.creado_en).localeCompare(String(b.creado_en)); });
  }

  function htmlProductos(p, prods) {
    var filas = prods.map(function (x) {
      var nombre = x.enlace
        ? '<a href="' + esc(x.enlace) + '" target="_blank" rel="noopener noreferrer">' + esc(x.descripcion) + "</a>"
        : esc(x.descripcion);
      var quitando = st.quitar === x.id;
      return '<div class="prod" data-prod="' + esc(x.id) + '">' +
        '<div class="desc"><span>' + nombre + "</span></div>" +
        '<label>Descripción<input data-k="descripcion" maxlength="200" value="' + esc(x.descripcion) + '"></label>' +
        '<label>Cant.<input data-k="cantidad" type="number" inputmode="numeric" min="1" max="999" step="1" value="' + esc(x.cantidad) + '"></label>' +
        '<label>Precio c/u sin tax<input data-k="precio_unitario" type="number" inputmode="decimal" min="0" step="0.01" value="' + esc(x.precio_unitario) + '"></label>' +
        '<div class="sub">Subtotal ' + usd(x.subtotal) + "</div>" +
        '<div class="acc"><button class="btn btn-sm btn-primary" data-acc="guardar" type="button">Guardar cambio</button>' +
        '<button class="btn btn-sm btn-ghost" data-acc="quitar" type="button">' + (quitando ? "¿Seguro? Toca otra vez" : "Quitar") + "</button></div></div>";
    }).join("");
    var suma = prods.reduce(function (t, x) { return t + num(x.subtotal); }, 0);
    return '<section class="sec"><h3>Productos</h3>' +
      '<p class="nota-tax"><b>Precios sin tax.</b> El tax (' + num(p.tax_porcentaje) + ' %) se suma aparte en Valores.</p>' +
      (prods.length ? '<div class="prods">' + filas + "</div>" +
        '<div class="totals"><div class="big"><span>Valor productos sin tax</span><span>' + usd(suma) + "</span></div></div>"
        : '<p class="hint">Aún no hay productos. Si los agregas, el valor y la cantidad del pedido se calculan solos.</p>') +
      '<form class="add-prod" id="f-prod" novalidate>' +
      '<div class="field full"><label for="np-desc">Producto</label><input id="np-desc" maxlength="200" placeholder="Ej. Perfume Bombshell 100 ml"></div>' +
      '<div class="field full"><label for="np-enlace">Enlace <span class="opt">(opcional)</span></label><input id="np-enlace" type="url" inputmode="url" maxlength="1000" placeholder="https://…"></div>' +
      '<div class="field"><label for="np-cant">Cantidad</label><input id="np-cant" type="number" inputmode="numeric" min="1" max="999" step="1" value="1"></div>' +
      '<div class="field"><label for="np-precio">Precio c/u sin tax ($)</label><input id="np-precio" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00"></div>' +
      '<p class="msg full" id="np-err" style="color:var(--danger);font-size:.88rem" hidden></p>' +
      '<div class="btns full"><button class="btn btn-sm btn-primary" type="submit">+ Agregar producto</button></div></form></section>';
  }

  function validarProducto(d) {
    if (!d.descripcion) return "Escribe el nombre del producto.";
    if (d.enlace && !/^https?:\/\/\S+$/i.test(d.enlace)) return "El enlace debe empezar con https://";
    if (!Number.isInteger(d.cantidad) || d.cantidad < 1 || d.cantidad > 999) return "La cantidad debe ser un número entero entre 1 y 999.";
    if (!isFinite(d.precio_unitario) || d.precio_unitario < 0) return "El precio no puede ser negativo.";
    return "";
  }

  function recargarPedido(id, ok) {
    sb.from("pedidos").select(SELECT).eq("id", id).single().then(function (r) {
      if (!r.error) reemplazar(r.data);
      pintarResumen(); pintarLista(); pintarPanel(); cargarHistorial();
      if (ok) toast(ok);
    });
  }

  function conectarProductos(p) {
    var f = document.getElementById("f-prod");
    if (f) f.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var d = {
        descripcion: document.getElementById("np-desc").value.trim(),
        enlace: document.getElementById("np-enlace").value.trim() || null,
        cantidad: Number(document.getElementById("np-cant").value || 1),
        precio_unitario: r2(Number(document.getElementById("np-precio").value || 0))
      };
      var err = document.getElementById("np-err"), msg = validarProducto(d);
      if (msg) { err.textContent = msg; err.hidden = false; return; }
      var btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      sb.from("productos_pedido").insert(Object.assign({ pedido_id: p.id }, d)).then(function (r) {
        btn.disabled = false;
        if (r.error) { err.textContent = mensajeError(r.error); err.hidden = false; return; }
        recargarPedido(p.id, "Producto agregado");
      });
    });
    document.querySelectorAll("[data-prod]").forEach(function (fila) {
      var id = fila.getAttribute("data-prod");
      fila.querySelector('[data-acc="guardar"]').onclick = function (ev) {
        var leer = function (k) { return fila.querySelector('[data-k="' + k + '"]').value; };
        var d = { descripcion: leer("descripcion").trim(), cantidad: Number(leer("cantidad")), precio_unitario: r2(Number(leer("precio_unitario"))) };
        var msg = validarProducto(d);
        if (msg) { toast(msg); return; }
        ev.target.disabled = true;
        sb.from("productos_pedido").update(d).eq("id", id).then(function (r) {
          ev.target.disabled = false;
          if (r.error) { toast(mensajeError(r.error)); return; }
          recargarPedido(p.id, "Producto actualizado");
        });
      };
      fila.querySelector('[data-acc="quitar"]').onclick = function () {
        if (st.quitar !== id) { st.quitar = id; pintarPanel(); return; }
        st.quitar = null;
        sb.from("productos_pedido").delete().eq("id", id).then(function (r) {
          if (r.error) { toast(mensajeError(r.error)); return; }
          recargarPedido(p.id, "Producto quitado");
        });
      };
    });
  }

  // ---------- Fechas de envío ----------
  function pintarFechas() {
    var el = document.getElementById("fechas");
    if (!el) return;
    if (!st.fechas.length) {
      el.innerHTML = '<p class="empty">Todavía no hay fechas de envío. Crea la próxima con “+ Nueva fecha” o las dos del mes de una vez.</p>';
      return;
    }
    el.innerHTML = '<div class="fgrid">' + ordenFechas().map(function (f) {
      var r = resumenFecha(f), pasada = f.estado === "ABIERTA" && diasHasta(f.fecha) < 0;
      return '<button class="fcard' + (f.estado !== "ABIERTA" ? " cerrada" : "") + '" type="button" data-fecha="' + esc(f.id) + '">' +
        '<div class="r"><span class="dia"><b>' + esc(fechaCorta(f.fecha)) + "</b><small>" + esc(fechaLarga(f.fecha).split(" ")[0]) + " · " + esc(relativo(f.fecha)) + "</small></span>" + pillFecha(f) + "</div>" +
        '<div class="met"><span><b>' + r.activos.length + "</b> " + (r.activos.length === 1 ? "pedido" : "pedidos") + "</span><span><b>" + esc(libras(r.libras)) + "</b></span>" +
        '<span class="' + (r.saldo > 0 ? "debe" : "") + '">Por cobrar <b>' + usd(r.saldo) + "</b></span></div>" +
        (r.conSaldo.length && f.estado === "ABIERTA" ? '<div class="alerta">⚠ ' + r.conSaldo.length + (r.conSaldo.length === 1 ? " pedido sale" : " pedidos salen") + " con saldo pendiente</div>" : "") +
        (pasada ? '<div class="alerta">Esta fecha ya pasó: márcala como enviada.</div>' : "") +
        "</button>";
    }).join("") + "</div>";
    el.querySelectorAll("[data-fecha]").forEach(function (b) {
      b.onclick = function () { abrirFecha(b.getAttribute("data-fecha")); };
    });
  }

  function abrirNuevaFecha() {
    var d = document.getElementById("d-fecha"), prox = proximaFecha();
    document.getElementById("nf-fecha").value = "";
    document.getElementById("nf-fecha").min = diaLocal(new Date());
    document.getElementById("nf-err").hidden = true;
    if (!prox) document.getElementById("nf-fecha").value = sugerirFecha();
    d.showModal();
  }
  // Siguiente 15 o fin de mes que todavía no existe.
  function sugerirFecha() {
    var hoy = new Date(), existentes = st.fechas.map(function (f) { return f.fecha; });
    for (var m = 0; m < 3; m++) {
      var base = new Date(hoy.getFullYear(), hoy.getMonth() + m, 1);
      var dias = diasDelMes(base.getFullYear(), base.getMonth());
      for (var i = 0; i < dias.length; i++) if (dias[i] >= diaLocal(hoy) && existentes.indexOf(dias[i]) === -1) return dias[i];
    }
    return "";
  }
  function diasDelMes(anio, mes) {
    var ultimo = new Date(anio, mes + 1, 0).getDate(), mm = String(mes + 1).padStart(2, "0");
    return [anio + "-" + mm + "-15", anio + "-" + mm + "-" + String(ultimo).padStart(2, "0")];
  }
  function crearFecha() {
    var v = document.getElementById("nf-fecha").value, err = document.getElementById("nf-err"), btn = document.getElementById("nf-ok");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { err.textContent = "Elige el día del envío."; err.hidden = false; return; }
    btn.disabled = true;
    sb.from("fechas_envio").insert({ fecha: v }).then(function (r) {
      btn.disabled = false;
      if (r.error) { err.textContent = mensajeError(r.error); err.hidden = false; return; }
      document.getElementById("d-fecha").close();
      toast("Fecha " + fechaCorta(v) + " creada");
      cargar();
    });
  }
  function abrirFechasMes() {
    var hoy = new Date(), base = hoy.getDate() > 15 ? new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1) : hoy;
    document.getElementById("nm-mes").value = base.getFullYear() + "-" + String(base.getMonth() + 1).padStart(2, "0");
    document.getElementById("nm-err").hidden = true;
    rellenarMes();
    document.getElementById("d-mes").showModal();
  }
  function rellenarMes() {
    var v = document.getElementById("nm-mes").value;
    if (!/^\d{4}-\d{2}$/.test(v)) return;
    var d = diasDelMes(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1);
    document.getElementById("nm-1").value = d[0];
    document.getElementById("nm-2").value = d[1];
  }
  function crearFechasMes() {
    var err = document.getElementById("nm-err"), btn = document.getElementById("nm-ok");
    var dias = [document.getElementById("nm-1").value, document.getElementById("nm-2").value].filter(function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(x); });
    var existentes = st.fechas.map(function (f) { return f.fecha; });
    var nuevas = dias.filter(function (x, i) { return existentes.indexOf(x) === -1 && dias.indexOf(x) === i; });
    if (!dias.length) { err.textContent = "Elige al menos un día."; err.hidden = false; return; }
    if (!nuevas.length) { err.textContent = "Esas fechas ya existen."; err.hidden = false; return; }
    btn.disabled = true;
    sb.from("fechas_envio").insert(nuevas.map(function (x) { return { fecha: x }; })).then(function (r) {
      btn.disabled = false;
      if (r.error) { err.textContent = mensajeError(r.error); err.hidden = false; return; }
      document.getElementById("d-mes").close();
      toast(nuevas.length === 1 ? "Fecha creada" : nuevas.length + " fechas creadas");
      cargar();
    });
  }

  function abrirFecha(id) {
    st.abierto = null; st.fechaAbierta = id; st.confirmar = null;
    pintarPanelFecha();
  }

  // Mensaje para avisar al cliente que su pedido sale (gratis: abre WhatsApp con el texto listo).
  function mensajeSalida(p, f) {
    var c = p.clientes || {}, nombre = (c.nombre || "").split(" ")[0] || "";
    var dia = fechaLarga(f.fecha).toLowerCase();
    var l = f.estado === "ENTREGADA"
      ? ["Hola " + nombre + " 😊 Tu pedido " + p.codigo + " ya llegó a Ecuador. ¡Gracias por tu compra!"]
      : f.estado === "ENVIADA"
        ? ["Hola " + nombre + " 😊 Tu pedido " + p.codigo + " ya salió de Estados Unidos el " + dia + " rumbo a Ecuador ✈️. Te aviso cuando llegue."]
        : ["Hola " + nombre + " 😊 Tu pedido " + p.codigo + " sale de Estados Unidos el " + dia + " rumbo a Ecuador ✈️."];
    if (num(p.saldo) > 0 && f.estado !== "ENTREGADA") l.push("Recuerda que tienes un saldo pendiente de " + usd(p.saldo) + ".");
    l.push("", "Bel Personal Shopper 💕");
    return l.join("\n");
  }

  function pintarPanelFecha() {
    var f = buscarFecha(st.fechaAbierta);
    if (!f) { cerrarPanel(); return; }
    var r = resumenFecha(f);
    var candidatos = st.pedidos.filter(function (p) {
      return !p.fecha_envio_id && ["ENVIADO", "ENTREGADO", "CANCELADO"].indexOf(p.estado) === -1;
    });
    var conf = function (k, txt, alt) { return st.confirmar === k ? alt : txt; };
    var nAfecta = function (excluir) { return r.pedidos.filter(function (p) { return excluir.indexOf(p.estado) === -1; }).length; };
    var acciones = "";
    if (f.estado === "ABIERTA") {
      var n1 = nAfecta(["ENVIADO", "ENTREGADO", "CANCELADO"]);
      acciones = '<button class="btn btn-sm btn-primary" data-marcar="ENVIADA" type="button">' +
        conf("ENVIADA", "Marcar como enviada", "¿Seguro? " + n1 + (n1 === 1 ? " pedido pasa" : " pedidos pasan") + " a ENVIADO") + "</button>";
    } else if (f.estado === "ENVIADA") {
      var n2 = nAfecta(["ENTREGADO", "CANCELADO"]);
      acciones = '<button class="btn btn-sm btn-primary" data-marcar="ENTREGADA" type="button">' +
        conf("ENTREGADA", "Marcar como entregada", "¿Seguro? " + n2 + (n2 === 1 ? " pedido pasa" : " pedidos pasan") + " a ENTREGADO") + "</button>" +
        '<button class="btn btn-sm btn-ghost" data-marcar="ABIERTA" type="button">Volver a abierta</button>';
    } else {
      acciones = '<button class="btn btn-sm btn-ghost" data-marcar="ENVIADA" type="button">Volver a enviada</button>';
    }

    var filas = r.pedidos.map(function (p) {
      var c = p.clientes || {}, e = envioDe(p), wa = digitos((e && e.whatsapp) || c.whatsapp);
      return '<div class="fp"><button class="lnk" type="button" data-ver="' + esc(p.id) + '"><b>' + esc(p.codigo) + "</b> " + esc(c.nombre) + "</button>" +
        '<div class="r">' + pillEstado(p) + "<small>" + esc(libras(p.libras)) + "</small>" +
        '<span class="' + (num(p.saldo) > 0 ? "debe" : "pagado") + '">' + (num(p.saldo) > 0 ? "Debe " + usd(p.saldo) : "Pagado") + "</span></div>" +
        '<div class="btns">' + (wa ? '<a class="btn btn-sm btn-wa" target="_blank" rel="noopener" data-avisar="' + esc(p.id) + '" href="https://wa.me/' + esc(wa) + "?text=" + encodeURIComponent(mensajeSalida(p, f)) + '">Avisar por WhatsApp</a>' : "") +
        (f.estado === "ABIERTA" ? '<button class="btn btn-sm btn-ghost" type="button" data-sacar="' + esc(p.id) + '">' + conf("sacar-" + p.id, "Quitar", "¿Seguro? Toca otra vez") + "</button>" : "") +
        "</div></div>";
    }).join("");

    var agregar = f.estado !== "ABIERTA" ? "" :
      '<section class="sec"><h3>Agregar pedidos</h3>' + (candidatos.length
        ? '<p class="hint">Pedidos sin fecha que todavía no salen.</p><div class="cands">' + candidatos.map(function (p) {
            var c = p.clientes || {};
            return '<label class="cand"><input type="checkbox" value="' + esc(p.id) + '"><span><b>' + esc(p.codigo) + "</b> " + esc(c.nombre) +
              "<small>" + esc(p.estado) + " · " + esc(libras(p.libras)) + (num(p.saldo) > 0 ? " · debe " + usd(p.saldo) : "") + "</small></span></label>";
          }).join("") + '</div><div class="btns"><button class="btn btn-sm btn-primary" id="b-agregar" type="button">Agregar seleccionados</button></div>'
        : '<p class="hint">No hay pedidos sin fecha pendientes de salir.</p>') + "</section>";

    document.body.style.overflow = "hidden";
    document.getElementById("detalle").innerHTML =
      '<div class="overlay" id="ov"></div><aside class="panel" id="panel" role="dialog" aria-modal="true" aria-label="Envío del ' + esc(fechaLarga(f.fecha)) + '">' +
      '<div class="panel-head"><img src="' + LOGO + '" alt="" width="34" height="34"><h2>Envío ' + esc(fechaCorta(f.fecha)) + "</h2>" + pillFecha(f) +
      '<button class="btn btn-sm btn-ghost" id="b-cerrar" type="button">Cerrar</button></div>' +
      '<div class="panel-body">' +
      '<section class="sec"><p class="hint">' + esc(fechaLarga(f.fecha)) + " · " + esc(relativo(f.fecha)) + "</p>" +
      '<div class="kpis"><div><span>Pedidos</span><b>' + r.activos.length + "</b></div><div><span>Libras</span><b>" + esc(libras(r.libras)) + "</b></div>" +
      "<div><span>Total</span><b>" + usd(r.total) + "</b></div><div><span>Pagado</span><b>" + usd(r.pagado) + '</b></div><div class="y"><span>Por cobrar</span><b>' + usd(r.saldo) + "</b></div></div>" +
      (r.conSaldo.length ? '<p class="callout">⚠ Con saldo pendiente: ' + r.conSaldo.map(function (p) { return esc(p.codigo) + " (" + usd(p.saldo) + ")"; }).join(", ") + "</p>" : "") +
      '<div class="btns">' + acciones + '<button class="btn btn-sm btn-ghost" id="b-excel-fecha" type="button">Excel de esta fecha</button></div></section>' +
      '<section class="sec"><h3>Pedidos en este envío (' + r.pedidos.length + ")</h3>" +
      (filas ? '<div class="fps">' + filas + "</div>" : '<p class="hint">Todavía no hay pedidos en esta fecha.</p>') + "</section>" +
      agregar +
      (r.pedidos.length ? "" : '<section class="sec"><div class="btns"><button class="btn btn-sm btn-ghost peligro" id="b-borrar-fecha" type="button">' +
        conf("borrar", "Eliminar esta fecha", "¿Seguro? Toca otra vez para eliminar") + "</button></div></section>") +
      "</div></aside>";

    document.getElementById("ov").onclick = cerrarPanel;
    document.getElementById("b-cerrar").onclick = cerrarPanel;
    document.getElementById("panel").addEventListener("keydown", function (ev) { if (ev.key === "Escape") cerrarPanel(); });
    document.getElementById("b-excel-fecha").onclick = function () { descargarExcelFecha(f); };
    document.querySelectorAll("[data-ver]").forEach(function (b) { b.onclick = function () { abrirPanel(b.getAttribute("data-ver")); }; });
    document.querySelectorAll("[data-marcar]").forEach(function (b) {
      b.onclick = function () {
        var nuevo = b.getAttribute("data-marcar");
        var masivo = (nuevo === "ENVIADA" && f.estado === "ABIERTA") || nuevo === "ENTREGADA";
        if (masivo && st.confirmar !== nuevo) { st.confirmar = nuevo; pintarPanelFecha(); return; }
        st.confirmar = null; b.disabled = true;
        sb.rpc("marcar_fecha_envio", { p_id: f.id, p_estado: nuevo }).then(function (res) {
          if (res.error) { b.disabled = false; toast(mensajeError(res.error)); return; }
          var n = num(res.data);
          toast("Fecha " + ESTADO_FECHA[nuevo].toLowerCase() + (n ? " · " + n + (n === 1 ? " pedido actualizado" : " pedidos actualizados") : ""));
          cargar();
        });
      };
    });
    document.querySelectorAll("[data-sacar]").forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-sacar");
        if (st.confirmar !== "sacar-" + id) { st.confirmar = "sacar-" + id; pintarPanelFecha(); return; }
        st.confirmar = null; b.disabled = true;
        sb.from("pedidos").update({ fecha_envio_id: null }).eq("id", id).then(function (res) {
          if (res.error) { b.disabled = false; toast(mensajeError(res.error)); return; }
          toast("Pedido quitado de esta fecha"); cargar();
        });
      };
    });
    var ba = document.getElementById("b-agregar");
    if (ba) ba.onclick = function () {
      var ids = Array.prototype.map.call(document.querySelectorAll(".cands input:checked"), function (x) { return x.value; });
      if (!ids.length) { toast("Marca al menos un pedido."); return; }
      ba.disabled = true;
      Promise.all(ids.map(function (id) { return sb.from("pedidos").update({ fecha_envio_id: f.id }).eq("id", id); })).then(function (rs) {
        ba.disabled = false;
        var malos = rs.filter(function (x) { return x.error; });
        toast(malos.length ? mensajeError(malos[0].error) : ids.length + (ids.length === 1 ? " pedido agregado" : " pedidos agregados"));
        cargar();
      });
    };
    var bb = document.getElementById("b-borrar-fecha");
    if (bb) bb.onclick = function () {
      if (st.confirmar !== "borrar") { st.confirmar = "borrar"; pintarPanelFecha(); return; }
      st.confirmar = null; bb.disabled = true;
      sb.from("fechas_envio").delete().eq("id", f.id).then(function (res) {
        if (res.error) { bb.disabled = false; toast(mensajeError(res.error)); return; }
        cerrarPanel(); toast("Fecha eliminada"); cargar();
      });
    };
  }

  // ---------- Cuenta por WhatsApp (gratis: abre WhatsApp con el mensaje listo) ----------
  function mensajeCuenta(p) {
    var c = p.clientes || {}, prods = productosDe(p), k = calcular(p);
    var lineas = ["Hola " + ((c.nombre || "").split(" ")[0] || "") + " 😊 Este es el detalle de tu pedido " + p.codigo + ":", ""];
    prods.forEach(function (x) { lineas.push("• " + x.descripcion + " (x" + x.cantidad + "): " + usd(x.subtotal)); });
    if (prods.length) lineas.push("");
    lineas.push("Productos (sin tax): " + usd(p.valor_productos));
    lineas.push("Tax (" + num(p.tax_porcentaje) + " %): " + usd(k.tax));
    lineas.push("Envío (" + num(p.libras) + " lb × " + usd(p.valor_libra) + "): " + usd(k.envio));
    lineas.push("Comisión (" + num(p.cantidad_productos) + " × " + usd(p.comision_por_producto) + "): " + usd(k.comision));
    lineas.push("*Total: " + usd(k.total) + "*");
    lineas.push("Pagado: " + usd(p.pagado));
    lineas.push(k.saldo > 0 ? "*Saldo pendiente: " + usd(k.saldo) + "*" : "Saldo pendiente: $0,00 ✅");
    lineas.push("", "¡Gracias por comprar con Bel Personal Shopper! 💕");
    return lineas.join("\n");
  }

  // ---------- Aviso de pedidos nuevos ----------
  function esNuevo(p) { return p.origen === "FORMULARIO" && new Date(p.creado_en) > new Date(st.vistoHasta); }
  function pintarAvisos() {
    var n = st.pedidos.filter(esNuevo).length;
    var b = document.getElementById("b-nuevos");
    if (b) { b.hidden = n === 0; b.textContent = "🔔 " + n + (n === 1 ? " nuevo" : " nuevos"); }
    var s = document.getElementById("b-sonido");
    if (s) {
      var txt = st.sonido ? "Sonido activado" : "Sonido apagado";
      s.innerHTML = (st.sonido ? "🔊" : "🔇") + '<span class="sr-only">' + txt + "</span>";
      s.title = txt + " para pedidos nuevos"; s.setAttribute("aria-pressed", String(st.sonido));
    }
    document.title = (n ? "(" + n + ") " : "") + "Panel de pedidos · Bel Personal Shopper";
  }
  function marcarVistos() {
    var max = st.pedidos.reduce(function (m, p) { return new Date(p.creado_en) > new Date(m) ? p.creado_en : m; }, st.vistoHasta);
    st.vistoHasta = max; guardarPref("bel_visto_hasta", max);
    pintarAvisos(); pintarLista();
  }
  var audio = null;
  function prepararAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
    } catch (e) { audio = null; }
  }
  // El navegador solo deja sonar después de un toque en la página.
  document.addEventListener("pointerdown", prepararAudio, { passive: true });
  var silencioHasta = 0;
  function sonarAviso(forzar) {
    if (!forzar && (!st.sonido || Date.now() < silencioHasta)) return;
    prepararAudio();
    if (!audio) return;
    var t = audio.currentTime;
    [880, 1318.5].forEach(function (f, i) {
      var o = audio.createOscillator(), g = audio.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.35);
      o.connect(g); g.connect(audio.destination);
      o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.4);
    });
  }

  // ---------- Excel con colores ----------
  var EXCELJS = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
  function cargarExcelJS() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    return new Promise(function (ok, mal) {
      var sc = document.createElement("script");
      sc.src = EXCELJS; sc.onload = function () { ok(window.ExcelJS); };
      sc.onerror = function () { mal(new Error("No se pudo cargar el generador de Excel.")); };
      document.head.appendChild(sc);
    });
  }
  // Excel guarda las fechas sin zona horaria: se pasa la hora local.
  function fechaExcel(v) { var d = new Date(v); return new Date(d.getTime() - d.getTimezoneOffset() * 60000); }

  function bajarExcel(btn, archivo, armar, ok) {
    var texto = btn.textContent;
    btn.disabled = true; btn.textContent = "Preparando…";
    cargarExcelJS().then(function (ExcelJS) {
      return armar(ExcelJS).xlsx.writeBuffer();
    }).then(function (buf) {
      var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = archivo;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      toast(ok);
    }).catch(function (e) {
      toast((e && e.message) || "No se pudo crear el Excel.");
    }).then(function () { btn.disabled = false; btn.textContent = texto; });
  }

  function descargarExcel() {
    var lista = filtrados();
    if (!lista.length) { toast("No hay pedidos para descargar con estos filtros."); return; }
    bajarExcel(document.getElementById("b-excel"), "pedidos-bel-" + diaLocal(new Date()) + ".xlsx",
      function (ExcelJS) { return armarExcel(ExcelJS, lista); }, "Excel descargado (" + lista.length + " pedidos)");
  }

  function descargarExcelFecha(f) {
    var lista = pedidosDeFecha(f);
    if (!lista.length) { toast("Esta fecha todavía no tiene pedidos."); return; }
    bajarExcel(document.getElementById("b-excel-fecha"), "envio-bel-" + f.fecha + ".xlsx",
      function (ExcelJS) { return armarExcelFecha(ExcelJS, f, lista); }, "Excel del envío descargado (" + lista.length + " pedidos)");
  }

  // Lista del envío: a quién va cada paquete, libras y cobros.
  function armarExcelFecha(ExcelJS, f, lista) {
    var wb = new ExcelJS.Workbook();
    wb.creator = "Bel Personal Shopper"; wb.created = new Date();
    var cols = [
      { k: "codigo", t: "Pedido", w: 11 }, { k: "cliente", t: "Cliente", w: 24 }, { k: "recibe", t: "Recibe", w: 24 },
      { k: "doc", t: "Cédula / pasaporte", w: 16 }, { k: "whatsapp", t: "WhatsApp", w: 17 }, { k: "provincia", t: "Provincia", w: 14 },
      { k: "ciudad", t: "Ciudad", w: 14 }, { k: "dir", t: "Dirección", w: 38 }, { k: "ref", t: "Referencia", w: 28 },
      { k: "cant", t: "Productos", w: 10, m: "0", sum: true }, { k: "libras", t: "Libras", w: 9, m: "0.00", sum: true },
      { k: "total", t: "Total", w: 12, m: MONEDA, sum: true }, { k: "pagado", t: "Pagado", w: 12, m: MONEDA, sum: true },
      { k: "debe", t: "Debe", w: 12, m: MONEDA, sum: true }, { k: "estado", t: "Estado", w: 22 }
    ];
    var ws = hojaConTitulo(wb, "Envío " + f.fecha, "Bel Personal Shopper · Envío del " + fechaLarga(f.fecha).toLowerCase(), cols);
    lista.forEach(function (p) {
      var c = p.clientes || {}, e = envioDe(p) || {};
      var dir = [e.calle_principal, e.numero ? "N° " + e.numero : "", e.calle_secundaria ? "y " + e.calle_secundaria : ""].filter(Boolean).join(" ");
      ws.addRow({ codigo: p.codigo, cliente: c.nombre, recibe: e.nombre || "", doc: e.documento || "", whatsapp: e.whatsapp || c.whatsapp || "",
        provincia: e.provincia || "", ciudad: e.ciudad || "", dir: dir, ref: e.referencia || "", cant: num(p.cantidad_productos),
        libras: num(p.libras), total: num(p.total), pagado: num(p.pagado), debe: num(p.saldo), estado: p.estado });
    });
    var fin = 3 + lista.length;
    estiloFilas(ws, cols, 4, fin);
    for (var r = 4; r <= fin; r++) {
      var row = ws.getRow(r);
      row.getCell(1).font = { bold: true, color: { argb: X.rosaOscuro } };
      row.getCell(8).alignment = { vertical: "middle", wrapText: true };
      row.getCell(9).alignment = { vertical: "middle", wrapText: true };
      if (num(row.getCell(14).value) > 0) { row.getCell(14).font = { bold: true, color: { argb: X.rosaOscuro } }; row.getCell(14).fill = relleno(X.amarillo); }
    }
    filaTotales(ws, cols, 4, fin, "TOTAL");
    return wb;
  }

  var X = { rosa: "FFD0457F", rosaOscuro: "FFB0306A", rosaClaro: "FFFADCE8", rosaFondo: "FFFFF5F9", amarillo: "FFFFF6D6",
    amarilloFuerte: "FFFBE39A", tinta: "FF2A1B22", gris: "FF76606B", verde: "FFE3F5EA", verdeTinta: "FF1C6B43", blanco: "FFFFFFFF", linea: "FFF0DCE5" };
  var MONEDA = '"$"#,##0.00';
  function relleno(c) { return { type: "pattern", pattern: "solid", fgColor: { argb: c } }; }
  var BORDE = { top: { style: "thin", color: { argb: X.linea } }, bottom: { style: "thin", color: { argb: X.linea } },
    left: { style: "thin", color: { argb: X.linea } }, right: { style: "thin", color: { argb: X.linea } } };

  function hojaConTitulo(wb, nombre, titulo, columnas) {
    var ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 3, showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = columnas.map(function (c) { return { key: c.k, width: c.w }; });
    var ultima = ws.getColumn(columnas.length).letter;
    ws.mergeCells("A1:" + ultima + "1");
    var t = ws.getCell("A1");
    t.value = titulo; t.font = { name: "Calibri", size: 16, bold: true, color: { argb: X.blanco } };
    t.fill = relleno(X.rosa); t.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(1).height = 30;
    ws.mergeCells("A2:" + ultima + "2");
    var s = ws.getCell("A2");
    s.value = "Generado el " + new Date().toLocaleString("es-EC") + " · Montos en USD · Precios de productos sin tax";
    s.font = { italic: true, size: 10, color: { argb: X.gris } }; s.fill = relleno(X.rosaFondo); s.alignment = { indent: 1 };
    var h = ws.getRow(3);
    columnas.forEach(function (c, i) {
      var cell = h.getCell(i + 1);
      cell.value = c.t; cell.font = { bold: true, color: { argb: X.rosaOscuro } }; cell.fill = relleno(X.rosaClaro);
      cell.alignment = { vertical: "middle", horizontal: c.m ? "right" : "left", wrapText: true }; cell.border = BORDE;
    });
    h.height = 32;
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columnas.length } };
    return ws;
  }

  function estiloFilas(ws, columnas, desde, hasta) {
    for (var r = desde; r <= hasta; r++) {
      var fila = ws.getRow(r);
      columnas.forEach(function (c, i) {
        var cell = fila.getCell(i + 1);
        cell.border = BORDE;
        if ((r - desde) % 2 === 1) cell.fill = relleno(X.rosaFondo);
        if (c.m) cell.numFmt = c.m;
        cell.alignment = { vertical: "middle", horizontal: c.m ? "right" : "left" };
      });
    }
  }

  function filaTotales(ws, columnas, desde, hasta, etiqueta) {
    var fila = ws.getRow(hasta + 1);
    columnas.forEach(function (c, i) {
      var cell = fila.getCell(i + 1), col = ws.getColumn(i + 1).letter;
      if (i === 0) cell.value = etiqueta;
      else if (c.sum) cell.value = { formula: "SUBTOTAL(9," + col + desde + ":" + col + hasta + ")" };
      cell.font = { bold: true, color: { argb: X.tinta } }; cell.fill = relleno(X.amarilloFuerte); cell.border = BORDE;
      if (c.m) { cell.numFmt = c.m; cell.alignment = { horizontal: "right" }; }
    });
    fila.height = 22;
  }

  function armarExcel(ExcelJS, lista) {
    var wb = new ExcelJS.Workbook();
    wb.creator = "Bel Personal Shopper"; wb.created = new Date();

    // Hoja 1: pedidos
    var cols = [
      { k: "codigo", t: "Pedido", w: 11 }, { k: "fecha", t: "Fecha", w: 17, m: "dd/mm/yyyy hh:mm" },
      { k: "cliente", t: "Cliente", w: 26 }, { k: "whatsapp", t: "WhatsApp", w: 18 }, { k: "ciudad", t: "Ciudad", w: 15 },
      { k: "estado", t: "Estado", w: 25 }, { k: "formulario", t: "Formulario", w: 12 },
      { k: "cant", t: "Cant. productos", w: 10, m: "0", sum: true }, { k: "prod", t: "Productos sin tax", w: 14, m: MONEDA, sum: true },
      { k: "taxp", t: "Tax %", w: 8, m: '0.0##"%"' }, { k: "tax", t: "Tax $", w: 11, m: MONEDA, sum: true },
      { k: "libras", t: "Libras", w: 9, m: "0.00", sum: true }, { k: "vlibra", t: "Valor libra", w: 11, m: MONEDA },
      { k: "envio", t: "Envío", w: 11, m: MONEDA, sum: true }, { k: "com", t: "Comisión", w: 11, m: MONEDA, sum: true },
      { k: "total", t: "Total", w: 12, m: MONEDA, sum: true }, { k: "pagado", t: "Pagado", w: 12, m: MONEDA, sum: true },
      { k: "debe", t: "Debe", w: 12, m: MONEDA, sum: true }, { k: "salida", t: "Fecha de envío", w: 14 }
    ];
    var ws = hojaConTitulo(wb, "Pedidos", "Bel Personal Shopper · Pedidos", cols);
    lista.forEach(function (p) {
      var c = p.clientes || {}, e = envioDe(p) || {};
      ws.addRow({ codigo: p.codigo, fecha: fechaExcel(p.creado_en), cliente: c.nombre, whatsapp: c.whatsapp, ciudad: e.ciudad || "",
        estado: p.estado, formulario: p.estado_formulario === "COMPLETO" ? "Completo" : "Pendiente",
        cant: num(p.cantidad_productos), prod: num(p.valor_productos), taxp: num(p.tax_porcentaje), tax: num(p.tax_monto),
        libras: num(p.libras), vlibra: num(p.valor_libra), envio: num(p.costo_envio), com: num(p.comision),
        total: num(p.total), pagado: num(p.pagado), debe: num(p.saldo), salida: salidaDe(p) });
    });
    var fin = 3 + lista.length;
    estiloFilas(ws, cols, 4, fin);
    for (var r = 4; r <= fin; r++) {
      var row = ws.getRow(r), est = row.getCell(6), debe = row.getCell(18), tot = row.getCell(16);
      est.fill = relleno(est.value === "ENTREGADO" ? X.verde : est.value === "CANCELADO" ? X.linea : X.amarillo);
      est.font = { bold: true, size: 10, color: { argb: est.value === "ENTREGADO" ? X.verdeTinta : X.tinta } };
      tot.font = { bold: true };
      if (num(debe.value) > 0) debe.font = { bold: true, color: { argb: X.rosaOscuro } };
      row.getCell(1).font = { bold: true, color: { argb: X.rosaOscuro } };
    }
    filaTotales(ws, cols, 4, fin, "TOTAL");

    // Hoja 2: productos
    var pcols = [
      { k: "codigo", t: "Pedido", w: 11 }, { k: "cliente", t: "Cliente", w: 26 }, { k: "producto", t: "Producto", w: 40 },
      { k: "enlace", t: "Enlace", w: 16 }, { k: "cant", t: "Cantidad", w: 10, m: "0", sum: true },
      { k: "precio", t: "Precio c/u sin tax", w: 15, m: MONEDA }, { k: "sub", t: "Subtotal sin tax", w: 15, m: MONEDA, sum: true }
    ];
    var wp = hojaConTitulo(wb, "Productos", "Bel Personal Shopper · Productos por pedido", pcols);
    var n = 0;
    lista.forEach(function (p) {
      productosDe(p).forEach(function (x) {
        var fila = wp.addRow({ codigo: p.codigo, cliente: (p.clientes || {}).nombre, producto: x.descripcion, enlace: "",
          cant: num(x.cantidad), precio: num(x.precio_unitario), sub: num(x.subtotal) });
        if (x.enlace) fila.getCell(4).value = { text: "Ver producto", hyperlink: x.enlace };
        n++;
      });
    });
    if (n) {
      estiloFilas(wp, pcols, 4, 3 + n);
      for (var q = 4; q <= 3 + n; q++) {
        var cl = wp.getRow(q).getCell(4);
        if (cl.value && cl.value.hyperlink) cl.font = { underline: true, color: { argb: X.rosaOscuro } };
        wp.getRow(q).getCell(1).font = { bold: true, color: { argb: X.rosaOscuro } };
      }
      filaTotales(wp, pcols, 4, 3 + n, "TOTAL");
    } else {
      wp.getCell("A4").value = "Estos pedidos no tienen productos anotados.";
      wp.getCell("A4").font = { italic: true, color: { argb: X.gris } };
    }

    // Hoja 3: resumen
    var wr = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
    wr.columns = [{ width: 32 }, { width: 18 }];
    wr.mergeCells("A1:B1");
    wr.getCell("A1").value = "Resumen";
    wr.getCell("A1").font = { size: 16, bold: true, color: { argb: X.blanco } };
    wr.getCell("A1").fill = relleno(X.rosa); wr.getCell("A1").alignment = { indent: 1, vertical: "middle" };
    wr.getRow(1).height = 30;
    var activos = lista.filter(function (p) { return p.estado !== "CANCELADO"; });
    var suma = function (k) { return activos.reduce(function (t, p) { return t + num(p[k]); }, 0); };
    var filtros = [st.filtros.estado && "estado " + st.filtros.estado, st.filtros.saldo && (st.filtros.saldo === "debe" ? "con saldo" : "pagados"),
      st.filtros.desde && "desde " + st.filtros.desde, st.filtros.hasta && "hasta " + st.filtros.hasta, st.filtros.q && "búsqueda “" + st.filtros.q + "”"].filter(Boolean);
    [
      ["Pedidos en este Excel", lista.length, "0"],
      ["Pedidos cancelados (no suman)", lista.length - activos.length, "0"],
      ["Productos sin tax", suma("valor_productos"), MONEDA],
      ["Tax", suma("tax_monto"), MONEDA],
      ["Envío", suma("costo_envio"), MONEDA],
      ["Comisiones", suma("comision"), MONEDA],
      ["Total facturado", suma("total"), MONEDA],
      ["Pagado", suma("pagado"), MONEDA],
      ["Por cobrar", activos.reduce(function (t, p) { return t + Math.max(num(p.saldo), 0); }, 0), MONEDA]
    ].forEach(function (d, i) {
      var row = wr.getRow(3 + i), a = row.getCell(1), b = row.getCell(2);
      a.value = d[0]; b.value = d[1]; b.numFmt = d[2];
      a.border = BORDE; b.border = BORDE; b.alignment = { horizontal: "right" };
      var fuerte = d[0] === "Por cobrar" || d[0] === "Comisiones" || d[0] === "Total facturado";
      a.fill = relleno(fuerte ? X.amarillo : (i % 2 ? X.rosaFondo : X.blanco)); b.fill = a.fill;
      if (fuerte) { a.font = { bold: true }; b.font = { bold: true, color: { argb: X.rosaOscuro } }; }
      row.height = 20;
    });
    wr.getCell("A13").value = "Filtros: " + (filtros.length ? filtros.join(", ") : "ninguno (todos los pedidos)");
    wr.getCell("A13").font = { italic: true, size: 10, color: { argb: X.gris } };
    return wb;
  }

  // ---------- Inicio ----------
  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (s) verificarAdmin(s.user); else pantallaLogin();
  });
  sb.auth.onAuthStateChange(function (evento) {
    if (evento === "SIGNED_OUT" && st.usuario) { st.usuario = null; pantallaLogin("Tu sesión terminó. Vuelve a entrar."); }
  });
})();
