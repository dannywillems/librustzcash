# 16 - Pedersen hash deep dive

## Goal

In chapter 04 we sketched the Sapling Pedersen hash. This chapter
fills in the full construction: the windowed encoding, the
generator derivation, the constraint count, and the security
arguments. Pedersen hash is the **single most-evaluated cryptographic
operation in Sapling** (every note commitment, every Merkle-tree
hash, every value commitment) so its details deserve attention.

## 1. The setting

We work in the prime-order subgroup $E^{\circ}_{\text{Jubjub}}$ of
order $\ell_{\text{J}} \approx 2^{252}$. A Pedersen hash takes a bit
string $m \in \{0,1\}^k$ and a domain-separation tag $D$ and outputs
a curve point. We write $G_j^{(D)}$ for the $j$-th generator
associated with domain $D$.

## 2. The windowed encoding

Group $m$ into 3-bit chunks $c_0, c_1, c_2, \ldots$ Each chunk
$c = (b_0, b_1, b_2) \in \{0, 1\}^3$ is mapped to a *signed integer*

$$
\text{enc}_3(c) \;=\; (1 + b_0 + 2 b_1)(1 - 2 b_2) \;\in\; \{-4, -3, -2, -1, 1, 2, 3, 4\}.
$$

That is:

| $c = (b_0, b_1, b_2)$ | $\text{enc}_3(c)$ |
| --- | --- |
| $(0, 0, 0)$ | $1$ |
| $(1, 0, 0)$ | $2$ |
| $(0, 1, 0)$ | $3$ |
| $(1, 1, 0)$ | $4$ |
| $(0, 0, 1)$ | $-1$ |
| $(1, 0, 1)$ | $-2$ |
| $(0, 1, 1)$ | $-3$ |
| $(1, 1, 1)$ | $-4$ |

This is the **booth-encoded** representation of a 3-bit window with a
sign bit. The advantage: in-circuit, doubling the partial sum costs
the same as adding it, so the encoding minimises the number of base
doublings needed.

## 3. Segments

Combine 63 consecutive chunks into one **segment**. A segment encodes
$3 \times 63 = 189$ bits of input. Within a segment of chunks
$c_0, \ldots, c_{62}$, define the segment-scalar

$$
\langle\!\langle c_0, \ldots, c_{62} \rangle\!\rangle
\;=\;
\sum_{i=0}^{62} \text{enc}_3(c_i) \cdot 2^{4i}.
$$

The factor $2^{4i}$ (not $2^{3i}$) is chosen because each window
contributes a value in $\{-4, \ldots, 4\}$, which needs *four bits*
to encode unambiguously. The spacing $2^{4i}$ keeps the segment
scalars uniquely decodable.

A segment scalar lies in approximately

$$
\Bigl(\sum_{i=0}^{62} -4 \cdot 2^{4i}, \; \sum_{i=0}^{62} 4 \cdot 2^{4i}\Bigr)
\;\approx\; \Bigl(-\tfrac{4}{15} \cdot 2^{252}, \; \tfrac{4}{15} \cdot 2^{252}\Bigr).
$$

This is comfortably less than $\ell_{\text{J}}$ so the scalar-mul
$[\langle\!\langle \ldots \rangle\!\rangle] G_j$ is meaningful and
collision-resistant.

## 4. Generators per segment

Each segment $j$ has its own generator $G_j^{(D)}$ derived
deterministically from $D$ and $j$:

$$
G_j^{(D)} \;=\; \mathsf{HashToCurve}_{\text{Jubjub}}\!\bigl(D \,\|\, j_{\text{LE}}\bigr).
$$

The actual `hash_to_curve` used is a try-and-increment construction:

1. Compute $h = \mathsf{BLAKE2s\text{-}256}(\text{"Zcash\_PH"} \,\|\,
   D \,\|\, j_{\text{LE}} \,\|\, \text{counter})$.
2. Interpret $h$ as a candidate $v$-coordinate. Recover $u$ from the
   curve equation; if no valid $u$ exists, increment the counter and
   retry.
3. Multiply by the cofactor $h_{\text{J}} = 8$ to land in the
   prime-order subgroup.

This is deterministic (no randomness) so any party can recompute the
same generator set; it is also *uniform* in $E^{\circ}_{\text{Jubjub}}$
modulo a negligible bias.

Crucially: the discrete log of any $G_j^{(D)}$ relative to any other
is **unknown** (and computing it requires solving DLP on Jubjub).
Pedersen-hash collision resistance reduces to DLP.

## 5. The hash value

Let $S(m)$ be the number of segments after padding $m$ to a multiple
of 189 bits. Define

$$
\mathsf{PH}_D(m) \;=\; \sum_{j=0}^{S(m)-1} [\,\langle\!\langle c_{j,0}, \ldots, c_{j, 62} \rangle\!\rangle\,] G_j^{(D)}
\;\in\; E^{\circ}_{\text{Jubjub}}.
$$

The "$D$" tag is used to select different generator sets per
domain. The domains in Sapling include:

- `"Zcash_PH"` with sub-tags for `"NoteCommitment"`, `"MerkleTree"`,
  `"PRF_nf"`, etc.
- Specific personalisations are defined in section 5.4.1.7 of the
  protocol spec.

## 6. Collision resistance

**Claim**: finding $m_1 \neq m_2$ with $\mathsf{PH}_D(m_1) =
\mathsf{PH}_D(m_2)$ is at least as hard as solving DLP on Jubjub.

**Proof sketch**: A collision yields $\sum_j [s_j] G_j = \sum_j [s'_j]
G_j$ for distinct windowed encodings $\{s_j\}, \{s'_j\}$. Setting
$\Delta_j = s_j - s'_j$, we get $\sum [\Delta_j] G_j = \mathcal{O}$,
which expresses a non-trivial linear relation among the $G_j$'s. If
the $G_j$'s are chosen so that they have pairwise unknown discrete
logs, finding such a relation contradicts DLP.

The actual proof goes through Pedersen's original argument; the
windowed encoding does not weaken it because the encoding is
injective on its codomain (different chunks produce different signed
ints).

## 7. In-circuit constraint count

Inside the Sapling Spend/Output Groth16 circuit, computing a Pedersen
hash of $k$ bits costs approximately

$$
\text{constraints} \;\approx\; \tfrac{k}{3} \cdot (\text{constraints per window}).
$$

In `sapling-crypto::circuit::pedersen_hash`, the actual breakdown
(R1CS constraints, per window):

- 1 constraint to range-check the boolean bits.
- 2-3 constraints to compute the signed-window scalar from the
  bits.
- 5-7 constraints to perform conditional point addition with the
  per-segment generator (using twisted-Edwards strongly-unified
  formulas).

Net: $\sim 6$ constraints per bit. For the Sapling note commitment
(input $\approx 8 + 88 + 256 + 256 = 608$ bits before randomness),
that is $\sim 3600$ constraints. The Merkle tree hash (input $\approx
512$ bits) is $\sim 3000$ constraints, times tree depth $32 \approx
100{,}000$ constraints.

This dominates the Spend circuit's constraint budget (~100,000 of
~150,000 total constraints). Optimising Pedersen-hash circuits has
been a frequent area of contribution.

## 8. The "$\rho$ mixing" Pedersen hash

For the Sapling nullifier, $\rho$ is derived from the commitment and
the position via a *modified* Pedersen-hash called
$\mathsf{MixingPedersenHash}$:

$$
\rho \;=\; \mathsf{MixingPedersenHash}(\mathsf{cm}, \mathsf{pos})
\;=\; \mathsf{cm} \;+\; [\mathsf{pos}] G_{\rho},
$$

where $G_{\rho}$ is a fixed generator. Note: $\mathsf{cm}$ is itself
a Pedersen-hash output (a point), and we *add* (not concatenate) the
position contribution. This keeps $\rho$ a single Jubjub point
without re-hashing.

The position is bounded by the tree size ($2^{32}$ leaves), so
$[\mathsf{pos}] G_{\rho}$ is a scalar-mul of a small integer; in-
circuit this is much cheaper than another full Pedersen hash.

## 9. NoteCommitment full formula

Putting it together, the Sapling note commitment is

$$
\mathsf{NoteCommit}(\mathsf{rcm}, v, g_d, \mathsf{pk}_d)
=
\mathsf{PH}_{D_{\text{nc}}}\!\bigl(\,
   v_{\text{LE},64} \,\|\,
   u(g_d)_{\text{LE},255} \,\|\,
   u(\mathsf{pk}_d)_{\text{LE},255}
\,\bigr) \;+\; [\mathsf{rcm}] R_{\text{nc}},
$$

with $R_{\text{nc}}$ a fixed Jubjub generator and
$u(\cdot)$ extracting the $u$-coordinate as a 255-bit
little-endian string. Inputs total $64 + 255 + 255 = 574$ bits.

Why use $u$-coordinates instead of full point encodings? Because the
$u$-coordinate uniquely identifies a Jubjub point up to sign, and
the *negation* of a valid Sapling diversifier is also a valid
encoding. The sign disambiguation does not affect commitment
security (we only need the point modulo sign to be unique).

## 10. MerkleHash full formula

Layer-aware:

$$
\mathsf{MerkleHash}_\ell(x, y)
=
\mathsf{ExtractJubjub}\!\Bigl(
\mathsf{PH}_{D_{\text{MH}}}\!\bigl(\,
   \ell_{\text{LE},6} \,\|\, x_{\text{LE},255} \,\|\, y_{\text{LE},255}
\,\bigr)
\Bigr),
$$

with $\ell$ the 6-bit layer index, $x, y$ the 255-bit children. The
result is the $u$-coordinate of the Pedersen hash output, as a
$\mathbb{F}_r$ element.

The inclusion of $\ell$ prevents an attacker who sees
$\mathsf{MerkleHash}_\ell(a, b)$ from claiming it is also
$\mathsf{MerkleHash}_{\ell'}(a, b)$ at a different layer; the
generators differ per layer.

## 11. Constant-time considerations

Pedersen-hash evaluation outside the circuit (in the wallet's
trial-decryption pipeline, for instance) takes secret input
($\mathsf{rcm}$, $v$). The implementation must be constant-time.

`sapling-crypto::pedersen_hash::pedersen_hash` uses constant-time
scalar mul via the `jubjub` crate. The bit-decomposition and
chunking work on byte-aligned data; the looping is over public-size
inputs.

The Merkle-tree hash inside scanning is *not* secret-dependent
beyond the position of the wallet's note, which the wallet already
knows; no constant-time concern.

## 12. Sapling Pedersen hash vs Sinsemilla

| Aspect | Sapling Pedersen | Orchard Sinsemilla |
| --- | --- | --- |
| Curve | Jubjub | Pallas |
| Window | 3 bits | 10 bits |
| Per-chunk cost in-circuit | ~6 constraints | ~3 constraints |
| Uses lookups? | No (Groth16 R1CS) | Yes (Halo 2 lookups) |
| Pre-images bound | $\sim 2^{63 \cdot 3} = 2^{189}$ bits per segment | $\sim 2^{10}$ entries per fragment |

Sinsemilla is in some sense an "evolved Pedersen hash" that takes
advantage of Halo 2's lookup tables, which Groth16 lacks.

## 13. The "personal_crh" exit

`sapling-crypto::pedersen_hash::pedersen_hash` returns a
`jubjub::SubgroupPoint`. Callers that need a scalar (e.g. the Merkle
hash) extract the $u$-coordinate via `to_affine().get_u()`.

The conversion from $\mathbb{F}_r$ (the Jubjub base field, equal to
the BLS12-381 scalar field) to a $\mathbb{F}_r$ scalar is
direct.

## 14. Pitfalls

- **Window bit ordering**: a 3-bit window is $(b_0, b_1, b_2)$ in
  little-endian; the `enc_3` formula assumes this order. Reversing
  endianness silently produces wrong hashes.
- **Personalisation tags**: every distinct use of Pedersen hash has
  its own personalisation. Adding a new use and reusing an existing
  tag is a vulnerability.
- **Generator construction**: the `hash_to_curve` for generators
  uses BLAKE2s with a specific personalisation. Implementing it
  with BLAKE2b is wrong; that bug would only manifest by producing
  different generators than the spec mandates.
- **Layer index width**: 6 bits is enough for depth-32 trees but
  not deeper. If a future protocol uses depth-64 trees, the
  encoding needs revision.

## 15. Where this lives in the workspace

- `sapling-crypto::pedersen_hash::pedersen_hash`: the outside-circuit
  function used by the wallet.
- `sapling-crypto::circuit::pedersen_hash::pedersen_hash`: the
  Bellman-gadget version used inside the Spend/Output circuit.
- `sapling-crypto::constants`: the precomputed generator sets per
  domain.
- `sapling-crypto::primitives::NoteCommitment`: the high-level note
  commitment using Pedersen hash + commitment randomness.
- `sapling-crypto::primitives::MerkleHash`: the Merkle-tree hash.

If you want to truly understand Sapling, read these files alongside
the protocol spec section 5.4.1.7-8 and verify each formula in
this chapter against the code.

## 16. Test vectors

Sapling has extensive test vectors for Pedersen hash:

- `sapling-crypto/src/test_vectors/pedersen_hash_vectors.rs`: bytes
  in, bytes out.
- `sapling-crypto/src/test_vectors/note_encryption_vectors.rs`:
  end-to-end with all derived values.

When debugging a Pedersen-hash variation, point at the test vectors
first; a corrupted generator set is obvious from a single mismatched
hash.

## What you should know after this chapter

- The windowed encoding $\text{enc}_3$ and the segment construction.
- How generators are derived deterministically per segment and per
  domain.
- The collision-resistance argument from DLP.
- Approximate constraint costs in the Sapling circuit.
- Why "extract $u$" instead of full encodings.
- The MixingPedersenHash trick for $\rho$.

Next: a parallel deep dive on Halo 2 internals.
