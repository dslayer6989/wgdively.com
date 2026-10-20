/* Security tools: password, passphrase, strength, hash, JWT, encoder, UUID. */
(function () {
  'use strict';
  var WG = window.WG, $ = WG.$, esc = WG.esc;
  var host = document.querySelector('[data-tool]');
  var tool = host && host.getAttribute('data-tool');
  var cryptoObj = window.crypto;

  // Unbiased random integer in [0, n) using rejection sampling.
  function randInt(n) {
    if (n <= 0) return 0;
    var max = Math.floor(0x100000000 / n) * n, buf = new Uint32Array(1);
    do { cryptoObj.getRandomValues(buf); } while (buf[0] >= max);
    return buf[0] % n;
  }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = randInt(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function bitsLabel(bits) { return bits < 40 ? ['Weak', 15] : bits < 60 ? ['Fair', 40] : bits < 80 ? ['Good', 65] : bits < 100 ? ['Strong', 85] : ['Very strong', 100]; }
  function meter(el, pct, bits) {
    el.style.width = pct + '%';
    el.style.background = bits < 40 ? 'var(--bad)' : bits < 60 ? 'var(--warn)' : 'var(--ok)';
  }
  var te = new TextEncoder(), td = new TextDecoder('utf-8', { fatal: true });

  /* ================= Password ================= */
  if (tool === 'password') {
    var SETS = { lower: 'abcdefghijklmnopqrstuvwxyz', upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', digit: '0123456789', sym: '!@#$%^&*()-_=+[]{};:,.<>/?~' };
    var AMB = /[0Oo1lI|]/g;
    var len = $('#pw-len');
    function opts() { return ['lower', 'upper', 'digit', 'sym'].filter(function (k) { return $('#pw-' + k).checked; }); }
    function make() {
      var sets = opts(); if (!sets.length) { $('#pw-lower').checked = true; sets = ['lower']; }
      var amb = $('#pw-amb').checked, n = +len.value;
      var pools = sets.map(function (k) { return amb ? SETS[k].replace(AMB, '') : SETS[k]; });
      var all = pools.join(''), chars = [];
      if ($('#pw-each').checked && n >= pools.length) { pools.forEach(function (p) { chars.push(p[randInt(p.length)]); }); }
      while (chars.length < n) chars.push(all[randInt(all.length)]);
      return { pw: shuffle(chars).join(''), bits: n * Math.log2(all.length) };
    }
    function go() {
      var r = make(); $('#pw-out').textContent = r.pw; $('#pw-len-v').textContent = len.value;
      var l = bitsLabel(r.bits); meter($('#pw-meter'), l[1], r.bits);
      $('#pw-bits').textContent = l[0] + ' · about ' + Math.round(r.bits) + ' bits of entropy';
      $('#pw-list').hidden = true;
    }
    WG.$$('#pw-len, #pw-lower, #pw-upper, #pw-digit, #pw-sym, #pw-amb, #pw-each').forEach(function (el) { el.addEventListener('input', go); });
    $('#pw-go').addEventListener('click', go);
    $('#pw-five').addEventListener('click', function () { var l = []; for (var i = 0; i < 5; i++) l.push(make().pw); $('#pw-list').textContent = l.join('\n'); $('#pw-list').hidden = false; });
    go();
  }

  /* ================= Passphrase ================= */
  if (tool === 'passphrase') {
    var words = null;
    fetch('/assets/data/eff-large-wordlist.txt').then(function (r) { return r.text(); }).then(function (t) { words = t.split('\n').map(function (w) { return w.trim(); }).filter(Boolean); go(); })
      .catch(function () { $('#pp-out').textContent = 'Couldn\u2019t load the word list. Reload the page to try again.'; });
    function go() {
      if (!words) return;
      var n = +$('#pp-n').value, sep = $('#pp-sep').value, cap = $('#pp-cap').checked, num = $('#pp-num').checked, list = [];
      for (var i = 0; i < n; i++) { var w = words[randInt(words.length)]; list.push(cap ? w[0].toUpperCase() + w.slice(1) : w); }
      var bits = n * Math.log2(words.length);
      if (num) { var pos = randInt(list.length); list[pos] = list[pos] + randInt(10); bits += Math.log2(10) + Math.log2(n); }
      $('#pp-out').textContent = list.join(sep);
      $('#pp-bits').textContent = bitsLabel(bits)[0] + ' · about ' + Math.round(bits) + ' bits · ' + list.join(sep).length + ' characters';
    }
    WG.$$('#pp-n, #pp-sep, #pp-cap, #pp-num').forEach(function (el) { el.addEventListener('input', go); });
    $('#pp-go').addEventListener('click', go);
  }

  /* ================= Strength ================= */
  if (tool === 'strength') {
    var COMMON = ('123456 password 123456789 12345678 12345 qwerty 1234567 111111 123123 abc123 1234567890 password1 iloveyou 000000 qwerty123 1q2w3e4r 123321 dragon monkey letmein ' +
      'football baseball welcome admin login master sunshine princess shadow superman hello freedom whatever trustno1 starwars michael jordan harley ranger hunter buster soccer hockey ' +
      'killer george charlie andrew thomas jessica pepper ginger summer winter spring autumn secret computer internet samsung google apple netflix changeme passw0rd p@ssw0rd ' +
      'qwertyuiop asdfghjkl zxcvbnm 654321 666666 696969 7777777 987654321 121212 112233 aaaaaa zaq12wsx 1qaz2wsx qazwsx q1w2e3r4 pokemon minecraft batman flower lovely ' +
      'cheese matrix mustang access ninja azerty solo loveme root toor default guest test user').split(' ');
    var KEYROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', '1qaz2wsx3edc4rfv', 'qazwsxedcrfv'];
    var LEET = { '@': 'a', '4': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '$': 's', '5': 's', '7': 't', '+': 't' };
    function pool(p) { var n = 0; if (/[a-z]/.test(p)) n += 26; if (/[A-Z]/.test(p)) n += 26; if (/\d/.test(p)) n += 10; if (/[^a-zA-Z0-9]/.test(p)) n += 33; if (/[^\x00-\x7f]/.test(p)) n += 100; return n || 1; }
    function analyse(p) {
      var notes = [], bits = p.length * Math.log2(pool(p)), low = p.toLowerCase();
      var unleet = low.replace(/[@4310!$57+]/g, function (c) { return LEET[c] || c; });
      var base = unleet.replace(/[\d!@#$%^&*._-]+$/, '');
      if (COMMON.indexOf(low) > -1 || COMMON.indexOf(unleet) > -1) { bits = Math.min(bits, 4); notes.push('It\u2019s one of the most common passwords. Attackers try these first.'); }
      else if (base.length >= 4 && COMMON.indexOf(base) > -1) { bits = Math.min(bits, 14 + (p.length - base.length) * 3.3); notes.push('It\u2019s a common password with a few characters added on the end.'); }
      KEYROWS.forEach(function (row) { for (var L = 4; L <= low.length; L++) for (var i = 0; i + L <= low.length; i++) { var s = low.substr(i, L); if (row.indexOf(s) > -1 || row.split('').reverse().join('').indexOf(s) > -1) { if (L >= 4 && notes.indexOf('kb') < 0) { notes.push('kb'); bits -= L * 2.5; } return; } } });
      notes = notes.map(function (n) { return n === 'kb' ? 'It contains a keyboard pattern (like qwerty or 1234).' : n; });
      if (/(.)\1{2,}/.test(p)) { bits -= 6; notes.push('It repeats the same character several times.'); }
      if (/(abc|bcd|cde|def|123|234|345|456|567|678|789|890|987|876|765|654|543|432|321)/i.test(p)) { bits -= 5; notes.push('It contains a simple sequence like abc or 123.'); }
      if (/(19[5-9]\d|20[0-4]\d)/.test(p)) { bits -= 5; notes.push('It contains a year, which is easy to guess (birthdays, anniversaries).'); }
      if (/^[A-Z][a-z]+\d+[!.?]?$/.test(p)) { bits -= 8; notes.push('It follows the very common Word + numbers + ! pattern.'); }
      if (p.length < 12) notes.push('It\u2019s short. Aim for at least 14 characters, or a 6-word passphrase.');
      return { bits: Math.max(0, bits), notes: notes };
    }
    function crackTime(bits) {
      var s = Math.pow(2, bits) / 2 / 1e10;
      var u = [[3.15e7 * 1e9, 'billion years'], [3.15e7 * 1e6, 'million years'], [3.15e7 * 1000, 'thousand years'], [3.15e7, 'years'], [86400 * 30, 'months'], [86400, 'days'], [3600, 'hours'], [60, 'minutes'], [1, 'seconds']];
      if (s < 1) return 'instantly';
      for (var i = 0; i < u.length; i++) if (s >= u[i][0]) { var v = s / u[i][0]; return (v > 1000 ? 'over 1,000' : Math.round(v).toLocaleString()) + ' ' + u[i][1]; }
    }
    var inp = $('#st-in');
    function upd() {
      var p = inp.value; $('#st-pwned-out').textContent = '';
      if (!p) { $('#st-verdict').textContent = 'Type a password'; $('#st-details').innerHTML = ''; meter($('#st-meter'), 0, 0); return; }
      var a = analyse(p), l = bitsLabel(a.bits); meter($('#st-meter'), Math.max(5, l[1]), a.bits);
      $('#st-verdict').textContent = l[0];
      $('#st-details').innerHTML = '<dt>Length</dt><dd>' + p.length + ' characters</dd><dt>Estimated strength</dt><dd>~' + Math.round(a.bits) + ' bits</dd><dt>Time to crack</dt><dd>' + esc(crackTime(a.bits)) + ' (offline, 10 billion guesses/s)</dd>' +
        (a.notes.length ? '<dt>Watch out</dt><dd style="font-family:var(--font-body)">' + a.notes.map(esc).join('<br>') + '</dd>' : '<dt>Notes</dt><dd style="font-family:var(--font-body)">No obvious patterns found.</dd>');
    }
    inp.addEventListener('input', upd);
    $('#st-show').addEventListener('click', function () { var s = inp.type === 'password'; inp.type = s ? 'text' : 'password'; this.textContent = s ? 'Hide' : 'Show'; this.setAttribute('aria-pressed', String(s)); });
    $('#st-pwned').addEventListener('click', function () {
      var p = inp.value, out = $('#st-pwned-out'); if (!p) { out.textContent = 'Type a password first.'; return; }
      out.textContent = 'Checking…';
      cryptoObj.subtle.digest('SHA-1', te.encode(p)).then(function (h) {
        var hex = Array.from(new Uint8Array(h)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('').toUpperCase();
        return fetch('https://api.pwnedpasswords.com/range/' + hex.slice(0, 5), { headers: { 'Add-Padding': 'true' } }).then(function (r) { return r.text(); }).then(function (t) {
          var line = t.split('\n').filter(function (l) { return l.indexOf(hex.slice(5)) === 0; })[0], n = line ? parseInt(line.split(':')[1], 10) : 0;
          out.innerHTML = n > 0 ? '<span class="tag bad">Found</span> This password has appeared <strong>' + n.toLocaleString() + '</strong> times in data breaches. Don\u2019t use it anywhere.' : '<span class="tag ok">Not found</span> Not in any known breach. That\u2019s good, but it isn\u2019t a guarantee of strength.';
        });
      }).catch(function () { out.textContent = 'Couldn\u2019t reach the breach database just now.'; });
    });
  }

  /* ================= Hash ================= */
  if (tool === 'hash') {
    // MD5 (RFC 1321), compact implementation; only used for legacy checksums.
    function md5(bytes) {
      var K = [], S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21], i;
      for (i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
      var len = bytes.length, nBlocks = ((len + 8) >>> 6) + 1, w = new Uint32Array(nBlocks * 16);
      for (i = 0; i < len; i++) w[i >> 2] |= bytes[i] << ((i % 4) * 8);
      w[len >> 2] |= 0x80 << ((len % 4) * 8);
      w[nBlocks * 16 - 2] = (len * 8) >>> 0; w[nBlocks * 16 - 1] = Math.floor(len / 0x20000000);
      var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
      for (var blk = 0; blk < nBlocks; blk++) {
        var A = a0, Bv = b0, C = c0, D = d0;
        for (i = 0; i < 64; i++) {
          var F, g, r = i >> 4;
          if (r === 0) { F = (Bv & C) | (~Bv & D); g = i; } else if (r === 1) { F = (D & Bv) | (~D & C); g = (5 * i + 1) % 16; } else if (r === 2) { F = Bv ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (Bv | ~D); g = (7 * i) % 16; }
          F = (F + A + K[i] + w[blk * 16 + g]) >>> 0; A = D; D = C; C = Bv;
          var s = S[(r << 2) | (i & 3)]; Bv = (Bv + ((F << s) | (F >>> (32 - s)))) >>> 0;
        }
        a0 = (a0 + A) >>> 0; b0 = (b0 + Bv) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
      }
      return [a0, b0, c0, d0].map(function (x) { var h = ''; for (var j = 0; j < 4; j++) h += ((x >>> (j * 8)) & 255).toString(16).padStart(2, '0'); return h; }).join('');
    }
    var mode = 'text', last = {};
    function hex(buf) { return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
    function run(bytes, label) {
      $('#h-out').innerHTML = '<dt>Working</dt><dd>Hashing ' + esc(label) + '…</dd>';
      var algs = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
      Promise.all(algs.map(function (a) { return cryptoObj.subtle.digest(a, bytes); })).then(function (rs) {
        last = { 'MD5': bytes.byteLength > 512 * 1024 * 1024 ? '(skipped for files over 512 MB)' : md5(new Uint8Array(bytes)) };
        algs.forEach(function (a, i) { last[a] = hex(rs[i]); });
        $('#h-out').innerHTML = '<dt>Input</dt><dd>' + esc(label) + '</dd>' + Object.keys(last).map(function (k) { return '<dt>' + k + '</dt><dd>' + esc(last[k]) + ' <button type="button" class="btn small ghost" data-copy="' + esc(last[k]) + '" data-copy-label="' + k + ' copied">copy</button></dd>'; }).join('');
        verify();
      });
    }
    function verify() {
      var v = $('#h-verify').value.trim().toLowerCase().replace(/^sha\d+[:=]\s*/, '').replace(/\s.*$/, ''), out = $('#h-match');
      if (!v) { out.innerHTML = ''; return; }
      var hit = Object.keys(last).filter(function (k) { return last[k] === v; })[0];
      out.innerHTML = hit ? '<span class="tag ok">Match</span> The ' + hit + ' checksum matches. The file is intact.' : '<span class="tag bad">No match</span> None of the checksums match. Re-download the file, or check you copied the right checksum.';
    }
    var textRun = function () { var b = te.encode($('#h-text').value); run(b.buffer, 'text (' + b.length + ' bytes, UTF-8)'); };
    $('#h-text').addEventListener('input', textRun);
    $('#h-verify').addEventListener('input', verify);
    $('#h-file').addEventListener('change', function () { var f = this.files[0]; if (!f) return; f.arrayBuffer().then(function (b) { run(b, f.name + ' (' + f.size.toLocaleString() + ' bytes)'); }); });
    WG.$$('[data-hmode]').forEach(function (b) { b.addEventListener('click', function () {
      mode = b.getAttribute('data-hmode'); WG.$$('[data-hmode]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      $('#h-text-wrap').hidden = mode !== 'text'; $('#h-file-wrap').hidden = mode !== 'file';
      if (mode === 'text') textRun(); else { $('#h-out').innerHTML = '<dt>Waiting</dt><dd>Choose a file.</dd>'; $('#h-match').innerHTML = ''; }
    }); });
    textRun();
  }

  /* ================= JWT ================= */
  if (tool === 'jwt') {
    function b64urlDecode(s) {
      s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
      var bin = atob(s), bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return td.decode(bytes);
    }
    var CLAIMS = { iss: 'Issuer', sub: 'Subject', aud: 'Audience', exp: 'Expires', nbf: 'Not valid before', iat: 'Issued at', jti: 'Token ID', scope: 'Scope', azp: 'Authorized party', name: 'Name', email: 'Email' };
    function when(sec) { var d = new Date(sec * 1000), diff = sec - Date.now() / 1000, abs = Math.abs(diff), u = abs < 3600 ? Math.round(abs / 60) + ' min' : abs < 172800 ? Math.round(abs / 3600) + ' h' : Math.round(abs / 86400) + ' days'; return d.toLocaleString() + ' (' + (diff >= 0 ? 'in ' + u : u + ' ago') + ')'; }
    function go() {
      var raw = $('#jwt-in').value.trim().replace(/^Bearer\s+/i, ''), err = $('#jwt-err'); err.hidden = true;
      var parts = raw.split('.');
      try {
        if (parts.length < 2) throw new Error('A JWT has three parts separated by dots: header.payload.signature');
        var h = JSON.parse(b64urlDecode(parts[0])), p = JSON.parse(b64urlDecode(parts[1]));
        $('#jwt-h').textContent = JSON.stringify(h, null, 2); $('#jwt-p').textContent = JSON.stringify(p, null, 2);
        var now = Date.now() / 1000, rows = [['Algorithm', h.alg + (h.alg === 'none' ? ' — unsigned! Never accept this.' : '')], ['Type', h.typ || '—']];
        if (h.kid) rows.push(['Key ID', h.kid]);
        rows.push(['Status', p.exp ? (p.exp < now ? 'Expired' : (p.nbf && p.nbf > now ? 'Not valid yet' : 'Currently valid (by time)')) : 'No expiry set']);
        Object.keys(CLAIMS).forEach(function (k) { if (p[k] !== undefined) rows.push([CLAIMS[k] + ' (' + k + ')', /^(exp|nbf|iat)$/.test(k) && typeof p[k] === 'number' ? when(p[k]) : (typeof p[k] === 'object' ? JSON.stringify(p[k]) : String(p[k]))]); });
        $('#jwt-sum').innerHTML = rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
      } catch (e) {
        err.hidden = false; err.textContent = 'Couldn\u2019t decode this token: ' + e.message;
        $('#jwt-sum').innerHTML = ''; $('#jwt-h').textContent = ''; $('#jwt-p').textContent = '';
      }
    }
    $('#jwt-in').addEventListener('input', go); go();
  }

  /* ================= Encoder ================= */
  if (tool === 'encode') {
    function bytesToB64(b) { var s = ''; for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
    function b64ToBytes(s) { s = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var bin = atob(s), b = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }
    var HTML_ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    var ops = {
      b64: [function (s) { return bytesToB64(te.encode(s)); }, function (s) { return td.decode(b64ToBytes(s)); }],
      b64url: [function (s) { return bytesToB64(te.encode(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }, function (s) { return td.decode(b64ToBytes(s)); }],
      url: [encodeURIComponent, function (s) { return decodeURIComponent(s.replace(/\+/g, ' ')); }],
      urlall: [function (s) { return Array.from(te.encode(s)).map(function (b) { return '%' + b.toString(16).toUpperCase().padStart(2, '0'); }).join(''); }, function (s) { return decodeURIComponent(s); }],
      hex: [function (s) { return Array.from(te.encode(s)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(' '); },
        function (s) { var h = s.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, ''); if (h.length % 2) throw new Error('Hex needs an even number of digits.'); var b = new Uint8Array(h.length / 2); for (var i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return td.decode(b); }],
      html: [function (s) { return s.replace(/[&<>"']/g, function (c) { return HTML_ENT[c]; }).replace(/[\u00a0-\uffff]/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); },
        function (s) { var t = document.createElement('textarea'); t.innerHTML = s; return t.value; }],
      bin: [function (s) { return Array.from(te.encode(s)).map(function (b) { return b.toString(2).padStart(8, '0'); }).join(' '); },
        function (s) { var bits = s.replace(/[^01]/g, ''); if (bits.length % 8) throw new Error('Binary needs groups of 8 bits.'); var b = new Uint8Array(bits.length / 8); for (var i = 0; i < b.length; i++) b[i] = parseInt(bits.substr(i * 8, 8), 2); return td.decode(b); }]
    };
    function run(dir) {
      var err = $('#en-err'); err.hidden = true;
      try { $('#en-out').value = ops[$('#en-mode').value][dir]($('#en-in').value); }
      catch (e) { err.hidden = false; err.textContent = 'Couldn\u2019t ' + (dir ? 'decode' : 'encode') + ' that: ' + (e.message && e.message.indexOf('decode') > -1 ? 'it isn\u2019t valid UTF-8 text once decoded.' : (e.message || 'invalid input.')); }
    }
    $('#en-enc').addEventListener('click', function () { run(0); });
    $('#en-dec').addEventListener('click', function () { run(1); });
    $('#en-swap').addEventListener('click', function () { $('#en-in').value = $('#en-out').value; $('#en-out').value = ''; });
    $('#en-mode').addEventListener('change', function () { run(0); });
    run(0);
  }

  /* ================= UUID ================= */
  if (tool === 'uuid') {
    function fmt(b) { var h = Array.from(b).map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20); }
    function v4() { var b = cryptoObj.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80; return fmt(b); }
    var lastMs = 0, seq = 0;
    function v7() {
      var b = cryptoObj.getRandomValues(new Uint8Array(16)), ms = Date.now();
      if (ms <= lastMs) { ms = lastMs; seq++; } else { seq = b[7] & 0x0f; } lastMs = ms;  // keep order within the same millisecond
      for (var i = 5; i >= 0; i--) { b[i] = ms % 256; ms = Math.floor(ms / 256); }
      b[6] = 0x70 | ((seq >> 8) & 0x0f); b[7] = seq & 0xff; b[8] = (b[8] & 0x3f) | 0x80;
      return fmt(b);
    }
    function go() {
      var n = +$('#uu-n').value, ver = $('#uu-ver').value, c = $('#uu-case').value, out = [];
      for (var i = 0; i < n; i++) {
        var u = ver === '7' ? v7() : v4();
        if (c === 'upper') u = u.toUpperCase(); else if (c === 'braces') u = '{' + u + '}'; else if (c === 'nodash') u = u.replace(/-/g, '');
        out.push(u);
      }
      $('#uu-out').textContent = out.join('\n');
    }
    WG.$$('#uu-ver, #uu-n, #uu-case').forEach(function (el) { el.addEventListener('change', go); });
    $('#uu-go').addEventListener('click', go); go();
  }
})();
