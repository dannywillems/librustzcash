# 23 - The complete key catalog

## Goal

A single chapter where every keying material symbol in Zcash is
defined, typed, derived, and cross-referenced. Earlier chapters
introduced these symbols as they appeared in context; here they are
collected as an authoritative reference. When the rest of this
course (or the protocol spec) uses a symbol you have forgotten, look
it up here.

The chapter is organised by pool. Within each pool, keys are listed
in derivation order: spending key first, then derived material,
then per-transaction ephemerals.

## 0. Notation conventions

- $\mathbb{F}_q$ denotes a prime field of order $q$. We use $\ell_J$
  for the Jubjub subgroup order, $r$ for the BLS12-381 scalar field
  (which equals the Jubjub base field), $q_P$ for the Pallas scalar
  field, $p_P$ for the Pallas base field.
- $G$ with a superscript ($G^{\mathsf{ak}}$, etc.) denotes a fixed
  generator of the relevant prime-order subgroup, derived
  deterministically from a personalisation string.
- $[x]P$ means scalar multiplication.
- $\mathsf{repr}_T(\cdot)$ means "canonical encoding into $T$" (e.g.
  $\mathsf{repr}_{\mathbb{F}_r}$ of a Jubjub point's $u$-coordinate).
- $\mathsf{ToScalar}(s)$ for a 64-byte string $s$ means: interpret
  as little-endian integer, reduce modulo the relevant scalar field
  order.
- $\mathsf{ToBase}(s)$: analogous but modulo the base field order.
- $\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(t) \;=\;
  \mathsf{BLAKE2b\text{-}512}(\text{pers}=\text{"Zcash\_ExpandSeed"},
  \mathsf{sk} \,\|\, t)$.

For each key, the entry records:

- **Symbol** and short name.
- **Type**: field element / curve point / byte string.
- **Domain**: which field or group.
- **Derivation**.
- **Role**: who knows it and what it enables.
- **Code**: where the type lives in this workspace.

## 1. Sprout (legacy, brief)

Sprout is closed for new outputs but historical notes still exist.
For completeness:

| Symbol | Type | Derivation | Role |
| --- | --- | --- | --- |
| $a_{\mathsf{sk}}$ | $\{0,1\}^{252}$ | uniform | Sprout spending key |
| $a_{\mathsf{pk}}$ | $\{0,1\}^{256}$ | $\mathsf{PRF}^{\mathsf{addr}}_{a_{\mathsf{sk}}}(0)$ | Sprout paying key (public) |
| $\mathsf{sk}_{\text{enc}}$ | $\{0,1\}^{256}$ | $\mathsf{PRF}^{\mathsf{addr}}_{a_{\mathsf{sk}}}(1)$ derived | Curve25519 secret for in-band encryption |
| $\mathsf{pk}_{\text{enc}}$ | Curve25519 point | $[\mathsf{sk}_{\text{enc}}]G_{C25519}$ | Curve25519 public, part of the address |
| $\rho$ | $\{0,1\}^{256}$ | per-note unique | Nullifier seed in note |
| $r$ (Sprout) | $\{0,1\}^{256}$ | per-note random | Commitment randomness |
| $\phi$ | $\{0,1\}^{252}$ | per-JoinSplit random | Used to derive new $\rho$'s |
| $h_{\mathsf{sig}}$ | $\{0,1\}^{256}$ | hash of tx context + JoinSplit pubkey | Binds JoinSplit to the signature |

Nullifier: $\mathsf{nf} = \mathsf{PRF}^{\mathsf{nf}}_{a_{\mathsf{sk}}}(\rho)$.

Sprout PRFs are SHA-256 with 4-bit tag prefixes; the exact tags are
in protocol spec section 5.4.2.

`zcash_proofs/src/circuit/sprout/` is the home of the Sprout circuit;
key material flows through there.

## 2. Sapling - the full catalog

### Root spending key

| Symbol | $\mathsf{sk}$ |
| --- | --- |
| Type | 32-byte string |
| Domain | $\{0,1\}^{256}$ |
| Derivation | ZIP 32 hardened path from seed (typically $m / 32' / 133' / \text{acct}'$) |
| Role | Holder can do everything: spend, view, derive |
| Code | `sapling-crypto::keys::SpendingKey` |

Sometimes called the "expanded spending key" or, with a chain code,
the "extended spending key" (see ZIP 32, Extended).

### Spend authorisation private key

$$
\mathsf{ask} \;=\; \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(\,0\text{x}00\,)\bigr).
$$

| Symbol | $\mathsf{ask}$ |
| --- | --- |
| Type | scalar |
| Domain | $\mathbb{F}_{\ell_J}$ |
| Role | Signs Sapling spend-auth signatures (after re-randomisation) |
| Code | `sapling-crypto::keys::ExpandedSpendingKey::ask` |

### Nullifier private key

$$
\mathsf{nsk} \;=\; \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(\,0\text{x}01\,)\bigr).
$$

| Symbol | $\mathsf{nsk}$ |
| --- | --- |
| Type | scalar |
| Domain | $\mathbb{F}_{\ell_J}$ |
| Role | Used (inside the circuit) to derive $\mathsf{nk}$ and the nullifier |
| Code | `sapling-crypto::keys::ExpandedSpendingKey::nsk` |

### Outgoing viewing key

$$
\mathsf{ovk} \;=\; \mathsf{truncate}_{32}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(\,0\text{x}02\,)\bigr).
$$

| Symbol | $\mathsf{ovk}$ |
| --- | --- |
| Type | 32-byte string |
| Domain | $\{0,1\}^{256}$ |
| Role | Decrypts outputs *sent by* the holder (via $C^{\text{out}}$) |
| Code | `sapling-crypto::keys::ExpandedSpendingKey::ovk` |

The truncation is the first 32 bytes of the 64-byte BLAKE2b output.

### Diversifier key

$$
\mathsf{dk} \;=\; \mathsf{truncate}_{32}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(\,0\text{x}10\,)\bigr).
$$

| Symbol | $\mathsf{dk}$ |
| --- | --- |
| Type | 32-byte AES-128/256 key (used as key for FF1) |
| Role | Enumerates this account's diversifiers via FF1 format-preserving encryption |
| Code | `sapling-crypto::zip32::DiversifierKey` |

### Spend authorisation public key

$$
\mathsf{ak} \;=\; [\mathsf{ask}]\,G^{\mathsf{ak}}_{\text{Sap}},
$$

with $G^{\mathsf{ak}}_{\text{Sap}}$ a fixed Jubjub generator
(`SpendAuthSig.BasePoint`), in the prime-order subgroup.

| Symbol | $\mathsf{ak}$ |
| --- | --- |
| Type | curve point |
| Domain | $E^{\circ}_{\text{Jubjub}}$ |
| Role | Public spend authorisation key; published (after re-randomisation) as $\mathsf{rk}$ |
| Code | `sapling-crypto::keys::ProofGenerationKey::ak` |

### Nullifier deriving key

$$
\mathsf{nk} \;=\; [\mathsf{nsk}]\,G^{\mathsf{nk}}_{\text{Sap}},
$$

with $G^{\mathsf{nk}}_{\text{Sap}}$ a fixed Jubjub generator
(`ProvingPublicKey.BasePoint`), in the prime-order subgroup.

| Symbol | $\mathsf{nk}$ |
| --- | --- |
| Type | curve point |
| Domain | $E^{\circ}_{\text{Jubjub}}$ |
| Role | Used as key for the nullifier PRF; part of the full viewing key |
| Code | `sapling-crypto::keys::ProofGenerationKey::nk` |

### Incoming viewing key

$$
\mathsf{ivk} \;=\;
\bigl[\mathsf{BLAKE2s\text{-}256}\!\bigl(\text{pers}=\text{"Zcashivk"},
\mathsf{repr}_{\mathbb{F}_r}(\mathsf{ak}) \,\|\, \mathsf{repr}_{\mathbb{F}_r}(\mathsf{nk})\bigr)\bigr]
\bmod \ell_J,
$$

extracting the $u$-coordinate of each point as the 255-bit
little-endian field-element encoding; the top bit is cleared before
reducing mod $\ell_J$ to ensure uniform reduction.

| Symbol | $\mathsf{ivk}$ |
| --- | --- |
| Type | scalar |
| Domain | $\mathbb{F}_{\ell_J}$ |
| Role | Decrypts outputs received by this account |
| Code | `sapling-crypto::keys::SaplingIvk` |

### Full viewing key

$$
\mathsf{fvk} \;=\; (\mathsf{ak}, \mathsf{nk}, \mathsf{ovk}).
$$

Equivalent representation (with diversifier key included as in ZIP
316):
$\mathsf{efvk} = (\mathsf{ak}, \mathsf{nk}, \mathsf{ovk}, \mathsf{dk})$.

The full viewing key can:

- Compute $\mathsf{ivk}$ (and decrypt incoming notes).
- Decrypt outgoing notes via $\mathsf{ovk}$.
- Enumerate diversified addresses via $\mathsf{dk}$.

It cannot:

- Spend (no $\mathsf{ask}$).
- Authorise (no $\mathsf{ask}$).

| Code | `sapling-crypto::keys::FullViewingKey` |

### Proof generation key

$$
\mathsf{pgk} \;=\; (\mathsf{ak}, \mathsf{nsk}).
$$

This is the *witness* the prover supplies for the Sapling Spend
circuit: the public $\mathsf{ak}$ and the private $\mathsf{nsk}$. A
hardware-wallet flow that wants someone else to compute the proof
hands this pair plus the per-spend $\alpha$ to the prover, *without*
sending $\mathsf{ask}$ (which is needed only for signing).

| Code | `sapling-crypto::keys::ProofGenerationKey` |

### Diversifier

$$
d \;=\; \mathsf{FF1\text{-}AES}_{\mathsf{dk}}(\mathsf{Encode}(i)) \in \{0,1\}^{88},
$$

for index $i \in [0, 2^{88})$. Eleven bytes.

Not every $d$ produces a valid Jubjub generator (chance ~ 1/2 per
$d$); invalid ones are skipped.

| Code | `sapling-crypto::keys::Diversifier`, `DiversifierIndex` |

### Diversified base

$$
g_d \;=\; \mathsf{DiversifyHash}(d),
$$

where $\mathsf{DiversifyHash}$ is a try-and-increment hash-to-curve
into $E^{\circ}_{\text{Jubjub}}$ using BLAKE2s with personalisation
`"Zcash_gd"`. The output is multiplied by the cofactor (8) to land
in the prime-order subgroup.

| Symbol | $g_d$ |
| --- | --- |
| Type | curve point |
| Domain | $E^{\circ}_{\text{Jubjub}}$ |

### Diversified transmission key

$$
\mathsf{pk}_d \;=\; [\mathsf{ivk}]\,g_d.
$$

| Symbol | $\mathsf{pk}_d$ |
| --- | --- |
| Type | curve point |
| Domain | $E^{\circ}_{\text{Jubjub}}$ |
| Role | The "public key" tied to a specific diversifier; combined with $d$ to form a payment address |

### Sapling payment address

$$
\mathsf{addr}_{\text{Sap}} = (d, \mathsf{pk}_d),
$$

encoded as $11 + 32 = 43$ bytes, then bech32 with HRP `zs`
(mainnet) or `ztestsapling` (testnet).

### Note plaintext

A Sapling note is

$$
\mathsf{note} = (g_d, \mathsf{pk}_d, v, \mathsf{rseed}),
$$

where $\mathsf{rseed}$ is a 32-byte seed (post-ZIP 212) from which
$\mathsf{rcm}$ and $\mathsf{esk}$ are derived. Pre-Canopy notes used
$\mathsf{rcm}$ directly.

### Commitment randomness

Post-ZIP 212:

$$
\mathsf{rcm} \;=\; \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{rseed}}(\,0\text{x}04\,)\bigr).
$$

| Symbol | $\mathsf{rcm}$ |
| --- | --- |
| Type | scalar |
| Domain | $\mathbb{F}_{\ell_J}$ |
| Role | Hides the note in $\mathsf{NoteCommit}$ |

### Ephemeral secret key (note encryption)

Post-ZIP 212:

$$
\mathsf{esk} \;=\; \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{rseed}}(\,0\text{x}05\,)\bigr).
$$

| Symbol | $\mathsf{esk}$ |
| --- | --- |
| Type | scalar |
| Domain | $\mathbb{F}_{\ell_J}$ |
| Role | Sender's secret for ECDH note encryption |
| Code | local to builder; not part of any persisted key type |

### Ephemeral public key

$$
\mathsf{epk} \;=\; [\mathsf{esk}]\,g_d.
$$

Published in the OutputDescription / Action.

| Type | curve point in $E^{\circ}_{\text{Jubjub}}$ |

### Note commitment

$$
\mathsf{cm} \;=\;
\mathsf{NoteCommit}^{\mathsf{rcm}}(g_d, \mathsf{pk}_d, v)
\;=\;
\mathsf{PedersenHash}_{D_{\text{nc}}}\!\bigl(
   1011 \,\|\, v_{\text{LE},64} \,\|\,
   \mathsf{repr}_{\mathbb{F}_r}(g_d) \,\|\,
   \mathsf{repr}_{\mathbb{F}_r}(\mathsf{pk}_d)
\bigr) \;+\; [\mathsf{rcm}]\,R_{\text{nc}}.
$$

Then $\mathsf{cm}^u = \mathsf{extract}(\mathsf{cm})$ is what is
published.

| Code | `sapling-crypto::primitives::NoteCommitment` |

### Value commitment randomness

$\mathsf{rcv} \in \mathbb{F}_{\ell_J}$, uniform per spend/output.

### Value commitment

$$
\mathsf{cv} \;=\; [v]\,V_{\text{Sap}} \;+\; [\mathsf{rcv}]\,R_{\text{Sap}},
$$

with $V_{\text{Sap}}, R_{\text{Sap}}$ fixed Jubjub generators
(`ValueCommitValueBase`, `ValueCommitRandomnessBase`).

| Symbol | $\mathsf{cv}$ |
| --- | --- |
| Type | curve point in $E^{\circ}_{\text{Jubjub}}$ |

### Position and $\rho$

For a Sapling note at position $\mathsf{pos}$ in the commitment tree:

$$
\rho \;=\; \mathsf{MixingPedersenHash}(\mathsf{cm}, \mathsf{pos})
\;=\; \mathsf{cm} \;+\; [\mathsf{pos}]\,G_\rho.
$$

| Type | curve point in $E^{\circ}_{\text{Jubjub}}$ |

### Nullifier

$$
\mathsf{nf} \;=\;
\mathsf{PRF}^{\mathsf{nfSapling}}_{\mathsf{nk}}(\rho)
\;=\;
\mathsf{BLAKE2s\text{-}256}\!\bigl(\text{pers}=\text{"Zcash\_nf"},
\mathsf{repr}_{\mathbb{F}_r}(\mathsf{nk}) \,\|\, \mathsf{repr}_{\mathbb{F}_r}(\rho)\bigr).
$$

Published in the SpendDescription.

### Re-randomisation scalar and re-randomised keys

$\alpha \in \mathbb{F}_{\ell_J}$, uniform per spend.

$$
\mathsf{rsk} \;=\; \mathsf{ask} \;+\; \alpha \pmod{\ell_J}, \qquad
\mathsf{rk} \;=\; \mathsf{ak} \;+\; [\alpha]\,G^{\mathsf{ak}}_{\text{Sap}}.
$$

$\mathsf{rsk}$ stays private; $\mathsf{rk}$ is published.

| Code | `sapling-crypto::value`, `sapling-crypto::spend_description` |

### Spend authorisation signature

A RedJubjub signature under $\mathsf{rsk}$ over the sighash:

$$
\sigma_{\text{spendAuth}} \;=\; \mathsf{RedJubjub.Sign}_{\mathsf{rsk}}(\mathsf{sighash}).
$$

Verified under $\mathsf{rk}$.

### Outgoing cipher key

$$
\mathsf{ock} \;=\;
\mathsf{BLAKE2b\text{-}256}\!\bigl(\text{pers}=\text{"Zcash\_Derive\_ock"},
\mathsf{ovk} \,\|\, \mathsf{repr}(\mathsf{cv}) \,\|\,
\mathsf{repr}(\mathsf{cm}^u) \,\|\, \mathsf{repr}(\mathsf{epk})\bigr).
$$

| Symbol | $\mathsf{ock}$ (also $K_{\text{out}}$ in chapter 08) |
| --- | --- |
| Type | 32-byte symmetric key |
| Role | AEAD key for $C^{\text{out}}$, used to recover $(\mathsf{pk}_d, \mathsf{esk})$ from $\mathsf{ovk}$ |

### Note encryption key

$$
K_{\text{enc}} \;=\;
\mathsf{BLAKE2b\text{-}256}\!\bigl(\text{pers}=\text{"Zcash\_SaplingKDF"},
\mathsf{repr}(\mathsf{shared}) \,\|\, \mathsf{repr}(\mathsf{epk})\bigr),
$$

where $\mathsf{shared} = [\mathsf{esk}]\,\mathsf{pk}_d = [\mathsf{ivk}]\,\mathsf{epk}$.

| Type | 32-byte AEAD key |
| Role | Encrypts the note plaintext to the recipient |

### Binding signature secret and verification keys

$$
\mathsf{bsk} \;=\;
\sum_{i \in \text{in}} \mathsf{rcv}_i \;-\; \sum_{j \in \text{out}} \mathsf{rcv}_j \pmod{\ell_J},
$$

$$
\mathsf{bvk} \;=\;
\sum_{i \in \text{in}} \mathsf{cv}_i^{\text{in}} \;-\; \sum_{j \in \text{out}} \mathsf{cv}_j^{\text{out}}
\;-\; [v_{\text{balance}}^{\text{Sap}}]\,V_{\text{Sap}}.
$$

If everything balances, $\mathsf{bvk} = [\mathsf{bsk}]\,R_{\text{Sap}}$,
i.e. $\mathsf{bsk}$ is the discrete log of $\mathsf{bvk}$ w.r.t.
$R_{\text{Sap}}$. The spender holds $\mathsf{bsk}$ and signs the
sighash under it; verifiers reconstruct $\mathsf{bvk}$ from public
data and check.

| Code | `sapling-crypto::bundle::Bundle::binding_signature` |

### Internal vs external addresses

ZIP 316 introduces an "internal" full-viewing-key tree for change
addresses, distinct from the user-facing external addresses. The
internal sub-tree has its own $\mathsf{ovk}$, $\mathsf{dk}$, and
diversifier index space. The motivation: an external party that
sees change outputs cannot link them to user-visible addresses.

The internal keys derive from the external ones via further
hardened ZIP-32 children with index $1$.

## 3. Orchard - the full catalog

Structurally parallel to Sapling but over Pallas with several
simplifications.

### Root spending key

| Symbol | $\mathsf{sk}_{\text{O}}$ |
| --- | --- |
| Type | 32-byte string |
| Code | `orchard::keys::SpendingKey` |

### Spend authorisation private key

$$
\mathsf{ask} \;=\; \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{O}}}(\,0\text{x}06\,)\bigr) \in \mathbb{F}_{q_P}.
$$

### Nullifier deriving key

$$
\mathsf{nk} \;=\; \mathsf{ToBase}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{O}}}(\,0\text{x}07\,)\bigr) \in \mathbb{F}_{p_P}.
$$

**Important**: unlike Sapling, Orchard's $\mathsf{nk}$ is a **field
element**, not a curve point. This is a key Orchard simplification:
the nullifier PRF feeds $\mathsf{nk}$ directly into a Poseidon hash
inside the circuit, avoiding the cost of decoding a point.

### Randomiser for ivk commitment

$$
\mathsf{rivk} \;=\; \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{O}}}(\,0\text{x}08\,)\bigr) \in \mathbb{F}_{q_P}.
$$

Used as the randomness in the Sinsemilla-based $\mathsf{CommitIvk}$.

### Outgoing viewing key and diversifier key

$$
\mathsf{ovk} \,\|\, \mathsf{dk}
\;=\; \mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{O}}}(\,0\text{x}82, \mathsf{repr}_{\mathbb{F}_{p_P}}(\mathsf{ak}), \mathsf{repr}_{\mathbb{F}_{p_P}}(\mathsf{nk})\,).
$$

The 64-byte output is split: first 32 bytes are $\mathsf{ovk}$,
next 32 are $\mathsf{dk}$. The dependence on $\mathsf{ak}$ and
$\mathsf{nk}$ binds these to the rest of the tree (compare Sapling,
where $\mathsf{ovk}$ depends only on $\mathsf{sk}$).

### Spend authorisation public key

$$
\mathsf{ak} \;=\; [\mathsf{ask}]\,G^{\mathsf{ak}}_{\text{Orch}} \in E^{\circ}_{\text{Pallas}}.
$$

$G^{\mathsf{ak}}_{\text{Orch}}$ is the Orchard `SpendAuthSig.BasePoint`.

### Incoming viewing key

$$
\mathsf{ivk} \;=\;
\mathsf{Extract}_{\mathbb{F}_{q_P}}\!\Bigl(
\mathsf{SinsemillaCommit}^{\mathsf{rivk}}_{D_{\text{cv}}}\!\bigl(
\mathsf{repr}(\mathsf{ak}) \,\|\, \mathsf{repr}(\mathsf{nk})
\bigr)
\Bigr),
$$

with $D_{\text{cv}} = \text{"z.cash:Orchard-CommitIvk"}$. The
`SinsemillaCommit` is a randomised commitment (Sinsemilla hash +
randomness term).

Note this differs from Sapling: Sapling's $\mathsf{ivk}$ is a
hash; Orchard's is a *commitment* with a fresh randomiser. The
commitment lets the circuit prove derivation more efficiently.

### Full viewing key

$$
\mathsf{fvk}_{\text{O}} \;=\; (\mathsf{ak}, \mathsf{nk}, \mathsf{rivk}).
$$

The $\mathsf{ovk}, \mathsf{dk}$ are derived from $\mathsf{fvk}_{\text{O}}$
deterministically.

### Diversifier, diversified base, transmission key

$$
g_d = \mathsf{DiversifyHash}(d), \qquad
\mathsf{pk}_d = [\mathsf{ivk}]\,g_d,
$$

with $d \in \{0,1\}^{88}$ derived from $\mathsf{dk}$ as in Sapling
(FF1 over a 256-bit Pallas-relevant key). $g_d \in
E^{\circ}_{\text{Pallas}}$.

### Orchard payment address

$$
\mathsf{addr}_{\text{O}} = (d, \mathsf{pk}_d).
$$

Encoded in 43 bytes, then packaged inside a Unified Address (no
standalone bech32 form).

### Note plaintext (with extra fields)

An Orchard note is

$$
\mathsf{note}_{\text{O}} \;=\; (\rho, \psi, g_d, \mathsf{pk}_d, v, \mathsf{rseed}).
$$

The additional fields $\rho$ and $\psi$ are uniqueness nonces that
chain across the bundle: each new note's $\rho$ is the **nullifier
of the spent note in the same action** (a clever design that
avoids needing the note position).

$\psi$ is derived from $\mathsf{rseed}$ and $\rho$:

$$
\psi \;=\; \mathsf{ToBase}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{rseed}}(\,0\text{x}09, \rho\,)\bigr).
$$

### Commitment randomness

$$
\mathsf{rcm} \;=\; \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{rseed}}(\,0\text{x}05, \rho\,)\bigr).
$$

### Note commitment

$$
\mathsf{cm} \;=\;
\mathsf{Sinsemilla}^{\mathsf{rcm}}_{D_{\text{nc}}}\!\bigl(
\mathsf{repr}(g_d) \,\|\, \mathsf{repr}(\mathsf{pk}_d) \,\|\,
v_{\text{LE}, 64} \,\|\, \mathsf{repr}(\rho) \,\|\, \mathsf{repr}(\psi)
\bigr).
$$

And $\mathsf{cmx} = \mathsf{extract}(\mathsf{cm})$ is what is
published.

### Ephemeral keys for note encryption

$$
\mathsf{esk} \;=\; \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{rseed}}(\,0\text{x}04, \rho\,)\bigr), \qquad
\mathsf{epk} \;=\; [\mathsf{esk}]\,g_d.
$$

### Value commitment

$$
\mathsf{cv}^{\text{net}} \;=\; [v^{\text{net}}]\,V_{\text{Orch}} \;+\; [\mathsf{rcv}]\,R_{\text{Orch}},
$$

with $v^{\text{net}} = v_{\text{old}} - v_{\text{new}}$ the **net**
value of the Action (positive if the old note was larger than the
new one). This is the per-Action net value commitment; the bundle
balance equation aggregates them.

### Nullifier

$$
\mathsf{nf} \;=\;
\mathsf{Extract}_{\mathbb{F}_{p_P}}\!\Bigl(
[\,\mathsf{PRF}^{\mathsf{nfOrchard}}_{\mathsf{nk}}(\rho) + \psi\,]\,K_{\text{Orch}} \;+\; \mathsf{cm}
\Bigr),
$$

with $K_{\text{Orch}}$ a fixed Pallas generator and
$\mathsf{PRF}^{\mathsf{nfOrchard}}_{\mathsf{nk}}$ a Poseidon-based PRF
keyed by $\mathsf{nk}$.

### Re-randomisation, binding sig, OCK, K_enc

Parallel to Sapling:

$$
\mathsf{rsk} = \mathsf{ask} + \alpha, \qquad
\mathsf{rk} = \mathsf{ak} + [\alpha]\,G^{\mathsf{ak}}_{\text{Orch}},
$$

$$
\mathsf{ock} = \mathsf{BLAKE2b\text{-}256}(\text{pers}=\text{"Zcash\_Orchardock"}, \mathsf{ovk} \,\|\, \cdot),
$$

$$
\mathsf{bvk} = \sum_i \mathsf{cv}_i^{\text{net}} - [v_{\text{balance}}^{\text{Orch}}]\,V_{\text{Orch}}.
$$

(The binding sig over Pallas is RedPallas; ZIP 224 spells out the
constants.)

### Issuance keys (ZSAs, NU7-track)

Future-only:

| Symbol | Role |
| --- | --- |
| $\mathsf{IssuanceKey}$ | Issuer's spending-authority root for issuance |
| $\mathsf{ik}$ | Public issuance key |
| $\mathsf{AssetId}$ | A 64-byte digest binding an asset to its issuer |

See chapter 21 for context.

## 4. Transparent

### Master and derived keys

Standard BIP-32 / SLIP-10 over secp256k1. Path $m / 44' / 133' /
\text{acct}' / \text{change} / \text{index}$.

| Symbol | Type |
| --- | --- |
| $\mathsf{xprv}$ | Extended private key (32-byte priv + 32-byte chain code) |
| $\mathsf{xpub}$ | Extended public key |
| $\mathsf{sk}_T$ | secp256k1 scalar |
| $\mathsf{pk}_T$ | secp256k1 point |
| $\mathsf{hash160}$ | RIPEMD160(SHA256(pubkey)), the address payload |

ZIP 48 (in `zcash_transparent::zip48`) defines transparent
account-level keys for inclusion in a UFVK.

| Code | `zcash_transparent::keys`, `zcash_transparent::address` |

## 5. Unified

### Unified Spending Key

$$
\mathsf{USK} \;=\; (\mathsf{xprv}_T, \mathsf{esk}_{\text{Sap}}, \mathsf{sk}_{\text{O}}),
$$

with components present per the account's policy.

### Unified Full Viewing Key

$$
\mathsf{UFVK} \;=\; (\mathsf{xpub}_T, \mathsf{efvk}_{\text{Sap}}, \mathsf{fvk}_{\text{O}}).
$$

Where $\mathsf{efvk}_{\text{Sap}}$ includes the diversifier key
$\mathsf{dk}_{\text{Sap}}$.

### Unified Incoming Viewing Key

$$
\mathsf{UIVK} \;=\; (\mathsf{xpub}_T^{\text{external}}, \mathsf{ivk}_{\text{Sap}}, \mathsf{ivk}_{\text{O}}),
$$

permitting decryption of incoming but not outgoing notes. This is a
weaker capability than UFVK; some wallets share UIVKs with
read-only services.

### Unified Address

A bundle of receivers:

$$
\mathsf{UA} \;=\; \{\text{Typecode}_i \to \mathsf{Receiver}_i\}.
$$

Typecodes per ZIP 316. Encoded as F4Jumble(TLV concat || HMAC) ||
bech32m with HRP `u`.

## 6. Note encryption keys at a glance

For both Sapling and Orchard:

| Key | Sender knows | Recipient knows | Purpose |
| --- | --- | --- | --- |
| $\mathsf{esk}$ | yes | no | ECDH secret |
| $\mathsf{epk}$ | yes (publishes) | yes (sees on-chain) | ECDH public |
| $\mathsf{shared}$ | $\;[\mathsf{esk}]\mathsf{pk}_d$ | $\;[\mathsf{ivk}]\mathsf{epk}$ | DH output |
| $K_{\text{enc}}$ | yes | yes | AEAD key (recipient side) |
| $\mathsf{ock}$ | yes (via $\mathsf{ovk}$) | no | AEAD key (sender side) |

## 7. Cross-pool relationships

Every Zcash account has, in this codebase:

- One transparent extended key per account (ZIP 48).
- One Sapling extended spending key per account.
- One Orchard spending key per account.

These are independent: knowing the Sapling key does not reveal the
Orchard key, and vice versa. The wallet stitches them together via
the Unified containers.

The same seed deterministically produces all three (via different
ZIP-32 paths). A user backing up their seed phrase backs up the
full account.

## 8. Privacy hierarchy

Per pool, the capability ladder (top: most powerful):

1. $\mathsf{sk}$ - can spend.
2. $\mathsf{ask}$, $\mathsf{nsk}$ - jointly can authorise and prove
   a spend, but not derive the address (need $\mathsf{ivk}$).
3. $\mathsf{fvk} = (\mathsf{ak}, \mathsf{nk}, \mathsf{ovk}, \mathsf{dk})$
   - can view incoming and outgoing; can enumerate addresses;
   cannot spend.
4. $\mathsf{ivk}$ - can decrypt incoming; cannot view outgoing.
5. $(d, \mathsf{pk}_d)$ - public-facing receiver; nobody can do
   anything beyond send to.

The PCZT design respects this hierarchy: each role gets the
minimum capability it needs.

## 9. Lifetime: where each key lives

A wallet at rest stores:

- The seed (in user-controlled long-term storage, encrypted).
- Derived `USK`s, `UFVK`s in the wallet DB (UFVK in cleartext is
  permissible; USK should be encrypted in DB or held in a hardware
  signer).
- Per-account "current diversifier index".

A wallet during scanning needs:

- `UIVK` material (for decryption).
- The nullifier set (for spent detection).

A wallet during transaction construction (single-key flow) needs:

- `USK` material.
- The proving parameters (Sapling).
- Selected notes' Merkle paths.

A wallet using PCZT:

- The constructor only needs read-only view of the wallet state.
- The prover needs the `pgk` and per-spend randomness.
- The signer needs `ask` and the sighash.

## 10. Code reference table

| Type | Crate :: Module |
| --- | --- |
| `SpendingKey` (Sapling) | `sapling-crypto::keys::SpendingKey` |
| `ExpandedSpendingKey` (Sapling) | `sapling-crypto::keys::ExpandedSpendingKey` |
| `ProofGenerationKey` (Sapling) | `sapling-crypto::keys::ProofGenerationKey` |
| `FullViewingKey` (Sapling) | `sapling-crypto::keys::FullViewingKey` |
| `SaplingIvk` | `sapling-crypto::keys::SaplingIvk` |
| `OutgoingViewingKey` (Sapling) | `sapling-crypto::keys::OutgoingViewingKey` |
| `DiversifierKey` (Sapling) | `sapling-crypto::zip32::DiversifierKey` |
| `Diversifier` (Sapling) | `sapling-crypto::keys::Diversifier` |
| `PaymentAddress` (Sapling) | `sapling-crypto::PaymentAddress` |
| `SpendingKey` (Orchard) | `orchard::keys::SpendingKey` |
| `FullViewingKey` (Orchard) | `orchard::keys::FullViewingKey` |
| `IncomingViewingKey` (Orchard) | `orchard::keys::IncomingViewingKey` |
| `DiversifierKey` (Orchard) | `orchard::keys::DiversifierKey` |
| `Address` (Orchard) | `orchard::Address` |
| Transparent extended key | `zcash_transparent::keys` |
| `UnifiedSpendingKey` | `zcash_keys::keys::UnifiedSpendingKey` |
| `UnifiedFullViewingKey` | `zcash_keys::keys::UnifiedFullViewingKey` |
| `UnifiedAddressRequest` | `zcash_keys::keys` |
| `UnifiedAddress` | `zcash_keys::address::UnifiedAddress` |

## 11. The key derivation graph at a glance

Sapling:

```text
       seed (32 B)
          |  ZIP 32: m / 32' / 133' / acct'
          v
  sk (Sapling, 32 B)
   |
   |---- PRF^expand(.,0x00) -> ask  (F_l)
   |---- PRF^expand(.,0x01) -> nsk  (F_l)
   |---- PRF^expand(.,0x02) -> ovk  (32 B)
   |---- PRF^expand(.,0x10) -> dk   (32 B)
   |
   v                            v
  ak = [ask]G^ak             nk = [nsk]G^nk
        \_____________  ______/
                      \/
            ivk = CRH^ivk(ak, nk) mod l
                      |
        dk -- FF1 --> d (per index)
                      |
                 g_d = DiversifyHash(d)
                      |
                 pk_d = [ivk] g_d
                      |
                 address = (d, pk_d)
```

Orchard:

```text
  sk_O
   |
   |---- PRF^expand(.,0x06) -> ask   (F_q)
   |---- PRF^expand(.,0x07) -> nk    (F_p, field elt!)
   |---- PRF^expand(.,0x08) -> rivk  (F_q)
   |
   v                            v
  ak = [ask]G^ak_O           (nk is a scalar; no point op)
        \_____________  ______/
                      \/
       ivk = Extract(SinsemillaCommit^rivk(ak, nk))
                      |
       ovk || dk = PRF^expand(., 0x82, ak, nk)
                      |
        dk -- FF1 --> d
                      |
                 g_d = DiversifyHash(d)
                      |
                 pk_d = [ivk] g_d
                      |
                 receiver = (d, pk_d)
```

Per-transaction ephemerals (both pools):

```text
  rseed                rcv          alpha
   |                    |            |
   v                    v            v
  rcm, esk          (used in       rsk = ask + alpha
   |                 cv = [v]V       |
   v                 + [rcv]R)    rk = ak + [alpha] G^ak
  epk = [esk]g_d                     |
                                  sigma_spendAuth =
                                    RedSig.Sign_rsk(sighash)
```

## What you should know after this chapter

- Every Zcash key has a precise type, domain, and derivation, and
  this chapter is the reference for all of them.
- The Sapling and Orchard key trees are structurally parallel but
  differ in details (Orchard's $\mathsf{nk}$ is a field element,
  Orchard's $\mathsf{ivk}$ is a commitment not a hash, etc.).
- The "viewing key hierarchy" governs who can do what.
- The cross-pool independence and the unification via the
  USK/UFVK/UA containers.

Next: the circuits themselves, constraint by constraint.
