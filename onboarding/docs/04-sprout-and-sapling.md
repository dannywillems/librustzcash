---
sidebar_position: 4
title: Sprout and Sapling
description: "JoinSplit math, Sapling Spend/Output, Jubjub, BLS12-381, Groth16."
---

# 04 - Sprout and Sapling

## Goal

Deep dive into the math of the first two shielded protocols. Sprout is
historically important but largely frozen; Sapling is the workhorse of
shielded Zcash today, and almost everything in `zcash_primitives`,
`zcash_proofs`, `zcash_keys` revolves around it. We will linger on
Sapling.

This chapter is the *narrative* introduction to Sprout and Sapling.
For the **authoritative symbol-by-symbol reference** of every key
($\mathsf{ask}, \mathsf{nsk}, \mathsf{ak}, \mathsf{nk}, \mathsf{ivk},
\mathsf{ovk}, \mathsf{dk}, \mathsf{esk}, \mathsf{epk}, \ldots$),
see [chapter 23 - The complete key catalog](./23-key-catalog.md). For
the **clause-by-clause walk** of the Spend and Output circuits with
constraint counts, see [chapter 24 - Circuits, constraint by
constraint](./24-circuits-constraint-by-constraint.md).

## Part A - Sprout (1-page summary)

Sprout is the original Zerocash protocol, BCTV14-style SNARK, SHA-256
everywhere. Implementation lives in
`zcash_proofs/src/circuit/sprout/` (the "hybrid Sprout" implementation
re-encoded for Groth16 instead of the original BCTV14 system).

The shielded primitive is a **JoinSplit**: a constant-shape gadget with

- 2 inputs (each a note from the Sprout tree),
- 2 outputs (each a fresh note),
- a public scalar $v_{\text{pub}}^{\text{old}}$ moving from transparent
  into the shielded side,
- a public scalar $v_{\text{pub}}^{\text{new}}$ moving from shielded to
  transparent,
- a public Merkle root $\mathsf{rt}$ (anchor),
- a public per-JoinSplit signature digest $h_{\mathsf{sig}}$.

A **note** in Sprout is the tuple

$$
\mathsf{note} \;=\; (a_{\mathsf{pk}}, v, \rho, r),
$$

where $a_{\mathsf{pk}}$ is the recipient paying key, $v$ is the value in
zatoshis, $\rho$ is a uniqueness nonce, and $r$ is commitment randomness.
The commitment is

$$
\mathsf{cm} \;=\; \mathsf{SHA256}(0xb0 \,\|\, a_{\mathsf{pk}} \,\|\, v \,\|\, \rho \,\|\, r).
$$

The JoinSplit circuit (`JoinSplit::synthesize` in
`zcash_proofs/src/circuit/sprout/mod.rs`) checks, for each input $i$:

1. Recompute $\mathsf{cm}_i$ from the witnessed note.
2. Verify a Merkle path of depth $29$ from $\mathsf{cm}_i$ to the public
   anchor $\mathsf{rt}$ (with the witnessed authentication path).
3. Derive the paying key $a_{\mathsf{pk}} = \mathsf{PRF}^{addr}_{a_{\mathsf{sk}}}(0)$.
4. Compute the nullifier
   $\mathsf{nf}_i = \mathsf{PRF}^{\mathsf{nf}}_{a_{\mathsf{sk}}}(\rho_i)$.
5. Compute the "$h_i$ tag"
   $h_i = \mathsf{PRF}^{pk}_{a_{\mathsf{sk}}}(i, h_{\mathsf{sig}})$
   that binds the JoinSplit to a specific $h_{\mathsf{sig}}$ context.

For each output $j$ it derives a fresh $\rho_j$ from $\phi$ and indices and
recomputes the commitment.

Finally it enforces the balance equation

$$
v_{\text{pub}}^{\text{old}} + v_1 + v_2 \;=\;
v_{\text{pub}}^{\text{new}} + v'_1 + v'_2,
$$

with each $v_i, v'_j \in [0, 2^{64})$ enforced via boolean range
constraints.

The PRFs are all "SHA-256 with a tag prefix", e.g.

$$
\mathsf{PRF}^{\mathsf{nf}}_{a_{\mathsf{sk}}}(\rho)
= \mathsf{SHA256}\!\bigl( 1110 \,\|\, a_{\mathsf{sk}} \,\|\, \rho \bigr),
$$

where `1110` is a 4-bit tag.

The Sprout-Groth16 proving key is 64 MB (`sprout-groth16.params`,
SHA-256 in `zcash_proofs/src/lib.rs::SPROUT_GROTH16_HASH`). Verification
is a single Groth16 pairing equation.

Sprout is closed to new outputs since NU5. The code remains for
historical sweeps from old Sprout balances; treat it as legacy.

## Part B - Sapling (the bulk of this chapter)

Sapling is the production shielded pool. Implementation: `sapling-crypto`
crate (external repo), wired into this workspace via `zcash_primitives`
and `zcash_keys`. The Sapling circuit and proving live in
`sapling-crypto`; the bundle types, sighash, and integration live in
`zcash_primitives/src/transaction/components/sapling.rs` and
`zcash_proofs/src/lib.rs`.

### B.1 - Curves and parameters

- $\mathbb{F}_r$ - the scalar field of BLS12-381, $r \approx 2^{255}$,
  a 255-bit prime.
- $\mathbb{F}_q$ - the base field of Jubjub. Equal to $\mathbb{F}_r$.
- Jubjub is a twisted Edwards curve over $\mathbb{F}_r$, parameter

  $$
    -x^2 + y^2 \;=\; 1 \;+\; d \, x^2 y^2, \qquad d = -\frac{10240}{10241},
  $$

  with a prime-order subgroup of order

  $$
    \ell = 6554484396890773809930967563523245729705921265872317281365359162392183254199.
  $$

- $G_{\text{Jubjub}}$ is the fixed generator of that subgroup.

Why this curve? Twisted Edwards arithmetic is *strongly unified* (the same
formula for addition and doubling), which keeps the in-circuit
constraint count small. And $\mathbb{F}_r$ being the SNARK scalar field
means a Jubjub scalar mul costs only $\sim 750$ R1CS constraints per
operation.

### B.2 - Pedersen hash

Sapling's hash-to-curve is the **Pedersen hash** $\mathsf{PH}$. Given an
input bit string $m = m_1 m_2 \ldots m_k$:

1. Pad $m$ to a multiple of 3 bits.
2. Group the bits in **chunks** of 3 bits, then chunks of $c = 63$
   3-bit chunks (so 189 bits per "segment").
3. For each segment $j$, encode the 63 chunks as a signed integer
   $M_j \in \mathbb{Z}$ via the windowed encoding

   $$
     M_j \;=\; \sum_{i=0}^{62} \text{enc}_3(\text{chunk}_i) \cdot 2^{4i},
   $$

   where $\text{enc}_3(b_0, b_1, b_2) = (1 + b_0 + 2 b_1) \cdot
   (1 - 2 b_2)$ maps each 3-bit chunk into $\{-4, -3, -2, -1, 1, 2, 3, 4\}$.
4. Each segment has an independent generator
   $G_j \in \mathbb{G}_{\text{Jubjub}}$ derived deterministically from
   a personalisation string.
5. Output

   $$
     \mathsf{PH}(D, m) \;=\; \sum_{j} [M_j] G_j,
   $$

   with $D$ a domain-separation byte used in selecting the generators.

Why this construction: the windowed encoding is chosen so that the cost
inside a SNARK is approximately one constraint per 3-bit chunk, plus one
"select from a lookup table" per chunk, instead of the much larger cost
of native SHA-256.

The Sapling **note commitment** is

$$
\mathsf{NoteCommit}(\mathsf{rcm}, v, g_d, \mathsf{pk}_d)
\;=\;
\mathsf{PH}(D_{\text{nc}}, \text{repr}(v) \,\|\, \text{repr}(g_d) \,\|\, \text{repr}(\mathsf{pk}_d))
\;+\; [\mathsf{rcm}] R_{\text{nc}},
$$

where $g_d \in \mathbb{G}_{\text{Jubjub}}$ is a per-address *diversifier*
base point, $\mathsf{pk}_d = [\mathsf{ivk}] g_d$ is the recipient's
diversified transmission key, $\mathsf{rcm} \in \mathbb{F}_r$ is the
commitment randomness, and $R_{\text{nc}}$ is a fixed generator.

Note the **two-layer construction**: an inner Pedersen hash gives
$\mathsf{PH}$, then a randomness term $[\mathsf{rcm}] R_{\text{nc}}$ makes
the commitment perfectly hiding.

The **Merkle hash** for the note commitment tree is similarly a Pedersen
hash:

$$
\mathsf{MerkleHash}(\ell, x_{\text{left}}, x_{\text{right}})
\;=\;
\mathsf{ExtractJubjub}\!\Bigl(
  \mathsf{PH}(D_{\text{MH}, \ell}, x_{\text{left}} \,\|\, x_{\text{right}})
\Bigr),
$$

where $\ell$ is the layer index and $\mathsf{ExtractJubjub}$ takes the
$u$-coordinate of the resulting Jubjub point modulo the field. The
domain separation by layer prevents tree-rotation attacks.

### B.3 - Key tree

The Sapling key derivation is a layered structure:

$$
\mathsf{sk} \;\xrightarrow{\;\mathsf{PRF}^{\text{expand}}\;}\;
(\mathsf{ask}, \mathsf{nsk}, \mathsf{ovk})
\;\xrightarrow{\;\;\;}\;
(\mathsf{ak}, \mathsf{nk}, \mathsf{ovk})
\;\xrightarrow{\;\;\;}\;
\mathsf{ivk}
\;\xrightarrow{\;\;\;}\;
(\mathsf{pk}_d, g_d).
$$

Concretely:

1. From a 32-byte **spending key** $\mathsf{sk}$, derive

   $$
   \mathsf{ask} = \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(0)\bigr),
   \quad
   \mathsf{nsk} = \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(1)\bigr),
   $$

   $$
   \mathsf{ovk} = \mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(2)[\,0..32\,],
   $$

   where $\mathsf{ToScalar}$ reduces a 64-byte string modulo $\ell$.

2. Compute the public points

   $$
   \mathsf{ak} = [\mathsf{ask}] G_{\text{Sapling}}^{\text{ak}}, \qquad
   \mathsf{nk} = [\mathsf{nsk}] G_{\text{Sapling}}^{\text{nk}},
   $$

   with $G_{\text{Sapling}}^{\text{ak}}$ and $G_{\text{Sapling}}^{\text{nk}}$
   distinct fixed generators on Jubjub.

3. Compute the **incoming viewing key**

   $$
   \mathsf{ivk} = \mathsf{CRH}^{\mathsf{ivk}}(\mathsf{ak}, \mathsf{nk})
            \;\bmod\; \ell,
   $$

   where $\mathsf{CRH}^{\mathsf{ivk}}$ is a BLAKE2s with personalisation
   `"Zcashivk"`.

4. For each 11-byte **diversifier** $d \in \{0,1\}^{88}$, compute
   $g_d = \mathsf{DiversifyHash}(d)$, a hash-to-curve into Jubjub.
   Not every $d$ produces a valid (prime-order) point;
   if it does not, the diversifier is "invalid" and skipped.
   The **diversified transmission key** is then

   $$
   \mathsf{pk}_d = [\mathsf{ivk}] g_d.
   $$

5. A Sapling payment address is the pair $(d, \mathsf{pk}_d)$ encoded
   (43 bytes plaintext, then bech32 with HRP `zs`).

This is why Sapling has *diversified addresses*: each $\mathsf{ivk}$
generates infinitely many payment addresses, all of which share the same
viewing key. A wallet can hand out a fresh $d$ to every counterparty
without revealing anything about the common $\mathsf{ivk}$.

The **full viewing key** is $\mathsf{fvk} = (\mathsf{ak}, \mathsf{nk},
\mathsf{ovk})$. From it one can compute $\mathsf{ivk}$ and decrypt any
output addressed to a derived address; from $\mathsf{ovk}$ one can also
decrypt outputs *one sent*.

### B.4 - Nullifier

For a Sapling note with commitment $\mathsf{cm}$, position $\mathsf{pos}$
in the tree (a non-negative integer of bounded bit length), and value
$\rho = \mathsf{MixingPedersenHash}(\mathsf{cm}, \mathsf{pos})$ (a
specific Pedersen-hash combine):

$$
\mathsf{nf} \;=\; \mathsf{PRF}^{\mathsf{nfSapling}}_{\mathsf{nk}}\!\bigl(\rho\bigr).
$$

The PRF is BLAKE2s with personalisation `"Zcash_nf"`, key is the
$u, v$-coordinates of $\mathsf{nk}$, input is the coordinates of $\rho$.

Crucially: the nullifier depends on $\mathsf{nk}$ (private) and the
*position* of the note. Two different commits with the same plaintext
content but at different positions have different nullifiers. The
position must be unique on-chain, hence position-pinned $\rho$.

### B.5 - Spend description (math)

A Sapling **SpendDescription** is the tuple

$$
\mathsf{SD} \;=\; (\mathsf{cv}, \mathsf{anchor},
  \mathsf{nf}, \mathsf{rk}, \pi_{\text{Spend}}, \sigma_{\text{spendAuth}}).
$$

- $\mathsf{cv} = [v] V + [\mathsf{rcv}] R$ is the **value commitment**
  to the spent note's value with fresh randomness $\mathsf{rcv}$.
- $\mathsf{anchor}$ is the Merkle root used for membership.
- $\mathsf{nf}$ is the nullifier.
- $\mathsf{rk} = \mathsf{ak} + [\alpha] G^{\mathsf{ak}}$ is the
  re-randomised spend authority public key.
- $\pi_{\text{Spend}}$ is the Groth16 proof.
- $\sigma_{\text{spendAuth}}$ is a RedJubjub signature under
  $\mathsf{rsk} = \mathsf{ask} + \alpha$ over the **sighash** of the
  transaction.

The **Spend statement** (what the circuit enforces): the prover knows
$(v, g_d, \mathsf{pk}_d, \mathsf{rcm}, \alpha, \mathsf{ak}, \mathsf{nsk},
\text{auth-path})$ such that

1. $\mathsf{cm} =
   \mathsf{NoteCommit}(\mathsf{rcm}, v, g_d, \mathsf{pk}_d)$.
2. The Merkle path proves $\mathsf{cm}$ is in the tree with root
   $\mathsf{anchor}$. (Special case: if $v = 0$ then the path check is
   skipped, allowing "dummy" spends used to mask the input count.)
3. $\mathsf{ivk} = \mathsf{CRH}^{\mathsf{ivk}}(\mathsf{ak}, \mathsf{nk})$
   where $\mathsf{nk} = [\mathsf{nsk}] G^{\mathsf{nk}}$.
4. $\mathsf{pk}_d = [\mathsf{ivk}] g_d$ (so the spender owns this
   address).
5. $\mathsf{rk} = \mathsf{ak} + [\alpha] G^{\mathsf{ak}}$.
6. $\mathsf{nf} = \mathsf{PRF}^{\mathsf{nfSapling}}_{\mathsf{nk}}(
   \mathsf{MixingPedersenHash}(\mathsf{cm}, \mathsf{pos}))$.
7. $\mathsf{cv} = [v] V + [\mathsf{rcv}] R$ for known $\mathsf{rcv}$.
8. $v \in [0, 2^{64})$.

The public inputs are $\mathsf{cv}, \mathsf{anchor}, \mathsf{nf},
\mathsf{rk}$.

### B.6 - Output description (math)

An **OutputDescription** is

$$
\mathsf{OD} \;=\; (\mathsf{cv}, \mathsf{cm}^u, \mathsf{epk}, C^{\text{enc}},
   C^{\text{out}}, \pi_{\text{Output}}).
$$

- $\mathsf{cv}$ is the value commitment of the new note.
- $\mathsf{cm}^u$ is the $u$-coordinate of the new note's commitment.
  (The full commitment is recoverable; only the $u$-coordinate is
  published to save space.)
- $\mathsf{epk} = [\mathsf{esk}] g_d$ is the ephemeral public key for
  ECDH note encryption.
- $C^{\text{enc}}$ is the **encrypted note plaintext** (recipient,
  value, $\mathsf{rcm}$, memo).
- $C^{\text{out}}$ is the **outgoing ciphertext** that lets the sender
  recover the plaintext using $\mathsf{ovk}$.
- $\pi_{\text{Output}}$ is the Groth16 proof.

The **Output statement**: the prover knows $(v, g_d, \mathsf{pk}_d,
\mathsf{rcm}, \mathsf{rcv}, \mathsf{esk})$ such that

1. $\mathsf{cm} = \mathsf{NoteCommit}(\mathsf{rcm}, v, g_d, \mathsf{pk}_d)$
   and $\mathsf{cm}^u$ is its $u$-coordinate.
2. $\mathsf{cv} = [v]V + [\mathsf{rcv}]R$.
3. $\mathsf{epk} = [\mathsf{esk}] g_d$.
4. $v \in [0, 2^{64})$.
5. $g_d$ is a valid prime-order subgroup element (non-zero).

The public inputs are $\mathsf{cv}, \mathsf{cm}^u, \mathsf{epk}$.

### B.7 - The Sapling bundle and binding signature

A Sapling bundle is

$$
\mathsf{Bundle} \;=\; \bigl( \{\mathsf{SD}_i\}, \{\mathsf{OD}_j\}, v_{\text{bal}},
   \sigma_{\text{bind}} \bigr).
$$

The **balancing equation** that the bundle implicitly satisfies:

$$
\sum_i \mathsf{cv}_i^{\text{in}} \;-\; \sum_j \mathsf{cv}_j^{\text{out}}
\;=\; [v_{\text{bal}}] V \;+\; [r_{\text{bal}}] R,
$$

where $r_{\text{bal}} = \sum \mathsf{rcv}_i^{\text{in}} -
\sum \mathsf{rcv}_j^{\text{out}}$. The prover knows $r_{\text{bal}}$;
nobody else can compute it from public data because they would need to
solve the discrete log of $V$ relative to $R$ (which is hard).

The **binding signature** $\sigma_{\text{bind}}$ is a RedJubjub signature
over the sighash, where the verification key is

$$
\mathsf{bvk} = \sum_i \mathsf{cv}_i^{\text{in}} - \sum_j \mathsf{cv}_j^{\text{out}}
        - [v_{\text{bal}}] V.
$$

If the equation holds, $\mathsf{bvk} = [r_{\text{bal}}] R$, so the spender
holds the secret key to that key. If anything is off by even a single
zatoshi or one randomness off, $\mathsf{bvk}$ is a random-looking point
and the signature cannot be forged.

This is the centrepiece of Sapling's design: **balance is enforced by a
signature whose key is a function of the commitments**. The proofs
internally certify that each commitment is well-formed; the binding
signature certifies that they sum correctly.

### B.8 - Groth16 specifics

A Groth16 proof is

$$
\pi = (A, B, C), \quad A, C \in \mathbb{G}_1, \quad B \in \mathbb{G}_2.
$$

Verification given public inputs $(x_1, \ldots, x_\ell)$ and verifying
key $\mathsf{vk} = (\alpha, \beta, \gamma, \delta, \{ \tau_i\}_{i=0}^{\ell})$:

$$
e(A, B) \stackrel{?}{=} e(\alpha, \beta) \cdot e\!\Bigl(\textstyle\sum_{i=0}^{\ell} x_i \tau_i, \gamma\Bigr) \cdot e(C, \delta).
$$

The vector $\{\tau_i\}$ is the "input key": one $\mathbb{G}_1$ point per
public input, plus a constant. For Sapling Spend, $\ell = 7$ (witness
encoding of $\mathsf{cv}, \mathsf{anchor}, \mathsf{nf}, \mathsf{rk}$);
for Sapling Output, $\ell = 5$.

In code:

```text
zcash_proofs/src/lib.rs   -- loads verifying keys, exposes
                             prepare_verifying_key.
sapling-crypto::circuit::Spend, Output -- the Bellman circuits.
sapling-crypto::prover     -- the proving routines.
```

The Sapling **trusted setup** was performed in two MPC ceremonies in
2017-2018 ("Powers of Tau" then per-circuit). The verifying-key hashes
are hardcoded in `zcash_proofs/src/lib.rs` (`SAPLING_SPEND_VK_HASH`,
`SAPLING_OUTPUT_VK_HASH`). The wallet downloads the proving keys with
`download-params` and verifies them by SHA-256.

### B.9 - Putting it together

To spend value $v_{\text{in}}$ from a note and create a new output of
value $v_{\text{out}}$ (plus a change output) with fee $f$, a Sapling
transaction:

1. Picks anchor $\mathsf{rt}$ from a recent block.
2. Constructs SpendDescriptions for each input, sampling $\alpha_i$,
   $\mathsf{rcv}_i^{\text{in}}$, generating the Groth16 proof and the
   spend-auth signature.
3. Constructs OutputDescriptions, sampling fresh $\mathsf{rcv}_j^{\text{out}}$,
   $\mathsf{rcm}_j$, $\mathsf{esk}_j$, encrypting the note plaintext.
4. Sets $v_{\text{bal}} = v_{\text{in}} - v_{\text{out}} - v_{\text{change}}$
   (with sign convention from the spec).
5. Computes $\sigma_{\text{bind}}$ under the implicit key
   $\mathsf{bvk} = \sum \mathsf{cv}_i^{\text{in}} - \sum \mathsf{cv}_j^{\text{out}} -
   [v_{\text{bal}}] V$.

A node verifies each proof against its $\mathsf{vk}$, verifies the
spend-auth signatures, verifies the binding signature, and checks
nullifier non-membership.

## Where this lives in the code

The Sapling protocol implementation moved out of this workspace into
`sapling-crypto` (separate repo). What remains here:

- `zcash_primitives/src/transaction/components/sapling.rs`:
  serialization, the `Bundle<A, Amount>` type, authorisation states.
- `zcash_primitives/src/transaction/builder.rs`: the high-level Sapling
  builder shim that delegates into `sapling_builder` from
  `sapling-crypto`.
- `zcash_proofs/src/lib.rs`: parameter loading, verifying-key hashes,
  prover bindings.
- `zcash_keys/src/keys.rs`: spending-key derivation glue (much of it
  delegated to `zip32` and `sapling-crypto::zip32`).

## Recommended reading

- Hopwood, Bowe, Hornby, Wilcox. *Zcash Protocol Specification.*
  Sections 4 (Abstract Protocol), 5 (Concrete Protocol), 7 (Encodings).
- The Sapling design notes:
  https://github.com/zcash/zips/blob/main/protocol/sapling.pdf
- Ben-Sasson et al. *Zerocash: Decentralized Anonymous Payments from
  Bitcoin.* IEEE S&P 2014. Background only; Sapling diverges.
- Groth. *On the Size of Pairing-based Non-interactive Arguments.*
  EUROCRYPT 2016.

## What you should know after this chapter

- The Sapling key tree from $\mathsf{sk}$ down to $(d, \mathsf{pk}_d)$.
- Why Pedersen commitments make value-conservation easy.
- The exact statements proved by the Spend and Output circuits.
- How re-randomisation, binding signatures, and value commitments
  interlock.
- Why Sprout still compiles but is effectively legacy.

The next chapter does the same for Orchard, which is simpler and more
modern in many respects.
