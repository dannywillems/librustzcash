---
sidebar_position: 24
title: Circuits, constraint by constraint
description: "Sapling Spend, Sapling Output, Orchard Action constraint-by-constraint."
---

# 24 - Circuits, constraint by constraint

## 1. Why this chapter exists

The Sapling Spend circuit, the Sapling Output circuit, and the
Orchard Action circuit are the cryptographic heart of Zcash's
shielded protocols. Earlier chapters described them at the
statement level. A contributor who modifies a circuit, adds a
public input, or changes a generator without understanding each
constraint will either break soundness or invalidate the trusted
setup. This chapter walks every clause in the order the prover
witnesses and the verifier checks, with an explicit "attack on
omission" note showing what fails if the clause is removed. The
implementations live in the external
[`sapling-crypto`](https://github.com/zcash/sapling-crypto) and
[`orchard`](https://github.com/zcash/orchard) crates, consumed by
this workspace via
[`zcash_proofs/src/circuit`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit)
(for Sprout) and the high-level builders in
[`zcash_primitives/src/transaction/builder.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/builder.rs).

Constraint counts are approximate; exact numbers depend on gadget
implementation and shift over time as optimisations land.

## 2. Definitions

**Definition 2.1 (R1CS).** A Rank-1 Constraint System is a
triple $(\mathbf{A}, \mathbf{B}, \mathbf{C})$ of matrices over a
field $\mathbb{F}$ together with a wire vector
$\mathbf{w} = (1, w_1, \ldots, w_n) \in \mathbb{F}^{n+1}$ such
that each constraint has the form
$$
\Bigl(\sum_i a_i w_i\Bigr) \cdot
\Bigl(\sum_i b_i w_i\Bigr) \;=\;
\Bigl(\sum_i c_i w_i\Bigr),
$$
where the rows of $\mathbf{A}, \mathbf{B}, \mathbf{C}$ supply
the coefficients. Sapling Spend uses approximately $1.5 \times
10^5$ constraints over $\mathbb{F}_r$ (the BLS12-381 scalar
field) in
[`sapling-crypto`](https://github.com/zcash/sapling-crypto). The
toolkit is `bellman`.

**Definition 2.2 (PLONKish / Halo 2 arithmetisation).** A
PLONKish arithmetisation is a table of cells with custom gates.
Let $\omega \in \mathbb{F}$ be a primitive $2^k$-th root of
unity. For each row $i$, advice polynomials
$w_1, \ldots, w_m : \mathbb{F} \rightarrow \mathbb{F}$ are
evaluated at $\omega^i$ and may impose constraints
$$
G\bigl(w_1(\omega^i), w_2(\omega^i), \ldots\bigr) \cdot
q_{\mathrm{sel}}(\omega^i) \;=\; 0,
$$
where $q_{\mathrm{sel}}$ is the selector polynomial that
activates the gate $G$. Permutation arguments encode copy
constraints; lookups enforce table membership. The Orchard
Action circuit uses $2^{11}$ rows by default over the Pallas
scalar field $\mathbb{F}_{q_P}$, implemented in
[`halo2_proofs`](https://github.com/zcash/halo2).

**Definition 2.3 (Underconstrained advice cell).** In a Halo 2
circuit with advice columns
$\mathbf{a}_1, \ldots, \mathbf{a}_m$, an advice cell
$\mathbf{a}_j(\omega^i)$ is *underconstrained* iff no selector-
gated gate $G \cdot q_{\mathrm{sel}} = 0$ references it with a
non-trivial coefficient. A malicious prover can assign such a
cell arbitrarily without violating any constraint, breaking
soundness. Trail of Bits codified this as a recurring finding
class in the Orchard audit; see
[Trail of Bits publications](https://github.com/trailofbits/publications).

**Definition 2.4 (Incomplete addition).** Let $E$ be an
elliptic curve in short Weierstrass form
$y^2 = x^3 + a x + b$. The incomplete-addition formulas compute
$P + Q$ from affine coordinates and become singular when
$P = Q$ or $P = -Q$. The strongly-unified twisted-Edwards
formulas used for Jubjub do not have this issue; the Pallas
gates in Halo 2 do, and require an explicit distinctness
witness to rule out the singular case.

**Definition 2.5 (Pedersen hash gadget $\mathsf{PH}$).** The
Jubjub-based windowed-multiplication hash
$\mathsf{PH}_D : \{0,1\}^{\ast} \rightarrow \mathbb{G}_J$ as
formalised in chapter 16, Definition 2.5, instantiated as a
$\mathbb{F}_r$-R1CS gadget. The constraint cost is
approximately $6$ constraints per input bit.

**Definition 2.6 (Sinsemilla).** The Pallas-based chunk-and-add
hash $\mathsf{Sinsemilla}_D : \{0,1\}^{\ast} \rightarrow
\mathbb{G}_P$ used in Orchard. Each 10-bit chunk
$c \in \{0,1\}^{10}$ is mapped via a lookup table to a generator
$S(c) \in \mathbb{G}_P$, and successive points are combined via
incomplete addition. The constraint cost is roughly proportional
to the chunk count.

**Definition 2.7 (Circuit statement).** For a circuit $C$ over
field $\mathbb{F}$, the *statement* is the NP relation
$R_C \subseteq \mathcal{X} \times \mathcal{W}$ that $C$
enforces between a public input $x \in \mathcal{X}$ and a
witness $w \in \mathcal{W}$. Each section below names the
statement before walking its clauses.

### The NP relations the three Zcash circuits prove

For reference and as the citation target for the failure-modes
sections below, the three production circuits prove membership in
the following NP languages. The Sapling Spend and Output relations
are stated formally in
[chapter 04 §2](./04-sprout-and-sapling.md#the-np-relations-proven-by-sapling).
The Orchard Action relation is stated here because it is the unit
the Orchard circuit module enforces atomically.

**Definition 2.8 (Orchard Action relation $R_{\mathsf{Action}}$).**
Let $\mathbb{F}_p$ be the Pallas base field, $\mathbb{F}_q$ the
Pallas scalar field, $\mathbb{G}_P$ the Pallas curve group
(cofactor $1$, so $\mathbb{G}_P$ is already prime-order). Define
$$
\mathcal{X}_{\mathsf{Action}} \;=\;
\bigl(
\mathsf{anchor},\,
\mathsf{cv}^{\text{net}},\,
\mathsf{nf},\,
\mathsf{rk},\,
\mathsf{cm}_x,\,
\mathsf{epk},\,
\mathsf{enableSpends},\,
\mathsf{enableOutputs}
\bigr).
$$
The witness $\mathcal{W}_{\mathsf{Action}}$ carries both an input
note and an output note:
$$
\mathcal{W}_{\mathsf{Action}} \;=\;
\bigl(
\underbrace{d^{\text{old}}, \mathsf{pk}_d^{\text{old}}, v^{\text{old}},
\rho^{\text{old}}, \psi^{\text{old}}, \mathsf{rcm}^{\text{old}},
\mathsf{path}, \mathsf{pos}}_{\text{input}};\;
\underbrace{d^{\text{new}}, \mathsf{pk}_d^{\text{new}}, v^{\text{new}},
\rho^{\text{new}}, \psi^{\text{new}}, \mathsf{rcm}^{\text{new}}}_{\text{output}};\;
\underbrace{\mathsf{rcv}, \mathsf{ak}, \mathsf{nk},
\mathsf{rivk}, \alpha, \mathsf{esk}^{\text{new}}}_{\text{keys/rand}}
\bigr).
$$
Then $(x, w) \in R_{\mathsf{Action}}$ iff every clause below holds.
The notation $\mathsf{NoteCommit}^O$ refers to the Sinsemilla-based
Orchard note commitment, distinct from the Sapling Pedersen one.

1. **Input note well-formedness.** $g_d^{\text{old}} =
   \mathsf{DiversifyHash}(d^{\text{old}}) \in \mathbb{G}_P$ and
   $\mathsf{pk}_d^{\text{old}} \in \mathbb{G}_P$.
2. **Output note well-formedness.** Same with the new diversifier
   $d^{\text{new}}$.
3. **Input commitment.** $\mathsf{cm}^{\text{old}} =
   \mathsf{NoteCommit}^O(g_d^{\text{old}}, \mathsf{pk}_d^{\text{old}},
   v^{\text{old}}, \rho^{\text{old}}, \psi^{\text{old}},
   \mathsf{rcm}^{\text{old}})$.
4. **Output commitment.** $\mathsf{cm}^{\text{new}} = \ldots$
   and $\mathsf{cm}_x = \mathsf{ExtractP}(\mathsf{cm}^{\text{new}})$
   (Pallas $x$-coordinate).
5. **Merkle membership.** Either
   $v^{\text{old}} = 0$, or
   $\mathsf{MerklePath}_{\text{Sinsemilla}}(\mathsf{path},
   \mathsf{pos}, \mathsf{ExtractP}(\mathsf{cm}^{\text{old}}))
   = \mathsf{anchor}$.
6. **Net value commitment.** $\mathsf{cv}^{\text{net}} =
   [v^{\text{old}} - v^{\text{new}}] V_O +
   [\mathsf{rcv}] R_O$, where $V_O, R_O$ are the Orchard value-
   commitment generators.
7. **Spend authority.** With $\mathsf{ak}$ derived from a
   $\mathsf{rk}$-randomisable family,
   $\mathsf{rk} = \mathsf{ak} + [\alpha] G_O^{\text{a}}$.
8. **Nullifier integrity.** $\mathsf{nf} = \mathsf{ExtractP}(
   [\mathsf{nk}^{-1} \cdot \mathsf{PRF}^O_{\mathsf{nk}}(\rho^{\text{old}}
   + \psi^{\text{old}}) + \mathsf{cm}^{\text{old}}_x] G_O^{\text{n}})$.
9. **Diversified address (input).** $\mathsf{pk}_d^{\text{old}} =
   [\mathsf{ivk}] g_d^{\text{old}}$ where $\mathsf{ivk} =
   \mathsf{CommitIvk}^O(\mathsf{ak}, \mathsf{nk},
   \mathsf{rivk}) \bmod p_J$ (full-width to short-Pallas
   conversion).
10. **Output ephemeral key.** $\mathsf{epk} = [\mathsf{esk}^{\text{new}}]
    g_d^{\text{new}}$.
11. **Flag enforcement.** If $\mathsf{enableSpends} = 0$ then
    $v^{\text{old}} = 0$ and the spend-authority clause is bypassed
    by selector. If $\mathsf{enableOutputs} = 0$ then $v^{\text{new}}
    = 0$.
12. **Value range.** $v^{\text{old}}, v^{\text{new}} \in
    [0, 2^{64})$.

Soundness: under the discrete-log hardness assumption in the Pallas
group plus the Fiat-Shamir security of the Halo 2 transcript. There
is **no trusted setup**; the IPA polynomial commitment is
unconditionally binding.

The circuit module enforcing $R_{\mathsf{Action}}$ lives in
[`orchard::circuit`](https://github.com/zcash/orchard/blob/main/src/circuit.rs);
the constraint-by-constraint walkthrough belongs in the
[orchard companion course](https://dannywillems.github.io/orchard/),
not here.

## 3. The code

### 3.1 Sapling Spend statement

The full statement (consolidated from chapter 04): the prover
knows secret $(v, g_d, \mathsf{pk}_d, \mathsf{rcm}, \alpha,
\mathsf{ak}, \mathsf{nsk}, \text{auth-path}, \text{pos})$ such
that:

1. $\mathsf{cm} =
   \mathsf{NoteCommit}^{\mathsf{rcm}}(g_d, \mathsf{pk}_d, v)$.
2. The Merkle path from $\mathsf{cm}$ at $\text{pos}$ leads to the
   public anchor.
3. $\mathsf{pk}_d = [\mathsf{ivk}]\,g_d$ with
   $\mathsf{ivk} = \mathsf{CRH}^{\mathsf{ivk}}(\mathsf{ak},
   \mathsf{nk})$ and $\mathsf{nk} = [\mathsf{nsk}]\,
   G^{\mathsf{nk}}$.
4. $\mathsf{rk} = \mathsf{ak} + [\alpha]\,G^{\mathsf{ak}}$
   (public).
5. $\mathsf{nf} = \mathsf{PRF}^{\mathsf{nfSapling}}_{\mathsf{nk}}(
   \mathsf{MixingPedersenHash}(\mathsf{cm}, \text{pos}))$
   (public).
6. $\mathsf{cv} = [v]\,V + [\mathsf{rcv}]\,R$ (public
   $\mathsf{cv}$).
7. $v \in [0, 2^{64})$.
8. Either $v = 0$ (dummy spend, Merkle check skipped) or the
   Merkle path is checked.

Public inputs: $\mathsf{rk}$, $\mathsf{cv}$, $\mathsf{nf}$,
$\mathsf{anchor}$.

The verifying-key hash for this circuit is pinned in
[`zcash_proofs/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs):

```rust reference title="zcash_proofs/src/lib.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs#L40-L60
```

### 3.2 Sapling Spend witness allocation

Approximate sub-circuit costs (R1CS constraints):

| Witness | Bits | Constraints |
| --- | --- | --- |
| $v$ | 64 | 64 boolean + 1 packing |
| $g_d$ | 256 (encoded as bits) | ~750 |
| $\mathsf{pk}_d$ | 256 | ~750 |
| $\mathsf{rcm}$ | 252 | 252 boolean |
| $\alpha$ | 252 | 252 boolean |
| $\mathsf{ak}$ | 256 | ~750 |
| $\mathsf{nsk}$ | 252 | 252 boolean |
| auth-path | $32 \times 256$ | ~8000 bit constraints |

The witness alone is ~12,000 constraints before any checks run.

### 3.3 Clause: $\mathsf{nk} = [\mathsf{nsk}]\,G^{\mathsf{nk}}$

Scalar mul of a fixed generator by a 252-bit secret. Using the
fixed-base windowed comb gadget in `sapling-crypto`:

- 252 bits of $\mathsf{nsk}$ are decomposed.
- For each 3-bit window, a constant-time table select picks one
  of 8 precomputed multiples.
- The selected multiples are summed.

Constraint cost: ~750.

**Attack on omission**: a witnessed $\mathsf{nk}$ unrelated to
$\mathsf{nsk}$ lets the spender choose $\mathsf{nk}$ post-hoc,
allowing nullifier prediction for unspent notes or forged
nullifier collisions.

### 3.4 Clause: $\mathsf{ivk} = \mathsf{CRH}^{\mathsf{ivk}}(\mathsf{ak}, \mathsf{nk})$

$\mathsf{CRH}^{\mathsf{ivk}}$ is BLAKE2s-256 of the concatenated
encodings of $\mathsf{ak}$ and $\mathsf{nk}$ (as $u$-coordinates)
plus parity bits. Implementing BLAKE2s in R1CS is expensive: one
of the largest sub-circuits in Sapling, ~16,000 constraints.

The output is reduced modulo $\ell_J$ to produce $\mathsf{ivk}$.
The reduction is a controlled bit-truncation rather than a full
modular reduction, valid because $\ell_J < 2^{252}$ and the top
bits are zeroed.

Constraint cost: ~16,000.

**Attack on omission**: an unmoored $\mathsf{ivk}$ would let the
prover claim ownership of arbitrary $\mathsf{pk}_d$ they do not
control.

### 3.5 Clause: $\mathsf{pk}_d = [\mathsf{ivk}]\,g_d$

Variable-base scalar mul: $g_d$ is itself witnessed, so cannot
use a fixed-base table. Implementation: 252-bit Edwards
scalar-mul gadget using strongly-unified addition.

Constraint cost: ~3000.

**Attack on omission**: a prover could spend a note addressed to
an arbitrary $(d, \mathsf{pk}_d)$ they do not own.

### 3.6 Clause: $\mathsf{rk} = \mathsf{ak} + [\alpha]\,G^{\mathsf{ak}}$

Fixed-base scalar mul $[\alpha]\,G^{\mathsf{ak}}$ (~750
constraints) plus one Edwards addition (~6 constraints), then
equality with the public $\mathsf{rk}$.

Constraint cost: ~760.

**Attack on omission**: the published $\mathsf{rk}$ would not be
a re-randomisation of the actual $\mathsf{ak}$. An attacker could
sign with their own key under their own $\mathsf{rk}$ while
spending a victim's note.

### 3.7 Clause: NoteCommitment

$$
\mathsf{cm} = \mathsf{PedersenHash}_{D_{\text{nc}}}\bigl(
\text{repr}(v) \,\|\, \text{repr}(g_d) \,\|\,
\text{repr}(\mathsf{pk}_d)\bigr) + [\mathsf{rcm}]\,R_{\text{nc}}.
$$

The Pedersen hash gadget (chapter 16) is the most heavily used
sub-circuit. For an input of $64 + 256 + 256 = 576$ bits:

- ~6 constraints per bit, so ~3500 for the hash.
- Plus the randomness term: 252-bit fixed-base scalar mul on
  $R_{\text{nc}}$, ~750 constraints.

Constraint cost: ~4250.

**Attack on omission**: a prover that picks $\mathsf{cm}$ freely
can spend a note that does not exist.

### 3.8 Clause: Merkle path

For each layer $\ell \in \{0, 1, \ldots, 31\}$:

1. Witness the auth-path sibling at this layer and a boolean
   indicating "is the current node the left or right child".
2. Compute $\mathsf{MerkleHash}_\ell(\text{left}, \text{right})$
   where left/right are conditionally swapped based on the bit.
3. Use the result as the current node at layer $\ell + 1$.

The conditional swap costs ~2 constraints; the Pedersen hash for
a 512-bit input is ~3000 constraints; the layer personalisation
adds a small constant.

Per layer: ~3000 constraints. Times 32 layers: ~96,000
constraints. This is the dominant cost of the Spend circuit.

**Attack on omission**: a prover could spend an arbitrary
$\mathsf{cm}$ they invented, without it being in the tree. Money
out of thin air.

### 3.9 Clause: dummy spend handling

If $v = 0$, the Merkle path check is skipped: a dummy spend does
not correspond to a real note in the tree. The circuit implements
this by computing the Merkle output and a "dummy override"
output, then conditionally selecting between them based on
$v = 0$. The override does not set the anchor to a free choice;
the dummy clause makes the Merkle-path computation a no-op while
all other clauses still hold. The effect: when $v = 0$, the
$\mathsf{cm}$ may be any well-formed commitment but no anchor
membership is claimed.

Implemented as an if-then-else over boolean multiplexing in
`bellman` gadgets.

**Attack on omission**: without the dummy mechanism, every spend
revealed the bundle's true input count, leaking metadata.

### 3.10 Clause: $\rho = \mathsf{MixingPedersenHash}(\mathsf{cm}, \text{pos})$

$\rho$ is computed in-circuit:

$$
\rho \;=\; \mathsf{cm} \;+\; [\text{pos}]\,G_\rho.
$$

For $\text{pos}$ bounded by $2^{32}$, the scalar mul is cheap
(~100 constraints). Plus one Edwards add (~6 constraints).

Total: ~110 constraints.

### 3.11 Clause: $\mathsf{nf} = \mathsf{PRF}^{\mathsf{nfSapling}}_{\mathsf{nk}}(\rho)$

The PRF is BLAKE2s with key $\mathsf{nk}$ and input $\rho$. Same
BLAKE2s gadget as $\mathsf{CRH}^{\mathsf{ivk}}$.

Constraint cost: ~16,000.

The public output is $\mathsf{nf}$.

**Attack on omission**: the nullifier could be arbitrary,
allowing double-spends.

### 3.12 Clause: ValueCommitment

$\mathsf{cv} = [v]\,V + [\mathsf{rcv}]\,R$.

Fixed-base scalar mul on $V$ with the 64-bit $v$ (~250
constraints) plus fixed-base on $R$ with 252-bit $\mathsf{rcv}$
(~750).

Constraint cost: ~1000.

The result is checked against the public $\mathsf{cv}$.

**Attack on omission**: the published $\mathsf{cv}$ could fail
to commit to $v$, breaking the binding-signature equation and
allowing value forgery.

### 3.13 Clause: 64-bit range check on $v$

The boolean decomposition of $v$ is into exactly 64 bits,
enforced by 64 boolean constraints during witnessing.

**Attack on omission**: a value $> 2^{64}$ would overflow the
binding-signature value-balance accumulator, allowing implicit
value forgery.

### 3.14 Sapling Spend total

The Sapling Spend circuit has approximately 150,000 constraints
in current implementations:

| Clause | Constraints |
| --- | --- |
| Witness encoding | ~12,000 |
| Subgroup-check gadgets | ~6,000 |
| $\mathsf{nk}$ derivation | ~750 |
| $\mathsf{CRH}^{\mathsf{ivk}}$ (BLAKE2s) | ~16,000 |
| $\mathsf{pk}_d$ check | ~3,000 |
| $\mathsf{rk}$ check | ~760 |
| NoteCommitment | ~4,250 |
| Merkle path (32 layers) | ~96,000 |
| $\rho$ mixing | ~110 |
| Nullifier PRF | ~16,000 |
| ValueCommitment | ~1,000 |
| Range check | ~64 |
| Misc / linking | ~few thousand |

Numbers from the public `sapling-crypto` code, subject to change
with optimisations.

### 3.15 Sapling Output statement

From chapter 04: the prover knows $(v, g_d, \mathsf{pk}_d,
\mathsf{rcm}, \mathsf{rcv}, \mathsf{esk})$ such that:

1. $\mathsf{cm} =
   \mathsf{NoteCommit}^{\mathsf{rcm}}(g_d, \mathsf{pk}_d, v)$,
   with $\mathsf{cm}^u$ as the public output.
2. $\mathsf{cv} = [v]\,V + [\mathsf{rcv}]\,R$ (public).
3. $\mathsf{epk} = [\mathsf{esk}]\,g_d$ (public).
4. $v \in [0, 2^{64})$.
5. $g_d$ is a valid prime-order subgroup element (non-zero).

Sub-circuit costs:

| Clause | Constraints |
| --- | --- |
| Witness encoding | ~6,000 |
| Subgroup check on $g_d$ | ~750 |
| NoteCommitment | ~4,250 |
| Extract $u$-coordinate | ~5 |
| ValueCommitment | ~1,000 |
| $\mathsf{epk}$ scalar mul | ~3,000 |
| Range check $v$ | 64 |
| Misc | ~few thousand |

Total: ~20,000 constraints. The Output circuit is much cheaper
than Spend (no Merkle path, no nullifier).

#### Clause: subgroup check on $g_d$

The circuit asserts that the witnessed $g_d$ is in the prime-
order subgroup. For Jubjub this requires checking
$[\ell_J]\,g_d = \mathcal{O}$, which is expensive but
unavoidable.

In practice the implementation uses an implicit subgroup check:
$g_d = \mathsf{DiversifyHash}(d)$ is computed by the sender via
cofactor multiplication outside the circuit; inside the circuit
the prover proves $g_d \neq \mathcal{O}$ (one non-zero check) and
the rest of the structure relies on the subgroup membership
being witnessed honestly. The canonical encoding of $g_d$ in the
encrypted note plaintext, combined with the recipient's re-
derivation $g_d = \mathsf{DiversifyHash}(d)$ at decryption time,
catches non-subgroup $g_d$ from the recipient side. This is the
kind of subtlety chapter 13 warns about; reading the circuit
code is essential.

#### Clause: $\mathsf{epk} = [\mathsf{esk}]\,g_d$

Variable-base scalar mul. ~3000 constraints.

**Attack on omission**: the published $\mathsf{epk}$ could be
unrelated to $\mathsf{esk}$, breaking note-encryption recovery
for the sender (via $\mathsf{ovk}$).

#### Why no anchor or nullifier

An Output creates value; it does not prove the new note is in
the tree (it adds itself) and does not have a nullifier (it has
not been spent).

### 3.16 Orchard Action statement

The Action circuit unifies Spend and Output. From chapter 05:
for each Action, the prover knows:

- **Old note**: $(v_{\text{old}}, g_d^{\text{old}},
  \mathsf{pk}_d^{\text{old}}, \rho^{\text{old}},
  \psi^{\text{old}}, \mathsf{rcm}^{\text{old}},
  \text{auth-path}, \mathsf{ak}, \mathsf{nk}, \mathsf{rivk},
  \alpha)$.
- **New note**: $(v_{\text{new}}, g_d^{\text{new}},
  \mathsf{pk}_d^{\text{new}}, \psi^{\text{new}},
  \mathsf{rcm}^{\text{new}})$.

Such that:

1. If spends enabled: the old commitment is in the tree at the
   public anchor.
2. $\rho^{\text{new}} = \mathsf{nf}^{\text{old}}$ - the new
   note's $\rho$ chains from the spent nullifier.
3. Nullifier formula yields public $\mathsf{nf}$.
4. $\mathsf{rk} = \mathsf{ak} + [\alpha]\,G^{\mathsf{ak}}$
   (public).
5. $\mathsf{cm}^{\text{new}} =
   \mathsf{NoteCommit}^{\mathsf{rcm}^{\text{new}}}(\ldots)$
   matches public $\mathsf{cmx}$.
6. $\mathsf{cv}^{\text{net}} =
   [v_{\text{old}} - v_{\text{new}}]\,V + [\mathsf{rcv}]\,R$
   (public).
7. If outputs enabled: $\mathsf{epk} =
   [\mathsf{esk}]\,g_d^{\text{new}}$.
8. $v_{\text{old}}, v_{\text{new}} \in [0, 2^{64})$.
9. $\mathsf{ivk} = \mathsf{Extract}(
   \mathsf{SinsemillaCommit}^{\mathsf{rivk}}(
   \mathsf{ak}, \mathsf{nk}))$ and
   $\mathsf{pk}_d^{\text{old}} =
   [\mathsf{ivk}]\,g_d^{\text{old}}$.

Public inputs per Action: $\mathsf{anchor}$,
$\mathsf{cv}^{\text{net}}$, $\mathsf{nf}$, $\mathsf{rk}$,
$\mathsf{cmx}$, $\mathsf{epk}$, plus the two flag bits.

### 3.17 Halo 2 column layout

The Orchard circuit uses ~10 advice columns over a $2^{11}$-row
domain. Each row is a small piece of computation; together the
rows realise the full statement.

Custom gate groups (approximate):

- `q_ecc_add`, `q_ecc_double`: Pallas point arithmetic.
- `q_sinsemilla`: Sinsemilla chain steps.
- `q_poseidon`: Poseidon hash steps.
- `q_lookup_range`: range checks via lookup.
- `q_lookup_sinsemilla_S`: Sinsemilla 10-bit chunk to point.
- `q_decomposition`: bit-decomposition gates.
- `q_constraints`: high-level equality gates.

Each gate is a polynomial identity over advice columns, gated by
a selector.

### 3.18 Sinsemilla in-circuit

For the Note Commitment, the prover uses Sinsemilla:

1. Bit-decompose the input ($v$, $g_d$, $\mathsf{pk}_d$, $\rho$,
   $\psi$) into 10-bit chunks.
2. Each chunk is looked up in the Sinsemilla generator table:
   $(\text{chunk}, S(\text{chunk}))$.
3. Iteratively combine via the incomplete-addition gate.
4. After all chunks are processed, add the $\mathsf{rcm}$
   blinding.

The Sinsemilla path costs ~300 rows for typical inputs.

**Pitfall**: incomplete addition fails when its operands
coincide (chapter 13). The circuit must prove the operands are
distinct, typically by witnessing intermediate accumulator
values and asserting non-equality in a gate.

### 3.19 Merkle path with Sinsemilla

Each of the 32 Merkle layers uses one Sinsemilla hash of (layer
index, left, right). The layer index is part of the
personalisation $D_{\text{MH}, \ell}$ encoded as a Sinsemilla
domain.

Cost per layer: ~150 rows. Times 32: ~4,800 rows.

### 3.20 The $\rho^{\text{new}} = \mathsf{nf}^{\text{old}}$ trick

The novel Orchard idea: after computing $\mathsf{nf}^{\text{old}}$,
the circuit feeds it as $\rho^{\text{new}}$ into the new note
commitment. This eliminates the need for an extra Pedersen-hash-
based position-mix as in Sapling. The new note's $\rho$ is fully
determined by the Action's inputs; the prover cannot choose it
freely.

Implementation: an explicit copy constraint from "the row that
outputs $\mathsf{nf}^{\text{old}}$" to "the row that takes
$\rho^{\text{new}}$ as input".

### 3.21 Nullifier derivation

The Orchard nullifier:

$$
\mathsf{nf} \;=\;
\mathsf{Extract}\bigl(
[\mathsf{Hash}(\mathsf{nk}, \rho^{\text{old}}) +
\psi^{\text{old}}]\,K_{\text{nf}} \;+\;
\mathsf{cm}^{\text{old}}\bigr),
$$

with $\mathsf{Hash}$ a Poseidon-based PRF keyed by
$\mathsf{nk}$.

Sub-circuit: ~200 rows for Poseidon, ~100 for the scalar mul,
~50 for the addition and extract.

### 3.22 Value commitment (net)

Net value: $v^{\text{net}} = v_{\text{old}} - v_{\text{new}}$,
range-checked to lie in $[-(2^{64} - 1), 2^{64} - 1]$. Then

$$
\mathsf{cv}^{\text{net}} = [v^{\text{net}}]\,V_{\text{Orch}} +
[\mathsf{rcv}]\,R_{\text{Orch}}.
$$

In-circuit cost: ~150 rows.

### 3.23 CommitIvk in-circuit

The Orchard incoming viewing key is derived inside the circuit:

$$
\mathsf{ivk} \;=\;
\mathsf{Extract}(\mathsf{SinsemillaCommit}^{\mathsf{rivk}}(
\mathsf{ak}, \mathsf{nk})).
$$

The Sinsemilla commit is one Sinsemilla hash (over the encoded
$\mathsf{ak}, \mathsf{nk}$) plus a randomness term
$[\mathsf{rivk}]\,R_{\mathsf{ivk}}$. Cost: ~300 rows.

### 3.24 Flag-conditional logic

Bundle flags determine whether spends and outputs are enabled
per Action. If spends are disabled, the Merkle path check and
nullifier publication are no-op'd (specific dummy values
substituted). If outputs are disabled, the new note commitment
and $\mathsf{epk}$ are dummy.

In-circuit: each clause is multiplied by a flag bit, and a
dummy-substitution gadget produces the public-input value when
the flag is off. This is more complex than Sapling's "dummy
when $v = 0$" because Orchard allows mixed-mode Actions (only
spend, only output, or both).

### 3.25 Orchard Action total

Approximate row counts per Action (out of $2^{11} = 2048$ rows
in the domain):

| Clause | Rows |
| --- | --- |
| Witnessing + decomposition | ~200 |
| Sinsemilla note commitment | ~300 |
| Merkle path (32 layers) | ~4,800 |
| Nullifier | ~300 |
| $\mathsf{rk}$ check | ~100 |
| $\mathsf{epk}$ check | ~100 |
| Net value commitment | ~150 |
| CommitIvk | ~300 |
| $\mathsf{pk}_d$ check | ~200 |
| Flag conditional logic | ~50 |

Total: ~6,500 rows per Action. With $n$ Actions, the circuit is
sized to fit (typically $k = 11$ for 2-action bundles, $k = 12$
for larger).

### 3.26 Comparison

| | Sapling Spend | Sapling Output | Orchard Action |
| --- | --- | --- | --- |
| Constraint model | R1CS | R1CS | PLONKish |
| Approx size | 150k constraints | 20k constraints | 6.5k rows per action |
| Includes spend? | yes | no | yes (or dummy) |
| Includes output? | no | yes | yes (or dummy) |
| Includes Merkle path? | yes | no | yes |
| Prover time (single) | ~2 s | ~0.2 s | ~1 s for bundle |

### 3.27 Why each clause is necessary

The "attack on omission" notes throughout this chapter all reduce
to one of:

- **Money forgery**: prove a non-existent commitment as spent;
  prove a value larger than the input.
- **Double-spend**: produce different nullifiers for the same
  note.
- **Identity theft**: spend a note whose recipient was not the
  prover.
- **Metadata leak**: distinguish dummy from real spends.

Every clause in the circuits maps to one of these. If you
cannot articulate which attack a clause prevents, the clause is
suspect.

### 3.28 Reading the actual circuit code

#### Sapling (in [`sapling-crypto`](https://github.com/zcash/sapling-crypto))

- `sapling-crypto::circuit`: top-level circuit definition.
- `sapling-crypto::circuit::spend`: the Spend circuit synthesis.
- `sapling-crypto::circuit::output`: the Output circuit.
- `sapling-crypto::circuit::pedersen_hash`: the Pedersen hash
  gadget.
- `sapling-crypto::circuit::merkle`: the Merkle path gadget.

This workspace's Sapling integration includes the Sprout circuit
in
[`zcash_proofs/src/circuit/sprout`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout):

```rust reference title="zcash_proofs/src/circuit/sprout/mod.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout/mod.rs#L25-L54
```

#### Orchard (in [`orchard`](https://github.com/zcash/orchard))

- `orchard::circuit`: top-level `Circuit::synthesize`.
- `orchard::circuit::note_commit`: note commitment gadget.
- `orchard::circuit::commit_ivk`: $\mathsf{CommitIvk}$.
- `orchard::circuit::value_commit_orchard`: value commitment.
- `orchard::circuit::derive_nullifier`: nullifier.
- `orchard::circuit::gadget::sinsemilla`: Sinsemilla gadgets.
- `orchard::circuit::gadget::ecc`: Pallas EC gadgets.

The proof artifacts are loaded by
[`zcash_proofs/src/prover.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/prover.rs).

### 3.29 The verifier's view

The Sapling Spend verifier checks one Groth16 pairing equation
(chapter 04, section 3.7). Public inputs:

- $\mathsf{rk}$ (2 field elements).
- $\mathsf{cv}$ (2 field elements).
- $\mathsf{nf}$ (1 packed field element).
- $\mathsf{anchor}$ (1 field element).

The encoding is fixed and must match the circuit's expected
order. If you change the public-input order, you must rerun the
trusted setup.

For Orchard, the verifier runs Halo 2's verifier, ~10 ms vs
~7 ms for Groth16, with no trusted setup.

## 4. Failure modes

See "Attack on omission" notes in each clause above and the
consolidated list in section 3.27. Additional circuit-author
mistakes from audit findings and informal lore:

- **Underconstrained advice cells**: an advice cell with no gate
  forcing its value can be set arbitrarily by the prover. Verify
  every advice cell is used in at least one constraint with a
  selector on.
  > Caught upstream by `orchard::circuit` synthesis tests (the
  > `MockProver` from `halo2_proofs` exercises every cell). No
  > automated test in this workspace; the Orchard circuit lives
  > in the external `orchard` crate.
- **Off-by-one selector**: a selector that is on at row $i$ but
  whose gate references row $i - 1$ can subtly misalign.
  > No automated test in this workspace. Caught by audit only.
- **Incomplete-addition coincidence**: as noted, both inputs
  must be provably distinct.
  > Caught upstream by `orchard::circuit::gadget::ecc` unit tests
  > in the external `orchard` crate. No automated test in this
  > workspace.
- **Lookup-table collision**: two distinct chunks mapping to the
  same point break the lookup soundness.
  > Caught upstream by `orchard::circuit::gadget::sinsemilla`
  > generator-table tests. No automated test in this workspace.
- **Public-input ordering**: prover and verifier must agree on
  which public input maps to which constraint. A swap is
  invisible in tests until a real attack exploits it.
  > Caught indirectly by:
  > `zcash_proofs::prover` integration tests via parameter-hash
  > verification (`verify_hash` against `SAPLING_SPEND_HASH` and
  > `SAPLING_OUTPUT_HASH` in
  > `zcash_proofs/src/lib.rs`). Any public-input reordering
  > requires a circuit change, which would invalidate the pinned
  > hashes.

## 5. Spec pointers

- [Zcash Protocol Specification, section 4.8 (Spend statement)](https://zips.z.cash/protocol/protocol.pdf):
  the normative Spend statement that section 3.1 paraphrases.
- [Zcash Protocol Specification, section 4.9 (Output statement)](https://zips.z.cash/protocol/protocol.pdf):
  the normative Output statement.
- [Zcash Protocol Specification, section 4.13 (Action statement)](https://zips.z.cash/protocol/protocol.pdf):
  the normative Orchard Action statement.
- [ZIP 224](https://zips.z.cash/zip-0224): the Orchard Action
  semantics and key derivation.
- [Halo paper](https://eprint.iacr.org/2019/1021): the proof
  system underpinning the Orchard verifier.
- [Sinsemilla note](https://zips.z.cash/protocol/protocol.pdf):
  the chunk-and-add hash used in Orchard, defined in the
  protocol specification appendix.

## 6. Exercises

1. **Match a clause to a function.** For each clause in section
   3.3 through 3.13 (Sapling Spend), open the corresponding file
   in `sapling-crypto/src/circuit/` and find the function that
   implements it. Record the file and the function name.
2. **Count constraints for a smaller circuit.** Run the
   `bellman` constraint counter on the Sapling Spend circuit
   (see `sapling-crypto`'s test harness) and compare the actual
   constraint count to the table in section 3.14. State any
   discrepancy.
3. **Add an Orchard test vector.** In a checkout, add a test
   vector under `orchard/src/test_vectors/` (external repo) that
   exercises an Action with the spend flag off. Verify the
   `Circuit::synthesize` path runs without panicking.
4. **Trace public inputs.** For a Sapling Spend proof, list the
   public inputs in the order the verifier expects them. Cite
   the file and function in `sapling-crypto` that defines the
   ordering. Argue why swapping any two would constitute a
   consensus break.

### Answers in the code

- Sprout circuit top-level types:
  [`zcash_proofs/src/circuit/sprout/mod.rs#L25-L54`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout/mod.rs#L25-L54).
- Sapling verifying-key hashes:
  [`zcash_proofs/src/lib.rs#L40-L60`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs#L40-L60).
- Prover interface (Sapling Spend and Output, Orchard):
  [`zcash_proofs/src/prover.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/prover.rs).
- The external circuit code lives at
  [`sapling-crypto`](https://github.com/zcash/sapling-crypto) and
  [`orchard`](https://github.com/zcash/orchard).

## 7. Further reading

- [chapter 17](./17-halo2-deep-dive.md): the Halo 2 proof
  system mechanics that underpin sections 3.16 through 3.25.
- [chapter 16](./16-pedersen-hash-deep-dive.md): the Pedersen
  hash gadget central to the Sapling circuit.
- [chapter 23](./23-key-catalog.md): the keying material that
  each clause consumes as witness or produces as public output.
- Trail of Bits, Orchard / Halo 2 audit reports: source of
  several "attack on omission" framings.
