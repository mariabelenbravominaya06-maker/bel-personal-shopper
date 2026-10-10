/* Interacciones de la página principal: menú, animaciones al desplazarse,
   botón flotante de WhatsApp y medición de clics (sin herramientas externas). */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var header = document.getElementById('header');
  var nav = document.getElementById('nav');
  var burger = document.getElementById('burger');
  var fab = document.getElementById('fab');
  var progress = document.getElementById('progress');

  /* ---------- Menú móvil ---------- */
  function setMenu(open) {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    nav.classList.toggle('open', open);
    document.body.classList.toggle('nav-open', open);
  }
  burger.addEventListener('click', function () {
    setMenu(burger.getAttribute('aria-expanded') !== 'true');
  });
  nav.addEventListener('click', function (e) {
    if (e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); burger.focus(); }
  });
  window.matchMedia('(min-width: 960px)').addEventListener('change', function () { setMenu(false); });

  /* ---------- Aparición al desplazarse ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('in'); });
  } else {
    var revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          revealObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { revealObs.observe(el); });
  }

  /* ---------- Fondo por sección y enlace activo del menú ---------- */
  var tones = { cream: '#FFFCF9', blush: '#FFF2F7', butter: '#FFF8E4' };
  var navLinks = document.querySelectorAll('[data-nav]');
  if ('IntersectionObserver' in window) {
    var sectionObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var tone = tones[entry.target.getAttribute('data-tone')];
        if (tone) document.body.style.setProperty('--page-bg', tone);
        var id = entry.target.id;
        navLinks.forEach(function (a) {
          a.classList.toggle('active', id !== '' && a.getAttribute('href') === '#' + id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('[data-tone]').forEach(function (s) { sectionObs.observe(s); });
  }

  /* ---------- Botón flotante: visible fuera de la portada y de los bloques que ya tienen botón ---------- */
  var hideFabIn = ['inicio', 'comunidad', 'contacto'];
  var hiding = {};
  function updateFab() {
    var anyHiding = Object.keys(hiding).some(function (k) { return hiding[k]; });
    fab.classList.toggle('show', !anyHiding);
  }
  if ('IntersectionObserver' in window) {
    var fabObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { hiding[entry.target.id || 'footer'] = entry.isIntersecting; });
      updateFab();
    }, { threshold: 0.15 });
    hideFabIn.forEach(function (id) { var el = document.getElementById(id); if (el) fabObs.observe(el); });
    var footer = document.querySelector('.footer');
    if (footer) fabObs.observe(footer);
    document.querySelectorAll('.final').forEach(function (el) { el.id = el.id || 'cierre'; fabObs.observe(el); });
  }

  /* ---------- Encabezado, barra de progreso y parallax ligero ---------- */
  var parallax = reduced ? [] : Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  var ticking = false;
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    header.classList.toggle('scrolled', y > 8);
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.transform = 'scaleX(' + (max > 0 ? Math.min(y / max, 1) : 0) + ')';
    var vh = window.innerHeight;
    parallax.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      var speed = parseFloat(el.getAttribute('data-parallax')) || 0;
      var offset = (r.top + r.height / 2 - vh / 2) * speed;
      el.style.translate = '0 ' + offset.toFixed(1) + 'px';
    });
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();


  /* ---------- Navegadores internos (TikTok, Instagram, Facebook) ----------
     Esos navegadores no abren chat.whatsapp.com. Se avisa, se intenta abrir WhatsApp
     directo y, si no se logra, se muestra una ayuda con botón para copiar el enlace. */
  var ua = navigator.userAgent || '';
  var iab = /TikTok|musical_ly|BytedanceWebview|Bytedance|trill/i.test(ua) ? 'TikTok'
          : /Instagram/i.test(ua) ? 'Instagram'
          : /FBAN|FBAV|FB_IAB|FBIOS/i.test(ua) ? 'Facebook' : '';
  var iabBar = document.getElementById('iab-bar');
  var iabSheet = document.getElementById('iab-sheet');
  if (iab && iabBar) {
    ['iab-name', 'iab-name2'].forEach(function (id) { var el = document.getElementById(id); if (el) el.textContent = iab; });
    iabBar.hidden = false;
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-track="whatsapp_group"]');
      if (!a || !iabSheet || typeof iabSheet.showModal !== 'function') return;
      e.preventDefault();
      var m = a.href.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
      var left = false;
      var onHide = function () { if (document.hidden) left = true; };
      document.addEventListener('visibilitychange', onHide);
      if (m) { window.location.href = 'whatsapp://chat?code=' + m[1]; }
      setTimeout(function () {
        document.removeEventListener('visibilitychange', onHide);
        if (!left && !iabSheet.open) iabSheet.showModal();
      }, 900);
    }, true);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy]');
    if (!b) return;
    var text = b.getAttribute('data-copy');
    var label = b.textContent;
    var done = function () { b.textContent = '¡Enlace copiado!'; setTimeout(function () { b.textContent = label; }, 2200); };
    var fallback = function () {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (err) { window.prompt('Copia este enlace:', text); }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  });

  /* ---------- Medición ----------
     Cada botón importante lleva data-track (whatsapp_group, whatsapp_private, tiktok, admin, ver_tiendas)
     y data-track-location (hero, menu, precios...). Los eventos se envían a dataLayer, gtag o
     plausible solo si alguna de esas herramientas se instala más adelante; hoy no se envía nada a terceros. */
  function track(name, params) {
    try {
      if (window.dataLayer && typeof window.dataLayer.push === 'function') window.dataLayer.push(Object.assign({ event: name }, params));
      if (typeof window.gtag === 'function') window.gtag('event', name, params);
      if (typeof window.plausible === 'function') window.plausible(name, { props: params });
    } catch (err) { /* la medición nunca debe romper la página */ }
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-track]');
    if (!el) return;
    track('cta_click', { cta: el.getAttribute('data-track'), location: el.getAttribute('data-track-location') || '' });
  });
  var pricing = document.getElementById('precios');
  if (pricing && 'IntersectionObserver' in window) {
    var priceObs = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { track('view_pricing', { section: 'precios' }); priceObs.disconnect(); }
    }, { threshold: 0.35 });
    priceObs.observe(pricing);
  }
})();
