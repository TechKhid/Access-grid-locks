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

/* ───────── Device ─────────
   Browsers no longer put the phone model in the basic signature, so it is pieced together from
   whichever of these is available: Instagram's in-app signature (which does name the handset),
   the model the browser reports when the page asks for it, or, for iPhones, the screen size. */
const IPHONES = {
  'iPhone10,1': 'iPhone 8', 'iPhone10,4': 'iPhone 8', 'iPhone10,2': 'iPhone 8 Plus', 'iPhone10,5': 'iPhone 8 Plus', 'iPhone10,3': 'iPhone X', 'iPhone10,6': 'iPhone X',
  'iPhone11,2': 'iPhone XS', 'iPhone11,4': 'iPhone XS Max', 'iPhone11,6': 'iPhone XS Max', 'iPhone11,8': 'iPhone XR',
  'iPhone12,1': 'iPhone 11', 'iPhone12,3': 'iPhone 11 Pro', 'iPhone12,5': 'iPhone 11 Pro Max', 'iPhone12,8': 'iPhone SE (2nd gen)',
  'iPhone13,1': 'iPhone 12 mini', 'iPhone13,2': 'iPhone 12', 'iPhone13,3': 'iPhone 12 Pro', 'iPhone13,4': 'iPhone 12 Pro Max',
  'iPhone14,4': 'iPhone 13 mini', 'iPhone14,5': 'iPhone 13', 'iPhone14,2': 'iPhone 13 Pro', 'iPhone14,3': 'iPhone 13 Pro Max', 'iPhone14,6': 'iPhone SE (3rd gen)',
  'iPhone14,7': 'iPhone 14', 'iPhone14,8': 'iPhone 14 Plus', 'iPhone15,2': 'iPhone 14 Pro', 'iPhone15,3': 'iPhone 14 Pro Max',
  'iPhone15,4': 'iPhone 15', 'iPhone15,5': 'iPhone 15 Plus', 'iPhone16,1': 'iPhone 15 Pro', 'iPhone16,2': 'iPhone 15 Pro Max',
  'iPhone17,3': 'iPhone 16', 'iPhone17,4': 'iPhone 16 Plus', 'iPhone17,1': 'iPhone 16 Pro', 'iPhone17,2': 'iPhone 16 Pro Max', 'iPhone17,5': 'iPhone 16e',
};
// Several iPhones share a screen size, so this is a shortlist, not an identification.
const IPHONE_SCREENS = {
  '320x568': 'iPhone SE (1st gen)', '375x667': 'iPhone SE / 6 to 8', '414x736': 'iPhone 6 to 8 Plus',
  '375x812': 'iPhone X / XS / 11 Pro / 12 or 13 mini', '414x896': 'iPhone XR / XS Max / 11', '390x844': 'iPhone 12 / 13 / 14',
  '428x926': 'iPhone 12 or 13 Pro Max / 14 Plus', '393x852': 'iPhone 14 Pro / 15 / 16', '430x932': 'iPhone 14 Pro Max / 15 Plus / 16 Plus',
  '402x874': 'iPhone 16 Pro / 17', '440x956': 'iPhone 16 Pro Max / 17 Pro Max', '420x912': 'iPhone Air',
};
const brand = (model) => (/^SM-/i.test(model) ? `Samsung ${model}` : /^CPH/i.test(model) ? `OPPO ${model}` : /^RMX/i.test(model) ? `realme ${model}` : model);
const title = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function device(ua, hints = {}) {
  const hintModel = clean(hints.model, 40);
  const hintOs = clean(hints.platform, 20);
  const hintVersion = parseInt(clean(hints.version, 12), 10);
  const size = (clean(hints.screen, 20).match(/^(\d{3,4})x(\d{3,4})/) || []).slice(1).map(Number);
  const portrait = size.length ? `${Math.min(...size)}x${Math.max(...size)}` : '';

  const igAndroid = ua.match(/Instagram [\d.]+ Android \((\d+)\/([\d.]+); [^;]*; [^;]*; ([^;]+); ([^;]+);/);
  const igApple = ua.match(/Instagram [\d.]+ \(((?:iPhone|iPad)\d+,\d+); iOS ([\d_]+)/);
  const uaModel = clean((ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|[;)])/) || [])[1], 40);
  const iosVersion = (igApple ? igApple[2] : (ua.match(/OS (\d+(?:_\d+)?)[_\d]* like Mac OS X/) || [])[1] || '').replace(/_/g, '.');

  let name;
  let os = '';
  if (igAndroid) {
    name = `${title(clean(igAndroid[3], 20))} ${clean(igAndroid[4], 30)}`;
    os = `Android ${clean(igAndroid[2], 6)}`;
  } else if (igApple) {
    name = IPHONES[igApple[1]] || igApple[1];
    os = `iOS ${iosVersion}`;
  } else if (/Android/.test(ua)) {
    const model = hintModel || (uaModel !== 'K' ? uaModel : '');
    name = model ? brand(model) : 'Android phone (model not shared)';
    // the basic signature always claims "Android 10" now, so only trust a version the browser reported directly
    os = hintOs === 'Android' && hintVersion ? `Android ${hintVersion}` : uaModel !== 'K' ? `Android ${(ua.match(/Android ([\d.]+)/) || [])[1] || ''}`.trim() : 'Android';
  } else if (/iPhone|iPod/.test(ua)) {
    name = IPHONE_SCREENS[portrait] ? `${IPHONE_SCREENS[portrait]} (by screen size)` : 'iPhone';
    os = iosVersion ? `iOS ${iosVersion}` : 'iOS';
  } else if (/iPad/.test(ua)) {
    name = 'iPad';
    os = iosVersion ? `iPadOS ${iosVersion}` : 'iPadOS';
  } else if (/Windows/.test(ua)) {
    name = 'Windows PC';
    os = hintOs === 'Windows' && hintVersion ? (hintVersion >= 13 ? 'Windows 11' : 'Windows 10') : '';
  } else if (/Mac OS X/.test(ua)) {
    name = 'Mac';
  } else {
    name = /Linux/.test(ua) ? 'Linux PC' : 'Unknown device';
  }

  const app = /Instagram/.test(ua) ? 'Instagram in-app browser'
    : /FBAN|FBAV/.test(ua) ? 'Facebook in-app browser'
    : /WhatsApp/.test(ua) ? 'WhatsApp in-app browser'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome|CriOS/.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari' : 'Browser';
  const net = { wifi: 'on Wi-Fi', cellular: 'on mobile data', ethernet: 'on a wired connection' }[clean(hints.net, 12)] || '';
  return [name, os, app, size.length ? `${size[0]}×${size[1]} screen` : '', net].filter(Boolean).join(' · ');
}

/* ───────── Location ─────────
   Two sources. Vercel estimates a position from the visitor's IP address: city-level at best, and on
   mobile networks often the carrier's hub rather than where the person is. A pin is exact, but it only
   exists when the visitor chose to share it (checkout or quote). */
function place(headers, hints = {}, pin) {
  const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
  const lines = [];
  let map = '';

  const lat = pin && num(pin.lat);
  const lon = pin && num(pin.lon);
  if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    const acc = Math.round(Math.max(0, Math.min(num(pin.acc) || 0, 100000)));
    lines.push(`Shared pin: ${lat.toFixed(5)}, ${lon.toFixed(5)}${acc ? ` (within ${acc} m)` : ''}`);
    map = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  }

  let city = headers['x-vercel-ip-city'] || '';
  try { city = decodeURIComponent(city); } catch { /* leave as is */ }
  const parts = [city, headers['x-vercel-ip-country-region'], headers['x-vercel-ip-country']].map((p) => clean(p, 40)).filter(Boolean);
  const tz = clean(hints.tz, 40);
  if (parts.length) {
    lines.push(`${parts.join(', ')} (approx., from IP)${tz ? ` · clock set to ${tz}` : ''}`);
    const ipLat = num(headers['x-vercel-ip-latitude']);
    const ipLon = num(headers['x-vercel-ip-longitude']);
    if (!map && ipLat != null && ipLon != null) map = `${ipLat},${ipLon}`;
  } else {
    lines.push(`Location unknown${tz ? ` · clock set to ${tz}` : ''}`);
  }
  return { text: lines.join('\n'), map: map ? `https://www.google.com/maps?q=${map}` : '', exact: lines.length > 1 };
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
  pin: { verb: 'shared their location', tags: ['round_pushpin'], priority: 4 },
};

function compose(p, headers) {
  const v = p.visitor || {};
  const hints = p.device && typeof p.device === 'object' ? p.device : {};
  const id = clean(v.id, 8) || '????';
  const visits = Math.max(1, Math.min(Number(v.visits) || 1, 9999));
  const label = clean(v.label, 40);
  const who = label || (visits > 1 ? 'A returning visitor' : 'A new visitor');
  const where = place(headers, hints, p.pin);
  const page = clean(p.page, 40) || 'the site';
  const foot = `${device(headers['user-agent'] || '', hints)}\n${where.text}\nVisit ${visits} · visitor #${id}`;
  const actions = where.map ? [{ action: 'view', label: where.exact ? 'Open pin on map' : 'Open approx. area on map', url: where.map }] : undefined;

  if (p.type === 'arrive') {
    const from = clean(p.ref, 60);
    return { title: `${who} opened the site`, message: `Landed on ${page}${from ? ` · came from ${from}` : ''}\n${foot}`, tags: ['eyes'], priority: label ? 4 : 3, actions };
  }
  if (p.type === 'summary') {
    const pages = list(p.pages, 20, 30);
    const did = list(p.actions, 40, 90);
    return {
      title: p.update ? `${who} came back: ${span(p.seconds)} on the site in total` : `${who} spent ${span(p.seconds)} on the site`,
      message: `Pages: ${pages.join(' → ') || page}\nDid: ${did.join(' · ') || 'just looked around'}\n${foot}`,
      tags: ['stopwatch'],
      priority: 3,
      actions,
    };
  }
  const ev = p.type === 'event' && EVENTS[p.name];
  if (!ev) return null;
  const detail = clean(p.detail, 300);
  return { title: `${who} ${ev.verb}`, message: `${detail ? `${detail}\n` : ''}On ${page}\n${foot}`, tags: ev.tags, priority: ev.priority, actions };
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
      console.log(`[track] NTFY_TOPIC not set, would send:\n  ${note.title}\n  ${note.message.replace(/\n/g, '\n  ')}${note.actions ? `\n  [${note.actions[0].label}] ${note.actions[0].url}` : ''}`);
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
