# 08 - Note encryption

## Goal

Note encryption is the mechanism that **delivers** a shielded note to
its recipient on-chain without revealing the recipient or the note
content to anyone else. The Zcash construction is sometimes called
*in-band secret distribution* because the encrypted note plaintext
rides inside the transaction itself.

This chapter explains the math and the slot the implementation
occupies in the codebase (the actual code lives in the external crate
`zcash_note_encryption`, used by both `sapling-crypto` and `orchard`).

## 1. What needs to be conveyed

For each shielded output, the sender must convey to the recipient:

- The note value $v$.
- The diversifier $d$ used (so the recipient can recover their
  $g_d, \mathsf{pk}_d$).
- The randomness $\mathsf{rcm}$ for the commitment.
- For Orchard, the additional fields $\rho, \psi$.
- An optional **memo** of up to 512 bytes for arbitrary
  recipient-only data.

Plus the sender wants to be able to recover the same data later from
the chain, using a key derived from their own $\mathsf{ovk}$, without
keeping per-output state.

The goals are:

- **Confidentiality**: only the intended recipient (and the sender)
  can decrypt.
- **Authentication**: the recipient can be sure the plaintext matches
  the on-chain commitment.
- **Compactness**: the encrypted form should be small.
- **Fast trial decryption**: a wallet must check every output of every
  block against every viewing key it tracks; the check must be cheap.

## 2. The two ciphertexts

Each shielded OutputDescription / Action carries two ciphertexts:

- $C^{\text{enc}}$: encryption for the recipient. 580 bytes.
- $C^{\text{out}}$: encryption for the sender's recovery. 80 bytes.

Both use **ChaCha20-Poly1305** as the AEAD primitive (a single static
nonce, since each key is single-use).

## 3. The "domain": parameterised over Sapling and Orchard

The library `zcash_note_encryption` abstracts a `Domain` trait. For
Sapling the domain is

$$
g_d \in \mathbb{G}_{\text{Jubjub}}, \quad \mathsf{esk} \in \mathbb{F}_{\ell_{\text{Jub}}},
$$

for Orchard

$$
g_d \in \mathbb{G}_{\text{Pallas}}, \quad \mathsf{esk} \in \mathbb{F}_{q_{\text{Pallas}}}.
$$

The structural flow is identical; the curves differ. Below we mostly
use Sapling notation; replace as appropriate.

## 4. The recipient ciphertext $C^{\text{enc}}$

### Step 1: ECDH

The sender samples $\mathsf{esk} \stackrel{\$}{\leftarrow} \mathbb{F}_\ell$
and publishes

$$
\mathsf{epk} \;=\; [\mathsf{esk}] \, g_d.
$$

The shared secret is

$$
\mathsf{shared} \;=\; [\mathsf{esk}] \, \mathsf{pk}_d
\;=\; [\mathsf{esk} \cdot \mathsf{ivk}] \, g_d.
$$

The recipient, knowing $\mathsf{ivk}$, computes the same shared secret
as $[\mathsf{ivk}] \, \mathsf{epk}$.

### Step 2: KDF

A symmetric key is derived from the shared secret and the ephemeral
public key:

$$
K_{\text{enc}} \;=\; \mathsf{KDF}_{\text{Sapling}}(\mathsf{shared}, \mathsf{epk}),
$$

where

$$
\mathsf{KDF}_{\text{Sapling}}(s, \mathsf{epk})
\;=\;
\mathsf{BLAKE2b\text{-}256}\!\bigl(
   \text{pers}=\text{"Zcash\_SaplingKDF"}, \, \text{repr}(s) \,\|\, \text{repr}(\mathsf{epk})
\bigr).
$$

The inclusion of $\mathsf{epk}$ in the KDF input is critical for
contributory key-agreement security: it ties the shared key to the
specific ephemeral.

### Step 3: AEAD

The note plaintext is

$$
\mathsf{npt} \;=\; 0\text{x}02 \,\|\, d \,\|\, v_{\text{LE}} \,\|\, \mathsf{rcm} \,\|\, \mathsf{memo},
$$

(for Sapling; Orchard prepends a different leading byte and extends
the structure to include $\rho, \psi$). The leading byte is the
"plaintext version" so different transmission formats can coexist.

$$
C^{\text{enc}} \;=\; \mathsf{ChaCha20\text{-}Poly1305}_{K_{\text{enc}}}(
   \text{nonce}=0, \, \text{AD}=\emptyset, \, \mathsf{npt}
).
$$

The output is the ciphertext (516 bytes) followed by the 16-byte
authentication tag. Total 580-ish bytes for Sapling
($1 + 11 + 8 + 32 + 512 + 16 = 580$).

### Step 4: trial decryption

A receiving wallet, for each output and each $\mathsf{ivk}$ it tracks:

1. Compute $\mathsf{shared} = [\mathsf{ivk}] \cdot \mathsf{epk}$.
2. Derive $K_{\text{enc}}$.
3. AEAD-decrypt $C^{\text{enc}}$; on tag failure, move on.
4. On success, parse $(d, v, \mathsf{rcm}, \mathsf{memo})$, recover
   $g_d = \mathsf{DiversifyHash}(d)$, then $\mathsf{pk}_d =
   [\mathsf{ivk}] g_d$.
5. Re-derive the commitment
   $\mathsf{cm}' = \mathsf{NoteCommit}(\mathsf{rcm}, v, g_d,
   \mathsf{pk}_d)$ and verify $\mathsf{cm}' = \mathsf{cm}$ as
   published. If yes, the note is the wallet's; if no, discard.

The commitment re-derivation is a **sanity check**: it catches the case
where someone managed to forge a ciphertext that decrypts under
$K_{\text{enc}}$ to garbage. With Poly1305, this should never happen
under the assumed key derivation, but the spec requires the check.

### Compact decryption

A common optimisation: only the first $\approx 52$ bytes of the
plaintext (`0x02`, diversifier, value, $\mathsf{rcm}$) are needed to
re-derive the commitment. Light wallets often pull only those bytes
from `lightwalletd` and skip the memo, which makes scanning much
cheaper. See the `compact` mode in `zcash_note_encryption`.

## 5. The sender's recovery ciphertext $C^{\text{out}}$

The sender wants to be able to recover their own outputs without
storing per-output state. They have:

- $\mathsf{ovk}$ (outgoing viewing key, 32 bytes).
- The published $\mathsf{cv}, \mathsf{cm}_u, \mathsf{epk}$.

They locally derived the random $\mathsf{esk}$ and the recipient's
$\mathsf{pk}_d$. They encrypt the pair $(\mathsf{pk}_d, \mathsf{esk})$
to themselves:

$$
K_{\text{out}}
\;=\;
\mathsf{PRF}^{\mathsf{ock}}_{\mathsf{ovk}}\!\bigl(\mathsf{cv}, \mathsf{cm}_u, \mathsf{epk}\bigr)
\;=\;
\mathsf{BLAKE2b\text{-}256}\!\bigl(
\text{pers}=\text{"Zcash\_Derive\_ock"},
\mathsf{ovk} \,\|\, \mathsf{cv} \,\|\, \mathsf{cm}_u \,\|\, \mathsf{epk}
\bigr).
$$

Then

$$
C^{\text{out}} \;=\; \mathsf{ChaCha20\text{-}Poly1305}_{K_{\text{out}}}\!\bigl(
\text{nonce}=0, \, \mathsf{pk}_d \,\|\, \mathsf{esk}
\bigr).
$$

That is 32 + 32 plaintext bytes plus 16-byte tag = 80 bytes.

On recovery, the sender re-derives $K_{\text{out}}$ from public data
and $\mathsf{ovk}$, decrypts $C^{\text{out}}$, recovers
$(\mathsf{pk}_d, \mathsf{esk})$, then computes the same shared secret
the recipient would compute, re-derives $K_{\text{enc}}$, and finally
decrypts $C^{\text{enc}}$ to read the value and memo.

## 6. The "OVK-disabled" mode

A wallet may not want its outputs recoverable from $\mathsf{ovk}$
(e.g. a privacy-conscious user paying a public counterparty does not
want a leaked $\mathsf{ovk}$ to compromise that payment). The protocol
allows the sender to choose to use **a random $\mathsf{ovk}$** for a
specific output, effectively making the OutCiphertext unrecoverable.
This is a per-output decision.

## 7. Trial-decryption performance and bandwidth

For each shielded output, trial decryption costs:

- One scalar mul on Jubjub or Pallas (the ECDH step).
- One BLAKE2b for the KDF.
- One ChaCha20-Poly1305 with empty associated data.

A light wallet that downloads the compact subset (output commitment +
ephemeral key + first 52 bytes of $C^{\text{enc}}$) needs roughly
$\sim 100$ B per output instead of $\sim 700$ B. This is the basis of
the `lightwalletd` protocol.

`zcash_client_backend::scanning` implements batched trial decryption,
trying multiple keys per output in parallel and using fast paths to
short-circuit (the ECDH dominates).

## 8. Sapling vs Orchard differences

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

## 9. Code map

The implementation:

- External crate `zcash_note_encryption`: the abstract `Domain` trait
  and the AEAD wrapper. The trait has methods `derive_esk`, `epk`,
  `kdf`, `derive_ock`, etc.
- `sapling-crypto::note_encryption::SaplingDomain`: implementation for
  Sapling.
- `orchard::note_encryption::OrchardDomain`: implementation for
  Orchard.
- `zcash_client_backend::decrypt::decrypt_transaction`: high-level
  decryption API used by wallets.
- `zcash_client_backend::scanning`: batched scanning with caching.

## 10. Security properties (informally)

**Confidentiality**. The ECDH shared secret is indistinguishable from
random under DDH on the relevant curve, and the KDF is modeled as a
random oracle in the proof, so $K_{\text{enc}}$ is pseudorandom from
the attacker's view. AEAD security gives confidentiality of the
plaintext.

**Authentication of plaintext-to-commitment**. The wallet refuses to
accept a note whose claimed plaintext does not produce the published
commitment, so even if an attacker forged a ChaCha20 ciphertext that
decoded to some arbitrary plaintext, it would be discarded.

**Forward secrecy is NOT a property**. If $\mathsf{ivk}$ leaks, all
historical received outputs are recoverable. This is intentional: the
viewing key is supposed to be able to view history.

**Sender deniability**. Without $\mathsf{ovk}$, no third party can tie
the sender to the output, even given $\mathsf{cv}, \mathsf{cm}_u,
\mathsf{epk}$. Only the recipient (with $\mathsf{ivk}$) can derive
the value/diversifier.

## 11. Common gotchas

- Re-using the same $\mathsf{esk}$ across two outputs is catastrophic:
  it allows the attacker to derive the recipient's $\mathsf{ivk}$ from
  the two shared secrets. The builder must sample fresh $\mathsf{esk}$
  for every output; this is enforced by the builder API.
- Sapling enc-ciphertext used to allow the "raw" plaintext bytes for
  $\mathsf{rcm}$ as a 32-byte little-endian scalar; ZIP 212 changed
  this to derive $\mathsf{rcm}$ from a 32-byte seed via a hash.
  Look for `Rseed` in `sapling-crypto`. Pre-ZIP-212 notes (called
  *pre-canopy* notes) must be handled with the old derivation.
- The 0x02 plaintext-version byte is a hard requirement; an output
  with anything else must be rejected.
- The AEAD tag is included in the 580-byte length; novice readers
  sometimes treat it as overhead and trim it.

## What you should know after this chapter

- The ECDH-KDF-AEAD chain and its parameters.
- The role of the $C^{\text{out}}$ ciphertext and OVK.
- Why trial decryption is cheap.
- The compact-decryption optimisation used by light wallets.
- Why a successful AEAD decryption is not enough; the commitment
  must be re-derived.

Next chapter: Equihash, the history tree, and consensus rules that a
wallet must respect.
