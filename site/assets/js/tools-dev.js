/* Admin & developer tools: JSON, regex, chmod, cron, timestamp, diff, QR. */
(function () {
  'use strict';
  var WG = window.WG, $ = WG.$, esc = WG.esc;
  var host = document.querySelector('[data-tool]');
  var tool = host && host.getAttribute('data-tool');

  /* ================= JSON ================= */
  if (tool === 'json') {
    var inp = $('#js-in'), out = $('#js-out'), st = $('#js-status');
    function sortKeys(v) { if (Array.isArray(v)) return v.map(sortKeys); if (v && typeof v === 'object') { var o = {}; Object.keys(v).sort().forEach(function (k) { o[k] = sortKeys(v[k]); }); return o; } return v; }
    function pos(text, msg) {
      var m = /position (\d+)/i.exec(msg), lc = /line (\d+) column (\d+)/i.exec(msg);
      if (lc) return { line: +lc[1], col: +lc[2] };
      if (!m) return null; var p = +m[1], before = text.slice(0, p), line = before.split('\n').length, col = p - before.lastIndexOf('\n');
      return { line: line, col: col };
    }
    function run(mode) {
      var t = inp.value, ind = $('#js-indent').value; ind = ind === 'tab' ? '\t' : +ind;
      try {
        var v = JSON.parse(t); if (mode === 'sort') v = sortKeys(v);
        out.textContent = mode === 'min' ? JSON.stringify(v) : JSON.stringify(v, null, ind);
        var kind = Array.isArray(v) ? 'array of ' + v.length : v === null ? 'null' : typeof v === 'object' ? 'object with ' + Object.keys(v).length + ' keys' : typeof v;
        st.innerHTML = '<span class="tag ok">Valid JSON</span> <span class="small muted">' + esc(kind) + ' · ' + out.textContent.length.toLocaleString() + ' characters</span>';
      } catch (e) {
        var p = pos(t, e.message);
        st.innerHTML = '<span class="tag bad">Invalid</span> <span class="small">' + esc(e.message) + (p ? ' (line ' + p.line + ', column ' + p.col + ')' : '') + '</span>';
        if (p) { var lines = t.split('\n'), l = lines[p.line - 1] || ''; out.textContent = 'Line ' + p.line + ':\n' + l + '\n' + ' '.repeat(Math.max(0, p.col - 1)) + '^'; }
      }
    }
    WG.$$('[data-js]').forEach(function (b) { b.addEventListener('click', function () { run(b.getAttribute('data-js')); }); });
    inp.addEventListener('input', function () { run('pretty'); }); run('pretty');
  }

  /* ================= Regex ================= */
  if (tool === 'regex') {
    function run() {
      var err = $('#rx-err'); err.hidden = true;
      var flags = $('#rx-f').value.replace(/[^dgimsuyv]/g, ''), text = $('#rx-t').value, re;
      try { re = new RegExp($('#rx-p').value, flags.indexOf('g') > -1 ? flags : flags + 'g'); }
      catch (e) { err.hidden = false; err.textContent = e.message; $('#rx-hl').textContent = text; $('#rx-groups').innerHTML = ''; $('#rx-rep').textContent = ''; $('#rx-count').textContent = 'Matches'; return; }
      var matches = [], m, guard = 0;
      while ((m = re.exec(text)) && guard++ < 5000) { matches.push(m); if (m[0] === '') re.lastIndex++; if (flags.indexOf('g') < 0) break; }
      var html = '', last = 0;
      matches.forEach(function (x) { html += esc(text.slice(last, x.index)) + '<mark>' + (esc(x[0]) || '&#8203;') + '</mark>'; last = x.index + x[0].length; });
      $('#rx-hl').innerHTML = html + esc(text.slice(last));
      $('#rx-count').textContent = matches.length + ' match' + (matches.length === 1 ? '' : 'es');
      $('#rx-groups').innerHTML = matches.slice(0, 200).map(function (x, i) {
        var g = x.slice(1).map(function (v, j) { return '<code>$' + (j + 1) + '</code> ' + esc(v === undefined ? '(none)' : v); });
        if (x.groups) Object.keys(x.groups).forEach(function (k) { g.push('<code>' + esc(k) + '</code> ' + esc(x.groups[k])); });
        return '<tr><td>' + (i + 1) + '</td><td class="mono">' + esc(x[0]) + '</td><td class="mono">' + x.index + '</td><td class="mono">' + (g.join('<br>') || '—') + '</td></tr>';
      }).join('') || '<tr><td colspan="4" class="muted">No matches.</td></tr>';
      try { $('#rx-rep').textContent = text.replace(new RegExp($('#rx-p').value, flags), $('#rx-r').value); } catch (e) {}
    }
    WG.$$('#rx-p, #rx-f, #rx-t, #rx-r').forEach(function (el) { el.addEventListener('input', run); }); run();
  }

  /* ================= chmod ================= */
  if (tool === 'chmod') {
    var WHO = [['u', 'Owner'], ['g', 'Group'], ['o', 'Others']], BITS = [['r', 4], ['w', 2], ['x', 1]];
    $('#cm-table tbody').innerHTML = WHO.map(function (w) {
      return '<tr><th scope="row">' + w[1] + '</th>' + BITS.map(function (b) { return '<td><input type="checkbox" id="cm-' + w[0] + b[0] + '" aria-label="' + w[1] + ' ' + { r: 'read', w: 'write', x: 'execute' }[b[0]] + '"></td>'; }).join('') + '</tr>';
    }).join('');
    function fromBoxes() {
      var special = ($('#cm-suid').checked ? 4 : 0) + ($('#cm-sgid').checked ? 2 : 0) + ($('#cm-stky').checked ? 1 : 0);
      var digits = WHO.map(function (w) { return BITS.reduce(function (s, b) { return s + ($('#cm-' + w[0] + b[0]).checked ? b[1] : 0); }, 0); });
      return { special: special, digits: digits };
    }
    function toBoxes(st) {
      WHO.forEach(function (w, i) { BITS.forEach(function (b) { $('#cm-' + w[0] + b[0]).checked = !!(st.digits[i] & b[1]); }); });
      $('#cm-suid').checked = !!(st.special & 4); $('#cm-sgid').checked = !!(st.special & 2); $('#cm-stky').checked = !!(st.special & 1);
    }
    function symbolic(st) {
      var s = '';
      st.digits.forEach(function (d, i) {
        s += d & 4 ? 'r' : '-'; s += d & 2 ? 'w' : '-';
        var x = d & 1, sp = i === 0 ? st.special & 4 : i === 1 ? st.special & 2 : st.special & 1;
        s += sp ? (i === 2 ? (x ? 't' : 'T') : (x ? 's' : 'S')) : (x ? 'x' : '-');
      });
      return s;
    }
    function show(st, skip) {
      var oct = (st.special ? String(st.special) : '') + st.digits.join('');
      if (skip !== 'oct') $('#cm-oct').value = oct;
      if (skip !== 'sym') $('#cm-sym').value = symbolic(st);
      $('#cm-cmd').textContent = 'chmod ' + oct + ' filename';
      var say = function (d) { var a = []; if (d & 4) a.push('read'); if (d & 2) a.push('write'); if (d & 1) a.push('run/enter'); return a.length ? a.join(', ') : 'nothing'; };
      var ex = 'Owner can ' + say(st.digits[0]) + '. Group can ' + say(st.digits[1]) + '. Everyone else can ' + say(st.digits[2]) + '.';
      if (st.special & 4) ex += ' setuid: runs as the file\u2019s owner.'; if (st.special & 2) ex += ' setgid: runs as the group; new files in a folder inherit the group.'; if (st.special & 1) ex += ' Sticky: only owners can delete their own files in this folder (like /tmp).';
      if (st.digits[2] & 2) ex += ' ⚠ World-writable: anyone on the system can change it.';
      $('#cm-explain').textContent = ex;
    }
    host.addEventListener('change', function (e) { if (e.target.type === 'checkbox') show(fromBoxes()); });
    $('#cm-oct').addEventListener('input', function () {
      var v = this.value.trim(), err = $('#cm-err'); err.hidden = true;
      if (!/^[0-7]{3,4}$/.test(v)) { err.hidden = false; err.textContent = 'Octal is 3 or 4 digits from 0 to 7, like 644 or 2775.'; return; }
      var d = v.split('').map(Number), st = { special: d.length === 4 ? d[0] : 0, digits: d.slice(-3) };
      toBoxes(st); show(st, 'oct');
    });
    $('#cm-sym').addEventListener('input', function () {
      var v = this.value.trim().replace(/^[-dl]/, function (c) { return v.length === 10 ? '' : c; }), err = $('#cm-err'); err.hidden = true;
      if (v.length === 10) v = v.slice(1);
      if (!/^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(v)) { err.hidden = false; err.textContent = 'Symbolic looks like rwxr-xr-x (9 characters; s/S and t/T for special bits).'; return; }
      var st = { special: 0, digits: [0, 0, 0] };
      for (var i = 0; i < 3; i++) { var c = v.substr(i * 3, 3); st.digits[i] = (c[0] === 'r' ? 4 : 0) + (c[1] === 'w' ? 2 : 0) + (/[xst]/.test(c[2]) ? 1 : 0); if (/[sStT]/.test(c[2])) st.special |= [4, 2, 1][i]; }
      toBoxes(st); show(st, 'sym');
    });
    var PRE = [['644', 'Normal file'], ['600', 'Private file (SSH keys, .env)'], ['755', 'Script or folder'], ['700', 'Private folder (~/.ssh)'], ['775', 'Shared team folder'], ['2775', 'Shared folder, keeps group'], ['1777', '/tmp style'], ['440', 'sudoers file']];
    $('#cm-presets').innerHTML = PRE.map(function (p) { return '<button type="button" class="btn small" data-oct="' + p[0] + '">' + p[0] + ' · ' + esc(p[1]) + '</button>'; }).join('');
    $('#cm-presets').addEventListener('click', function (e) { var b = e.target.closest('[data-oct]'); if (!b) return; $('#cm-oct').value = b.getAttribute('data-oct'); $('#cm-oct').dispatchEvent(new Event('input')); });
    $('#cm-oct').dispatchEvent(new Event('input'));
  }

  /* ================= Cron ================= */
  if (tool === 'cron') {
    var MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    var DAYN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], MONN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var MACROS = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' };
    var SPEC = [['minute', 0, 59], ['hour', 0, 23], ['day of month', 1, 31], ['month', 1, 12, MONTHS], ['day of week', 0, 7, DAYS]];
    function field(str, i) {
      var s = SPEC[i], lo = s[1], hi = s[2], set = {}, names = s[3];
      str.split(',').forEach(function (part) {
        var m = /^(\*|[\w]+(?:-[\w]+)?)(?:\/(\d+))?$/i.exec(part); if (!m) throw new Error('"' + part + '" isn\u2019t valid in the ' + s[0] + ' field.');
        var val = function (t) { if (/^\d+$/.test(t)) return +t; var k = names ? names.indexOf(t.toUpperCase()) : -1; if (k < 0) throw new Error('"' + t + '" isn\u2019t valid in the ' + s[0] + ' field.'); return k + (i === 3 ? 1 : 0); };
        var a, b; if (m[1] === '*') { a = lo; b = hi; } else if (m[1].indexOf('-') > -1) { var r = m[1].split('-'); a = val(r[0]); b = val(r[1]); } else { a = val(m[1]); b = m[2] ? hi : a; }
        var step = m[2] ? +m[2] : 1; if (step < 1) throw new Error('A step must be 1 or more.');
        if (a < lo || b > hi || a > b) throw new Error('The ' + s[0] + ' must be between ' + lo + ' and ' + hi + '.');
        for (var v = a; v <= b; v += step) set[i === 4 && v === 7 ? 0 : v] = true;
      });
      return set;
    }
    function list(set) { return Object.keys(set).map(Number).sort(function (a, b) { return a - b; }); }
    function describe(raw, f, sets) {
      var min = f[0], hr = f[1];
      var pad = function (n) { return String(n).padStart(2, '0'); };
      var timeTxt;
      if (/^\d+$/.test(min) && /^\d+$/.test(hr)) timeTxt = 'at ' + pad(hr) + ':' + pad(min);
      else if (/^\d+$/.test(min) && hr === '*') timeTxt = 'at ' + min + ' minute' + (min === '1' ? '' : 's') + ' past every hour';
      else if (min === '*' && hr === '*') timeTxt = 'every minute';
      else if (/^\*\/\d+$/.test(min) && hr === '*') timeTxt = 'every ' + min.slice(2) + ' minutes';
      else {
        var mm = list(sets[0]), hh = list(sets[1]);
        var mtxt = min === '*' ? 'every minute' : /^\*\/\d+$/.test(min) ? 'every ' + min.slice(2) + ' minutes' : 'at minute ' + mm.join(', ');
        var htxt = hr === '*' ? '' : /^\d+-\d+$/.test(hr) ? ' between ' + pad(hh[0]) + ':00 and ' + pad(hh[hh.length - 1]) + ':59' : /^\*\/\d+$/.test(hr) ? ' every ' + hr.slice(2) + ' hours' : ' during hour' + (hh.length > 1 ? 's ' : ' ') + hh.join(', ');
        timeTxt = mtxt + htxt;
      }
      var parts = [timeTxt.charAt(0).toUpperCase() + timeTxt.slice(1)];
      if (f[2] !== '*') parts.push('on day ' + list(sets[2]).join(', ') + ' of the month');
      if (f[4] !== '*') { var dw = list(sets[4]); parts.push((f[2] !== '*' ? 'or ' : '') + 'on ' + (f[4] === '1-5' ? 'weekdays (Mon–Fri)' : f[4] === '0,6' || f[4] === '6,0' ? 'weekends' : dw.map(function (d) { return DAYN[d]; }).join(', '))); }
      if (f[3] !== '*') parts.push('in ' + list(sets[3]).map(function (m) { return MONN[m - 1]; }).join(', '));
      return parts.join(' ') + '.';
    }
    function next(sets, f, n) {
      var out = [], d = new Date(); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
      var domR = f[2] !== '*', dowR = f[4] !== '*';
      for (var guard = 0; out.length < n && guard < 600000; guard++) {
        if (!sets[3][d.getMonth() + 1]) { d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0, 0, 0); continue; }
        var dom = sets[2][d.getDate()], dow = sets[4][d.getDay()];
        var dayOk = domR && dowR ? (dom || dow) : domR ? dom : dowR ? dow : true;
        if (!dayOk) { d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); continue; }
        if (!sets[1][d.getHours()]) { d.setHours(d.getHours() + 1, 0, 0, 0); continue; }
        if (!sets[0][d.getMinutes()]) { d.setMinutes(d.getMinutes() + 1, 0, 0); continue; }
        out.push(new Date(d)); d.setMinutes(d.getMinutes() + 1);
      }
      return out;
    }
    function run() {
      var raw = $('#cr-in').value.trim(), err = $('#cr-err'); err.hidden = true;
      if (raw === '@reboot') { $('#cr-say').textContent = 'Once, every time the server starts up.'; $('#cr-next').textContent = '(runs at boot, not on a schedule)'; return; }
      var expr = MACROS[raw.toLowerCase()] || raw, f = expr.split(/\s+/);
      try {
        if (f.length === 6) throw new Error('That has 6 fields. Standard cron has 5. If the first is seconds (Quartz/Spring style), remove it. If the last is a command, leave it out here.');
        if (f.length !== 5) throw new Error('Cron needs exactly 5 fields: minute hour day-of-month month day-of-week.');
        var sets = f.map(field);
        $('#cr-say').textContent = describe(raw, f, sets);
        var times = next(sets, f, 8);
        $('#cr-next').textContent = times.length ? times.map(function (t) { return t.toLocaleString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }).join('\n') : 'This schedule never runs (for example, 31 February).';
      } catch (e) { err.hidden = false; err.textContent = e.message; $('#cr-say').textContent = ''; $('#cr-next').textContent = ''; }
    }
    var EX = [['0 3 * * *', 'Daily 3am backup'], ['*/5 * * * *', 'Every 5 minutes'], ['0 */6 * * *', 'Every 6 hours'], ['30 4 * * 0', 'Sunday 4:30am'], ['0 9 * * 1-5', 'Weekdays 9am'], ['0 0 1 * *', 'Monthly'], ['@reboot', 'At boot']];
    $('#cr-ex').innerHTML = EX.map(function (e) { return '<button type="button" class="btn small" data-cron="' + esc(e[0]) + '"><span class="mono">' + esc(e[0]) + '</span> · ' + esc(e[1]) + '</button>'; }).join('');
    $('#cr-ex').addEventListener('click', function (e) { var b = e.target.closest('[data-cron]'); if (b) { $('#cr-in').value = b.getAttribute('data-cron'); run(); } });
    $('#cr-in').addEventListener('input', run); run();
  }

  /* ================= Timestamp ================= */
  if (tool === 'timestamp') {
    function rel(ms) { var s = (ms - Date.now()) / 1000, a = Math.abs(s), u = a < 60 ? Math.round(a) + ' seconds' : a < 3600 ? Math.round(a / 60) + ' minutes' : a < 86400 ? Math.round(a / 3600) + ' hours' : a < 86400 * 365 ? Math.round(a / 86400) + ' days' : (a / 86400 / 365.25).toFixed(1) + ' years'; return s >= 0 ? 'in ' + u : u + ' ago'; }
    function rows(ms) {
      var d = new Date(ms);
      if (isNaN(d)) return '<dt>Result</dt><dd>Not a valid date.</dd>';
      var r = [['Local', d.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })], ['UTC', d.toUTCString()], ['ISO 8601', d.toISOString()], ['Unix seconds', Math.floor(ms / 1000)], ['Unix milliseconds', ms], ['Relative', rel(ms)]];
      return r.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + esc(x[1]) + ' <button type="button" class="btn small ghost" data-copy="' + esc(x[1]) + '">copy</button></dd>'; }).join('');
    }
    function tick() { var n = Date.now(); $('#ts-now').textContent = Math.floor(n / 1000); $('#ts-now-ms').textContent = n + ' ms · ' + new Date(n).toISOString(); }
    setInterval(tick, 1000); tick();
    function fromNum() {
      var v = $('#ts-in').value.trim().replace(/[,_\s]/g, ''); if (!/^-?\d+(\.\d+)?$/.test(v)) { $('#ts-out').innerHTML = '<dt>Result</dt><dd>Type a number like 1792459476.</dd>'; return; }
      var n = +v, ms = Math.abs(n) >= 1e14 ? n / 1000 : Math.abs(n) >= 1e11 ? n : n * 1000; // µs, ms, s
      $('#ts-out').innerHTML = '<dt>Read as</dt><dd>' + (Math.abs(n) >= 1e14 ? 'microseconds' : Math.abs(n) >= 1e11 ? 'milliseconds' : 'seconds') + '</dd>' + rows(Math.round(ms));
    }
    $('#ts-in').addEventListener('input', fromNum); fromNum();
    var dl = $('#ts-date'), now = new Date(); now.setSeconds(0, 0);
    dl.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
    function fromDate(v) { var ms = new Date(v).getTime(); $('#ts-back').innerHTML = rows(ms); }
    dl.addEventListener('input', function () { fromDate(dl.value); });
    $('#ts-iso').addEventListener('input', function () { if (this.value.trim()) fromDate(this.value.trim()); });
    fromDate(dl.value);
  }

  /* ================= Diff (Myers / LCS line diff) ================= */
  if (tool === 'diff') {
    function lcsDiff(a, b, norm) {
      var n = a.length, m = b.length, A = a.map(norm), Bn = b.map(norm);
      if (n * m > 4e6) return null;
      var dp = []; for (var i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
      for (i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) dp[i][j] = A[i] === Bn[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      var out = []; i = 0; j = 0;
      while (i < n && j < m) { if (A[i] === Bn[j]) { out.push([' ', a[i]]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(['-', a[i]]); i++; } else { out.push(['+', b[j]]); j++; } }
      while (i < n) out.push(['-', a[i++]]); while (j < m) out.push(['+', b[j++]]);
      return out;
    }
    function run() {
      var ws = $('#df-ws').checked, ci = $('#df-case').checked;
      var norm = function (s) { if (ws) s = s.replace(/\s+$/, ''); if (ci) s = s.toLowerCase(); return s; };
      var res = lcsDiff($('#df-a').value.split('\n'), $('#df-b').value.split('\n'), norm);
      if (!res) { $('#df-out').textContent = 'Those texts are too long to compare here (over about 2,000 lines each).'; return; }
      var add = 0, del = 0;
      $('#df-out').innerHTML = res.map(function (r) { if (r[0] === '+') add++; if (r[0] === '-') del++; return '<span class="diff-line ' + (r[0] === '+' ? 'diff-add' : r[0] === '-' ? 'diff-del' : '') + '">' + r[0] + ' ' + esc(r[1]) + '</span>'; }).join('');
      $('#df-sum').textContent = add || del ? '+' + add + ' added · −' + del + ' removed · ' + (res.length - add - del) + ' unchanged' : 'The two texts are identical.';
    }
    WG.$$('#df-a, #df-b, #df-ws, #df-case').forEach(function (el) { el.addEventListener('input', run); }); run();
  }

  /* ================= QR generator ================= */
  if (tool === 'qr') {
    var mode = 'text', current = '';
    function wifiEsc(s) { return s.replace(/([\\;,:"])/g, '\\$1'); }
    function payload() {
      if (mode === 'text') return $('#qr-text').value;
      var sec = $('#qr-sec').value;
      return 'WIFI:T:' + sec + ';S:' + wifiEsc($('#qr-ssid').value) + ';' + (sec !== 'nopass' ? 'P:' + wifiEsc($('#qr-pass').value) + ';' : '') + ($('#qr-hidden').checked ? 'H:true;' : '') + ';';
    }
    function draw() {
      current = payload();
      if (!current || (mode === 'wifi' && !$('#qr-ssid').value)) { $('#qr-out').innerHTML = ''; $('#qr-info').textContent = mode === 'wifi' ? 'Type your network name.' : 'Type something to encode.'; return; }
      try {
        $('#qr-out').innerHTML = WG.qrSvg(current, { ecc: $('#qr-ecc').value, label: 'QR code' });
        $('#qr-info').textContent = new TextEncoder().encode(current).length + ' bytes encoded';
      } catch (e) { $('#qr-out').innerHTML = ''; $('#qr-info').textContent = 'That\u2019s too much data for one QR code. Try shorter text or lower error correction.'; }
    }
    WG.$$('[data-qrm]').forEach(function (b) { b.addEventListener('click', function () {
      mode = b.getAttribute('data-qrm'); WG.$$('[data-qrm]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      $('#qr-text-wrap').hidden = mode !== 'text'; $('#qr-wifi-wrap').hidden = mode !== 'wifi'; draw();
    }); });
    host.addEventListener('input', draw);
    $('#qr-svg').addEventListener('click', function () { var s = $('#qr-out').innerHTML; if (s) WG.downloadText('qr-code.svg', s, 'image/svg+xml'); });
    $('#qr-png').addEventListener('click', function () {
      var svg = $('#qr-out svg'); if (!svg) return;
      var img = new Image(), size = 1024;
      img.onload = function () { var c = document.createElement('canvas'); c.width = c.height = size; var x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0, size, size);
        c.toBlob(function (b) { var u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = 'qr-code.png'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 500); }); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.outerHTML);
    });
    draw();
  }
})();
