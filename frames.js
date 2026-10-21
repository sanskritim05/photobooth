/* Frame designs. Each frame draws itself in its own pixel space (W × H);
   app.js scales the context for previews and thumbnails.
   draw(ctx, photos, { caption, shot, date }) — photos are 4 developed canvases. */
(function () {
  const STENCIL = '"Stardos Stencil", Georgia, serif';
  const MONO = '"DM Mono", ui-monospace, monospace';
  const SANS = '"DM Sans", system-ui, sans-serif';
  const HAND = '"Caveat", "Comic Sans MS", cursive';

  // ───────── helpers ─────────
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  // draw img into the box, cropping to fill (like object-fit: cover)
  function cover(ctx, img, x, y, w, h) {
    const s = Math.max(w / img.width, h / img.height);
    const sw = w / s, sh = h / s;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  }

  let noiseTile;
  function grain(ctx, W, H, alpha) {
    if (!noiseTile) {
      noiseTile = document.createElement('canvas');
      noiseTile.width = noiseTile.height = 128;
      const n = noiseTile.getContext('2d');
      const d = n.createImageData(128, 128);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = Math.random() < 0.5 ? 0 : 255;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
        d.data[i + 3] = Math.random() * 255;
      }
      n.putImageData(d, 0, 0);
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = ctx.createPattern(noiseTile, 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function text(ctx, str, x, y, font, color, o = {}) {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    if (o.spacing) ctx.letterSpacing = o.spacing + 'px';
    if (o.shadow) { ctx.shadowColor = o.shadow; ctx.shadowBlur = o.blur || 10; }
    if (o.stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = o.strokeWidth || 8;
      ctx.strokeStyle = o.stroke;
      o.max ? ctx.strokeText(str, x, y, o.max) : ctx.strokeText(str, x, y);
    }
    o.max ? ctx.fillText(str, x, y, o.max) : ctx.fillText(str, x, y);
    ctx.restore();
  }

  function star(ctx, cx, cy, R, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 ? r : R;
      ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
  }

  // seeded random so patterned frames look the same every render
  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function silver(ctx, y, h) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#f2f2f0');
    g.addColorStop(0.08, '#dcdcda');
    g.addColorStop(0.5, '#c6c6c4');
    g.addColorStop(0.93, '#b2b2b0');
    g.addColorStop(1, '#9a9a98');
    return g;
  }

  function knob(ctx, x, y, r) {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#fbfbfa');
    g.addColorStop(1, '#a3a3a1');
    circle(ctx, x, y, r);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.stroke();
  }

  function battery(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, 54, 26);
    ctx.fillRect(x + 54, y + 8, 5, 10);
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 5 + i * 16, y + 5, 12, 16);
    ctx.restore();
  }

  function screenGlare(ctx, x, y, w, h) {
    const g = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
    g.addColorStop(0, 'rgba(255,255,255,.14)');
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }

  function dateStamp(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)} ${p(d.getDate())} '${String(d.getFullYear()).slice(2)}`;
  }

  function photoEdge(ctx, s) {
    ctx.strokeStyle = 'rgba(0,0,0,.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(s.x + 1, s.y + 1, s.w - 2, s.h - 2);
  }

  function matted(ctx, img, s, m, color) {
    ctx.fillStyle = color;
    ctx.fillRect(s.x - m, s.y - m, s.w + m * 2, s.h + m * 2);
    cover(ctx, img, s.x, s.y, s.w, s.h);
    photoEdge(ctx, s);
  }

  // ───────── strips: 4 photos stacked ─────────
  function strip(cfg) {
    const W = cfg.W || 600;
    const padX = cfg.padX ?? 44, padTop = cfg.padTop ?? 44, gap = cfg.gap ?? 26, footer = cfg.footer ?? 150;
    const pw = W - padX * 2, ph = Math.round(pw * 0.75);
    const H = padTop + ph * 4 + gap * 3 + footer;
    const L = {
      W, H, footer,
      footerY: H - footer,
      slots: [0, 1, 2, 3].map((i) => ({ x: padX, y: padTop + i * (ph + gap), w: pw, h: ph })),
    };
    return {
      id: cfg.id, name: cfg.name, kind: 'strip', usesCaption: true, W, H,
      draw(ctx, photos, o) {
        ctx.save();
        cfg.bg(ctx, L);
        L.slots.forEach((s, i) => cfg.photo(ctx, photos[i % photos.length], s, i));
        cfg.label(ctx, L, o.caption);
        ctx.restore();
      },
    };
  }

  const classic = strip({
    id: 'classic', name: 'classic',
    bg(ctx, { W, H }) {
      ctx.fillStyle = '#f2ede0';
      ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, 0.07);
    },
    photo(ctx, img, s) { cover(ctx, img, s.x, s.y, s.w, s.h); photoEdge(ctx, s); },
    label(ctx, { W, footerY, footer }, cap) {
      text(ctx, cap, W / 2, footerY + footer / 2 - 4, `700 46px ${STENCIL}`, '#5d6265', { max: W - 80 });
    },
  });

  const cherry = strip({
    id: 'cherry', name: 'cherry', padX: 52, gap: 30,
    bg(ctx, { W, H }) {
      ctx.fillStyle = '#7a1424';
      ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, 0.08);
    },
    photo: (ctx, img, s) => matted(ctx, img, s, 7, '#fbf7ee'),
    label(ctx, { W, footerY, footer }, cap) {
      text(ctx, cap, W / 2, footerY + footer / 2 - 4, `700 44px ${STENCIL}`, '#f4efe1', { max: W - 80 });
    },
  });

  const charcoal = strip({
    id: 'charcoal', name: 'charcoal', padX: 50, gap: 30,
    bg(ctx, { W, H }) {
      ctx.fillStyle = '#38393b';
      ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, 0.08);
    },
    photo: (ctx, img, s) => matted(ctx, img, s, 10, '#e9e8e4'),
    label(ctx, { W, footerY, footer }, cap) {
      text(ctx, cap.toUpperCase(), W / 2, footerY + footer / 2 - 4, `500 30px ${MONO}`, '#e9e8e4', { max: W - 80, spacing: 4 });
    },
  });

  const film = strip({
    id: 'film', name: 'film', padX: 84, padTop: 64, gap: 34, footer: 140,
    bg(ctx, { W, H, slots, footerY }) {
      ctx.fillStyle = '#f7f6f1';
      ctx.fillRect(0, 0, W, H);
      const top = 36, bottom = footerY + 28;
      ctx.fillStyle = '#111';
      ctx.fillRect(56, top, W - 112, bottom - top);
      ctx.fillStyle = '#f7f6f1';
      for (let y = top + 14; y < bottom - 24; y += 36) {
        rrect(ctx, 63, y, 13, 20, 3); ctx.fill();
        rrect(ctx, W - 76, y, 13, 20, 3); ctx.fill();
      }
      slots.forEach((s, i) => {
        const cy = s.y + s.h / 2;
        ctx.save();
        ctx.translate(30, cy);
        ctx.rotate(-Math.PI / 2);
        text(ctx, `${i * 2 + 1}   ▸ ${i * 2 + 1}A`, 0, 0, `500 18px ${MONO}`, '#1a1a1a');
        ctx.restore();
        ctx.save();
        ctx.translate(W - 30, cy);
        ctx.rotate(Math.PI / 2);
        text(ctx, 'PHOTOS 400', 0, 0, `500 18px ${MONO}`, '#1a1a1a', { spacing: 3 });
        ctx.restore();
      });
      grain(ctx, W, H, 0.05);
    },
    photo(ctx, img, s) {
      ctx.save();
      rrect(ctx, s.x, s.y, s.w, s.h, 8);
      ctx.clip();
      cover(ctx, img, s.x, s.y, s.w, s.h);
      ctx.restore();
    },
    label(ctx, { W, footerY, footer }, cap) {
      text(ctx, cap, W / 2, footerY + footer / 2 + 12, `500 28px ${MONO}`, '#1a1a1a', { max: W - 100 });
    },
  });

  const gingham = strip({
    id: 'gingham', name: 'gingham', padX: 56, gap: 34, footer: 160,
    bg(ctx, { W, H }) {
      ctx.fillStyle = '#fffdf8';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(184, 34, 48, .5)';
      const c = 26;
      for (let x = 0; x < W; x += c * 2) ctx.fillRect(x, 0, c, H);
      for (let y = 0; y < H; y += c * 2) ctx.fillRect(0, y, W, c);
    },
    photo: (ctx, img, s) => matted(ctx, img, s, 12, '#fffdf8'),
    label(ctx, { W, footerY, footer }, cap) {
      ctx.font = `700 40px ${STENCIL}`;
      const w = Math.min(W - 80, ctx.measureText(cap).width + 64);
      const cy = footerY + footer / 2 - 2;
      rrect(ctx, W / 2 - w / 2, cy - 38, w, 76, 38);
      ctx.fillStyle = '#fffdf8';
      ctx.fill();
      text(ctx, cap, W / 2, cy + 2, `700 40px ${STENCIL}`, '#a8202e', { max: w - 40 });
    },
  });

  const starry = strip({
    id: 'starry', name: 'starry', padX: 56, gap: 34, footer: 160,
    bg(ctx, { W, H }) {
      ctx.fillStyle = '#4b2d1e';
      ctx.fillRect(0, 0, W, H);
      const r = rng(7);
      ctx.fillStyle = '#f1e4c6';
      for (let i = 0; i < 120; i++) {
        const R = 9 + r() * 12;
        star(ctx, r() * W, r() * H, R, R * 0.45, r() * Math.PI);
        ctx.fill();
      }
      grain(ctx, W, H, 0.06);
    },
    photo: (ctx, img, s) => matted(ctx, img, s, 10, '#efe2c4'),
    label(ctx, { W, footerY, footer }, cap) {
      text(ctx, cap, W / 2, footerY + footer / 2 - 2, `700 44px ${STENCIL}`, '#f1e4c6',
        { max: W - 80, stroke: '#4b2d1e', strokeWidth: 14 });
    },
  });

  // ───────── singles: one chosen shot ─────────
  const polaroid = {
    id: 'polaroid', name: 'polaroid', kind: 'single', usesCaption: true, W: 1000, H: 1200,
    draw(ctx, photos, o) {
      const { W, H } = this;
      ctx.save();
      ctx.fillStyle = '#fbfaf6';
      ctx.fillRect(0, 0, W, H);
      grain(ctx, W, H, 0.05);
      const s = { x: 64, y: 64, w: 872, h: 872 };
      ctx.fillStyle = '#111';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      cover(ctx, photos[o.shot], s.x, s.y, s.w, s.h);
      ctx.fillStyle = 'rgba(0,0,0,.08)';
      ctx.fillRect(s.x, s.y + s.h, s.w, 3);
      ctx.translate(W / 2, 1070);
      ctx.rotate(-0.02);
      text(ctx, o.caption, 0, 0, `500 84px ${HAND}`, '#2b2b2b', { max: W - 160 });
      ctx.restore();
    },
  };

  const digicam = {
    id: 'digicam', name: 'digicam', kind: 'single', usesCaption: false, W: 1400, H: 1000,
    draw(ctx, photos, o) {
      const { W, H } = this;
      ctx.save();
      // top buttons peek above the body
      ctx.fillStyle = silver(ctx, 24, 60);
      rrect(ctx, 1030, 26, 160, 60, 18); ctx.fill();
      rrect(ctx, 880, 44, 100, 40, 12); ctx.fill();
      // body
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.28)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 12;
      rrect(ctx, 30, 60, 1340, 890, 70);
      ctx.fillStyle = silver(ctx, 60, 890);
      ctx.fill();
      ctx.restore();
      grain(ctx, W, H, 0.05);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      rrect(ctx, 34, 64, 1332, 882, 66); ctx.stroke();

      // screen
      rrect(ctx, 92, 148, 856, 688, 26);
      ctx.fillStyle = '#1b1b1d'; ctx.fill();
      ctx.strokeStyle = '#8f8f8d'; ctx.lineWidth = 3; ctx.stroke();
      const sx = 124, sy = 180, sw = 792, sh = 594;
      cover(ctx, photos[o.shot], sx, sy, sw, sh);
      screenGlare(ctx, sx, sy, sw, sh);
      text(ctx, `▣ ${o.shot + 1}/4`, sx + 26, sy + 40, `500 28px ${MONO}`, '#fff', { align: 'left', shadow: 'rgba(0,0,0,.6)', blur: 6 });
      battery(ctx, sx + sw - 92, sy + 26);
      text(ctx, dateStamp(o.date), sx + sw - 30, sy + sh - 44, `500 44px ${MONO}`, '#ff9a2e',
        { align: 'right', shadow: 'rgba(255,110,0,.9)', blur: 12 });

      text(ctx, 'PHOTOS', 100, 892, `700 36px ${STENCIL}`, '#8a8a88', { align: 'left' });
      text(ctx, '4× ZOOM · 12.1 MP', 270, 894, `500 20px ${MONO}`, '#8a8a88', { align: 'left', spacing: 2 });

      // right-hand controls
      const cx = 1165;
      circle(ctx, 1300, 132, 9); ctx.fillStyle = '#4cd36f'; ctx.fill();
      rrect(ctx, 1095, 168, 140, 46, 23); ctx.fillStyle = '#a9a9a7'; ctx.fill();
      rrect(ctx, 1100, 173, 62, 36, 18); ctx.fillStyle = silver(ctx, 173, 36); ctx.fill();
      rrect(ctx, 1095, 266, 140, 56, 28); ctx.fillStyle = silver(ctx, 266, 56); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 2; ctx.stroke();
      text(ctx, 'W', 1128, 295, `500 24px ${MONO}`, '#5a5a58');
      text(ctx, 'T', 1202, 295, `500 24px ${MONO}`, '#5a5a58');

      knob(ctx, cx, 520, 136);
      circle(ctx, cx, 520, 118); ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.stroke();
      ctx.fillStyle = '#6d6d6b';
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.translate(cx, 520);
        ctx.rotate((i * Math.PI) / 2);
        ctx.beginPath();
        ctx.moveTo(0, -100); ctx.lineTo(-13, -82); ctx.lineTo(13, -82);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      knob(ctx, cx, 520, 52);
      text(ctx, 'FUNC', cx, 510, `500 17px ${MONO}`, '#5a5a58');
      text(ctx, 'SET', cx, 532, `500 17px ${MONO}`, '#5a5a58');

      [['MENU', 1062], ['DISP', 1172]].forEach(([label, x]) => {
        rrect(ctx, x, 720, 96, 44, 22); ctx.fillStyle = silver(ctx, 720, 44); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.stroke();
        text(ctx, label, x + 48, 743, `500 17px ${MONO}`, '#5a5a58');
      });
      knob(ctx, 1110, 830, 28);
      knob(ctx, 1220, 830, 28);
      ctx.fillStyle = '#5a5a58';
      ctx.beginPath(); ctx.moveTo(1103, 818); ctx.lineTo(1121, 830); ctx.lineTo(1103, 842); ctx.closePath(); ctx.fill();
      ctx.fillRect(1211, 820, 18, 20);
      ctx.restore();
    },
  };

  const redcam = {
    id: 'redcam', name: 'red cam', kind: 'single', usesCaption: false, W: 1000, H: 1300,
    draw(ctx, photos, o) {
      const { W, H } = this;
      ctx.save();
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.3)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 12;
      rrect(ctx, 30, 24, 940, 1240, 90);
      const body = ctx.createLinearGradient(30, 24, 970, 1264);
      body.addColorStop(0, '#d42a3c');
      body.addColorStop(0.45, '#a3152a');
      body.addColorStop(1, '#640a17');
      ctx.fillStyle = body;
      ctx.fill();
      ctx.restore();
      // gloss
      ctx.save();
      rrect(ctx, 30, 24, 940, 1240, 90);
      ctx.clip();
      const gloss = ctx.createRadialGradient(240, 150, 10, 240, 150, 620);
      gloss.addColorStop(0, 'rgba(255,255,255,.28)');
      gloss.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gloss;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      grain(ctx, W, H, 0.04);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      rrect(ctx, 33, 27, 934, 1234, 87); ctx.stroke();

      // controls
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { circle(ctx, 120 + c * 22, 90 + r * 22, 5); ctx.fill(); }
      knob(ctx, 500, 170, 100);
      circle(ctx, 500, 170, 70); ctx.fillStyle = '#7e0e1c'; ctx.fill();
      knob(ctx, 500, 170, 44);
      knob(ctx, 300, 175, 32);
      knob(ctx, 700, 175, 32);
      ctx.fillStyle = '#4a4a48';
      ctx.beginPath(); ctx.moveTo(292, 161); ctx.lineTo(314, 175); ctx.lineTo(292, 189); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 3; i++) ctx.fillRect(686, 163 + i * 10, 28, 4);

      // screen
      rrect(ctx, 95, 310, 810, 920, 34);
      ctx.fillStyle = '#121214'; ctx.fill();
      const sx = 125, sy = 340, sw = 750, sh = 860;
      ctx.save();
      rrect(ctx, sx, sy, sw, sh, 10);
      ctx.clip();
      cover(ctx, photos[o.shot], sx, sy, sw, sh);
      screenGlare(ctx, sx, sy, sw, sh);
      ctx.restore();
      text(ctx, 'AUTO', sx + 28, sy + 42, `500 30px ${MONO}`, '#fff', { align: 'left', shadow: 'rgba(0,0,0,.6)', blur: 6 });
      battery(ctx, sx + sw - 90, sy + 28);
      text(ctx, `[ ${o.shot + 1} ]`, sx + 28, sy + sh - 44, `500 30px ${MONO}`, '#fff', { align: 'left', shadow: 'rgba(0,0,0,.6)', blur: 6 });
      text(ctx, dateStamp(o.date), sx + sw - 30, sy + sh - 44, `500 44px ${MONO}`, '#ff9a2e',
        { align: 'right', shadow: 'rgba(255,110,0,.9)', blur: 12 });
      ctx.restore();
    },
  };

  const player = {
    id: 'player', name: 'now playing', kind: 'single', usesCaption: true, W: 1000, H: 1560,
    draw(ctx, photos, o) {
      const { W, H } = this;
      const img = photos[o.shot];
      ctx.save();
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.3)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 12;
      rrect(ctx, 20, 20, 960, 1520, 110);
      ctx.fillStyle = '#2a2a2c';
      ctx.fill();
      ctx.restore();

      // blurred album art as the background: shrink, then stretch back up
      ctx.save();
      rrect(ctx, 20, 20, 960, 1520, 110);
      ctx.clip();
      const tiny = document.createElement('canvas');
      tiny.width = 12; tiny.height = 18;
      cover(tiny.getContext('2d'), img, 0, 0, 12, 18);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tiny, 20, 20, 960, 1520);
      const shade = ctx.createLinearGradient(0, 20, 0, 1540);
      shade.addColorStop(0, 'rgba(10,10,12,.55)');
      shade.addColorStop(1, 'rgba(10,10,12,.35)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.35)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 16;
      rrect(ctx, 80, 80, 840, 840, 28);
      ctx.fillStyle = '#111';
      ctx.fill();
      ctx.restore();
      ctx.save();
      rrect(ctx, 80, 80, 840, 840, 28);
      ctx.clip();
      cover(ctx, img, 80, 80, 840, 840);
      ctx.restore();

      text(ctx, o.caption, 80, 1010, `700 50px ${SANS}`, '#fff', { align: 'left', max: 720 });
      text(ctx, 'the photobooth', 80, 1066, `400 36px ${SANS}`, 'rgba(255,255,255,.62)', { align: 'left' });
      circle(ctx, 890, 1036, 34); ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fill();
      ctx.fillStyle = '#fff';
      [-13, 0, 13].forEach((d) => { circle(ctx, 890 + d, 1036, 4.5); ctx.fill(); });

      rrect(ctx, 80, 1136, 840, 12, 6); ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fill();
      rrect(ctx, 80, 1136, 840 * 0.38, 12, 6); ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
      text(ctx, '1:04', 80, 1186, `500 26px ${MONO}`, 'rgba(255,255,255,.6)', { align: 'left' });
      text(ctx, '-2:41', 920, 1186, `500 26px ${MONO}`, 'rgba(255,255,255,.6)', { align: 'right' });

      ctx.fillStyle = '#fff';
      const cy = 1300, tw = 44, th = 52;
      const tri = (tip, dir) => {
        ctx.beginPath();
        ctx.moveTo(tip, cy);
        ctx.lineTo(tip - dir * tw, cy - th / 2);
        ctx.lineTo(tip - dir * tw, cy + th / 2);
        ctx.closePath();
        ctx.fill();
      };
      tri(250, -1); tri(294, -1);
      rrect(ctx, 474, cy - 32, 18, 64, 4); ctx.fill();
      rrect(ctx, 508, cy - 32, 18, 64, 4); ctx.fill();
      tri(706, 1); tri(750, 1);

      const speaker = (x, waves) => {
        ctx.fillStyle = 'rgba(255,255,255,.7)';
        ctx.fillRect(x, 1432, 10, 16);
        ctx.beginPath(); ctx.moveTo(x + 10, 1432); ctx.lineTo(x + 24, 1422); ctx.lineTo(x + 24, 1458); ctx.lineTo(x + 10, 1448); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3;
        for (let i = 1; i <= waves; i++) { ctx.beginPath(); ctx.arc(x + 24, 1440, i * 9, -0.7, 0.7); ctx.stroke(); }
      };
      speaker(76, 0);
      speaker(880, 2);
      rrect(ctx, 130, 1434, 730, 10, 5); ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fill();
      rrect(ctx, 130, 1434, 730 * 0.65, 10, 5); ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
      ctx.restore();
    },
  };

  const list = [classic, cherry, charcoal, film, gingham, starry, polaroid, digicam, redcam, player];
  window.FRAMES = { list, get: (id) => list.find((f) => f.id === id), dateStamp };
})();
