// The toolbox registry. Each tool's body lives in build/tools/<slug>.html.
// The build wraps it with the page header and the category sidebar, and lists it on /tools/.
export const CATEGORIES = [
  ['network', 'Network'],
  ['security', 'Security'],
  ['dev', 'Admin & developer'],
  ['streaming', 'Streaming'],
];

export const TOOLS = [
  // network
  { slug: 'my-ip', cat: 'network', name: 'What\u2019s my IP', script: 'net', desc: 'Your public IPv4 and IPv6 addresses, plus the Cloudflare data centre you\u2019re connected through.', online: true },
  { slug: 'subnet', cat: 'network', name: 'Subnet calculator', script: 'net', desc: 'CIDR to network, broadcast, host range, mask and wildcard. Handles /31 and /32 correctly.' },
  { slug: 'dns', cat: 'network', name: 'DNS lookup', script: 'net', desc: 'Look up A, AAAA, CNAME, MX, TXT, NS, CAA and more over encrypted DNS (Cloudflare or Google).', online: true },
  { slug: 'ports', cat: 'network', name: 'Port reference', script: 'net', desc: 'A searchable list of common TCP and UDP ports for servers, homelabs, games and streaming.' },
  { slug: 'device', cat: 'network', name: 'Browser & device info', script: 'net', desc: 'Everything your browser shares about your device: screen, time zone, language, graphics and features.' },
  // security
  { slug: 'password', cat: 'security', name: 'Password generator', script: 'sec', desc: 'Strong random passwords from your browser\u2019s secure random generator, with strength shown in bits.' },
  { slug: 'passphrase', cat: 'security', name: 'Passphrase generator', script: 'sec', desc: 'Easy-to-type passphrases from the EFF\u2019s 7,776-word list (the Diceware method).' },
  { slug: 'strength', cat: 'security', name: 'Password strength check', script: 'sec', desc: 'Estimates how guessable a password is and can check it against known breaches without sending the password.', online: true },
  { slug: 'hash', cat: 'security', name: 'Hash & checksum', script: 'sec', desc: 'MD5, SHA-1, SHA-256, SHA-384 and SHA-512 for text or files. Paste a checksum to verify a download.' },
  { slug: 'jwt', cat: 'security', name: 'JWT decoder', script: 'sec', desc: 'Read the header and claims inside a JSON Web Token, with expiry times in plain English.' },
  { slug: 'encode', cat: 'security', name: 'Encoder / decoder', script: 'sec', desc: 'Base64, Base64URL, URL encoding, hex and HTML entities, both ways and UTF-8 safe.' },
  { slug: 'uuid', cat: 'security', name: 'UUID generator', script: 'sec', desc: 'Random v4 UUIDs or time-ordered v7 UUIDs, in bulk.' },
  // dev
  { slug: 'json', cat: 'dev', name: 'JSON formatter', script: 'dev', desc: 'Format, minify, check and sort JSON, with the exact line and column of any error.' },
  { slug: 'regex', cat: 'dev', name: 'Regex tester', script: 'dev', desc: 'Test JavaScript regular expressions with live highlighting, capture groups and replace.' },
  { slug: 'chmod', cat: 'dev', name: 'chmod calculator', script: 'dev', desc: 'Switch between Linux permission checkboxes, octal (755) and symbolic (rwxr-xr-x).' },
  { slug: 'cron', cat: 'dev', name: 'Cron explainer', script: 'dev', desc: 'Turns a crontab line into plain English and lists the next times it will run.' },
  { slug: 'timestamp', cat: 'dev', name: 'Timestamp converter', script: 'dev', desc: 'Unix seconds or milliseconds to dates and back, in UTC and your local time.' },
  { slug: 'diff', cat: 'dev', name: 'Text diff', script: 'dev', desc: 'Compares two blocks of text line by line, like a config file before and after.' },
  { slug: 'qr', cat: 'dev', name: 'QR code generator', script: 'dev', desc: 'QR codes for links, text or Wi-Fi logins. Download them as PNG or SVG.' },
  // streaming
  { slug: 'nuvio-picker', cat: 'streaming', name: 'Which Nuvio do I need?', script: 'media', desc: 'Answer one or two questions and get the right Nuvio file for your device.' },
  { slug: 'bitrate', cat: 'streaming', name: 'Bitrate & file size', script: 'media', desc: 'Works out file size from bitrate and length (or the reverse), plus how much internet speed a stream needs.' },
  { slug: 'resolution', cat: 'streaming', name: 'Resolution & aspect ratio', script: 'media', desc: 'Aspect ratios, resizing at the same ratio, common resolutions and screen pixel density.' },
];

// Projects that also act as tools (listed in the toolbox and linked to their project page)
export const TOOL_LINKS = [
  { href: '/projects/playlist-tools/', cat: 'streaming', name: 'Playlist toolkit (M3U & EPG)', desc: 'Check, clean and de-duplicate M3U playlists and match them against XMLTV guides.' },
  { href: '/projects/sideloading/', cat: 'streaming', name: 'TV sideloading helper', desc: 'Step-by-step installs for Fire TV, Android TV, Samsung and LG.' },
  { href: '/projects/windows-toolkit/', cat: 'dev', name: 'Windows toolkit builder', desc: 'Pick apps and tweaks, then download a ready-to-run PowerShell setup script.' },
  { href: '/tools/links/', cat: 'network', name: 'Trusted links directory', desc: 'Hand-picked outside sites for diagnostics, security, homelab and learning to hack.' },
];
