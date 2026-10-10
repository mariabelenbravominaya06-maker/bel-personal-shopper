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

  var ESTADOS = ["NUEVO", "VENTA CONFIRMADA", "PAGO CONFIRMADO", "DATOS DE ENVÍO PENDIENTES",
    "DATOS DE ENVÍO COMPLETOS", "COMPRADO", "ENVIADO", "ENTREGADO", "CANCELADO"];
  var VALORES = [
    ["valor_productos", "Valor productos ($)", "0.01"],
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
    abierto: null, historial: [], editandoEnvio: false
  };

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
      '<h1>Panel de pedidos</h1><p style="color:var(--muted)">Bel Personal Shopper · acceso privado</p>' +
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
  var SELECT = "*, clientes(nombre, whatsapp), datos_envio(*)";

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
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, recargar)
      .on("postgres_changes", { event: "*", schema: "public", table: "datos_envio" }, recargar)
      .subscribe();
  }

  // ---------- Pantalla principal ----------
  function pantallaPanel() {
    var f = st.filtros;
    app.innerHTML =
      '<header class="top"><h1>Pedidos</h1>' +
      '<button class="btn btn-sm btn-ghost" id="b-enlace" type="button">Copiar enlace del formulario</button>' +
      '<button class="btn btn-sm btn-primary" id="b-nuevo" type="button">+ Pedido manual</button>' +
      '<button class="btn btn-sm btn-ghost" id="b-salir" type="button">Salir</button></header>' +
      '<main class="wrap">' +
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
      '<div id="detalle"></div>' +
      '<dialog id="d-nuevo"><form method="dialog" id="f-nuevo" novalidate><h3>Nuevo pedido manual</h3>' +
      '<p style="color:var(--muted);font-size:.9rem">Para clientes que escriben por WhatsApp. Luego completas los datos de envío y los valores.</p>' +
      '<div class="field"><label for="n-nombre">Nombre del cliente</label><input id="n-nombre" autocomplete="off" maxlength="120"></div>' +
      '<div class="field"><label for="n-whatsapp">WhatsApp</label><input id="n-whatsapp" type="tel" placeholder="+593 99 123 4567" maxlength="25"></div>' +
      '<p class="msg" id="n-err" style="color:var(--danger);font-size:.88rem" hidden></p>' +
      '<div class="btns"><button class="btn btn-sm btn-ghost" value="cancel" type="submit" formnovalidate>Cancelar</button>' +
      '<button class="btn btn-sm btn-primary" id="n-ok" type="button">Crear pedido</button></div></form></dialog>';

    document.getElementById("b-salir").onclick = salir;
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
      '<div class="card"><span>Pedidos activos</span><b>' + activos + "</b></div>" +
      '<div class="card"><span>Datos de envío pendientes</span><b>' + pendientes + "</b></div>" +
      '<div class="card y"><span>Por cobrar</span><b>' + usd(porCobrar) + "</b></div>" +
      '<div class="card y"><span>Comisiones del mes</span><b>' + usd(comMes) + "</b></div>";
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
    var cls = p.estado === "ENTREGADO" ? "p-ok" : p.estado === "CANCELADO" ? "p-pend" : "p-st";
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
      return '<tr data-id="' + esc(p.id) + '" tabindex="0"><td><b>' + esc(p.codigo) + "</b></td><td>" + esc(fecha(p.creado_en)) +
        "</td><td>" + esc(c.nombre) + "</td><td>" + esc(c.whatsapp) + "</td><td>" + pillEstado(p) + "</td><td>" + pillForm(p) +
        '</td><td class="num">' + num(p.cantidad_productos) + '</td><td class="num">' + usd(p.valor_productos) +
        '</td><td class="num">' + usd(p.tax_monto) + '</td><td class="num">' + usd(p.costo_envio) +
        '</td><td class="num">' + usd(p.comision) + '</td><td class="num"><b>' + usd(p.total) +
        '</b></td><td class="num">' + usd(p.pagado) + '</td><td class="num' + (num(p.saldo) > 0 ? " debe" : "") + '">' + usd(p.saldo) + "</td></tr>";
    }).join("");
    var items = lista.map(function (p) {
      var c = p.clientes || {};
      return '<button class="item" type="button" data-id="' + esc(p.id) + '"><div class="r"><b>' + esc(p.codigo) + " · " + esc(c.nombre) +
        "</b>" + pillForm(p) + '</div><div class="r">' + pillEstado(p) + "<small>" + esc(fecha(p.creado_en)) + "</small></div>" +
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
    st.abierto = id; st.editandoEnvio = false; st.historial = [];
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

    var valores = VALORES.map(function (v) {
      return '<div class="field"><label for="v-' + v[0] + '">' + esc(v[1]) + '</label><input id="v-' + v[0] +
        '" type="number" inputmode="decimal" min="0"' + (v[0] === "tax_porcentaje" ? ' max="100"' : "") + ' step="' + v[2] +
        '" value="' + esc(p[v[0]]) + '"></div>';
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
      '<div class="panel-head"><h2>' + esc(p.codigo) + '</h2><button class="btn btn-sm btn-ghost" id="b-cerrar" type="button">Cerrar</button></div>' +
      '<div class="panel-body">' +
      '<section class="sec"><div><b>' + esc(c.nombre) + "</b><br><small style=\"color:var(--muted)\">" + esc(c.whatsapp) + " · creado " + esc(fechaHora(p.creado_en)) +
      " · " + (p.origen === "FORMULARIO" ? "desde el formulario" : "manual") + "</small></div>" +
      '<div class="btns">' + (wa ? '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="https://wa.me/' + esc(wa) + '">Abrir WhatsApp</a>' +
        '<a class="btn btn-sm btn-ghost" target="_blank" rel="noopener" href="https://wa.me/' + esc(wa) + "?text=" + encodeURIComponent(saludo) + '">Enviar enlace del formulario</a>' : "") +
      '<button class="btn btn-sm btn-ghost" id="b-copiar-enlace" type="button">Copiar enlace</button></div></section>' +

      '<section class="sec"><h3>Estado</h3><div class="field"><label for="p-estado">Estado del pedido</label><select id="p-estado">' +
      ESTADOS.map(function (s) { return "<option" + (s === p.estado ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") +
      '</select></div><div class="field"><label for="p-notas">Notas internas <span class="opt">(solo tú las ves)</span></label><textarea id="p-notas" maxlength="1000">' +
      esc(p.notas) + '</textarea></div><div class="btns"><button class="btn btn-sm btn-primary" id="b-estado" type="button">Guardar estado y notas</button></div>' +
      "<small style=\"color:var(--muted)\">Formulario: " + (p.estado_formulario === "COMPLETO" ? "completo" : "pendiente") + ". Los pagos se confirman a mano; nada cambia solo.</small></section>" +

      '<section class="sec"><h3>Valores</h3><div class="grid3">' + valores + '</div>' +
      '<div class="totals" id="totales">' + htmlTotales(calcular(p)) + "</div>" +
      '<p class="msg" id="v-err" style="color:var(--danger);font-size:.88rem" hidden></p>' +
      '<div class="btns"><button class="btn btn-sm btn-primary" id="b-valores" type="button">Guardar valores</button></div></section>' +

      '<section class="sec"><h3>Datos de envío</h3>' + envio + "</section>" +
      '<section class="sec"><h3>Historial de cambios</h3><div class="hist" id="hist">' + htmlHistorial() + "</div></section>" +
      "</div></aside>";

    document.getElementById("ov").onclick = cerrarPanel;
    document.getElementById("b-cerrar").onclick = cerrarPanel;
    document.getElementById("b-copiar-enlace").onclick = function () { copiar(ENLACE); };
    document.getElementById("b-estado").onclick = function () { guardarEstado(p); };
    document.getElementById("b-valores").onclick = function () { guardarValores(p); };
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

  function guardarValores(p) {
    var v = leerValores(), err = document.getElementById("v-err"), cambios = {}, malo = "";
    VALORES.forEach(function (d) {
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

  // ---------- Inicio ----------
  sb.auth.getSession().then(function (r) {
    var s = r.data && r.data.session;
    if (s) verificarAdmin(s.user); else pantallaLogin();
  });
  sb.auth.onAuthStateChange(function (evento) {
    if (evento === "SIGNED_OUT" && st.usuario) { st.usuario = null; pantallaLogin("Tu sesión terminó. Vuelve a entrar."); }
  });
})();
