/* Backdrops that sit behind a strip or single. Each one is drawn in code so it
   works out of the box; drop a real image into backgrounds/<id>.jpg (or .png)
   and it's used instead. draw(ctx, W, H) paints into an unscaled W × H canvas,
   with sizes expressed in a 1080-wide space (u) so thumbnails match. */
(function () {
  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // per-pixel painter: fn(X, Y) gets 1080-space coords, returns [r, g, b]
  function pixels(ctx, W, H, fn) {
    const u = W / 1080;
    const img = ctx.createImageData(W, H), p = img.data;
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i += 4) {
        const c = fn(x / u, y / u);
        p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2]; p[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const jitter = (c, n) => { const d = (Math.random() - 0.5) * n; return [c[0] + d, c[1] + d, c[2] + d]; };

  function wavyCheck(ctx, W, H, o) {
    pixels(ctx, W, H, (X, Y) => {
      const wx = X + o.amp * Math.sin(Y / o.wave + 0.8) + o.amp * 0.5 * Math.sin((X + Y) / (o.wave * 0.7));
      const wy = Y + o.amp * Math.sin(X / o.wave + 2.1);
      let c = (Math.floor(wx / o.cell) + Math.floor(wy / o.cell)) & 1 ? o.a : o.b;
      if (o.satin) {
        const s = Math.sin((X * 0.55 + Y) / 170 + Math.sin(X / 260) * 2.2);
        c = s > 0.82 ? mix(c, [255, 255, 255], (s - 0.82) * 1.2) : shade(c, 0.86 + 0.14 * (s + 1) / 2);
      }
      return o.noise ? jitter(c, o.noise) : c;
    });
  }

  function dots(ctx, W, H, gap, r, ink) {
    const u = W / 1080;
    ctx.fillStyle = ink;
    for (let row = 0, y = gap / 2; y * u < H + gap * u; row++, y += gap / 2) {
      for (let x = row % 2 ? gap / 2 : 0; x * u < W + gap * u; x += gap) {
        ctx.beginPath();
        ctx.arc(x * u, y * u, r * u, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function bow(ctx, x, y, s, lw) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = lw;
    ctx.lineCap = ctx.lineJoin = 'round';
    [-1, 1].forEach((d) => {
      ctx.beginPath();
      ctx.ellipse(d * s * 0.36, -s * 0.12, s * 0.36, s * 0.19, d * -0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(d * s * 0.04, 0);
      ctx.quadraticCurveTo(d * s * 0.12, s * 0.5, d * s * 0.3, s * 0.95);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.arc(0, -s * 0.04, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function starPath(ctx, cx, cy, R, rot, wobble, rand) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
      const rad = (i % 2 ? R * 0.45 : R) * (1 + (rand() - 0.5) * wobble);
      ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
    }
    ctx.closePath();
  }

  // a scribbled star: five strokes, drawn twice slightly off
  function doodleStar(ctx, cx, cy, R, rand) {
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
        ctx.lineTo(cx + Math.cos(a) * R + (rand() - 0.5) * R * 0.2, cy + Math.sin(a) * R + (rand() - 0.5) * R * 0.2);
      }
      ctx.stroke();
    }
  }

  const list = [
    {
      id: 'cherry-wave', name: 'cherry wave',
      draw: (ctx, W, H) => wavyCheck(ctx, W, H, { a: [134, 10, 18], b: [242, 226, 187], cell: 150, amp: 64, wave: 250, satin: true }),
    },
    {
      id: 'bows', name: 'bows',
      draw(ctx, W, H) {
        const u = W / 1080;
        ctx.fillStyle = '#fbfdff';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#cfe0ef';
        for (let x = 0; x < W; x += 15 * u) ctx.fillRect(x, 0, 7 * u, H);
        ctx.strokeStyle = ctx.fillStyle = '#5f8fbf';
        for (let row = 0, y = 60; y * u < H + 100 * u; row++, y += 200) {
          for (let x = row % 2 ? 140 : 340; x < 1180; x += 520) bow(ctx, x * u, y * u, 104 * u, 10 * u);
        }
      },
    },
    {
      id: 'denim-lace', name: 'denim lace',
      draw(ctx, W, H) {
        const u = W / 1080, edge = 300 * u;
        ctx.fillStyle = '#f4f1ea';
        ctx.fillRect(0, 0, W, H);
        dots(ctx, W, H, 112, 13, '#111');
        // denim
        const den = ctx.createImageData(Math.ceil(edge), H), p = den.data;
        for (let y = 0, i = 0; y < H; y++) {
          for (let x = 0; x < den.width; x++, i += 4) {
            const t = 16 * Math.sin((x + y * 0.6) / (1.7 * u)) + (Math.random() - 0.5) * 34;
            p[i] = 92 + t; p[i + 1] = 101 + t; p[i + 2] = 116 + t; p[i + 3] = 255;
          }
        }
        ctx.putImageData(den, 0, 0);
        ctx.fillStyle = 'rgba(0,0,0,.18)';
        ctx.fillRect(150 * u, 0, 10 * u, H);
        ctx.strokeStyle = '#b08350';
        ctx.lineWidth = 4 * u;
        ctx.setLineDash([14 * u, 8 * u]);
        [120, 178].forEach((x) => { ctx.beginPath(); ctx.moveTo(x * u, 0); ctx.lineTo(x * u, H); ctx.stroke(); });
        ctx.setLineDash([]);
        // lace with a scalloped edge
        ctx.fillStyle = 'rgba(236,232,222,.55)';
        ctx.beginPath();
        ctx.moveTo(200 * u, 0);
        for (let y = 0; y <= H + 40 * u; y += 40 * u) ctx.arc(330 * u, y + 20 * u, 22 * u, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(200 * u, H);
        ctx.closePath();
        ctx.fill();
        const r = rng(3);
        ctx.strokeStyle = 'rgba(255,255,255,.85)';
        ctx.lineWidth = 3 * u;
        for (let y = 20; y * u < H; y += 70) {
          const cx = (250 + r() * 40) * u, cy = y * u;
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(cx + Math.cos(a) * 16 * u, cy + Math.sin(a) * 16 * u, 12 * u, 7 * u, a, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      },
    },
    {
      id: 'wavy-check', name: 'wavy check',
      draw: (ctx, W, H) => wavyCheck(ctx, W, H, { a: [26, 26, 26], b: [232, 228, 216], cell: 92, amp: 16, wave: 300, noise: 14 }),
    },
    {
      id: 'starry-paper', name: 'starry paper',
      draw(ctx, W, H) {
        const u = W / 1080, r = rng(11);
        ctx.fillStyle = '#2f5e8c';
        ctx.fillRect(0, 0, W, H);
        // crumples: lots of faint light and dark facets
        for (let i = 0; i < 420; i++) {
          const x = r() * W, y = r() * H, s = (70 + r() * 220) * u;
          ctx.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.02 + r() * 0.05})` : `rgba(0,10,30,${0.03 + r() * 0.07})`;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + (r() - 0.5) * s, y + (r() - 0.5) * s);
          ctx.lineTo(x + (r() - 0.5) * s, y + (r() - 0.5) * s);
          ctx.closePath();
          ctx.fill();
        }
        ctx.strokeStyle = 'rgba(255,255,255,.92)';
        ctx.lineWidth = 3.5 * u;
        ctx.lineJoin = 'round';
        [[70, 260, 30], [80, 400, 34], [80, 600, 40], [45, 690, 18], [80, 760, 30]].forEach(([x, y, s]) => doodleStar(ctx, x * u, y * u, s * u, r));
        [[1000, 880, 30], [1010, 1030, 32], [1000, 1220, 38], [960, 1320, 16], [990, 1400, 28]].forEach(([x, y, s]) => doodleStar(ctx, x * u, y * u, s * u, r));
        [[960, 210, 70, '#9db4d6'], [1010, 120, 46, '#28466b'], [150, 1520, 78, '#28466b'], [60, 1640, 56, '#9db4d6']].forEach(([x, y, s, fill]) => {
          starPath(ctx, x * u, y * u, s * u, r() * 0.6, 0.08, r);
          ctx.lineWidth = 12 * u;
          ctx.strokeStyle = '#fff';
          ctx.stroke();
          ctx.fillStyle = fill;
          ctx.fill();
        });
      },
    },
    {
      id: 'navy-stripe', name: 'navy stripe',
      draw: (ctx, W, H) => pixels(ctx, W, H, (X, Y) => {
        const c = Math.floor(Y / 66) % 2 ? [236, 230, 214] : [37, 39, 73];
        return jitter(shade(c, 1 + 0.05 * Math.sin((X - Y) / 2.2)), 16);
      }),
    },
    {
      id: 'polka', name: 'polka dot',
      draw(ctx, W, H) {
        ctx.fillStyle = '#f6f3ec';
        ctx.fillRect(0, 0, W, H);
        dots(ctx, W, H, 104, 12, '#0d0d0d');
      },
    },
    {
      id: 'navy-gingham', name: 'navy gingham',
      draw: (ctx, W, H) => pixels(ctx, W, H, (X, Y) => {
        const n = (Math.floor(X / 72) % 2) + (Math.floor(Y / 72) % 2);
        const c = n === 0 ? [242, 243, 247] : n === 1 ? [128, 140, 184] : [34, 50, 118];
        return jitter(shade(c, 1 + 0.04 * Math.sin(X / 1.6)), 14);
      }),
    },
  ];

  function cover(ctx, img, W, H) {
    const s = Math.max(W / img.width, H / img.height);
    const sw = W / s, sh = H / s;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, H);
  }

  // cache rendered backdrops by id and size; per-pixel ones aren't free
  const cache = new Map();
  function render(b, W, H) {
    const key = `${b.id}@${W}x${H}`;
    if (!cache.has(key)) {
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      b.img ? cover(ctx, b.img, W, H) : b.draw(ctx, W, H);
      cache.set(key, c);
    }
    return cache.get(key);
  }

  function useImage(b, img) {
    b.img = img;
    for (const k of cache.keys()) if (k.startsWith(b.id + '@')) cache.delete(k);
  }

  // swap in real images from backgrounds/ when they exist
  function loadFiles() {
    const tryLoad = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    if (location.protocol === 'file:') return Promise.resolve();
    return Promise.all(list.map(async (b) => {
      const img = (await tryLoad(`backgrounds/${b.id}.jpg`)) || (await tryLoad(`backgrounds/${b.id}.png`));
      if (img) useImage(b, img);
    }));
  }

  function add(id, name, img) {
    const b = { id, name, custom: true };
    useImage(b, img);
    list.push(b);
    return b;
  }

  window.BACKDROPS = { list, get: (id) => list.find((b) => b.id === id), render, loadFiles, add };
})();
