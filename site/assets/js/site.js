/* wgdively, inc. — shared site behaviour: theme, menu, enter gate, rail spinner,
   reveal-on-scroll, ambient sound, and small helpers other scripts use (window.WG). */
(function () {
  'use strict';
  var doc = document.documentElement;
  var WG = (window.WG = window.WG || {});

  /* ---------- helpers ---------- */
  WG.$ = function (sel, root) { return (root || document).querySelector(sel); };
  WG.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  WG.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var toastEl, toastTimer;
  WG.toast = function (msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1800);
  };
  WG.copy = function (text, label) {
    var done = function () { WG.toast((label || 'Copied') + ' ✓'); };
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(done, function () { fallback(); });
    }
    fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { WG.toast('Copy failed'); }
      document.body.removeChild(ta);
    }
  };
  WG.downloadText = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob); var a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  };
  WG.qrSvg = function (text, opts) {
    opts = opts || {};
    if (typeof window.qrcode !== 'function') return '';
    var qr = window.qrcode(0, opts.ecc || 'M');
    qr.addData(unescape(encodeURIComponent(text)), 'Byte');
    qr.make();
    var n = qr.getModuleCount(), q = 2, size = n + q * 2, path = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) path += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" role="img" aria-label="' + WG.esc(opts.label || 'QR code') + '"><rect width="100%" height="100%" fill="#fff"/><path d="' + path + '" fill="#000"/></svg>';
  };
  // Copy buttons: <button data-copy-target="#id"> or data-copy="literal text"
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-copy-target],[data-copy]');
    if (!b) return;
    var text = b.getAttribute('data-copy');
    if (text == null) { var t = WG.$(b.getAttribute('data-copy-target')); text = t ? ('value' in t && t.tagName !== 'DIV' && t.tagName !== 'PRE' ? t.value : t.textContent) : ''; }
    if (text) WG.copy(text, b.getAttribute('data-copy-label'));
  });

  /* ---------- theme: Auto (device) / Dark / Light ---------- */
  function currentChoice() { try { return localStorage.getItem('theme') || 'auto'; } catch (e) { return 'auto'; } }
  function applyTheme(choice) {
    if (choice === 'dark' || choice === 'light') doc.setAttribute('data-theme', choice);
    else doc.removeAttribute('data-theme');
    try { if (choice === 'auto') localStorage.removeItem('theme'); else localStorage.setItem('theme', choice); } catch (e) {}
    WG.$$('[data-theme-set]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === choice)); });
    var meta = WG.$('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getComputedStyle(doc).getPropertyValue('--bg').trim() || '#0e0e0d');
  }
  applyTheme(currentChoice());
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme-set]'); if (b) applyTheme(b.getAttribute('data-theme-set'));
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: light)');
    var onChange = function () { if (currentChoice() === 'auto') applyTheme('auto'); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }

  /* ---------- mobile menu ---------- */
  var menuBtn = WG.$('.menu-btn'), menu = WG.$('#menu');
  if (menuBtn && menu) {
    var setMenu = function (open) { menu.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', String(open)); };
    menuBtn.addEventListener('click', function () { setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.classList.contains('open')) { setMenu(false); menuBtn.focus(); } });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  }

  /* ---------- ambient sound (generated, quiet, off unless chosen) ---------- */
  var audio = null;
  function soundWanted() { try { return localStorage.getItem('ambient') === 'on'; } catch (e) { return false; } }
  function startAmbient() {
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    if (!audio) {
      var ctx = new AC(), master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4; lp.connect(master);
      [[110, 0], [164.81, 4], [220.5, -6], [329.63, 3]].forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = f[0]; o.detune.value = f[1];
        g.gain.value = [0.16, 0.08, 0.06, 0.03][i];
        var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.05 + i * 0.031; lg.gain.value = g.gain.value * 0.7;
        lfo.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(lp); o.start(); lfo.start();
      });
      var len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0), last = 0;
      for (var i = 0; i < len; i++) { var w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      var noise = ctx.createBufferSource(), ng = ctx.createGain(); noise.buffer = buf; noise.loop = true; ng.gain.value = 0.05; noise.connect(ng); ng.connect(lp); noise.start();
      audio = { ctx: ctx, master: master };
    }
    audio.ctx.resume();
    audio.master.gain.cancelScheduledValues(audio.ctx.currentTime);
    audio.master.gain.setTargetAtTime(0.05, audio.ctx.currentTime, 1.2);
  }
  function stopAmbient() {
    if (!audio) return;
    audio.master.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.4);
    setTimeout(function () { if (!soundWanted() && audio) audio.ctx.suspend(); }, 1500);
  }
  function syncSoundButtons() {
    var on = soundWanted();
    WG.$$('.sound-toggle, .gate-sound').forEach(function (b) { b.setAttribute('aria-pressed', String(on)); b.textContent = 'Ambient sound: ' + (on ? 'on' : 'off'); });
  }
  WG.setSound = function (on) {
    try { localStorage.setItem('ambient', on ? 'on' : 'off'); } catch (e) {}
    syncSoundButtons(); if (on) startAmbient(); else stopAmbient();
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.sound-toggle, .gate-sound'); if (!b) return;
    e.stopPropagation(); WG.setSound(!soundWanted());
  }, true);
  syncSoundButtons();
  if (soundWanted()) {
    // Browsers only allow sound after the visitor interacts with the page.
    var resume = function () { if (soundWanted()) startAmbient(); window.removeEventListener('pointerdown', resume); window.removeEventListener('keydown', resume); };
    window.addEventListener('pointerdown', resume); window.addEventListener('keydown', resume);
  }

  /* ---------- click-to-enter gate (home page, once per visit) ---------- */
  var gate = WG.$('.gate');
  if (gate && !doc.classList.contains('entered')) {
    var logo = WG.$('.gate-logo', gate);
    if (logo && !logo.getAttribute('data-split')) {
      var text = logo.textContent; logo.textContent = ''; logo.setAttribute('data-split', '1'); logo.setAttribute('aria-label', text);
      var idx = 0;
      text.split('').forEach(function (ch) {
        var s = document.createElement('span'); s.setAttribute('aria-hidden', 'true');
        s.textContent = ch === ' ' ? '\u00a0' : ch; if (ch === ',') s.className = 'comma';
        s.style.animationDelay = (0.15 + (idx++) * 0.07 + Math.random() * 0.18).toFixed(2) + 's'; logo.appendChild(s);
      });
    }
    document.body.style.overflow = 'hidden';
    var enterBtn = WG.$('.gate-enter', gate);
    setTimeout(function () { if (enterBtn) enterBtn.focus({ preventScroll: true }); }, 50);
    var enter = function () {
      if (gate.classList.contains('leaving')) return;
      try { sessionStorage.setItem('entered', '1'); } catch (e) {}
      gate.classList.add('leaving'); document.body.style.overflow = '';
      if (soundWanted()) startAmbient();
      setTimeout(function () { doc.classList.add('entered'); var m = WG.$('#main'); if (m) m.focus({ preventScroll: true }); }, 600);
      document.removeEventListener('keydown', onKey);
    };
    var onKey = function (e) { if (e.key === 'Tab') return; if (e.target.closest && e.target.closest('.gate-sound')) return; e.preventDefault(); enter(); };
    gate.addEventListener('click', function (e) { if (!e.target.closest('.gate-sound')) enter(); });
    document.addEventListener('keydown', onKey);
  }

  /* ---------- rail spinner: scroll progress + current section ---------- */
  var ring = WG.$('.spinner-progress'), num = WG.$('.spinner-num'), label = WG.$('.rail-label'), bar = WG.$('.progress span');
  var sections = WG.$$('[data-section]');
  var ticking = false;
  function onScroll() {
    ticking = false;
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    var p = Math.min(1, Math.max(0, window.scrollY / max));
    if (ring) ring.style.strokeDashoffset = String(100 - p * 100);
    if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
    if (sections.length && num) {
      var cur = 0, line = window.innerHeight * 0.35;
      sections.forEach(function (s, i) { if (s.getBoundingClientRect().top < line) cur = i; });
      var n = String(cur + 1).padStart(2, '0');
      if (num.textContent !== n) num.textContent = n;
      if (label) label.textContent = sections[cur].getAttribute('data-section');
    }
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------- reveal on scroll ---------- */
  var reveals = WG.$$('.reveal');
  if ('IntersectionObserver' in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else reveals.forEach(function (el) { el.classList.add('in'); });

  WG.$$('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
