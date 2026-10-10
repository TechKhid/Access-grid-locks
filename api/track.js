// Visit notifications. The site posts small events here and this forwards them to ntfy.
//
// The topic lives in an environment variable so it never appears in the page source
// (anyone who knows an ntfy topic name can read it and post to it).
//   NTFY_TOPIC   required  the topic you subscribe to in the ntfy app
//   NTFY_SERVER  optional  defaults to https://ntfy.sh
//   NTFY_TOKEN   optional  access token, if the topic is protected
// With no NTFY_TOPIC set, nothing is sent and the message is only logged.

const clean = (v, max = 140) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const list = (v, maxItems, maxLen) => (Array.isArray(v) ? v.slice(0, maxItems).map((x) => clean(x, maxLen)).filter(Boolean) : []);

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 8192) req.destroy(); });
    req.on('end', () => resolve(raw));
    req.on('error', () => resolve(''));
  });
}

// "Android · SM-A546E · Instagram in-app browser"
function device(ua) {
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iPhone/iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Unknown device';
  const model = (ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|[;)])/) || [])[1];
  const app = /Instagram/.test(ua) ? 'Instagram in-app browser'
    : /FBAN|FBAV/.test(ua) ? 'Facebook in-app browser'
    : /WhatsApp/.test(ua) ? 'WhatsApp in-app browser'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome|CriOS/.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari' : 'Browser';
  return [os, model && model !== 'K' ? clean(model, 30) : '', app].filter(Boolean).join(' · ');
}

// Vercel adds the visitor's approximate location from their IP address.
function place(headers) {
  let city = headers['x-vercel-ip-city'] || '';
  try { city = decodeURIComponent(city); } catch { /* leave as is */ }
  const parts = [city, headers['x-vercel-ip-country-region'], headers['x-vercel-ip-country']].map((p) => clean(p, 40)).filter(Boolean);
  return parts.length ? parts.join(', ') : 'Location unknown';
}

function span(seconds) {
  const s = Math.max(0, Math.min(Number(seconds) || 0, 86400));
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
}

const EVENTS = {
  checkout: { verb: 'started checkout', tags: ['shopping_cart'], priority: 4 },
  order: { verb: 'placed an order', tags: ['white_check_mark'], priority: 5 },
  quote: { verb: 'sent a quote request', tags: ['memo'], priority: 4 },
  whatsapp: { verb: 'tapped WhatsApp', tags: ['speech_balloon'], priority: 4 },
  call: { verb: 'tapped call', tags: ['telephone_receiver'], priority: 4 },
  directions: { verb: 'asked for directions', tags: ['round_pushpin'], priority: 4 },
};

function compose(p, headers) {
  const v = p.visitor || {};
  const id = clean(v.id, 8) || '????';
  const visits = Math.max(1, Math.min(Number(v.visits) || 1, 9999));
  const label = clean(v.label, 40);
  const who = label || (visits > 1 ? 'A returning visitor' : 'A new visitor');
  const where = place(headers);
  const on = device(headers['user-agent'] || '');
  const page = clean(p.page, 40) || 'the site';
  const foot = `${where} · ${on}\nVisit ${visits} · visitor #${id}`;

  if (p.type === 'arrive') {
    const from = clean(p.ref, 60);
    return {
      title: `${who} opened the site`,
      message: `Landed on ${page}${from ? ` · came from ${from}` : ''}\n${foot}`,
      tags: ['eyes'],
      priority: label ? 4 : 3,
    };
  }
  if (p.type === 'summary') {
    const pages = list(p.pages, 20, 30);
    const actions = list(p.actions, 40, 90);
    return {
      title: p.update ? `${who} came back: ${span(p.seconds)} on the site in total` : `${who} spent ${span(p.seconds)} on the site`,
      message: `Pages: ${pages.join(' → ') || page}\nDid: ${actions.join(' · ') || 'just looked around'}\n${foot}`,
      tags: ['stopwatch'],
      priority: 3,
    };
  }
  const ev = p.type === 'event' && EVENTS[p.name];
  if (!ev) return null;
  const detail = clean(p.detail, 300);
  return { title: `${who} ${ev.verb}`, message: `${detail ? `${detail}\n` : ''}On ${page}\n${foot}`, tags: ev.tags, priority: ev.priority };
}

module.exports = async function handler(req, res) {
  const done = (code) => { res.statusCode = code; res.end(); };
  try {
    if (req.method !== 'POST') return done(405);
    const headers = req.headers || {};
    // only the site itself may post here
    if (headers.origin) {
      let host = '';
      try { host = new URL(headers.origin).host; } catch { /* malformed */ }
      if (host !== headers.host) return done(403);
    }
    if (/bot|crawl|spider|preview|headless|lighthouse|pingdom|uptime/i.test(headers['user-agent'] || '')) return done(204);

    let body = req.body;
    if (body === undefined) body = await readBody(req);
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return done(400); } }
    if (!body || typeof body !== 'object') return done(400);

    const note = compose(body, headers);
    if (!note) return done(400);

    const topic = process.env.NTFY_TOPIC;
    if (!topic) {
      console.log(`[track] NTFY_TOPIC not set, would send:\n  ${note.title}\n  ${note.message.replace(/\n/g, '\n  ')}`);
      return done(204);
    }
    const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(headers.host || '');
    await fetch(process.env.NTFY_SERVER || 'https://ntfy.sh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.NTFY_TOKEN ? { Authorization: `Bearer ${process.env.NTFY_TOKEN}` } : {}) },
      body: JSON.stringify({ topic, ...note, ...(local ? {} : { click: `https://${headers.host}/` }) }),
    });
    return done(204);
  } catch (err) {
    console.error('[track]', err.message);
    return done(204); // never break the page over a notification
  }
};
