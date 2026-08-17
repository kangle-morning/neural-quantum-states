// Smoke test for quantum.js — run with: node tests/smoke.js
const Q = require('../quantum.js');

function approx(a, b, tol, label) {
  const ok = Math.abs(a - b) <= tol;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + '  (' + a + ' vs ' + b + ')');
  return ok;
}

let all = true;

// 1) Exact diagonalization: TFIM at g=1 has e0 -> -4/pi per site (thermo limit).
{
  const { psi, E } = Q.groundState(10, 1, 1);
  const per = E / 10;
  console.log('N=10, g=1  E0/N =', per.toFixed(6), '  (thermo limit', (-4 / Math.PI).toFixed(6) + ')');
  all = approx(per, -4 / Math.PI, 0.06, 'TFIM critical energy density') && all;
  // positivity (stoquastic ground state): min coefficient must be >= 0
  let minp = Infinity;
  for (let s = 0; s < psi.length; s++) minp = Math.min(minp, psi[s]);
  const nonNeg = minp >= -1e-9;
  console.log((nonNeg ? 'PASS' : 'FAIL') + '  ground state non-negative (min=' + minp + ')');
  all = nonNeg && all;
}

// 2) Small cases we can sanity check by hand-ish.
{
  const g0 = Q.groundState(6, 1, 0);
  all = approx(g0.E / 6, -1, 1e-6, 'g=0 -> fully ferromagnetic, E/N=-1') && all;
  const ginf = Q.groundState(6, 1, 50);
  all = approx(ginf.E / 6, -50, 0.01, 'g=50 -> E/N ~ -g') && all;
}

// 3) VMC training converges for a small chain.
{
  const N = 6, M = 12, J = 1, g = 1;
  const { psi, E } = Q.groundState(N, J, g);
  const rbm = new Q.RBM(N, M);
  const adam = new Q.Adam(rbm.params.length, 0.05);
  let samples = Q.randomSamples(300, N);
  // burn-in
  for (let k = 0; k < 20; k++) Q.trainStep(rbm, samples, J, g, adam, 1);

  let eFinal = 0, fFinal = 0;
  for (let step = 0; step < 600; step++) {
    eFinal = Q.trainStep(rbm, samples, J, g, adam, 1);
    if (step % 200 === 199) {
      fFinal = Q.fidelity(rbm, psi);
      console.log('  step', step + 1, 'E=', eFinal.toFixed(4), '(E0=', E.toFixed(4) + ')  F=', (100 * fFinal).toFixed(2) + '%');
    }
  }
  fFinal = Q.fidelity(rbm, psi);
  console.log('  final E=', eFinal.toFixed(4), ' E0=', E.toFixed(4), ' F=', (100 * fFinal).toFixed(2) + '%');
  all = approx(eFinal, E, 0.05, 'VMC energy near ground state') && all;
  all = (fFinal >= 0.9) && all;
  console.log((fFinal >= 0.9 ? 'PASS' : 'FAIL') + '  fidelity > 90%  (' + (100 * fFinal).toFixed(3) + '%)');
}

console.log(all ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
process.exit(all ? 0 : 1);
