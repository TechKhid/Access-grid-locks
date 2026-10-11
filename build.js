// Assembles the site into public/, which is what gets deployed:
//   src/layout.html + src/pages/<page>.html → public/<page>.html
//   src/styles.css, src/main.js             → public/
//   src/proposal/index.html                 → public/proposal/ (the client quote)
//   only the images the pages actually use  → public/assets/
// Run `node build.js` (or `npm run build`). `node serve.js` does it for you on every page load.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'public');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const NAME = 'AccessGrid Solutions';

const PAGES = [
  { id: 'index', title: `${NAME} — Smart Access. Intelligent Security. | Accra, Ghana`,
    desc: 'AccessGrid and Moorgen smart locks, hotel locks, smart CCTV and access control for every space and budget. Shop online or visit the showroom near West Hills Mall, Accra.' },
  { id: 'shop', title: `Shop smart locks — ${NAME}`,
    desc: 'Smart door locks and smart gate locks from GH₵1,500. Order online, pay by Mobile Money or card, and we arrange delivery and installation.' },
  { id: 'smart-locks', title: `Smart locks: five ways in — ${NAME}`,
    desc: 'Fingerprint, PIN code, RFID card, Tuya app or mechanical key. Try a smart lock right on the page.' },
  { id: 'hotels', title: `Hotel locks — ${NAME}`,
    desc: 'Key-card access for hotels, guesthouses and serviced apartments in Ghana.' },
  { id: 'cctv', title: `Smart CCTV & access control — ${NAME}`,
    desc: 'EZVIZ smart cameras you can check from your phone, plus access control for offices, estates and smart homes.' },
  { id: 'quote', title: `Get a quote — ${NAME}`,
    desc: 'Tell us about your doors in four taps and send the request straight to our WhatsApp.' },
  { id: 'showroom', title: `Visit the showroom — ${NAME}`,
    desc: 'Adjacent Latex Foam, Ayigbe Town Junction (Mile 11), near West Hills Mall, Accra. Come and try the locks yourself.' },
];
const STATIC = ['styles.css', 'main.js'];

function build({ clean = false } = {}) {
  if (clean) fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const layout = read('layout.html');
  const gate = read('gate.html');
  let everything = layout + gate;
  for (const page of PAGES) {
    const home = page.id === 'index';
    const content = read(`pages/${page.id}.html`);
    everything += content;
    const fill = { title: page.title, desc: page.desc, page: page.id, bodyClass: home ? 'is-gated' : 'is-open', gate: home ? gate : '', content };
    const html = layout
      .replace(/\{\{(\w+)\}\}/g, (m, key) => (key in fill ? fill[key] : m))
      .split(`data-nav="${page.id}"`).join(`data-nav="${page.id}" aria-current="page"`);
    fs.writeFileSync(path.join(OUT, `${page.id}.html`), html);
  }
  // the client quote is a standalone page, published at /proposal/
  const proposal = read('proposal/index.html');
  everything += proposal;
  fs.mkdirSync(path.join(OUT, 'proposal'), { recursive: true });
  fs.writeFileSync(path.join(OUT, 'proposal', 'index.html'), proposal);

  for (const file of STATIC) {
    everything += read(file);
    fs.copyFileSync(path.join(SRC, file), path.join(OUT, file));
  }
  // Ship an image only if something refers to it, so nothing unused is ever published.
  const used = new Set(everything.match(/assets\/[\w./-]+\.(?:jpe?g|png|webp|svg|ico)/g) || []);
  for (const rel of used) {
    const from = path.join(ROOT, rel);
    if (!fs.existsSync(from)) throw new Error(`Missing image referenced by the site: ${rel}`);
    fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
    fs.copyFileSync(from, path.join(OUT, rel));
  }
  return { pages: PAGES.length, images: used.size };
}

module.exports = { build, OUT };
if (require.main === module) {
  const { pages, images } = build({ clean: true });
  console.log(`Built ${pages} pages and ${images} images into public/`);
}
