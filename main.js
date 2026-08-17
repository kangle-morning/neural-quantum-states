/* =========================================================
   main.js — UI wiring + canvas interactives
   Relies on window.QuantumCore (quantum.js).
   ========================================================= */
(function () {
  'use strict';
  const Q = window.QuantumCore;

  /* ---------------- utils ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const nf = new Intl.NumberFormat('en-US');
  function formatNumber(x) {
    if (!isFinite(x)) return '∞';
    if (Math.abs(x) < 1e15 && x === Math.floor(x)) return nf.format(x);
    return x.toExponential(2).replace('e+', '×10^');
  }
  function formatBytes(bytes) {
    if (!isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB'];
    let i = 0, v = bytes;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    if (i <= 6) return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + ' ' + units[i];
    return bytes.toExponential(1).replace('e+', '×10^') + ' 字节';
  }

  /* ---------------- DPR-aware canvases ---------------- */
  const resizers = []; // { resize(), draw() }
  function makeCanvas(canvas, height) {
    const state = { canvas, height, h: height, w: 300, ctx: canvas.getContext('2d') };
    state.resize = function () {
      const dpr = window.devicePixelRatio || 1;
      state.w = canvas.clientWidth || 300;
      canvas.width = Math.max(1, Math.round(state.w * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.height = height + 'px';
      state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    state.resize();
    return state;
  }
  window.addEventListener('resize', () => {
    resizers.forEach(r => { r.resize(); r.draw(); });
  });

  /* ---------------- reveal on scroll ---------------- */
  const revealEls = $$('.section-head, .panel, .card, .ref, .timeline, .tl-panel');
  revealEls.forEach(el => el.classList.add('reveal'));
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.08 });
  revealEls.forEach(el => io.observe(el));

  /* =========================================================
     0. Background particle field
     ========================================================= */
  (function background() {
    const canvas = $('#bg');
    const ctx = canvas.getContext('2d');
    let W, H, parts;
    function size() {
      const dpr = window.devicePixelRatio || 1;
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(70, Math.round((W * H) / 24000));
      parts = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18,
        r: .8 + Math.random() * 1.6,
        c: Math.random() < .6 ? '56,189,248' : '167,139,250',
        a: .25 + Math.random() * .5
      }));
    }
    size();
    window.addEventListener('resize', size);
    function tick() {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + p.c + ',' + p.a + ')';
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // faint links
      ctx.strokeStyle = 'rgba(148,163,184,0.06)';
      ctx.lineWidth = 1;
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i], b = parts[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          if (dx * dx + dy * dy < 130 * 130) {
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      requestAnimationFrame(tick);
    }
    tick();
  })();

  /* =========================================================
     1. Hilbert-space explosion
     ========================================================= */
  (function hilbert() {
    const slider = $('#hilbertN');
    const valEl = $('#hilbertNval');
    const valueEl = $('#hilbertValue');
    const memEl = $('#hilbertMem');
    const canvas = $('#hilbertCanvas');
    const s = makeCanvas(canvas, 180);
    resizers.push(s);

    function draw() {
      const { ctx, w, h } = s;
      const N = +slider.value;
      ctx.clearRect(0, 0, w, h);

      const logMax = 100; // up to 10^100
      const x0 = 18, x1 = w - 18;
      const baseY = h - 34;
      const x = v => x0 + (Math.log10(Math.max(1, v)) / logMax) * (x1 - x0);

      // reference markers
      const refs = [
        { v: 1, label: '1' },
        { v: 1e23, label: '阿伏伽德罗 ~10²³' },
        { v: 1e80, label: '宇宙原子数 ~10⁸⁰' },
        { v: 1e90, label: '2³⁰⁰ ≈ 10⁹⁰' },
        { v: 1e100, label: '10¹⁰⁰' }
      ];
      ctx.font = '11px ui-monospace, monospace';
      refs.forEach(r => {
        const px = x(r.v);
        ctx.strokeStyle = 'rgba(148,163,184,0.35)';
        ctx.beginPath(); ctx.moveTo(px, baseY - 8); ctx.lineTo(px, baseY + 8); ctx.stroke();
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.fillText(r.label, Math.max(30, Math.min(w - 30, px)), baseY + 22);
      });

      // axis
      ctx.strokeStyle = 'rgba(148,163,184,0.25)';
      ctx.beginPath(); ctx.moveTo(x0, baseY); ctx.lineTo(x1, baseY); ctx.stroke();

      // filled bar to current value
      const cx = x(Math.pow(2, N));
      const grad = ctx.createLinearGradient(x0, 0, cx, 0);
      grad.addColorStop(0, 'rgba(56,189,248,0.05)');
      grad.addColorStop(1, 'rgba(167,139,250,0.55)');
      ctx.fillStyle = grad;
      ctx.fillRect(x0, baseY - 26, Math.max(0, cx - x0), 26);

      // current marker + label
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(cx, baseY, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = cx > w / 2 ? 'right' : 'left';
      const lab = '2^' + N + ' = ' + formatNumber(Math.pow(2, N));
      ctx.fillText(lab, cx + (cx > w / 2 ? -10 : 10), baseY - 34);
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'left';
      ctx.fillText('对数刻度 →', x0, 16);
    }

    function update() {
      const N = +slider.value;
      valEl.textContent = N;
      const v = Math.pow(2, N);
      valueEl.textContent = formatNumber(v);
      const bytes = v * 16;
      memEl.textContent = formatBytes(bytes);
      draw();
    }
    slider.addEventListener('input', update);
    update();
  })();

  /* =========================================================
     2. RBM diagram
     ========================================================= */
  (function rbmDiagram() {
    const nSlider = $('#rbmN'), mSlider = $('#rbmM');
    const nVal = $('#rbmNval'), mVal = $('#rbmMval'), pVal = $('#rbmParams');
    const canvas = $('#rbmCanvas');
    const s = makeCanvas(canvas, 320);
    resizers.push(s);

    let W = [], b = [], spins = [];
    let hover = null; // {type:'v'|'h', index}
    let lastFlip = 0;

    function seed() {
      const N = +nSlider.value, M = +mSlider.value;
      W = Array.from({ length: M }, () => Array.from({ length: N }, () => (Math.random() * 2 - 1)));
      b = Array.from({ length: M }, () => (Math.random() * 2 - 1) * 0.5);
      spins = Array.from({ length: N }, () => (Math.random() < .5 ? 1 : -1));
    }
    function draw() {
      const { ctx, w, h } = s;
      const N = +nSlider.value, M = +mSlider.value;
      ctx.clearRect(0, 0, w, h);

      const vX = 70, hX = w - 70;
      const pad = 18;
      const vY = i => pad + (i + 0.5) * ((h - 2 * pad) / Math.max(1, N));
      const hY = j => pad + (j + 0.5) * ((h - 2 * pad) / Math.max(1, M));
      const vPos = [], hPos = [];
      for (let i = 0; i < N; i++) vPos.push({ x: vX, y: vY(i) });
      for (let j = 0; j < M; j++) hPos.push({ x: hX, y: hY(j) });

      // hidden activations
      const z = b.map((bj, j) => bj + spins.reduce((acc, si, i) => acc + W[j][i] * si, 0));

      // edges
      for (let j = 0; j < M; j++) {
        for (let i = 0; i < N; i++) {
          const wt = W[j][i];
          const hl = hover && ((hover.type === 'v' && hover.index === i) || (hover.type === 'h' && hover.index === j));
          ctx.strokeStyle = wt >= 0
            ? (hl ? 'rgba(56,189,248,0.95)' : 'rgba(56,189,248,0.25)')
            : (hl ? 'rgba(251,146,60,0.95)' : 'rgba(251,146,60,0.22)');
          ctx.lineWidth = hl ? Math.max(1.4, Math.abs(wt) * 3) : Math.max(0.6, Math.abs(wt) * 1.6);
          ctx.globalAlpha = hover ? (hl ? 1 : 0.18) : 1;
          ctx.beginPath(); ctx.moveTo(vPos[i].x + 12, vPos[i].y); ctx.lineTo(hPos[j].x - 12, hPos[j].y); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // visible nodes (arrows)
      for (let i = 0; i < N; i++) {
        const p = vPos[i];
        const hl = hover && hover.type === 'v' && hover.index === i;
        ctx.fillStyle = spins[i] > 0 ? '#7dd3fc' : '#64748b';
        ctx.beginPath(); ctx.arc(p.x, p.y, hl ? 15 : 12, 0, Math.PI * 2); ctx.fill();
        if (hl) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
        ctx.fillStyle = '#06121f';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(spins[i] > 0 ? '↑' : '↓', p.x, p.y + 1);
      }
      // hidden nodes
      for (let j = 0; j < M; j++) {
        const p = hPos[j];
        const hl = hover && hover.type === 'h' && hover.index === j;
        const t = Math.tanh(z[j]);
        ctx.fillStyle = t >= 0 ? 'rgba(167,139,250,' + (0.35 + 0.6 * Math.abs(t)) + ')' : 'rgba(251,146,60,' + (0.35 + 0.6 * Math.abs(t)) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, hl ? 15 : 12, 0, Math.PI * 2); ctx.fill();
        if (hl) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('h' + (j + 1), p.x, p.y);
      }
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.font = '11px sans-serif';
      ctx.fillText('可见自旋 s (输入)', 12, 18);
      ctx.textAlign = 'right';
      ctx.fillText('隐藏单元 h (激活)', w - 12, 18);

      s.vPos = vPos; s.hPos = hPos;
    }

    function loop(ts) {
      if (ts - lastFlip > 900) {
        const N = +nSlider.value;
        const i = (Math.random() * N) | 0;
        spins[i] *= -1;
        lastFlip = ts;
        draw();
      }
      requestAnimationFrame(loop);
    }

    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (s.w / rect.width);
      const my = (e.clientY - rect.top) * (s.h / rect.height);
      hover = null;
      if (s.vPos) {
        for (let i = 0; i < s.vPos.length; i++) {
          const p = s.vPos[i];
          if ((mx - p.x) ** 2 + (my - p.y) ** 2 < 20 ** 2) { hover = { type: 'v', index: i }; break; }
        }
      }
      if (!hover && s.hPos) {
        for (let j = 0; j < s.hPos.length; j++) {
          const p = s.hPos[j];
          if ((mx - p.x) ** 2 + (my - p.y) ** 2 < 20 ** 2) { hover = { type: 'h', index: j }; break; }
        }
      }
      draw();
    }
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', () => { hover = null; draw(); });

    function update() {
      const N = +nSlider.value, M = +mSlider.value;
      nVal.textContent = N; mVal.textContent = M;
      pVal.textContent = N + M + N * M;
      seed(); draw();
    }
    nSlider.addEventListener('input', update);
    mSlider.addEventListener('input', update);
    seed(); update();
    requestAnimationFrame(loop);
  })();

  /* =========================================================
     3. Metropolis sampling animation
     ========================================================= */
  (function mcmc() {
    const canvas = $('#mcmcCanvas');
    const runBtn = $('#mcmcRun'), resetBtn = $('#mcmcReset'), rateEl = $('#mcmcRate');
    const s = makeCanvas(canvas, 260);
    resizers.push(s);

    const NB = 46;
    let x = 0.5, hist = new Array(NB).fill(0), acc = 0, prop = 0, running = false;

    const target = x => 0.6 * Math.exp(-((x - 0.3) ** 2) / (2 * 0.08 ** 2)) + 0.4 * Math.exp(-((x - 0.72) ** 2) / (2 * 0.05 ** 2));

    function draw() {
      const { ctx, w, h } = s;
      ctx.clearRect(0, 0, w, h);
      const pad = 20;
      const curveTop = h * 0.42;
      // target curve
      const gmax = target(0.3);
      ctx.strokeStyle = 'rgba(167,139,250,0.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let px = 0; px <= w; px++) {
        const xx = px / w;
        const yy = curveTop - (target(xx) / gmax) * (curveTop - pad);
        px === 0 ? ctx.moveTo(px, yy) : ctx.lineTo(px, yy);
      }
      ctx.stroke();
      // walker
      const wy = curveTop - (target(x) / gmax) * (curveTop - pad);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x * w, wy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.arc(x * w, wy, 9, 0, Math.PI * 2); ctx.stroke();
      // histogram
      const hTop = curveTop + 24, hBot = h - pad;
      const maxH = Math.max(1, ...hist);
      for (let b = 0; b < NB; b++) {
        const bw = w / NB;
        const bh = (hist[b] / maxH) * (hBot - hTop);
        ctx.fillStyle = 'rgba(56,189,248,0.55)';
        ctx.fillRect(b * bw + 1, hBot - bh, bw - 2, bh);
      }
      ctx.strokeStyle = 'rgba(148,163,184,0.3)';
      ctx.beginPath(); ctx.moveTo(0, hBot); ctx.lineTo(w, hBot); ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('目标分布 p(x)', pad, 16);
      ctx.fillText('采样直方图（按 p(x) 采样）', pad, hTop + 12);
    }

    function step(n) {
      for (let k = 0; k < n; k++) {
        const xp = x + (Math.random() * 2 - 1) * 0.09;
        if (xp < 0 || xp > 1) continue;
        prop++;
        const r = target(xp) / target(x);
        if (Math.random() < r) {
          x = xp; acc++;
        }
        hist[Math.min(NB - 1, Math.floor(x * NB))]++;
      }
      rateEl.textContent = prop ? ((acc / prop) * 100).toFixed(0) + '%' : '—';
    }

    function loop() {
      if (!running) return;
      step(24);
      draw();
      requestAnimationFrame(loop);
    }
    function reset() {
      x = 0.5; hist = new Array(NB).fill(0); acc = 0; prop = 0;
      rateEl.textContent = '—';
      draw();
    }
    runBtn.addEventListener('click', () => {
      running = !running;
      runBtn.textContent = running ? '⏸ 暂停' : '▶ 开始采样';
      if (running) requestAnimationFrame(loop);
    });
    resetBtn.addEventListener('click', () => {
      running = false; runBtn.textContent = '▶ 开始采样'; reset();
    });
    reset();
  })();

  /* =========================================================
     4. Live NQS training lab
     ========================================================= */
  (function lab() {
    const els = {
      N: $('#labN'), G: $('#labG'), M: $('#labM'), LR: $('#labLR'), SPF: $('#labSPF'),
      gVal: $('#labGval'), mVal: $('#labMval'), lrVal: $('#labLRval'), spfVal: $('#labSPFval'),
      run: $('#labRun'), reset: $('#labReset'),
      step: $('#labStep'), energy: $('#labEnergy'), e0: $('#labE0'), fid: $('#labFidelity'),
      eCanvas: $('#labEnergyCanvas'), fCanvas: $('#labFidelityCanvas'), hCanvas: $('#labHistCanvas')
    };
    const eState = makeCanvas(els.eCanvas, 220);
    const fState = makeCanvas(els.fCanvas, 220);
    const hState = makeCanvas(els.hCanvas, 200);
    resizers.push({ resize: eState.resize, draw: () => drawEnergy() });
    resizers.push({ resize: fState.resize, draw: () => drawFidelity() });
    resizers.push({ resize: hState.resize, draw: () => drawHist() });

    let exact = null, rbm = null, adam = null, samples = null;
    let stepCount = 0, running = false;
    let energyHist = [], fidSteps = [], fidVals = [];
    let lastFid = null;

    function initRun() {
      const N = +els.N.value, g = +els.G.value, M = +els.M.value;
      exact = Q.groundState(N, 1, g, N <= 8 ? 1500 : 1200);
      rbm = new Q.RBM(N, M);
      adam = new Q.Adam(rbm.params.length, +els.LR.value);
      samples = Q.randomSamples(Math.max(200, Math.min(700, 2 ** (N - 2) * 50)), N);
      stepCount = 0; lastFid = null;
      energyHist = []; fidSteps = []; fidVals = [];
      els.e0.textContent = exact.E.toFixed(4);
      els.energy.textContent = '—';
      els.fid.textContent = '—';
      els.step.textContent = '0';
    }

    function tick() {
      if (!running) return;
      const N = +els.N.value, g = +els.G.value, spf = +els.SPF.value;
      for (let i = 0; i < spf; i++) {
        const e = Q.trainStep(rbm, samples, 1, g, adam, 1);
        stepCount++;
        energyHist.push(e);
        if (stepCount % 5 === 0) {
          fidSteps.push(stepCount);
          fidVals.push(Q.fidelity(rbm, exact.psi));
        }
      }
      if (energyHist.length > 8000) energyHist = energyHist.slice(-6000);
      if (fidVals.length > 2000) { fidVals = fidVals.slice(-1500); fidSteps = fidSteps.slice(-1500); }
      lastFid = fidVals.length ? fidVals[fidVals.length - 1] : null;
      els.step.textContent = nf.format(stepCount);
      els.energy.textContent = energyHist[energyHist.length - 1].toFixed(4);
      els.fid.textContent = lastFid == null ? '—' : (lastFid * 100).toFixed(2) + '%';
      drawEnergy(); drawFidelity();
      if (stepCount % 4 === 0) drawHist();
      requestAnimationFrame(tick);
    }

    function setRun(on) {
      running = on;
      els.run.textContent = on ? '⏸ 暂停' : '▶ 开始训练';
      if (on) requestAnimationFrame(tick);
    }

    function drawEnergy() {
      const { ctx, w, h } = eState;
      ctx.clearRect(0, 0, w, h);
      drawAxes(ctx, w, h);
      let min, max;
      if (energyHist.length) {
        const tail = energyHist.slice(-Math.max(2, w - 52));
        min = Math.min(...tail, exact.E) - 0.2;
        max = Math.max(...tail, exact.E) + 0.2;
      } else {
        min = exact.E - 0.6;
        max = exact.E + 0.6;
      }
      const X = i => w - 26 - (energyHist.length - 1 - i);
      const Y = v => h - 22 - ((v - min) / (max - min)) * (h - 44);
      // exact line (always visible, even before training starts)
      ctx.strokeStyle = 'rgba(167,139,250,0.9)';
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(26, Y(exact.E)); ctx.lineTo(w - 26, Y(exact.E)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#a78bfa';
      ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('精确 E0=' + exact.E.toFixed(3), 30, Y(exact.E) - 6);
      if (!energyHist.length) {
        ctx.fillStyle = 'rgba(148,163,184,0.85)';
        ctx.textAlign = 'center';
        ctx.font = '13px sans-serif';
        ctx.fillText('点击「▶ 开始训练」，观察能量向虚线下降', w / 2, h / 2 + 6);
        return;
      }
      // energy line
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < energyHist.length; i++) {
        const px = X(i), py = Y(energyHist[i]);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'right';
      ctx.fillText(min.toFixed(2), w - 4, h - 8);
      ctx.fillText(max.toFixed(2), w - 4, 22 + 8);
    }

    function drawFidelity() {
      const { ctx, w, h } = fState;
      ctx.clearRect(0, 0, w, h);
      drawAxes(ctx, w, h);
      const Y = v => h - 22 - (v / 1.05) * (h - 44);
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(26, Y(1)); ctx.lineTo(w - 26, Y(1)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#64748b'; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('1.00', 4, Y(1) - 4);
      if (!fidVals.length) {
        ctx.fillStyle = 'rgba(148,163,184,0.85)';
        ctx.textAlign = 'center';
        ctx.font = '13px sans-serif';
        ctx.fillText('点击「▶ 开始训练」后显示保真度曲线', w / 2, h / 2 + 6);
        return;
      }
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      const s0 = fidSteps[0], s1 = fidSteps[fidSteps.length - 1];
      const span = (s1 - s0) || 1;
      for (let i = 0; i < fidVals.length; i++) {
        const px = 26 + ((fidSteps[i] - s0) / span) * (w - 52);
        const py = Y(fidVals[i]);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    function drawHist() {
      const { ctx, w, h } = hState;
      ctx.clearRect(0, 0, w, h);
      if (!exact || !rbm) return;
      const N = +els.N.value, D = 1 << N;
      const rAmp = rbm.amplitudes();
      const gap = 18;
      const top = { y0: 16, y1: h / 2 - gap / 2 };
      const bot = { y0: h / 2 + gap / 2, y1: h - 26 };
      const drawSeries = (data, y0, y1, color, label) => {
        const m = Math.max(...data) || 1;
        const bw = w / D;
        for (let i = 0; i < D; i++) {
          const v = data[i] / m;
          ctx.fillStyle = color;
          ctx.fillRect(i * bw, y1 - v * (y1 - y0), Math.max(1, bw - 0.5), v * (y1 - y0));
        }
        ctx.fillStyle = '#64748b';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, 6, y0 + 11);
      };
      const r2 = Array.from(rAmp, v => v * v);
      const e2 = Array.from(exact.psi, v => v * v);
      drawSeries(e2, top.y0, top.y1, 'rgba(167,139,250,0.75)', '精确基态 |ψ|²');
      drawSeries(r2, bot.y0, bot.y1, 'rgba(56,189,248,0.75)', 'NQS 学到 |ψ|²');
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'right';
      ctx.fillText('2^N = ' + D + ' 个构型', w - 6, h - 8);
    }

    function drawAxes(ctx, w, h) {
      ctx.strokeStyle = 'rgba(148,163,184,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(26, h - 22); ctx.lineTo(w - 26, h - 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(26, 22); ctx.lineTo(26, h - 22); ctx.stroke();
    }

    els.run.addEventListener('click', () => setRun(!running));
    els.reset.addEventListener('click', () => {
      setRun(false); initRun(); drawEnergy(); drawFidelity(); drawHist();
    });
    els.N.addEventListener('change', () => { setRun(false); initRun(); drawEnergy(); drawFidelity(); drawHist(); });
    els.G.addEventListener('input', () => { els.gVal.textContent = (+els.G.value).toFixed(2); });
    els.G.addEventListener('change', () => { setRun(false); initRun(); drawEnergy(); drawFidelity(); drawHist(); });
    els.M.addEventListener('input', () => { els.mVal.textContent = els.M.value; });
    els.M.addEventListener('change', () => { setRun(false); initRun(); drawEnergy(); drawFidelity(); drawHist(); });
    els.LR.addEventListener('input', () => { els.lrVal.textContent = (+els.LR.value).toFixed(3); if (adam) adam.lr = +els.LR.value; });
    els.SPF.addEventListener('input', () => { els.spfVal.textContent = els.SPF.value; });

    initRun();
    drawEnergy(); drawFidelity(); drawHist();
  })();

  /* =========================================================
     5. Architecture timeline
     ========================================================= */
  (function timeline() {
    const data = {
      rbm: {
        title: '受限玻尔兹曼机（RBM）',
        text: '只有一层可见 + 一层隐藏的浅网络。训练快、易优化，是最能说明 NQS 思想的起点；代价是刻画纠缠的能力有限。',
        pros: ['结构极简，参数少，训练稳定', '适用于横场 Ising、Heisenberg 等自旋模型', 'Carleo & Troyer 2017 的开山之作'],
        icon: '<svg viewBox="0 0 160 90" width="150"><g stroke="rgba(148,163,184,.5)"><line x1="45" y1="20" x2="115" y2="22"/><line x1="45" y1="20" x2="115" y2="55"/><line x1="45" y1="45" x2="115" y2="22"/><line x1="45" y1="45" x2="115" y2="55"/><line x1="45" y1="70" x2="115" y2="22"/><line x1="45" y1="70" x2="115" y2="55"/></g><g fill="#38bdf8"><circle cx="45" cy="20" r="7"/><circle cx="45" cy="45" r="7"/><circle cx="45" cy="70" r="7"/></g><g fill="#a78bfa"><circle cx="115" cy="22" r="7"/><circle cx="115" cy="55" r="7"/></g></svg>'
      },
      deep: {
        title: '深度前馈网络 / 卷积网络',
        text: '把 RBM 换成更深的 MLP 或 CNN，并引入空间平移对称性（卷积）。表达力更强，能描述更复杂的纠缠与二维体系。',
        pros: ['更深 → 表达力更强', 'CNN 内置平移对称，参数更少', '适合二维晶格与图像式构型'],
        icon: '<svg viewBox="0 0 160 90" width="150"><g stroke="rgba(148,163,184,.4)"><line x1="40" y1="20" x2="80" y2="15"/><line x1="40" y1="45" x2="80" y2="45"/><line x1="40" y1="70" x2="80" y2="75"/><line x1="80" y1="15" x2="120" y2="25"/><line x1="80" y1="45" x2="120" y2="45"/><line x1="80" y1="75" x2="120" y2="65"/></g><g fill="#38bdf8"><circle cx="40" cy="20" r="6"/><circle cx="40" cy="45" r="6"/><circle cx="40" cy="70" r="6"/></g><g fill="#7dd3fc"><circle cx="80" cy="15" r="6"/><circle cx="80" cy="45" r="6"/><circle cx="80" cy="75" r="6"/></g><g fill="#a78bfa"><circle cx="120" cy="25" r="6"/><circle cx="120" cy="45" r="6"/><circle cx="120" cy="65" r="6"/></g></svg>'
      },
      ar: {
        title: '自回归网络（RNN / MADE）',
        text: '把 |ψ|² 分解成条件概率的乘积 ψ(s)=∏ᵢ p(sᵢ|s₁…sᵢ₋₁)，网络逐格生成构型。最大好处：采样精确、无需等待 MCMC 收敛。',
        pros: ['精确、快速的独立采样（不用 MCMC）', '天然归一化的概率分布', 'RNN 适合一维，Transformer 可推广到二维'],
        icon: '<svg viewBox="0 0 160 90" width="150"><g fill="#38bdf8"><circle cx="30" cy="45" r="8"/><circle cx="62" cy="45" r="8"/><circle cx="94" cy="45" r="8"/><circle cx="126" cy="45" r="8"/></g><g stroke="rgba(167,139,250,.8)" stroke-width="1.6"><line x1="40" y1="45" x2="52" y2="45"/><line x1="72" y1="45" x2="84" y2="45"/><line x1="104" y1="45" x2="116" y2="45"/></g><g fill="#a78bfa"><path d="M52 40 l8 5 l-8 5 z"/><path d="M84 40 l8 5 l-8 5 z"/><path d="M116 40 l8 5 l-8 5 z"/></g></svg>'
      },
      fermion: {
        title: '费米子 / 分子 NQS',
        text: '电子波函数要满足反对称性。用 Slater 行列式做骨架，再用神经网络做 backflow 修正（FermiNet、PauliNet），在分子薛定谔方程上达到化学精度。',
        pros: ['处理连续坐标 + 反对称性', '量子化学精度（~1 kcal/mol）', 'FermiNet / PauliNet 标志性成果'],
        icon: '<svg viewBox="0 0 160 90" width="150"><g fill="#38bdf8"><circle cx="50" cy="30" r="6"/><circle cx="80" cy="30" r="6"/><circle cx="110" cy="30" r="6"/><circle cx="50" cy="60" r="6"/><circle cx="80" cy="60" r="6"/><circle cx="110" cy="60" r="6"/></g><g stroke="rgba(251,191,36,.9)" stroke-width="2"><line x1="50" y1="30" x2="110" y2="60"/><line x1="80" y1="30" x2="110" y2="30"/></g><text x="30" y="52" fill="#a78bfa" font-size="18" font-family="serif">det</text></svg>'
      },
      transformer: {
        title: 'Transformer 神经量子态',
        text: '自注意力机制让构型间的长程关联更易表达，配合自回归采样，二维晶格也能训练到机器精度，是当前 NQS 的主流架构之一。',
        pros: ['长程关联表达力强', '并行 + 自回归精确采样', '二维体系可达机器精度'],
        icon: '<svg viewBox="0 0 160 90" width="150"><g stroke="rgba(56,189,248,.7)" stroke-width="1.6"><line x1="30" y1="22" x2="130" y2="22"/><line x1="30" y1="45" x2="130" y2="45"/><line x1="30" y1="68" x2="130" y2="68"/></g><g stroke="rgba(167,139,250,.9)" stroke-width="2.4"><line x1="30" y1="22" x2="130" y2="68"/></g><g fill="#a78bfa"><circle cx="30" cy="22" r="4"/><circle cx="130" cy="68" r="4"/></g></svg>'
      },
      diffusion: {
        title: '扩散 / 生成式模型',
        text: '学习一个从噪声到量子态分布的去噪过程，用“反向扩散”生成样本，摆脱自回归逐格生成的顺序瓶颈，是生成式 NQS 的新方向。',
        pros: ['非自回归、可并行的采样', '生成式建模自然适配概率分布', '2023 年以来快速兴起'],
        icon: '<svg viewBox="0 0 160 90" width="150"><g fill="#64748b"><circle cx="40" cy="60" r="5"/><circle cx="52" cy="38" r="5"/><circle cx="64" cy="52" r="5"/><circle cx="76" cy="42" r="5"/><circle cx="88" cy="30" r="5"/><circle cx="100" cy="42" r="5"/><circle cx="112" cy="32" r="5"/><circle cx="124" cy="40" r="5"/></g><g stroke="rgba(56,189,248,.8)" stroke-width="1.6"><path d="M52 42 l10 -6 l10 4 l10 -8 l10 6 l10 -8"/></g></svg>'
      }
    };

    const items = $$('.tl-item');
    const iconEl = $('#tlIcon'), titleEl = $('#tlTitle'), textEl = $('#tlText'), prosEl = $('#tlPros');
    const compareBox = $('#compareBox'), compareTitle = $('#compareTitle');
    const shortName = { deep: '深度前馈 / CNN', ar: '自回归 RNN / MADE', fermion: '费米子 / 分子', transformer: 'Transformer', diffusion: '扩散 / 生成模型' };

    function select(id) {
      items.forEach(b => b.classList.toggle('active', b.dataset.id === id));
      const d = data[id];
      iconEl.innerHTML = d.icon;
      titleEl.textContent = d.title;
      textEl.textContent = d.text;
      prosEl.innerHTML = d.pros.map(p => '<li>' + p + '</li>').join('');
      // 对比卡只在选中“现代结构”时显示；RBM 是基准，无需和自己对比
      if (id === 'rbm') {
        compareBox.style.display = 'none';
      } else {
        compareBox.style.display = '';
        compareTitle.textContent = '对比：' + (shortName[id] || '现代结构') + ' vs RBM';
      }
      compareBox.open = false;
    }
    items.forEach(b => b.addEventListener('click', () => select(b.dataset.id)));
    select('rbm');
  })();
})();
