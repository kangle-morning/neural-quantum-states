/*
 * quantum.js — pure math core for the Neural Quantum States demo.
 *
 * No DOM access; usable in both the browser (as window.QuantumCore) and
 * Node (module.exports). Implements:
 *   - exact diagonalization (power iteration) of the transverse-field Ising chain
 *   - a Restricted Boltzmann Machine (RBM) variational wavefunction
 *   - Variational Monte Carlo (VMC) training with Adam
 *   - fidelity / amplitude helpers
 *
 * Hamiltonian (periodic boundary, spin-1/2, sigma^z basis):
 *     H = -J * sum_i Z_i Z_{i+1}  -  g * sum_i X_i
 * Its ground state is stoquastic, i.e. has real non-negative amplitudes in the
 * sigma^z basis, so a real-parameter RBM (positive wavefunction) is a faithful
 * ansatz. This lets the demo stay fast and visually clean.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QuantumCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * basis helpers
   * ------------------------------------------------------------------ */

  /** sign array (±1) of basis state `idx` for N spins. */
  function basisState(N, idx) {
    const s = new Float64Array(N);
    for (let i = 0; i < N; i++) s[i] = (idx >> i) & 1 ? 1 : -1;
    return s;
  }

  /** |0↑…↑⟩, |↑↑↓…⟩ … human-readable label for a basis state. */
  function stateLabel(N, idx) {
    let out = '';
    for (let i = N - 1; i >= 0; i--) out += ((idx >> i) & 1) ? '↑' : '↓';
    return out;
  }

  /* ------------------------------------------------------------------ *
   * exact diagonalization via power iteration on (shift*I - H)
   * ------------------------------------------------------------------ */

  function applyH(psi, N, J, g) {
    const D = 1 << N;
    const out = new Float64Array(D);
    for (let s = 0; s < D; s++) {
      let diag = 0;
      for (let i = 0; i < N; i++) {
        const si = (s >> i) & 1 ? 1 : -1;
        const sj = (s >> ((i + 1) % N)) & 1 ? 1 : -1;
        diag += si * sj;
      }
      let val = -J * diag * psi[s];
      for (let i = 0; i < N; i++) val += -g * psi[s ^ (1 << i)];
      out[s] = val;
    }
    return out;
  }

  function normalize(v) {
    let n = 0;
    for (let i = 0; i < v.length; i++) n += v[i] * v[i];
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;
    return v;
  }

  function expectationH(psi, N, J, g) {
    const Hp = applyH(psi, N, J, g);
    let num = 0, den = 0;
    for (let s = 0; s < psi.length; s++) {
      num += psi[s] * Hp[s];
      den += psi[s] * psi[s];
    }
    return num / den;
  }

  /** Ground state + energy of the TFIM chain. Returns {psi, E}. */
  function groundState(N, J, g, iters) {
    iters = iters == null ? 1500 : iters;
    const D = 1 << N;
    const shift = N * Math.abs(J) + N * Math.abs(g) + 1;
    let psi = new Float64Array(D).fill(1.0);
    normalize(psi);
    for (let it = 0; it < iters; it++) {
      const Hp = applyH(psi, N, J, g);
      const next = new Float64Array(D);
      for (let s = 0; s < D; s++) next[s] = shift * psi[s] - Hp[s];
      normalize(next);
      psi = next;
    }
    const E = expectationH(psi, N, J, g);
    return { psi: psi, E: E };
  }

  /* ------------------------------------------------------------------ *
   * Restricted Boltzmann Machine wavefunction
   *   log ψ(s) = Σ_i a_i s_i + Σ_j log cosh(b_j + Σ_i W_ij s_i)
   * (the constant Σ_j log 2 is dropped; only ratios matter)
   * ------------------------------------------------------------------ */

  function RBM(N, M, rng) {
    rng = rng || Math.random;
    this.N = N;
    this.M = M;
    const P = N + M + N * M;
    this.params = new Float64Array(P);
    this.a = this.params.subarray(0, N);
    this.b = this.params.subarray(N, N + M);
    this.W = this.params.subarray(N + M, P);
    for (let i = 0; i < N; i++) this.a[i] = (rng() - 0.5) * 0.1;
    for (let j = 0; j < M; j++) this.b[j] = (rng() - 0.5) * 0.1;
    for (let i = 0; i < N * M; i++) this.W[i] = (rng() - 0.5) * 0.2;
  }

  /** log ψ for integer state s; reuses buf {spins, tanh} and returns logp. */
  RBM.prototype.logpsiFull = function (s, buf) {
    const N = this.N, M = this.M;
    const spins = buf.spins, tanh = buf.tanh;
    let logp = 0;
    for (let i = 0; i < N; i++) {
      const si = (s >> i) & 1 ? 1 : -1;
      spins[i] = si;
      logp += this.a[i] * si;
    }
    for (let j = 0; j < M; j++) {
      let z = this.b[j];
      const off = j * N;
      for (let i = 0; i < N; i++) z += this.W[off + i] * spins[i];
      const t = Math.tanh(z);
      tanh[j] = t;
      logp += Math.log(Math.cosh(z));
    }
    return logp;
  };

  /** ψ(s') / ψ(s) for s' = s with site i flipped. */
  RBM.prototype.ratioFlip = function (s, i, buf) {
    const lp = this.logpsiFull(s, buf);
    const lp2 = this.logpsiFull(s ^ (1 << i), buf);
    return Math.exp(lp2 - lp);
  };

  /** Full amplitude vector ψ(s) over all 2^N states (normalized). */
  RBM.prototype.amplitudes = function () {
    const N = this.N, D = 1 << N;
    const amp = new Float64Array(D);
    const buf = { spins: new Float64Array(N), tanh: new Float64Array(this.M) };
    for (let s = 0; s < D; s++) amp[s] = Math.exp(this.logpsiFull(s, buf));
    normalize(amp);
    return amp;
  };

  /** Exact energy of the ansatz by full enumeration (no sampling noise). */
  RBM.prototype.exactEnergy = function (J, g) {
    const N = this.N, D = 1 << N;
    const buf = { spins: new Float64Array(N), tanh: new Float64Array(this.M) };
    const buf2 = { spins: new Float64Array(N), tanh: new Float64Array(this.M) };
    let num = 0, den = 0;
    for (let s = 0; s < D; s++) {
      const logp = this.logpsiFull(s, buf);
      const w2 = Math.exp(2 * logp);
      // local energy
      let diag = 0;
      for (let i = 0; i < N; i++) {
        const si = (s >> i) & 1 ? 1 : -1;
        const sj = (s >> ((i + 1) % N)) & 1 ? 1 : -1;
        diag += si * sj;
      }
      let E = -J * diag;
      for (let i = 0; i < N; i++) {
        const lp2 = this.logpsiFull(s ^ (1 << i), buf2);
        E += -g * Math.exp(lp2 - logp);
      }
      num += w2 * E;
      den += w2;
    }
    return num / den;
  };

  /* ------------------------------------------------------------------ *
   * Variational Monte Carlo training
   * ------------------------------------------------------------------ */

  function Adam(size, lr, beta1, beta2, eps) {
    this.lr = lr;
    this.beta1 = beta1 == null ? 0.9 : beta1;
    this.beta2 = beta2 == null ? 0.999 : beta2;
    this.eps = eps == null ? 1e-8 : eps;
    this.m = new Float64Array(size);
    this.v = new Float64Array(size);
    this.t = 0;
  }

  Adam.prototype.step = function (grad, params) {
    this.t += 1;
    const m = this.m, v = this.v;
    const mhat_c = 1 / (1 - Math.pow(this.beta1, this.t));
    const vhat_c = 1 / (1 - Math.pow(this.beta2, this.t));
    for (let i = 0; i < grad.length; i++) {
      m[i] = this.beta1 * m[i] + (1 - this.beta1) * grad[i];
      v[i] = this.beta2 * v[i] + (1 - this.beta2) * grad[i] * grad[i];
      params[i] -= this.lr * (m[i] * mhat_c) / (Math.sqrt(v[i] * vhat_c) + this.eps);
    }
  };

  function randomSamples(nSamples, N) {
    const D = 1 << N;
    const out = new Int32Array(nSamples);
    for (let k = 0; k < nSamples; k++) out[k] = (Math.random() * D) | 0;
    return out;
  }

  /**
   * One VMC training step.
   * `samples` is an Int32Array of persistent Markov chains (mutated in place).
   * Returns the running estimate of the energy (E_loc averaged over samples).
   */
  function trainStep(rbm, samples, J, g, adam, nSweeps) {
    const N = rbm.N, M = rbm.M, nS = samples.length;
    nSweeps = nSweeps == null ? 1 : nSweeps;
    const P = N + M + N * M;
    const gradS1 = new Float64Array(P); // Σ E_loc * O_k
    const gradS2 = new Float64Array(P); // Σ O_k
    let accE = 0;

    const buf = { spins: new Float64Array(N), tanh: new Float64Array(M) };
    const buf2 = { spins: new Float64Array(N), tanh: new Float64Array(M) };

    for (let k = 0; k < nS; k++) {
      let s = samples[k];

      // --- Metropolis sweeps (single spin flips, |ψ|² target) ---
      for (let sw = 0; sw < nSweeps; sw++) {
        for (let i = 0; i < N; i++) {
          const lp = rbm.logpsiFull(s, buf);
          const lp2 = rbm.logpsiFull(s ^ (1 << i), buf2);
          if (Math.random() < Math.exp(2 * (lp2 - lp))) s ^= 1 << i;
        }
      }
      samples[k] = s;

      // --- measure local energy ---
      const logp = rbm.logpsiFull(s, buf);
      let diag = 0;
      for (let i = 0; i < N; i++) {
        const si = (s >> i) & 1 ? 1 : -1;
        const sj = (s >> ((i + 1) % N)) & 1 ? 1 : -1;
        diag += si * sj;
      }
      let E = -J * diag;
      for (let i = 0; i < N; i++) {
        const lp2 = rbm.logpsiFull(s ^ (1 << i), buf2);
        E += -g * Math.exp(lp2 - logp);
      }
      accE += E;

      // --- accumulate log-derivatives O_k ---
      const spins = buf.spins, tanh = buf.tanh;
      for (let i = 0; i < N; i++) {
        gradS2[i] += spins[i];
        gradS1[i] += E * spins[i];
      }
      for (let j = 0; j < M; j++) {
        const idx = N + j;
        gradS2[idx] += tanh[j];
        gradS1[idx] += E * tanh[j];
        const off = N + M + j * N;
        for (let i = 0; i < N; i++) {
          const o = tanh[j] * spins[i];
          gradS2[off + i] += o;
          gradS1[off + i] += E * o;
        }
      }
    }

    // --- gradient of the energy:  2 * Cov(E_loc, O_k) ---
    const meanE = accE / nS;
    const grad = new Float64Array(P);
    for (let i = 0; i < P; i++) {
      grad[i] = 2 * (gradS1[i] / nS - meanE * (gradS2[i] / nS));
    }
    adam.step(grad, rbm.params);
    return meanE;
  }

  /** Fidelity |⟨ψ_nqs|ψ_exact⟩|²  (exactPsi assumed real, non-negative). */
  function fidelity(rbm, exactPsi) {
    const N = rbm.N, D = 1 << N;
    const buf = { spins: new Float64Array(N), tanh: new Float64Array(rbm.M) };
    let num = 0, den1 = 0, den2 = 0;
    for (let s = 0; s < D; s++) {
      const pr = Math.exp(rbm.logpsiFull(s, buf));
      const pe = exactPsi[s];
      num += pr * pe;
      den1 += pr * pr;
      den2 += pe * pe;
    }
    return (num * num) / (den1 * den2);
  }

  /* ------------------------------------------------------------------ */
  return {
    basisState: basisState,
    stateLabel: stateLabel,
    applyH: applyH,
    normalize: normalize,
    groundState: groundState,
    RBM: RBM,
    Adam: Adam,
    randomSamples: randomSamples,
    trainStep: trainStep,
    fidelity: fidelity
  };
});
