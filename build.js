// Assembles the static pages: src/layout.html + src/pages/<page>.html → <page>.html in the project root.
// Run `node build.js` after editing anything in src/. `node serve.js` does it for you on every page load.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
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

function build() {
  const layout = read('layout.html');
  const gate = read('gate.html');
  for (const page of PAGES) {
    const home = page.id === 'index';
    const fill = { title: page.title, desc: page.desc, page: page.id, bodyClass: home ? 'is-gated' : 'is-open', gate: home ? gate : '', content: read(`pages/${page.id}.html`) };
    const html = layout
      .replace(/\{\{(\w+)\}\}/g, (m, key) => (key in fill ? fill[key] : m))
      .split(`data-nav="${page.id}"`).join(`data-nav="${page.id}" aria-current="page"`);
    fs.writeFileSync(path.join(__dirname, `${page.id}.html`), html);
  }
  return PAGES.length;
}

module.exports = { build };
if (require.main === module) console.log(`Built ${build()} pages`);
