// Headless DOM stub — runs main.js initialization to catch runtime errors.
// Usage: node tests/dom-smoke.js
'use strict';
const fs = require('fs');
const path = require('path');

// ---- canvas 2d context stub (proxy: any method call is a no-op) ----
// Numeric args to drawing primitives are checked: NaN/Infinity (e.g. from a
// missing `h`) must never reach the canvas, or the charts silently render blank.
const NUMERIC_METHODS = new Set([
  'clearRect', 'fillRect', 'strokeRect', 'moveTo', 'lineTo', 'arc', 'fillText',
  'strokeText', 'setTransform', 'translate', 'scale', 'rotate', 'rect', 'quadraticCurveTo',
  'bezierCurveTo', 'ellipse', 'drawImage'
]);
function makeCtx() {
  const target = {};
  return new Proxy(target, {
    get(t, prop) {
      if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'getImageData') return () => ({ data: [] });
      if (NUMERIC_METHODS.has(prop)) {
        return (...args) => {
          args.forEach(a => {
            if (typeof a === 'number' && !isFinite(a)) {
              throw new Error('non-finite coordinate passed to ctx.' + prop + ' = ' + a);
            }
          });
        };
      }
      if (!(prop in t)) t[prop] = function () {};
      return t[prop];
    },
    set(t, prop, v) { t[prop] = v; return true; }
  });
}

// defaults for a few inputs so real code paths run
const DEFAULTS = {
  '#labN': '6', '#labG': '1.0', '#labM': '12', '#labLR': '0.05', '#labSPF': '3',
  '#hilbertN': '30', '#rbmN': '6', '#rbmM': '4'
};

function makeEl(sel) {
  const el = {
    id: (sel.match(/#([\w-]+)/) || [])[1] || '',
    value: DEFAULTS[sel] || '',
    textContent: '', innerHTML: '', className: '', width: 800, height: 200,
    clientWidth: 800, clientHeight: 200,
    style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 200 }),
    querySelector: (s) => makeEl(s),
    querySelectorAll: () => []
  };
  return el;
}

const els = {};
function getEl(sel) { if (!els[sel]) els[sel] = makeEl(sel); return els[sel]; }

global.window = {
  QuantumCore: require('../quantum.js'),
  devicePixelRatio: 1,
  innerWidth: 1200, innerHeight: 800,
  addEventListener() {}
};
global.document = {
  querySelector: getEl,
  querySelectorAll: () => []
};
global.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; }
  observe() {} unobserve() {} disconnect() {}
};
global.requestAnimationFrame = () => 0;
global.cancelAnimationFrame = () => {};

// Simulate a training step to exercise the lab's hot path beyond init.
const Q = global.window.QuantumCore;
const N = 6, g = 1, M = 12;
const exact = Q.groundState(N, 1, g);
const rbm = new Q.RBM(N, M);
const adam = new Q.Adam(rbm.params.length, 0.05);
let samples = Q.randomSamples(300, N);
for (let i = 0; i < 50; i++) Q.trainStep(rbm, samples, 1, g, adam, 1);
console.log('lab hot-path: E0=' + exact.E.toFixed(4), 'VMC E=' + Q.trainStep(rbm, samples, 1, g, adam, 1).toFixed(4),
  'F=' + (Q.fidelity(rbm, exact.psi) * 100).toFixed(2) + '%');

// Now run main.js init against the stub DOM.
const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
try {
  (0, eval)(src);
  console.log('PASS  main.js initialized without throwing');
  process.exit(0);
} catch (e) {
  console.error('FAIL  main.js threw during init:', e);
  process.exit(1);
}
