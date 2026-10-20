/* Downloads page.
   1. Paints instantly from /data/releases.json (a snapshot saved at build time).
   2. Then asks the GitHub API for anything newer and re-paints if something changed.
   Files come straight from GitHub's file servers, which send them as attachments, so
   clicking Download saves the file and the visitor never leaves this page.
   QR codes point at wgdively.com/dl/…, which starts the same download on a phone. */
(function () {
  'use strict';
  var WG = window.WG, $ = WG.$, esc = WG.esc;
  var OWNER = 'dslayer6989';
  var CACHE_KEY = 'wg-releases-v1';

  var PRODUCTS = [
    { repo: 'NuvioDesktop', id: 'nuvio-live-tv', title: 'Nuvio Live TV', kicker: 'Android · Android TV · Windows',
      blurb: 'The main Nuvio app for phones, tablets, Android TV boxes, Fire TV and Windows PCs. Movies, TV shows, anime and live TV in one place.',
      alpha: true },
    { repo: 'NuvioTVSmart', id: 'nuvio-smart-tv', title: 'Nuvio TV for Smart TVs', kicker: 'Samsung Tizen · LG webOS',
      blurb: 'Builds for Samsung and LG smart TVs. Every build comes in two versions: one for 2021-and-newer Samsung TVs (plus LG webOS), and a legacy one for 2018–2020 Samsung TVs.',
      paired: true },
    { repo: 'NuvioTVSmart-Installer', id: 'nuvio-tv-installer', title: 'Nuvio TV Installer', kicker: 'Windows · Linux',
      blurb: 'A desktop helper that signs and installs the Smart TV build onto your Samsung or LG TV over your home network. Samsung builds are unsigned on purpose; the installer signs them for your TV.' },
    { repo: 'NuvioTV', id: 'nuvio-android-tv', title: 'Nuvio TV for Android TV', kicker: 'Android TV · Google TV',
      blurb: 'A dedicated big-screen build for Android TV and Google TV devices.' }
  ];

  var LABELS = [
    [/Android-phone\.apk$/i, 'Android phones & tablets', 'Most phones and tablets from the last several years.'],
    [/Android-TV\.apk$/i, 'Android TV · Google TV · Fire TV', 'TV boxes, sticks and TVs running Android.'],
    [/older-32bit\.apk$/i, 'Older Android (32-bit)', 'Older or budget devices that won\'t install the phone build.'],
    [/x86_64\.apk$/i, 'Android x86_64', 'Emulators and Intel/AMD Android PCs (64-bit).'],
    [/x86\.apk$/i, 'Android x86', 'Emulators and older Intel/AMD Android devices (32-bit).'],
    [/Windows\.msi$/i, 'Windows installer', 'Windows 10 and 11 PCs.'],
    [/Tizen6.*\.wgt$/i, 'Samsung TV · 2021 and newer', 'Tizen 6.0 or newer. Install it with the Nuvio TV Installer.'],
    [/Tizen5\.5.*Legacy.*\.wgt$|Legacy.*\.wgt$/i, 'Samsung TV · 2018–2020', 'Tizen 4.0–5.5. Install it with the Nuvio TV Installer.'],
    [/webOS.*\.ipk$/i, 'LG TV (webOS)', 'Install it with the Nuvio TV Installer or webOS Dev Manager.'],
    [/\.AppImage$/i, 'Linux (AppImage)', 'Make it executable, then run it.'],
    [/\.exe$/i, 'Windows', 'Windows 10 and 11.'],
    [/\.dmg$/i, 'macOS', ''],
    [/\.apk$/i, 'Android', ''],
    [/\.zip$/i, 'Zip archive', '']
  ];
  function label(name) {
    for (var i = 0; i < LABELS.length; i++) if (LABELS[i][0].test(name)) return { title: LABELS[i][1], note: LABELS[i][2] };
    return { title: name, note: '' };
  }
  // Every file is served from wgdively.com/get/…: the site's own server passes the
  // GitHub release file through, so visitors never see or visit GitHub.
  function filePath(repo, tag, name) {
    return '/get/' + encodeURIComponent(repo) + '/' + encodeURIComponent(tag) + '/' + encodeURIComponent(name);
  }
  function fileUrl(repo, tag, name) { return filePath(repo, tag, name); }
  // QR codes always use the public address, so a phone can scan them even from the private preview.
  function qrUrl(repo, tag, name) { return 'https://wgdively.com' + filePath(repo, tag, name); }
  function size(b) {
    if (!b && b !== 0) return '';
    var u = ['B', 'KB', 'MB', 'GB'], i = 0; while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return (i ? b.toFixed(b < 10 ? 1 : 0) : b) + ' ' + u[i];
  }
  function date(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return iso.slice(0, 10); }
  }
  function buildNo(tag) { var m = /build-(\d+)/i.exec(tag); return m ? +m[1] : null; }

  /* tiny, safe markdown for release notes */
  function md(src) {
    var lines = esc(src || '').replace(/\r/g, '').split('\n'), out = [], i = 0;
    function inline(s) {
      return s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener nofollow">$1</a>');
    }
    while (i < lines.length) {
      var l = lines[i];
      if (/^\s*\|.*\|\s*$/.test(l)) {
        var rows = []; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
        var cells = function (r) { return r.trim().replace(/^\||\|$/g, '').split('|').map(function (c) { return inline(c.trim()); }); };
        var head = cells(rows[0]), body = rows.slice(/^[\s|:-]+$/.test(rows[1] || '') ? 2 : 1);
        out.push('<div class="table-wrap"><table><thead><tr>' + head.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
          body.map(function (r) { return '<tr>' + cells(r).map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>');
        continue;
      }
      if (/^#{1,6}\s/.test(l)) { out.push('<p><strong>' + inline(l.replace(/^#+\s*/, '')) + '</strong></p>'); i++; continue; }
      if (/^\s*[-*]\s+/.test(l)) {
        var items = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push('<li>' + inline(lines[i].replace(/^\s*[-*]\s+/, '')) + '</li>'); i++; }
        out.push('<ul>' + items.join('') + '</ul>'); continue;
      }
      if (!l.trim()) { i++; continue; }
      var para = []; while (i < lines.length && lines[i].trim() && !/^\s*(\||#|[-*]\s)/.test(lines[i])) { para.push(inline(lines[i])); i++; }
      out.push('<p>' + para.join('<br>') + '</p>');
    }
    return out.join('');
  }

  var ICON_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 21h16"/></svg>';
  var ICON_QR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4"/></svg>';

  function assetRow(repo, rel, a) {
    var lb = label(a.name);
    var digest = a.digest && /^sha256:/.test(a.digest) ? a.digest.slice(7) : '';
    return '<li class="asset">' +
      '<div><div class="asset-name">' + esc(lb.title) + '</div>' +
      '<div class="asset-file">' + esc(a.name) + ' · ' + esc(size(a.size)) + '</div>' +
      (lb.note ? '<div class="small muted">' + esc(lb.note) + '</div>' : '') +
      (digest ? '<div class="asset-file">SHA-256 <button type="button" class="btn small ghost" data-copy="' + esc(digest) + '" data-copy-label="Checksum copied" title="Copy the SHA-256 checksum. Check it with the File Hash tool.">copy</button></div>' : '') +
      '</div>' +
      '<div class="btn-row">' +
      '<a class="btn primary" href="' + esc(fileUrl(repo, rel.tag, a.name)) + '" download="' + esc(a.name) + '" rel="nofollow" aria-label="Download ' + esc(lb.title + ' (' + a.name + ')') + '">' + ICON_DL + 'Download</a>' +
      '<button type="button" class="btn" data-qr-repo="' + esc(repo) + '" data-qr-tag="' + esc(rel.tag) + '" data-qr-file="' + esc(a.name) + '" data-qr-title="' + esc(lb.title) + '" aria-label="Show QR code for ' + esc(lb.title) + '">' + ICON_QR + 'QR</button>' +
      '</div></li>';
  }

  function releaseCard(p, rel, opts) {
    opts = opts || {};
    var legacy = /legacy/i.test(rel.tag);
    var heading = opts.heading || rel.name || rel.tag;
    return '<article class="release' + (opts.latest ? ' latest' : '') + '">' +
      '<div class="release-head"><div><h3>' + esc(heading) + '</h3><div class="sub">' + esc(rel.tag) + ' · ' + esc(date(rel.published)) + '</div></div>' +
      '<div class="tags">' + (opts.latest ? '<span class="tag accent">Latest</span>' : '') + (legacy ? '<span class="tag">Legacy</span>' : '') +
      (rel.prerelease ? '<span class="tag bad">Pre-release</span>' : '') + (p.alpha ? '<span class="tag">Alpha · testers</span>' : '') + '</div></div>' +
      (rel.assets.length ? '<ul class="assets">' + rel.assets.map(function (a) { return assetRow(p.repo, rel, a); }).join('') + '</ul>'
        : '<p class="small muted" style="padding:1rem 1.5rem;margin:0">This release has no files attached.</p>') +
      (rel.body && rel.body.trim() ? '<details class="notes"><summary>Release notes</summary><div class="md">' + md(rel.body) + '</div></details>' : '') +
      '</article>';
  }

  function groupPaired(list) {
    var groups = {}, order = [];
    list.forEach(function (r) {
      var key = r.tag.replace(/-legacy$/i, '');
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(r);
    });
    order.sort(function (a, b) { return (buildNo(b) || 0) - (buildNo(a) || 0); });
    return order.map(function (k) {
      return groups[k].sort(function (a, b) { return /legacy/i.test(a.tag) - /legacy/i.test(b.tag); });
    });
  }
  function pairTitle(r) { return /legacy/i.test(r.tag) ? 'Samsung 2018–2020 (legacy)' : 'Samsung 2021+ and LG webOS'; }

  function renderProduct(p, list) {
    var html = '<section class="product reveal in" id="' + p.id + '" data-section="' + esc(p.title) + '">' +
      '<div class="product-head"><p class="eyebrow">' + esc(p.kicker) + '</p><h2>' + esc(p.title) + '</h2><p>' + esc(p.blurb) + '</p></div>';
    if (!list || !list.length) {
      html += '<div class="callout"><p><strong>Coming soon.</strong> No builds have been published yet. This section fills in on its own as soon as one is.</p></div></section>';
      return html;
    }
    list = list.slice().sort(function (a, b) { return new Date(b.published) - new Date(a.published); });
    if (p.paired) {
      var groups = groupPaired(list), first = groups[0], rest = groups.slice(1);
      html += '<div class="build-group"><p class="label">Build ' + esc(buildNo(first[0].tag) || first[0].tag) + ' · both versions</p><div class="release-pair">' +
        first.map(function (r) { return releaseCard(p, r, { latest: true, heading: pairTitle(r) }); }).join('') + '</div></div>';
      if (rest.length) {
        html += '<details class="older"><summary>Older builds (' + rest.length + ')</summary>' + rest.map(function (g) {
          return '<div class="build-group"><p class="label">Build ' + esc(buildNo(g[0].tag) || g[0].tag) + '</p><div class="release-pair">' +
            g.map(function (r) { return releaseCard(p, r, { heading: pairTitle(r) }); }).join('') + '</div></div>';
        }).join('') + '</details>';
      }
    } else {
      html += releaseCard(p, list[0], { latest: true });
      if (list.length > 1) html += '<details class="older"><summary>Older builds (' + (list.length - 1) + ')</summary>' + list.slice(1).map(function (r) { return releaseCard(p, r); }).join('') + '</details>';
    }
    return html + '</section>';
  }

  var root = $('#releases'), stamp = $('#releases-stamp'), lastSig = '';
  function paint(data, source) {
    if (!data || !data.repos) return;
    var sig = JSON.stringify(PRODUCTS.map(function (p) { return (data.repos[p.repo] || []).map(function (r) { return r.tag + r.assets.map(function (a) { return a.name + a.size; }).join(); }); }));
    if (sig !== lastSig) {
      var openIds = WG.$$('details[open]', root).map(function (d, i) { return i; });
      root.innerHTML = PRODUCTS.map(function (p) { return renderProduct(p, data.repos[p.repo]); }).join('');
      lastSig = sig;
      if (location.hash && source !== 'live') { var t = $(location.hash); if (t) t.scrollIntoView(); }
    }
    if (stamp) stamp.textContent = (source === 'live' ? 'Checked with GitHub ' : 'Saved list from ') + date(data.generated) + (source === 'live' ? ' · up to date' : ' · checking for newer builds…');
  }

  function normalize(repo, list) {
    return list.filter(function (r) { return !r.draft; }).map(function (r) {
      return { tag: r.tag_name, name: r.name || r.tag_name, published: r.published_at, prerelease: r.prerelease, body: (r.body || '').slice(0, 4000),
        assets: r.assets.map(function (a) { return { name: a.name, size: a.size, updated: a.updated_at, digest: a.digest || null }; }) };
    });
  }
  function live() {
    return Promise.all(PRODUCTS.map(function (p) {
      return fetch('https://api.github.com/repos/' + OWNER + '/' + p.repo + '/releases?per_page=100', { headers: { Accept: 'application/vnd.github+json' } })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (list) { return [p.repo, normalize(p.repo, list)]; });
    })).then(function (pairs) {
      var repos = {}; pairs.forEach(function (x) { repos[x[0]] = x[1]; });
      var data = { generated: new Date().toISOString(), repos: repos };
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
      return data;
    });
  }

  // 1) fastest: this visit's cached live copy, else the build-time snapshot
  var cached = null; try { cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null'); } catch (e) {}
  if (cached) paint(cached, 'live');
  var snap = cached ? Promise.resolve() : fetch('/data/releases.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) { paint(d, 'snapshot'); }).catch(function () {});
  // 2) then the live check (skipped if this visit already did it in the last 5 minutes)
  var fresh = cached && (Date.now() - new Date(cached.generated).getTime() < 5 * 60 * 1000);
  if (!fresh) snap.then(live).then(function (d) { paint(d, 'live'); }).catch(function () {
    if (stamp && !lastSig) stamp.textContent = 'Couldn\'t reach GitHub just now. Try reloading in a minute.';
    else if (stamp) stamp.textContent = stamp.textContent.replace(' · checking for newer builds…', ' · GitHub didn\'t answer, showing the saved list');
  });

  /* QR dialog */
  var dlg = $('#qr-dialog');
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-qr-file]'); if (!b || !dlg) return;
    var url = qrUrl(b.getAttribute('data-qr-repo'), b.getAttribute('data-qr-tag'), b.getAttribute('data-qr-file'));
    $('#qr-title', dlg).textContent = b.getAttribute('data-qr-title');
    $('#qr-file', dlg).textContent = b.getAttribute('data-qr-file');
    $('#qr-box', dlg).innerHTML = WG.qrSvg(url, { label: 'QR code that downloads ' + b.getAttribute('data-qr-file') });
    $('#qr-url', dlg).textContent = url;
    $('#qr-copy', dlg).setAttribute('data-copy', url);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  });
  if (dlg) {
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
  }
})();
