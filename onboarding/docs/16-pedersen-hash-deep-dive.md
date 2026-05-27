---
sidebar_position: 16
title: Pedersen hash deep dive
description: "Windowed encoding, generators, constraint counts."
---

# 16 - Pedersen hash deep dive

## 1. Why this chapter exists

Pedersen hash is the single most-evaluated cryptographic operation
in Sapling: every note commitment, every Merkle-tree hash, every
value commitment runs through it. A contributor who cannot derive
the windowed encoding $\text{enc}_3$, name the per-segment
generator construction, and trace the in-circuit constraint count
will not be able to review a circuit-level PR, debug a hash
mismatch, or understand why
[`zcash_proofs/src/circuit/sprout/commitment.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout/commitment.rs)
uses SHA-256 (Sprout legacy) while Sapling uses Pedersen. The
chapter fills in the full construction; chapter 04 only sketched
it. The implementation lives in the external `sapling-crypto`
crate (`sapling_crypto::pedersen_hash` and
`sapling_crypto::circuit::pedersen_hash`).

## 2. Definitions

### The setting

We work in the prime-order subgroup $E^{\circ}_{\text{Jubjub}}$ of
order $\ell_{\text{J}} \approx 2^{252}$. A Pedersen hash takes a
bit string $m \in \{0, 1\}^k$ and a domain-separation tag $D$ and
outputs a curve point. We write $G_j^{(D)}$ for the $j$-th
generator associated with domain $D$.

### Definition ($\text{enc}_3$, the windowed encoding)

Group $m$ into 3-bit chunks $c_0, c_1, c_2, \ldots$ Each chunk
$c = (b_0, b_1, b_2) \in \{0, 1\}^3$ is mapped to a signed
integer

$$
\text{enc}_3(c) \;=\; (1 + b_0 + 2 b_1)(1 - 2 b_2) \;\in\;
\{-4, -3, -2, -1, 1, 2, 3, 4\}.
$$

Explicitly:

| $c = (b_0, b_1, b_2)$ | $\text{enc}_3(c)$ |
| --------------------- | ----------------- |
| $(0, 0, 0)$           | $1$               |
| $(1, 0, 0)$           | $2$               |
| $(0, 1, 0)$           | $3$               |
| $(1, 1, 0)$           | $4$               |
| $(0, 0, 1)$           | $-1$              |
| $(1, 0, 1)$           | $-2$              |
| $(0, 1, 1)$           | $-3$              |
| $(1, 1, 1)$           | $-4$              |

This is the booth-encoded representation of a 3-bit window with
a sign bit. In-circuit, doubling the partial sum costs the same
as adding it; the encoding minimises the number of base
doublings needed.

### Definition (segment)

Combine 63 consecutive chunks into one **segment** of $3 \times
63 = 189$ bits. The segment scalar is

$$
\langle\!\langle c_0, \ldots, c_{62} \rangle\!\rangle
\;=\;
\sum_{i=0}^{62} \text{enc}_3(c_i) \cdot 2^{4i}.
$$

The spacing $2^{4i}$ (not $2^{3i}$) is chosen because each window
contributes a value in $\{-4, \ldots, 4\}$ which needs 4 bits to
encode unambiguously. A segment scalar lies in approximately

$$
\Bigl(-\tfrac{4}{15} \cdot 2^{252},\; \tfrac{4}{15} \cdot
2^{252}\Bigr),
$$

comfortably less than $\ell_{\text{J}}$.

### Definition (per-segment generator)

Each segment $j$ has its own generator $G_j^{(D)}$ derived
deterministically from $D$ and $j$:

$$
G_j^{(D)} \;=\; \mathsf{HashToCurve}_{\text{Jubjub}}\!\bigl(
D \,\|\, j_{\text{LE}}\bigr).
$$

The construction is try-and-increment:

1. Compute $h = \mathsf{BLAKE2s\text{-}256}(\text{"Zcash\_PH"}
   \,\|\, D \,\|\, j_{\text{LE}} \,\|\, \text{counter})$.
2. Interpret $h$ as a candidate $v$-coordinate. Recover $u$
   from the curve equation; if no valid $u$ exists, increment
   the counter and retry.
3. Multiply by the cofactor $h_{\text{J}} = 8$ to land in
   $E^{\circ}_{\text{Jubjub}}$.

Deterministic, so anyone can recompute the generator set;
uniform in $E^{\circ}_{\text{Jubjub}}$ modulo a negligible bias.
The discrete log of any $G_j^{(D)}$ relative to any other is
**unknown** modulo DLP on Jubjub.

### Definition (Pedersen hash)

Let $S(m)$ be the number of segments after padding $m$ to a
multiple of 189 bits. Then

$$
\mathsf{PH}_D(m) \;=\; \sum_{j=0}^{S(m)-1}
\bigl[\,\langle\!\langle c_{j,0}, \ldots, c_{j, 62}
\rangle\!\rangle\,\bigr] G_j^{(D)} \;\in\;
E^{\circ}_{\text{Jubjub}}.
$$

### Invariant (collision resistance reduces to DLP)

Finding $m_1 \neq m_2$ with $\mathsf{PH}_D(m_1) =
\mathsf{PH}_D(m_2)$ is at least as hard as solving DLP on
Jubjub. A collision gives
$\sum_j [\Delta_j] G_j = \mathcal{O}$ for a non-zero integer
vector $\{\Delta_j\}$, which is a non-trivial linear relation
among generators whose pairwise discrete logs are unknown.

## 3. The code

### 3.1 The Sapling Pedersen-hash flow lives in `sapling-crypto`

The Sapling implementation is in the external `sapling-crypto`
crate. `librustzcash` consumes it via re-exports:

- `sapling_crypto::pedersen_hash::pedersen_hash`: out-of-circuit,
  used by the wallet for trial decryption and witness
  construction.
- `sapling_crypto::circuit::pedersen_hash::pedersen_hash`: the
  Bellman gadget used inside the Spend / Output Groth16 circuit.
- `sapling_crypto::constants`: precomputed generator sets per
  domain.
- `sapling_crypto::primitives::NoteCommitment`: high-level note
  commitment using Pedersen hash plus commitment randomness.
- `sapling_crypto::primitives::MerkleHash`: the Merkle-tree
  hash.

### 3.2 Comparison: Sprout commits with SHA-256, not Pedersen

For context, here is the Sprout `note_comm` gadget that lives in
this repo. It uses SHA-256 with a 4-bit type tag prefix
($0\text{xb0}$ = `1011_0000`), not Pedersen hash:

```rust reference title="zcash_proofs/src/circuit/sprout/commitment.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout/commitment.rs#L1-L39
```

The Sapling improvement is replacing this with the algebraic
Pedersen hash, which reduces the in-circuit constraint count by
about an order of magnitude for the same input length.

### 3.3 In-circuit constraint count

Inside the Sapling Spend/Output Groth16 circuit, computing a
Pedersen hash of $k$ bits costs approximately

$$
\text{constraints} \;\approx\; \tfrac{k}{3} \cdot
(\text{constraints per window}).
$$

In `sapling_crypto::circuit::pedersen_hash`, the per-window
breakdown:

- 1 constraint to range-check the boolean bits.
- 2-3 constraints to compute the signed-window scalar from the
  bits.
- 5-7 constraints to perform conditional point addition with the
  per-segment generator (strongly-unified twisted-Edwards
  formulas).

Net: $\sim 6$ constraints per bit. For the Sapling note
commitment (input $\approx 8 + 88 + 256 + 256 = 608$ bits before
randomness), that is $\sim 3600$ constraints. The Merkle-tree
hash (input $\approx 512$ bits) is $\sim 3000$ constraints; over
a depth-32 tree, $\sim 100{,}000$ constraints.

This dominates the Spend circuit's budget ($\sim 100{,}000$ of
$\sim 150{,}000$ total). Optimising Pedersen-hash circuits has
been a frequent area of contribution.

### 3.4 The "$\rho$ mixing" Pedersen hash

For the Sapling nullifier, $\rho$ is derived from the commitment
and the position via a modified Pedersen hash called
$\mathsf{MixingPedersenHash}$:

$$
\rho \;=\; \mathsf{MixingPedersenHash}(\mathsf{cm},
\mathsf{pos})
\;=\; \mathsf{cm} \;+\; [\mathsf{pos}] G_{\rho},
$$

where $G_{\rho}$ is a fixed generator. $\mathsf{cm}$ is itself a
Pedersen-hash output (a point), and we add (not concatenate) the
position contribution. This keeps $\rho$ a single Jubjub point
without re-hashing. The position is bounded by $2^{32}$, so
$[\mathsf{pos}] G_{\rho}$ is a small-integer scalar mul; in-
circuit much cheaper than another full Pedersen hash.

### 3.5 The `NoteCommit` formula

The Sapling note commitment is

$$
\mathsf{NoteCommit}(\mathsf{rcm}, v, g_d, \mathsf{pk}_d)
=
\mathsf{PH}_{D_{\text{nc}}}\!\bigl(\,
   v_{\text{LE},64} \,\|\,
   u(g_d)_{\text{LE},255} \,\|\,
   u(\mathsf{pk}_d)_{\text{LE},255}
\,\bigr) \;+\; [\mathsf{rcm}] R_{\text{nc}},
$$

with $R_{\text{nc}}$ a fixed Jubjub generator and $u(\cdot)$ the
$u$-coordinate as a 255-bit little-endian string. Inputs total
$64 + 255 + 255 = 574$ bits.

Why $u$-coordinates instead of full point encodings? The
$u$-coordinate uniquely identifies a Jubjub point up to sign,
and the negation of a valid Sapling diversifier is also a valid
encoding. The sign disambiguation does not affect commitment
security (we only need the point modulo sign to be unique).

### 3.6 The `MerkleHash` formula

Layer-aware Merkle hash:

$$
\mathsf{MerkleHash}_\ell(x, y)
=
\mathsf{ExtractJubjub}\!\Bigl(
\mathsf{PH}_{D_{\text{MH}}}\!\bigl(\,
   \ell_{\text{LE},6} \,\|\, x_{\text{LE},255} \,\|\,
   y_{\text{LE},255} \,\bigr)
\Bigr),
$$

with $\ell$ the 6-bit layer index, $x, y$ the 255-bit children.
The result is the $u$-coordinate of the Pedersen-hash output, an
$\mathbb{F}_r$ element. Including $\ell$ prevents an attacker
who sees $\mathsf{MerkleHash}_\ell(a, b)$ from claiming it is
also $\mathsf{MerkleHash}_{\ell'}(a, b)$ at a different layer;
the generators differ per layer.

### 3.7 Constant-time considerations

Pedersen hash outside the circuit (wallet trial-decryption
pipeline) takes secret input ($\mathsf{rcm}$, $v$) and must be
constant-time. `sapling_crypto::pedersen_hash::pedersen_hash`
uses constant-time scalar mul via the `jubjub` crate; bit
decomposition and chunking work on byte-aligned data; looping is
over public-size inputs. The Merkle-tree hash inside scanning is
not secret-dependent beyond the position of the wallet's note,
which the wallet already knows; no constant-time concern.

### 3.8 Sapling Pedersen hash vs Sinsemilla

| Aspect                       | Sapling Pedersen                       | Orchard Sinsemilla              |
| ---------------------------- | -------------------------------------- | ------------------------------- |
| Curve                        | Jubjub                                 | Pallas                          |
| Window                       | 3 bits                                 | 10 bits                         |
| Per-chunk in-circuit cost    | $\sim 6$ constraints                   | $\sim 3$ constraints            |
| Uses lookups?                | No (Groth16 R1CS)                      | Yes (Halo 2 lookups)            |
| Pre-images per segment       | $\sim 2^{189}$                         | $\sim 2^{10}$ entries per fragment |

Sinsemilla is an evolved Pedersen hash that exploits Halo 2's
lookup tables, which Groth16 lacks.

### 3.9 Output type and coordinate extraction

`sapling_crypto::pedersen_hash::pedersen_hash` returns a
`jubjub::SubgroupPoint`. Callers that need a scalar (the Merkle
hash) extract the $u$-coordinate via `to_affine().get_u()`. The
conversion from $\mathbb{F}_r$ (the Jubjub base field, equal to
the BLS12-381 scalar field) to a $\mathbb{F}_r$ scalar is
direct.

### 3.10 Test vectors

Sapling has extensive Pedersen-hash test vectors in
`sapling-crypto`:

- `sapling-crypto/src/test_vectors/pedersen_hash_vectors.rs`:
  bytes in, bytes out.
- `sapling-crypto/src/test_vectors/note_encryption_vectors.rs`:
  end-to-end with all derived values.

When debugging a Pedersen-hash variation, the test vectors
locate corrupt generators or window-encoding bugs in a single
mismatched hash.

## 4. Failure modes

- **Reversed window bit ordering.** $\text{enc}_3$ assumes
  $(b_0, b_1, b_2)$ in little-endian. Reversing endianness
  silently produces wrong hashes whose only symptom is a
  mismatch against the test vectors.
- **Reused personalisation tag.** Every distinct use of
  Pedersen hash has its own personalisation. Adding a new use
  and reusing an existing tag (e.g. recycling the
  `NoteCommitment` tag for a `MerkleTree` use) lets an
  adversary produce two pre-images of the same hash from
  different domains.
- **BLAKE2b vs BLAKE2s for generator hashing.** The generator
  construction uses BLAKE2s with personalisation `"Zcash_PH"`.
  Substituting BLAKE2b changes every generator; the bug only
  manifests when the test vectors mismatch.
- **Cofactor not multiplied in `HashToCurve`.** Omitting the
  final $[h_{\text{J}}] \cdot$ step puts the generator outside
  $E^{\circ}$; chapter 13 covers the small-subgroup
  consequences.
- **Layer index width.** 6 bits is enough for depth-32 trees;
  a future protocol with depth-64 trees would need a wider
  encoding.
- **Missing range constraint on `enc_3`.** If the prover can
  insert a window value outside $\{-4, \ldots, -1, 1, \ldots,
  4\}$, the segment-scalar bound argument breaks. Range
  constraints are enforced via boolean checks in the circuit;
  removing them silently weakens collision resistance.
- **Non-constant-time scalar mul in `pedersen_hash`.** Leaks
  $\mathsf{rcm}$ or $v$ to a timing observer. Use the
  `jubjub::SubgroupPoint::mul` API, not a hand-rolled loop.

## 5. Spec pointers

- [Zcash Protocol Specification, section 5.4.1.7 (Pedersen Hash
  Function)](https://zips.z.cash/protocol/protocol.pdf): the
  formal definition of $\text{enc}_3$, segments, and the
  per-domain generator construction.
- [Zcash Protocol Specification, section 5.4.1.8 (Mixing
  Pedersen Hash)](https://zips.z.cash/protocol/protocol.pdf):
  the $\rho$-mixing variant cited in section 3.4.
- [Zcash Protocol Specification, section 5.4.9 (Group Hash into
  Jubjub)](https://zips.z.cash/protocol/protocol.pdf): the
  try-and-increment hash-to-curve used for the generators.
- [Hopwood et al., *Sapling design notes*](https://github.com/zcash/zips/blob/main/protocol/sapling.pdf):
  the rationale for the 3-bit window and the segment size of
  63.
- [Pedersen, *Non-Interactive and Information-Theoretic Secure
  Verifiable Secret Sharing* (CRYPTO 1991)](https://link.springer.com/chapter/10.1007/3-540-46766-1_9):
  the original Pedersen commitment whose collision-resistance
  reduction underlies the construction.

## 6. Exercises

1. **Verify the encoding by hand.** Compute $\text{enc}_3(c)$
   for $c = (1, 1, 1)$ and $c = (0, 1, 0)$. Confirm against the
   table in section 2. Then compute the segment scalar for
   $c_0 = (1, 0, 0)$, $c_1 = (0, 1, 0)$, all other chunks
   $(0,0,0)$. (Hint: only the first two terms in the sum are
   non-trivial; the rest contribute $\text{enc}_3(0,0,0) = 1$.)
2. **Trace the Sprout vs Sapling commitment.** Compare
   [`zcash_proofs/src/circuit/sprout/commitment.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout/commitment.rs)
   (SHA-256 with a 4-bit type tag prefix) against the Sapling
   `NoteCommit` formula in section 3.5. State which input
   length each accepts and why the Sapling version saves
   roughly an order of magnitude in constraints.
3. **Compute the Spend-circuit Pedersen budget.** Using the
   $\sim 6$ constraints-per-bit estimate from section 3.3, work
   out the total Pedersen-hash constraint count for a Spend
   circuit at tree depth 32. Compare to the empirical
   $\sim 100{,}000$ figure. Identify where the missing
   constraints come from (range checks on $v$, the spend-auth
   key derivation, the value commitment).
4. **Modify and test (`sapling-crypto`).** In a checkout of
   `sapling-crypto`, write a unit test that hashes the empty
   bit string under domain $D_{\text{MH}}$ and asserts the
   output matches the Merkle-tree hash of two zero children at
   layer 0. The test should pass when the layer-index
   encoding is correct and fail if you flip the layer-index
   width from 6 to 7 bits.

### Answers in the code

- Sprout commitment gadget (SHA-256 + 4-bit type tag):
  [`zcash_proofs/src/circuit/sprout/commitment.rs#L1-L39`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout/commitment.rs#L1-L39).
- The Pedersen hash itself lives in the external `sapling-
  crypto` crate; entry points are `pedersen_hash::pedersen_hash`
  (out-of-circuit) and `circuit::pedersen_hash::pedersen_hash`
  (gadget).
- Test vectors are in `sapling-crypto/src/test_vectors/`.

## 7. Further reading

- [Chapter 04](./04-sprout-and-sapling.md): the sketch of
  Pedersen hash this chapter expands.
- [Chapter 17](./17-halo2-deep-dive.md): the Sinsemilla
  construction that supersedes Pedersen hash on Pallas.
- [Chapter 13](./13-cofactors-subgroups-canonical.md): the
  cofactor-clearing step at the end of the generator
  construction.
- [Chapter 24](./24-circuits-constraint-by-constraint.md): the
  clause-by-clause walk of the Spend / Output circuit with
  exact constraint counts.
