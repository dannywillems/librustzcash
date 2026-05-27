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

**Definition (Sprout note).** The tuple

$$
\mathsf{note} \;=\; (a_{\mathsf{pk}}, v, \rho, r),
$$

where $a_{\mathsf{pk}}$ is the recipient paying key, $v$ is the
value in zatoshis, $\rho$ is a uniqueness nonce, and $r$ is
commitment randomness. The commitment is

$$
\mathsf{cm} \;=\; \mathsf{SHA256}\!\bigl(
0\text{xb0} \,\|\, a_{\mathsf{pk}} \,\|\, v \,\|\, \rho \,\|\, r
\bigr).
$$

**Definition (JoinSplit).** A constant-shape gadget with 2 inputs,
2 outputs, a public scalar $v_{\text{pub}}^{\text{old}}$ moving
from transparent into the shielded side, a public scalar
$v_{\text{pub}}^{\text{new}}$ moving the other way, a public
Merkle root $\mathsf{rt}$ (anchor), and a public per-JoinSplit
signature digest $h_{\mathsf{sig}}$.

### Sapling

**Definition (Pedersen hash, $\mathsf{PH}$).** Algebraic hash on
Jubjub: pad input bits to a multiple of three, group bits in chunks
of 3 then segments of $c = 63$ chunks (189 bits per segment),
encode each segment as a signed integer via the windowed encoding
$\text{enc}_3(b_0, b_1, b_2) = (1 + b_0 + 2 b_1)(1 - 2 b_2) \in
\{-4, \ldots, -1, 1, \ldots, 4\}$, multiply each segment by an
independent generator $G_j$ derived deterministically from a
domain-separation string, and sum.

**Definition (Sapling note commitment).**

$$
\mathsf{NoteCommit}(\mathsf{rcm}, v, g_d, \mathsf{pk}_d)
\;=\;
\mathsf{PH}\bigl(D_{\text{nc}},\, \text{repr}(v)
\mathbin{\|} \text{repr}(g_d) \mathbin{\|} \text{repr}(\mathsf{pk}_d)\bigr)
\;+\; [\mathsf{rcm}]\, R_{\text{nc}}.
$$

The randomness term $[\mathsf{rcm}] R_{\text{nc}}$ makes the
commitment perfectly hiding.

**Definition (Sapling Merkle hash).**

$$
\mathsf{MerkleHash}(\ell, x_{\text{left}}, x_{\text{right}}) \;=\;
\mathsf{ExtractJubjub}\!\bigl(
\mathsf{PH}(D_{\text{MH}, \ell}, x_{\text{left}} \mathbin{\|}
x_{\text{right}})
\bigr),
$$

where $\ell$ is the layer index and $\mathsf{ExtractJubjub}$ takes
the $u$-coordinate of the resulting Jubjub point modulo the field.
The layer-indexed domain separation prevents tree-rotation attacks.

**Definition (Sapling key tree).**

$$
\mathsf{sk}
\;\xrightarrow{\;\mathsf{PRF}^{\text{expand}}\;}\;
(\mathsf{ask}, \mathsf{nsk}, \mathsf{ovk})
\;\xrightarrow{\;\;\;}\;
(\mathsf{ak}, \mathsf{nk}, \mathsf{ovk})
\;\xrightarrow{\;\;\;}\;
\mathsf{ivk}
\;\xrightarrow{\;\;\;}\;
(\mathsf{pk}_d, g_d).
$$

The full viewing key $\mathsf{fvk} = (\mathsf{ak}, \mathsf{nk},
\mathsf{ovk})$ is sufficient to decrypt any incoming or
outgoing-tagged note.

**Definition (Sapling nullifier).** For a note with commitment
$\mathsf{cm}$, position $\mathsf{pos}$ in the tree, and
$\rho = \mathsf{MixingPedersenHash}(\mathsf{cm}, \mathsf{pos})$,

$$
\mathsf{nf} \;=\;
\mathsf{PRF}^{\mathsf{nfSapling}}_{\mathsf{nk}}(\rho).
$$

**Invariant (Sapling binding equation).** For any valid Sapling
bundle,

$$
\sum_i \mathsf{cv}_i^{\text{in}}
\;-\; \sum_j \mathsf{cv}_j^{\text{out}}
\;=\; [v_{\text{bal}}]V \;+\; [r_{\text{bal}}]R,
$$

with $r_{\text{bal}} = \sum \mathsf{rcv}_i^{\text{in}} -
\sum \mathsf{rcv}_j^{\text{out}}$. The binding signature certifies
that the spender knows $r_{\text{bal}}$, which is feasible only
when the equation holds.

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
- **Sapling `InternalH` issue and `cm`-vs-`cm^u` confusion.** Early
  Sapling implementations conflated the full commitment with its
  extracted $u$-coordinate. Any code change that publishes a full
  $\mathsf{cm}$ where the spec asks for $\mathsf{cm}^u$ (or the
  reverse) leaks information and breaks downstream wallets.
- **Dummy-spend value drift.** A Sapling bundle may include dummy
  spends with $v = 0$ to mask the input count. Builders must
  enforce $v = 0$ for dummies; non-zero dummies silently corrupt
  $v_{\text{bal}}$ and break the binding signature.
- **Wrong $\mathsf{ToScalar}$ reduction.** $\mathsf{ToScalar}$
  reduces a 64-byte string modulo $\ell$. Substituting a 32-byte
  truncation biases the key distribution and silently breaks
  unlinkability proofs.
- **Re-randomisation reuse.** Each spend must sample a fresh
  $\alpha$. Reusing $\alpha$ across two spends links their
  $\mathsf{rk}$ to the same underlying $\mathsf{ak}$, defeating
  the entire point of RedJubjub re-randomisation.

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
