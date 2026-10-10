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
    corona: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"/></svg>'
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
    filtros: { q: "", estado: "", desde: "", hasta: "", saldo: "" },
    abierto: null, historial: [], editandoEnvio: false,
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
    sb.from("pedidos").select(SELECT).order("creado_en", { ascending: false }).limit(1000).then(function (r) {
      st.cargando = false;
      if (r.error) { st.error = mensajeError(r.error); } else { st.error = ""; st.pedidos = r.data || []; }
      pintarResumen(); pintarLista();
      if (st.abierto) {
        var p = buscarPedido(st.abierto);
        if (p) refrescarPanelSuave(p); else cerrarPanel();
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
      '<button class="btn btn-sm btn-ghost" id="b-salir" type="button">Salir</button>' +
      '<div class="acciones">' +
      '<button class="btn btn-sm btn-primary" id="b-nuevo" type="button">+ Pedido manual</button>' +
      '<button class="btn btn-sm aviso-nuevos" id="b-nuevos" type="button" hidden></button>' +
      '<button class="btn btn-sm btn-ghost" id="b-sonido" type="button" aria-pressed="' + st.sonido + '"></button>' +
      '<button class="btn btn-sm btn-ghost" id="b-excel" type="button">Descargar Excel</button>' +
      '<button class="btn btn-sm btn-ghost" id="b-enlace" type="button">Copiar enlace del formulario</button>' +
      "</div></div></header>" +
      '<main class="wrap">' +
      '<div class="titulo"><h2>Pedidos</h2><p id="t-cuenta"></p></div>' +
      '<section class="cards" id="resumen" aria-label="Resumen"></section>' +
      '<section class="filters" aria-label="Filtros">' +
      '<input class="q" id="f-q" type="search" placeholder="Buscar por cliente, pedido (BP-0001) o teléfono" value="' + esc(f.q) + '" aria-label="Buscar">' +
      '<select id="f-estado" aria-label="Estado"><option value="">Todos los estados</option>' +
      ESTADOS.map(function (e) { return '<option' + (f.estado === e ? " selected" : "") + ">" + esc(e) + "</option>"; }).join("") +
      "</select>" +
      '<select id="f-saldo" aria-label="Saldo"><option value="">Todos los saldos</option>' +
      '<option value="debe"' + (f.saldo === "debe" ? " selected" : "") + ">Con saldo pendiente</option>" +
      '<option value="pagado"' + (f.saldo === "pagado" ? " selected" : "") + ">Pagados</option></select>" +
      '<input id="f-desde" type="date" value="' + esc(f.desde) + '" aria-label="Desde">' +
      '<input id="f-hasta" type="date" value="' + esc(f.hasta) + '" aria-label="Hasta">' +
      "</section>" +
      '<div id="lista"></div></main>' +
      '<footer class="pie">' + CORONA + '<p class="lema">Tu estilo, sin fronteras</p></footer>' +
      '<div id="detalle"></div>' +
      '<dialog id="d-nuevo"><form method="dialog" id="f-nuevo" novalidate><h3>Nuevo pedido manual</h3>' +
      '<p style="color:var(--muted);font-size:.9rem">Para clientes que escriben por WhatsApp. Luego completas los datos de envío y los valores.</p>' +
      '<div class="field"><label for="n-nombre">Nombre del cliente</label><input id="n-nombre" autocomplete="off" maxlength="120"></div>' +
      '<div class="field"><label for="n-whatsapp">WhatsApp</label><input id="n-whatsapp" type="tel" placeholder="+593 99 123 4567" maxlength="25"></div>' +
      '<p class="msg" id="n-err" style="color:var(--danger);font-size:.88rem" hidden></p>' +
      '<div class="btns"><button class="btn btn-sm btn-ghost" value="cancel" type="submit" formnovalidate>Cancelar</button>' +
      '<button class="btn btn-sm btn-primary" id="n-ok" type="button">Crear pedido</button></div></form></dialog>';

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
    ["q", "estado", "saldo", "desde", "hasta"].forEach(function (k) {
      var el = document.getElementById("f-" + k);
      el.addEventListener(k === "q" ? "input" : "change", function () { st.filtros[k] = el.value; pintarLista(); });
    });
    pintarResumen(); pintarLista();
  }

  function pintarResumen() {
    pintarAvisos();
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
      '<div class="card"><i>' + ICONOS.caja + '</i><span>Pedidos activos</span><b>' + activos + "</b></div>" +
      '<div class="card"><i>' + ICONOS.casa + '</i><span>Datos de envío pendientes</span><b>' + pendientes + "</b></div>" +
      '<div class="card y"><i>' + ICONOS.cobro + '</i><span>Por cobrar</span><b>' + usd(porCobrar) + "</b></div>" +
      '<div class="card y"><i>' + ICONOS.corona + '</i><span>Comisiones del mes</span><b>' + usd(comMes) + "</b></div>";
    var tc = document.getElementById("t-cuenta");
    if (tc) tc.textContent = st.pedidos.length + (st.pedidos.length === 1 ? " pedido" : " pedidos") + " en total";
  }

  function filtrados() {
    var f = st.filtros, q = norm(f.q), qd = String(f.q || "").replace(/\D/g, "");
    return st.pedidos.filter(function (p) {
      if (f.estado && p.estado !== f.estado) return false;
      if (f.saldo === "debe" && !(num(p.saldo) > 0)) return false;
      if (f.saldo === "pagado" && num(p.saldo) > 0) return false;
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
      var c = p.clientes || {};
      return '<tr data-id="' + esc(p.id) + '" tabindex="0"' + (esNuevo(p) ? ' class="nuevo"' : "") + '><td class="cod">' + esc(p.codigo) +
        (esNuevo(p) ? '<span class="tag-nuevo">Nuevo</span>' : "") + "</td><td>" + esc(fecha(p.creado_en)) +
        "</td><td>" + esc(c.nombre) + "</td><td>" + esc(c.whatsapp) + "</td><td>" + pillEstado(p) + "</td><td>" + pillForm(p) +
        '</td><td class="num">' + num(p.cantidad_productos) + '</td><td class="num">' + usd(p.valor_productos) +
        '</td><td class="num">' + usd(p.tax_monto) + '</td><td class="num">' + usd(p.costo_envio) +
        '</td><td class="num">' + usd(p.comision) + '</td><td class="num"><b>' + usd(p.total) +
        '</b></td><td class="num">' + usd(p.pagado) + '</td><td class="num' + (num(p.saldo) > 0 ? " debe" : "") + '">' + usd(p.saldo) + "</td></tr>";
    }).join("");
    var items = lista.map(function (p) {
      var c = p.clientes || {};
      return '<button class="item' + (esNuevo(p) ? " nuevo" : "") + '" type="button" data-id="' + esc(p.id) + '"><div class="r"><b>' + esc(p.codigo) + " · " + esc(c.nombre) +
        (esNuevo(p) ? '<span class="tag-nuevo">Nuevo</span>' : "") + "</b>" + pillForm(p) + '</div><div class="r">' + pillEstado(p) + "<small>" + esc(fecha(p.creado_en)) + "</small></div>" +
        '<div class="r"><span>Total ' + usd(p.total) + '</span><span class="' + (num(p.saldo) > 0 ? "debe" : "") + '">Debe ' + usd(p.saldo) + "</span></div></button>";
    }).join("");
    el.innerHTML =
      '<div class="table-wrap"><table><thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>WhatsApp</th><th>Estado</th><th>Formulario</th>' +
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
    st.abierto = id; st.editandoEnvio = false; st.historial = []; st.quitar = null;
    pintarPanel();
    cargarHistorial();
  }
  function cerrarPanel() {
    st.abierto = null;
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
  function refrescarPanelSuave(p) {
    var panel = document.getElementById("panel");
    if (!panel) return;
    if (panel.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    pintarPanel(); cargarHistorial();
  }

  function htmlHistorial() {
    if (st.historial === null) return "<small>No se pudo cargar el historial.</small>";
    if (!st.historial.length) return "<small>Sin cambios registrados.</small>";
    return st.historial.map(function (h) {
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
      '<div class="btns">' + (wa ? '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="https://wa.me/' + esc(wa) + '">Abrir WhatsApp</a>' +
        '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="https://wa.me/' + esc(wa) + "?text=" + encodeURIComponent(saludo) + '">Enviar enlace del formulario</a>' +
        '<a class="btn btn-sm btn-wa" id="b-cuenta" target="_blank" rel="noopener" href="https://wa.me/' + esc(wa) + "?text=" + encodeURIComponent(mensajeCuenta(p)) + '">Enviar cuenta por WhatsApp</a>' : "") +
      '<button class="btn btn-sm btn-ghost" id="b-copiar-enlace" type="button">Copiar enlace</button></div></section>' +

      '<section class="sec"><h3>Estado</h3><div class="field"><label for="p-estado">Estado del pedido</label><select id="p-estado">' +
      ESTADOS.map(function (s) { return "<option" + (s === p.estado ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") +
      '</select></div><div class="field"><label for="p-notas">Notas internas <span class="opt">(solo tú las ves)</span></label><textarea id="p-notas" maxlength="1000">' +
      esc(p.notas) + '</textarea></div><div class="btns"><button class="btn btn-sm btn-primary" id="b-estado" type="button">Guardar estado y notas</button></div>' +
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
    guardarCambiosPedido(p, { estado: estado, notas: notas || null }, document.getElementById("b-estado"), "Estado guardado");
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
    if (b) { b.hidden = n === 0; b.textContent = "🔔 " + n + (n === 1 ? " nuevo · marcar visto" : " nuevos · marcar vistos"); }
    var s = document.getElementById("b-sonido");
    if (s) { s.textContent = st.sonido ? "🔊 Sonido activado" : "🔇 Sonido apagado"; s.setAttribute("aria-pressed", String(st.sonido)); }
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

  function descargarExcel() {
    var lista = filtrados();
    if (!lista.length) { toast("No hay pedidos para descargar con estos filtros."); return; }
    var btn = document.getElementById("b-excel"); btn.disabled = true; btn.textContent = "Preparando…";
    cargarExcelJS().then(function (ExcelJS) {
      return armarExcel(ExcelJS, lista).xlsx.writeBuffer();
    }).then(function (buf) {
      var blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "pedidos-bel-" + diaLocal(new Date()) + ".xlsx";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      toast("Excel descargado (" + lista.length + " pedidos)");
    }).catch(function (e) {
      toast((e && e.message) || "No se pudo crear el Excel.");
    }).then(function () { btn.disabled = false; btn.textContent = "Descargar Excel"; });
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
      { k: "debe", t: "Debe", w: 12, m: MONEDA, sum: true }
    ];
    var ws = hojaConTitulo(wb, "Pedidos", "Bel Personal Shopper · Pedidos", cols);
    lista.forEach(function (p) {
      var c = p.clientes || {}, e = envioDe(p) || {};
      ws.addRow({ codigo: p.codigo, fecha: fechaExcel(p.creado_en), cliente: c.nombre, whatsapp: c.whatsapp, ciudad: e.ciudad || "",
        estado: p.estado, formulario: p.estado_formulario === "COMPLETO" ? "Completo" : "Pendiente",
        cant: num(p.cantidad_productos), prod: num(p.valor_productos), taxp: num(p.tax_porcentaje), tax: num(p.tax_monto),
        libras: num(p.libras), vlibra: num(p.valor_libra), envio: num(p.costo_envio), com: num(p.comision),
        total: num(p.total), pagado: num(p.pagado), debe: num(p.saldo) });
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
