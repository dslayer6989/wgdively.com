// Builds the finished site into ../site from the page sources in ./pages.
// Run from src/:  npm run build        (or: node build/build.mjs)
// - Wraps every page in build/layout.html (header, nav, footer, theme switch).
// - Refreshes site/data/releases.json from the GitHub API so the Downloads page shows
//   files instantly. The page then checks GitHub live in the background for anything newer.
//   Use --offline to skip the GitHub refresh.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, TOOLS, TOOL_LINKS } from './tools.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const siteDir = join(here, '..', 'site');
const pagesDir = join(here, 'pages');
const offline = process.argv.includes('--offline');

export const OWNER = 'dslayer6989';
export const REPOS = ['NuvioDesktop', 'NuvioTVSmart', 'NuvioTV', 'NuvioTVSmart-Installer'];

const NAV = [
  ['Downloads', '/downloads/', 'downloads'],
  ['Projects', '/projects/', 'projects'],
  ['Tools', '/tools/', 'tools'],
  ['Guides', '/guides/', 'guides'],
  ['Contact', '/contact/', 'contact'],
];

const GATE = `<div class="gate" role="dialog" aria-modal="true" aria-label="Welcome to wgdively, inc.">
  <p class="gate-hint">Signal acquired</p>
  <p class="gate-logo">wgdively, inc.</p>
  <p class="gate-tag">Streaming, scheming, and the occasional sudo.</p>
  <p class="gate-joke">There's no place like 127.0.0.1!</p>
  <button class="gate-enter" type="button">[ press enter<span class="blink">_</span> ]</button>
  <button class="gate-sound" type="button" aria-pressed="false">Ambient sound: off</button>
</div>`;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function parsePage(src, file) {
  const m = src.match(/^<!--meta\s*([\s\S]*?)-->\s*/);
  if (!m) throw new Error(`${file}: missing <!--meta {...} --> header`);
  return { meta: JSON.parse(m[1]), body: src.slice(m[0].length) };
}

async function refreshReleases() {
  const target = join(siteDir, 'data', 'releases.json');
  if (offline) { console.log('releases: skipped (--offline)'); return; }
  const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'wgdively.com-build' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const repos = {};
  for (const repo of REPOS) {
    const res = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/releases?per_page=100`, { headers });
    if (!res.ok) { console.warn(`releases: ${repo} -> HTTP ${res.status}; keeping the previous snapshot`); return; }
    const list = await res.json();
    repos[repo] = list.filter(r => !r.draft).map(r => ({
      tag: r.tag_name, name: r.name || r.tag_name, published: r.published_at, prerelease: r.prerelease,
      body: (r.body || '').slice(0, 4000),
      assets: r.assets.map(a => ({ name: a.name, size: a.size, updated: a.updated_at, digest: a.digest || null })),
    }));
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify({ generated: new Date().toISOString(), owner: OWNER, repos }, null, 0) + '\n');
  console.log(`releases: snapshot saved (${Object.values(repos).reduce((n, l) => n + l.length, 0)} releases)`);
}

const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function toolSidebar(current) {
  return '<aside class="tool-nav" aria-label="All tools">' + CATEGORIES.map(([key, label]) => {
    const items = TOOLS.filter(t => t.cat === key).map(t =>
      `<li><a href="/tools/${t.slug}/"${t.slug === current ? ' aria-current="page"' : ''}>${escHtml(t.name)}</a></li>`).join('');
    const extra = TOOL_LINKS.filter(t => t.cat === key).map(t => `<li><a href="${t.href}">${escHtml(t.name)}</a></li>`).join('');
    return `<h2>${escHtml(label)}</h2><ul>${items}${extra}</ul>`;
  }).join('') + '<h2>Everything</h2><ul><li><a href="/tools/">All tools</a></li></ul></aside>';
}

// Turns build/tools/<slug>.html into pages/tools/<slug>/index.html-equivalents (in memory).
async function toolPages() {
  const out = [];
  for (const t of TOOLS) {
    const body = await readFile(join(here, 'tools', `${t.slug}.html`), 'utf8');
    const catLabel = CATEGORIES.find(c => c[0] === t.cat)[1];
    const page = `<div class="wrap">
  <header class="page-head" data-section="${escHtml(t.name)}">
    <p class="eyebrow"><a href="/tools/" style="color:inherit">03 · Tools</a> / ${escHtml(catLabel)}</p>
    <h1>${escHtml(t.name)}</h1>
    <p class="lede">${escHtml(t.desc)}</p>
    ${t.online ? '<p class="small muted"><span class="tag">Uses the internet</span> This tool asks an outside service for its answer. Each one says which.</p>' : '<p class="small muted"><span class="tag ok">Runs in your browser</span> Nothing you type here leaves your device.</p>'}
  </header>
  <div class="tool-layout">
    ${toolSidebar(t.slug)}
    <div class="tool-main" data-tool="${t.slug}">
${body.trim()}
    </div>
  </div>
</div>`;
    out.push({
      rel: join('tools', t.slug, 'index.html'),
      meta: { title: `${t.name} · Free online tool · wgdively, inc.`, description: t.desc, section: 'tools', scripts: [`/assets/js/tools-${t.script}.js`] },
      body: page,
    });
  }
  return out;
}

function toolsIndexBody() {
  const sections = CATEGORIES.map(([key, label], i) => {
    const cards = TOOLS.filter(t => t.cat === key).map(t => `<a class="card" href="/tools/${t.slug}/"><span class="meta">${t.online ? 'Online lookup' : 'Runs in your browser'}</span><h3>${escHtml(t.name)}</h3><p>${escHtml(t.desc)}</p><span class="go">Open →</span></a>`)
      .concat(TOOL_LINKS.filter(t => t.cat === key).map(t => `<a class="card" href="${t.href}"><span class="meta">Project</span><h3>${escHtml(t.name)}</h3><p>${escHtml(t.desc)}</p><span class="go">Open →</span></a>`)).join('\n');
    return `<section class="section reveal" id="${key}" data-section="${escHtml(label)}"><div class="section-head"><h2>${escHtml(label)}</h2><span class="section-num">0${i + 1} / 0${CATEGORIES.length}</span></div><div class="grid">${cards}</div></section>`;
  }).join('\n');
  return { sections, count: TOOLS.length + TOOL_LINKS.length };
}

async function build() {
  const layout = await readFile(join(here, 'layout.html'), 'utf8');
  const version = new Date().toISOString().slice(0, 16).replace(/\D/g, '');
  await refreshReleases();
  const files = await walk(pagesDir);
  const pages = [];
  for (const file of files) {
    const rel = relative(pagesDir, file);
    pages.push({ rel, ...parsePage(await readFile(file, 'utf8'), rel) });
  }
  pages.push(...(await toolPages()));
  const idx = toolsIndexBody();
  const urls = [];
  for (const { rel, meta, body: rawBody } of pages) {
    const body = rawBody.replace('{{tool-sections}}', idx.sections).replace('{{tool-count}}', String(idx.count))
      // {{include:scripts/x.sh}} pastes a file from site/ into the page (escaped), so what's shown matches the download.
      .replace(/\{\{include:([\w./-]+)\}\}/g, (_, p) => escHtml(readFileSync(join(siteDir, p), 'utf8').trimEnd()));
    if (!meta.noindex && rel !== '404.html') urls.push('https://wgdively.com/' + rel.replace(/index\.html$/, '').replaceAll('\\', '/'));
    const section = meta.section || 'home';
    const nav = NAV.map(([label, href, key], i) =>
      `          <li><a href="${href}"${key === section ? ' aria-current="page"' : ''}><span>${label}</span><span class="num">0${i + 1}</span></a></li>`).join('\n');
    const footnav = [['Home', '/', 'home'], ...NAV].map(([label, href]) => `        <li><a href="${href}">${label}</a></li>`).join('\n');
    const scripts = (meta.scripts || []).map(s => `<script src="${s}?v=${version}" defer></script>`).join('\n');
    const html = layout
      .replaceAll('{{title}}', meta.title)
      .replaceAll('{{description}}', meta.description)
      .replaceAll('{{section}}', section)
      .replaceAll('{{version}}', version)
      .replace('{{gate}}', meta.gate ? GATE : '')
      .replace('{{nav}}', nav)
      .replace('{{footnav}}', footnav)
      .replace('{{scripts}}', scripts)
      .replace('{{body}}', body.trim());
    const out = join(siteDir, rel);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, html);
  }
  urls.sort();
  await writeFile(join(siteDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
  await writeFile(join(siteDir, 'robots.txt'), 'User-agent: *\nDisallow: /dl/\nDisallow: /get/\nDisallow: /api/\n\nSitemap: https://wgdively.com/sitemap.xml\n');
  console.log(`pages: ${pages.length} built into site/ (${urls.length} in the sitemap)`);
}

build().catch(err => { console.error(err); process.exit(1); });
