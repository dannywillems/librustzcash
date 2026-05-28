---
sidebar_position: 4
title: Sprout and Sapling
description: "JoinSplit math, Sapling Spend/Output, Jubjub, BLS12-381, Groth16."
---

# 04 - Sprout and Sapling

## 1. Why this chapter exists

Sprout is the original Zerocash protocol embedded in Zcash at
launch; it is historically important but largely frozen. Sapling
is the production shielded pool and the locus of almost everything
in
[`zcash_primitives`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives),
[`zcash_proofs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs),
and
[`zcash_keys`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys).
A reader who cannot state the Spend statement from memory will not
be able to follow the builder code in
[`zcash_primitives/src/transaction/builder.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/builder.rs)
or audit any change to it. By the end of this chapter you will be
able to map every field of a `SpendDescription` and `OutputDescription`
to its mathematical role and locate it in
[`zcash_primitives/src/transaction/components/sapling.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs).

This chapter is the *narrative* introduction. For the
**authoritative symbol-by-symbol reference** of every key
($\mathsf{ask}, \mathsf{nsk}, \mathsf{ak}, \mathsf{nk}, \mathsf{ivk},
\mathsf{ovk}, \mathsf{dk}, \mathsf{esk}, \mathsf{epk}, \ldots$), see
[chapter 23 - The complete key catalog](./23-key-catalog.md). For
the **clause-by-clause walk** of the Spend and Output circuits with
constraint counts, see
[chapter 24 - Circuits, constraint by constraint](./24-circuits-constraint-by-constraint.md).

## 2. Definitions

### Sprout

**Definition 2.1 (Sprout note).** A Sprout note is a tuple
$$
\mathsf{note} \;=\;
(a_{\mathsf{pk}}, v, \rho, r) \;\in\;
\{0,1\}^{256} \times [0, 2^{64}) \times \{0,1\}^{256} \times
\{0,1\}^{256},
$$
where $a_{\mathsf{pk}}$ is the recipient paying key, $v$ is the
value in zatoshis, $\rho \in \{0,1\}^{256}$ is a uniqueness nonce,
and $r \in \{0,1\}^{256}$ is commitment randomness. Its commitment
is the 32-byte string
$$
\mathsf{cm} \;=\; \mathsf{SHA256}\bigl(
\mathrm{0xb0} \mathbin{\|} a_{\mathsf{pk}}
\mathbin{\|} v \mathbin{\|} \rho \mathbin{\|} r
\bigr) \;\in\; \{0,1\}^{256}.
$$

**Definition 2.2 (JoinSplit description).** A JoinSplit description
is a constant-shape gadget consuming 2 input notes and producing 2
output notes, together with public scalars
$v_{\text{pub}}^{\text{old}}, v_{\text{pub}}^{\text{new}} \in
[0, 2^{64})$ encoding transparent inflow and outflow, a public
Merkle root $\mathsf{rt} \in \{0,1\}^{256}$ (anchor), and a public
per-JoinSplit signature digest $h_{\mathsf{sig}} \in \{0,1\}^{256}$
binding the JoinSplit to a fixed transaction context.

### Sapling

**Definition 2.3 (Pedersen hash, $\mathsf{PH}$).** Let
$\mathbb{G}_J$ denote the Jubjub prime-order subgroup. The
Sapling Pedersen hash
$\mathsf{PH}\colon \{0,1\}^{*} \to \mathbb{G}_J$
is defined as follows. Pad the input bit string to a length that is
a multiple of $3$, group bits into chunks of $3$ and segments of
$c = 63$ chunks ($189$ bits per segment), encode each chunk
$(b_0, b_1, b_2) \in \{0,1\}^3$ as the signed integer
$$
\mathrm{enc}_3(b_0, b_1, b_2) \;=\; (1 + b_0 + 2 b_1)(1 - 2 b_2)
\;\in\; \{-4, \ldots, -1, 1, \ldots, 4\} \subseteq \mathbb{F}_r,
$$
multiply each segment $s_j \in \mathbb{F}_r$ by an independent
generator $G_j \in \mathbb{G}_J$ derived deterministically from a
domain-separation string, and return $\sum_j [s_j] G_j$.

**Definition 2.4 (Sapling note commitment).** For
$\mathsf{rcm} \in \mathbb{F}_r$, $v \in [0, 2^{64})$, and
$g_d, \mathsf{pk}_d \in \mathbb{G}_J$,
$$
\mathsf{NoteCommit}(\mathsf{rcm}, v, g_d, \mathsf{pk}_d)
\;=\;
\mathsf{PH}\bigl(D_{\text{nc}},\, \mathrm{repr}(v)
\mathbin{\|} \mathrm{repr}(g_d) \mathbin{\|}
\mathrm{repr}(\mathsf{pk}_d)\bigr)
\;+\; [\mathsf{rcm}]\, R_{\text{nc}} \;\in\; \mathbb{G}_J,
$$
where $R_{\text{nc}} \in \mathbb{G}_J$ is a fixed generator with
$\log_{G_{\text{Jubjub}}} R_{\text{nc}}$ unknown.

**Lemma 2.5 (Sapling note commitment is perfectly hiding and
computationally binding).** $\mathsf{NoteCommit}$ is perfectly
hiding over the randomness $\mathsf{rcm}
\stackrel{\$}{\leftarrow} \mathbb{F}_r$ and computationally
binding under DLP in $\mathbb{G}_J$.

*Proof sketch.* The map
$\mathsf{rcm} \mapsto [\mathsf{rcm}] R_{\text{nc}}$ is a bijection
on $\mathbb{G}_J$, so the distribution of
$\mathsf{NoteCommit}(\mathsf{rcm}, v, g_d, \mathsf{pk}_d)$ for
uniform $\mathsf{rcm}$ is uniform on $\mathbb{G}_J$, independent
of $(v, g_d, \mathsf{pk}_d)$. Binding reduces to collision
resistance of $\mathsf{PH}$ plus knowledge of $\log R_{\text{nc}}$
in the base $G_{\text{Jubjub}}$, both following from DLP in
$\mathbb{G}_J$. See [Zcash Protocol Specification, section 5.4.7].

**Definition 2.6 (Sapling Merkle hash).** Let
$\ell \in \{0, \ldots, 31\}$ denote the Merkle layer index. Define
$$
\mathsf{MerkleHash}(\ell, x_{\text{left}}, x_{\text{right}})
\;=\;
\mathsf{ExtractJubjub}\bigl(
\mathsf{PH}(D_{\text{MH}, \ell},\;
x_{\text{left}} \mathbin{\|} x_{\text{right}})
\bigr) \;\in\; \mathbb{F}_r,
$$
where
$\mathsf{ExtractJubjub}\colon \mathbb{G}_J \to \mathbb{F}_r$
returns the $u$-coordinate of its argument. The layer-indexed
domain separation string $D_{\text{MH}, \ell}$ prevents
tree-rotation attacks because the same byte string used at two
distinct layers hashes to two distinct outputs.

**Definition 2.7 (Sapling key tree).** From a spending key
$\mathsf{sk} \in \{0,1\}^{256}$, the Sapling key tree is the
sequence of derivations
$$
\mathsf{sk}
\;\xrightarrow{\;\mathsf{PRF}^{\text{expand}}\;}\;
(\mathsf{ask}, \mathsf{nsk}, \mathsf{ovk}) \in
\mathbb{F}_r \times \mathbb{F}_r \times \{0,1\}^{256}
\;\xrightarrow{\;\;\;}\;
(\mathsf{ak}, \mathsf{nk}, \mathsf{ovk}) \in
\mathbb{G}_J \times \mathbb{G}_J \times \{0,1\}^{256}
\;\xrightarrow{\;\;\;}\;
\mathsf{ivk} \in \mathbb{F}_r
\;\xrightarrow{\;\;\;}\;
(\mathsf{pk}_d, g_d) \in \mathbb{G}_J \times \mathbb{G}_J.
$$
The full viewing key
$\mathsf{fvk} = (\mathsf{ak}, \mathsf{nk}, \mathsf{ovk}) \in
\mathbb{G}_J \times \mathbb{G}_J \times \{0,1\}^{256}$
is sufficient to decrypt every incoming and outgoing-tagged note
spendable under $\mathsf{sk}$.

**Definition 2.8 (Sapling nullifier).** For a Sapling note with
commitment $\mathsf{cm} \in \mathbb{G}_J$, tree position
$\mathsf{pos} \in [0, 2^{32})$, mixing input
$\rho = \mathsf{MixingPedersenHash}(\mathsf{cm}, \mathsf{pos}) \in
\mathbb{G}_J$, and key
$\mathsf{nk} \in \mathbb{G}_J$, the nullifier is
$$
\mathsf{nf} \;=\;
\mathsf{PRF}^{\mathsf{nfSapling}}_{\mathsf{nk}}(\rho)
\;\in\; \{0,1\}^{256}.
$$

**Invariant 2.9 (Sapling binding equation).** Let
$\mathcal{B}$ be a Sapling bundle with input value commitments
$\{\mathsf{cv}_i^{\text{in}}\}_i$, output value commitments
$\{\mathsf{cv}_j^{\text{out}}\}_j$, and value balance
$v_{\text{bal}} \in [-(2^{63}-1), 2^{63})$. For $V, R \in
\mathbb{G}_J$ fixed value-commitment generators and
$r_{\text{bal}} = \sum_i \mathsf{rcv}_i^{\text{in}}
- \sum_j \mathsf{rcv}_j^{\text{out}} \in \mathbb{F}_r$,
$\mathcal{B}$ satisfies
$$
\sum_i \mathsf{cv}_i^{\text{in}}
\;-\; \sum_j \mathsf{cv}_j^{\text{out}}
\;=\; [v_{\text{bal}}]V \;+\; [r_{\text{bal}}]R
\;\in\; \mathbb{G}_J.
$$
The binding signature certifies knowledge of $r_{\text{bal}}$,
which is feasible (under DLP in $\mathbb{G}_J$) only when the
equation holds.

### The NP relations proven by Sapling

The Sapling proving system produces one Groth16 proof per Spend and
one per Output. Each proof attests membership in an NP language
defined by an explicit relation $R \subseteq \mathcal{X} \times
\mathcal{W}$.

**Definition 2.10 (Sapling Spend relation $R_{\mathsf{Spend}}$).**
Let
$\mathbb{F}_r$ be the BLS12-381 scalar field, $\mathbb{G}_J$ the
Jubjub prime-order subgroup, and $\mathcal{T}$ the Merkle-tree
domain. Define
$$
\mathcal{X}_{\mathsf{Spend}} \;=\;
\bigl(\mathsf{rt}, \mathsf{cv}, \mathsf{nf}, \mathsf{rk}\bigr)
\;\in\;
\mathcal{T} \times \mathbb{G}_J \times \{0,1\}^{256} \times
\mathbb{G}_J,
$$
$$
\mathcal{W}_{\mathsf{Spend}} \;=\;
\bigl(d, \mathsf{pk}_d, v, \mathsf{rcm}, \mathsf{rcv}, \alpha,
\mathsf{ak}, \mathsf{nsk}, \mathsf{pos}, \mathsf{path}\bigr).
$$
Then $(x, w) \in R_{\mathsf{Spend}}$ iff **all** of the following
hold:

1. **Note well-formedness.** With $g_d = \mathsf{GroupHash}(d)$,
   $g_d \neq \mathcal{O}$, $g_d \in \mathbb{G}_J$, and
   $\mathsf{pk}_d \in \mathbb{G}_J$.
2. **Commitment.** Let $\mathsf{cm} =
   \mathsf{NoteCommit}(\mathsf{rcm}, v, g_d, \mathsf{pk}_d)$.
3. **Merkle membership.**
   $\mathsf{MerklePath}(\mathsf{path}, \mathsf{pos},
   \mathsf{ExtractJubjub}(\mathsf{cm})) = \mathsf{rt}$.
4. **Value commitment.**
   $\mathsf{cv} = [v]V + [\mathsf{rcv}]R$.
5. **Spend authority.** $\mathsf{ak} = [\mathsf{ask}]G_{\text{a}}$
   for some $\mathsf{ask}$ known to the prover, and
   $\mathsf{rk} = \mathsf{ak} + [\alpha]G_{\text{a}}$ where
   $\alpha$ is the re-randomiser.
6. **Nullifier integrity.** With $\mathsf{nk} =
   [\mathsf{nsk}]G_{\text{n}}$ and $\rho =
   \mathsf{MixingPedersenHash}(\mathsf{cm}, \mathsf{pos})$,
   $\mathsf{nf} = \mathsf{PRF}^{\mathsf{nfSapling}}_{\mathsf{nk}}
   (\rho)$.
7. **Diversified address.** $\mathsf{pk}_d = [\mathsf{ivk}] g_d$
   where $\mathsf{ivk} = \mathsf{CRH}^{\mathsf{ivk}}(\mathsf{ak},
   \mathsf{nk})$.
8. **Value range.** $v \in [0, 2^{64})$ and $v$ admits a 64-bit
   little-endian binary expansion as part of the witness.

The circuit module enforcing these clauses lives in
[`sapling-crypto::circuit::spend`](https://github.com/zcash/sapling-crypto/blob/main/src/circuit/spend.rs).
Soundness: under the q-PKE and q-power-DH assumptions in the
BLS12-381 bilinear group ([Groth 2016, Theorem 2]).

**Definition 2.11 (Sapling Output relation $R_{\mathsf{Output}}$).**
Let
$$
\mathcal{X}_{\mathsf{Output}} \;=\;
\bigl(\mathsf{cv}, \mathsf{cm}_u, \mathsf{epk}\bigr)
\;\in\;
\mathbb{G}_J \times \mathbb{F}_r \times \mathbb{G}_J,
$$
$$
\mathcal{W}_{\mathsf{Output}} \;=\;
\bigl(d, \mathsf{pk}_d, v, \mathsf{rcm}, \mathsf{rcv},
\mathsf{esk}\bigr).
$$
Then $(x, w) \in R_{\mathsf{Output}}$ iff:

1. $g_d = \mathsf{GroupHash}(d)$, $g_d \neq \mathcal{O}$, and
   $\mathsf{pk}_d \in \mathbb{G}_J$.
2. $\mathsf{cv} = [v]V + [\mathsf{rcv}]R$.
3. $\mathsf{cm}_u = \mathsf{ExtractJubjub}(
   \mathsf{NoteCommit}(\mathsf{rcm}, v, g_d, \mathsf{pk}_d))$.
4. $\mathsf{epk} = [\mathsf{esk}]\, g_d$.
5. $v \in [0, 2^{64})$.

The circuit module is
[`sapling-crypto::circuit::output`](https://github.com/zcash/sapling-crypto/blob/main/src/circuit/output.rs).

**Lemma 2.12 (extraction injectivity).** For
$P, Q \in \mathbb{G}_J$,
$\mathsf{ExtractJubjub}(P) = \mathsf{ExtractJubjub}(Q)$ implies
$P = Q$ or $P = -Q$. In particular, for inputs constrained to
$\mathbb{G}_J$ together with the parity bit, the $u$-coordinate
uniquely identifies a Jubjub point.

*Proof sketch.* For a twisted Edwards curve $-u^2 + v^2 = 1 + d u^2
v^2$ over $\mathbb{F}_r$, the substitution $u \mapsto -u$ leaves
the equation invariant, so points with a given $u$-coordinate
differ only in the sign of $u$ (equivalently, by negation in the
group law). Two distinct points sharing both $u$ and the parity of
$v$ would coincide. The clauses of $R_{\mathsf{Spend}}$ and
$R_{\mathsf{Output}}$ enforce membership in $\mathbb{G}_J$, which
excludes 2-torsion outside the prime-order subgroup. See [Zcash
Protocol Specification, section 5.4.9.1].

## 3. The code

### 3.1 Sprout: a one-page tour

The Sprout circuit lives in
[`zcash_proofs/src/circuit/sprout/mod.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout/mod.rs)
(the "hybrid Sprout" implementation re-encoded for Groth16 instead
of the original BCTV14 system). Its top-level types pin the shape:

```rust reference title="zcash_proofs/src/circuit/sprout/mod.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout/mod.rs#L25-L54
```

The `synthesize` method enforces, for each input $i$:

1. Recompute $\mathsf{cm}_i$ from the witnessed note.
2. Verify a Merkle path of depth 29 from $\mathsf{cm}_i$ to the
   public anchor $\mathsf{rt}$ (with the witnessed authentication
   path).
3. Derive the paying key
   $a_{\mathsf{pk}} = \mathsf{PRF}^{addr}_{a_{\mathsf{sk}}}(0)$.
4. Compute the nullifier
   $\mathsf{nf}_i = \mathsf{PRF}^{\mathsf{nf}}_{a_{\mathsf{sk}}}(\rho_i)$.
5. Compute the "$h_i$ tag"
   $h_i = \mathsf{PRF}^{pk}_{a_{\mathsf{sk}}}(i, h_{\mathsf{sig}})$
   that binds the JoinSplit to a specific $h_{\mathsf{sig}}$.

For each output $j$ it derives a fresh $\rho_j$ from $\phi$ and
indices and recomputes the commitment.

Finally it enforces the balance equation

$$
v_{\text{pub}}^{\text{old}} + v_1 + v_2 \;=\;
v_{\text{pub}}^{\text{new}} + v'_1 + v'_2,
$$

with each $v_i, v'_j \in [0, 2^{64})$ enforced via boolean range
constraints.

The PRFs are all "SHA-256 with a tag prefix", for example

$$
\mathsf{PRF}^{\mathsf{nf}}_{a_{\mathsf{sk}}}(\rho)
= \mathsf{SHA256}\!\bigl( 1110 \,\|\, a_{\mathsf{sk}} \,\|\, \rho \bigr),
$$

where `1110` is a 4-bit tag.

The Sprout-Groth16 proving key is 64 MB
(`sprout-groth16.params`, SHA-256 in
[`zcash_proofs/src/lib.rs#L52`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs#L52)).
Verification is a single Groth16 pairing equation.

Sprout is closed to new outputs since NU5. The code remains for
historical sweeps from old Sprout balances; treat it as legacy.

### 3.2 Sapling: curves and parameters

- $\mathbb{F}_r$: the scalar field of BLS12-381, $r \approx 2^{255}$,
  a 255-bit prime.
- $\mathbb{F}_q$: the base field of Jubjub. Equal to $\mathbb{F}_r$.
- Jubjub is a twisted Edwards curve over $\mathbb{F}_r$,

  $$
    -x^2 + y^2 \;=\; 1 \;+\; d\, x^2 y^2,
    \qquad d = -\frac{10240}{10241},
  $$

  with a prime-order subgroup of order

  $$
    \ell = 6\,554\,484\,396\,890\,773\,809\,930\,967\,563\,523\,245\,729\,705\,921\,265\,872\,317\,281\,365\,359\,162\,392\,183\,254\,199.
  $$

- $G_{\text{Jubjub}}$ is the fixed generator of that subgroup.

Why this curve? Twisted Edwards arithmetic is *strongly unified*
(the same formula for addition and doubling), which keeps the
in-circuit constraint count small. Because $\mathbb{F}_r$ is the
SNARK scalar field, a Jubjub scalar mul costs only roughly 750 R1CS
constraints per operation.

### 3.3 The Sapling key tree

From a 32-byte spending key $\mathsf{sk}$:

1. Derive

   $$
   \mathsf{ask} = \mathsf{ToScalar}\!\bigl(
   \mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(0)\bigr),
   $$

   $$
   \mathsf{nsk} = \mathsf{ToScalar}\!\bigl(
   \mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(1)\bigr),
   $$

   $$
   \mathsf{ovk} =
   \mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(2)[\,0..32\,],
   $$

   where $\mathsf{ToScalar}$ reduces a 64-byte string modulo
   $\ell$.

2. Compute the public points

   $$
   \mathsf{ak} = [\mathsf{ask}] G_{\text{Sapling}}^{\text{ak}},
   \qquad
   \mathsf{nk} = [\mathsf{nsk}] G_{\text{Sapling}}^{\text{nk}},
   $$

   with $G_{\text{Sapling}}^{\text{ak}}$ and
   $G_{\text{Sapling}}^{\text{nk}}$ distinct fixed generators on
   Jubjub.

3. Compute the incoming viewing key

   $$
   \mathsf{ivk} =
   \mathsf{CRH}^{\mathsf{ivk}}(\mathsf{ak}, \mathsf{nk})
   \;\bmod\; \ell,
   $$

   where $\mathsf{CRH}^{\mathsf{ivk}}$ is BLAKE2s with
   personalisation `"Zcashivk"`.

4. For each 11-byte diversifier $d \in \{0,1\}^{88}$, compute
   $g_d = \mathsf{DiversifyHash}(d)$, a hash-to-curve into Jubjub.
   Not every $d$ yields a valid prime-order point; if it does not,
   the diversifier is invalid and skipped. The diversified
   transmission key is

   $$
   \mathsf{pk}_d = [\mathsf{ivk}] g_d.
   $$

5. A Sapling payment address is the pair $(d, \mathsf{pk}_d)$
   encoded as 43 plaintext bytes then bech32 with HRP `zs`.

Diversified addresses follow: each $\mathsf{ivk}$ generates
infinitely many payment addresses sharing the same viewing key. A
wallet can hand out a fresh $d$ to every counterparty without
revealing the common $\mathsf{ivk}$.

### 3.4 Spend description (math)

A Sapling SpendDescription is the tuple

$$
\mathsf{SD} \;=\; (\mathsf{cv}, \mathsf{anchor},
\mathsf{nf}, \mathsf{rk}, \pi_{\text{Spend}},
\sigma_{\text{spendAuth}}).
$$

- $\mathsf{cv} = [v]V + [\mathsf{rcv}]R$ is the value commitment to
  the spent note's value with fresh randomness $\mathsf{rcv}$.
- $\mathsf{anchor}$ is the Merkle root used for membership.
- $\mathsf{nf}$ is the nullifier.
- $\mathsf{rk} = \mathsf{ak} + [\alpha] G^{\mathsf{ak}}$ is the
  re-randomised spend-authority public key.
- $\pi_{\text{Spend}}$ is the Groth16 proof.
- $\sigma_{\text{spendAuth}}$ is a RedJubjub signature under
  $\mathsf{rsk} = \mathsf{ask} + \alpha$ over the sighash of the
  transaction.

The wire format is implemented by `read_spend_v4` (Sapling v4
transactions, full per-spend signature and proof) and
`read_spend_v5` (Sapling v5 transactions, sigs and proofs are
factored to the end of the bundle):

```rust reference title="zcash_primitives/src/transaction/components/sapling.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L168-L213
```

The **Spend statement** (what the circuit enforces): the prover
knows $(v, g_d, \mathsf{pk}_d, \mathsf{rcm}, \alpha, \mathsf{ak},
\mathsf{nsk}, \text{auth-path})$ such that

1. $\mathsf{cm} =
   \mathsf{NoteCommit}(\mathsf{rcm}, v, g_d, \mathsf{pk}_d)$.
2. The Merkle path proves $\mathsf{cm}$ is in the tree with root
   $\mathsf{anchor}$. Special case: if $v = 0$ the path check is
   skipped, allowing "dummy" spends used to mask the input count.
3. $\mathsf{ivk} =
   \mathsf{CRH}^{\mathsf{ivk}}(\mathsf{ak}, \mathsf{nk})$ where
   $\mathsf{nk} = [\mathsf{nsk}] G^{\mathsf{nk}}$.
4. $\mathsf{pk}_d = [\mathsf{ivk}] g_d$ (the spender owns this
   address).
5. $\mathsf{rk} = \mathsf{ak} + [\alpha] G^{\mathsf{ak}}$.
6. $\mathsf{nf} =
   \mathsf{PRF}^{\mathsf{nfSapling}}_{\mathsf{nk}}\bigl(
   \mathsf{MixingPedersenHash}(\mathsf{cm}, \mathsf{pos})\bigr)$.
7. $\mathsf{cv} = [v]V + [\mathsf{rcv}]R$ for known $\mathsf{rcv}$.
8. $v \in [0, 2^{64})$.

Public inputs: $\mathsf{cv}, \mathsf{anchor}, \mathsf{nf},
\mathsf{rk}$.

### 3.5 Output description (math)

An OutputDescription is

$$
\mathsf{OD} \;=\; (\mathsf{cv}, \mathsf{cm}^u, \mathsf{epk},
C^{\text{enc}}, C^{\text{out}}, \pi_{\text{Output}}).
$$

- $\mathsf{cv}$: value commitment of the new note.
- $\mathsf{cm}^u$: the $u$-coordinate of the new note's commitment.
  (The full commitment is recoverable; only the $u$-coordinate is
  published to save space.)
- $\mathsf{epk} = [\mathsf{esk}] g_d$: ephemeral public key for
  ECDH note encryption.
- $C^{\text{enc}}$: the encrypted note plaintext (recipient, value,
  $\mathsf{rcm}$, memo).
- $C^{\text{out}}$: the outgoing ciphertext that lets the sender
  recover the plaintext using $\mathsf{ovk}$.
- $\pi_{\text{Output}}$: the Groth16 proof.

The Output statement: the prover knows $(v, g_d, \mathsf{pk}_d,
\mathsf{rcm}, \mathsf{rcv}, \mathsf{esk})$ such that

1. $\mathsf{cm} = \mathsf{NoteCommit}(\mathsf{rcm}, v, g_d,
   \mathsf{pk}_d)$ and $\mathsf{cm}^u$ is its $u$-coordinate.
2. $\mathsf{cv} = [v]V + [\mathsf{rcv}]R$.
3. $\mathsf{epk} = [\mathsf{esk}] g_d$.
4. $v \in [0, 2^{64})$.
5. $g_d$ is a valid prime-order subgroup element (non-zero).

Public inputs: $\mathsf{cv}, \mathsf{cm}^u, \mathsf{epk}$.

### 3.6 The bundle and binding signature

A Sapling bundle is

$$
\mathsf{Bundle} \;=\; \bigl(
\{\mathsf{SD}_i\},\, \{\mathsf{OD}_j\},\, v_{\text{bal}},\,
\sigma_{\text{bind}} \bigr).
$$

The binding equation from Section 2 holds because each
$\mathsf{cv}$ is Pedersen and the proofs internally certify
well-formedness. The binding signature $\sigma_{\text{bind}}$ is a
RedJubjub signature over the sighash whose verification key is

$$
\mathsf{bvk} = \sum_i \mathsf{cv}_i^{\text{in}}
- \sum_j \mathsf{cv}_j^{\text{out}}
- [v_{\text{bal}}] V.
$$

If the equation holds, $\mathsf{bvk} = [r_{\text{bal}}]R$, so the
spender holds the secret key to that point. If anything is off by
even a single zatoshi or one randomness off, $\mathsf{bvk}$ is a
random-looking point and the signature cannot be forged. **Balance
is enforced by a signature whose key is a function of the
commitments.**

### 3.7 Groth16 specifics

A Groth16 proof is

$$
\pi = (A, B, C), \qquad A, C \in \mathbb{G}_1,\;
B \in \mathbb{G}_2.
$$

Verification given public inputs $(x_1, \ldots, x_\ell)$ and
verifying key $\mathsf{vk} = (\alpha, \beta, \gamma, \delta,
\{\tau_i\}_{i=0}^{\ell})$:

$$
e(A, B) \;\stackrel{?}{=}\; e(\alpha, \beta) \cdot
e\!\Bigl(\textstyle\sum_{i=0}^{\ell} x_i \tau_i, \gamma\Bigr)
\cdot e(C, \delta).
$$

The vector $\{\tau_i\}$ is the input key: one $\mathbb{G}_1$ point
per public input, plus a constant. For Sapling Spend $\ell = 7$
(witness encoding of $\mathsf{cv}, \mathsf{anchor}, \mathsf{nf},
\mathsf{rk}$); for Sapling Output $\ell = 5$.

The Sapling trusted setup was performed in two MPC ceremonies in
2017-2018 ("Powers of Tau" then per-circuit). The verifying-key
hashes are hardcoded in
[`zcash_proofs/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs#L40-L52)
(`SAPLING_SPEND_HASH`, `SAPLING_OUTPUT_HASH`). The wallet downloads
the proving keys with `download-params` and verifies them by
SHA-256.

### 3.8 End-to-end

To spend $v_{\text{in}}$ from a note and create a new output of
value $v_{\text{out}}$ (plus a change output) with fee $f$, a
Sapling transaction:

1. Picks anchor $\mathsf{rt}$ from a recent block.
2. Constructs SpendDescriptions for each input, sampling
   $\alpha_i$ and $\mathsf{rcv}_i^{\text{in}}$, generating the
   Groth16 proof and the spend-auth signature.
3. Constructs OutputDescriptions, sampling fresh
   $\mathsf{rcv}_j^{\text{out}}$, $\mathsf{rcm}_j$, and
   $\mathsf{esk}_j$, encrypting the note plaintext.
4. Sets
   $v_{\text{bal}} = v_{\text{in}} - v_{\text{out}}
   - v_{\text{change}}$ (sign convention from the spec).
5. Computes $\sigma_{\text{bind}}$ under the implicit key
   $\mathsf{bvk} = \sum \mathsf{cv}_i^{\text{in}}
   - \sum \mathsf{cv}_j^{\text{out}} - [v_{\text{bal}}] V$.

A node verifies each proof against its $\mathsf{vk}$, verifies the
spend-auth signatures, verifies the binding signature, and checks
nullifier non-membership.

The Sapling protocol implementation moved out of this workspace
into the
[`sapling-crypto`](https://github.com/zcash/sapling-crypto) crate.
What remains here:

- [`zcash_primitives/src/transaction/components/sapling.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs):
  serialization, the `Bundle<A, Amount>` type, authorisation
  states.
- [`zcash_primitives/src/transaction/builder.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/builder.rs):
  the high-level Sapling builder shim that delegates into
  `sapling_builder` from `sapling-crypto`.
- [`zcash_proofs/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs):
  parameter loading, verifying-key hashes, prover bindings.
- [`zcash_keys/src/keys.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs):
  spending-key derivation glue, much delegated to `zip32` and
  `sapling-crypto::zip32`.

## 4. Failure modes

- **Sprout counterfeiting CVE-2019-7167.** The original Sprout
  proving system was BCTV14. A soundness flaw in BCTV14 allowed a
  prover to forge a JoinSplit proof under a weaker assumption.
  Mitigation: migration to Groth16 with a fresh MPC and the
  "hybrid Sprout" wrapper that this repo still ships. See
  [chapter 12](./12-historical-bugs.md) for the full timeline and
  the
  [ECC remediation post](https://electriccoin.co/blog/zcash-counterfeiting-vulnerability-successfully-remediated/).
  Any change to the Sprout circuit must preserve the boolean
  range constraints; removing them silently restores the BCTV14
  failure mode at the application layer.
  > Caught by:
  > `zcash_proofs::circuit::sprout::test_sprout_constraints` in
  > `zcash_proofs/src/circuit/sprout/mod.rs` (the test feeds the
  > Groth16-shaped Sprout circuit a fixed test-vector corpus and
  > asserts the constraint system is satisfied exactly when the
  > inputs are valid; gated on the `expensive-tests` feature).
- **Sapling `InternalH` issue and `cm`-vs-`cm^u` confusion.** Early
  Sapling implementations conflated the full commitment with its
  extracted $u$-coordinate. Any code change that publishes a full
  $\mathsf{cm}$ where the spec asks for $\mathsf{cm}^u$ (or the
  reverse) leaks information and breaks downstream wallets.
  > Caught by:
  > `zcash_primitives::transaction::tests::tx_read_write` in
  > `zcash_primitives/src/transaction/tests.rs` (the test parses a
  > fixed v4 transaction and checks the txid against a pinned
  > value; any reversal of $\mathsf{cm}$ versus $\mathsf{cm}^u$ in
  > the OutputDescription reader changes the digest).
- **Dummy-spend value drift.** A Sapling bundle may include dummy
  spends with $v = 0$ to mask the input count. Builders must
  enforce $v = 0$ for dummies; non-zero dummies silently corrupt
  $v_{\text{bal}}$ and break the binding signature.
  > No automated test in this workspace. Dummy-spend construction
  > and the binding-signature check live in the external
  > `sapling-crypto` crate; this workspace only round-trips the
  > serialized bundle. Caught by audit only.
- **Wrong $\mathsf{ToScalar}$ reduction.** $\mathsf{ToScalar}$
  reduces a 64-byte string modulo $\ell$. Substituting a 32-byte
  truncation biases the key distribution and silently breaks
  unlinkability proofs.
  > Caught by: `zcash_keys::keys::tests::ufvk_round_trip` in
  > `zcash_keys/src/keys.rs` (derives Sapling and Orchard FVKs
  > from a fixed seed and asserts the resulting UFVK encoding
  > against a pinned bech32 string; any change in
  > $\mathsf{ToScalar}$ rotates every derived key and the
  > comparison fails).
- **Re-randomisation reuse.** Each spend must sample a fresh
  $\alpha$. Reusing $\alpha$ across two spends links their
  $\mathsf{rk}$ to the same underlying $\mathsf{ak}$, defeating
  the entire point of RedJubjub re-randomisation.
  > No automated test in this workspace. Sampling of $\alpha$
  > happens inside the external `sapling-crypto` builder; this
  > workspace consumes its output. Caught by audit only.

Tests under
[`zcash_primitives/src/transaction/tests.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/tests.rs)
exercise the full v4 / v5 serialization round-trip; the
`sapling-crypto` crate carries the circuit-level tests for the
Spend and Output statements.

## 5. Spec pointers

- [Zcash Protocol Specification, section 4 (Abstract Protocol)](https://zips.z.cash/protocol/protocol.pdf):
  the high-level Sapling protocol definitions cited throughout
  this chapter.
- [Zcash Protocol Specification, section 5 (Concrete Protocol)](https://zips.z.cash/protocol/protocol.pdf):
  the concrete formulas for $\mathsf{NoteCommit}$,
  $\mathsf{MerkleHash}$, $\mathsf{PRF}^{\mathsf{nfSapling}}$, and
  the key tree.
- [Zcash Protocol Specification, section 7 (Encodings)](https://zips.z.cash/protocol/protocol.pdf):
  the wire-format encoding that `read_spend_v4` and
  `read_spend_v5` implement.
- [ZIP 32](https://zips.z.cash/zip-0032): HD derivation for the
  spending key $\mathsf{sk}$ that seeds the key tree above.
- [Ben-Sasson et al., Zerocash, IEEE S&P 2014](https://eprint.iacr.org/2014/349):
  the Sprout-era protocol. Background only; Sapling diverges.
- [Groth, 2016](https://eprint.iacr.org/2016/260): the Groth16
  paper. Read section 3 for the pairing equation cited in
  Section 3.7.

## 6. Exercises

1. **Map a field.** Open
   [`SpendDescription`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs)
   and identify the source line of each component of the tuple
   $(\mathsf{cv}, \mathsf{anchor}, \mathsf{nf}, \mathsf{rk},
   \pi_{\text{Spend}}, \sigma_{\text{spendAuth}})$.
2. **Predict the dispatch.** For a v4 transaction, which of
   `read_spend_v4` or `read_spend_v5` does the parser call? What
   about a v5 transaction? Cite the call site in
   [`zcash_primitives/src/transaction/components/sapling.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs).
3. **Modify and test.** In a checkout, add a unit test under
   `zcash_primitives` that constructs a `SpendDescription` with a
   deliberately wrong $\mathsf{rk}$ (e.g. negate it) and confirms
   that the spend-auth signature verification fails. The test
   should pass (i.e. the assertion that verification returns an
   error must hold). Cite the public verification entry point
   from the `redjubjub` crate as your reference.

### Answers in the code

- Sprout JoinSplit shape:
  [`zcash_proofs/src/circuit/sprout/mod.rs#L25-L54`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout/mod.rs#L25-L54).
- Sapling Spend v4/v5 readers:
  [`zcash_primitives/src/transaction/components/sapling.rs#L168-L213`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L168-L213).
- Sapling proving / verifying key hashes:
  [`zcash_proofs/src/lib.rs#L40-L52`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs#L40-L52).

## 7. Further reading

- [chapter 05](./05-orchard-and-halo2.md): Orchard and Halo 2,
  which replace the trusted-setup Groth16 stack with a transparent
  IPA-based system.
- [chapter 16](./16-pedersen-hash-deep-dive.md): the windowed
  encoding for Pedersen hashes, in-circuit cost, generator
  derivation.
- [chapter 24](./24-circuits-constraint-by-constraint.md):
  clause-by-clause walk of the Spend and Output circuits with
  constraint counts.
- Hopwood, Bowe, Hornby, Wilcox.
  [Sapling design notes](https://github.com/zcash/zips/blob/main/protocol/sapling.pdf).
