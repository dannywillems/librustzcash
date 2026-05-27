---
sidebar_position: 15
title: Trusted setup ceremonies
description: "Powers of Tau, Sapling MPC, toxic waste, Halo 2 alternative."
---

# 15 - Trusted setup ceremonies

## Goal

The Sprout and Sapling SNARKs require a **structured reference string
(SRS)** that must be generated via a procedure no single party can
subvert. This chapter explains what the SRS is, why it must be
"trusted", how Zcash actually generated it (the Powers of Tau and
Sapling MPC ceremonies), and what this means for code in
`librustzcash` (parameter files, verification, hashes).

Orchard, using Halo 2, does **not** require a per-circuit trusted
setup. But it still uses a *transparent* universal SRS that has its
own correctness story; we cover that at the end.

## 1. Why a trusted setup exists

Groth16's verifying key has the form

$$
\mathsf{vk} = (\alpha G_1, \beta G_2, \gamma G_2, \delta G_2,
\{x_i G_1\}_{i=0}^{\ell})
$$

for some random scalars $\alpha, \beta, \gamma, \delta \in
\mathbb{F}_r$ and a polynomial-in-$x$ structure that depends on the
circuit. The proving key is much larger, containing many more
$\mathbb{G}_1$ and $\mathbb{G}_2$ points derived from the same secret
scalars.

If anyone learns $\alpha, \beta, \gamma, \delta, x$ ("**toxic
waste**"), they can produce convincing proofs of false statements -
this is the *soundness* trapdoor of Groth16.

The trusted setup is the procedure of generating $\mathsf{vk}$ and
proving key *without* anyone learning the toxic waste. The only
known practical way to do this for production cryptocurrencies is a
**multi-party computation (MPC) ceremony**.

## 2. MPC ceremony abstractly

Suppose we want to generate $[\tau]G$ for a uniform secret $\tau$.
Single-party generation is trivial. MPC distributes the work:

1. Participant $P_1$ samples $\tau_1$ and outputs $[\tau_1]G$.
2. Participant $P_2$ samples $\tau_2$ and outputs
   $[\tau_2][\tau_1]G = [\tau_1 \tau_2]G$.
3. ...participant $P_n$ outputs $[\tau_1 \tau_2 \cdots \tau_n]G$.

The final $\tau = \prod \tau_i$ is uniform if any one $\tau_i$ is. As
long as one honest participant erases their share, no coalition of
the others can recover $\tau$.

Each participant publishes a transcript proving they followed the
protocol (without revealing $\tau_i$). The transcript is verifiable
by anyone with the prior transcript, the new contribution, and a
specific pairing check.

For Groth16, $\tau$ is not a single scalar but a vector of "powers
of $\tau$": $\{[\tau^i]G\}_{i=0}^{N}$. This is the **Powers of Tau**.
Each MPC round multiplies each power by an independent factor
(structured so that the resulting elements maintain the
$\tau$-power structure).

## 3. Powers of Tau (the universal SRS for BLS12-381)

The 2018 Zcash Powers of Tau ceremony generated:

- $\{[\tau^i]G_1\}_{i=0}^{2^{21}-1} \subset \mathbb{G}_1$,
- $\{[\tau^i]G_2\}_{i=0}^{2^{21}-1} \subset \mathbb{G}_2$,

plus auxiliary $\alpha$- and $\beta$-shifted variants. The size is
$\sim 100$ GB on disk.

This SRS is **universal**: it can be used for *any* Groth16 circuit
of size up to $2^{21}$ wires. The Sapling-Spend, Sapling-Output, and
Sprout-Groth16 circuits all derive from it.

87 participants. Notable details:

- Each participant generated $\tau_i$ on an air-gapped machine,
  destroyed the machine afterwards.
- The intermediate transcripts (each gigabytes) were sent on
  hardware (USB drives, encrypted).
- Each transcript was verified by the next participant using the
  pairing check $e([\tau^{i+1}]G_1, G_2) = e([\tau^i]G_1, [\tau]G_2)$
  on the new contribution.
- The final transcript hash was published; anyone can re-verify it.

The output of Powers of Tau is the **Phase 1** SRS. Sapling did not
use it directly; Sapling needed a **Phase 2** ceremony to derive the
circuit-specific keys.

## 4. The Sapling MPC (Phase 2)

Phase 2 takes the universal Phase 1 SRS and a specific R1CS circuit
representation, and produces the proving/verifying keys for that
circuit. The MPC pattern is the same: $\beta$-shifted multiplications
of new shares, with pairing-check transcripts.

The Sapling MPC ran in early 2018 with $\sim 90$ participants. It
produced three proving-key files now ubiquitous in `librustzcash`:

| File | SHA-256 | Size |
| --- | --- | --- |
| `sapling-spend.params` | hardcoded in `zcash_proofs::SAPLING_SPEND_HASH` | $\approx 47$ MB |
| `sapling-output.params` | hardcoded in `zcash_proofs::SAPLING_OUTPUT_HASH` | $\approx 3.6$ MB |
| `sprout-groth16.params` | hardcoded in `zcash_proofs::SPROUT_GROTH16_HASH` | $\approx 725$ MB |

Read in code: `zcash_proofs/src/lib.rs` defines these constants and
provides parameter-loading functions (`load_parameters`,
`parse_parameters`) that:

1. Download (or read from a local cache) the parameter files.
2. Compute the SHA-256 of the bytes.
3. Refuse to load if the hash does not match the hardcoded constant.

Wallets that embed parameters use the `bundled-prover` feature;
otherwise the `download-params` feature pulls from a CDN.

## 5. The Sprout-Groth16 addendum

The original Sprout (BCTV14) parameters were generated in a separate
2016 MPC ceremony. After the 2018 counterfeit bug (chapter 12), the
Sprout circuit was re-expressed for Groth16 and parameters were
regenerated in the Sapling MPC ceremony. The resulting
`sprout-groth16.params` is what `zcash_proofs` loads today.

The proving key is large because the Sprout circuit is *not*
optimised for Groth16 (it was originally tuned for BCTV14 and not
re-architected). This is fine; Sprout is legacy.

## 6. Verifying the ceremony

Anyone can verify the Powers of Tau and Sapling MPC transcripts. The
verification involves:

- Hash-chaining: each contributor's transcript embeds the hash of
  the prior transcript, forming a tamper-evident chain.
- Pairing checks: each transcript satisfies a sequence of pairing
  equations that prove the contributor multiplied the prior SRS by
  *some* scalar (without revealing which).
- Public attestation: each contributor signs and publishes their
  step.

The full re-verification takes hours on a single machine but is
deterministic. Volunteers have run it independently after the
ceremony.

The current parameter files have SHA-256 hashes that match the
hashes endorsed by the ceremony coordinators. If the SHA-256 of your
downloaded `sapling-spend.params` matches `SAPLING_SPEND_HASH` in
`zcash_proofs/src/lib.rs`, you have the correct file.

## 7. What is in the proving key

For a Groth16 prover, the proving key contains:

- The QAP polynomials evaluated at $\tau$, encoded as
  $\mathbb{G}_1$ points: $\{[A_i(\tau)]G_1, [B_i(\tau)]G_1,
  [C_i(\tau)]G_1\}_{i \in [\text{wires}]}$.
- The $\beta A_i(\tau) + \alpha B_i(\tau) + C_i(\tau)$ products
  encoded in $\mathbb{G}_1$.
- The $[\tau^i / \delta]G_1$ "$H$-table" of $\delta$-shifted powers
  used to commit to the quotient polynomial.

For a circuit with $N$ wires and degree $D$ constraints, this is
$O(N + D)$ group elements. For Sapling-Spend, $\sim 100{,}000$
constraints, hence the ~50 MB key.

For verification, the verifier only needs:

- $\alpha G_1, \beta G_2, \gamma G_2, \delta G_2$.
- $\{[\tau_i / \gamma]G_1\}_{i=0}^{\ell}$ where $\ell$ is the public
  input length.

For Sapling, this is tens of kilobytes (the "verifying key" file).

## 8. Bellman's representation of the proving key

`bellman::groth16::Parameters` stores:

```rust
pub struct Parameters<E: Engine> {
    pub vk: VerifyingKey<E>,
    pub h: Arc<Vec<E::G1Affine>>,
    pub l: Arc<Vec<E::G1Affine>>,
    pub a: Arc<Vec<E::G1Affine>>,
    pub b_g1: Arc<Vec<E::G1Affine>>,
    pub b_g2: Arc<Vec<E::G2Affine>>,
}
```

The on-disk format is a serialised version of this structure.
`zcash_proofs::load_parameters` parses it after verifying the
SHA-256.

The proving key is `Arc`'d because it is shared between threads
(multicore proving). It is read-only once loaded.

## 9. PreparedVerifyingKey

A `bellman::groth16::PreparedVerifyingKey` precomputes the pairing
ingredients to make verification faster:

```rust
pub struct PreparedVerifyingKey<E: Engine> {
    pub alpha_g1_beta_g2: E::Gt,
    pub neg_gamma_g2: <E::G2Affine as PreparedCurveAffine>::Prepared,
    pub neg_delta_g2: ...,
    pub ic: Vec<E::G1Affine>,
}
```

The wallet calls `prepare_verifying_key(&vk)` once and caches the
result. Each verification is then a Miller-loop + final exponentiation
plus a constant-size MSM.

## 10. Halo 2's "transparent" setup

Halo 2 has no per-circuit setup. The "structured reference string"
is the set of generators

$$
\{G_0, G_1, \ldots, G_{2^k - 1}\} \subset E_{\text{Pallas}}(\mathbb{F}_p),
$$

derived deterministically from a hash function applied to a
fixed personalisation string and a counter. Any verifier with the
hash function definition can re-derive the generators independently.

This means there is no toxic waste to destroy and no MPC ceremony.
The trade-off is that the prover/verifier work is larger.

In the `halo2_proofs` crate, the generators come from
`halo2_proofs::poly::commitment::Params::new(k)`. The Orchard verifier
constructs them on demand or caches them.

## 11. Soundness implications

For Groth16: as long as one participant in the MPC ceremony was
honest, soundness holds. The current parameters have ~90 participants;
even if 89 are malicious, soundness is preserved.

For Halo 2 / IPA: soundness reduces to the discrete log assumption
on Pallas. No participant honesty is needed; the curve and the
hash-to-curve are public.

This is one of the main reasons Orchard chose Halo 2. It removes a
class of "what if the ceremony was rigged" arguments from the trust
model.

## 12. Verifying parameter integrity in `librustzcash`

The hardcoded SHA-256 hashes are in `zcash_proofs/src/lib.rs`:

<!-- CODE_REFERENCE: zcash_proofs/src/lib.rs#L49-L52 -->

```rust reference title="zcash_proofs/src/lib.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs#L49-L52
```

The integrity-check flow is in `load_parameters`:

<!-- CODE_REFERENCE: zcash_proofs/src/lib.rs#L288-L343 -->

```rust reference title="zcash_proofs/src/lib.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs#L288-L343
```

The SHA-256 of the on-disk bytes uniquely identifies the parameter
file, so a wallet cannot accidentally use a different (potentially
malicious) parameter file.

A wallet that *generates* parameters locally (not supported in
production, but possible via `bellman`) gets fresh toxic waste each
time. This is unsound for shipping cryptocurrencies and is only used
for tests with `MockTxProver`.

## 13. The `download-params` flow

The `zcash_proofs::download_parameters` function (gated behind the
`download-params` feature) fetches parameters from a CDN, verifies
the SHA-256, and caches locally. The default cache path is
`~/.zcash-params/`.

This is the standard way wallets bootstrap. Production wallets often
download once at install time.

## 14. The `bundled-prover` feature

Some downstream wallets prefer to embed the parameters directly into
the binary using the `bundled-prover` feature flag. This eliminates
the runtime download but increases binary size by ~50 MB.

The bundled parameters still have their SHA-256 verified at runtime
against the hardcoded hashes; the bundling is an optimisation, not
a trust short-cut.

## 15. Practical consequences for code review

When you see code touching parameter loading:

- The SHA-256 check must be present and against the hardcoded
  constant.
- Parameter files must be read once and cached (do not re-read
  per proof).
- `MockTxProver` use must be feature-gated to tests only.

When you see code touching the Sapling Spend/Output prover (the API
boundary is in `sapling-crypto::prover`), be aware that proving is
the heaviest computation and any optimisation may have
side-channel implications (chapter 14).

## 16. Future directions

If Sapling were rebuilt today, it would likely use Halo 2 (no
trusted setup). The migration cost is high (different proof system,
new circuit, parameter compatibility break) and has not been deemed
worth it given the existing setup's strong public-attestation track
record.

For future shielded-asset proposals (chapter 21), the proof system
choice is open: Halo 2 for transparency, or one of the newer
trusted-setup-free SNARKs (HyperPlonk, Spartan, Nova-style folding,
Plonky3). The codebase is set up so that the "proving system" is
modular per pool.

## What you should know after this chapter

- What the Groth16 SRS contains and what "toxic waste" means.
- The two-phase MPC structure (Powers of Tau then per-circuit).
- The role of the SHA-256 hashes hardcoded in `zcash_proofs`.
- Why Orchard / Halo 2 avoids the whole question.
- How `bellman::groth16::Parameters` is structured and where it
  comes from.

Next: a deep dive on Pedersen-hash internals, including the
window-encoding derivation and constraint counts.
