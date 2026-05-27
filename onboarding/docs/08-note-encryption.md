---
sidebar_position: 8
title: Note encryption
description: "In-band secret distribution, OutCiphertext, KDF, trial decryption."
---

# 08 - Note encryption

## 1. Why this chapter exists

Note encryption is what delivers a shielded note to its recipient
on-chain without revealing the recipient or the note content to
anyone else. The construction is called *in-band secret distribution*
because the encrypted note plaintext rides inside the transaction
itself. Every wallet that receives shielded value runs trial
decryption on every output of every block; a contributor who cannot
explain the ECDH-KDF-AEAD chain or the role of $\mathsf{ovk}$ will
break scanning performance or, worse, accept malformed notes. By the
end of this chapter you will be able to follow an OutputDescription
from the wire bytes through `zcash_note_encryption` into the
`decrypt_transaction` entry point in
[`zcash_client_backend/src/decrypt.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/decrypt.rs),
and identify which step rejects a tampered ciphertext.

The encryption-specific keys ($\mathsf{esk}, \mathsf{epk},
\mathsf{ock}, K_{\text{enc}}$) and their relationships are summarised
here and recorded in
[chapter 23 - The complete key catalog](./23-key-catalog.md). The
actual code lives in the external crate `zcash_note_encryption`,
used by both `sapling-crypto` and `orchard`.

## 2. Definitions

### 2.1 What needs to be conveyed

For each shielded output, the sender must convey to the recipient:

- The note value $v$.
- The diversifier $d$ (so the recipient can recover
  $g_d, \mathsf{pk}_d$).
- The randomness $\mathsf{rcm}$ for the commitment.
- For Orchard, the additional fields $\rho, \psi$.
- An optional **memo** of up to 512 bytes.

Plus the sender wants to recover the same data later from the chain,
using a key derived from their own $\mathsf{ovk}$, without keeping
per-output state.

**Definition (security goals).** The construction must provide:

- **Confidentiality**: only the intended recipient (and the
  sender) can decrypt.
- **Authentication**: the recipient is sure the plaintext matches
  the on-chain commitment.
- **Compactness**: the encrypted form is small.
- **Fast trial decryption**: a wallet must check every output of
  every block against every viewing key it tracks; the check must
  be cheap.

### 2.2 The two ciphertexts

**Definition.** Each shielded OutputDescription / Action carries
two ciphertexts:

- $C^{\text{enc}}$: encryption for the recipient (580 bytes for
  Sapling).
- $C^{\text{out}}$: encryption for the sender's recovery
  (80 bytes).

Both use **ChaCha20-Poly1305** with a static nonce; each key is
single-use.

### 2.3 The Sapling KDF

**Definition (KDF).** The sender samples
$\mathsf{esk} \stackrel{\$}{\leftarrow} \mathbb{F}_\ell$, publishes
$\mathsf{epk} = [\mathsf{esk}] g_d$, and computes the shared secret

$$
\mathsf{shared} \;=\; [\mathsf{esk}]\, \mathsf{pk}_d
\;=\; [\mathsf{esk} \cdot \mathsf{ivk}]\, g_d.
$$

The recipient computes the same value as
$[\mathsf{ivk}]\,\mathsf{epk}$. The symmetric key is

$$
K_{\text{enc}}
\;=\;
\mathsf{KDF}_{\text{Sapling}}(\mathsf{shared}, \mathsf{epk})
\;=\;
\mathsf{BLAKE2b\text{-}256}\!\bigl(
\text{pers}=\text{"Zcash\_SaplingKDF"},\;
\text{repr}(\mathsf{shared}) \mathbin{\|} \text{repr}(\mathsf{epk})
\bigr).
$$

The inclusion of $\mathsf{epk}$ in the KDF input ties the shared key
to the specific ephemeral; this is needed for contributory
key-agreement security.

### 2.4 The recipient plaintext

**Definition (Sapling note plaintext).**

$$
\mathsf{npt} \;=\; 0\text{x}02 \mathbin{\|} d \mathbin{\|}
v_{\text{LE}} \mathbin{\|} \mathsf{rcm} \mathbin{\|} \mathsf{memo}.
$$

The leading byte is the plaintext version so different
transmission formats can coexist. Orchard prepends a different
leading byte and extends the structure to include $\rho, \psi$.

**Definition (recipient ciphertext).**

$$
C^{\text{enc}} \;=\; \mathsf{ChaCha20\text{-}Poly1305}_{K_{\text{enc}}}\!\bigl(
\text{nonce}=0,\, \text{AD}=\emptyset,\, \mathsf{npt}\bigr).
$$

Output is the ciphertext (564 bytes for Sapling) followed by the
16-byte authentication tag. Total
$1 + 11 + 8 + 32 + 512 + 16 = 580$ bytes.

### 2.5 The outgoing key

**Definition (outgoing cipher key).**

$$
K_{\text{out}}
\;=\;
\mathsf{PRF}^{\mathsf{ock}}_{\mathsf{ovk}}\!\bigl(\mathsf{cv},
\mathsf{cm}_u, \mathsf{epk}\bigr)
\;=\;
\mathsf{BLAKE2b\text{-}256}\!\bigl(
\text{pers}=\text{"Zcash\_Derive\_ock"},
\mathsf{ovk} \mathbin{\|} \mathsf{cv} \mathbin{\|}
\mathsf{cm}_u \mathbin{\|} \mathsf{epk}
\bigr).
$$

The outgoing ciphertext is

$$
C^{\text{out}} \;=\; \mathsf{ChaCha20\text{-}Poly1305}_{K_{\text{out}}}\!\bigl(
\text{nonce}=0,\, \mathsf{pk}_d \mathbin{\|} \mathsf{esk}\bigr),
$$

with 32 + 32 plaintext bytes plus 16-byte tag = 80 bytes.

### 2.6 The trial-decryption procedure

**Invariant (decrypt-then-recommit).** A wallet does not trust an
AEAD-decrypted plaintext until it re-derives the note commitment
and confirms it matches the published commitment. Acceptance
without this step would allow accepting forged notes whose
ciphertexts happen to decrypt under $K_{\text{enc}}$.

Trial decryption for each output $\times$ each tracked
$\mathsf{ivk}$:

1. Compute $\mathsf{shared} = [\mathsf{ivk}]\,\mathsf{epk}$.
2. Derive $K_{\text{enc}}$.
3. AEAD-decrypt $C^{\text{enc}}$; on tag failure, move on.
4. On success, parse $(d, v, \mathsf{rcm}, \mathsf{memo})$,
   recover $g_d = \mathsf{DiversifyHash}(d)$, then
   $\mathsf{pk}_d = [\mathsf{ivk}]\,g_d$.
5. Re-derive $\mathsf{cm}' = \mathsf{NoteCommit}(\mathsf{rcm}, v,
   g_d, \mathsf{pk}_d)$ and check $\mathsf{cm}' = \mathsf{cm}$
   from the wire.

## 3. The code

### 3.1 The `Domain` abstraction

The crate `zcash_note_encryption` (external to this workspace)
abstracts a `Domain` trait. For Sapling the domain has
$g_d \in \mathbb{G}_{\text{Jubjub}}$ and
$\mathsf{esk} \in \mathbb{F}_{\ell_{\text{Jub}}}$; for Orchard
$g_d \in \mathbb{G}_{\text{Pallas}}$ and
$\mathsf{esk} \in \mathbb{F}_{q_{\text{Pallas}}}$. The structural
flow is identical; the curves differ.

The implementations:

- `sapling-crypto::note_encryption::SaplingDomain`.
- `orchard::note_encryption::OrchardDomain`.

Both provide `derive_esk`, `epk`, `kdf`, `derive_ock`, etc.

### 3.2 High-level decryption entry point

The wallet-facing decryption is `decrypt_transaction` in
`zcash_client_backend`:

```rust reference title="zcash_client_backend/src/decrypt.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/decrypt.rs#L123-L165
```

It iterates over each `ufvks` (account -> UFVK) entry, builds
`PreparedIncomingViewingKey` values for both external and internal
scopes, and tries every output. The OVK is also extracted so the
sender's own outputs are recoverable.

### 3.3 Batched scanning

For block scanning the path is
[`zcash_client_backend::scanning::scan_block`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/scanning.rs):

```rust reference title="zcash_client_backend/src/scanning.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/scanning.rs#L609-L630
```

The function takes a `CompactBlock` (not a full block) plus the set
of `ScanningKeys`, and produces a `ScannedBlock`. Trial decryption
runs in batches; the ECDH scalar multiplication dominates.

### 3.4 Compact decryption

A common optimisation: only the first $\approx 52$ bytes of the
plaintext (`0x02`, diversifier, value, $\mathsf{rcm}$) are needed
to re-derive the commitment. Light wallets pull only those bytes
from `lightwalletd` and skip the memo, which makes scanning much
cheaper. The mode lives in the `compact` API of
`zcash_note_encryption`.

### 3.5 Sapling vs Orchard differences

| Aspect | Sapling | Orchard |
| --- | --- | --- |
| Curve | Jubjub | Pallas |
| KDF personalisation | `Zcash_SaplingKDF` | `Zcash_OrchardKDF` |
| OCK personalisation | `Zcash_Derive_ock` | `Orchard_ock_pre`, then BLAKE2b |
| Plaintext leading byte | 0x02 | 0x02 (with Orchard fields appended) |
| Plaintext length | 564 bytes | 580 bytes |
| AEAD | ChaCha20-Poly1305 | ChaCha20-Poly1305 |
| Trial-decrypt steps | identical structure | identical structure |

Both use the same trait, parameterised by the `Domain`.

### 3.6 OVK-disabled mode

A wallet may want some outputs to be unrecoverable from
$\mathsf{ovk}$ (a privacy-conscious user paying a public
counterparty does not want a leaked $\mathsf{ovk}$ to compromise
that payment). The protocol allows the sender to substitute a
**random** $\mathsf{ovk}$ for a specific output, making the
OutCiphertext effectively unrecoverable to the sender. This is a
per-output decision.

### 3.7 Performance and bandwidth

For each shielded output, trial decryption costs:

- One scalar mul on Jubjub or Pallas (the ECDH step).
- One BLAKE2b for the KDF.
- One ChaCha20-Poly1305 with empty associated data.

A light wallet downloading the compact subset (commitment +
ephemeral key + first 52 bytes of $C^{\text{enc}}$) needs roughly
$\sim 100$ B per output instead of $\sim 700$ B. This is the basis
of the `lightwalletd` protocol.

### 3.8 Security properties (informally)

- **Confidentiality.** The ECDH shared secret is indistinguishable
  from random under DDH on the relevant curve, and the KDF is
  modeled as a random oracle in the proof, so $K_{\text{enc}}$ is
  pseudorandom from the attacker's view. AEAD security gives
  confidentiality of the plaintext.
- **Authentication of plaintext-to-commitment.** The wallet refuses
  to accept a note whose claimed plaintext does not produce the
  published commitment.
- **No forward secrecy.** If $\mathsf{ivk}$ leaks, all historical
  received outputs are recoverable. This is intentional: the
  viewing key is supposed to see history.
- **Sender deniability.** Without $\mathsf{ovk}$, no third party
  can tie the sender to the output, even given
  $(\mathsf{cv}, \mathsf{cm}_u, \mathsf{epk})$.

## 4. Failure modes

- **Reusing $\mathsf{esk}$.** Re-using the same $\mathsf{esk}$
  across two outputs is catastrophic: the attacker can derive the
  recipient's $\mathsf{ivk}$ from the two shared secrets. The
  builder must sample fresh $\mathsf{esk}$ for every output. This
  invariant is enforced by the builder API in
  [`zcash_primitives/src/transaction/builder.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/builder.rs);
  any change to the OutputBuilder that allowed `esk` injection from
  the caller without an explicit `unsafe`-tagged API would defeat
  this.
- **ZIP 212 transition.** Sapling enc-ciphertext used to allow the
  raw plaintext bytes for $\mathsf{rcm}$ as a 32-byte little-endian
  scalar. ZIP 212 (Canopy) changed this to derive $\mathsf{rcm}$
  from a 32-byte seed via a hash. The `Rseed` enum in
  `sapling-crypto` carries both variants; pre-Canopy notes
  ("pre-canopy notes") must be handled with the old derivation.
- **Wrong plaintext-version byte.** The 0x02 plaintext-version byte
  is a hard requirement; an output with anything else must be
  rejected by trial decryption.
- **Forgetting the AEAD tag length.** The AEAD tag is included in
  the 580-byte length; novice readers sometimes treat it as
  overhead and trim it.
- **Skipping commitment re-derivation.** Accepting an output based
  solely on a successful AEAD tag check is unsafe. The
  re-derivation in step 5 of Section 2.6 catches forged
  ciphertexts. Removing this check in scanning code is a recipe for
  accepting garbage notes.
- **Light-wallet partial-byte attacks.** When using the compact
  decryption mode, a light wallet that does not subsequently fetch
  the full ciphertext to verify the memo and AEAD tag is trusting
  the lightwalletd server not to forge a value-binding match.
  This is documented in ZIP 307 and is a known limitation.

## 5. Spec pointers

- [Zcash Protocol Specification, section 4.20 (In-band secret distribution)](https://zips.z.cash/protocol/protocol.pdf):
  the formal definition of $\mathsf{KDF}_{\text{Sapling}}$ and the
  trial-decryption procedure cited in Section 2.
- [ZIP 212 - Allow recipient to derive ephemeral secret from note plaintext](https://zips.z.cash/zip-0212):
  the Canopy-era change to how $\mathsf{rcm}$ is derived. Implemented
  via `Rseed` in `sapling-crypto`.
- [ZIP 307 - Light Client Protocol for Payment Detection](https://zips.z.cash/zip-0307):
  the compact-decryption optimisation and its trust model.
- [Bernstein, ChaCha20 and Poly1305](https://datatracker.ietf.org/doc/html/rfc8439):
  the AEAD used in step 3 of Section 2.4.
- [Hopwood et al., Sapling protocol design notes](https://github.com/zcash/zips/blob/main/protocol/sapling.pdf):
  the security argument for the ECDH-KDF-AEAD chain.

## 6. Exercises

1. **Identify the rejected output.** Given an OutputDescription
   whose AEAD tag verifies but whose re-derived commitment differs
   from the published $\mathsf{cm}_u$, trace the call path in
   [`zcash_client_backend/src/decrypt.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/decrypt.rs)
   that rejects it. Cite the line.
2. **Compute the OCK key by hand.** Given a synthetic $\mathsf{ovk}$
   and the public $(\mathsf{cv}, \mathsf{cm}_u, \mathsf{epk})$
   bytes, compute $K_{\text{out}}$ using a BLAKE2b CLI. Verify by
   decrypting the $C^{\text{out}}$ bytes with ChaCha20-Poly1305.
3. **Modify and test (code change).** Add a unit test under
   `zcash_client_backend` that constructs a `DecryptedOutput` with
   a deliberately-wrong $\mathsf{rcm}$ and confirms that
   `decrypt_transaction` does not return it. The test must pass
   (i.e., the assertion that the output is not returned must
   hold).
4. **Measure scan cost.** Time a batched scan of 1000 outputs
   against 4 IVKs using a release build. Identify whether the
   bottleneck is the ECDH scalar multiplication or the AEAD;
   compare against the prediction in Section 3.7.

### Answers in the code

- High-level decryption:
  [`zcash_client_backend/src/decrypt.rs#L123-L165`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/decrypt.rs#L123-L165).
- Block scan:
  [`zcash_client_backend/src/scanning.rs#L609-L630`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/scanning.rs#L609-L630).
- ZIP 212 `Rseed` variant: search `sapling-crypto` for `Rseed`.

## 7. Further reading

- [chapter 09](./09-equihash-and-consensus.md): consensus rules
  the scanner must respect.
- [chapter 10](./10-wallet-stack.md): the scanner's place in the
  wallet pipeline.
- Hopwood et al.,
  [Sapling protocol specification](https://zips.z.cash/protocol/protocol.pdf):
  formal definitions and security argument.
