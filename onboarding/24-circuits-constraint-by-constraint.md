# 24 - Circuits, constraint by constraint

## Goal

The Sapling Spend circuit, the Sapling Output circuit, and the
Orchard Action circuit are the cryptographic heart of Zcash's
shielded protocols. Earlier chapters described them at the
"statement" level. This chapter walks each constraint clause, in
the order the prover witnesses and the verifier checks, with an
explicit "what attack does this clause prevent" for each.

The constraint counts are approximate; the exact numbers depend on
gadget implementation and have shifted over time as optimisations
landed.

## 0. The two constraint models

### R1CS (Sapling / Sprout / Groth16)

A Rank-1 Constraint System: each constraint is

$$
\Bigl(\sum_i a_i \cdot w_i\Bigr) \cdot \Bigl(\sum_i b_i \cdot w_i\Bigr) \;=\; \Bigl(\sum_i c_i \cdot w_i\Bigr),
$$

with $w_i$ the wires (witness + 1) and $a_i, b_i, c_i$ public
coefficients. The Sapling Spend circuit has $\sim 100{,}000$ such
constraints. `bellman` is the toolkit.

### PLONKish (Orchard / Halo 2)

A table of cells with custom gates: each row $i$ has constraints
of the form

$$
G(w_1(\omega^i), w_2(\omega^i), \ldots) \cdot q_{\text{sel}}(\omega^i) \;=\; 0,
$$

where $q_{\text{sel}}$ is the selector polynomial. Plus permutation
arguments for copy constraints and lookups for table membership.
The Orchard Action circuit uses $\sim 2^{11}$ rows.

The two models can express the same statements; only the
arithmetisation differs.

## 1. Sapling Spend circuit

The full statement (consolidated from chapter 04):

> *The prover knows secret $(v, g_d, \mathsf{pk}_d, \mathsf{rcm},
> \alpha, \mathsf{ak}, \mathsf{nsk}, \text{auth-path}, \text{pos})$
> such that:*

> *1. $\mathsf{cm} = \mathsf{NoteCommit}^{\mathsf{rcm}}(g_d,
>    \mathsf{pk}_d, v)$.*
> *2. The Merkle path from $\mathsf{cm}$ at position $\text{pos}$
>    leads to the public anchor.*
> *3. $\mathsf{pk}_d = [\mathsf{ivk}]\,g_d$ for
>    $\mathsf{ivk} = \mathsf{CRH}^{\mathsf{ivk}}(\mathsf{ak}, \mathsf{nk})$
>    with $\mathsf{nk} = [\mathsf{nsk}]\,G^{\mathsf{nk}}$.*
> *4. $\mathsf{rk} = \mathsf{ak} + [\alpha]\,G^{\mathsf{ak}}$
>    (public).*
> *5. $\mathsf{nf} = \mathsf{PRF}^{\mathsf{nfSapling}}_{\mathsf{nk}}(
>    \mathsf{MixingPedersenHash}(\mathsf{cm}, \text{pos}))$
>    (public).*
> *6. $\mathsf{cv} = [v]\,V + [\mathsf{rcv}]\,R$ (public $\mathsf{cv}$).*
> *7. $v \in [0, 2^{64})$.*
> *8. Either $v = 0$ (dummy spend, Merkle check skipped) or the
>    Merkle path is checked.*

Public inputs: $\mathsf{rk}$, $\mathsf{cv}$, $\mathsf{nf}$,
$\mathsf{anchor}$, plus implementation-required encoding bits.

### 1.1 - Witness allocation

Approximate sub-circuit costs (R1CS constraints):

| Witness | Bits | Constraints |
| --- | --- | --- |
| $v$ | 64 | 64 boolean + 1 packing |
| $g_d$ | 256 (encoded as bits) | $\sim 750$ (subgroup membership inside circuit) |
| $\mathsf{pk}_d$ | 256 | $\sim 750$ |
| $\mathsf{rcm}$ | 252 | 252 boolean |
| $\alpha$ | 252 | 252 boolean |
| $\mathsf{ak}$ | 256 | $\sim 750$ |
| $\mathsf{nsk}$ | 252 | 252 boolean |
| auth-path | $32 \times 256$ | $\sim 8000$ bit constraints |

So the witness alone is $\sim 12{,}000$ constraints before any
checks run.

### 1.2 - Clause: $\mathsf{nk} = [\mathsf{nsk}]\,G^{\mathsf{nk}}$

Scalar mul of a *fixed* generator by a 252-bit secret. Using the
fixed-base windowed comb gadget in `sapling-crypto`:

- 252 bits of $\mathsf{nsk}$ are decomposed.
- For each 3-bit window, a constant-time table select picks one of
  8 precomputed multiples.
- The selected multiples are summed.

Constraint cost: ~750.

**Attack on omission**: if $\mathsf{nk}$ is allowed to be any
witnessed point unrelated to $\mathsf{nsk}$, the spender could
inject a $\mathsf{nk}$ they chose post-hoc, allowing them to predict
nullifiers for notes they have not yet spent (or to forge nullifier
collisions). The clause anchors $\mathsf{nk}$ in $\mathsf{nsk}$.

### 1.3 - Clause: $\mathsf{ivk} = \mathsf{CRH}^{\mathsf{ivk}}(\mathsf{ak}, \mathsf{nk})$

$\mathsf{CRH}^{\mathsf{ivk}}$ is BLAKE2s-256 of the concatenated
encodings of $\mathsf{ak}$ and $\mathsf{nk}$ (as their $u$-coordinates),
plus parity bits. Implementing BLAKE2s in R1CS is expensive (one of
the largest sub-circuits in Sapling, ~16{,}000 constraints).

The output is reduced modulo $\ell_J$ to produce $\mathsf{ivk}$. The
reduction is a controlled bit-truncation rather than a full modular
reduction; this is OK because $\ell_J < 2^{252}$ and the top bits of
$\mathsf{ivk}$ are zeroed.

Constraint cost: ~16{,}000.

**Attack on omission**: an unmoored $\mathsf{ivk}$ would let the
prover claim ownership of arbitrary $\mathsf{pk}_d$ they did not
control.

### 1.4 - Clause: $\mathsf{pk}_d = [\mathsf{ivk}]\,g_d$

Variable-base scalar mul: $g_d$ is itself witnessed, so cannot use a
fixed-base table. Implementation: 252-bit Edwards scalar mul gadget
using strongly-unified addition.

Constraint cost: ~3000.

**Attack on omission**: a prover could spend a note addressed to an
arbitrary $(d, \mathsf{pk}_d)$ they do not own.

### 1.5 - Clause: $\mathsf{rk} = \mathsf{ak} + [\alpha]\,G^{\mathsf{ak}}$

Fixed-base scalar mul $[\alpha]G^{\mathsf{ak}}$ (~750 constraints),
plus one Edwards addition (~6 constraints), then equality with
the *public* $\mathsf{rk}$.

Constraint cost: ~760.

**Attack on omission**: the publicised $\mathsf{rk}$ would not be a
re-randomisation of the actual $\mathsf{ak}$. An attacker could
sign with their own key under their own $\mathsf{rk}$ while
spending a victim's note (since the binding to $\mathsf{ak}$ would
be lost).

### 1.6 - Clause: NoteCommitment

$\mathsf{cm} = \mathsf{PedersenHash}_{D_{\text{nc}}}(\text{repr}(v) \,\|\, \text{repr}(g_d) \,\|\, \text{repr}(\mathsf{pk}_d)) + [\mathsf{rcm}] R_{\text{nc}}$.

The Pedersen hash gadget (chapter 16) is the most heavily used
sub-circuit. For an input of $64 + 256 + 256 = 576$ bits:

- $\sim 6$ constraints per bit, so $\sim 3500$ for the hash.
- Plus the randomness term: 252-bit fixed-base scalar mul on
  $R_{\text{nc}}$: $\sim 750$.

Constraint cost: ~4250.

The result is *the* commitment; the prover does not get to choose
it freely.

### 1.7 - Clause: Merkle path

For each layer $\ell \in \{0, 1, \ldots, 31\}$:

1. Witness the auth-path sibling at this layer and a boolean
   indicating "is the current node the left or right child".
2. Compute $\mathsf{MerkleHash}_\ell(\text{left}, \text{right})$
   where left/right are conditionally swapped based on the bit.
3. Use the result as the current node at layer $\ell+1$.

The conditional swap costs $\sim 2$ constraints; the Pedersen hash
for a 512-bit input is $\sim 3000$ constraints; the layer
personalisation adds a small constant.

Per layer: ~3000 constraints. Times 32 layers: ~96{,}000
constraints. **This is the dominant cost of the Spend circuit.**

**Attack on omission**: a prover could spend an arbitrary
$\mathsf{cm}$ they invented, without it being in the tree. Money
out of thin air.

### 1.8 - Clause: dummy spend handling

If $v = 0$, the Merkle path check is skipped: a dummy spend does
not correspond to a real note in the tree. The circuit implements
this by computing the Merkle output *and* a "dummy override"
output, then conditionally selecting between them based on
$v = 0$.

The override does *not* set the anchor to a free choice; rather,
the dummy clause makes the Merkle-path computation a no-op while
all other clauses still hold. The effect: when $v = 0$, the
$\mathsf{cm}$ may be any well-formed commitment, but no anchor
membership is claimed.

This is implemented as an "if-then-else" in `bellman` gadgets
(boolean multiplexing).

**Attack on omission**: without the dummy mechanism, every spend
revealed the bundle's true input count, leaking metadata.

### 1.9 - Clause: $\rho = \mathsf{MixingPedersenHash}(\mathsf{cm}, \text{pos})$

$\rho$ is computed in-circuit:

$$
\rho \;=\; \mathsf{cm} \;+\; [\text{pos}]\,G_\rho.
$$

For $\text{pos}$ bounded by $2^{32}$, the scalar mul is cheap (~100
constraints). Plus one Edwards add (~6 constraints).

Total: ~110 constraints.

### 1.10 - Clause: $\mathsf{nf} = \mathsf{PRF}^{\mathsf{nfSapling}}_{\mathsf{nk}}(\rho)$

The PRF is BLAKE2s with key $\mathsf{nk}$ and input $\rho$. Same
BLAKE2s gadget as $\mathsf{CRH}^{\mathsf{ivk}}$.

Constraint cost: ~16{,}000.

The public output is $\mathsf{nf}$.

**Attack on omission**: the nullifier could be arbitrary, allowing
double-spends.

### 1.11 - Clause: ValueCommitment

$\mathsf{cv} = [v]\,V + [\mathsf{rcv}]\,R$.

Fixed-base scalar mul on $V$ with the 64-bit $v$ (~250 constraints)
plus fixed-base on $R$ with 252-bit $\mathsf{rcv}$ (~750).

Constraint cost: ~1000.

The result is checked against the *public* $\mathsf{cv}$.

**Attack on omission**: the published $\mathsf{cv}$ could fail to
commit to $v$, breaking the binding-signature equation and allowing
value forgery.

### 1.12 - Clause: 64-bit range check on $v$

The boolean decomposition of $v$ is into exactly 64 bits, enforced
by 64 boolean constraints during witnessing.

**Attack on omission**: a value $> 2^{64}$ would overflow the
binding-signature value-balance accumulator, allowing implicit
value forgery.

### 1.13 - Total

The Sapling Spend circuit has approximately **~150{,}000
constraints** in current implementations:

| Clause | Constraints |
| --- | --- |
| Witness encoding | ~12{,}000 |
| Subgroup-check gadgets | ~6{,}000 |
| $\mathsf{nk}$ derivation | ~750 |
| $\mathsf{CRH}^{\mathsf{ivk}}$ (BLAKE2s) | ~16{,}000 |
| $\mathsf{pk}_d$ check | ~3{,}000 |
| $\mathsf{rk}$ check | ~760 |
| NoteCommitment | ~4{,}250 |
| Merkle path (32 layers) | ~96{,}000 |
| $\rho$ mixing | ~110 |
| Nullifier PRF | ~16{,}000 |
| ValueCommitment | ~1{,}000 |
| Range check | ~64 |
| Misc / linking | ~few thousand |

Numbers from the public sapling-crypto code, subject to change
with optimisations.

## 2. Sapling Output circuit

Statement (from chapter 04):

> *The prover knows $(v, g_d, \mathsf{pk}_d, \mathsf{rcm}, \mathsf{rcv},
> \mathsf{esk})$ such that:*

> *1. $\mathsf{cm} = \mathsf{NoteCommit}^{\mathsf{rcm}}(g_d,
>    \mathsf{pk}_d, v)$, with $\mathsf{cm}^u$ as the public
>    output.*
> *2. $\mathsf{cv} = [v]\,V + [\mathsf{rcv}]\,R$ (public).*
> *3. $\mathsf{epk} = [\mathsf{esk}]\,g_d$ (public).*
> *4. $v \in [0, 2^{64})$.*
> *5. $g_d$ is a valid prime-order subgroup element (non-zero).*

Sub-circuit costs:

| Clause | Constraints |
| --- | --- |
| Witness encoding | ~6{,}000 |
| Subgroup check on $g_d$ | ~750 |
| NoteCommitment | ~4{,}250 |
| Extract $u$-coordinate | ~5 |
| ValueCommitment | ~1{,}000 |
| $\mathsf{epk}$ scalar mul | ~3{,}000 |
| Range check $v$ | 64 |
| Misc | ~few thousand |

**Total**: ~20{,}000 constraints. The Output circuit is much
cheaper than the Spend circuit (no Merkle path, no nullifier).

### 2.1 - Clause: subgroup check on $g_d$

The circuit asserts that the witnessed $g_d$ is in the prime-order
subgroup. For Jubjub, this requires checking that $[\ell_J] g_d = \mathcal{O}$,
which is expensive but unavoidable.

In practice, the implementation uses an *implicit* subgroup check:
the value $g_d = \mathsf{DiversifyHash}(d)$ is computed by the
sender via cofactor-multiplication outside the circuit, but inside
the circuit the prover only proves "$g_d \neq \mathcal{O}$" (one
non-zero check) and the rest of the structure relies on the
subgroup-membership being witnessed honestly.

Wait: this is delicate. If $g_d$ is not in the subgroup, the
recipient cannot decrypt (they would use $[\mathsf{ivk}] \mathsf{epk}$
which would land outside the subgroup), so a malicious sender
cannot benefit. But a witness-substitution attack might be possible
in principle. The implementation defence: the canonical encoding
of $g_d$ in the encrypted note plaintext, combined with the
recipient's re-derivation $g_d = \mathsf{DiversifyHash}(d)$ at
decryption time, catches non-subgroup $g_d$ from the recipient
side. The circuit's explicit check is light.

This is the kind of subtlety chapter 13 warns about; reading the
exact Sapling circuit code is essential.

### 2.2 - Clause: $\mathsf{epk} = [\mathsf{esk}]\,g_d$

Variable-base scalar mul. ~3000 constraints.

**Attack on omission**: the published $\mathsf{epk}$ could be
unrelated to $\mathsf{esk}$, breaking note-encryption recovery for
the sender (via $\mathsf{ovk}$).

### 2.3 - Why no anchor / no nullifier

An Output creates value; it does not need to prove the new note
is in the tree (it adds itself to the tree) and does not have a
nullifier (it has not been spent). Hence the missing clauses.

## 3. Orchard Action circuit

The Action circuit is more complex because it unifies Spend and
Output. The statement (from chapter 05):

> *For each Action, the prover knows:*

> *Old note: $(v_{\text{old}}, g_d^{\text{old}}, \mathsf{pk}_d^{\text{old}}, \rho^{\text{old}}, \psi^{\text{old}}, \mathsf{rcm}^{\text{old}}, \text{auth-path}, \mathsf{ak}, \mathsf{nk}, \mathsf{rivk}, \alpha)$.*

> *New note: $(v_{\text{new}}, g_d^{\text{new}}, \mathsf{pk}_d^{\text{new}}, \psi^{\text{new}}, \mathsf{rcm}^{\text{new}})$.*

> *Such that:*

> *1. If spends enabled: the old note's commitment is in the tree
>    at the public anchor.*
> *2. $\rho^{\text{new}} = \mathsf{nf}^{\text{old}}$ - the new
>    note's $\rho$ chains from the spent nullifier.*
> *3. Nullifier formula yields public $\mathsf{nf}$.*
> *4. $\mathsf{rk} = \mathsf{ak} + [\alpha]\,G^{\mathsf{ak}}$
>    (public).*
> *5. $\mathsf{cm}^{\text{new}} = \mathsf{NoteCommit}^{\mathsf{rcm}^{\text{new}}}(\ldots)$
>    matches public $\mathsf{cmx}$.*
> *6. $\mathsf{cv}^{\text{net}} = [v_{\text{old}} - v_{\text{new}}]\,V + [\mathsf{rcv}]\,R$
>    (public).*
> *7. If outputs enabled: $\mathsf{epk} = [\mathsf{esk}]\,g_d^{\text{new}}$.*
> *8. $v_{\text{old}}, v_{\text{new}} \in [0, 2^{64})$.*
> *9. $\mathsf{ivk} = \mathsf{Extract}(\mathsf{SinsemillaCommit}^{\mathsf{rivk}}(\mathsf{ak}, \mathsf{nk}))$
>    and $\mathsf{pk}_d^{\text{old}} = [\mathsf{ivk}]\,g_d^{\text{old}}$.*

Public inputs per Action: $\mathsf{anchor}$, $\mathsf{cv}^{\text{net}}$,
$\mathsf{nf}$, $\mathsf{rk}$, $\mathsf{cmx}$, $\mathsf{epk}$, plus the
two flag bits.

### 3.1 - Halo 2 column layout

The Orchard circuit uses ~10 advice columns over a $2^{11}$-row
domain. Each row is a small piece of computation; together the
rows realise the full statement.

Custom gates groups (approximate):

- `q_ecc_add`, `q_ecc_double`: Pallas point arithmetic.
- `q_sinsemilla`: Sinsemilla chain steps.
- `q_poseidon`: Poseidon hash steps.
- `q_lookup_range`: range checks via lookup.
- `q_lookup_sinsemilla_S`: Sinsemilla 10-bit chunk to point.
- `q_decomposition`: bit-decomposition gates.
- `q_constraints`: high-level "this equals that" gates.

Each is a polynomial identity over advice columns, gated by a
selector.

### 3.2 - Sinsemilla in-circuit

For the Note Commitment, the prover uses Sinsemilla:

1. Bit-decompose the input (value, $g_d$, $\mathsf{pk}_d$, $\rho$,
   $\psi$) into 10-bit chunks.
2. Each chunk is *looked up* in the Sinsemilla generator table:
   $(\text{chunk}, S(\text{chunk}))$.
3. Iteratively combine via the incomplete-addition gate.
4. After all chunks are processed, add the $\mathsf{rcm}$ blinding.

The Sinsemilla path costs ~$300$ rows for typical inputs.

**Pitfall**: incomplete addition fails when its operands coincide
(chapter 13). The circuit must prove the operands are distinct,
typically by witnessing intermediate accumulator values and
asserting non-equality in a gate.

### 3.3 - Merkle path with Sinsemilla

Each of the 32 Merkle layers uses one Sinsemilla hash of (layer
index, left, right). The layer index is part of the personalisation
$D_{\text{MH},\ell}$ which is encoded as a Sinsemilla domain.

Cost per layer: ~150 rows. Times 32: ~4{,}800 rows.

### 3.4 - The $\rho^{\text{new}} = \mathsf{nf}^{\text{old}}$ trick

The novel Orchard idea: after computing $\mathsf{nf}^{\text{old}}$,
the circuit feeds it as $\rho^{\text{new}}$ into the new note
commitment. This eliminates the need for an extra Pedersen-hash
based position-mix as in Sapling.

It also means that the new note's $\rho$ is fully determined by the
Action's inputs; the prover cannot freely choose it.

Implementation: an explicit copy constraint from "the row that
outputs $\mathsf{nf}^{\text{old}}$" to "the row that takes
$\rho^{\text{new}}$ as input".

### 3.5 - Nullifier derivation

The Orchard nullifier:

$$
\mathsf{nf} \;=\;
\mathsf{Extract}\!\Bigl(\,
\bigl[\mathsf{Hash}(\mathsf{nk}, \rho^{\text{old}}) + \psi^{\text{old}}\bigr]\,K_{\text{nf}} \;+\; \mathsf{cm}^{\text{old}}\,
\Bigr),
$$

with $\mathsf{Hash}$ a Poseidon-based PRF keyed by $\mathsf{nk}$.

Sub-circuit: ~200 rows for the Poseidon part, ~100 for the scalar
mul, ~50 for the addition and extract.

### 3.6 - Value commitment (net)

Net value: $v^{\text{net}} = v_{\text{old}} - v_{\text{new}}$,
range-checked to lie in $[-(2^{64} - 1), 2^{64} - 1]$. Then

$$
\mathsf{cv}^{\text{net}} = [v^{\text{net}}]\,V_{\text{Orch}} + [\mathsf{rcv}]\,R_{\text{Orch}}.
$$

In-circuit cost: ~150 rows.

### 3.7 - $\mathsf{CommitIvk}$ in-circuit

The Orchard incoming viewing key is derived inside the circuit:

$$
\mathsf{ivk} \;=\; \mathsf{Extract}(\mathsf{SinsemillaCommit}^{\mathsf{rivk}}(\mathsf{ak}, \mathsf{nk})).
$$

The Sinsemilla commit is one Sinsemilla hash (over the encoded
$\mathsf{ak}, \mathsf{nk}$) plus a randomness term $[\mathsf{rivk}]
R_{\mathsf{ivk}}$. Cost: ~300 rows.

### 3.8 - Flag-conditional logic

The bundle's flags determine whether spends and outputs are
enabled per Action. If spends are disabled, the Merkle path check
and nullifier publication are "no-op"d (specific dummy values
substituted). If outputs are disabled, the new note commitment and
$\mathsf{epk}$ are dummy.

In-circuit: each clause is multiplied by a flag bit, and a
"dummy substitution" gadget produces the public-input value when
the flag is off.

This is more complex than Sapling's "dummy when $v = 0$" because
Orchard allows mixed-mode Actions (e.g. an Action that only spends
or only outputs).

### 3.9 - Total

Approximate row counts per Action (out of $2^{11} = 2048$ rows in
the domain):

| Clause | Rows |
| --- | --- |
| Witnessing + decomposition | ~200 |
| Sinsemilla note commitment | ~300 |
| Merkle path (32 layers) | ~4{,}800 |
| Nullifier | ~300 |
| $\mathsf{rk}$ check | ~100 |
| $\mathsf{epk}$ check | ~100 |
| Net value commitment | ~150 |
| CommitIvk | ~300 |
| pk_d check | ~200 |
| Flag conditional logic | ~50 |

Total: ~6{,}500 rows per Action. With $n$ Actions, the circuit is
sized to fit (typically $k = 11$ for 2-action bundles, $k = 12$ for
larger).

## 4. Comparison

| | Sapling Spend | Sapling Output | Orchard Action |
| --- | --- | --- | --- |
| Constraint model | R1CS | R1CS | PLONKish |
| Approx size | 150k constraints | 20k constraints | 6.5k rows per action |
| Includes spend? | yes | no | yes (or dummy) |
| Includes output? | no | yes | yes (or dummy) |
| Includes Merkle path? | yes | no | yes |
| Prover time (single) | ~2 s | ~0.2 s | ~1 s for bundle |

## 5. Why each clause is necessary - consolidated

The "attack on omission" notes throughout this chapter all reduce
to one of:

- **Money forgery**: prove a non-existent commitment as spent;
  prove a value larger than the input.
- **Double-spend**: produce different nullifiers for the same note.
- **Identity theft**: spend a note whose recipient was not the
  prover.
- **Metadata leak**: distinguish dummy vs real spends.

Every clause in the circuits maps to one of these. If you cannot
articulate which attack it prevents, the clause is suspect.

## 6. Test vectors and circuit testing

Public test vectors for the circuits:

- `sapling-crypto/src/test_vectors/`: per-field plaintexts and
  expected commitments.
- `orchard/src/test_vectors/`: per-Action input/output.

When working on a circuit change, add a test vector that
specifically exercises the clause you modified. If the clause is a
hash, the test vector should include a known-collision-avoidance
input.

## 7. Common circuit-author mistakes

From audit findings and informal lore:

- **Underconstrained advice cells**: an advice cell with no gate
  forcing its value can be set to anything by the prover. Verify
  every advice cell is used in at least one constraint with a
  selector on.
- **Off-by-one selector**: a selector that is on at row $i$ but
  the gate references row $i - 1$ can subtly misalign.
- **Incomplete-addition coincidence**: as noted, both inputs must
  be provably distinct.
- **Lookup-table collision**: two distinct chunks mapping to the
  same point break the lookup soundness.
- **Public-input ordering**: the prover and verifier must agree on
  which public input maps to which constraint. A swap is invisible
  in tests until a real attack exploits it.

## 8. Reading the actual circuit code

### Sapling

- `sapling-crypto/src/circuit.rs`: top-level circuit Definition.
- `sapling-crypto/src/circuit/spend.rs` (or analogous): the Spend
  circuit synthesis.
- `sapling-crypto/src/circuit/output.rs`: Output circuit.
- `sapling-crypto/src/circuit/pedersen_hash.rs`: the Pedersen hash
  gadget.
- `sapling-crypto/src/circuit/sapling.rs` or `merkle.rs`: Merkle
  path gadget.

Match each clause in this chapter to a code section there.

### Orchard

- `orchard/src/circuit.rs`: top-level Circuit::synthesize.
- `orchard/src/circuit/note_commit.rs`: note commitment gadget.
- `orchard/src/circuit/commit_ivk.rs`: $\mathsf{CommitIvk}$.
- `orchard/src/circuit/value_commit_orchard.rs`: value commitment.
- `orchard/src/circuit/derive_nullifier.rs`: nullifier.
- `orchard/src/circuit/gadget/sinsemilla/`: Sinsemilla gadgets.
- `orchard/src/circuit/gadget/ecc/`: Pallas EC gadgets.

## 9. The verifier's view

The verifier of a Sapling Spend proof checks one Groth16 pairing
equation. The "public inputs" presented to the verifier:

- $\mathsf{rk}$ (encoded as 2 field elements).
- $\mathsf{cv}$ (encoded as 2 field elements).
- $\mathsf{nf}$ (encoded as 1 field element by packing).
- $\mathsf{anchor}$ (1 field element).

The encoding is fixed and must match the circuit's expected order.
If you change the public-input order, you must rerun the trusted
setup.

For Orchard, the verifier runs Halo 2's verifier, which is more
work (~10 ms vs ~7 ms) but uses no trusted setup.

## 10. What you should know after this chapter

- Each clause of the Sapling Spend, Sapling Output, and Orchard
  Action circuits, in order, with the attack it prevents.
- Approximate constraint/row counts.
- Why the Merkle path dominates the Sapling Spend cost.
- The Orchard nullifier-chain trick.
- Where to find the actual circuit code in the external crates.

You now have a complete picture: chapter 23 catalogues every
keying material symbol; chapter 24 walks every clause of every
circuit. Combined with chapters 03-08 and 12-22, you have the
cryptographic substance of Zcash.

Welcome, again.
