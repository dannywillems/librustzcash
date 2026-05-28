---
sidebar_position: 3
title: Cryptography primer
description: "Groups, pairings, Pedersen, BLAKE2, RedDSA, ZK primer."
---

# 03 - Cryptography primer

## 1. Why this chapter exists

Chapters 04 and 05 will talk about Spend statements, value
commitments, binding signatures, and Halo 2 transcripts. None of
that vocabulary is reusable if the reader has not pinned down the
underlying notation: which group is which, what a pairing is, why
Pedersen commitments are homomorphic, how BLAKE2 personalisation
turns a hash function into a domain-separated PRF. This chapter is
the calibration step. By the end of it, you should be able to read
the personalisation tag
`b"ZcashTxHash_"` in
[`zcash_primitives/src/transaction/txid.rs#L33-L40`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/txid.rs#L33-L40)
and explain why every BLAKE2b call site needs one.

## 2. Definitions

**Definition 2.1 (prime field).** For a prime $p \in \mathbb{Z}_{>0}$,
$\mathbb{F}_p = \mathbb{Z}/p\mathbb{Z}$ is the finite field of order
$p$, and $\mathbb{F}_p^{*} = \mathbb{F}_p \setminus \{0\}$ is its
multiplicative group of order $p - 1$.

**Definition 2.2 (cyclic group, additive notation).** A cyclic
group $\mathbb{G}$ of prime order $q$ with generator $G$ is a set
of $q$ elements with a binary operation $+$ such that every
$P \in \mathbb{G}$ equals $[k]G$ for a unique
$k \in \mathbb{F}_q$. For $k \in \mathbb{Z}_{\geq 0}$, $[k]G$
denotes the $k$-fold sum
$\underbrace{G + G + \cdots + G}_{k \text{ terms}}$ in
$\mathbb{G}$, with $[0]G = \mathcal{O}$ the identity.

**Definition 2.3 (discrete logarithm problem, DLP).** Given
$\mathbb{G}$ of prime order $q$ with generator $G$, the DLP is the
problem: on input $(G, H) \in \mathbb{G}^2$ with $H = [k]G$ for an
unknown $k \stackrel{\$}{\leftarrow} \mathbb{F}_q$, return $k$. The
DLP assumption states that no probabilistic polynomial-time
algorithm solves DLP with non-negligible advantage. Every group in
this workspace is assumed to satisfy the DLP assumption with at
least 128 bits of security.

**Definition 2.4 (pairing).** Let $\mathbb{G}_1, \mathbb{G}_2,
\mathbb{G}_T$ be cyclic groups of prime order $r$. A pairing is a
map
$e\colon \mathbb{G}_1 \times \mathbb{G}_2 \to \mathbb{G}_T$
such that

1. **Bilinearity.** For all $a, b \in \mathbb{F}_r$,
   $P \in \mathbb{G}_1$, $Q \in \mathbb{G}_2$,
   $e([a]P, [b]Q) = e(P, Q)^{ab}$.
2. **Non-degeneracy.** $e(G_1, G_2) \neq 1_{\mathbb{G}_T}$ for
   generators $G_1 \in \mathbb{G}_1$, $G_2 \in \mathbb{G}_2$.
3. **Efficient computability.** $e$ is computable in
   polynomial time in the bit-length of $r$.

**Definition 2.5 (commitment scheme).** A commitment scheme over a
message space $\mathcal{M}$ and randomness space $\mathcal{R}$ is
an algorithm
$\mathsf{Com}\colon \mathcal{M} \times \mathcal{R} \to \mathcal{C}$
satisfying

1. **Binding.** For every probabilistic polynomial-time
   $\mathcal{A}$, the probability that $\mathcal{A}$ outputs
   $(m_1, r_1, m_2, r_2) \in (\mathcal{M} \times \mathcal{R})^2$
   with $(m_1, r_1) \neq (m_2, r_2)$ and
   $\mathsf{Com}(m_1; r_1) = \mathsf{Com}(m_2; r_2)$ is negligible.
2. **Hiding.** For every $m_1, m_2 \in \mathcal{M}$, the
   distributions
   $\{\mathsf{Com}(m_1; r) : r \stackrel{\$}{\leftarrow}
   \mathcal{R}\}$ and
   $\{\mathsf{Com}(m_2; r) : r \stackrel{\$}{\leftarrow}
   \mathcal{R}\}$ are (computationally or perfectly)
   indistinguishable.

**Definition 2.6 (Pedersen commitment).** Let $\mathbb{G}$ be a
cyclic group of prime order $q$ with generators $G, H \in
\mathbb{G}$ such that $\log_G H \in \mathbb{F}_q$ is unknown to
all parties. For $m \in \mathbb{F}_q$ and
$r \in \mathbb{F}_q$,
$$
\mathsf{Com}(m; r) \;=\; [m]G \;+\; [r]H \;\in\; \mathbb{G}.
$$

**Lemma 2.7 (Pedersen commitment security).** Pedersen commitments
are additively homomorphic, perfectly hiding, and computationally
binding under the DLP assumption in $\mathbb{G}$.

*Proof sketch.* Homomorphism follows from the linearity of scalar
multiplication in $\mathbb{G}$. Perfect hiding: for any $m$, the
distribution of $[m]G + [r]H$ for $r \stackrel{\$}{\leftarrow}
\mathbb{F}_q$ is uniform on $\mathbb{G}$. Binding: a collision
$[m_1]G + [r_1]H = [m_2]G + [r_2]H$ with $(m_1, r_1) \neq
(m_2, r_2)$ yields $\log_G H = (m_1 - m_2)/(r_2 - r_1) \bmod q$,
contradicting DLP. See [Pedersen, CRYPTO 1991].

**Definition 2.8 (pseudo-random function from BLAKE2b).** For a
16-byte personalisation string
$\mathrm{pers}_x \in \{0,1\}^{128}$, a key $k \in \{0,1\}^{*}$,
and an input $m \in \{0,1\}^{*}$, define
$$
\mathsf{PRF}^{x}_{k}(m) \;=\;
\mathsf{BLAKE2b}\bigl(\mathrm{pers}_x;\;
k \mathbin{\|} m\bigr) \;\in\; \{0,1\}^{512}.
$$
This construction is the one implemented by the
[`PrfExpand`](https://docs.rs/zcash_spec/latest/zcash_spec/struct.PrfExpand.html)
helper in the external
[`zcash_spec`](https://github.com/zcash/zcash_spec) crate.

**Definition 2.9 (Fiat-Shamir transform).** Let $\Pi$ be an
interactive public-coin three-move protocol with prover messages
$(a, z)$ and a verifier challenge $c \in \mathcal{C}$ sampled
between them. Let
$H\colon \{0,1\}^{*} \to \mathcal{C}$ be a hash function modelled
as a random oracle. The Fiat-Shamir transform $\Pi'$ replaces $c$
by $c = H(\text{pp} \mathbin{\|} a)$ for public parameters
$\text{pp}$; the resulting non-interactive protocol has soundness
loss bounded by $Q / |\mathcal{C}|$ for adversaries making $Q$
queries to $H$.

**Invariant 2.10 (one personalisation per call site).** For every
BLAKE2b call site in the Zcash workspace, the 16-byte
personalisation string $\mathrm{pers}_x \in \{0,1\}^{128}$ is
unique. The injectivity of the map from call site to
personalisation rules out cross-protocol replay: a string accepted
as a hash output by one call site cannot be repurposed at any
other call site, because the personalisation enters BLAKE2b's
keyed parameter block and thus the input domain of every
invocation is disjoint.

### Threat model summary

The cryptography in this workspace defends against the following
adversary classes. Each row states the formal goal, the workspace
code that enforces it, and the test (if any) that catches a
regression. Rows marked **HEURISTIC** are not backed by a security
reduction; they rest on best-effort engineering.

| Adversary capability | Formal goal | Defence in workspace | Test that catches a regression |
| --- | --- | --- | --- |
| Forge a Sapling Spend without knowing $\mathsf{ask}$ | Knowledge-soundness of Groth16 under q-PKE in BLS12-381 | `zcash_proofs::sapling::SaplingVerificationContext::check_spend` | `zcash_primitives::transaction::tests::tx_read_write` (round-trip) + `sapling-crypto::circuit::spend::tests::valid_proof` |
| Forge an Orchard Action without knowing $\mathsf{ask}$ | Knowledge-soundness of Halo 2 + DLP in Pallas | `orchard::bundle::Bundle::verify_proof` | `orchard::tests::vectors` |
| Double-spend by replaying a nullifier | Nullifier collision-freedom under PRF security of BLAKE2b ($\mathsf{PRF}^{\mathsf{nfSapling}}$) | Nullifier set check in the consumer (not in this workspace; consensus node responsibility) | not enforced here; consumers must |
| Inflate the value pool | Pedersen-binding under DLP in Jubjub / Pallas, plus the binding-signature equation | Binding signature verification on a Sapling/Orchard bundle | `sapling-crypto::bundle::tests::value_balance` |
| IND-CPA against a shielded note's plaintext | IND-CPA of ChaCha20-Poly1305 with per-note ephemeral keys | `zcash_note_encryption::try_note_decryption` | `zcash_note_encryption::tests::test_decryption` |
| Recover a spending key from ciphertext | Authenticated encryption + uniqueness of ephemeral keys | same | same |
| Inject an 8-torsion Jubjub point as a public input | Subgroup-check on every `read_*` deserialiser | `sapling-crypto::primitives::value::read_value_commitment` (and analogous `read_cmu`, `read_rk`) | `sapling-crypto::tests::canonical_encoding` |
| Inject a non-canonical $\mathbb{F}_r$ encoding | Canonical-encoding enforcement via `ff::PrimeField::from_repr` returning `CtOption` | call sites in `zcash_primitives::transaction::components::sapling` | `zcash_primitives::transaction::tests::non_canonical_field_element` |
| Time the prover to learn the witness scalar | Constant-time scalar multiplication in `subtle`-using crates | `bls12_381`, `jubjub`, `pasta_curves` (see chapter 14) | no automated test; relies on crate-level CT discipline |
| Read residual key bytes from freed memory | `zeroize` on Drop for secret types | `SaplingIvk`, `SpendingKey`, etc. all implement `Zeroize` | not unit-tested; verified by audit |
| **HEURISTIC** Replay a tx across network upgrades | Personalisation strings differ per NU; consensus rule | Branch-ID routing in `zcash_protocol::consensus` | `zcash_primitives::transaction::sighash::tests::v5_sighash_branchid` |
| **HEURISTIC** Sapling MPC participant retained toxic waste | $n$-out-of-$n$ ceremony with one honest participant | Out of scope for code; relies on 2018 ceremony | see chapter 15 |
| **HEURISTIC** Timing of vartime APIs leaks Merkle path index | `pow_vartime` and friends documented as vartime | enforced by manual API audit | see chapter 14 §3 |
| Out of scope: side-channel on prover machine | not addressed beyond constant-time crates | n/a | n/a |
| Out of scope: deanonymisation via wallet metadata or network behaviour | see chapter 18 | n/a (out of workspace cryptography) | n/a |

Read this table before reading any specific chapter. A claim like
"Sapling binding signature prevents inflation" is a defended row
above; a claim like "Zcash hides the sender's IP" is **not** in the
table because it is not a cryptographic defence inside this
workspace.

## 3. The code

### 3.1 Groups and fields

Zcash uses several groups. Each row corresponds to one crate.io
dependency declared in
[`Cargo.toml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/Cargo.toml#L52-L78):

| Curve | Field | Order | Used for |
| --- | --- | --- | --- |
| BLS12-381 ($\mathbb{G}_1, \mathbb{G}_2$) | $\mathbb{F}_q$, $q$ 381-bit | $r$, 255-bit | Sapling Groth16 |
| Jubjub | $\mathbb{F}_r$ where $r$ is BLS12-381 scalar field | 252-bit prime | Sapling commitments, key agreement |
| Pallas | $\mathbb{F}_p$, $p \approx 2^{255}$ | $q_{\text{Pallas}}$ | Orchard arithmetic |
| Vesta | $\mathbb{F}_{q_{\text{Pallas}}}$ | $p_{\text{Pallas}}$ | Orchard recursion |
| secp256k1 | Bitcoin curve | 256-bit | Transparent ECDSA |

The Pallas/Vesta pair is a **2-cycle of elliptic curves**: the base
field of one equals the scalar field of the other. This is
essential for efficient recursive proofs (Halo); see chapter 05.

The Jubjub curve has a scalar field equal to BLS12-381's scalar
field, which means scalar arithmetic inside a BLS12-381-based SNARK
is cheap. Sapling uses this for in-circuit elliptic-curve
operations.

Read in code: the workspace
[`Cargo.toml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/Cargo.toml#L52-L78)
pulls `bls12_381`, `jubjub`,
[`pasta_curves`](https://github.com/zcash/pasta_curves), `secp256k1`,
`group`, and `ff` from crates.io:

```toml reference title="Cargo.toml"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/Cargo.toml#L52-L78
```

The Pallas / Vesta type aliases used throughout the Orchard code
live in
[`pasta_curves/src/pallas.rs`](https://github.com/zcash/pasta_curves/blob/main/src/pallas.rs)
and
[`pasta_curves/src/vesta.rs`](https://github.com/zcash/pasta_curves/blob/main/src/vesta.rs).

### 3.2 Pairings and Groth16

BLS12-381 is a pairing-friendly curve: $\mathbb{G}_1, \mathbb{G}_2$
are specific subgroups of elliptic-curve points and
$\mathbb{G}_T \subseteq \mathbb{F}_{q^{12}}^*$.

Sapling proofs are Groth16 SNARKs with a constant-size pairing
check at verification:

$$
e(A, B) \;\stackrel{?}{=}\; e(\alpha G_1, \beta G_2) \cdot
e(C, \gamma G_2) \cdot e(C_{\text{pub}}, \delta G_2).
$$

You do not need to memorise this; what matters is that the
verification is a constant-size pairing equation, and that the
verifying key contains $\alpha G_1, \beta G_2, \gamma G_2, \delta G_2$
and a vector of $\mathbb{G}_1$ points for the public inputs.
`bellman::groth16::Proof` is the type;
[`zcash_proofs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs)
consumes prepared verifying keys produced once and cached.

### 3.3 Hash functions and PRFs

**BLAKE2b / BLAKE2s.** Pervasive in Zcash. Both support a 16-byte
**personalisation** string that acts as domain separation. The
idiomatic Zcash usage is

$$
H_{\text{pers}}(m) \;=\; \mathsf{BLAKE2b}\!\bigl(
\text{key} = \emptyset,\;
\text{personalisation} = \text{pers},\;
m \bigr).
$$

Personalisation tags in this codebase are short ASCII strings such
as `"ZcashTxHash_"`, `"ZTxIdSaplingHash"`, `"Zcash_ExpandSeed"`. The
full list of TxId personalisations lives at the top of `txid.rs`:

```rust reference title="zcash_primitives/src/transaction/txid.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/txid.rs#L33-L67
```

**SHA-256, RIPEMD-160.** Used in the transparent layer for Bitcoin
compatibility:
$\mathsf{Hash160}(x) = \mathsf{RIPEMD160}(\mathsf{SHA256}(x))$ for
P2PKH addresses;
$\mathsf{Hash256}(x) = \mathsf{SHA256}(\mathsf{SHA256}(x))$ for
some legacy contexts. Sprout circuits also use SHA-256, because the
original Zerocash construction did.

**Pedersen and Sinsemilla hashes.** *Algebraic* hash functions
(output is a curve point) optimised for SNARK-friendliness. Defined
and motivated in chapter 04 (Pedersen) and chapter 05 (Sinsemilla).

**`PRF^{expand}`.** The single PRF used pervasively for key
derivation:

$$
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(t) \;=\;
\mathsf{BLAKE2b}\!\bigl(
\text{pers} = \text{"Zcash\_ExpandSeed"},\;
\mathsf{sk} \mathbin{\|} t \bigr),
$$

where $t$ is a tag byte (and sometimes more bytes). Defined once in
[`zcash_spec`](https://github.com/zcash/zcash_spec)
and reused everywhere. Grep `PrfExpand` in the workspace.

### 3.4 Commitments

**Pedersen.** As in Section 2. Properties:

- **Additively homomorphic**:
  $\mathsf{Com}(m_1; r_1) + \mathsf{Com}(m_2; r_2)
   = \mathsf{Com}(m_1 + m_2;\, r_1 + r_2)$.
- **Perfectly hiding** (the randomness completely masks the
  message).
- **Computationally binding** under DLP.

The homomorphism is the mathematical engine behind shielded value
conservation. Chapter 04 shows how it lets a transaction prove
that input value equals output value without revealing the values
themselves.

**Pedersen hash.** Generalise the commitment to many generators
$G_1, \ldots, G_n$:

$$
\mathsf{PedHash}(m_1, \ldots, m_n) \;=\;
\sum_{i=1}^{n} [m_i] G_i.
$$

Collision-resistant under DLP and much cheaper inside a SNARK than
SHA-256 because elliptic-curve arithmetic is the SNARK's native
operation. Sapling's note commitments and Merkle-tree hashes use
Pedersen-hash variants.

**Value commitments.** Sapling uses

$$
\mathsf{VCom}(v, r) \;=\; [v]V \;+\; [r]R
\;\in\; \mathbb{G}_{\text{Jubjub}},
$$

with curve-specific generators $V, R$. The crucial property is

$$
\sum_{i \in \text{in}} \mathsf{VCom}(v_i, r_i)
\;-\;
\sum_{j \in \text{out}} \mathsf{VCom}(v_j, r_j)
\;=\;
[v_{\text{bal}}]V \;+\; [r_{\text{bal}}]R,
$$

the **binding equation**: the prover proves it knows
$r_{\text{bal}}$ relative to a public $v_{\text{bal}}$, completing
the value-conservation proof. This is what the "binding signature"
signs.

### 3.5 Signatures

**ECDSA (secp256k1).** Used for transparent inputs. Standard
Bitcoin signatures; see the
[`secp256k1`](https://docs.rs/secp256k1) crate.

**RedDSA / RedJubjub / RedPallas.** Sapling and Orchard use
RedDSA, a re-randomisable EdDSA-style signature scheme. The
instantiation over Jubjub is RedJubjub (Sapling); over Pallas is
RedPallas (Orchard).

A RedDSA signature key is a pair $(\mathsf{sk}, \mathsf{pk})$ with
$\mathsf{pk} = [\mathsf{sk}]G$. To sign $M$:

1. Sample $r \stackrel{\$}{\leftarrow} \mathbb{F}_q$; compute
   $R = [r]G$.
2. Compute challenge
   $c = H(R \mathbin{\|} \mathsf{pk} \mathbin{\|} M) \in
   \mathbb{F}_q$.
3. Set $s = r + c \cdot \mathsf{sk} \pmod{q}$.
4. The signature is $(R, s)$.

Verification: $[s]G \stackrel{?}{=} R + [c]\mathsf{pk}$.

This is Schnorr-style; what makes it "Red" is the
**re-randomisation**:

$$
\mathsf{rk} \;=\; \mathsf{pk} \;+\; [\alpha]G, \qquad
\mathsf{rsk} \;=\; \mathsf{sk} \;+\; \alpha \pmod{q}.
$$

A signature under $\mathsf{rsk}$ verifies under $\mathsf{rk}$. The
randomiser $\alpha$ is uniform per spend, so $\mathsf{rk}$ is
unlinkable to the underlying $\mathsf{pk}$. Sapling spend
authorisation uses this: the spend description publishes
$\mathsf{rk}$; the spender signs under $\mathsf{rsk}$; a Spend
Authorisation Signature is included in the description.

**Binding signature.** A signature whose verification key is
computed from the value commitments themselves. The combined value
commitment

$$
\sum \mathsf{cv}_{\text{in}}
\;-\; \sum \mathsf{cv}_{\text{out}}
\;-\; [v_{\text{balance}}]V
$$

should equal $[r_{\text{bal}}]R$ for some $r_{\text{bal}}$ known
only to the spender. The spender publishes a signature whose
verification key is exactly that point, using $R$ as the group
generator. Verifying the signature proves the prover knew
$r_{\text{bal}}$; hence values balance.

Read in code:
[`redjubjub`](https://github.com/ZcashFoundation/redjubjub) (used
by Sapling) and
[`reddsa`](https://github.com/ZcashFoundation/reddsa) (Orchard).

### 3.6 Key agreement

In a group of prime order $q$ with generator $G$:

$$
\text{Alice}: \quad a \stackrel{\$}{\leftarrow} \mathbb{F}_q^*,
\quad A = [a]G,
$$

$$
\text{Bob}: \quad b \stackrel{\$}{\leftarrow} \mathbb{F}_q^*,
\quad B = [b]G,
$$

then $[a]B = [b]A = [ab]G$ is the shared secret. Both parties feed
it to a key-derivation function $\mathsf{KDF}$ to get a symmetric
key.

Sapling and Orchard both use ECDH on Jubjub / Pallas for note
encryption (chapter 08), with $G$ being a per-recipient
*diversifier generator* $g_d$ rather than a fixed generator. This
is part of how diversified addresses work.

### 3.7 Symmetric primitives

Note encryption uses **ChaCha20-Poly1305**, an authenticated stream
cipher: $\mathsf{Enc}_k(n, m) \to c$ where $n$ is a 12-byte nonce
and the output includes a 16-byte tag. The Zcash spec uses $n = 0$
always because each key is single-use. The AEAD discipline still
applies: never reuse $(k, n)$; always include associated data;
always check the tag before using the plaintext. The dependency is
declared in
[`zcash_primitives/Cargo.toml`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/Cargo.toml).

### 3.8 Zero-knowledge proofs

Zcash uses two families of NIZK arguments:

- **Groth16** (Sapling, Sprout): preprocessing SNARK, constant
  proof size ($3 \times \mathbb{G}_1 + 1 \times \mathbb{G}_2 \approx
  192$ bytes), constant verification cost (three pairing equations
  collapsed). Requires a per-circuit *trusted setup*, performed in
  a multi-party computation ceremony ("Powers of Tau" plus
  circuit-specific). The proving key is many megabytes; the
  verifying key is a few kilobytes.
- **Halo 2** (Orchard): a PLONK-derived argument with a polynomial
  commitment based on the **Inner Product Argument (IPA)**. No
  per-circuit trusted setup, but uses a *transparent universal
  setup* (a structured reference string that anyone can verify) and
  a custom arithmetisation (custom gates, lookups, permutations)
  tuned for the Pallas/Vesta cycle.

The interface as seen from `librustzcash` is, in both cases:

$$
\mathsf{Prover}(\text{circuit}, \text{public inputs } x,
   \text{witness } w) \to \pi,
$$

$$
\mathsf{Verifier}(\text{vk}, x, \pi) \to \{0, 1\}.
$$

The witness includes secret values such as note values, randomness,
the spending key, and the Merkle path. The public input includes
the anchor, the value commitment, the nullifier, $\mathsf{rk}$, and
the output commitment.

For Sapling the verifying-key hashes are bundled with the binaries
in
[`zcash_proofs/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs):

```rust reference title="zcash_proofs/src/lib.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs#L40-L52
```

The proving keys are downloaded via `download-params`.

### 3.9 Fiat-Shamir and personalisation

Many protocols are stated as interactive: prover sends commitment,
verifier sends challenge, prover sends response. The Fiat-Shamir
transform replaces the verifier's challenge with a hash of the
prover's messages (and prior context), producing a non-interactive
protocol in the random-oracle model. It is everywhere in Zcash:

- The RedDSA challenge $c = H(R \mathbin{\|} \mathsf{pk}
  \mathbin{\|} M)$.
- The IPA challenges inside Halo 2.
- Sighash for transparent inputs (a generalised Fiat-Shamir).

Whenever you see `let chal = blake2b(transcript)`, that is a
Fiat-Shamir challenge.

Personalisations are 16 bytes; if shorter, they are padded with
zero bytes. Examples seen in this codebase:

- `"Zcash_ExpandSeed"`: `PRF^{expand}`.
- `"Zcash_SaplingNf"`: Sapling nullifier PRF.
- `"ZTxIdSaplingHash"`: sighash sub-tree.
- `"Zcash_OrchardMH"`: Orchard Merkle hash.

If you ever add a new hash usage, define a new personalisation.
Reusing an existing one is a bug.

## 4. Failure modes

A contributor who confuses the primitives in this chapter produces
errors that pass unit tests but break interoperability:

- **Field confusion.** Jubjub's scalar field equals BLS12-381's
  scalar field, but its base field does not. Pallas and Vesta swap
  base and scalar. Calling `Fr::from_bytes` on a $\mathbb{F}_p$
  representation looks plausible and compiles, but produces wrong
  curve points downstream.
  > Caught by: `zcash_primitives::transaction::tests::tx_read_write`
  > in `zcash_primitives/src/transaction/tests.rs` (verifies the
  > full v4 transaction round-trip against a fixed txid, which
  > requires every Jubjub/BLS12-381 deserialiser to interpret bytes
  > in the correct field).
- **Endianness drift.** Zcash standardises on little-endian for
  most field serializations, but a handful of legacy
  Bitcoin-derived contexts use big-endian. The ZIPs spell out the
  order. Mixing the two has caused real production bugs across
  multiple wallets.
  > Caught by: `zcash_primitives::transaction::tests::zip_0244`
  > in `zcash_primitives/src/transaction/tests.rs` (matches
  > computed sighash and txid against ZIP 244 test vectors that
  > pin every byte order).
- **Pedersen-window off-by-one.** Each Pedersen window has its own
  generator, derived deterministically from a hash of an index.
  Reusing a generator across windows breaks collision resistance.
  > No automated test in this workspace. The windowed Pedersen
  > generators are defined and tested in the external
  > `sapling-crypto` crate; this workspace consumes them via the
  > Sapling commitment readers. Caught by audit only.
- **Personalisation reuse.** As stated above, every new BLAKE2b
  call site must add a new 16-byte personalisation. Two recent
  changes to the protocol added new sighash sub-trees, each with
  its own tag; do the same.
  > Caught by: `zcash_primitives::transaction::tests::zip_0244`
  > in `zcash_primitives/src/transaction/tests.rs` (the ZIP 244
  > test vectors fix every per-sub-tree personalisation; any reuse
  > changes the resulting digest and the assertion fails).
- **Nonce / randomness reuse.** Every RedDSA signature, every note
  randomness, every diversifier randomness must be sampled
  uniformly and independently. The Sprout counterfeiting CVE
  (chapter 12) is the canonical example of what a flaw at this
  layer can cost.
  > No automated test in this workspace. Randomness sampling is
  > the caller's responsibility; the builder consumes
  > `rand_core::CryptoRng` and the workspace cannot detect
  > non-uniform sources. Caught by audit only.

## 5. Spec pointers

- [Zcash Protocol Specification, sections 5.4 and 5.6](https://zips.z.cash/protocol/protocol.pdf):
  the full table of personalisations and the precise PRF
  constructions used by Sapling and Orchard.
- [ZIP 32](https://zips.z.cash/zip-0032): the
  hierarchical-deterministic key derivation tree that all
  `PRF^{expand}` invocations sit inside.
- [Groth, 2016](https://eprint.iacr.org/2016/260): the original
  Groth16 paper. Read sections 1 and 3 to understand the pairing
  equation cited above.
- [Halo 2 book](https://zcash.github.io/halo2/): the canonical
  reference for the Halo 2 proof system used by Orchard. Chapter
  05 cites specific sections.
- [BLAKE2 RFC 7693](https://www.rfc-editor.org/rfc/rfc7693): the
  authoritative specification for BLAKE2b and BLAKE2s, including
  the personalisation parameter Zcash relies on.

## 6. Exercises

1. **Trace a personalisation.** Search the workspace for the byte
   string `b"Zcash_ExpandSeed"`. List every call site and, for
   each, identify the input `t` it passes.
2. **Verify a Pedersen identity.** In a scratch test, sample
   $m_1, m_2, r_1, r_2$ uniformly, compute
   $c_1 = \mathsf{Com}(m_1; r_1)$ and
   $c_2 = \mathsf{Com}(m_2; r_2)$, and confirm in code that
   $c_1 + c_2 = \mathsf{Com}(m_1 + m_2;\, r_1 + r_2)$ holds in
   `jubjub::SubgroupPoint`. Add it as a unit test under
   `zcash_primitives` (do not commit; this is a scratch exercise).
3. **Add a new BLAKE2b call.** Pretend you need a new BLAKE2b hash
   under the personalisation `"OnboardingPrim "`. Write the
   helper as `fn h_onboarding(input: &[u8]) -> [u8; 32]` in a
   throwaway file. Run `cargo check`. Then delete the helper and
   the file before moving on; the exercise is to convince yourself
   that the personalisation is a 16-byte string parameter you can
   add anywhere, not a magic constant.

### Answers in the code

- `PRF^{expand}` uses:
  [`zcash_spec`](https://github.com/zcash/zcash_spec) (external)
  and grep `PrfExpand` across the workspace.
- TxId personalisations:
  [`zcash_primitives/src/transaction/txid.rs#L33-L67`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/txid.rs#L33-L67).
- Verifying-key hashes for Sapling:
  [`zcash_proofs/src/lib.rs#L40-L52`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs#L40-L52).

## 7. Further reading

- [chapter 16](./16-pedersen-hash-deep-dive.md): the windowed
  encoding for Pedersen hashes, in-circuit cost, generator
  derivation.
- [chapter 17](./17-halo2-deep-dive.md): the polynomial-commitment
  layer underneath Halo 2.
- Boneh, Drijvers, Neven,
  *Compact Multi-Signatures for Smaller Blockchains*, 2018:
  background on Schnorr-style signatures and their re-randomisation
  properties, the foundation of RedDSA.
