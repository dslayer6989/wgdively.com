/* Contact form: checks the fields in the browser, adds Cloudflare Turnstile when a site
   key is configured on the form (data-turnstile-sitekey), and posts to /api/contact.
   The bot check runs quietly while the visitor types. It only shows a checkbox if
   Cloudflare wants one, and that always happens before sending, never after. */
(function () {
  'use strict';
  var WG = window.WG, form = document.getElementById('contact-form');
  if (!form) return;
  var status = document.getElementById('c-status'), sendBtn = document.getElementById('c-send');
  var slot = document.getElementById('turnstile-slot');
  var sitekey = form.getAttribute('data-turnstile-sitekey');
  var widgetId = null, token = '', waiting = null;

  if (sitekey) {
    window.wgTurnstileReady = function () {
      widgetId = window.turnstile.render('#turnstile-slot', {
        sitekey: sitekey,
        theme: document.documentElement.getAttribute('data-theme') || 'auto',
        appearance: 'interaction-only',
        callback: function (t) { token = t; if (waiting) { var go = waiting; waiting = null; go(); } },
        'expired-callback': function () { token = ''; },
        'error-callback': function () { token = ''; }
      });
    };
    var s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=wgTurnstileReady&render=explicit';
    s.async = true; s.defer = true; document.head.appendChild(s);
  }

  var EMAIL = /^[^\s@<>()",;:]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE = /^[0-9+().\-\s]{7,25}$/;
  function setErr(id, msg) {
    var input = form.querySelector('[name="' + id + '"]'), el = document.getElementById('c-' + id + '-err');
    if (!input || !el) return;
    el.hidden = !msg; el.textContent = msg || '';
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  function validate(d) {
    var e = {};
    if ((d.name || '').trim().length < 2) e.name = 'Please enter your name.';
    if (!EMAIL.test((d.email || '').trim())) e.email = 'Please enter a valid email address.';
    if (d.phone && !PHONE.test(d.phone.trim())) e.phone = 'That phone number doesn\u2019t look right. You can leave it blank.';
    if (!d.reason) e.reason = 'Please pick a reason.';
    if ((d.message || '').trim().length < 10) e.message = 'Please write a little more (at least 10 characters).';
    return e;
  }
  function show(kind, html) {
    status.hidden = false; status.className = 'callout' + (kind === 'bad' ? ' warn' : '');
    status.innerHTML = html;
    status.setAttribute('tabindex', '-1');
  }
  function busy(on, label) { sendBtn.disabled = on; sendBtn.textContent = on ? (label || 'Sending\u2026') : 'Send message'; }

  function send(d) {
    if (sitekey) d['cf-turnstile-response'] = token;
    busy(true);
    fetch(form.getAttribute('action'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d)
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'The contact service isn\u2019t answering right now.' }; });
    }).then(function (j) {
      if (j.ok) {
        form.reset();
        // Finished: take the bot check away so nothing pops up after sending.
        if (widgetId !== null && window.turnstile) { window.turnstile.remove(widgetId); widgetId = null; }
        if (slot) slot.hidden = true;
        sendBtn.hidden = true;
        show('ok', '<p><strong>Message sent.</strong> Thanks! You\u2019ll get a reply at the email address you gave.</p><p class="small muted">Want to send another? <a href="/contact/">Reload the page</a>.</p>');
        status.focus();
        return;
      }
      if (j.fields) Object.keys(j.fields).forEach(function (k) { setErr(k, j.fields[k]); });
      show('bad', '<p>' + WG.esc(j.error || 'Something went wrong. Please try again.') + '</p>');
      resetCheck();
      busy(false);
    }).catch(function () {
      show('bad', '<p>Couldn\u2019t reach the contact service. Check your connection and try again.</p>');
      resetCheck();
      busy(false);
    });
  }
  // A Turnstile token works once, so a failed send needs a fresh check before trying again.
  function resetCheck() { token = ''; if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId); }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (sendBtn.disabled) return;
    var d = Object.fromEntries(new FormData(form).entries());
    d.page = location.href;
    ['name', 'email', 'phone', 'reason', 'message'].forEach(function (k) { setErr(k, ''); });
    var errs = validate(d), keys = Object.keys(errs);
    if (keys.length) {
      keys.forEach(function (k) { setErr(k, errs[k]); });
      form.querySelector('[name="' + keys[0] + '"]').focus();
      show('bad', '<p>Please fix the highlighted fields.</p>');
      return;
    }
    status.hidden = true;
    if (sitekey && !token) {
      if (!window.turnstile || widgetId === null) {
        show('bad', '<p>The bot check didn\u2019t load. If you use an ad or script blocker, allow challenges.cloudflare.com, then reload the page.</p>');
        return;
      }
      // Still checking (or Cloudflare wants a tick): send as soon as it's done.
      busy(true, 'Checking you\u2019re human\u2026');
      waiting = function () { send(d); };
      return;
    }
    send(d);
  });
})();
