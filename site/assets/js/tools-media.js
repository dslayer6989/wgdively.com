/* Streaming tools: Nuvio picker, bitrate & file size, resolution & aspect ratio. */
(function () {
  'use strict';
  var WG = window.WG, $ = WG.$, esc = WG.esc;
  var host = document.querySelector('[data-tool]');
  var tool = host && host.getAttribute('data-tool');

  /* ================= Which Nuvio do I need? ================= */
  if (tool === 'nuvio-picker') {
    var data = null, dev = null, sub = null;
    fetch('/data/releases.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) { data = d; show(); }).catch(function () {});
    var Q2 = {
      phone: ['Is it fairly recent (from about 2017 onward)?', [['new', 'Yes, or not sure', 'Most phones'], ['old', 'No, it\u2019s old or very cheap', '32-bit Android']]],
      androidtv: null, firetv: null, windows: null, lg: null, emulator: ['Which kind?', [['x64', '64-bit (most emulators, modern PCs)', 'x86_64'], ['x86', '32-bit / very old', 'x86']]],
      samsung: ['What year is the TV? (Settings › Support › About This TV shows the model; the 2nd letter after the size often gives the year)', [['2021', '2021 or newer', 'Tizen 6.0+'], ['2018', '2018 to 2020', 'Tizen 4.0–5.5 (legacy)'], ['older', '2017 or older', 'Tizen 3 or older']]],
      other: null
    };
    function latest(repo, test) {
      var list = data && data.repos && data.repos[repo] || [];
      for (var i = 0; i < list.length; i++) { if (test && !test(list[i])) continue; return list[i]; }
      return null;
    }
    function findAsset(rel, re) { if (!rel) return null; for (var i = 0; i < rel.assets.length; i++) if (re.test(rel.assets[i].name)) return rel.assets[i]; return null; }
    function fileUrl(repo, tag, name) { return '/get/' + encodeURIComponent(repo) + '/' + encodeURIComponent(tag) + '/' + encodeURIComponent(name); }
    function card(repo, rel, asset, title, steps) {
      if (!rel || !asset) return '<div class="callout"><p>The right file isn\u2019t published yet. Check the <a href="/downloads/">downloads page</a> later.</p></div>';
      var url = fileUrl(repo, rel.tag, asset.name), qr = location.origin + '/dl/?r=' + encodeURIComponent(repo) + '&t=' + encodeURIComponent(rel.tag) + '&f=' + encodeURIComponent(asset.name);
      return '<div class="release latest"><div class="release-head"><div><h3>' + esc(title) + '</h3><div class="sub">' + esc(asset.name) + ' · ' + esc(rel.name || rel.tag) + '</div></div><span class="tag accent">Your file</span></div>' +
        '<div class="asset" style="grid-template-columns:1fr auto"><div><ol class="steps" style="margin:0">' + steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol></div>' +
        '<div style="text-align:center"><div class="qr-box" style="margin:0 0 .75rem">' + WG.qrSvg(qr, { label: 'QR code to download ' + asset.name }).replace('<svg ', '<svg style="width:150px;height:150px" ') + '</div><br>' +
        '<a class="btn primary" href="' + esc(url) + '" download="' + esc(asset.name) + '">Download</a></div></div></div>';
    }
    function show() {
      var out = $('#np-result'); if (!dev) { out.innerHTML = ''; return; }
      if (Q2[dev] && !sub) { out.innerHTML = ''; return; }
      var D = 'NuvioDesktop', S = 'NuvioTVSmart', I = 'NuvioTVSmart-Installer', relD = latest(D), html = '';
      var installer = latest(I);
      var instLinks = installer ? installer.assets.map(function (a) { return '<a href="' + esc(fileUrl(I, installer.tag, a.name)) + '" download>' + esc(/\.exe$/i.test(a.name) ? 'Windows' : /AppImage/i.test(a.name) ? 'Linux' : a.name) + '</a>'; }).join(' · ') : '<a href="/downloads/#nuvio-tv-installer">see downloads</a>';
      if (dev === 'phone') html = sub === 'old'
        ? card(D, relD, findAsset(relD, /older-32bit\.apk$/i), 'Older Android (32-bit)', ['Tap <strong>Download</strong> on the phone, or scan the QR code with it.', 'Open the file from your notifications.', 'If asked, allow your browser to <strong>install unknown apps</strong>, then tap Install.'])
        : card(D, relD, findAsset(relD, /Android-phone\.apk$/i), 'Android phone & tablet', ['Scan the QR code with your phone\u2019s camera, or tap <strong>Download</strong> on the phone.', 'Open the downloaded file.', 'Allow <strong>install unknown apps</strong> for your browser if asked, then tap Install. If it says "App not installed", try the 32-bit build instead.']);
      else if (dev === 'androidtv') html = card(D, relD, findAsset(relD, /Android-TV\.apk$/i), 'Android TV / Google TV', ['Install <strong>Downloader</strong> by AFTVnews from the Play Store on the TV.', 'Allow Downloader to install apps: Settings › Apps › Security › Unknown sources (Google TV: Settings › System › About › tap Android TV OS build 7 times for Developer options first).', 'In Downloader, type this page\u2019s address <code>wgdively.com/downloads</code> and tap <strong>Download</strong> on the Android TV file. <a href="/projects/sideloading/#android-tv">Full guide</a>']);
      else if (dev === 'firetv') html = card(D, relD, findAsset(relD, /Android-TV\.apk$/i), 'Fire TV', ['On the Fire TV, search for and install <strong>Downloader</strong>.', 'Settings › My Fire TV › About: click the device name 7 times to unlock Developer Options. Then Developer Options › Install unknown apps › Downloader: On.', 'Open Downloader, go to <code>wgdively.com/downloads</code> and choose the <strong>Android TV</strong> file. <a href="/projects/sideloading/#fire-tv">Full guide</a>']);
      else if (dev === 'windows') html = card(D, relD, findAsset(relD, /Windows\.msi$/i), 'Windows', ['Click <strong>Download</strong>.', 'Run the .msi. If SmartScreen says "Windows protected your PC", click <strong>More info › Run anyway</strong>. That\u2019s normal for apps without an expensive code-signing certificate.']);
      else if (dev === 'emulator') { var rx = sub === 'x86' ? /Android-x86\.apk$/i : /x86_64\.apk$/i; html = card(D, relD, findAsset(relD, rx), sub === 'x86' ? 'Android x86' : 'Android x86_64', ['Download the file.', 'Drag it onto the emulator window, or install it with <code>adb install</code>.']); }
      else if (dev === 'samsung') {
        if (sub === 'older') html = '<div class="callout warn"><p><strong>Sorry, too old.</strong> Samsung TVs from 2017 and earlier run Tizen 3 or older, which the Nuvio TV build doesn\u2019t support. A Fire TV Stick or Chromecast with Google TV plugged into the TV is the easiest fix. Then pick that device above.</p></div>';
        else {
          var legacy = sub === '2018', relS = latest(S, function (r) { return legacy ? /legacy/i.test(r.tag) : !/legacy/i.test(r.tag); });
          html = card(S, relS, findAsset(relS, legacy ? /Legacy.*\.wgt$/i : /Tizen6.*\.wgt$/i), legacy ? 'Samsung 2018–2020 (Tizen 4.0–5.5)' : 'Samsung 2021+ (Tizen 6.0+)', [
            'You install this from a <strong>computer</strong>, not on the TV. Download the .wgt file and the <strong>Nuvio TV Installer</strong> (' + instLinks + ').',
            'On the TV: open Apps, press <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd><kbd>5</kbd> on the remote, turn <strong>Developer mode</strong> on, and type your computer\u2019s IP address. Restart the TV.',
            'Run the installer on the computer, pick the .wgt and your TV. It signs the app for your TV and installs it. <a href="/projects/sideloading/#samsung">Full guide</a>']);
        }
      }
      else if (dev === 'lg') { var relL = latest(S, function (r) { return !/legacy/i.test(r.tag); }); html = card(S, relL, findAsset(relL, /webOS.*\.ipk$/i), 'LG webOS', ['Download the .ipk on a computer, plus the <strong>Nuvio TV Installer</strong> (' + instLinks + ').', 'On the TV, install <strong>Developer Mode</strong> from the LG Content Store, sign in with a free LG developer account, and turn Dev Mode Status and Key Server on.', 'Run the installer, pick the .ipk and your TV. Note: Dev Mode sessions expire every 50 hours unless extended. <a href="/projects/sideloading/#lg">Full guide</a>']); }
      else html = '<div class="callout"><p>Nuvio doesn\u2019t have a build for Mac, iPhone/iPad or Roku yet. A cheap Android TV stick or Fire TV Stick is the most reliable way to watch on any TV.</p></div>';
      out.innerHTML = html;
    }
    $('#np-device').addEventListener('click', function (e) {
      var b = e.target.closest('[data-dev]'); if (!b) return;
      dev = b.getAttribute('data-dev'); sub = null;
      WG.$$('[data-dev]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      var q = Q2[dev], q2 = $('#np-q2');
      if (q) {
        q2.hidden = false;
        q2.innerHTML = '<p class="label" id="np-q2l" style="margin-top:1rem">2 · ' + esc(q[0]) + '</p><div class="choice-grid" role="group" aria-labelledby="np-q2l">' +
          q[1].map(function (o) { return '<button type="button" class="choice" data-sub="' + o[0] + '" aria-pressed="false"><strong>' + esc(o[1]) + '</strong><span>' + esc(o[2]) + '</span></button>'; }).join('') + '</div>';
      } else { q2.hidden = true; q2.innerHTML = ''; }
      show();
    });
    $('#np-q2').addEventListener('click', function (e) {
      var b = e.target.closest('[data-sub]'); if (!b) return; sub = b.getAttribute('data-sub');
      WG.$$('[data-sub]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); show();
      $('#np-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  /* ================= Bitrate & file size ================= */
  if (tool === 'bitrate') {
    function gb(bytes) { return bytes >= 1e9 ? (bytes / 1e9).toFixed(2) + ' GB' : (bytes / 1e6).toFixed(0) + ' MB'; }
    function calc1() {
      var vk = (+$('#br-v').value || 0) * +$('#br-vu').value, ak = +$('#br-a').value || 0, sec = (+$('#br-h').value || 0) * 3600 + (+$('#br-m').value || 0) * 60 + (+$('#br-s').value || 0);
      var kbps = vk + ak, bytes = kbps * 1000 / 8 * sec;
      $('#br-out').innerHTML = '<dt>Total bitrate</dt><dd>' + (kbps / 1000).toFixed(2) + ' Mbps</dd><dt>File size</dt><dd>' + gb(bytes) + ' (' + (bytes / 1073741824).toFixed(2) + ' GiB, as Windows shows it)</dd><dt>Per hour</dt><dd>' + gb(kbps * 1000 / 8 * 3600) + '</dd><dt>Stream needs</dt><dd>about ' + Math.ceil(kbps / 1000 * 1.5) + ' Mbps of internet speed (1.5× headroom)</dd>';
    }
    function calc2() {
      var bytes = (+$('#rb-size').value || 0) * +$('#rb-u').value, sec = (+$('#rb-min').value || 1) * 60, mbps = bytes * 8 / sec / 1e6;
      $('#rb-out').innerHTML = '<dt>Average bitrate</dt><dd>' + mbps.toFixed(2) + ' Mbps (' + Math.round(mbps * 1000).toLocaleString() + ' kbps)</dd><dt>Stream needs</dt><dd>about ' + Math.ceil(mbps * 1.5) + ' Mbps of internet speed</dd>';
    }
    var T = [['SD 480p (H.264)', 2.5], ['720p HD (H.264)', 5], ['1080p streaming (H.264)', 8], ['1080p streaming (HEVC)', 5], ['1080p Blu-ray remux', 30], ['4K streaming (HEVC, Netflix-class)', 16], ['4K web-DL (HEVC HDR)', 25], ['4K UHD Blu-ray remux', 60], ['Live TV / IPTV 1080p', 6], ['Live sports 1080p60', 10]];
    $('#br-table').innerHTML = T.map(function (r) { return '<tr><td>' + r[0] + '</td><td class="mono">' + r[1] + ' Mbps</td><td class="mono">' + (r[1] * 3600 / 8 / 1000).toFixed(1) + ' GB</td><td class="mono">' + Math.ceil(r[1] * 1.5) + ' Mbps+</td></tr>'; }).join('');
    WG.$$('#br-v, #br-vu, #br-a, #br-h, #br-m, #br-s').forEach(function (el) { el.addEventListener('input', calc1); });
    WG.$$('#rb-size, #rb-u, #rb-min').forEach(function (el) { el.addEventListener('input', calc2); });
    calc1(); calc2();
  }

  /* ================= Resolution & aspect ratio ================= */
  if (tool === 'resolution') {
    function gcd(a, b) { return b ? gcd(b, a % b) : a; }
    var NAMED = [[1.0, '1:1'], [4 / 3, '4:3'], [3 / 2, '3:2'], [16 / 10, '16:10'], [16 / 9, '16:9'], [1.85, '1.85:1 (flat)'], [2, '2:1 (Univisium)'], [64 / 27, '21:9 (64:27)'], [2.35, '2.35:1'], [2.39, '2.39:1 (scope)'], [43 / 18, '43:18 (ultrawide)'], [32 / 9, '32:9'], [9 / 16, '9:16 (vertical)']];
    function ratio() {
      var w = +$('#rs-w').value, h = +$('#rs-h').value; if (!w || !h) return;
      var g = gcd(w, h), r = w / h, near = NAMED.reduce(function (b, n) { return Math.abs(n[0] - r) < Math.abs(b[0] - r) ? n : b; });
      $('#rs-out').innerHTML = '<dt>Exact ratio</dt><dd>' + (w / g) + ':' + (h / g) + '</dd><dt>Decimal</dt><dd>' + r.toFixed(4) + ':1</dd><dt>Closest common</dt><dd>' + near[1] + (Math.abs(near[0] - r) < 0.01 ? '' : ' (approximately)') + '</dd><dt>Pixels</dt><dd>' + (w * h).toLocaleString() + ' (' + (w * h / 1e6).toFixed(2) + ' MP)</dd>' +
        '<dt>On a 16:9 TV</dt><dd>' + (r > 16 / 9 + 0.01 ? 'Black bars top and bottom (letterbox)' : r < 16 / 9 - 0.01 ? 'Black bars at the sides (pillarbox)' : 'Fills the screen') + '</dd>';
      if ($('#rz-r').value === 'custom') resize('w');
    }
    function rv() { var v = $('#rz-r').value; if (v === 'custom') return (+$('#rs-w').value) / (+$('#rs-h').value); var p = v.split(':'); return +p[0] / +p[1]; }
    function even(n) { return Math.max(2, Math.round(n / 2) * 2); }
    function resize(from) { var r = rv(); if (from === 'w') $('#rz-h').value = even(+$('#rz-w').value / r); else $('#rz-w').value = even(+$('#rz-h').value * r); }
    function density() {
      var w = +$('#pd-w').value, h = +$('#pd-h').value, d = +$('#pd-d').value; if (!w || !h || !d) return;
      var ppi = Math.sqrt(w * w + h * h) / d, r = w / h, hgt = d / Math.sqrt(r * r + 1), wid = hgt * r;
      var cm = function (i) { return (i * 2.54).toFixed(1) + ' cm'; };
      // Distance where 1 pixel subtends 1 arcminute (20/20 vision)
      var dist = 1 / ppi / Math.tan(Math.PI / 10800);
      $('#pd-out').innerHTML = '<dt>Pixel density</dt><dd>' + ppi.toFixed(1) + ' PPI</dd><dt>Screen size</dt><dd>' + wid.toFixed(1) + '″ × ' + hgt.toFixed(1) + '″ (' + cm(wid) + ' × ' + cm(hgt) + ')</dd><dt>Pixels blend at</dt><dd>' + (dist / 12).toFixed(1) + ' ft (' + (dist * 0.0254).toFixed(1) + ' m) and further, for 20/20 vision</dd>';
    }
    var COMMON = [['VGA', 640, 480], ['480p (DVD, NTSC)', 720, 480], ['720p HD', 1280, 720], ['1080p Full HD', 1920, 1080], ['1440p QHD', 2560, 1440], ['Ultrawide QHD', 3440, 1440], ['4K UHD', 3840, 2160], ['DCI 4K (cinema)', 4096, 2160], ['5K', 5120, 2880], ['8K UHD', 7680, 4320], ['1080p scope crop', 1920, 800], ['4K scope crop', 3840, 1600], ['Vertical 1080p', 1080, 1920]];
    $('#rs-table').innerHTML = COMMON.map(function (c) { var g = gcd(c[1], c[2]); return '<tr><td>' + c[0] + '</td><td class="mono">' + c[1] + ' × ' + c[2] + '</td><td class="mono">' + (c[1] / g) + ':' + (c[2] / g) + '</td><td class="mono">' + (c[1] * c[2] / 1e6).toFixed(2) + '</td></tr>'; }).join('');
    WG.$$('#rs-w, #rs-h').forEach(function (el) { el.addEventListener('input', ratio); });
    $('#rz-w').addEventListener('input', function () { resize('w'); }); $('#rz-h').addEventListener('input', function () { resize('h'); }); $('#rz-r').addEventListener('change', function () { resize('w'); });
    WG.$$('#pd-w, #pd-h, #pd-d').forEach(function (el) { el.addEventListener('input', density); });
    ratio(); resize('w'); density();
  }
})();
