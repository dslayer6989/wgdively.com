/* Homelab starter kit builder: pick services, get docker-compose.yml + .env + steps.
   Every image tag here was checked on Docker Hub / GHCR. Ports were chosen so no two
   services clash, and data lives in folders next to the compose file. */
(function () {
  'use strict';
  var WG = window.WG, $ = WG.$, esc = WG.esc;
  var root = $('#hk-builder'); if (!root) return;

  // id, name, what it does, web address (port), compose block, extra .env lines, needs
  var S = {
    homepage: { name: 'Homepage', what: 'A start page with links and live status for everything below.', port: 3000,
      yml: ['  homepage:', '    image: ghcr.io/gethomepage/homepage:latest', '    container_name: homepage', '    restart: unless-stopped',
        '    ports:', '      - "3000:3000"', '    environment:', '      HOMEPAGE_ALLOWED_HOSTS: "*"', '      PUID: ${PUID}', '      PGID: ${PGID}',
        '    volumes:', '      - ./data/homepage:/app/config', '      - /var/run/docker.sock:/var/run/docker.sock:ro'] },
    jellyfin: { name: 'Jellyfin', what: 'Your own Netflix for the films, shows and music you own.', port: 8096,
      yml: ['  jellyfin:', '    image: jellyfin/jellyfin:latest', '    container_name: jellyfin', '    restart: unless-stopped',
        '    user: ${PUID}:${PGID}', '    ports:', '      - "8096:8096"', '    volumes:', '      - ./data/jellyfin/config:/config', '      - ./data/jellyfin/cache:/cache', '      - ${MEDIA_DIR}:/media:ro',
        '    # Intel graphics (most mini PCs) for smooth playback; delete these 2 lines if you have none:', '    devices:', '      - /dev/dri:/dev/dri'], media: true },
    adguard: { name: 'AdGuard Home', what: 'Blocks ads and trackers for every device on your Wi-Fi.', port: 3001, port2: 8053,
      yml: ['  adguardhome:', '    image: adguard/adguardhome:latest', '    container_name: adguardhome', '    restart: unless-stopped',
        '    ports:', '      - "53:53/tcp"', '      - "53:53/udp"', '      - "3001:3000"   # first-time setup', '      - "8053:80"     # admin page after setup',
        '    volumes:', '      - ./data/adguard/work:/opt/adguardhome/work', '      - ./data/adguard/conf:/opt/adguardhome/conf'], dns: true },
    kuma: { name: 'Uptime Kuma', what: 'Watches your sites and services and alerts you when one goes down.', port: 3002,
      yml: ['  uptime-kuma:', '    image: louislam/uptime-kuma:2', '    container_name: uptime-kuma', '    restart: unless-stopped',
        '    ports:', '      - "3002:3001"', '    volumes:', '      - ./data/uptime-kuma:/app/data'] },
    dozzle: { name: 'Dozzle', what: 'Live logs for all your containers in a browser tab.', port: 9999,
      yml: ['  dozzle:', '    image: amir20/dozzle:latest', '    container_name: dozzle', '    restart: unless-stopped',
        '    ports:', '      - "9999:8080"', '    volumes:', '      - /var/run/docker.sock:/var/run/docker.sock:ro'] },
    portainer: { name: 'Portainer', what: 'Point-and-click control of containers, images and volumes.', port: 9443, https: true,
      yml: ['  portainer:', '    image: portainer/portainer-ce:lts', '    container_name: portainer', '    restart: unless-stopped',
        '    ports:', '      - "9443:9443"', '    volumes:', '      - ./data/portainer:/data', '      - /var/run/docker.sock:/var/run/docker.sock'] },
    syncthing: { name: 'Syncthing', what: 'Keeps folders in sync between your PCs, phone and server. No cloud.', port: 8384,
      yml: ['  syncthing:', '    image: linuxserver/syncthing:latest', '    container_name: syncthing', '    restart: unless-stopped',
        '    environment:', '      PUID: ${PUID}', '      PGID: ${PGID}', '      TZ: ${TZ}',
        '    ports:', '      - "8384:8384"', '      - "22000:22000/tcp"', '      - "22000:22000/udp"', '      - "21027:21027/udp"',
        '    volumes:', '      - ./data/syncthing:/config', '      - ${SYNC_DIR}:/data1'], sync: true },
    vpnqb: { name: 'qBittorrent behind a VPN', what: 'Downloads only through your VPN (gluetun). If the VPN drops, downloading stops.', port: 8080,
      yml: ['  gluetun:', '    image: qmcgaw/gluetun:v3', '    container_name: gluetun', '    restart: unless-stopped',
        '    cap_add:', '      - NET_ADMIN', '    devices:', '      - /dev/net/tun:/dev/net/tun',
        '    environment:', '      VPN_SERVICE_PROVIDER: ${VPN_SERVICE_PROVIDER}', '      VPN_TYPE: wireguard', '      WIREGUARD_PRIVATE_KEY: ${WIREGUARD_PRIVATE_KEY}', '      WIREGUARD_ADDRESSES: ${WIREGUARD_ADDRESSES}', '      SERVER_COUNTRIES: ${SERVER_COUNTRIES}', '      TZ: ${TZ}',
        '    ports:', '      - "8080:8080"   # qBittorrent web page', '    volumes:', '      - ./data/gluetun:/gluetun',
        '  qbittorrent:', '    image: linuxserver/qbittorrent:latest', '    container_name: qbittorrent', '    restart: unless-stopped',
        '    network_mode: "service:gluetun"   # all traffic goes through the VPN', '    depends_on:', '      - gluetun',
        '    environment:', '      PUID: ${PUID}', '      PGID: ${PGID}', '      TZ: ${TZ}', '      WEBUI_PORT: 8080',
        '    volumes:', '      - ./data/qbittorrent:/config', '      - ${DOWNLOADS_DIR}:/downloads'], vpn: true }
  };
  var ORDER = ['homepage', 'jellyfin', 'adguard', 'kuma', 'dozzle', 'portainer', 'syncthing', 'vpnqb'];
  var PRESETS = {
    starter: ['homepage', 'adguard', 'kuma', 'dozzle'],
    media: ['homepage', 'jellyfin', 'vpnqb', 'dozzle'],
    admin: ['homepage', 'kuma', 'dozzle', 'portainer', 'syncthing'],
    all: ORDER.slice()
  };

  $('#hk-list').innerHTML = '<fieldset class="pick-grid"><legend>Services</legend>' + ORDER.map(function (id) {
    var s = S[id];
    return '<label class="check"><input type="checkbox" name="svc" value="' + id + '"><span>' + esc(s.name) + ' <span class="muted small">:' + s.port + '</span><small>' + esc(s.what) + '</small></span></label>';
  }).join('') + '</fieldset>';

  function picked() { return Array.prototype.map.call(root.querySelectorAll('input[name="svc"]:checked'), function (i) { return i.value; }); }
  function setPreset(name) {
    root.querySelectorAll('input[name="svc"]').forEach(function (i) { i.checked = PRESETS[name].indexOf(i.value) !== -1; });
    root.querySelectorAll('[data-preset]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === name)); });
    refresh();
  }

  function compose(ids) {
    var L = ['# wgdively.com homelab starter kit', '# Made at https://wgdively.com/projects/homelab-kits/', '# Start it with:  docker compose up -d', 'name: homelab', 'services:'];
    ids.forEach(function (id, i) { if (i) L.push(''); L = L.concat(S[id].yml); });
    return L.join('\n') + '\n';
  }
  function envFile(ids) {
    var has = function (k) { return ids.some(function (id) { return S[id][k]; }); };
    var L = ['# Settings for docker-compose.yml. Keep this file private.', '# Your user and group IDs: run  id  on the server and copy the numbers.', 'PUID=1000', 'PGID=1000', '# Your time zone, from https://en.wikipedia.org/wiki/List_of_tz_database_time_zones', 'TZ=America/New_York'];
    if (has('media')) L.push('', '# Folder with your films and shows', 'MEDIA_DIR=/srv/media');
    if (has('sync')) L.push('', '# Folder Syncthing shares', 'SYNC_DIR=/srv/sync');
    if (has('vpn')) L.push('', '# VPN (WireGuard). Get these from your VPN provider\'s WireGuard config page.', '# Provider names: https://github.com/qdm12/gluetun-wiki/tree/main/setup/providers', 'VPN_SERVICE_PROVIDER=mullvad', 'WIREGUARD_PRIVATE_KEY=', 'WIREGUARD_ADDRESSES=', 'SERVER_COUNTRIES=United States', 'DOWNLOADS_DIR=/srv/downloads');
    return L.join('\n') + '\n';
  }
  function steps(ids) {
    var dirs = ['data'];
    if (ids.indexOf('jellyfin') !== -1) dirs.push('/srv/media');
    if (ids.indexOf('syncthing') !== -1) dirs.push('/srv/sync');
    if (ids.indexOf('vpnqb') !== -1) dirs.push('/srv/downloads');
    var h = '<ol class="steps">';
    h += '<li><strong>Install Docker</strong> (Ubuntu or Debian), using Docker\'s official installer, then log out and back in:<pre><code>curl -fsSL https://get.docker.com | sudo sh\nsudo usermod -aG docker $USER</code></pre></li>';
    h += '<li><strong>Make a folder</strong> and put both files in it (download them above, or paste them with <code>nano</code>):<pre><code>mkdir -p ~/homelab && cd ~/homelab\nmkdir -p ' + dirs.filter(function (d) { return d === 'data'; }).join(' ') + (dirs.length > 1 ? '\nsudo mkdir -p ' + dirs.slice(1).join(' ') + ' && sudo chown $USER:$USER ' + dirs.slice(1).join(' ') : '') + '\nnano docker-compose.yml   # paste, then Ctrl+O, Enter, Ctrl+X\nnano .env</code></pre></li>';
    h += '<li><strong>Fill in <code>.env</code></strong>. Run <code>id</code> to get your PUID and PGID numbers' + (ids.indexOf('vpnqb') !== -1 ? ', and paste in your VPN\'s WireGuard key and address' : '') + '.</li>';
    if (ids.indexOf('adguard') !== -1) h += '<li><strong>Free up port 53 for AdGuard.</strong> Ubuntu runs its own small DNS helper on that port. These commands, from AdGuard\'s documentation, switch it off:<pre><code>sudo mkdir -p /etc/systemd/resolved.conf.d\nprintf \'[Resolve]\\nDNS=127.0.0.1\\nDNSStubListener=no\\n\' | sudo tee /etc/systemd/resolved.conf.d/adguardhome.conf\nsudo mv /etc/resolv.conf /etc/resolv.conf.backup\nsudo ln -s /run/systemd/resolve/resolv.conf /etc/resolv.conf\nsudo systemctl reload-or-restart systemd-resolved</code></pre></li>';
    h += '<li><strong>Start everything:</strong><pre><code>docker compose up -d\ndocker compose ps</code></pre>Every line should say <strong>running</strong> (or <strong>healthy</strong>).</li>';
    h += '<li><strong>Open each one</strong> from any device at home, swapping in your server\'s address (find it with <code>hostname -I</code>):<div class="table-wrap" style="margin-top:.75rem"><table><thead><tr><th>Service</th><th>Address</th><th>First time</th></tr></thead><tbody>' + ids.map(function (id) {
      var s = S[id], first = {
        homepage: 'Edit the files in <code>data/homepage</code> to add links.',
        jellyfin: 'A wizard asks for an admin account, then add <code>/media</code> as a library.',
        adguard: 'Setup runs at :3001. Keep the admin port at 80 and it moves to <strong>:8053</strong>. Then set your router\'s DNS to the server\'s address.',
        kuma: 'Create an admin account, then add monitors.',
        dozzle: 'Nothing to set up.',
        portainer: 'Create an admin account within 5 minutes of starting, or run <code>docker restart portainer</code>. Your browser will warn about the certificate; that\'s expected.',
        syncthing: 'Set a GUI password under Actions → Settings → GUI.',
        vpnqb: 'Username <code>admin</code>. The temporary password is in <code>docker logs qbittorrent</code>. Change it in Options → Web UI. Check <code>docker logs gluetun</code> says the VPN is connected.'
      }[id];
      return '<tr><td>' + esc(s.name) + '</td><td class="mono">' + (s.https ? 'https' : 'http') + '://SERVER:' + s.port + '</td><td>' + first + '</td></tr>';
    }).join('') + '</tbody></table></div></li>';
    h += '<li><strong>Keep it updated</strong> once a month:<pre><code>cd ~/homelab && docker compose pull && docker compose up -d && docker image prune -f</code></pre></li></ol>';
    return h;
  }

  var outC = $('#hk-compose'), outE = $('#hk-env'), outS = $('#hk-steps'), cnt = $('#hk-count'), wrap = $('#hk-output');
  function refresh() {
    var ids = picked();
    wrap.hidden = !ids.length; $('#hk-empty').hidden = !!ids.length;
    cnt.textContent = ids.length + ' service' + (ids.length === 1 ? '' : 's');
    if (!ids.length) return;
    outC.textContent = compose(ids); outE.textContent = envFile(ids); outS.innerHTML = steps(ids);
    var warn = [];
    if (ids.indexOf('adguard') !== -1) warn.push('AdGuard Home uses port 53, so it can\u2019t run alongside another DNS server (like Pi-hole) on the same machine.');
    if (ids.some(function (id) { return /homepage|dozzle|portainer/.test(id); })) warn.push('Homepage, Dozzle and Portainer can see your Docker containers. Keep these ports on your home network only; don\u2019t forward them on your router.');
    $('#hk-warn').innerHTML = warn.map(function (w) { return '<p>' + esc(w) + '</p>'; }).join(''); $('#hk-warn').hidden = !warn.length;
  }
  root.addEventListener('change', refresh);
  root.addEventListener('click', function (e) { var b = e.target.closest('[data-preset]'); if (b) setPreset(b.getAttribute('data-preset')); });
  $('#hk-dl-compose').addEventListener('click', function () { WG.downloadText('docker-compose.yml', compose(picked()), 'text/yaml'); });
  $('#hk-dl-env').addEventListener('click', function () { WG.downloadText('.env', envFile(picked()), 'text/plain'); });
  setPreset('starter');
})();
