/* Network tools: my IP, subnet calculator, DNS lookup, port reference, device info. */
(function () {
  'use strict';
  var WG = window.WG, $ = WG.$, esc = WG.esc;
  var host = document.querySelector('[data-tool]');
  var tool = host && host.getAttribute('data-tool');

  /* ================= What's my IP ================= */
  if (tool === 'my-ip') {
    var parseTrace = function (t) { var o = {}; t.split('\n').forEach(function (l) { var i = l.indexOf('='); if (i > 0) o[l.slice(0, i)] = l.slice(i + 1); }); return o; };
    var get = function (url) {
      var c = new AbortController(); var tm = setTimeout(function () { c.abort(); }, 6000);
      return fetch(url, { cache: 'no-store', signal: c.signal }).then(function (r) { clearTimeout(tm); if (!r.ok) throw 0; return r.text(); }).then(parseTrace);
    };
    var run = function () {
      $('#ip4').textContent = 'Checking…'; $('#ip6').textContent = 'Checking…';
      var v4 = get('https://1.1.1.1/cdn-cgi/trace').catch(function () { return null; });
      var v6 = get('https://[2606:4700:4700::1111]/cdn-cgi/trace').catch(function () { return null; });
      Promise.all([v4, v6]).then(function (res) {
        var a = res[0], b = res[1], any = a || b;
        $('#ip4').textContent = a && a.ip ? a.ip : 'Not available';
        $('#ip6').textContent = b && b.ip && b.ip.indexOf(':') > -1 ? b.ip : 'Not available';
        if (!any) { $('#ip-trace').innerHTML = '<dt>Status</dt><dd>Couldn\u2019t reach Cloudflare. A content blocker or firewall may be stopping it.</dd>'; return; }
        var rows = [
          ['Country', any.loc], ['Cloudflare data centre', any.colo + ' (the nearest Cloudflare city to you, by airport code)'],
          ['HTTP version', any.http], ['TLS version', any.tls], ['Using Cloudflare WARP', any.warp], ['IPv6 works', b && b.ip ? 'Yes' : 'No']
        ];
        $('#ip-trace').innerHTML = rows.filter(function (r) { return r[1]; }).map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
      });
    };
    $('#ip-refresh').addEventListener('click', run); run();
  }

  /* ================= Subnet calculator ================= */
  if (tool === 'subnet') {
    var inEl = $('#sn-in'), prefEl = $('#sn-prefix'), out = $('#sn-out'), err = $('#sn-err'), splitEl = $('#sn-split'), splitOut = $('#sn-split-out');
    var B = function (n) { return BigInt(n); };
    function parse4(s) {
      var p = s.split('.'); if (p.length !== 4) return null; var n = 0n;
      for (var i = 0; i < 4; i++) { if (!/^\d{1,3}$/.test(p[i]) || +p[i] > 255) return null; n = (n << 8n) | B(+p[i]); }
      return n;
    }
    function fmt4(n) { return [24n, 16n, 8n, 0n].map(function (s) { return String((n >> s) & 255n); }).join('.'); }
    function parse6(s) {
      s = s.trim(); if (!/^[0-9a-f:.]+$/i.test(s)) return null;
      var tail4 = null; var m = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
      if (m) { tail4 = parse4(m[2]); if (tail4 === null) return null; s = m[1] + ((tail4 >> 16n) & 0xffffn).toString(16) + ':' + (tail4 & 0xffffn).toString(16); }
      var halves = s.split('::'); if (halves.length > 2) return null;
      var left = halves[0] ? halves[0].split(':') : [], right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
      var fill = 8 - left.length - right.length; if ((halves.length === 1 && fill !== 0) || fill < 0) return null;
      var parts = left.concat(Array(halves.length === 2 ? fill : 0).fill('0'), right); if (parts.length !== 8) return null;
      var n = 0n; for (var i = 0; i < 8; i++) { if (!/^[0-9a-f]{1,4}$/i.test(parts[i])) return null; n = (n << 16n) | B(parseInt(parts[i], 16)); }
      return n;
    }
    function fmt6(n) {
      var g = []; for (var i = 7; i >= 0; i--) g.push(Number((n >> B(i * 16)) & 0xffffn).toString(16));
      var best = -1, bl = 0; for (var j = 0; j < 8;) { if (g[j] === '0') { var k = j; while (k < 8 && g[k] === '0') k++; if (k - j > bl && k - j > 1) { best = j; bl = k - j; } j = k; } else j++; }
      if (best < 0) return g.join(':');
      return g.slice(0, best).join(':') + '::' + g.slice(best + bl).join(':');
    }
    function full6(n) { var g = []; for (var i = 7; i >= 0; i--) g.push(Number((n >> B(i * 16)) & 0xffffn).toString(16).padStart(4, '0')); return g.join(':'); }
    function maskToPrefix(m) { var s = m.toString(2).padStart(32, '0'); if (!/^1*0*$/.test(s)) return -1; return s.indexOf('0') === -1 ? 32 : s.indexOf('0'); }
    function classify4(n) {
      var r = [[0x0A000000n, 8, 'Private (RFC 1918)'], [0xAC100000n, 12, 'Private (RFC 1918)'], [0xC0A80000n, 16, 'Private (RFC 1918)'], [0x64400000n, 10, 'Carrier-grade NAT / Tailscale (RFC 6598)'],
        [0x7F000000n, 8, 'Loopback (this device)'], [0xA9FE0000n, 16, 'Link-local (no DHCP answer, APIPA)'], [0xE0000000n, 4, 'Multicast'], [0xF0000000n, 4, 'Reserved'], [0x00000000n, 8, '"This network"'], [0xC0000200n, 24, 'Documentation (TEST-NET-1)'], [0xC6336400n, 24, 'Documentation (TEST-NET-2)'], [0xCB007100n, 24, 'Documentation (TEST-NET-3)'], [0xC6120000n, 15, 'Benchmarking (RFC 2544)']];
      for (var i = 0; i < r.length; i++) { var mask = ((1n << 32n) - 1n) ^ ((1n << B(32 - r[i][1])) - 1n); if ((n & mask) === r[i][0]) return r[i][2]; }
      return 'Public';
    }
    function classify6(n) {
      var top = function (bits) { return n >> B(128 - bits); };
      if (n === 1n) return 'Loopback (::1)'; if (n === 0n) return 'Unspecified (::)';
      if (top(7) === 0x7en) return 'Unique local (fc00::/7), the IPv6 version of private';
      if (top(10) === 0x3fan) return 'Link-local (fe80::/10)';
      if (top(8) === 0xffn) return 'Multicast';
      if (top(32) === 0x20010db8n) return 'Documentation (2001:db8::/32)';
      if (top(3) === 1n) return 'Global unicast (public)';
      return 'Reserved / special';
    }
    function prefixOptions(v6) {
      var max = v6 ? 128 : 32, html = '';
      for (var p = max; p >= 0; p--) {
        var lbl = '/' + p;
        if (!v6) { var m = p === 0 ? 0n : ((1n << 32n) - 1n) ^ ((1n << B(32 - p)) - 1n); lbl += '  (' + fmt4(m) + ')'; }
        html += '<option value="' + p + '">' + lbl + '</option>';
      }
      return html;
    }
    var lastV6 = null;
    function calc() {
      var raw = inEl.value.trim().replace(/\s+/g, ' '); err.hidden = true;
      var m = raw.match(/^([0-9a-fA-F:.]+)(?:\s*\/\s*(\d{1,3})|\s+(\d+\.\d+\.\d+\.\d+))?$/);
      if (!m) return fail('Type an address like 192.168.1.10/24 or 2001:db8::/48.');
      var v6 = m[1].indexOf(':') > -1, ip = v6 ? parse6(m[1]) : parse4(m[1]);
      if (ip === null) return fail('That isn\u2019t a valid IPv' + (v6 ? '6' : '4') + ' address.');
      var bits = v6 ? 128 : 32, prefix;
      if (m[2] !== undefined) prefix = +m[2];
      else if (m[3]) { if (v6) return fail('IPv6 uses a /prefix, not a mask.'); var mk = parse4(m[3]); prefix = mk === null ? -1 : maskToPrefix(mk); if (prefix < 0) return fail('That subnet mask isn\u2019t valid. Mask bits must be continuous, like 255.255.255.0.'); }
      else prefix = v6 ? 64 : 24;
      if (prefix > bits) return fail('The prefix can be at most /' + bits + '.');
      if (lastV6 !== v6) { prefEl.innerHTML = prefixOptions(v6); splitEl.innerHTML = prefixOptions(v6); lastV6 = v6; }
      prefEl.value = String(prefix);
      var all = (1n << B(bits)) - 1n, hostBits = B(bits - prefix), hostMask = (1n << hostBits) - 1n, mask = all ^ hostMask;
      var net = ip & mask, last = net | hostMask, total = 1n << hostBits;
      var f = v6 ? fmt6 : fmt4, rows = [];
      rows.push(['Address', f(ip) + (v6 ? '' : '')]);
      rows.push(['Network', f(net) + '/' + prefix]);
      if (!v6) {
        var first, lastH, usable;
        if (prefix === 32) { first = lastH = net; usable = 1n; }
        else if (prefix === 31) { first = net; lastH = last; usable = 2n; }
        else { first = net + 1n; lastH = last - 1n; usable = total - 2n; }
        rows.push(['Usable hosts', f(first) + ' – ' + f(lastH)]);
        rows.push(['Broadcast', prefix >= 31 ? 'None (' + (prefix === 31 ? 'point-to-point, RFC 3021' : 'single host') + ')' : f(last)]);
        rows.push(['Subnet mask', f(mask)]); rows.push(['Wildcard mask', f(hostMask)]);
        rows.push(['Addresses', total.toLocaleString() + ' total · ' + usable.toLocaleString() + ' usable']);
        rows.push(['Type', classify4(ip)]);
        rows.push(['Binary address', ip.toString(2).padStart(32, '0').replace(/(.{8})(?!$)/g, '$1.')]);
        rows.push(['Binary mask', mask.toString(2).padStart(32, '0').replace(/(.{8})(?!$)/g, '$1.')]);
        rows.push(['Reverse DNS zone', prefix >= 24 ? fmt4(net).split('.').slice(0, 3).reverse().join('.') + '.in-addr.arpa' : prefix >= 16 ? fmt4(net).split('.').slice(0, 2).reverse().join('.') + '.in-addr.arpa' : fmt4(net).split('.')[0] + '.in-addr.arpa']);
      } else {
        rows.push(['First address', f(net)]); rows.push(['Last address', f(last)]);
        rows.push(['Addresses', total > 10n ** 15n ? '2^' + (bits - prefix) + ' (' + total.toString().length + '-digit number)' : total.toLocaleString()]);
        rows.push(['Expanded', full6(ip)]);
        rows.push(['Type', classify6(ip)]);
        if (prefix <= 64) rows.push(['/64 networks inside', (1n << B(64 - prefix)).toLocaleString()]);
      }
      out.innerHTML = rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
      // split
      var target = Math.max(prefix, Math.min(bits, +splitEl.value || Math.min(bits, prefix + (v6 ? 16 : 2))));
      if (+splitEl.value < prefix || !splitEl.value) splitEl.value = String(Math.min(bits, prefix + (v6 ? 16 : 2)));
      target = +splitEl.value;
      var count = 1n << B(target - prefix), step = 1n << B(bits - target), lines = [], max = 256n;
      for (var i = 0n; i < count && i < max; i++) {
        var sn = net + i * step, sl = sn + step - 1n;
        lines.push(f(sn) + '/' + target + (v6 ? '' : '   ' + f(sn) + ' – ' + f(sl)));
      }
      splitOut.textContent = count.toLocaleString() + ' subnets of /' + target + (count > max ? ' (first ' + max + ' shown)' : '') + '\n\n' + lines.join('\n');
    }
    function fail(msg) { err.hidden = false; err.textContent = msg; out.innerHTML = ''; splitOut.textContent = ''; }
    inEl.addEventListener('input', calc);
    prefEl.addEventListener('change', function () { inEl.value = inEl.value.trim().split(/[\s/]/)[0] + '/' + prefEl.value; calc(); });
    splitEl.addEventListener('change', calc);
    calc();
  }

  /* ================= DNS lookup ================= */
  if (tool === 'dns') {
    var TYPES = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 65: 'HTTPS', 257: 'CAA', 64: 'SVCB', 43: 'DS', 48: 'DNSKEY', 46: 'RRSIG' };
    var RC = { 0: 'OK', 1: 'Format error', 2: 'Server failure (SERVFAIL, often a DNSSEC problem)', 3: 'Domain does not exist (NXDOMAIN)', 4: 'Not implemented', 5: 'Refused' };
    var outEl = $('#dns-out');
    function ttl(s) { if (s < 60) return s + 's'; if (s < 3600) return Math.round(s / 60) + 'm'; if (s < 86400) return (s / 3600).toFixed(s % 3600 ? 1 : 0) + 'h'; return (s / 86400).toFixed(1) + 'd'; }
    function toPtr(name) {
      if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return name.split('.').reverse().join('.') + '.in-addr.arpa';
      if (name.indexOf(':') > -1) {
        try {
          var h = name.split('::'), l = h[0] ? h[0].split(':') : [], r = h[1] ? h[1].split(':') : [], parts = l.concat(Array(8 - l.length - r.length).fill('0'), r);
          return parts.map(function (p) { return p.padStart(4, '0'); }).join('').split('').reverse().join('.') + '.ip6.arpa';
        } catch (e) { return name; }
      }
      return name;
    }
    function q(name, type, resolver) {
      var url = resolver === 'google'
        ? 'https://dns.google/resolve?name=' + encodeURIComponent(name) + '&type=' + type
        : 'https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(name) + '&type=' + type;
      return fetch(url, { headers: { Accept: 'application/dns-json' } }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    }
    function render(type, d) {
      var ans = (d.Answer || []);
      var head = '<div class="release-head"><h3>' + esc(type) + '</h3><div class="tags">' + (d.AD ? '<span class="tag ok">AD · DNSSEC ok</span>' : '') + '<span class="tag' + (d.Status ? ' bad' : '') + '">' + esc(RC[d.Status] || ('Status ' + d.Status)) + '</span></div></div>';
      if (!ans.length) return '<article class="release">' + head + '<p class="small muted" style="padding:1rem 1.5rem;margin:0">No ' + esc(type) + ' records.</p></article>';
      return '<article class="release">' + head + '<div class="table-wrap" style="border:0;margin:0;border-radius:0"><table><thead><tr><th>Name</th><th>Type</th><th>TTL</th><th>Value</th></tr></thead><tbody>' +
        ans.map(function (a) { return '<tr><td class="mono">' + esc(a.name) + '</td><td>' + esc(TYPES[a.type] || a.type) + '</td><td class="mono">' + esc(ttl(a.TTL)) + '</td><td class="mono" style="overflow-wrap:anywhere">' + esc(a.data) + '</td></tr>'; }).join('') +
        '</tbody></table></div></article>';
    }
    $('#dns-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#dns-name').value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      var type = $('#dns-type').value, res = $('#dns-resolver').value;
      if (!name) return;
      if (/^[\d.]+$|:/.test(name) && (type === 'ALL' || type === 'PTR')) { type = 'PTR'; $('#dns-type').value = 'PTR'; name = toPtr(name); }
      var types = type === 'ALL' ? ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA', 'SOA'] : [type];
      outEl.innerHTML = '<div class="skeleton"></div>';
      var t0 = performance.now();
      Promise.all(types.map(function (t) { return q(name, t, res).then(function (d) { return [t, d]; }, function (er) { return [t, { Status: -1, err: er.message }]; }); }))
        .then(function (rs) {
          var ms = Math.round(performance.now() - t0);
          outEl.innerHTML = '<p class="small muted mono">' + esc(name) + ' · ' + (res === 'google' ? 'Google Public DNS' : 'Cloudflare 1.1.1.1') + ' · ' + ms + ' ms</p>' +
            rs.map(function (r) { return r[1].err ? '<div class="callout warn"><p>' + esc(r[0]) + ': lookup failed (' + esc(r[1].err) + ').</p></div>' : render(r[0], r[1]); }).join('');
        });
    });
    $('#dns-form').dispatchEvent(new Event('submit'));
  }

  /* ================= Port reference ================= */
  if (tool === 'ports') {
    // [port, proto, service, category, note]
    var P = [
      [20, 'TCP', 'FTP data', 'web', 'Active-mode FTP data channel. FTP is unencrypted; prefer SFTP.'], [21, 'TCP', 'FTP control', 'web', 'Unencrypted. Use SFTP (22) or FTPS instead.'],
      [22, 'TCP', 'SSH / SFTP / SCP', 'remote', 'Secure shell and file transfer. Don\u2019t expose it to the internet; use a VPN or tunnel.'],
      [23, 'TCP', 'Telnet', 'remote', 'Unencrypted remote shell. Avoid it. Common on old routers and IoT gear.'],
      [25, 'TCP', 'SMTP', 'mail', 'Server-to-server mail. Many home ISPs block it outbound.'], [53, 'TCP/UDP', 'DNS', 'net', 'Name lookups. Pi-hole and AdGuard Home listen here.'],
      [67, 'UDP', 'DHCP server', 'net', 'Hands out IP addresses.'], [68, 'UDP', 'DHCP client', 'net', ''], [69, 'UDP', 'TFTP', 'net', 'Network boot (PXE) and switch firmware.'],
      [80, 'TCP', 'HTTP', 'web', 'Unencrypted web. Mostly just redirects to 443 now.'], [110, 'TCP', 'POP3', 'mail', 'Unencrypted. Use 995.'], [123, 'UDP', 'NTP', 'net', 'Time sync.'],
      [137, 'UDP', 'NetBIOS name', 'files', 'Old Windows network naming.'], [138, 'UDP', 'NetBIOS datagram', 'files', ''], [139, 'TCP', 'NetBIOS session', 'files', 'Old SMB transport.'],
      [143, 'TCP', 'IMAP', 'mail', 'Unencrypted. Use 993.'], [161, 'UDP', 'SNMP', 'net', 'Device monitoring. v1/v2c send passwords in plain text.'], [162, 'UDP', 'SNMP trap', 'net', ''],
      [389, 'TCP/UDP', 'LDAP', 'net', 'Directory (Active Directory). Use 636 for LDAPS.'], [443, 'TCP/UDP', 'HTTPS / HTTP/3 (QUIC)', 'web', 'Secure web. UDP 443 carries HTTP/3.'],
      [445, 'TCP', 'SMB', 'files', 'Windows file sharing and Samba. Never expose it to the internet.'], [465, 'TCP', 'SMTPS', 'mail', 'Mail submission over implicit TLS.'],
      [500, 'UDP', 'IKE (IPsec VPN)', 'vpn', ''], [514, 'UDP', 'Syslog', 'net', 'Log collection.'], [546, 'UDP', 'DHCPv6 client', 'net', ''], [547, 'UDP', 'DHCPv6 server', 'net', ''],
      [548, 'TCP', 'AFP', 'files', 'Old Apple file sharing (Time Machine on older NAS units).'], [554, 'TCP/UDP', 'RTSP', 'media', 'IP cameras and some streams.'],
      [587, 'TCP', 'SMTP submission', 'mail', 'Sending mail from apps and clients (STARTTLS).'], [631, 'TCP', 'IPP / CUPS', 'net', 'Printing.'], [636, 'TCP', 'LDAPS', 'net', ''],
      [853, 'TCP/UDP', 'DNS over TLS / QUIC', 'net', 'Encrypted DNS (Android "Private DNS").'], [873, 'TCP', 'rsync daemon', 'files', ''],
      [993, 'TCP', 'IMAPS', 'mail', ''], [995, 'TCP', 'POP3S', 'mail', ''], [1194, 'UDP', 'OpenVPN', 'vpn', 'Default OpenVPN port.'], [1433, 'TCP', 'Microsoft SQL Server', 'db', ''],
      [1701, 'UDP', 'L2TP', 'vpn', ''], [1723, 'TCP', 'PPTP', 'vpn', 'Broken encryption. Don\u2019t use it.'], [1883, 'TCP', 'MQTT', 'home', 'Home Assistant, Zigbee2MQTT, IoT.'],
      [1900, 'UDP', 'SSDP / UPnP', 'home', 'Device discovery (DLNA, smart TVs, Chromecast). Turn UPnP off on your router if you don\u2019t need it.'],
      [2049, 'TCP', 'NFS', 'files', 'Linux/Unix file sharing.'], [2375, 'TCP', 'Docker API (no TLS)', 'homelab', 'Exposing this gives full root access. Never open it.'], [2376, 'TCP', 'Docker API (TLS)', 'homelab', ''],
      [3000, 'TCP', 'Grafana, many Node.js apps', 'homelab', 'Very common development default.'], [3306, 'TCP', 'MySQL / MariaDB', 'db', ''], [3389, 'TCP/UDP', 'RDP (Remote Desktop)', 'remote', 'A top target for attacks. Use a VPN or a gateway.'],
      [3478, 'TCP/UDP', 'STUN / TURN', 'net', 'Video calls, WebRTC, Plex relay helpers.'], [3479, 'UDP', 'PlayStation Network', 'games', ''], [3480, 'UDP', 'PlayStation Network', 'games', ''],
      [5000, 'TCP', 'Synology DSM (HTTP), Flask, UPnP', 'homelab', ''], [5001, 'TCP', 'Synology DSM (HTTPS)', 'homelab', ''], [5060, 'TCP/UDP', 'SIP', 'voip', 'VoIP signalling.'], [5061, 'TCP', 'SIP over TLS', 'voip', ''],
      [5222, 'TCP', 'XMPP client', 'net', ''], [5353, 'UDP', 'mDNS / Bonjour', 'home', 'name.local lookups, AirPlay, Chromecast discovery.'], [5355, 'UDP', 'LLMNR', 'net', 'Windows name fallback. Often disabled for security.'],
      [5432, 'TCP', 'PostgreSQL', 'db', ''], [5555, 'TCP', 'ADB over network', 'media', 'Android / Fire TV debugging. Leave it off when you\u2019re not sideloading.'],
      [5900, 'TCP', 'VNC', 'remote', 'Screen sharing. Use it over a VPN.'], [6379, 'TCP', 'Redis', 'db', 'No password by default. Never expose it.'], [6443, 'TCP', 'Kubernetes API', 'homelab', ''],
      [6881, 'TCP/UDP', 'BitTorrent (classic)', 'media', 'Old default. Modern clients pick a random port.'], [7359, 'UDP', 'Jellyfin discovery', 'media', 'Lets apps find your Jellyfin server on the LAN.'],
      [8008, 'TCP', 'Chromecast / Google Cast (HTTP)', 'media', ''], [8009, 'TCP', 'Chromecast / Google Cast (control)', 'media', ''],
      [8080, 'TCP', 'Alternate HTTP', 'web', 'Proxies, web UIs, qBittorrent WebUI (linuxserver image).'], [8081, 'TCP', 'Alternate HTTP', 'web', ''], [8086, 'TCP', 'InfluxDB', 'db', ''],
      [8096, 'TCP', 'Jellyfin / Emby (HTTP)', 'media', ''], [8920, 'TCP', 'Jellyfin / Emby (HTTPS)', 'media', ''], [8123, 'TCP', 'Home Assistant', 'home', ''],
      [8200, 'TCP', 'MiniDLNA / ReadyMedia', 'media', ''], [8443, 'TCP', 'Alternate HTTPS', 'web', 'UniFi controller, many admin UIs.'], [8448, 'TCP', 'Matrix federation', 'net', ''],
      [8554, 'TCP', 'RTSP alt (go2rtc, Frigate)', 'media', ''], [8883, 'TCP', 'MQTT over TLS', 'home', ''], [8989, 'TCP', 'Sonarr', 'media', ''], [7878, 'TCP', 'Radarr', 'media', ''], [9696, 'TCP', 'Prowlarr', 'media', ''], [8686, 'TCP', 'Lidarr', 'media', ''],
      [9000, 'TCP', 'Portainer (legacy HTTP), MinIO, PHP-FPM', 'homelab', ''], [9443, 'TCP', 'Portainer (HTTPS)', 'homelab', ''], [9090, 'TCP', 'Prometheus, Cockpit', 'homelab', 'Cockpit is the Ubuntu/Fedora web admin.'],
      [9100, 'TCP', 'Raw printing (JetDirect), Node Exporter', 'net', ''], [9117, 'TCP', 'Jackett', 'media', ''], [10000, 'TCP', 'Webmin', 'homelab', ''],
      [11434, 'TCP', 'Ollama', 'homelab', 'Local AI models. Don\u2019t expose it without a login in front.'], [19132, 'UDP', 'Minecraft Bedrock', 'games', ''], [25565, 'TCP', 'Minecraft Java', 'games', ''],
      [27015, 'TCP/UDP', 'Steam / Source game servers', 'games', ''], [3074, 'TCP/UDP', 'Xbox Live / Call of Duty', 'games', ''],
      [32400, 'TCP', 'Plex Media Server', 'media', 'Forward it for remote access, or use Plex\u2019s relay.'], [32410, 'UDP', 'Plex GDM discovery', 'media', '32410–32414 UDP.'],
      [41641, 'UDP', 'Tailscale', 'vpn', 'Direct peer connections.'], [51820, 'UDP', 'WireGuard', 'vpn', 'The usual default. Any UDP port works.'], [51413, 'TCP/UDP', 'Transmission (BitTorrent)', 'media', ''],
      [7844, 'TCP/UDP', 'Cloudflare Tunnel (outbound)', 'vpn', 'cloudflared connects OUT on 7844. No inbound ports are needed.'], [3478, 'UDP', 'Tailscale DERP STUN', 'vpn', ''],
      [2710, 'TCP', 'Nuvio TV EngineFS (on the TV)', 'media', 'The local P2P service in Nuvio Smart TV builds.'], [2711, 'TCP', 'Nuvio TV PluginService bridge (on the TV)', 'media', 'Tizen 6+ builds.'],
      [26101, 'TCP', 'Samsung Tizen SDB (Developer Mode)', 'media', 'Used to install .wgt apps on Samsung TVs.'], [9922, 'TCP', 'LG webOS Developer Mode SSH', 'media', 'Used by webOS Dev Manager and ares-cli.'],
      [3001, 'TCP', 'Uptime Kuma', 'homelab', ''], [8384, 'TCP', 'Syncthing web UI', 'files', ''], [22000, 'TCP/UDP', 'Syncthing sync', 'files', ''], [21027, 'UDP', 'Syncthing discovery', 'files', ''],
      [8888, 'TCP', 'Jupyter, misc. proxies', 'homelab', ''], [9091, 'TCP', 'Transmission web UI', 'media', ''], [3389, 'UDP', 'RDP (UDP transport)', 'remote', '']
    ];
    var CATS = { all: 'All', web: 'Web', remote: 'Remote', media: 'Streaming & media', homelab: 'Homelab', vpn: 'VPN', net: 'Network', files: 'Files', db: 'Databases', mail: 'Mail', home: 'Smart home', games: 'Games', voip: 'VoIP' };
    var cat = 'all', qEl = $('#port-q'), body = $('#port-body');
    var seen = {}; P = P.filter(function (r) { var k = r[0] + r[2]; if (seen[k]) return false; seen[k] = 1; return true; }).sort(function (a, b) { return a[0] - b[0]; });
    $('#port-cats').innerHTML = Object.keys(CATS).map(function (k) { return '<button type="button" class="chip" data-cat="' + k + '" aria-pressed="' + (k === 'all') + '">' + CATS[k] + '</button>'; }).join('');
    function draw() {
      var s = qEl.value.trim().toLowerCase();
      var rows = P.filter(function (r) { return (cat === 'all' || r[3] === cat) && (!s || String(r[0]) === s || (r[2] + ' ' + r[4] + ' ' + r[1]).toLowerCase().indexOf(s) > -1 || (/^\d+$/.test(s) && String(r[0]).indexOf(s) === 0)); });
      body.innerHTML = rows.map(function (r) { return '<tr><td class="mono"><strong>' + r[0] + '</strong></td><td class="mono">' + r[1] + '</td><td>' + esc(r[2]) + '</td><td class="muted">' + esc(r[4]) + '</td></tr>'; }).join('') || '<tr><td colspan="4" class="muted">No matches. Try a number or an app name.</td></tr>';
      $('#port-count').textContent = rows.length + ' of ' + P.length + ' ports';
    }
    qEl.addEventListener('input', draw);
    $('#port-cats').addEventListener('click', function (e) { var b = e.target.closest('[data-cat]'); if (!b) return; cat = b.getAttribute('data-cat'); WG.$$('[data-cat]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); draw(); });
    var hq = new URLSearchParams(location.search).get('q'); if (hq) qEl.value = hq;
    draw();
  }

  /* ================= Browser & device info ================= */
  if (tool === 'device') {
    var n = navigator, sc = screen, report = [];
    function fill(id, rows) {
      $(id).innerHTML = rows.filter(function (r) { return r[1] !== undefined && r[1] !== null && r[1] !== ''; }).map(function (r) { report.push(r[0] + ': ' + r[1]); return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
    }
    var ua = n.userAgent, os = /Windows NT 10/.test(ua) ? 'Windows 10 or 11' : /Windows/.test(ua) ? 'Windows' : /Android (\d+[\d.]*)/.test(ua) ? 'Android ' + RegExp.$1 : /(iPhone|iPad).*OS (\d+)_(\d+)/.test(ua) ? 'iOS / iPadOS ' + RegExp.$2 + '.' + RegExp.$3 : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Tizen/.test(ua) ? 'Samsung Tizen' : /Web0S|webOS/.test(ua) ? 'LG webOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown';
    var br = /Edg\/(\d+)/.test(ua) ? 'Edge ' + RegExp.$1 : /OPR\/(\d+)/.test(ua) ? 'Opera ' + RegExp.$1 : /SamsungBrowser\/(\d+)/.test(ua) ? 'Samsung Internet ' + RegExp.$1 : /Firefox\/(\d+)/.test(ua) ? 'Firefox ' + RegExp.$1 : /Chrome\/(\d+)/.test(ua) ? 'Chrome / Chromium ' + RegExp.$1 : /Version\/(\d+).*Safari/.test(ua) ? 'Safari ' + RegExp.$1 : 'Unknown';
    var gpu = ''; try { var c = document.createElement('canvas').getContext('webgl'); var ext = c && c.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (c ? 'WebGL available (model hidden)' : 'No WebGL'); } catch (e) {}
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fill('#dev-main', [['Operating system', os], ['Browser', br], ['Platform', (n.userAgentData && n.userAgentData.platform) || n.platform], ['Mobile', n.userAgentData ? (n.userAgentData.mobile ? 'Yes' : 'No') : (/Mobi|Android/.test(ua) ? 'Probably' : 'Probably not')],
      ['CPU threads', n.hardwareConcurrency], ['Memory (approx.)', n.deviceMemory ? '≥ ' + n.deviceMemory + ' GB' : 'Not shared by this browser'], ['Graphics', gpu],
      ['Language', (n.languages || [n.language]).join(', ')], ['Time zone', tz + ' (UTC' + (function () { var o = -new Date().getTimezoneOffset(); return (o >= 0 ? '+' : '−') + String(Math.floor(Math.abs(o) / 60)).padStart(2, '0') + ':' + String(Math.abs(o) % 60).padStart(2, '0'); })() + ')'],
      ['Local time', new Date().toLocaleString()], ['User agent', ua]]);
    var mq = function (q) { return window.matchMedia && matchMedia(q).matches; };
    fill('#dev-screen', [['Screen', sc.width + ' × ' + sc.height + ' (CSS pixels)'], ['Physical (approx.)', Math.round(sc.width * devicePixelRatio) + ' × ' + Math.round(sc.height * devicePixelRatio)], ['Window', innerWidth + ' × ' + innerHeight],
      ['Pixel ratio', devicePixelRatio], ['Colour depth', sc.colorDepth + '-bit'], ['HDR capable', mq('(dynamic-range: high)') ? 'Yes' : 'No'], ['Wide colour (P3)', mq('(color-gamut: p3)') ? 'Yes' : 'No'],
      ['Prefers', (mq('(prefers-color-scheme: dark)') ? 'Dark' : 'Light') + ' theme' + (mq('(prefers-reduced-motion: reduce)') ? ', reduced motion' : '')], ['Touch points', n.maxTouchPoints || 0], ['Orientation', sc.orientation ? sc.orientation.type : '']]);
    var cn = n.connection || {};
    fill('#dev-net', [['Online', n.onLine ? 'Yes' : 'No'], ['Connection type', cn.effectiveType ? cn.effectiveType.toUpperCase() + ' class' : 'Not shared by this browser'], ['Downlink estimate', cn.downlink ? cn.downlink + ' Mbps' : ''], ['Round trip estimate', cn.rtt ? cn.rtt + ' ms' : ''], ['Data saver', cn.saveData ? 'On' : ''], ['Secure page (HTTPS)', isSecureContext ? 'Yes' : 'No'], ['Do Not Track', n.doNotTrack === '1' ? 'On' : 'Off'], ['Cookies enabled', n.cookieEnabled ? 'Yes' : 'No']]);
    var vid = document.createElement('video'), can = function (t) { var r = vid.canPlayType(t); return r === 'probably' ? 'Yes' : r === 'maybe' ? 'Maybe' : 'No'; };
    fill('#dev-feat', [['H.264 video', can('video/mp4; codecs="avc1.42E01E"')], ['HEVC / H.265 video', can('video/mp4; codecs="hvc1.1.6.L93.B0"')], ['AV1 video', can('video/mp4; codecs="av01.0.05M.08"')], ['VP9 video', can('video/webm; codecs="vp9"')],
      ['HLS streams (native)', can('application/vnd.apple.mpegurl')], ['WebGPU', 'gpu' in n ? 'Yes' : 'No'], ['WebAssembly', typeof WebAssembly === 'object' ? 'Yes' : 'No'], ['Service workers', 'serviceWorker' in n ? 'Yes' : 'No'], ['Bluetooth (Web)', 'bluetooth' in n ? 'Yes' : 'No'], ['USB (WebUSB)', 'usb' in n ? 'Yes' : 'No'], ['Clipboard API', n.clipboard ? 'Yes' : 'No']]);
    $('#dev-copy').addEventListener('click', function () { WG.copy('Device report from wgdively.com (' + new Date().toISOString() + ')\n' + report.join('\n'), 'Report copied'); });
  }
})();
