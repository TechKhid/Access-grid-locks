(() => {
  'use strict';

  /* ───────── Config ───────── */
  const WHATSAPP = '233205876328';
  // Set to false to drop the entrance and land straight on the home hero.
  const SHOW_INTRO = true;
  // Paste AccessGrid Solutions' Paystack public key (pk_live_… or pk_test_…) to take real payments.
  // While this is empty the checkout runs in demo mode and charges nothing.
  // Going live also needs a small server step that verifies each transaction with Paystack before fulfilling.
  const PAYSTACK_PUBLIC_KEY = '';

  // Names, prices and unlock methods are taken from @accessgridsolutions posts (Sept–Oct 2026).
  // A product gets `img` only when the photo is sharp at the size shown; otherwise `icon` draws a placeholder.
  const GATE_WAYS = ['Tuya app', 'RFID card', 'PIN code', 'Fingerprint', 'Mechanical key'];
  const PRODUCTS = [
    { id: 'ag-nova', kicker: 'AccessGrid · Door lock', name: 'AG Nova Smart Door Lock', price: 1500, img: 'assets/img/ag-nova.jpg',
      blurb: 'Fingerprint handle, touch keypad and card access in one slim body.', tags: ['Fingerprint', 'PIN code', 'Card', 'Backup key'] },
    { id: 'gate-single', kicker: 'AccessGrid · Gate lock', name: 'Smart Gate Lock', variant: 'Single verification', price: 1800, icon: 'i-gate',
      blurb: 'One-panel access for your gate, with five ways to unlock.', tags: GATE_WAYS },
    { id: 'gate-double', kicker: 'AccessGrid · Gate lock', name: 'Smart Gate Lock', variant: 'Double verification', price: 2000, icon: 'i-gate',
      blurb: 'Two panels. Two-step verification. One smarter way to secure your gate.', tags: GATE_WAYS },
    { id: 'moorgen-t9', kicker: 'Moorgen · Luxury', name: 'Moorgen T9', price: null, icon: 'i-lock',
      blurb: 'Where intelligent living meets timeless elegance.', tags: ['Built-in intercom', 'Luxury finish'] },
  ];

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };
  const money = (n) => `GH₵${n.toLocaleString('en-GH')}`;
  const fullName = (p) => (p.variant ? `${p.name} (${p.variant})` : p.name);
  const waLink = (msg) => `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const media = (p, cls) => (p.img
    ? `<figure class="${cls}"><img src="${p.img}" alt="${esc(fullName(p))}" loading="lazy"></figure>`
    : `<figure class="${cls} ph"><svg aria-hidden="true"><use href="#${p.icon}"/></svg><figcaption>Photo to come</figcaption></figure>`);

  const root = document.documentElement;
  root.classList.add('js');
  if (!window.CSS || !CSS.registerProperty) root.classList.add('no-iris');

  /* ───────── Visit notifications ─────────
     Reports what a visitor does to /api/track, which forwards it to ntfy (see api/track.js).
     - Tag a link you send someone: add ?for=Name and their visits are labelled with it.
     - Stop your own device from reporting: open any page once with ?notrack=1 (undo with ?notrack=0).
     Nothing typed into the checkout or quote forms (names, phone numbers, areas) is ever sent.
     An exact location is sent only after the visitor taps "Use my current location". */
  const visit = (() => {
    const PAGES = { index: 'Home', shop: 'Shop', 'smart-locks': 'Smart locks', hotels: 'Hotels', cctv: 'CCTV', quote: 'Quote', showroom: 'Showroom' };
    const page = PAGES[document.body.dataset.page] || document.title;
    const params = new URLSearchParams(location.search);
    const read = (area, key) => { try { return JSON.parse(area.getItem(key)); } catch { return null; } };
    const write = (area, key, value) => { try { area.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };

    if (params.has('notrack')) write(localStorage, 'accessgrid-notrack', params.get('notrack') !== '0');
    const off = read(localStorage, 'accessgrid-notrack') === true;

    // a random id so a returning visitor can be recognised; no name unless the link carried ?for=
    const visitor = read(localStorage, 'accessgrid-visitor') || { id: Math.random().toString(36).slice(2, 6), visits: 0, label: '' };
    const label = (params.get('for') || '').replace(/[^\w .'-]/g, '').trim().slice(0, 40);
    if (label) visitor.label = label;

    let s = read(sessionStorage, 'accessgrid-visit');
    const arriving = !s;
    if (arriving) {
      visitor.visits += 1;
      let ref = '';
      try { ref = document.referrer && new URL(document.referrer).host !== location.host ? new URL(document.referrer).host : ''; } catch { /* odd referrer */ }
      s = { active: 0, pages: [], actions: [], sent: '', ref };
    }
    visitor.visits = Math.max(1, visitor.visits);
    write(localStorage, 'accessgrid-visitor', visitor);
    if (s.pages[s.pages.length - 1] !== page) s.pages.push(page);
    const save = () => write(sessionStorage, 'accessgrid-visit', s);
    save();

    // What the browser will say about the device when asked; api/track.js turns it into a readable line.
    async function describeDevice() {
      const d = { screen: `${window.screen.width}x${window.screen.height}`, net: navigator.connection?.type || '', tz: '' };
      try { d.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* no Intl */ }
      try {
        const more = await navigator.userAgentData?.getHighEntropyValues(['model', 'platformVersion']);
        if (more) Object.assign(d, { model: more.model || '', platform: more.platform || '', version: more.platformVersion || '' });
      } catch { /* browser keeps these to itself (Safari, Firefox) */ }
      return d;
    }

    const post = (payload) => {
      if (off) return;
      const body = JSON.stringify({ ...payload, visitor, page, device: s.device, pin: s.pin });
      try { if (navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([body], { type: 'text/plain' }))) return; } catch { /* fall through */ }
      fetch('/api/track', { method: 'POST', body, keepalive: true }).catch(() => {});
    };
    if (arriving) describeDevice().then((d) => { s.device = d; save(); post({ type: 'arrive', ref: s.ref }); });

    // time counts only while the page is actually on screen
    let since = document.visibilityState === 'visible' ? Date.now() : 0;
    const bank = () => { if (since) { s.active += Date.now() - since; since = 0; } };

    // moving to another page of the site is not leaving, so it sends no summary
    let internal = false;
    const lastHot = {};
    function track(action, opts = {}) {
      if (opts.once && s.actions.includes(action)) return;
      if (s.actions[s.actions.length - 1] !== action && s.actions.length < 40) s.actions.push(action);
      save();
      if (!opts.hot || Date.now() - (lastHot[opts.hot] || 0) < 20000) return;
      lastHot[opts.hot] = Date.now();
      post({ type: 'event', name: opts.hot, detail: opts.detail || action });
    }

    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href]');
      if (!a) return;
      if (a.origin === location.origin && a.target !== '_blank' && a.pathname !== location.pathname) {
        internal = true;
        setTimeout(() => { internal = false; }, 1500);
        return;
      }
      const text = a.textContent.trim().replace(/\s+/g, ' ').slice(0, 60);
      if (a.id === 'waSend') return; // the quote builder reports this one with its details
      if (a.id === 'doneWa') track('Sent the order to WhatsApp', { hot: 'whatsapp', detail: 'Sent their order message' });
      else if (a.host === 'wa.me') track('Tapped WhatsApp', { hot: 'whatsapp', detail: text || 'WhatsApp button' });
      else if (a.protocol === 'tel:') track('Tapped call', { hot: 'call', detail: text });
      else if (a.host.includes('google.') && a.pathname.includes('/maps')) track('Asked for directions', { hot: 'directions', detail: 'Opened Google Maps for the showroom' });
      else if (a.host.includes('instagram.com')) track('Opened Instagram', { once: true });
    }, true);

    const summarise = () => {
      bank();
      save();
      if (internal) return;
      const mark = `${s.pages.length}|${s.actions.length}|${Math.floor(s.active / 30000)}`;
      if (mark === s.sent) return; // nothing new since the last summary
      if (s.active < 3000 && !s.actions.length && s.pages.length < 2) return; // a glance is already covered by the arrival note
      post({ type: 'summary', seconds: Math.round(s.active / 1000), pages: s.pages, actions: s.actions, update: Boolean(s.sent) });
      s.sent = mark;
      save();
    };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') summarise(); else since = Date.now(); });
    addEventListener('pagehide', summarise);

    // the visitor's own pin, shared on purpose from checkout or the quote builder
    const pin = () => s.pin || null;
    function setPin(next, purpose) {
      s.pin = next || undefined;
      save();
      if (next) track('Shared their location', { hot: 'pin', detail: `For their ${purpose}` });
    }

    return { track, pin, setPin };
  })();

  /* ───────── Location pin: only ever on the visitor's say-so ─────────
     Addresses are hard to describe, so checkout and the quote builder offer to attach a map pin.
     The browser asks permission, the note says where it goes, and the visitor can remove it. */
  const pinBoxes = [];
  const pinUrl = () => { const p = visit.pin(); return p ? `https://maps.google.com/?q=${p.lat},${p.lon}` : ''; };
  function wirePin(box, purpose, onChange = () => {}) {
    if (!box) return;
    const btn = $('[data-pin-get]', box);
    const label = $('span', btn);
    const note = $('[data-pin-note]', box);
    let problem = '';
    const paint = () => {
      const p = visit.pin();
      btn.hidden = Boolean(p);
      note.hidden = !p && !problem;
      note.innerHTML = p
        ? `Location pinned${p.acc ? ` (within about ${p.acc} m)` : ''}. It goes with your ${purpose} so we can find you.<button type="button" data-pin-clear>Remove</button>`
        : problem;
      onChange();
    };
    const idle = () => { btn.disabled = false; label.textContent = 'Use my current location'; };
    btn.addEventListener('click', () => {
      if (!navigator.geolocation) { problem = 'This browser cannot share a location. Please type your area instead.'; paint(); return; }
      btn.disabled = true;
      label.textContent = 'Finding you…';
      navigator.geolocation.getCurrentPosition((pos) => {
        idle();
        problem = '';
        visit.setPin({ lat: Number(pos.coords.latitude.toFixed(5)), lon: Number(pos.coords.longitude.toFixed(5)), acc: Math.round(pos.coords.accuracy) }, purpose);
        pinBoxes.forEach((repaint) => repaint());
      }, () => {
        idle();
        problem = 'We could not get your location. Please type your area instead.';
        paint();
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    });
    box.addEventListener('click', (e) => {
      if (!e.target.closest('[data-pin-clear]')) return;
      visit.setPin(null);
      pinBoxes.forEach((repaint) => repaint());
    });
    pinBoxes.push(paint);
    paint();
  }

  /* ───────── Lock component ───────── */
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  const SCAN_LABEL = { finger: 'Reading', code: '', card: 'Card', app: 'App', key: 'Key' };
  const SCAN_MS = { finger: 1100, card: 1500, app: 1700, key: 1400 };
  const timers = new WeakMap();

  function buildLock(el, live) {
    const open = live ? 'button type="button"' : 'div';
    const close = live ? 'button' : 'div';
    el.dataset.state = 'locked';
    el.innerHTML = `
      <div class="lock__body">
        <div class="lock__glass">
          <div class="lock__cam"><i></i><i class="lens"></i><i></i></div>
          <div class="lock__screen"><span>Locked</span></div>
          <div class="lock__keys">${KEYS.map((k) => `<${open} class="lock__key" data-k="${k}"${live ? ` aria-label="Key ${k}"` : ''}>${k}</${close}>`).join('')}</div>
          <div class="lock__nfc"></div>
        </div>
        <${open} class="lock__finger"${live ? ' aria-label="Fingerprint sensor"' : ''}><svg viewBox="0 0 24 24"><use href="#fp"/></svg></${close}>
        <div class="lock__rose"></div>
        <div class="lock__hole"><i></i></div>
      </div>
      <div class="lock__lever"></div>
      <div class="lock__card"><b>AccessGrid</b><span>Access card</span></div>
      <div class="lock__phone"><span>Front door</span><i class="lock__phone-btn"></i><span>Tap to unlock</span></div>`;
    timers.set(el, []);
  }
  const screen = (lock, text) => { $('.lock__screen span', lock).textContent = text; };
  const later = (lock, fn, ms) => timers.get(lock).push(setTimeout(fn, ms));
  function clearLock(lock) {
    timers.get(lock).forEach(clearTimeout);
    timers.set(lock, []);
  }
  function relock(lock) {
    delete lock.dataset.method;
    lock.dataset.state = 'locked';
    screen(lock, 'Locked');
  }
  function grant(lock, hold = 2600) {
    lock.dataset.state = 'open';
    screen(lock, 'Welcome');
    buzz([20, 40, 30]);
    later(lock, () => relock(lock), hold);
  }
  function deny(lock) {
    lock.dataset.state = 'denied';
    screen(lock, 'Denied');
    buzz(140);
    later(lock, () => relock(lock), 1300);
  }
  function lightKey(lock, k) {
    const el = $(`.lock__key[data-k="${CSS.escape(k)}"]`, lock);
    el.classList.add('is-lit');
    setTimeout(() => el.classList.remove('is-lit'), 320);
  }
  function play(lock, way) {
    clearLock(lock);
    lock.dataset.method = way;
    lock.dataset.state = 'scan';
    screen(lock, SCAN_LABEL[way]);
    if (way === 'code') {
      [...'1957'].forEach((k, i) => later(lock, () => { lightKey(lock, k); screen(lock, '●'.repeat(i + 1)); }, 350 + i * 340));
      later(lock, () => grant(lock), 350 + 4 * 340 + 200);
    } else {
      later(lock, () => grant(lock), SCAN_MS[way]);
    }
  }

  /* ───────── Navigation: scrolled state, phone menu ───────── */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('is-stuck', scrollY > 30);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const menu = $('#menu');
  const menuBtn = $('#menuOpen');
  function setMenu(open) {
    menu.hidden = !open;
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open);
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (open) visit.track('Opened the menu', { once: true });
  }
  menuBtn.addEventListener('click', () => setMenu(menu.hidden));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });

  /* ───────── Home: entrance and hero ───────── */
  const heroLock = $('[data-lock="hero"]');
  if (heroLock) initHome();

  function initHome() {
    buildLock(heroLock, false);
    const gate = $('#gate');
    const ring = $('#gateRing');
    const site = $('#site');
    const reader = $('#reader');
    const hint = $('#gateHint');
    let gateBusy = false;

    // The line above the headline answers the entrance once: "Access granted", a greeting,
    // then it settles into a plain label and stays that way. Later visits just see the label.
    const status = $('#heroStatus');
    const statusText = $('#heroStatusText');
    const label = statusText.textContent;
    async function greet() {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const hour = new Date().getHours();
      const lines = [['Access granted', 'ok'], [hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening', ''], [label, '']];
      status.classList.add('is-typing');
      for (const [text, tone] of lines) {
        status.dataset.tone = tone;
        for (let i = 0; i <= text.length; i++) { statusText.textContent = text.slice(0, i); await wait(26); }
        if (text === label) break;
        await wait(950);
        for (let i = text.length; i >= 0; i--) { statusText.textContent = text.slice(0, i); await wait(12); }
        await wait(160);
      }
      status.classList.remove('is-typing');
    }

    // the hero lock is the door you just came through: open, then it locks itself
    function settle() {
      document.body.classList.remove('is-gated');
      document.body.classList.add('is-open');
      site.inert = false;
      try { sessionStorage.setItem('accessgrid-entered', '1'); } catch { /* private mode */ }
      heroLock.dataset.state = 'open';
      screen(heroLock, 'Welcome');
      later(heroLock, () => relock(heroLock), 3600);
    }

    // The page opens outward from wherever the sensor is on this screen.
    function openFromSensor() {
      const r = reader.getBoundingClientRect();
      root.style.setProperty('--gx', `${r.left + r.width / 2}px`);
      root.style.setProperty('--gy', `${r.top + r.height / 2}px`);
      gate.classList.add('is-leaving');
      setTimeout(() => {
        window.scrollTo(0, 0);
        document.body.classList.add('is-opening');
        settle();
        if (!reduceMotion) setTimeout(greet, 450);
        setTimeout(() => {
          gate.hidden = true;
          ring.hidden = true;
          document.body.classList.remove('is-opening');
        }, reduceMotion ? 60 : 1350);
      }, reduceMotion ? 0 : 240);
    }

    function scanAndOpen() {
      if (gateBusy) return;
      gateBusy = true;
      visit.track('Touched the sensor to enter');
      reader.classList.add('is-scanning');
      hint.textContent = 'Reading fingerprint…';
      buzz(15);
      setTimeout(() => {
        reader.classList.add('is-granted');
        gate.classList.add('is-granted');
        hint.textContent = 'Access granted';
        buzz([30, 50, 70]);
        setTimeout(openFromSensor, 360);
      }, reduceMotion ? 100 : 950);
    }

    let seen = false;
    try { seen = sessionStorage.getItem('accessgrid-entered') === '1'; } catch { /* private mode */ }
    if (!SHOW_INTRO || seen) {
      gate.hidden = true; // the entrance plays once per visit, not on every page load
      ring.hidden = true;
      settle();
    } else {
      site.inert = true;
      reader.addEventListener('pointerdown', scanAndOpen);
      reader.addEventListener('click', scanAndOpen); // keyboard and assistive tech
      $('#gateSkip').addEventListener('click', () => { if (!gateBusy) { gateBusy = true; visit.track('Skipped the intro'); openFromSensor(); } });
    }

    // Tapping the hero lock opens it, so there is something to do on a phone straight away.
    heroLock.addEventListener('click', () => {
      if (heroLock.dataset.state !== 'locked') return;
      visit.track('Tapped the hero lock', { once: true });
      play(heroLock, 'finger');
    });

    // Desktop: the lock follows the cursor. Phones: it follows the tilt of the device where the browser allows it.
    const setTilt = (x, y) => {
      heroLock.style.setProperty('--ry', `${-16 + x * 22}deg`);
      heroLock.style.setProperty('--rx', `${4 - y * 12}deg`);
    };
    if (reduceMotion) return;
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const hero = $('.hero');
      hero.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect();
        setTilt((e.clientX - r.left) / r.width - .5, (e.clientY - r.top) / r.height - .5);
      });
      hero.addEventListener('pointerleave', () => { heroLock.style.removeProperty('--ry'); heroLock.style.removeProperty('--rx'); });
    } else if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') {
      // iOS needs a permission prompt for this, which is not worth interrupting anyone for; it keeps the gentle drift instead.
      addEventListener('deviceorientation', (e) => {
        if (e.gamma == null || e.beta == null) return;
        heroLock.classList.add('has-gyro');
        const clamp = (v) => Math.max(-.5, Math.min(.5, v));
        setTilt(clamp(e.gamma / 50), clamp((e.beta - 45) / 60));
      }, { passive: true });
    }
  }

  /* ───────── Shop ───────── */
  const productsEl = $('#products');
  if (productsEl) {
    productsEl.innerHTML = PRODUCTS.map((p) => `
      <article class="product" data-reveal>
        ${media(p, 'product__media')}
        <div class="product__body">
          <p class="product__kicker mono">${p.kicker}</p>
          <h3>${p.name}${p.variant ? ` <small>${p.variant}</small>` : ''}</h3>
          <p>${p.blurb}</p>
          <ul class="tags">${p.tags.map((t) => `<li>${t}</li>`).join('')}</ul>
          <div class="product__buy">
            ${p.price
              ? `<span class="price">${money(p.price)}</span><button type="button" class="btn btn--sm" data-add="${p.id}">Add to cart</button>`
              : `<span class="price">On request<small>Ask for today's price</small></span><a class="btn btn--sm btn--ghost" target="_blank" rel="noopener" href="${waLink(`Hello AccessGrid Solutions 👋\nPlease send me the price and details for the ${p.name}.`)}">Ask on WhatsApp</a>`}
          </div>
        </div>
      </article>`).join('');
    productsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-add]');
      if (!btn) return;
      changeQty(btn.dataset.add, 1);
      visit.track(`Added ${fullName(byId(btn.dataset.add))} to cart`);
      buzz(12);
      btn.textContent = 'Added ✓';
      btn.classList.add('is-added');
      setTimeout(() => { btn.textContent = 'Add to cart'; btn.classList.remove('is-added'); }, 1300);
      $$('[data-cart-open]').forEach((b) => { b.classList.remove('is-bump'); void b.offsetWidth; b.classList.add('is-bump'); });
    });
  }

  /* ───────── Reveal on scroll ───────── */
  const revealer = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      revealer.unobserve(e.target);
    });
  }, { threshold: .12, rootMargin: '0px 0px -5% 0px' });
  $$('[data-reveal]').forEach((el, i) => {
    el.style.transitionDelay = `${(i % 4) * 70}ms`;
    revealer.observe(el);
  });

  /* ───────── Cart (shared by every page) ───────── */
  const STORE = 'accessgrid-cart';
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(STORE)) || {}; } catch { cart = {}; }
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const lines = () => Object.entries(cart).map(([id, qty]) => ({ p: byId(id), qty })).filter((l) => l.p && l.p.price && l.qty > 0);
  const total = () => lines().reduce((sum, l) => sum + l.p.price * l.qty, 0);
  const cartLines = $('#cartLines');

  function renderCart() {
    const items = lines();
    const count = items.reduce((n, l) => n + l.qty, 0);
    $$('[data-cart-count]').forEach((b) => { b.textContent = count; b.hidden = count === 0; });
    cartLines.innerHTML = items.map(({ p, qty }) => `
      <li class="line-item">
        ${p.img ? `<span class="thumb"><img src="${p.img}" alt=""></span>` : `<span class="thumb ph"><svg aria-hidden="true"><use href="#${p.icon}"/></svg></span>`}
        <div>
          <h4>${p.name}</h4>
          ${p.variant ? `<small>${p.variant}</small><br>` : ''}
          <span class="qty"><button type="button" data-qty="${p.id}" data-d="-1" aria-label="Remove one">−</button><span>${qty}</span><button type="button" data-qty="${p.id}" data-d="1" aria-label="Add one">+</button></span>
        </div>
        <span class="line-item__price">${money(p.price * qty)}</span>
      </li>`).join('');
    $('#cartEmpty').hidden = items.length > 0;
    $('#cartFoot').hidden = items.length === 0;
    $('#cartTotal').textContent = money(total());
    $('#coTotal').textContent = money(total());
    try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch { /* private mode */ }
  }
  function changeQty(id, d) {
    const next = Math.min(50, (cart[id] || 0) + d);
    if (next <= 0) delete cart[id]; else cart[id] = next;
    renderCart();
    updatePayButton();
  }
  cartLines.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qty]');
    if (b) changeQty(b.dataset.qty, Number(b.dataset.d));
  });

  /* ───────── Drawer ───────── */
  const drawer = $('#drawer');
  const TITLES = { cart: 'Your cart', checkout: 'Checkout', done: 'Thank you' };
  let lastFocus = null;
  function showView(name) {
    $$('.drawer__view', drawer).forEach((v) => { v.hidden = v.dataset.view !== name; });
    $('#drawerTitle').textContent = TITLES[name];
  }
  function openDrawer() {
    setMenu(false);
    visit.track('Opened the cart', { once: true });
    lastFocus = document.activeElement;
    showView('cart');
    drawer.hidden = false;
    document.body.classList.add('is-locked');
    $('.drawer__x', drawer).focus();
  }
  function closeDrawer() {
    drawer.hidden = true;
    document.body.classList.remove('is-locked');
    lastFocus?.focus?.();
  }
  $$('[data-cart-open]').forEach((b) => b.addEventListener('click', openDrawer));
  drawer.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeDrawer(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) closeDrawer(); });
  $('#toCheckout').addEventListener('click', () => {
    visit.track('Started checkout', { hot: 'checkout', detail: `${money(total())} · ${lines().map((l) => `${l.qty} × ${fullName(l.p)}`).join(', ')}` });
    showView('checkout');
    updatePayButton();
    $('#coName').focus();
  });
  $('#backToCart').addEventListener('click', () => showView('cart'));

  /* ───────── Checkout ───────── */
  const form = $('#checkoutForm');
  const payBtn = $('#payBtn');
  const coError = $('#coError');
  const PAY_LABEL = { momo: 'Mobile Money', card: 'Card', showroom: 'Pay at the showroom' };
  const picked = (name) => form.elements[name].value;

  function updatePayButton() {
    const method = picked('pay');
    payBtn.textContent = method === 'showroom' ? 'Place order' : `Pay ${money(total())}`;
    $('#payNote').textContent = method === 'showroom'
      ? 'We hold your order and call you to confirm.'
      : PAYSTACK_PUBLIC_KEY ? 'Secure payment by Paystack.' : 'Demo checkout: nothing is charged.';
    $('#coAreaWrap').hidden = picked('fulfil') !== 'Delivery + installation';
    $('#coPin').hidden = picked('fulfil') !== 'Delivery + installation';
  }
  form.addEventListener('change', updatePayButton);

  function fail(message, field) {
    coError.textContent = message;
    coError.hidden = false;
    field?.focus();
  }
  function loadPaystack() {
    if (window.PaystackPop) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://js.paystack.co/v2/inline.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not reach Paystack'));
      document.head.append(s);
    });
  }
  // Resolves once money has moved (or the demo has pretended it did); rejects if the customer backs out.
  async function takePayment(order) {
    if (!PAYSTACK_PUBLIC_KEY) return new Promise((resolve) => setTimeout(resolve, 1400));
    await loadPaystack();
    return new Promise((resolve, reject) => {
      new window.PaystackPop().newTransaction({
        key: PAYSTACK_PUBLIC_KEY,
        email: order.email || `${order.phone.replace(/\D/g, '')}@orders.accessgridsolutions.com`,
        amount: order.total * 100, // pesewas
        currency: 'GHS',
        reference: order.ref,
        channels: [order.pay === 'momo' ? 'mobile_money' : 'card'],
        metadata: { name: order.name, phone: order.phone, fulfilment: order.fulfil, area: order.area, items: order.items.map((l) => `${l.qty} × ${fullName(l.p)}`).join('; ') },
        onSuccess: resolve,
        onCancel: () => reject(new Error('Payment was cancelled. Your cart is still here.')),
        onError: () => reject(new Error('The payment did not go through. Please try again.')),
      });
    });
  }
  function orderMessage(order, paidNote) {
    return [
      'Hello AccessGrid Solutions 👋',
      `Order ${order.ref}`,
      '',
      ...order.items.map((l) => `${l.qty} × ${fullName(l.p)} — ${money(l.p.price * l.qty)}`),
      `Total: ${money(order.total)}`,
      '',
      `${order.fulfil}${order.area ? ` — ${order.area}` : ''}`,
      ...(order.pin ? [`Pin: ${order.pin}`] : []),
      `Payment: ${paidNote}`,
      `Name: ${order.name}`,
      `Phone: ${order.phone}`,
    ].join('\n');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    coError.hidden = true;
    const order = {
      ref: `AG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      items: lines(),
      total: total(),
      name: $('#coName').value.trim(),
      phone: $('#coPhone').value.trim(),
      email: $('#coEmail').value.trim(),
      fulfil: picked('fulfil'),
      area: picked('fulfil') === 'Delivery + installation' ? $('#coArea').value.trim() : '',
      pin: picked('fulfil') === 'Delivery + installation' ? pinUrl() : '',
      pay: picked('pay'),
    };
    if (!order.items.length) return fail('Your cart is empty.');
    if (order.name.length < 2) return fail('Please enter your name.', $('#coName'));
    if (order.phone.replace(/\D/g, '').length < 9) return fail('Please enter a phone number we can reach you on.', $('#coPhone'));
    if (order.email && !$('#coEmail').checkValidity()) return fail('That email address does not look right.', $('#coEmail'));
    if (order.fulfil === 'Delivery + installation' && !order.area && !order.pin) return fail('Tell us the area to deliver to, or share your location.', $('#coArea'));

    const online = order.pay !== 'showroom';
    const demo = online && !PAYSTACK_PUBLIC_KEY;
    try {
      if (online) {
        payBtn.disabled = true;
        payBtn.textContent = 'Processing…';
        await takePayment(order);
      }
    } catch (err) {
      payBtn.disabled = false;
      updatePayButton();
      return fail(err.message);
    }
    payBtn.disabled = false;

    const paidNote = !online ? 'at the showroom' : demo ? `${PAY_LABEL[order.pay]} (demo, not charged)` : `${PAY_LABEL[order.pay]}, paid online`;
    $('#doneTitle').textContent = !online ? 'Order reserved' : demo ? 'Order placed' : 'Payment received';
    $('#doneText').textContent = order.fulfil === 'Pick up at showroom'
      ? `Thank you, ${order.name.split(' ')[0]}. We'll call ${order.phone} when your order is ready to collect.`
      : `Thank you, ${order.name.split(' ')[0]}. We'll call ${order.phone} to book your delivery and installation.`;
    $('#doneRef').textContent = order.ref;
    $('#doneLines').innerHTML = order.items.map((l) => `<li class="line-item"><div><h4>${l.qty} × ${l.p.name}</h4>${l.p.variant ? `<small>${l.p.variant}</small>` : ''}</div><span class="line-item__price">${money(l.p.price * l.qty)}</span></li>`).join('');
    $('#doneTotal').textContent = money(order.total);
    $('#doneDemo').hidden = !demo;
    $('#doneWa').href = waLink(orderMessage(order, paidNote));
    // the visitor's name, phone and area stay out of the notification on purpose
    visit.track('Placed an order', { hot: 'order', detail: `${order.ref} · ${money(order.total)} · ${order.items.map((l) => `${l.qty} × ${fullName(l.p)}`).join(', ')} · ${order.fulfil} · paid ${paidNote}` });
    buzz([20, 40, 30]);

    cart = {};
    renderCart();
    updatePayButton();
    showView('done');
  });

  renderCart();
  updatePayButton();
  wirePin($('#coPin'), 'order');

  /* ───────── Smart locks page: the lock you can operate ───────── */
  const demoLock = $('[data-lock="demo"]');
  if (demoLock) {
    buildLock(demoLock, true);
    const wayButtons = $$('#waysList button');
    const waysDesc = $('#waysDesc');
    const selectWay = (way, run = true) => {
      wayButtons.forEach((b) => {
        const on = b.dataset.way === way;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on);
        if (on) waysDesc.textContent = $('em', b).textContent;
      });
      if (run) {
        visit.track(`Tried the ${{ finger: 'fingerprint', code: 'PIN code', card: 'RFID card', app: 'Tuya app', key: 'key' }[way]} unlock`);
        play(demoLock, way);
      }
    };
    wayButtons.forEach((b) => b.addEventListener('click', () => selectWay(b.dataset.way)));
    selectWay('finger', false);
    $('.lock__finger', demoLock).addEventListener('click', () => selectWay('finger'));

    // first time the lock is on screen, it shows what it does
    const once = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting) return;
      once.disconnect();
      setTimeout(() => { if (demoLock.dataset.state === 'locked') play(demoLock, 'finger'); }, 700);
    }, { threshold: .5 });
    once.observe(demoLock);

    // the keypad really works: 1957 opens, anything else is refused
    let code = '';
    let codeIdle;
    const submitCode = () => {
      const entered = code;
      code = '';
      clearTimeout(codeIdle);
      if (!entered) return;
      visit.track(entered === '1957' ? 'Typed the right PIN on the keypad' : 'Typed a wrong PIN on the keypad');
      later(demoLock, () => (entered === '1957' ? grant(demoLock) : deny(demoLock)), 220);
    };
    $$('.lock__key', demoLock).forEach((k) => k.addEventListener('click', () => {
      const v = k.dataset.k;
      if (demoLock.dataset.method !== 'code' || demoLock.dataset.state !== 'scan' || !code) {
        clearLock(demoLock);
        code = '';
        selectWay('code', false);
        demoLock.dataset.method = 'code';
        demoLock.dataset.state = 'scan';
      }
      lightKey(demoLock, v);
      buzz(8);
      clearTimeout(codeIdle);
      if (v === '*') { code = ''; relock(demoLock); return; }
      if (v === '#') { submitCode(); return; }
      code += v;
      screen(demoLock, '●'.repeat(code.length));
      if (code.length === 4) submitCode();
      else codeIdle = setTimeout(() => { code = ''; relock(demoLock); }, 5000);
    }));
  }

  /* ───────── Hotels page: the room grid ───────── */
  const roomsEl = $('#rooms');
  if (roomsEl) {
    const logEl = $('#boardLog');
    const statsEl = $('#boardStats');
    const detailEl = $('#roomDetail');
    const rooms = [];
    let selected = null;
    const clock = () => new Date().toLocaleTimeString('en-GB', { hour12: false });
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const visible = (r) => r.el.offsetParent !== null; // phones show six rooms a floor

    const paint = () => {
      let occ = 0;
      let low = 0;
      const shown = rooms.filter(visible);
      rooms.forEach((r) => {
        r.el.classList.toggle('is-occ', r.occ);
        r.el.classList.toggle('is-low', r.battery < 20);
        r.el.classList.toggle('is-sel', r === selected);
        r.el.setAttribute('aria-label', `Room ${r.no}, ${r.occ ? 'occupied' : 'vacant'}`);
        if (!shown.includes(r)) return;
        if (r.occ) occ++;
        if (r.battery < 20) low++;
      });
      statsEl.textContent = `${occ} occupied · ${shown.length - occ} vacant · ${low} low battery`;
      if (selected) {
        detailEl.innerHTML = `<span class="mono">Room · ${selected.occ ? 'occupied' : 'vacant'}</span><b>${selected.no}</b>
          <p>Last entry: ${selected.last}<br>Lock battery: ${selected.battery}%${selected.battery < 20 ? ' — replace soon' : ''}</p>`;
      }
    };
    for (let floor = 1; floor <= 4; floor++) {
      for (let n = 1; n <= 8; n++) {
        const room = { no: floor * 100 + n, occ: Math.random() < .58, battery: 62 + Math.floor(Math.random() * 37), last: '—', el: document.createElement('button') };
        room.el.type = 'button';
        room.el.className = 'room';
        room.el.innerHTML = `<span>${room.no}</span><i></i>`;
        room.el.addEventListener('click', () => { selected = room; buzz(8); visit.track('Explored the hotel room grid', { once: true }); paint(); });
        roomsEl.append(room.el);
        rooms.push(room);
      }
    }
    [rooms[4], rooms[19]].forEach((r) => { r.battery = 9 + Math.floor(Math.random() * 6); });

    const tick = () => {
      const pool = rooms.filter(visible);
      const room = pick(pool.length ? pool : rooms);
      let what;
      const roll = Math.random();
      if (room.occ && roll < .62) what = pick(['Guest card · door opened', 'Guest card · door opened', 'Housekeeping card · door opened']);
      else if (room.occ) { room.occ = false; what = 'Checked out · card expired'; }
      else if (roll < .7) { room.occ = true; what = 'Checked in · card issued'; }
      else what = 'Master card · inspection';
      room.last = `${clock().slice(0, 5)} · ${what.split(' · ')[0]}`;
      room.el.classList.add('is-flash');
      setTimeout(() => room.el.classList.remove('is-flash'), 700);
      const li = document.createElement('li');
      li.innerHTML = `<time>${clock()}</time><b>Room ${room.no}</b><span></span><span>${what}</span>`;
      logEl.prepend(li);
      while (logEl.children.length > 6) logEl.lastChild.remove();
      paint();
    };
    paint();
    [0, 1, 2].forEach(tick);
    let timer;
    new IntersectionObserver((entries) => {
      clearInterval(timer);
      if (entries[0].isIntersecting && !reduceMotion) timer = setInterval(tick, 1700);
    }, { threshold: .15 }).observe($('.board'));
  }

  /* ───────── CCTV page: live clock on the feed ───────── */
  const feedClock = $('#feedClock');
  if (feedClock) {
    const tickClock = () => { const d = new Date(); feedClock.textContent = `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour12: false })}`; };
    tickClock();
    setInterval(tickClock, 1000);
  }

  /* ───────── Quote page: builder → WhatsApp ───────── */
  if ($('#builder')) {
    const quote = { space: 'Home', needs: new Set(['Smart locks']), doors: 2 };
    const doorsRange = $('#doorsRange');
    const fArea = $('#fArea');
    const fName = $('#fName');
    const needChips = $$('.chips[data-group="needs"] .chip');
    const spaceChips = $$('.chips[data-group="space"] .chip');

    const render = () => {
      const doors = quote.doors >= 200 ? '200+' : String(quote.doors);
      $('#doorsOut').textContent = doors;
      const msg = [
        'Hello AccessGrid Solutions 👋',
        "I'd like a quote, please.",
        '',
        `• Space: ${quote.space}`,
        `• I need: ${[...quote.needs].join(', ') || 'Not sure yet, please advise'}`,
        `• Doors: ${doors}`,
        ...(fArea.value.trim() ? [`• Area: ${fArea.value.trim()}`] : []),
        ...(fName.value.trim() ? [`• Name: ${fName.value.trim()}`] : []),
        ...(pinUrl() ? [`• Pin: ${pinUrl()}`] : []),
      ].join('\n');
      $('#msgPreview').textContent = msg;
      $('#waSend').href = waLink(msg);
    };
    const setNeed = (chip, on) => {
      chip.classList.toggle('is-on', on);
      chip.setAttribute('aria-pressed', on);
      quote.needs[on ? 'add' : 'delete'](chip.dataset.v);
    };
    const setSpace = (chip) => {
      spaceChips.forEach((c) => { c.classList.toggle('is-on', c === chip); c.setAttribute('aria-pressed', c === chip); });
      quote.space = chip.dataset.v;
    };
    needChips.forEach((chip) => {
      chip.setAttribute('aria-pressed', chip.classList.contains('is-on'));
      chip.addEventListener('click', () => { setNeed(chip, !chip.classList.contains('is-on')); buzz(8); render(); });
    });
    spaceChips.forEach((chip) => {
      chip.setAttribute('aria-pressed', chip.classList.contains('is-on'));
      chip.addEventListener('click', () => {
        setSpace(chip);
        if (chip.dataset.v.startsWith('Hotel')) setNeed(needChips.find((c) => c.dataset.v === 'Hotel lock system'), true);
        buzz(8);
        render();
      });
    });
    // Links like quote.html?need=Smart+CCTV arrive with that choice already made.
    const params = new URLSearchParams(location.search);
    const wantNeed = needChips.find((c) => c.dataset.v === params.get('need'));
    const wantSpace = spaceChips.find((c) => c.dataset.v === params.get('space'));
    if (wantNeed) needChips.forEach((c) => setNeed(c, c === wantNeed));
    if (wantSpace) setSpace(wantSpace);

    const setDoors = (n) => { quote.doors = Math.min(200, Math.max(1, n)); doorsRange.value = quote.doors; render(); };
    $$('.doors__btn').forEach((b) => b.addEventListener('click', () => setDoors(quote.doors + Number(b.dataset.step))));
    doorsRange.addEventListener('input', () => setDoors(Number(doorsRange.value)));
    [fArea, fName].forEach((f) => f.addEventListener('input', render));
    $('#builder').addEventListener('submit', (e) => e.preventDefault());
    wirePin($('#quotePin'), 'quote request', render);
    $('#waSend').addEventListener('click', () => visit.track('Sent a quote request', { hot: 'quote', detail: `${quote.space} · ${[...quote.needs].join(', ') || 'not sure yet'} · ${quote.doors >= 200 ? '200+' : quote.doors} doors` }));
    render();
  }
})();
