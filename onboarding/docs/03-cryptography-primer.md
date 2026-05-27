# 03 - Cryptography primer

## Goal

Calibrate notation and recall the cryptographic primitives used pervasively
in the Zcash codebase. The treatment is dense but not encyclopaedic: if you
have a graduate course in cryptography you can skim, but the Zcash-specific
parameterisations matter and are not always documented elsewhere.

## 1. Groups and fields

Throughout, $p$ is a prime, $\mathbb{F}_p$ the finite field of order $p$,
and $\mathbb{F}_p^*$ its multiplicative group. A cyclic group $\mathbb{G}$
of prime order $q$ written additively has a generator $G$ with
$|\mathbb{G}| = q$. For an integer $k$, $[k]G$ is $G$ added to itself $k$
times.

The **discrete logarithm problem (DLP)** in $\mathbb{G}$: given $G, H \in
\mathbb{G}$ with $H = [k]G$, find $k$. We assume DLP is hard in all
groups used by Zcash.

Zcash uses several groups:

| Curve | Field | Order | Used for |
| --- | --- | --- | --- |
| BLS12-381 ($\mathbb{G}_1, \mathbb{G}_2$) | $\mathbb{F}_q$, $q$ 381-bit | $r$, 255-bit | Sapling Groth16 |
| Jubjub | $\mathbb{F}_r$ where $r$ is BLS12-381 scalar field | 252-bit prime | Sapling commitments, key agreement |
| Pallas | $\mathbb{F}_p$, $p$ $\approx 2^{255}$ | $q$ Pallas | Orchard arithmetic |
| Vesta | $\mathbb{F}_q$ | $p$ Pallas | Orchard recursion |
| secp256k1 | Bitcoin curve | 256-bit | Transparent ECDSA |

The Pallas/Vesta pair is a **2-cycle of elliptic curves**: the base field
of one equals the scalar field of the other. This is essential for
efficient recursive proofs (Halo); see chapter 05.

The Jubjub curve has scalar field equal to BLS12-381's scalar field, which
means scalar arithmetic inside a BLS12-381-based SNARK is cheap. Sapling
uses this for in-circuit elliptic-curve operations.

Read in code: the workspace `Cargo.toml` pulls `bls12_381`, `jubjub`,
[`pasta_curves`](https://github.com/zcash/pasta_curves), `secp256k1`,
`group`, `ff` from crates.io. The Pallas / Vesta type aliases used
throughout the Orchard code live in
[`pasta_curves/src/pallas.rs`](https://github.com/zcash/pasta_curves/blob/main/src/pallas.rs)
and
[`pasta_curves/src/vesta.rs`](https://github.com/zcash/pasta_curves/blob/main/src/vesta.rs).

## 2. Pairings

A pairing is a non-degenerate bilinear map

$$
e \colon \mathbb{G}_1 \times \mathbb{G}_2 \;\longrightarrow\; \mathbb{G}_T
$$

between three groups of prime order $r$ such that for all $a, b \in
\mathbb{F}_r$ and $P \in \mathbb{G}_1$, $Q \in \mathbb{G}_2$:

$$
e([a]P, [b]Q) \;=\; e(P, Q)^{a b}.
$$

BLS12-381 is a pairing-friendly curve: $\mathbb{G}_1, \mathbb{G}_2$ are
specific subgroups of elliptic-curve points, $\mathbb{G}_T \subseteq
\mathbb{F}_{q^{12}}^*$.

Sapling proofs are Groth16 SNARKs which use one pairing check at
verification time:

$$
e(A, B) \stackrel{?}{=} e(\alpha G_1, \beta G_2) \cdot e(C, \gamma G_2)
\cdot e(C_{\text{pub}}, \delta G_2).
$$

You do not need to memorise this; what matters is that the verification is
a constant-size pairing equation, and that the verifying key contains
$\alpha G_1, \beta G_2, \gamma G_2, \delta G_2$ and a vector of
$\mathbb{G}_1$ points for the public inputs.

`bellman::groth16::Proof` is the type. `zcash_proofs` consumes prepared
verifying keys produced once and cached.

## 3. Hash functions and PRFs

### BLAKE2

`BLAKE2b` (64-byte digest) and `BLAKE2s` (32-byte digest) are pervasive in
Zcash. Both support a 16-byte **personalisation** string that acts as
domain separation. Idiomatic Zcash usage:

$$
H_{\text{pers}}(m) \;=\; \mathsf{BLAKE2b}\!\bigl(
    \text{key} = \emptyset, \text{personalisation} = \text{pers}, m
\bigr).
$$

Personalisation tags in this codebase are short ASCII strings such as
`"ZcashTxHash_"`, `"ZTxIdSaplingHash"`, `"Zcash_ExpandSeed"`. Grep for them.

### SHA-256, RIPEMD-160

Used in the transparent layer for Bitcoin compatibility:
$\mathsf{Hash160}(x) = \mathsf{RIPEMD160}(\mathsf{SHA256}(x))$ for P2PKH
addresses; $\mathsf{Hash256}(x) = \mathsf{SHA256}(\mathsf{SHA256}(x))$ for
some legacy contexts. Sprout circuits also use SHA-256 because the
original Zerocash construction did.

### Pedersen and Sinsemilla hashes

These are *algebraic* hash functions (output is a curve point) optimised
for SNARK-friendliness. Defined and motivated in chapters 04 (Pedersen)
and 05 (Sinsemilla).

### PRFs derived from BLAKE2

Sapling defines a family $\mathsf{PRF}^{x}_{k}(m)$ where $x$ is a
distinguishing tag and $k$ is a key. The construction is uniform:

$$
\mathsf{PRF}^{x}_{k}(m)
\;=\;
\mathsf{BLAKE2b}\!\bigl(
    \text{personalisation} = \text{pers}_x,\;
    k \mathbin{\|} m
\bigr),
$$

with personalisations such as $\text{pers}_{\text{nf}} =
\text{"Zcash\_SaplingNf"}$, $\text{pers}_{\text{ock}} =
\text{"Zcash\_Derive\_ock"}$, etc. The set of personalisations used by
Sapling/Orchard is enumerated in the protocol specification section 5.4.

### `PRF^{expand}`

A specific PRF used pervasively for key derivation:

$$
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(t)
\;=\;
\mathsf{BLAKE2b}\!\bigl(
    \text{pers} = \text{"Zcash\_ExpandSeed"},
    \mathsf{sk} \mathbin{\|} t
\bigr),
$$

where $t$ is a tag byte (and sometimes more bytes). This is defined
once in `zcash_spec` and reused everywhere. Grep `PrfExpand` in the
workspace.

## 4. Commitment schemes

A **commitment scheme** $\mathsf{Com}(m; r)$ takes a message $m$ and
randomness $r$ and produces a commitment $c$. It is:

- *Binding*: hard to find $(m_1, r_1) \neq (m_2, r_2)$ with
  $\mathsf{Com}(m_1; r_1) = \mathsf{Com}(m_2; r_2)$.
- *Hiding*: $c$ reveals nothing computational about $m$.

### Pedersen commitment

In a group $\mathbb{G}$ of prime order $q$ with two generators $G, H$
where the discrete log of $H$ relative to $G$ is unknown:

$$
\mathsf{Com}(m; r) \;=\; [m] G \;+\; [r] H \;\in\; \mathbb{G}.
$$

Properties:

- **Additively homomorphic**:
  $\mathsf{Com}(m_1; r_1) + \mathsf{Com}(m_2; r_2)
   = \mathsf{Com}(m_1 + m_2; r_1 + r_2)$.
- **Perfectly hiding** (the randomness completely masks the message).
- **Computationally binding** under DLP.

The homomorphism is the mathematical engine behind shielded value
conservation. See chapter 04 for how this is used to prove that input
value equals output value without revealing the values themselves.

### Pedersen hash

Generalise the commitment to many generators
$G_1, \ldots, G_n$:

$$
\mathsf{PedHash}(m_1, \ldots, m_n) \;=\; \sum_{i=1}^{n} [m_i] G_i.
$$

This is collision-resistant under DLP and is much cheaper inside a SNARK
than SHA-256 because elliptic-curve arithmetic is the SNARK's native
operation. Sapling's note commitments and Merkle tree hashes use
Pedersen-hash variants.

### Homomorphic Pedersen commitments to integers

For value commitments, Sapling uses

$$
\mathsf{VCom}(v, r) \;=\; [v] V \;+\; [r] R \;\in\; \mathbb{G}_{\text{Jubjub}},
$$

with curve-specific generators $V, R$. The crucial property is

$$
\sum_{i \in \text{in}} \mathsf{VCom}(v_i, r_i)
\;-\;
\sum_{j \in \text{out}} \mathsf{VCom}(v_j, r_j)
\;=\;
[v_{\text{bal}}]V \;+\; [r_{\text{bal}}]R,
$$

which is the **binding equation**: the prover proves it knows $r_{\text{bal}}$
relative to a public $v_{\text{bal}}$, completing the value-conservation
proof. This is what the "binding signature" signs.

## 5. Digital signatures

Zcash uses three signature schemes.

### ECDSA (secp256k1)

Used for transparent inputs. Standard Bitcoin signatures. We do not say
more here; see `secp256k1` crate documentation.

### RedDSA / RedJubjub / RedPallas

Sapling and Orchard use **RedDSA**, a re-randomisable EdDSA-style
signature scheme. The instantiation over Jubjub is RedJubjub (Sapling);
over Pallas is RedPallas (Orchard).

A RedDSA signature key is a pair $(\mathsf{sk}, \mathsf{pk})$ where
$\mathsf{pk} = [\mathsf{sk}] G$. To sign message $M$:

1. Sample $r \stackrel{\$}{\leftarrow} \mathbb{F}_q$, compute $R = [r]G$.
2. Compute challenge $c = H(R \| \mathsf{pk} \| M) \in \mathbb{F}_q$.
3. Set $s = r + c \cdot \mathsf{sk} \mod q$.
4. The signature is $(R, s)$.

Verification: $[s]G \stackrel{?}{=} R + [c]\mathsf{pk}$.

This is a Schnorr-style scheme; what makes it "Red" is the **re-randomisation**:

$$
\mathsf{rk} \;=\; \mathsf{pk} \;+\; [\alpha] G, \qquad
\mathsf{rsk} \;=\; \mathsf{sk} \;+\; \alpha \pmod{q}.
$$

A signature under $\mathsf{rsk}$ verifies under $\mathsf{rk}$. The randomiser
$\alpha$ is uniform per spend, which means $\mathsf{rk}$ is unlinkable to
the underlying $\mathsf{pk}$. Sapling spend authorisation uses this: the
spend description publishes $\mathsf{rk}$, the spender signs under
$\mathsf{rsk}$, and a Spend Authorisation Signature
$\mathsf{spendAuthSig}_{\mathsf{rsk}}(M)$ is included in the description.

### Binding signature

A signature whose verification key is computed *from* the value
commitments themselves. The combined value commitment
$\sum \mathsf{cv}_{\text{in}} - \sum \mathsf{cv}_{\text{out}} -
[v_{\text{balance}}]V$ should equal $[r_{\text{bal}}]R$ for some
$r_{\text{bal}}$ known only to the spender. The spender publishes a
signature whose verification key is exactly that point, using $R$ as the
group generator. Verifying the signature proves the prover knew
$r_{\text{bal}}$, hence the values balance.

Read in code: `redjubjub` crate (used by Sapling), `reddsa` (Orchard).

## 6. Key agreement (Diffie-Hellman)

In a group of prime order $q$ with generator $G$:

$$
\text{Alice}: \quad a \stackrel{\$}{\leftarrow} \mathbb{F}_q^*,
\quad A = [a]G,
$$

$$
\text{Bob}: \quad b \stackrel{\$}{\leftarrow} \mathbb{F}_q^*,
\quad B = [b]G,
$$

then $[a]B = [b]A = [ab]G$ is the shared secret. Both parties feed it to
a key-derivation function $\mathsf{KDF}$ to get a symmetric key.

Sapling and Orchard both use ECDH on Jubjub / Pallas for the note
encryption (chapter 08), with $G$ being a per-recipient *diversifier
generator* $g_d$ rather than a fixed generator, which is part of how
diversified addresses work.

## 7. Symmetric primitives

Note encryption uses **ChaCha20-Poly1305**, an authenticated stream
cipher: $\mathsf{Enc}_k(n, m) \to c$ where $n$ is a 12-byte nonce and the
output includes a 16-byte tag. Always remember the AEAD discipline:
*never* reuse $(k, n)$, always include associated data, always check the
tag before using the plaintext. The Zcash spec uses $n = 0$ always
because each key is single-use.

## 8. Zero-knowledge proofs

This is the heart of Zcash. The protocol uses two families of NIZK
arguments:

- **Groth16** (Sapling, Sprout): preprocessing SNARK, constant proof
  size ($3 \times \mathbb{G}_1$ + $1 \times \mathbb{G}_2 \approx 192$
  bytes), constant verification cost (three pairing equations
  collapsed). Requires a **trusted setup** per circuit, which Sapling
  performed in a multi-party computation ceremony ("Powers of Tau"
  + circuit-specific). The proving key is many megabytes; the
  verifying key is a few kilobytes.

- **Halo 2** (Orchard): a PLONK-derived argument with a polynomial
  commitment based on the **Inner Product Argument (IPA)**. No
  per-circuit trusted setup, but uses a **transparent universal setup**
  (a "structured reference string" that anyone can verify) and a custom
  arithmetisation (custom gates, lookups, permutations) tuned for the
  Pallas/Vesta cycle.

The interface as seen from `librustzcash` is, in both cases:

$$
\mathsf{Prover}(\text{circuit}, \text{public inputs } x, \text{witness } w) \to \pi,
$$

$$
\mathsf{Verifier}(\text{vk}, x, \pi) \to \{0, 1\}.
$$

The witness includes secret values such as note values, randomness, the
spending key, and the Merkle path. The public input includes the anchor,
the value commitment, the nullifier, $\mathsf{rk}$, and the output
commitment.

For Sapling the verifying keys are bundled with the binaries (see
`zcash_proofs/src/lib.rs` constants `SAPLING_SPEND_VK_HASH`,
`SAPLING_OUTPUT_VK_HASH`); the proving keys are downloaded via
`download-params`.

## 9. The Fiat-Shamir transform

Many protocols are stated as interactive: prover sends commitment,
verifier sends challenge, prover sends response. The Fiat-Shamir
transform replaces the verifier's challenge with a hash of the prover's
messages (and any prior context), producing a non-interactive protocol
in the random-oracle model. It is everywhere in Zcash:

- The RedDSA challenge $c = H(R \| \mathsf{pk} \| M)$.
- The IPA challenges inside Halo 2.
- Sighash for transparent inputs (a generalised Fiat-Shamir).

Whenever you see `let chal = blake2b(transcript)`, that is a Fiat-Shamir
challenge.

## 10. Domain separation by personalisation

Every hash invocation in Zcash uses a unique personalisation string. The
reason: prevent cross-protocol replays. If two protocols use the same
BLAKE2b on similar inputs and one accepts a value as a hash output, the
attacker should not be able to repurpose that value in the other.

Personalisations are 16 bytes; if shorter, they are padded with zero
bytes. Examples seen in this codebase:

- `"Zcash_ExpandSeed"` - `PRF^expand`.
- `"Zcash_SaplingNf"` - Sapling nullifier PRF.
- `"ZTxIdSaplingHash"` - sighash sub-tree.
- `"Zcash_OrchardMH"` - Orchard Merkle hash.

If you ever add a new hash usage, define a new personalisation. Reusing
an existing one is a bug.

## 11. Common pitfalls

- Mixing up $\mathbb{F}_p$ and $\mathbb{F}_q$: Jubjub's scalar field
  equals BLS12-381's scalar field, but its base field does not. Pallas
  and Vesta swap base and scalar.
- Off-by-one in Pedersen-hash domain separation: each window has its
  own generator, derived deterministically from a hash of an index.
- Mishandling little-endian versus big-endian when serialising field
  elements: Zcash standardises on little-endian for most field
  serializations; ZIPs spell out the order.
- Reusing nonces or randomness: every RedDSA signature, every note
  randomness, every diversifier randomness must be uniform and
  independent.

## What you should know after this chapter

- Notation for groups, pairings, commitments, signatures.
- Why Pedersen commitments matter for value conservation.
- What re-randomisation buys (unlinkability of spend keys).
- What Groth16 and Halo 2 are at a black-box level.
- The role of personalisation strings.

You are now equipped to read the Sapling and Orchard chapters.
