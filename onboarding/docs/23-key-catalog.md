---
sidebar_position: 23
title: The complete key catalog
description: "Every key symbol defined, derived, typed, and located in code."
---

# 23 - The complete key catalog

## 1. Why this chapter exists

Every chapter of this course names keying-material symbols
($\mathsf{ask}, \mathsf{nsk}, \mathsf{ak}, \mathsf{nk},
\mathsf{ivk}, \mathsf{ovk}, \mathsf{dk}, \mathsf{esk}, \mathsf{epk},
\mathsf{rcm}, \mathsf{rcv}, \alpha$, and so on). A reader who needs
the exact derivation, type, or code location for any of these
should not have to recover it from prose. This chapter is the
authoritative reference: every Zcash key is listed with its
domain, derivation formula, role, and the source file that defines
its Rust type. It also points at the related catalog of circuit
clauses in chapter 24 and at chapter 06 for HD derivation.

## 2. Definitions

This chapter assumes the cryptographic primitives defined in
chapter 03 (groups, fields, PRFs, commitments, signatures).
Specific to this chapter:

**Definition 2.1 (Field notation).** Let $\mathbb{F}_q$ denote
the prime field of order $q$. We use $\ell_J$ for the Jubjub
prime-order subgroup order; $r$ for the BLS12-381 scalar field
(equal to the Jubjub base field); $q_P$ for the Pallas scalar
field; $p_P$ for the Pallas base field. The Pallas and Vesta
cofactors are $1$; the Jubjub cofactor is $h_J = 8$. The
prime-order Jubjub subgroup is $\mathbb{G}_J \subset
E_{\text{Jubjub}}(\mathbb{F}_r)$ with
$|\mathbb{G}_J| = \ell_J$; the Pallas prime-order group is
$\mathbb{G}_P = E_{\text{Pallas}}(\mathbb{F}_{p_P})$ with
$|\mathbb{G}_P| = q_P$.

**Definition 2.2 (Generator notation).** A fixed generator of
a prime-order subgroup $\mathbb{G}$, derived deterministically
from a personalisation string via a hash-to-curve construction,
is denoted by $G$ with a superscript tag. For example,
$G^{\mathsf{ak}}_{\text{Sap}} \in \mathbb{G}_J$ is the Sapling
spend-authority base point.

**Definition 2.3 (Scalar multiplication).** For
$P \in \mathbb{G}$ and $x \in \mathbb{F}_{|\mathbb{G}|}$ (the
scalar field of $\mathbb{G}$), $[x] P \in \mathbb{G}$ denotes
the scalar multiple of $P$ by $x$.

**Definition 2.4 (Canonical encoding $\mathsf{repr}$).** For a
target codomain $T$ (either a field or a group), the symbol
$\mathsf{repr}_T : \cdot \rightarrow T$ denotes the canonical
encoding into $T$. For instance, for a Jubjub point
$P \in \mathbb{G}_J$,
$\mathsf{repr}_{\mathbb{F}_r}(P) \in \mathbb{F}_r$ is its
$u$-coordinate encoded as a little-endian field element.

**Definition 2.5 (To-scalar and to-base reduction).** For a
64-byte string $s \in \{0,1\}^{512}$,
$$
\mathsf{ToScalar} : \{0,1\}^{512} \rightarrow
\mathbb{F}_{\ell_J} \;\;\text{(Sapling)}, \;\;
\text{or}\; \mathbb{F}_{q_P} \;\text{(Orchard)},
$$
$$
\mathsf{ToBase} : \{0,1\}^{512} \rightarrow
\mathbb{F}_{p_P} \;\;\text{(Orchard base field)},
$$
both interpret $s$ as a little-endian integer and reduce modulo
the relevant prime. The $512$-bit input width ensures the bias
introduced by modular reduction is negligible (statistical
distance $< 2^{-256}$).

**Definition 2.6 (Expand-from-seed PRF).** Let
$\mathsf{sk} \in \{0,1\}^{256}$ and let $t \in \{0,1\}^{\ast}$
be a purpose tag. Define
$$
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}} :
\{0,1\}^{\ast} \rightarrow \{0,1\}^{512},
\qquad
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(t) \;=\;
\mathsf{BLAKE2b\text{-}512}\!\bigl(
\text{pers} = \text{``Zcash\_ExpandSeed''},\;
\mathsf{sk} \,\mathbin{\|}\, t\bigr).
$$
Used identically by Sapling and Orchard with different purpose
tags.

**Definition 2.7 (Catalog entry).** A *catalog entry* below
formalises a Zcash key symbol $K$ by recording, where
applicable:
1. The symbol $K$ and its short name.
2. The type signature, i.e. the codomain $\mathcal{D}_K$
   (a field, a group, or a byte-string space).
3. The derivation: an explicit function from prior keys or
   randomness to $K$.
4. The role: who learns $K$ and what capability it confers.
5. The Rust type in this workspace (or upstream crate) that
   carries $K$.

Each entry below is therefore a Definition fixing $K$ in the
form $K \in \mathcal{D}_K$ with a derivation rule.

## 3. The code

The catalog is organised by pool. Within each pool, keys are listed
in derivation order: spending key first, then derived material,
then per-transaction ephemerals.

### 3.1 Sprout (legacy)

Sprout is closed for new outputs but historical notes still exist.

**Definition 2.8 (Sprout $a_{\mathsf{sk}}$).** $a_{\mathsf{sk}}
\in \{0,1\}^{252}$, sampled uniformly
($a_{\mathsf{sk}} \stackrel{\$}{\leftarrow} \{0,1\}^{252}$). The
Sprout spending key. Holder can spend Sprout notes.

**Definition 2.9 (Sprout $a_{\mathsf{pk}}$).** $a_{\mathsf{pk}}
\in \{0,1\}^{256}$, defined by
$$
a_{\mathsf{pk}} \;=\;
\mathsf{PRF}^{\mathsf{addr}}_{a_{\mathsf{sk}}}(0).
$$
The Sprout paying key, published as part of the Sprout address.

**Definition 2.10 (Sprout $\mathsf{sk}_{\text{enc}}$).**
$\mathsf{sk}_{\text{enc}} \in \{0,1\}^{256}$, derived from
$\mathsf{PRF}^{\mathsf{addr}}_{a_{\mathsf{sk}}}(1)$ with the
Curve25519 clamping operation. Used as a Curve25519 secret for
in-band note encryption.

**Definition 2.11 (Sprout $\mathsf{pk}_{\text{enc}}$).**
$\mathsf{pk}_{\text{enc}} \in E_{\text{C25519}}$, defined by
$\mathsf{pk}_{\text{enc}} =
[\mathsf{sk}_{\text{enc}}] G_{\text{C25519}}$ with
$G_{\text{C25519}}$ the standard Curve25519 base point. Public,
part of the Sprout address.

**Definition 2.12 (Sprout $\rho$).** $\rho \in \{0,1\}^{256}$,
chosen per-note to be unique within the JoinSplit. The
nullifier seed stored in the note plaintext.

**Definition 2.13 (Sprout $r$, commitment randomness).** $r \in
\{0,1\}^{256}$, $r \stackrel{\$}{\leftarrow} \{0,1\}^{256}$
per note. Used as the randomness in the Sprout note
commitment.

**Definition 2.14 (Sprout $\phi$).** $\phi \in \{0,1\}^{252}$,
$\phi \stackrel{\$}{\leftarrow} \{0,1\}^{252}$ per JoinSplit.
Used to derive new $\rho$ values for the JoinSplit's output
notes.

**Definition 2.15 (Sprout $h_{\mathsf{sig}}$).** $h_{\mathsf{sig}}
\in \{0,1\}^{256}$, equal to a BLAKE2b hash of the transaction
context and the JoinSplit signing public key. Binds the
JoinSplit to its signature.

**Definition 2.16 (Sprout nullifier).** $\mathsf{nf} \in
\{0,1\}^{256}$, defined by
$$
\mathsf{nf} \;=\;
\mathsf{PRF}^{\mathsf{nf}}_{a_{\mathsf{sk}}}(\rho).
$$

Sprout PRFs are SHA-256 with 4-bit tag prefixes; exact tags are in
protocol spec section 5.4.2.

The Sprout circuit definition lives in
[`zcash_proofs/src/circuit/sprout/mod.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout/mod.rs):

```rust reference title="zcash_proofs/src/circuit/sprout/mod.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout/mod.rs#L25-L54
```

### 3.2 Sapling

The Sapling key tree implementation lives in the external
[`sapling-crypto`](https://github.com/zcash/sapling-crypto)
crate; this workspace consumes it via
[`zcash_keys/src/keys.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs).

#### Root spending key

**Definition 2.17 (Sapling $\mathsf{sk}$).** $\mathsf{sk} \in
\{0,1\}^{256}$, derived along the ZIP 32 hardened path
$m / 32' / 133' / \mathrm{acct}'$ from the wallet seed. Holder
can do everything: spend, view, derive. Code:
`sapling-crypto::keys::SpendingKey`. Sometimes called the
"expanded spending key" or, with a chain code, the "extended
spending key" (ZIP 32, Extended).

#### Spend-authorisation private key

**Definition 2.18 (Sapling $\mathsf{ask}$).**
$\mathsf{ask} \in \mathbb{F}_{\ell_J}$, defined by
$$
\mathsf{ask} \;=\; \mathsf{ToScalar}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(0\mathrm{x}00)\bigr).
$$
Signs Sapling spend-auth signatures after re-randomisation by
$\alpha$. Code: `sapling-crypto::keys::ExpandedSpendingKey::ask`.

#### Nullifier private key

**Definition 2.19 (Sapling $\mathsf{nsk}$).**
$\mathsf{nsk} \in \mathbb{F}_{\ell_J}$, defined by
$$
\mathsf{nsk} \;=\; \mathsf{ToScalar}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(0\mathrm{x}01)\bigr).
$$
Derives $\mathsf{nk}$ and, inside the circuit, the nullifier.
Code: `sapling-crypto::keys::ExpandedSpendingKey::nsk`.

#### Outgoing viewing key

**Definition 2.20 (Sapling $\mathsf{ovk}$).**
$\mathsf{ovk} \in \{0,1\}^{256}$, defined by
$$
\mathsf{ovk} \;=\;
\mathsf{truncate}_{32}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(0\mathrm{x}02)\bigr),
$$
where $\mathsf{truncate}_{32}$ takes the first 32 bytes of the
64-byte BLAKE2b output. Decrypts outputs sent by the holder via
$C^{\text{out}}$. Code:
`sapling-crypto::keys::ExpandedSpendingKey::ovk`.

#### Diversifier key

**Definition 2.21 (Sapling $\mathsf{dk}$).**
$\mathsf{dk} \in \{0,1\}^{256}$, defined by
$$
\mathsf{dk} \;=\;
\mathsf{truncate}_{32}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}}(0\mathrm{x}10)\bigr).
$$
Used as the FF1-AES key that enumerates the account's
diversifiers. Code: `sapling-crypto::zip32::DiversifierKey`.

#### Spend-authorisation public key

**Definition 2.22 (Sapling $\mathsf{ak}$).** $\mathsf{ak} \in
\mathbb{G}_J$, defined by
$$
\mathsf{ak} \;=\; [\mathsf{ask}]\, G^{\mathsf{ak}}_{\text{Sap}},
$$
with $G^{\mathsf{ak}}_{\text{Sap}} \in \mathbb{G}_J$ the fixed
Sapling spend-authority base point
(`SpendAuthSig.BasePoint`). Public spend-authority key,
published after re-randomisation as $\mathsf{rk}$. Code:
`sapling-crypto::keys::ProofGenerationKey::ak`.

#### Nullifier deriving key

**Definition 2.23 (Sapling $\mathsf{nk}$).** $\mathsf{nk} \in
\mathbb{G}_J$, defined by
$$
\mathsf{nk} \;=\; [\mathsf{nsk}]\, G^{\mathsf{nk}}_{\text{Sap}},
$$
with $G^{\mathsf{nk}}_{\text{Sap}} \in \mathbb{G}_J$ the fixed
nullifier generator (`ProvingPublicKey.BasePoint`). Keys the
nullifier PRF; part of the full viewing key. Code:
`sapling-crypto::keys::ProofGenerationKey::nk`.

#### Incoming viewing key

**Definition 2.24 (Sapling $\mathsf{ivk}$).** $\mathsf{ivk} \in
\mathbb{F}_{\ell_J}$, defined by
$$
\mathsf{ivk} \;=\;
\bigl[\,\mathsf{BLAKE2s\text{-}256}\!\bigl(
\text{pers} = \text{``Zcashivk''},\;
\mathsf{repr}_{\mathbb{F}_r}(\mathsf{ak}) \,\mathbin{\|}\,
\mathsf{repr}_{\mathbb{F}_r}(\mathsf{nk})\bigr)\,\bigr]
\bmod \ell_J,
$$
extracting each point's $u$-coordinate as a 255-bit little-
endian field-element encoding; the top bit is cleared before
reducing modulo $\ell_J$ to ensure uniform reduction. Decrypts
outputs received by this account. Code:
`sapling-crypto::keys::SaplingIvk`.

#### Full viewing key

**Definition 2.25 (Sapling $\mathsf{fvk}$).** $\mathsf{fvk} =
(\mathsf{ak}, \mathsf{nk}, \mathsf{ovk}) \in \mathbb{G}_J \times
\mathbb{G}_J \times \{0,1\}^{256}$. With the diversifier key
included (per ZIP 316), the *extended* full viewing key is
$\mathsf{efvk} = (\mathsf{ak}, \mathsf{nk}, \mathsf{ovk},
\mathsf{dk})$. The full viewing key can compute $\mathsf{ivk}$
and decrypt incoming notes; decrypt outgoing notes via
$\mathsf{ovk}$; enumerate diversified addresses via
$\mathsf{dk}$. It cannot spend or authorise (no
$\mathsf{ask}$). Code:
`sapling-crypto::keys::FullViewingKey`.

#### Proof generation key

**Definition 2.26 (Sapling $\mathsf{pgk}$).** $\mathsf{pgk} =
(\mathsf{ak}, \mathsf{nsk}) \in \mathbb{G}_J \times
\mathbb{F}_{\ell_J}$. The witness the prover supplies for the
Sapling Spend circuit: public $\mathsf{ak}$ and private
$\mathsf{nsk}$. A hardware-wallet flow that delegates proving
hands this pair (and the per-spend $\alpha$) to the prover
without sending $\mathsf{ask}$, which signs only. Code:
`sapling-crypto::keys::ProofGenerationKey`.

#### Diversifier

**Definition 2.27 (Sapling diversifier $d$).** For diversifier
index $i \in [0, 2^{88})$,
$$
d \;=\;
\mathsf{FF1\text{-}AES}_{\mathsf{dk}}(\mathsf{Encode}(i))
\in \{0,1\}^{88}.
$$
Eleven bytes. Not every $d$ produces a valid prime-order
generator $g_d$; the probability is approximately $1/2$ per
$d$, and invalid indices are skipped. Code:
`sapling-crypto::keys::Diversifier`, `DiversifierIndex`.

#### Diversified base

**Definition 2.28 (Sapling $g_d$).** $g_d \in \mathbb{G}_J$,
defined by
$$
g_d \;=\; \mathsf{DiversifyHash}(d),
$$
where $\mathsf{DiversifyHash}$ is a try-and-increment hash-to-
curve into $\mathbb{G}_J$ using BLAKE2s with personalisation
`"Zcash_gd"`. The output is multiplied by the cofactor $h_J = 8$
to land in $\mathbb{G}_J$.

#### Diversified transmission key

**Definition 2.29 (Sapling $\mathsf{pk}_d$).** $\mathsf{pk}_d
\in \mathbb{G}_J$, defined by
$$
\mathsf{pk}_d \;=\; [\mathsf{ivk}]\, g_d.
$$
Public key tied to diversifier $d$; combined with $d$ to form
a payment address.

#### Sapling payment address

**Definition 2.30 (Sapling address $\mathsf{addr}_{\text{Sap}}$).**
$\mathsf{addr}_{\text{Sap}} = (d, \mathsf{pk}_d) \in
\{0,1\}^{88} \times \mathbb{G}_J$, encoded as $11 + 32 = 43$
bytes and bech32-encoded with HRP `zs` (mainnet) or
`ztestsapling` (testnet).

#### Note plaintext

**Definition 2.31 (Sapling note).** A Sapling note is the tuple
$$
\mathsf{note} \;=\;
(g_d, \mathsf{pk}_d, v, \mathsf{rseed}) \;\in\;
\mathbb{G}_J \times \mathbb{G}_J \times [0, 2^{64}) \times
\{0,1\}^{256},
$$
where $\mathsf{rseed}$ is a 32-byte seed (post-ZIP 212) from
which $\mathsf{rcm}$ and $\mathsf{esk}$ are derived. Pre-Canopy
notes used $\mathsf{rcm}$ directly.

#### Commitment randomness

**Definition 2.32 (Sapling $\mathsf{rcm}$, post-ZIP 212).**
$\mathsf{rcm} \in \mathbb{F}_{\ell_J}$, defined by
$$
\mathsf{rcm} \;=\; \mathsf{ToScalar}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{rseed}}(0\mathrm{x}04)
\bigr).
$$
Hides the note in $\mathsf{NoteCommit}$ (Definition 2.36).

#### Ephemeral secret key

**Definition 2.33 (Sapling $\mathsf{esk}$, post-ZIP 212).**
$\mathsf{esk} \in \mathbb{F}_{\ell_J}$, defined by
$$
\mathsf{esk} \;=\; \mathsf{ToScalar}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{rseed}}(0\mathrm{x}05)
\bigr).
$$
Sender's secret for ECDH note encryption. Code: local to
builder; not part of any persisted key type.

#### Ephemeral public key

**Definition 2.34 (Sapling $\mathsf{epk}$).** $\mathsf{epk} \in
\mathbb{G}_J$, defined by
$$
\mathsf{epk} \;=\; [\mathsf{esk}]\, g_d.
$$
Published in the OutputDescription and Action.

#### Note commitment

**Definition 2.35 (Sapling $\mathsf{cm}$).** $\mathsf{cm} \in
\mathbb{G}_J$, defined by
$$
\mathsf{cm} \;=\;
\mathsf{NoteCommit}^{\mathsf{rcm}}(g_d, \mathsf{pk}_d, v)
\;=\;
\mathsf{PedersenHash}_{D_{\text{nc}}}\!\bigl(
1011 \,\mathbin{\|}\, v_{\text{LE},64} \,\mathbin{\|}\,
\mathsf{repr}_{\mathbb{F}_r}(g_d) \,\mathbin{\|}\,
\mathsf{repr}_{\mathbb{F}_r}(\mathsf{pk}_d)
\bigr) \;+\; [\mathsf{rcm}]\, R_{\text{nc}}.
$$
The published value is the $u$-coordinate
$\mathsf{cm}^u = \mathsf{extract}(\mathsf{cm}) \in
\mathbb{F}_r$. Code: `sapling-crypto::primitives::NoteCommitment`.

#### Value commitment randomness and value commitment

**Definition 2.36 (Sapling $\mathsf{rcv}$).** $\mathsf{rcv} \in
\mathbb{F}_{\ell_J}$, $\mathsf{rcv} \stackrel{\$}{\leftarrow}
\mathbb{F}_{\ell_J}$ per spend or output.

**Definition 2.37 (Sapling $\mathsf{cv}$).** $\mathsf{cv} \in
\mathbb{G}_J$, defined by
$$
\mathsf{cv} \;=\; [v]\, V_{\text{Sap}} \;+\;
[\mathsf{rcv}]\, R_{\text{Sap}},
$$
with $V_{\text{Sap}}, R_{\text{Sap}} \in \mathbb{G}_J$ the
fixed value and randomness bases
(`ValueCommitValueBase`, `ValueCommitRandomnessBase`).

#### Position and rho

**Definition 2.38 (Sapling $\rho$).** For a note at position
$\mathsf{pos} \in [0, 2^{32})$ in the commitment tree,
$\rho \in \mathbb{G}_J$ is defined by
$$
\rho \;=\;
\mathsf{MixingPedersenHash}(\mathsf{cm}, \mathsf{pos})
\;=\; \mathsf{cm} \;+\; [\mathsf{pos}]\, G_\rho.
$$

#### Nullifier

**Definition 2.39 (Sapling nullifier $\mathsf{nf}$).**
$\mathsf{nf} \in \{0,1\}^{256}$, defined by
$$
\mathsf{nf} \;=\;
\mathsf{PRF}^{\mathsf{nfSapling}}_{\mathsf{nk}}(\rho)
\;=\;
\mathsf{BLAKE2s\text{-}256}\!\bigl(
\text{pers} = \text{``Zcash\_nf''},\;
\mathsf{repr}_{\mathbb{F}_r}(\mathsf{nk}) \,\mathbin{\|}\,
\mathsf{repr}_{\mathbb{F}_r}(\rho)\bigr).
$$
Published in the SpendDescription.

#### Re-randomisation

**Definition 2.40 (Sapling $\alpha$).** $\alpha \in
\mathbb{F}_{\ell_J}$, $\alpha \stackrel{\$}{\leftarrow}
\mathbb{F}_{\ell_J}$ per spend.

**Definition 2.41 (Sapling re-randomised keys
$\mathsf{rsk}, \mathsf{rk}$).**
$$
\mathsf{rsk} \;=\; \mathsf{ask} + \alpha \in
\mathbb{F}_{\ell_J},
\qquad
\mathsf{rk} \;=\; \mathsf{ak} +
[\alpha]\, G^{\mathsf{ak}}_{\text{Sap}} \in \mathbb{G}_J.
$$
$\mathsf{rsk}$ stays private; $\mathsf{rk}$ is published.

#### Spend-authorisation signature

**Definition 2.42 (Sapling
$\sigma_{\text{spendAuth}}$).** A RedJubjub signature under
$\mathsf{rsk}$ over the sighash:
$$
\sigma_{\text{spendAuth}} \;=\;
\mathsf{RedJubjub.Sign}_{\mathsf{rsk}}(\mathsf{sighash}).
$$
Verified under $\mathsf{rk}$.

#### Outgoing cipher key

**Definition 2.43 (Sapling $\mathsf{ock}$).** $\mathsf{ock} \in
\{0,1\}^{256}$, defined by
$$
\mathsf{ock} \;=\;
\mathsf{BLAKE2b\text{-}256}\!\bigl(
\text{pers} = \text{``Zcash\_Derive\_ock''},\;
\mathsf{ovk} \,\mathbin{\|}\,
\mathsf{repr}(\mathsf{cv}) \,\mathbin{\|}\,
\mathsf{repr}(\mathsf{cm}^u) \,\mathbin{\|}\,
\mathsf{repr}(\mathsf{epk})\bigr).
$$
Also written $K_{\text{out}}$ in chapter 08. AEAD key for
$C^{\text{out}}$; recovers $(\mathsf{pk}_d, \mathsf{esk})$ from
$\mathsf{ovk}$.

#### Note encryption key

**Definition 2.44 (Sapling $K_{\text{enc}}$).** $K_{\text{enc}}
\in \{0,1\}^{256}$, defined by
$$
K_{\text{enc}} \;=\;
\mathsf{BLAKE2b\text{-}256}\!\bigl(
\text{pers} = \text{``Zcash\_SaplingKDF''},\;
\mathsf{repr}(\mathsf{shared}) \,\mathbin{\|}\,
\mathsf{repr}(\mathsf{epk})\bigr),
$$
where $\mathsf{shared} = [\mathsf{esk}]\, \mathsf{pk}_d =
[\mathsf{ivk}]\, \mathsf{epk} \in \mathbb{G}_J$. AEAD key
encrypting the note plaintext to the recipient.

#### Binding signature keys

**Definition 2.45 (Sapling binding keys $\mathsf{bsk},
\mathsf{bvk}$).** For inputs $i$ and outputs $j$ in a Sapling
bundle,
$$
\mathsf{bsk} \;=\;
\sum_{i \in \text{in}} \mathsf{rcv}_i -
\sum_{j \in \text{out}} \mathsf{rcv}_j \in
\mathbb{F}_{\ell_J},
$$
$$
\mathsf{bvk} \;=\;
\sum_{i \in \text{in}} \mathsf{cv}_i^{\text{in}} -
\sum_{j \in \text{out}} \mathsf{cv}_j^{\text{out}} -
[v_{\text{balance}}^{\text{Sap}}]\, V_{\text{Sap}} \in
\mathbb{G}_J.
$$
If the bundle balances, $\mathsf{bvk} = [\mathsf{bsk}]\,
R_{\text{Sap}}$; the spender holds $\mathsf{bsk}$ and signs the
sighash under it. Code:
`sapling-crypto::bundle::Bundle::binding_signature`.

#### Internal vs external addresses

**Definition 2.46 (Sapling internal sub-tree).** ZIP 316
specifies an *internal* full-viewing-key sub-tree for change
addresses, distinct from the user-facing external one. The
internal sub-tree has its own
$\mathsf{ovk}^{\text{int}} \in \{0,1\}^{256}$,
$\mathsf{dk}^{\text{int}} \in \{0,1\}^{256}$, and diversifier
index space. An external observer cannot link change outputs
to user-visible addresses. The internal keys derive from the
external ones via further hardened ZIP-32 children with index
$1$.

### 3.3 Orchard

The Orchard key tree is implemented in the external
[`orchard`](https://github.com/zcash/orchard) crate; this
workspace consumes it via
[`zcash_keys/src/keys.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs).
Structurally parallel to Sapling with several simplifications.

#### Root spending key

**Definition 2.47 (Orchard $\mathsf{sk}_O$).**
$\mathsf{sk}_O \in \{0,1\}^{256}$, derived via ZIP 32 from the
wallet seed analogously to Sapling. Code:
`orchard::keys::SpendingKey`.

#### Spend-authorisation private key

**Definition 2.48 (Orchard $\mathsf{ask}$).**
$\mathsf{ask} \in \mathbb{F}_{q_P}$, defined by
$$
\mathsf{ask} \;=\; \mathsf{ToScalar}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_O}(0\mathrm{x}06)\bigr).
$$

#### Nullifier deriving key

**Definition 2.49 (Orchard $\mathsf{nk}$).**
$\mathsf{nk} \in \mathbb{F}_{p_P}$, defined by
$$
\mathsf{nk} \;=\; \mathsf{ToBase}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_O}(0\mathrm{x}07)\bigr).
$$
Unlike Sapling, Orchard's $\mathsf{nk}$ is a field element, not
a curve point. This is a key Orchard simplification: the
nullifier PRF feeds $\mathsf{nk}$ directly into a Poseidon hash
inside the circuit, avoiding the cost of decoding a point.

#### Randomiser for ivk commitment

**Definition 2.50 (Orchard $\mathsf{rivk}$).**
$\mathsf{rivk} \in \mathbb{F}_{q_P}$, defined by
$$
\mathsf{rivk} \;=\; \mathsf{ToScalar}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_O}(0\mathrm{x}08)\bigr).
$$
Used as the randomness in the Sinsemilla-based
$\mathsf{CommitIvk}$.

#### Outgoing viewing key and diversifier key

**Definition 2.51 (Orchard $\mathsf{ovk}, \mathsf{dk}$).**
$\mathsf{ovk} \in \{0,1\}^{256}$ and $\mathsf{dk} \in
\{0,1\}^{256}$, jointly defined by the concatenation
$$
\mathsf{ovk} \,\mathbin{\|}\, \mathsf{dk} \;=\;
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_O}\!\bigl(
0\mathrm{x}82,\;
\mathsf{repr}_{\mathbb{F}_{p_P}}(\mathsf{ak}),\;
\mathsf{repr}_{\mathbb{F}_{p_P}}(\mathsf{nk})\bigr).
$$
The 64-byte output is split: the first 32 bytes are
$\mathsf{ovk}$, the next 32 are $\mathsf{dk}$. The dependence
on $\mathsf{ak}$ and $\mathsf{nk}$ binds these to the rest of
the tree.

#### Spend-authorisation public key

**Definition 2.52 (Orchard $\mathsf{ak}$).** $\mathsf{ak} \in
\mathbb{G}_P$, defined by
$$
\mathsf{ak} \;=\; [\mathsf{ask}]\, G^{\mathsf{ak}}_{\text{Orch}}.
$$

#### Incoming viewing key

**Definition 2.53 (Orchard $\mathsf{ivk}$).** $\mathsf{ivk} \in
\mathbb{F}_{q_P}$, defined by
$$
\mathsf{ivk} \;=\;
\mathsf{Extract}_{\mathbb{F}_{q_P}}\!\bigl(
\mathsf{SinsemillaCommit}^{\mathsf{rivk}}_{D_{\text{cv}}}\!\bigl(
\mathsf{repr}(\mathsf{ak}) \,\mathbin{\|}\,
\mathsf{repr}(\mathsf{nk})\bigr)\bigr),
$$
with $D_{\text{cv}} =$ `"z.cash:Orchard-CommitIvk"`.
$\mathsf{SinsemillaCommit}$ is a randomised commitment, Sinsemilla
hash plus a randomness term. Sapling's $\mathsf{ivk}$ is a hash;
Orchard's is a randomised commitment. The commitment form lets
the circuit prove derivation more efficiently.

#### Full viewing key

**Definition 2.54 (Orchard $\mathsf{fvk}_O$).**
$\mathsf{fvk}_O = (\mathsf{ak}, \mathsf{nk}, \mathsf{rivk}) \in
\mathbb{G}_P \times \mathbb{F}_{p_P} \times \mathbb{F}_{q_P}$.
$\mathsf{ovk}$ and $\mathsf{dk}$ are derived from
$\mathsf{fvk}_O$ deterministically.

#### Diversifier, diversified base, transmission key

**Definition 2.55 (Orchard $d, g_d, \mathsf{pk}_d$).**
$d \in \{0,1\}^{88}$ is derived from $\mathsf{dk}$ as in
Sapling. Then
$$
g_d \;=\; \mathsf{DiversifyHash}(d) \in \mathbb{G}_P,
\qquad
\mathsf{pk}_d \;=\; [\mathsf{ivk}]\, g_d \in \mathbb{G}_P.
$$

#### Orchard payment address

**Definition 2.56 (Orchard address $\mathsf{addr}_O$).**
$\mathsf{addr}_O = (d, \mathsf{pk}_d) \in
\{0,1\}^{88} \times \mathbb{G}_P$, encoded in 43 bytes and
packaged inside a Unified Address (no standalone bech32 form).

#### Note plaintext

**Definition 2.57 (Orchard note).** An Orchard note is the tuple
$$
\mathsf{note}_O \;=\;
(\rho, \psi, g_d, \mathsf{pk}_d, v, \mathsf{rseed}) \;\in\;
\mathbb{F}_{p_P} \times \mathbb{F}_{p_P} \times \mathbb{G}_P
\times \mathbb{G}_P \times [0, 2^{64}) \times \{0,1\}^{256}.
$$
The additional fields $\rho$ and $\psi$ are uniqueness nonces
that chain across the bundle: each new note's $\rho$ equals the
nullifier of the spent note in the same Action. $\psi$ is
derived from $\mathsf{rseed}$ and $\rho$:
$$
\psi \;=\; \mathsf{ToBase}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{rseed}}(0\mathrm{x}09, \rho)
\bigr).
$$

#### Commitment randomness

**Definition 2.58 (Orchard $\mathsf{rcm}$).** $\mathsf{rcm} \in
\mathbb{F}_{q_P}$, defined by
$$
\mathsf{rcm} \;=\; \mathsf{ToScalar}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{rseed}}(0\mathrm{x}05, \rho)
\bigr).
$$

#### Note commitment

**Definition 2.59 (Orchard $\mathsf{cm}$).** $\mathsf{cm} \in
\mathbb{G}_P$, defined by
$$
\mathsf{cm} \;=\;
\mathsf{Sinsemilla}^{\mathsf{rcm}}_{D_{\text{nc}}}\!\bigl(
\mathsf{repr}(g_d) \,\mathbin{\|}\,
\mathsf{repr}(\mathsf{pk}_d) \,\mathbin{\|}\,
v_{\text{LE}, 64} \,\mathbin{\|}\,
\mathsf{repr}(\rho) \,\mathbin{\|}\,
\mathsf{repr}(\psi)\bigr).
$$
The published value is the $x$-coordinate
$\mathsf{cmx} = \mathsf{extract}(\mathsf{cm}) \in
\mathbb{F}_{p_P}$.

#### Ephemeral keys for note encryption

**Definition 2.60 (Orchard $\mathsf{esk}, \mathsf{epk}$).**
$\mathsf{esk} \in \mathbb{F}_{q_P}$ and $\mathsf{epk} \in
\mathbb{G}_P$, defined by
$$
\mathsf{esk} \;=\; \mathsf{ToScalar}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{rseed}}(0\mathrm{x}04, \rho)
\bigr),
\qquad
\mathsf{epk} \;=\; [\mathsf{esk}]\, g_d.
$$

#### Value commitment

**Definition 2.61 (Orchard $\mathsf{cv}^{\text{net}}$).**
$\mathsf{cv}^{\text{net}} \in \mathbb{G}_P$, defined by
$$
\mathsf{cv}^{\text{net}} \;=\;
[v^{\text{net}}]\, V_{\text{Orch}} \;+\;
[\mathsf{rcv}]\, R_{\text{Orch}},
$$
where $v^{\text{net}} = v_{\text{old}} - v_{\text{new}}$ is the
net value of the Action (positive when the old note was larger
than the new one). The bundle balance equation aggregates these
commitments.

#### Nullifier

**Definition 2.62 (Orchard nullifier $\mathsf{nf}$).**
$\mathsf{nf} \in \mathbb{F}_{p_P}$, defined by
$$
\mathsf{nf} \;=\;
\mathsf{Extract}_{\mathbb{F}_{p_P}}\!\bigl(
[\mathsf{PRF}^{\mathsf{nfOrchard}}_{\mathsf{nk}}(\rho) +
\psi]\, K_{\text{Orch}} \;+\; \mathsf{cm}\bigr),
$$
with $K_{\text{Orch}} \in \mathbb{G}_P$ a fixed Pallas generator
and $\mathsf{PRF}^{\mathsf{nfOrchard}}_{\mathsf{nk}}$ a
Poseidon-based PRF keyed by $\mathsf{nk}$.

#### Re-randomisation, binding sig, OCK, K_enc

**Definition 2.63 (Orchard re-randomisation $\mathsf{rsk},
\mathsf{rk}$).** For $\alpha \stackrel{\$}{\leftarrow}
\mathbb{F}_{q_P}$,
$$
\mathsf{rsk} \;=\; \mathsf{ask} + \alpha \in \mathbb{F}_{q_P},
\qquad
\mathsf{rk} \;=\; \mathsf{ak} + [\alpha]\,
G^{\mathsf{ak}}_{\text{Orch}} \in \mathbb{G}_P.
$$

**Definition 2.64 (Orchard $\mathsf{ock}$).** $\mathsf{ock} \in
\{0,1\}^{256}$, defined by
$$
\mathsf{ock} \;=\;
\mathsf{BLAKE2b\text{-}256}\!\bigl(
\text{pers} = \text{``Zcash\_Orchardock''},\;
\mathsf{ovk} \,\mathbin{\|}\, \mathsf{repr}(\mathsf{cv}^{\text{net}})
\,\mathbin{\|}\, \mathsf{repr}(\mathsf{cmx})
\,\mathbin{\|}\, \mathsf{repr}(\mathsf{epk})\bigr).
$$

**Definition 2.65 (Orchard $\mathsf{bvk}$).** $\mathsf{bvk} \in
\mathbb{G}_P$, defined by
$$
\mathsf{bvk} \;=\; \sum_i \mathsf{cv}_i^{\text{net}} -
[v_{\text{balance}}^{\text{Orch}}]\, V_{\text{Orch}}.
$$
The binding signature is RedPallas; ZIP 224 spells out the
constants.

#### Issuance keys (ZSA, NU7-track)

**Definition 2.66 (ZSA $\mathsf{IssuanceKey}$).**
$\mathsf{IssuanceKey} \in \{0,1\}^{256}$. The issuer's spending-
authority root for issuance. Future-only.

**Definition 2.67 (ZSA $\mathsf{ik}$).** $\mathsf{ik} \in
\mathbb{G}_P$, the public issuance key derived from
$\mathsf{IssuanceKey}$ analogously to $\mathsf{ak}$.

**Definition 2.68 (ZSA $\mathsf{AssetId}$).** $\mathsf{AssetId}
\in \{0,1\}^{512}$, a 64-byte digest binding an asset to its
issuer. See chapter 21 for ZSA context.

### 3.4 Transparent

Standard BIP-32 / SLIP-10 over secp256k1. Path
$m / 44' / 133' / \mathrm{acct}' / \mathrm{change} / \mathrm{index}$.

**Definition 2.69 (Transparent $\mathsf{xprv}$).** $\mathsf{xprv}
\in \{0,1\}^{256} \times \{0,1\}^{256}$, the BIP-32 extended
private key, consisting of a 32-byte private scalar and a
32-byte chain code.

**Definition 2.70 (Transparent $\mathsf{xpub}$).** $\mathsf{xpub}
\in \mathbb{G}_{\text{secp256k1}} \times \{0,1\}^{256}$, the
BIP-32 extended public key, consisting of a secp256k1 point and
the chain code.

**Definition 2.71 (Transparent $\mathsf{sk}_T$).**
$\mathsf{sk}_T \in \mathbb{F}_{n_{\text{secp256k1}}}$, the
secp256k1 scalar private key extracted from a non-hardened
$\mathsf{xprv}$.

**Definition 2.72 (Transparent $\mathsf{pk}_T$).**
$\mathsf{pk}_T \in \mathbb{G}_{\text{secp256k1}}$, defined by
$\mathsf{pk}_T = [\mathsf{sk}_T] G_{\text{secp256k1}}$.

**Definition 2.73 (Transparent $\mathsf{hash160}$).**
$\mathsf{hash160} \in \{0,1\}^{160}$, defined by
$$
\mathsf{hash160} \;=\;
\mathsf{RIPEMD\text{-}160}\!\bigl(
\mathsf{SHA\text{-}256}(\mathsf{enc}(\mathsf{pk}_T))\bigr),
$$
the address payload of P2PKH outputs.

The transparent key implementation:

```rust reference title="zcash_transparent/src/keys.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_transparent/src/keys.rs#L1-L40
```

ZIP 48 account-level keys live alongside in
[`zcash_transparent/src/zip48.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_transparent/src/zip48.rs).

### 3.5 Unified

Defined by ZIP 316. Encoded via F4Jumble in
[`components/f4jumble/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/f4jumble/src/lib.rs)
and bech32m in
[`components/zcash_address/src`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_address/src).

#### Unified spending key

**Definition 2.74 (Unified spending key $\mathsf{USK}$).**
$\mathsf{USK} = (\mathsf{xprv}_T, \mathsf{esk}_{\text{Sap}},
\mathsf{sk}_O)$ where each component is optional and present
per the account's policy. Code:
`zcash_keys::keys::UnifiedSpendingKey`.

```rust reference title="zcash_keys/src/keys.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs#L1-L40
```

#### Unified full viewing key

**Definition 2.75 (Unified full viewing key $\mathsf{UFVK}$).**
$\mathsf{UFVK} = (\mathsf{xpub}_T, \mathsf{efvk}_{\text{Sap}},
\mathsf{fvk}_O)$. The Sapling component
$\mathsf{efvk}_{\text{Sap}}$ includes the diversifier key
$\mathsf{dk}_{\text{Sap}}$.

#### Unified incoming viewing key

**Definition 2.76 (Unified incoming viewing key
$\mathsf{UIVK}$).** $\mathsf{UIVK} =
(\mathsf{xpub}_T^{\text{external}}, \mathsf{ivk}_{\text{Sap}},
\mathsf{ivk}_O)$. Decrypts incoming but not outgoing notes; a
weaker capability than $\mathsf{UFVK}$, suitable for read-only
services.

#### Unified address

**Definition 2.77 (Unified address $\mathsf{UA}$).**
$\mathsf{UA}$ is a bundle of receivers indexed by typecodes:
$$
\mathsf{UA} \;=\;
\{\text{Typecode}_i \mapsto \mathsf{Receiver}_i\}_i,
$$
with typecodes per ZIP 316. Encoded as
$\mathsf{F4Jumble}(\mathsf{TLV}\text{-concat} \,\mathbin{\|}\,
\mathsf{HMAC})$ and then bech32m with HRP `u`.

### 3.6 Note encryption keys at a glance

For both Sapling and Orchard:

| Key | Sender knows | Recipient knows | Purpose |
| --- | --- | --- | --- |
| $\mathsf{esk}$ | yes | no | ECDH secret |
| $\mathsf{epk}$ | yes (publishes) | yes (sees on-chain) | ECDH public |
| $\mathsf{shared}$ | $[\mathsf{esk}]\,\mathsf{pk}_d$ | $[\mathsf{ivk}]\,\mathsf{epk}$ | DH output |
| $K_{\text{enc}}$ | yes | yes | AEAD key (recipient side) |
| $\mathsf{ock}$ | yes (via $\mathsf{ovk}$) | no | AEAD key (sender side) |

### 3.7 Cross-pool relationships

Every Zcash account in this codebase has:

- One transparent extended key per account (ZIP 48).
- One Sapling extended spending key per account.
- One Orchard spending key per account.

These are independent: knowing one does not reveal the others.
The wallet stitches them together via the Unified containers. The
same seed deterministically produces all three (via different ZIP
32 paths). Backing up the seed phrase backs up the full account.

### 3.8 Privacy hierarchy

Per pool, the capability ladder (top: most powerful):

1. $\mathsf{sk}$ - can spend.
2. $\mathsf{ask}$, $\mathsf{nsk}$ - jointly authorise and prove a
   spend; cannot derive the address (need $\mathsf{ivk}$).
3. $\mathsf{fvk} = (\mathsf{ak}, \mathsf{nk}, \mathsf{ovk},
   \mathsf{dk})$ - view incoming and outgoing; enumerate
   addresses; cannot spend.
4. $\mathsf{ivk}$ - decrypt incoming; cannot view outgoing.
5. $(d, \mathsf{pk}_d)$ - public receiver; only sendable-to.

The PCZT design respects this hierarchy: each role gets the
minimum capability it needs.

### 3.9 Lifetime: where each key lives

| Phase | Stored | Notes |
| --- | --- | --- |
| At rest | Seed (encrypted), USK and UFVK in wallet DB | USK should be encrypted in DB or held in a hardware signer |
| Scanning | UIVK, nullifier set | No spending capability needed |
| Building (single key) | USK, proving parameters, Merkle paths | Local proving |
| PCZT constructor | Read-only wallet state | No private keys |
| PCZT prover | $\mathsf{pgk}$ + per-spend $\alpha$ | No $\mathsf{ask}$ |
| PCZT signer | $\mathsf{ask}$ + sighash | No proving |

### 3.10 Code reference table

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

### 3.11 Derivation graphs

Sapling derivation:

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

Orchard derivation:

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

## 5. Spec pointers

- [Zcash Protocol Specification, section 4](https://zips.z.cash/protocol/protocol.pdf):
  high-level definitions for every key in this catalog.
- [Zcash Protocol Specification, section 5](https://zips.z.cash/protocol/protocol.pdf):
  concrete formulas for $\mathsf{PRF}^{\text{expand}}$,
  $\mathsf{CRH}^{\mathsf{ivk}}$, $\mathsf{DiversifyHash}$, and
  the nullifier PRFs.
- [ZIP 32](https://zips.z.cash/zip-0032): HD derivation paths
  feeding the per-pool root spending key.
- [ZIP 212](https://zips.z.cash/zip-0212): the `rseed`-derived
  $\mathsf{rcm}$ and $\mathsf{esk}$ that this catalog records.
- [ZIP 224](https://zips.z.cash/zip-0224): Orchard key tree.
- [ZIP 316](https://zips.z.cash/zip-0316): Unified Addresses,
  full viewing keys, and the internal/external split for change
  addresses.
- [ZIP 48](https://zips.z.cash/zip-0048): transparent account-
  level keys included in a UFVK.

## 6. Exercises

1. **Look up a symbol.** A PR comments references
   $\mathsf{rivk}$ without context. Use this catalog to identify
   which pool the key belongs to, its derivation, and the line
   in
   [`zcash_keys/src/keys.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs)
   or the external `orchard` crate where the type is defined.
2. **Diversifier count.** Compute the maximum number of
   diversifiers a Sapling account can produce and the expected
   fraction of valid ones (where $g_d$ lies in the prime-order
   subgroup). Cite the protocol spec section that gives the
   numbers.
3. **Trace a derivation in code.** Open
   [`zcash_keys/src/keys.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs)
   and follow the call path from a seed to a `UnifiedSpendingKey`
   to a `UnifiedAddress`. Cite the file and line of each
   intermediate type.
4. **Cross-pool capability.** A user shares their UFVK with a
   read-only auditor. Which keys in this catalog does the auditor
   gain access to? Which do they not? Answer per pool.

### Answers in the code

- Sapling expanded-key type:
  `sapling-crypto::keys::ExpandedSpendingKey` (external crate).
- Orchard spending-key type:
  `orchard::keys::SpendingKey` (external crate).
- Transparent ZIP 48:
  [`zcash_transparent/src/zip48.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_transparent/src/zip48.rs).
- Unified containers:
  [`zcash_keys/src/keys.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs).
- F4Jumble encoding:
  [`components/f4jumble/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/f4jumble/src/lib.rs).

## 7. Further reading

- [chapter 06](./06-keys-addresses-zip32.md): the HD derivation
  layer that produces the root spending keys this catalog
  itemises.
- [chapter 24](./24-circuits-constraint-by-constraint.md): the
  circuits that consume these keys as witnesses.
- Hopwood, Bowe, Hornby, Wilcox,
  [Sapling design notes](https://github.com/zcash/zips/blob/main/protocol/sapling.pdf):
  the original treatment of the Sapling key tree.
