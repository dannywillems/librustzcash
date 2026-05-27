---
sidebar_position: 5
title: Orchard and Halo 2
description: "Pallas/Vesta, Action circuit, Halo 2 + IPA."
---

# 05 - Orchard and Halo 2

## Goal

Sapling solved the privacy story but inherits Groth16 and a trusted
setup. Orchard is its successor: a cleaner abstraction (unified
**Action** instead of separate Spend/Output), a new proof system
(**Halo 2**), and curves chosen for recursion (**Pallas/Vesta** cycle).

This chapter is the narrative introduction. For the full Orchard
key catalog (including the distinction that $\mathsf{nk}$ is a field
element, not a curve point, and the role of $\mathsf{rivk}$),
see [chapter 23](./23-key-catalog.md). For the Action circuit's
clauses written out one by one (Sinsemilla path, the
$\rho^{\text{new}} = \mathsf{nf}^{\text{old}}$ trick, flag-conditional
logic), see [chapter 24](./24-circuits-constraint-by-constraint.md).

This chapter develops the math behind Orchard and the relevant Halo 2
internals. The implementation lives in the `orchard` crate (separate
repo); we describe what is essential for understanding the integration
in `zcash_primitives`, `zcash_keys`, `pczt`, and `zcash_client_backend`.

## 1. Pallas and Vesta

Pallas and Vesta are two short Weierstrass curves over prime fields
$\mathbb{F}_p, \mathbb{F}_q$ with $p, q$ both 255-bit primes satisfying

$$
\#E_{\text{Pallas}}(\mathbb{F}_p) \;=\; q, \qquad
\#E_{\text{Vesta}}(\mathbb{F}_q) \;=\; p.
$$

That is, the *base field* of each curve equals the *scalar field* of the
other. Pictorially:

$$
\mathbb{F}_p \;\underset{\text{Pallas}}{\longrightarrow}\; \mathbb{F}_q
\;\underset{\text{Vesta}}{\longrightarrow}\; \mathbb{F}_p.
$$

This **2-cycle** ($p, q$ are sometimes called "amicable primes") allows
encoding a verifier of one curve inside the circuit over the other,
which is what powers recursive SNARKs (proofs of proofs).

The curves have prime order, complete addition formulas, no cofactor
quirks. Equations:

- Pallas: $y^2 = x^3 + 5$ over $\mathbb{F}_p$.
- Vesta:  $y^2 = x^3 + 5$ over $\mathbb{F}_q$.

The prime moduli are

$$
p = 0\text{x}40000000000000000000000000000000\,224698fc094cf91b\,992d30ed00000001,
$$

$$
q = 0\text{x}40000000000000000000000000000000\,224698fc0994a8dd\,8c46eb2100000001.
$$

Orchard arithmetises its circuit over Pallas (so the proof is over
Vesta's base field, but the circuit itself manipulates Pallas scalars
$\mathbb{F}_q$ which equal Vesta base field). This circular dependence
is the whole point of the cycle.

In code: the [`pasta_curves`](https://github.com/zcash/pasta_curves)
crate, with types
[`pallas::Base`](https://github.com/zcash/pasta_curves/blob/main/src/pallas.rs#L6),
[`pallas::Scalar`](https://github.com/zcash/pasta_curves/blob/main/src/pallas.rs#L9),
[`pallas::Point`](https://github.com/zcash/pasta_curves/blob/main/src/pallas.rs#L12),
[`pallas::Affine`](https://github.com/zcash/pasta_curves/blob/main/src/pallas.rs#L15);
the corresponding Vesta aliases live in
[`src/vesta.rs`](https://github.com/zcash/pasta_curves/blob/main/src/vesta.rs).
The underlying field and curve implementations are in
[`src/fields/`](https://github.com/zcash/pasta_curves/tree/main/src/fields)
and
[`src/curves.rs`](https://github.com/zcash/pasta_curves/blob/main/src/curves.rs).

## 2. Sinsemilla

Orchard's algebraic hash is **Sinsemilla**, a Pedersen-hash variant
tuned to be cheap inside Halo 2 with lookup tables.

### Construction

Fix a "fragment size" $K = 10$ bits and two functions:

- $S \colon \{0,1\}^K \to E_{\text{Pallas}}(\mathbb{F}_p)$, a
  domain-separated map from 10-bit strings to Pallas points.
- $Q \colon \mathcal{D} \to E_{\text{Pallas}}(\mathbb{F}_p)$, a
  domain-separated map from a domain string $D$ to a Pallas point.

Then for an input bit string $m = m_0 m_1 \ldots m_{Kn-1}$ split into
$n$ chunks of $K$ bits $m^{(0)}, \ldots, m^{(n-1)}$:

$$
\mathsf{Sinsemilla}_D(m) \;=\;
A_{n-1}, \quad \text{where}
$$

$$
A_0 \;=\; Q(D), \qquad
A_{i+1} \;=\; \mathsf{Incomplete}\bigl(
    \mathsf{Incomplete}(A_i, S(m^{(i)})), A_i
\bigr).
$$

Here $\mathsf{Incomplete}(P_1, P_2)$ is incomplete addition (works as
long as $P_1 \neq \pm P_2$, which is enforced by the protocol's choice
of points). The doubled-add pattern is a cheap way to use lookup tables
for $S$ inside Halo 2.

Sinsemilla is parameterised by a personalisation, e.g.
`"z.cash:Orchard-NoteCommit-r"`, `"z.cash:Orchard-MerkleCRH"`.

### Note commitment

The **Orchard note commitment**:

$$
\mathsf{NoteCommit}(\mathsf{rcm}, g_d, \mathsf{pk}_d, v, \rho, \psi)
=
\mathsf{Sinsemilla}_{D_{\text{nc}}}\!\bigl(
    \text{repr}(g_d) \,\|\, \text{repr}(\mathsf{pk}_d) \,\|\, \text{repr}(v) \,\|\, \text{repr}(\rho) \,\|\, \text{repr}(\psi)
\bigr) + [\mathsf{rcm}] R_{\text{nc}}.
$$

Notice: unlike Sapling, $\rho$ and $\psi$ are part of the commitment.
This bakes the nullifier randomness directly into the note rather than
deriving it from the position.

### Merkle hash

The Orchard Merkle tree hash:

$$
\mathsf{MerkleCRH}_\ell(x, y)
=
\mathsf{ExtractPallas}\!\Bigl(
  \mathsf{Sinsemilla}_{D_{\text{MH}}}\!\bigl(
      \text{layer}_\ell \,\|\, x \,\|\, y
  \bigr)
\Bigr),
$$

with $D_{\text{MH}} = \text{"z.cash:Orchard-MerkleCRH"}$, layer index
$\ell$ explicitly hashed in, and $\mathsf{ExtractPallas}$ taking the
$x$-coordinate.

## 3. Key tree

Orchard's key tree is structurally similar to Sapling but uses
Poseidon-based PRFs and the Pallas curve.

From a 32-byte spending key $\mathsf{sk}$:

$$
\mathsf{ask}   = \mathsf{ToScalar}\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(6)\bigr),
$$

$$
\mathsf{nk}    = \mathsf{PoseidonHash}(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(7)),
$$

$$
\mathsf{rivk}  = \mathsf{ToScalar}\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(8)\bigr).
$$

The **spend-validating key** is $\mathsf{ak} = \mathsf{SpendAuthSig.DerivePublic}(\mathsf{ask})
= [\mathsf{ask}] G^{\mathsf{ak}}_{\text{Orchard}}$.

The **diversifier key** $\mathsf{dk}$ and the actual diversified
addresses are computed as in Sapling but using Pallas group operations:

$$
\mathsf{ivk} = \mathsf{CommitIvk}^{\mathsf{rivk}}(\mathsf{ak}, \mathsf{nk}),
\qquad
g_d = \mathsf{DiversifyHash}(d),
\qquad
\mathsf{pk}_d = [\mathsf{ivk}] g_d.
$$

The full viewing key is $\mathsf{fvk} = (\mathsf{ak}, \mathsf{nk},
\mathsf{rivk}, \mathsf{ovk})$.

The nullifier:

$$
\mathsf{nf} \;=\; \mathsf{ExtractPallas}\!\Bigl(
    \bigl[\, \mathsf{Hash}(\mathsf{nk}, \rho) + \psi \,\bigr] G_{\text{nf}}
    \;+\; \mathsf{cm}
\Bigr),
$$

where $\mathsf{Hash}$ is a specific Poseidon-based PRF, $\rho, \psi$ are
note fields, and $G_{\text{nf}}$ is a fixed generator. The $\mathsf{cm}$
addition ties the nullifier to the precise commitment.

## 4. The Action description

An **Orchard Action** combines one spend and one output into a single
description:

$$
\mathsf{AD} \;=\; \bigl(\mathsf{cv}, \mathsf{nf}, \mathsf{rk}, \mathsf{cm}_x,
    \mathsf{epk}, C^{\text{enc}}, C^{\text{out}}\bigr),
$$

shared by all Actions in a bundle:

$$
\mathsf{Bundle} = \bigl(\{\mathsf{AD}_i\}_{i=1}^n, \mathsf{anchor},
    v_{\text{bal}}, \mathsf{flags}, \pi, \sigma_{\text{bind}},
    \{\sigma_{\text{spendAuth},i}\}\bigr).
$$

The flags tell whether spends and outputs are enabled in the bundle
(otherwise the relevant pieces are dummies). The proof $\pi$ is a
**single** Halo 2 proof for the whole bundle, not one per Action: the
Action circuit is instantiated $n$ times inside one Halo 2 statement.

### The Action statement (sketch)

The prover knows, for each Action:

- Old note: $(v_{\text{old}}, g_d^{\text{old}}, \mathsf{pk}_d^{\text{old}},
  \rho^{\text{old}}, \psi^{\text{old}}, \mathsf{rcm}^{\text{old}},
  \text{auth-path}, \mathsf{ak}, \mathsf{nk}, \mathsf{rivk}, \alpha)$.
- New note: $(v_{\text{new}}, g_d^{\text{new}}, \mathsf{pk}_d^{\text{new}},
  \psi^{\text{new}}, \mathsf{rcm}^{\text{new}})$.

The circuit enforces:

1. The old note commitment is in the tree at the public anchor (or
   the spend flag is off so the Merkle check is skipped).
2. The nullifier formula evaluates to the public $\mathsf{nf}$.
3. The spend-auth public key relation:
   $\mathsf{rk} = \mathsf{ak} + [\alpha] G^{\mathsf{ak}}$.
4. The new note commitment $\mathsf{cm}^{\text{new}}$ matches the
   public $\mathsf{cm}_x$ (its $x$-coordinate).
5. Value commitment:
   $\mathsf{cv} = [v_{\text{old}}] V + [\mathsf{rcv}] R$, but in
   Orchard the convention is **net**: $\mathsf{cv}$ commits to
   $v_{\text{old}} - v_{\text{new}}$, so the bundle's binding key
   only needs the action commitments and $v_{\text{bal}}$.
6. $v_{\text{old}}, v_{\text{new}} \in [0, 2^{64})$ when enabled.
7. $\rho^{\text{new}} = \mathsf{nf}^{\text{old}}$: the *next note's*
   uniqueness comes from *this note's* nullifier. (This is a clever
   trick: it removes the need to derive $\rho$ from position, which
   would require committing to position; instead the chain of
   nullifiers acts as $\rho$.)
8. ECDH and encryption consistency:
   $\mathsf{epk} = [\mathsf{esk}] g_d^{\text{new}}$ matches the
   encrypted ciphertext.

This is a single, large circuit (the **Action circuit**) instantiated $n$
times. Halo 2's lookup-and-permutation tooling makes a 10-Action bundle
prove and verify in roughly the same wallclock time as it would in
Sapling for an equivalent payload, but with no trusted setup.

### Binding signature

Identical mechanism to Sapling, just over Pallas:

$$
\mathsf{bvk} = \sum_i \mathsf{cv}_i - [v_{\text{bal}}] V,
$$

and the binding signature is RedPallas over the sighash with this
implicit key. The signed bvk is computed in
`orchard::bundle::Bundle::binding_validating_key`.

## 5. Halo 2 in brief

Sapling's Groth16 has constant-size proof but needs a per-circuit
trusted setup. Halo, then Halo 2, replaced the trusted setup with a
*nothing-up-my-sleeve* universal structured reference string, at the
cost of larger proofs (kilobytes instead of $\sim 200$ bytes) and more
expensive verification.

### Polynomial IOPs and PLONK arithmetisation

Halo 2 is built on a PLONK-style **arithmetisation**:

- The circuit is a 2D table of cells.
- Each row is constrained by a set of polynomial identities ("custom
  gates").
- Cross-cell equality is enforced by **copy constraints**, implemented
  via a permutation argument.
- Range checks and other "complicated" predicates use **lookup
  arguments** against precomputed tables.

Each column $W_j$ of the table is interpolated as a polynomial $w_j(X)$
over a domain $D \subseteq \mathbb{F}$. The custom gates are
expressed as polynomial identities

$$
P_k(w_1(X), w_2(X), \ldots, \omega \cdot X, \ldots) \;=\; 0
\quad \text{for all } X \in D,
$$

where shifting by a primitive root of unity $\omega$ encodes "next row".
Verification collapses to checking a small number of polynomial
evaluations of committed polynomials.

### Inner Product Argument (IPA)

The polynomial commitment in Halo 2 is **IPA over Pallas**. Given a
polynomial $f(X) = \sum_{i=0}^{n-1} a_i X^i$ of degree $< n$, a
commitment is

$$
\mathsf{Comm}(f) \;=\; \sum_{i=0}^{n-1} [a_i] G_i \;\in\; E_{\text{Pallas}}(\mathbb{F}_p),
$$

with fixed deterministic bases $\{G_i\}$. Opening at a point $z$ uses
a logarithmic-size argument that bisects the vector and folds it,
producing $\log_2 n$ rounds.

The verifier is dominated by an MSM (multi-scalar multiplication) of
size $n$ on Pallas. This is what enables **recursion**: an instance
of the verifier can be encoded as a circuit (since MSMs are
arithmetic), and the cycle of curves makes that practical.

Orchard does **not** itself use recursion in production (no proof
amortisation across blocks); but Halo 2 was chosen so the option is
available. In practice each Orchard bundle produces one Halo 2 proof
that is verified directly.

### Concrete cost

Approximate numbers for an Orchard bundle with 1 action on a modern
CPU:

- Proof size: $\sim 5$ kB.
- Prover time: $\sim 1$ s ($\sim 0.5$ s per added action thereafter).
- Verifier time: $\sim 10$ ms.

Compared to Sapling:

- Sapling Spend proof: $\sim 200$ B, $\sim 2$ s prover, $\sim 7$ ms
  verifier.

The proof-size cost is the price paid for removing the trusted setup.

## 6. Integration in this workspace

The `orchard` crate is external. Inside `librustzcash`:

| File | Role |
| --- | --- |
| `zcash_primitives/src/transaction/components/orchard.rs` | Serialization of Orchard `Bundle<Authorized>` |
| `zcash_primitives/src/transaction/builder.rs` | Glue for adding Orchard outputs and spends to a transaction-in-progress |
| `zcash_keys/src/keys.rs` | UnifiedSpendingKey contains an Orchard `SpendingKey` |
| `zcash_client_backend/src/scanning.rs` | Trial-decrypts Orchard outputs alongside Sapling |
| `pczt/src/roles/...` | Orchard role implementations for PCZT |
| `components/zcash_address/src/kind/unified.rs` | Defines the Orchard receiver inside unified addresses |

Read the `orchard` crate's `lib.rs` for the public surface: `Bundle`,
`Action`, `Note`, `Address`, `Anchor`, `MerklePath`, `ExtendedSpendingKey`,
`FullViewingKey`, etc.

## 7. Recommended reading

- Hopwood et al., *Zcash Protocol Specification.* Section 4.5
  (Orchard), Section 5.4.1.7-8 (Orchard PRFs and hashes), Section
  7.4-7.5 (Orchard encoding).
- ZIP 224 - Orchard Shielded Protocol https://zips.z.cash/zip-0224.
- ZIP 226 - Transfer and Burn of Zcash Shielded Assets (issuance work
  building atop Orchard).
- Bowe, Grigg, Hopwood. *Halo: Recursive Proof Composition without a
  Trusted Setup.* IACR ePrint 2019/1021.
- Gabizon, Williamson, Ciobotaru. *PLONK: Permutations over
  Lagrange-bases for Oecumenical Noninteractive arguments of
  Knowledge.* IACR ePrint 2019/953.
- The Halo 2 book: https://zcash.github.io/halo2/

## 8. Conceptual map: Sapling vs Orchard

| Concern | Sapling | Orchard |
| --- | --- | --- |
| Pairing-friendly curve | BLS12-381 | None (no pairings) |
| Inner curve | Jubjub | Pallas |
| Hash-in-circuit | Pedersen | Sinsemilla |
| Off-circuit hashes | BLAKE2b/s, SHA-256 | BLAKE2b/s |
| Proof system | Groth16 | Halo 2 (IPA) |
| Trusted setup | Yes (MPC ceremony) | No |
| Spend/Output | Separate | Unified Action |
| Nullifier randomness | Derived from position | Derived from previous nf |
| Proof size | ~200 B | ~5 kB |
| Prover/verifier | Fast verifier, slow prover | Slower verifier, comparable prover |

## What you should know after this chapter

- That Pallas/Vesta is a 2-cycle of curves.
- The structure of the Action circuit: unified spend+output, with
  flags to handle spend-only or output-only.
- The role of Sinsemilla as the in-circuit hash.
- Why Halo 2 was chosen: no trusted setup, recursion-ready,
  PLONK-style arithmetisation with lookups.
- That Orchard's nullifier construction is fundamentally different
  from Sapling's: position is replaced by a chain of nullifiers.

Next chapter: how keys and addresses are derived, encoded, and packaged
into unified addresses.
