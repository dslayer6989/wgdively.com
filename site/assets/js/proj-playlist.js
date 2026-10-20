/* Playlist toolkit: open an M3U (and optionally an XMLTV guide), see what's in it,
   clean it up and save a new copy. Everything happens in the browser; files are
   never uploaded. Large files are fine (tested with 50,000 channels). */
(function () {
  'use strict';
  var WG = window.WG, $ = WG.$, esc = WG.esc;
  if (!$('#pl-tool')) return;

  var channels = [], header = '#EXTM3U', guideIds = null, guideNames = null;

  function attr(line, name) {
    var m = line.match(new RegExp(name + '="([^"]*)"', 'i'));
    return m ? m[1] : '';
  }
  function parseM3U(text) {
    var lines = text.replace(/^\uFEFF/, '').split(/\r?\n/), out = [], cur = null, extra = [];
    header = /^#EXTM3U/i.test(lines[0] || '') ? lines[0].trim() : '#EXTM3U';
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i].trim();
      if (!l || /^#EXTM3U/i.test(l)) continue;
      if (/^#EXTINF/i.test(l)) {
        // Strip the key="value" attributes first, so commas or quotes inside them (or in the name) can't confuse things.
        var bare = l.replace(/^#EXTINF:\s*-?\d+(\.\d+)?/i, '').replace(/\s*[\w-]+="[^"]*"/g, '');
        var comma = bare.indexOf(',');
        cur = { inf: l, name: comma > -1 ? bare.slice(comma + 1).trim() : '', id: attr(l, 'tvg-id'), group: attr(l, 'group-title'), logo: attr(l, 'tvg-logo'), extra: [] };
        extra = [];
      } else if (l.charAt(0) === '#') {
        if (cur) cur.extra.push(l); // #EXTVLCOPT, #EXTGRP, #KODIPROP…
      } else {
        if (cur) { cur.url = l; out.push(cur); cur = null; }
        else out.push({ inf: '#EXTINF:-1,' + l, name: l, id: '', group: '', logo: '', extra: [], url: l });
      }
    }
    return out;
  }
  function parseGuide(text) {
    var ids = new Set(), names = new Map(), re = /<channel\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/g, m;
    while ((m = re.exec(text))) {
      ids.add(m[1]);
      var d = m[2].match(/<display-name[^>]*>([^<]+)<\/display-name>/);
      if (d) names.set(d[1].trim().toLowerCase(), m[1]);
    }
    var progs = (text.match(/<programme\b/g) || []).length;
    return { ids: ids, names: names, progs: progs };
  }

  function readFile(input, cb) {
    var f = input.files && input.files[0]; if (!f) return;
    if (/\.gz$/i.test(f.name)) {
      if (!window.DecompressionStream) { WG.toast('This browser can\u2019t open .gz files. Unzip it first.'); return; }
      new Response(f.stream().pipeThrough(new DecompressionStream('gzip'))).text().then(function (t) { cb(t, f.name); });
    } else f.text().then(function (t) { cb(t, f.name); });
  }
  function fetchUrl(url, cb) {
    var st = $('#pl-status');
    st.textContent = 'Fetching\u2026';
    fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return /\.gz($|\?)/i.test(url) && window.DecompressionStream ? new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text() : r.text(); })
      .then(function (t) { st.textContent = ''; cb(t, url); })
      .catch(function (e) { st.textContent = 'Couldn\u2019t fetch that link (' + e.message + '). Many providers block this; download the file and open it instead.'; });
  }

  function normUrl(u) { return u.trim().replace(/\/+$/, ''); }
  function apply() {
    var opts = {
      dupUrl: $('#pl-dup-url').checked, dupName: $('#pl-dup-name').checked,
      bad: $('#pl-bad').checked, sort: $('#pl-sort').value, q: $('#pl-q').value.trim().toLowerCase(),
      groups: new Set(Array.prototype.map.call(document.querySelectorAll('#pl-groups input:not(:checked)'), function (i) { return i.value; }))
    };
    var seenU = new Set(), seenN = new Set(), out = [], removed = { dup: 0, bad: 0, group: 0, q: 0 };
    channels.forEach(function (c) {
      if (opts.groups.has(c.group || '(no group)')) { removed.group++; return; }
      if (opts.q && (c.name + ' ' + c.group + ' ' + c.id).toLowerCase().indexOf(opts.q) === -1) { removed.q++; return; }
      if (opts.bad && !/^(https?|rtmps?|rtsp|udp|rtp|mms):\/\//i.test(c.url)) { removed.bad++; return; }
      var u = normUrl(c.url), n = c.name.toLowerCase();
      if (opts.dupUrl && seenU.has(u)) { removed.dup++; return; }
      if (opts.dupName && seenN.has(n)) { removed.dup++; return; }
      seenU.add(u); seenN.add(n); out.push(c);
    });
    if (opts.sort === 'name') out.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); });
    if (opts.sort === 'group') out.sort(function (a, b) { return (a.group || '\uffff').localeCompare(b.group || '\uffff') || a.name.localeCompare(b.name, undefined, { numeric: true }); });
    return { list: out, removed: removed };
  }

  function guideState(c) {
    if (!guideIds) return '';
    if (c.id && guideIds.has(c.id)) return 'ok';
    if (!c.id && guideNames.has(c.name.toLowerCase())) return 'name';
    return 'missing';
  }

  function render() {
    if (!channels.length) return;
    var r = apply(), list = r.list;
    $('#pl-out').hidden = false;
    var groups = new Set(channels.map(function (c) { return c.group || '(no group)'; }));
    var noId = channels.filter(function (c) { return !c.id; }).length;
    var stats = ['<span class="tag accent">' + channels.length.toLocaleString() + ' in file</span>', '<span class="tag">' + groups.size + ' groups</span>', '<span class="tag ok">' + list.length.toLocaleString() + ' kept</span>'];
    if (r.removed.dup) stats.push('<span class="tag">' + r.removed.dup + ' duplicates removed</span>');
    if (r.removed.bad) stats.push('<span class="tag">' + r.removed.bad + ' bad links removed</span>');
    if (r.removed.group) stats.push('<span class="tag">' + r.removed.group + ' in hidden groups</span>');
    if (noId) stats.push('<span class="tag bad">' + noId + ' without tvg-id</span>');
    if (guideIds) {
      var g = { ok: 0, name: 0, missing: 0 }; list.forEach(function (c) { g[guideState(c)]++; });
      stats.push('<span class="tag ok">' + g.ok + ' match the guide</span>');
      if (g.name) stats.push('<span class="tag">' + g.name + ' match by name only</span>');
      if (g.missing) stats.push('<span class="tag bad">' + g.missing + ' not in the guide</span>');
    }
    $('#pl-stats').innerHTML = stats.join('');
    var show = list.slice(0, 500);
    $('#pl-rows').innerHTML = show.map(function (c) {
      var gs = guideState(c);
      return '<tr><td>' + esc(c.name || '(no name)') + '</td><td>' + esc(c.group || '') + '</td><td class="mono">' + esc(c.id || '') + '</td>' +
        (guideIds ? '<td>' + (gs === 'ok' ? '<span class="tag ok">Yes</span>' : gs === 'name' ? '<span class="tag">By name</span>' : '<span class="tag bad">No</span>') + '</td>' : '') + '</tr>';
    }).join('');
    $('#pl-guide-col').hidden = !guideIds;
    $('#pl-more').textContent = list.length > 500 ? 'Showing the first 500 of ' + list.length.toLocaleString() + '. The saved file includes all of them.' : '';
  }

  function buildGroups() {
    var counts = new Map();
    channels.forEach(function (c) { var g = c.group || '(no group)'; counts.set(g, (counts.get(g) || 0) + 1); });
    var arr = Array.from(counts).sort(function (a, b) { return a[0].localeCompare(b[0]); });
    $('#pl-groups').innerHTML = '<legend>Groups to keep (' + arr.length + ')</legend>' + arr.map(function (g) {
      return '<label class="check"><input type="checkbox" value="' + esc(g[0]) + '" checked><span>' + esc(g[0]) + ' <span class="muted small">' + g[1] + '</span></span></label>';
    }).join('');
  }

  function loadPlaylist(text, name) {
    channels = parseM3U(text);
    if (!channels.length) { $('#pl-status').textContent = 'No channels found. Is this an M3U playlist?'; return; }
    $('#pl-status').textContent = 'Opened ' + name.split('/').pop() + '.';
    buildGroups(); render();
  }
  function loadGuide(text, name) {
    var g = parseGuide(text);
    if (!g.ids.size) { $('#pl-gstatus').textContent = 'No channels found. Is this an XMLTV guide?'; return; }
    guideIds = g.ids; guideNames = g.names;
    $('#pl-gstatus').textContent = name.split('/').pop() + ': ' + g.ids.size.toLocaleString() + ' channels, ' + g.progs.toLocaleString() + ' programmes.';
    render();
  }

  $('#pl-file').addEventListener('change', function () { readFile(this, loadPlaylist); });
  $('#pl-gfile').addEventListener('change', function () { readFile(this, loadGuide); });
  $('#pl-fetch').addEventListener('click', function () { var u = $('#pl-url').value.trim(); if (u) fetchUrl(u, loadPlaylist); });
  $('#pl-paste-go').addEventListener('click', function () { var t = $('#pl-paste').value; if (t.trim()) loadPlaylist(t, 'pasted playlist'); });
  $('#pl-tool').addEventListener('change', function (e) { if (!e.target.closest('#pl-load')) render(); });
  $('#pl-q').addEventListener('input', render);
  $('#pl-all').addEventListener('click', function () { document.querySelectorAll('#pl-groups input').forEach(function (i) { i.checked = true; }); render(); });
  $('#pl-none').addEventListener('click', function () { document.querySelectorAll('#pl-groups input').forEach(function (i) { i.checked = false; }); render(); });
  $('#pl-save').addEventListener('click', function () {
    var list = apply().list;
    var text = header + '\n' + list.map(function (c) { return [c.inf].concat(c.extra, [c.url]).join('\n'); }).join('\n') + '\n';
    WG.downloadText('playlist-cleaned.m3u', text, 'audio/x-mpegurl');
  });
  $('#pl-missing').addEventListener('click', function () {
    var list = apply().list.filter(function (c) { return guideIds ? guideState(c) === 'missing' : !c.id; });
    WG.downloadText('channels-missing-guide.csv', 'name,group,tvg-id\n' + list.map(function (c) { return [c.name, c.group, c.id].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n') + '\n', 'text/csv');
  });
})();
