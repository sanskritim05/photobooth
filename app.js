(function () {
  const $ = (sel) => document.querySelector(sel);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const POSES = 4;
  const FILMS = [
    { id: 'color', label: 'color' },
    { id: 'bw', label: 'b&w' },
    { id: 'sepia', label: 'sepia' },
  ];

  const state = {
    raw: [],         
    film: 'bw',
    frame: 'classic',
    backdrop: 'none',
    shot: 0,         
    caption: defaultCaption(),
    sound: true,
    stream: null,
    busy: false,
    run: 0,          
  };
  let developed = {}; 

  const el = {};
  ['outside', 'inside', 'pickup', 'booth', 'curtain', 'coin', 'hint', 'pickupBtn', 'eject', 'ejectImg',
    'ejectDark', 'rivets', 'video', 'vfMsg', 'vfText', 'vfActions', 'retryBtn', 'fileInput', 'countdown',
    'flash', 'poseLabel', 'poseDots', 'shootBtn', 'filmTiles', 'thumbs', 'leaveBtn', 'soundBtn', 'out',
    'stripGrid', 'singleGrid', 'shotRow', 'shotGrid', 'filmSeg', 'caption', 'captionRow', 'downloadBtn',
    'retakeBtn', 'homeBtn', 'swatches', 'backdropInput'].forEach((id) => (el[id] = document.getElementById(id)));

  const fontsReady = Promise.all([
    document.fonts.load('700 40px "Stardos Stencil"'),
    document.fonts.load('500 40px "DM Mono"'),
    document.fonts.load('700 40px "DM Sans"'),
    document.fonts.load('400 40px "DM Sans"'),
    document.fonts.load('500 40px "Caveat"'),
  ]).catch(() => {});

  function defaultCaption() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `photos · ${p(d.getMonth() + 1)}.${p(d.getDate())}.${String(d.getFullYear()).slice(2)}`;
  }

  // ───────── sound: only the shutter and the printer ─────────
  const sfx = (() => {
    let ac, printer;
    const ctx = () => (ac ||= new (window.AudioContext || window.webkitAudioContext)());
    function noise(dur, gain, freq, delay = 0) {
      if (!state.sound) return;
      const a = ctx(), t = a.currentTime + delay;
      const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = buf;
      f.type = 'highpass';
      f.frequency.value = freq;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(a.destination);
      src.start(t);
    }
    return {
      unlock: () => ctx().resume?.(),
      shutter: () => { noise(0.05, 0.35, 2500); noise(0.08, 0.25, 1600, 0.07); },
      // a little toy printer: a soft wobbly hum that rises as the paper moves,
      // tiny feed ticks, and a two-note ding when the strip is out
      whirr() {
        this.stop();
        if (!state.sound) return;
        const a = ctx(), t = a.currentTime;
        const out = a.createGain();
        out.connect(a.destination);
        printer = out;

        const blip = (freq, at, dur, gain, type = 'sine') => {
          const o = a.createOscillator(), g = a.createGain();
          o.type = type;
          o.frequency.value = freq;
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
          o.connect(g).connect(out);
          o.start(at);
          o.stop(at + dur + 0.02);
        };

        // segments line up with the strip's stop-and-go in eject()
        [[0, 0.9], [1.2, 2.24], [2.46, 3.2]].forEach(([s, e], i) => {
          const o = a.createOscillator(), lfo = a.createOscillator(), depth = a.createGain();
          const f = a.createBiquadFilter(), g = a.createGain();
          const base = 330 + i * 40;
          o.type = 'triangle';
          o.frequency.setValueAtTime(base, t + s);
          o.frequency.linearRampToValueAtTime(base * 1.18, t + e);
          lfo.frequency.value = 14;
          depth.gain.value = 9;
          lfo.connect(depth).connect(o.frequency);
          f.type = 'lowpass';
          f.frequency.value = 1400;
          g.gain.setValueAtTime(0.0001, t + s);
          g.gain.linearRampToValueAtTime(0.03, t + s + 0.06);
          g.gain.setValueAtTime(0.03, t + e - 0.08);
          g.gain.linearRampToValueAtTime(0.0001, t + e);
          o.connect(f).connect(g).connect(out);
          [o, lfo].forEach((n) => { n.start(t + s); n.stop(t + e + 0.05); });
          for (let at = s + 0.05; at < e - 0.04; at += 0.11) blip(2100, t + at, 0.025, 0.018);
        });

        blip(1047, t + 3.28, 0.5, 0.07);       // C6
        blip(1319, t + 3.42, 0.7, 0.07);       // E6
        blip(2638, t + 3.42, 0.35, 0.012);     // a little sparkle on top
      },
      stop() {
        printer?.disconnect();
        printer = null;
      },
    };
  })();

  // ───────── film processing ─────────
  function develop(src, film) {
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, 0, 0);
    const img = x.getImageData(0, 0, c.width, c.height), p = img.data;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], g = p[i + 1], b = p[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      if (film === 'color') {
        p[i] = (l + (r - l) * 1.12 - 128) * 1.06 + 131;
        p[i + 1] = (l + (g - l) * 1.12 - 128) * 1.06 + 128;
        p[i + 2] = (l + (b - l) * 1.12 - 128) * 1.06 + 124;
      } else {
        const v = (l - 128) * 1.22 + 132;
        if (film === 'bw') {
          p[i] = p[i + 1] = p[i + 2] = v;
        } else {
          p[i] = v * 0.96 + 34;
          p[i + 1] = v * 0.86 + 20;
          p[i + 2] = v * 0.66 + 6;
        }
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  function photos() {
    return (developed[state.film] ||= state.raw.map((c) => develop(c, state.film)));
  }

  function renderFrame(frame, scale, canvas = document.createElement('canvas')) {
    canvas.width = Math.round(frame.W * scale);
    canvas.height = Math.round(frame.H * scale);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    frame.draw(ctx, photos(), { caption: state.caption, shot: state.shot, date: new Date() });
    return canvas;
  }

  function coverInto(canvas, img) {
    const ctx = canvas.getContext('2d');
    const s = Math.max(canvas.width / img.width, canvas.height / img.height);
    const sw = canvas.width / s, sh = canvas.height / s;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  }

  // ───────── scenes ─────────
  function show(name) {
    ['outside', 'inside', 'pickup'].forEach((k) => (el[k].hidden = k !== name));
    window.scrollTo(0, 0);
  }

  async function enterBooth() {
    if (el.booth.classList.contains('zoom')) return;
    sfx.unlock();
    clearStrip();
    el.booth.classList.add('zoom');
    await wait(720);
    stepInside();
  }

  function stepInside() {
    clearStrip();
    show('inside');
    el.inside.classList.remove('open');
    void el.inside.offsetWidth;
    el.inside.classList.add('open');
    state.raw = [];
    developed = {};
    paintSessionThumbs();
    setPose(0, `${POSES} poses · get ready`, false);
    el.countdown.textContent = '';
    startCamera();
  }

  function goOutside() {
    const b = el.booth;
    b.classList.add('instant', 'zoom');
    show('outside');
    void b.getBoundingClientRect();
    b.classList.remove('instant', 'zoom');
  }

  function leaveBooth() {
    sfx.stop();
    state.run++;
    state.busy = false;
    stopCamera();
    goOutside();
    el.hint.textContent = 'drop a coin or step behind the curtain';
  }

  // ───────── camera ─────────
  function vfMessage(msg, withActions = false) {
    el.vfMsg.hidden = !msg;
    el.vfText.textContent = msg || '';
    el.vfActions.hidden = !withActions;
  }

  async function startCamera() {
    el.shootBtn.disabled = true;
    vfMessage('waking up the camera…');
    if (!navigator.mediaDevices?.getUserMedia) {
      vfMessage('this browser can’t reach a camera from here. open the booth over http://localhost or https.', true);
      return;
    }
    try {
      stopCamera();
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      if (el.inside.hidden) return stopCamera(); // left while the prompt was open
      el.video.srcObject = state.stream;
      await el.video.play();
      vfMessage(null);
      el.shootBtn.disabled = false;
      el.shootBtn.focus({ preventScroll: true });
    } catch (err) {
      const blocked = err && err.name === 'NotAllowedError';
      vfMessage(blocked
        ? 'camera access is blocked. allow it from the address bar, then try again.'
        : 'couldn’t find a camera.', true);
    }
  }

  function stopCamera() {
    state.stream?.getTracks().forEach((t) => t.stop());
    state.stream = null;
    el.video.srcObject = null;
  }

  function grab() {
    const v = el.video;
    const s = Math.min(1, 1280 / v.videoWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * s);
    c.height = Math.round(v.videoHeight * s);
    const x = c.getContext('2d');
    x.translate(c.width, 0);
    x.scale(-1, 1); // keep it mirrored, like the preview
    x.drawImage(v, 0, 0, c.width, c.height);
    return c;
  }

  // ───────── the session ─────────
  function setPose(done, label, active = true) {
    el.poseLabel.textContent = label;
    [...el.poseDots.children].forEach((d, i) => {
      d.className = i < done ? 'done' : i === done && active ? 'now' : '';
    });
  }

  function count(n) {
    const c = el.countdown;
    c.classList.remove('tick');
    c.textContent = n;
    void c.offsetWidth;
    if (n !== '') c.classList.add('tick');
  }

  function flash() {
    el.flash.classList.remove('go');
    void el.flash.offsetWidth;
    el.flash.classList.add('go');
  }

  function paintSessionThumbs() {
    [...el.thumbs.children].forEach((span, i) => {
      span.innerHTML = '';
      if (!state.raw[i]) return;
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 72;
      coverInto(c, state.raw[i]);
      span.append(c);
    });
  }

  async function shoot() {
    if (state.busy || !state.stream) return;
    sfx.unlock();
    const run = ++state.run;
    state.busy = true;
    el.shootBtn.disabled = true;
    state.raw = [];
    developed = {};
    paintSessionThumbs();

    for (let i = 0; i < POSES; i++) {
      setPose(i, `pose ${i + 1} of ${POSES}`);
      for (const n of [3, 2, 1]) {
        if (run !== state.run) return;
        count(n);
        await wait(850);
      }
      if (run !== state.run) return;
      count('');
      flash();
      sfx.shutter();
      state.raw.push(grab());
      paintSessionThumbs();
      setPose(i + 1, i < POSES - 1 ? 'nice! next pose…' : 'that’s a wrap', false);
      await wait(i < POSES - 1 ? 1200 : 900);
    }
    if (run !== state.run) return;
    state.busy = false;
    finish();
  }

  function finish() {
    stopCamera();
    state.shot = 0;
    goOutside();
    eject();
  }

  // ───────── the print slot ─────────
  function clearStrip() {
    sfx.stop();
    el.eject.getAnimations?.().forEach((a) => a.cancel());
    el.ejectImg.getAnimations?.().forEach((a) => a.cancel());
    el.eject.style.display = 'none';
    el.pickupBtn.hidden = true;
  }

  async function eject() {
    await fontsReady;
    const f = FRAMES.get(state.frame);
    const frame = f.kind === 'strip' ? f : FRAMES.get('classic');
    const h = (52 * frame.H) / frame.W;
    el.ejectImg.setAttribute('href', renderFrame(frame, 0.3).toDataURL('image/png'));
    el.ejectImg.setAttribute('height', h);
    el.ejectDark.setAttribute('height', h);
    el.eject.style.display = '';
    el.hint.textContent = 'printing…';

    await wait(500);
    sfx.whirr();
    const at = (k) => ({ transform: `translateY(${-h * k}px)` });
    const slide = el.eject.animate(
      [at(1), { ...at(0.62), offset: 0.28 }, { ...at(0.62), offset: 0.38 }, { ...at(0.25), offset: 0.7 }, { ...at(0.25), offset: 0.77 }, at(0)],
      { duration: 3200, easing: 'ease-in-out', fill: 'forwards' }
    );
    el.ejectImg.animate([{ opacity: 0 }, { opacity: 0, offset: 0.3 }, { opacity: 1 }], { duration: 5200, fill: 'forwards' });
    try { await slide.finished; } catch { return; } // cancelled
    el.hint.textContent = 'your strip is ready';
    el.pickupBtn.hidden = false;
  }

  // ───────── pickup ─────────
  function buildFilmControls() {
    FILMS.forEach((f) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.textContent = f.label;
      tile.dataset.film = f.id;
      tile.setAttribute('role', 'radio');
      tile.onclick = () => setFilm(f.id);
      el.filmTiles.append(tile);

      const seg = tile.cloneNode(true);
      seg.className = '';
      seg.onclick = () => setFilm(f.id);
      el.filmSeg.append(seg);
    });
    syncFilm();
  }

  function syncFilm() {
    document.querySelectorAll('[data-film]').forEach((b) => b.setAttribute('aria-checked', b.dataset.film === state.film));
    el.video.className = `film-${state.film}`;
    el.thumbs.className = `thumbs film-${state.film}`;
  }

  function setFilm(id) {
    state.film = id;
    syncFilm();
    if (!el.pickup.hidden) renderPickup();
  }

  function buildFrameGrid() {
    FRAMES.list.forEach((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'frame-btn';
      b.dataset.frame = f.id;
      b.innerHTML = `<span class="frame-thumb"><canvas></canvas></span><span>${f.name}</span>`;
      b.onclick = () => selectFrame(f.id);
      (f.kind === 'strip' ? el.stripGrid : el.singleGrid).append(b);
    });
  }

  function selectFrame(id) {
    state.frame = id;
    const f = FRAMES.get(id);
    document.querySelectorAll('.frame-btn').forEach((b) => b.setAttribute('aria-pressed', b.dataset.frame === id));
    el.shotRow.hidden = f.kind !== 'single';
    el.captionRow.hidden = !f.usesCaption;
    renderPreview();
  }

  // with a backdrop, the print is laid on it story-sized (1080 × 1920), tilted and taped
  function renderOutput(canvas) {
    const f = FRAMES.get(state.frame);
    const b = BACKDROPS.get(state.backdrop);
    canvas.classList.toggle('composed', !!b);
    if (!b) return renderFrame(f, 1, canvas);
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(BACKDROPS.render(b, 1080, 1920), 0, 0);
    const art = renderFrame(f, Math.min(840 / f.W, 1580 / f.H));
    ctx.save();
    ctx.translate(540, 980);
    ctx.rotate(-0.04);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 24;
    ctx.drawImage(art, -art.width / 2, -art.height / 2);
    ctx.restore();
    if (f.kind === 'strip' || f.id === 'polaroid') {
      ctx.translate(0, -art.height / 2);
      ctx.rotate(0.09);
      ctx.fillStyle = 'rgba(244, 239, 225, .78)';
      ctx.fillRect(-105, -32, 210, 64);
      ctx.fillStyle = 'rgba(255, 255, 255, .35)';
      for (let x = -105; x < 105; x += 14) ctx.fillRect(x, -32, 6, 64);
    }
    ctx.restore();
    return canvas;
  }

  function renderPreview() {
    renderOutput(el.out);
  }

  function addSwatch(b) {
    const s = document.createElement('button');
    s.type = 'button';
    s.className = 'swatch';
    s.dataset.backdrop = b ? b.id : 'none';
    s.setAttribute('role', 'radio');
    s.setAttribute('aria-label', b ? b.name : 'no backdrop');
    s.title = b ? b.name : 'none';
    if (b) {
      const c = document.createElement('canvas');
      c.width = 92;
      c.height = 156;
      c.getContext('2d').drawImage(BACKDROPS.render(b, 92, 156), 0, 0);
      s.append(c);
    } else {
      s.textContent = 'none';
    }
    s.onclick = () => selectBackdrop(s.dataset.backdrop);
    el.swatches.insertBefore(s, el.swatches.lastElementChild);
  }

  function buildSwatches() {
    el.swatches.querySelectorAll('.swatch:not(.add)').forEach((s) => s.remove());
    addSwatch(null);
    BACKDROPS.list.forEach(addSwatch);
    syncSwatches();
  }

  function syncSwatches() {
    el.swatches.querySelectorAll('[data-backdrop]').forEach((s) => s.setAttribute('aria-checked', s.dataset.backdrop === state.backdrop));
  }

  function selectBackdrop(id) {
    state.backdrop = id;
    syncSwatches();
    renderPreview();
  }

  // thumbnail box per kind, in CSS px; matches .frame-thumb heights in style.css
  const THUMB_BOX = { strip: [100, 230], single: [100, 130] };

  function renderFrameThumbs() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    document.querySelectorAll('.frame-btn').forEach((b) => {
      const f = FRAMES.get(b.dataset.frame);
      const [bw, bh] = THUMB_BOX[f.kind];
      const s = Math.min(bw / f.W, bh / f.H);
      const c = renderFrame(f, s * dpr, b.querySelector('canvas'));
      c.style.width = `${Math.round(f.W * s)}px`;
      c.style.height = `${Math.round(f.H * s)}px`;
    });
  }

  function renderShots() {
    el.shotGrid.innerHTML = '';
    photos().forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'shot-btn';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', i === state.shot);
      b.setAttribute('aria-label', `shot ${i + 1}`);
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 120;
      coverInto(c, p);
      b.append(c);
      b.onclick = () => {
        state.shot = i;
        [...el.shotGrid.children].forEach((x, j) => x.setAttribute('aria-checked', j === i));
        renderPreview();
        renderFrameThumbs();
      };
      el.shotGrid.append(b);
    });
  }

  function renderPickup() {
    selectFrame(state.frame);
    renderFrameThumbs();
    renderShots();
  }

  async function openPickup() {
    if (!state.raw.length) return;
    sfx.stop();
    await fontsReady;
    show('pickup');
    el.caption.value = state.caption;
    if (!el.swatches.querySelector('[data-backdrop]')) buildSwatches();
    renderPickup();
  }

  function download() {
    el.out.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const extra = state.backdrop === 'none' ? '' : `-${state.backdrop}`;
      a.download = `photobooth-${state.frame}${extra}-${Date.now()}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  }

  // ───────── uploads (no camera) ─────────
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async function useUploads(files) {
    files = [...files].filter((f) => f.type.startsWith('image/')).slice(0, POSES);
    if (!files.length) return;
    const imgs = await Promise.all(files.map(loadImage));
    state.raw = Array.from({ length: POSES }, (_, i) => {
      const img = imgs[i % imgs.length];
      const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c;
    });
    developed = {};
    finish();
  }

  // ───────── wiring ─────────
  function buildRivets() {
    const add = (cx, cy) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', cx);
      c.setAttribute('cy', cy);
      c.setAttribute('r', 1.7);
      el.rivets.append(c);
    };
    for (let x = 102; x <= 271; x += 21) { add(x, 183); add(x, 389); }
    for (let y = 206; y <= 366; y += 23) { add(101, y); add(271, y); }
  }

  function asButton(node, fn) {
    node.addEventListener('click', fn);
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
    });
  }

  buildRivets();
  buildFilmControls();
  buildFrameGrid();
  el.caption.value = state.caption;

  asButton(el.coin, enterBooth);
  asButton(el.curtain, enterBooth);
  asButton(el.eject, openPickup);
  el.pickupBtn.onclick = openPickup;
  el.shootBtn.onclick = shoot;
  el.leaveBtn.onclick = leaveBooth;
  el.retryBtn.onclick = startCamera;
  el.fileInput.onchange = () => useUploads(el.fileInput.files);
  el.backdropInput.onchange = async () => {
    const file = el.backdropInput.files[0];
    if (!file) return;
    const b = BACKDROPS.add(`yours-${Date.now()}`, 'yours', await loadImage(file));
    addSwatch(b);
    selectBackdrop(b.id);
    el.backdropInput.value = '';
  };
  BACKDROPS.loadFiles().then(() => { if (el.swatches.querySelector('[data-backdrop]')) buildSwatches(); });
  el.soundBtn.onclick = () => {
    state.sound = !state.sound;
    el.soundBtn.textContent = state.sound ? 'sound on' : 'sound off';
    el.soundBtn.setAttribute('aria-pressed', state.sound);
  };

  let captionTimer;
  el.caption.addEventListener('input', () => {
    state.caption = el.caption.value;
    renderPreview();
    clearTimeout(captionTimer);
    captionTimer = setTimeout(renderFrameThumbs, 250);
  });
  el.downloadBtn.onclick = download;
  el.retakeBtn.onclick = () => { sfx.unlock(); stepInside(); };
  el.homeBtn.onclick = goOutside;

  document.addEventListener('keydown', (e) => {
    if (!el.inside.hidden) {
      if (e.key === 'Escape') leaveBooth();
      else if (e.key === ' ' && !e.target.closest('button, input, label')) { e.preventDefault(); shoot(); }
    } else if (!el.pickup.hidden && e.key === 'Escape') {
      goOutside();
    }
  });
})();
