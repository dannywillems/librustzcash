---
sidebar_position: 6
title: Keys, addresses, ZIP 32, unified addresses
description: "HD derivation, viewing keys, F4Jumble, Unified Addresses."
---

# 06 - Keys, addresses, ZIP 32, unified addresses

## 1. Why this chapter exists

Every wallet operation in `librustzcash` starts from a seed and ends
at an address. The intermediate machinery is ZIP 32 derivation, the
Sapling and Orchard key trees, and the Unified containers (USK, UFVK,
UA) defined by ZIP 316. A contributor who cannot trace a byte from
`UnifiedSpendingKey::from_seed` in
[`zcash_keys/src/keys.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs)
through to a bech32m Unified Address will mis-handle privacy-critical
encoding and produce wallets that leak or refuse payments. By the
end of this chapter you will be able to follow the path from a 32-byte
seed through ZIP 32 derivation, the Sapling and Orchard key trees,
the F4Jumble padding step in
[`components/f4jumble/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/f4jumble/src/lib.rs),
and the Unified Address encoding in
[`components/zcash_address/src/kind/unified.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_address/src/kind/unified.rs).

For a per-symbol reference of every key in this chapter
($\mathsf{sk}, \mathsf{ask}, \mathsf{nsk}, \mathsf{ak}, \mathsf{nk},
\mathsf{ivk}, \mathsf{ovk}, \mathsf{dk}, d, g_d, \mathsf{pk}_d,
\mathsf{rivk}, \ldots$) plus their concrete types and code locations,
keep [chapter 23](./23-key-catalog.md) open in another tab.

## 2. Definitions

### 2.1 ZIP 32 derivation

**Definition (extended spending key).** A pair
$(\mathsf{esk}, c)$ where $\mathsf{esk}$ is pool-specific spending-key
material and $c \in \{0,1\}^{256}$ is a chain code. Children at index
$i$ are derived by

$$
I \;=\; \mathsf{BLAKE2b\text{-}512}\!\bigl(c,\,
\mathsf{esk} \mathbin{\|} i \mathbin{\|} 0\text{x}11\bigr),
\qquad
\mathsf{esk}_{\text{child}} = \mathsf{ToScalar}(I[0..32]),
\quad
c_{\text{child}} = I[32..64].
$$

Hardened derivation uses the parent private key and prepends a
distinguishing tag; non-hardened uses the parent public key and is
forbidden for shielded paths.

**Definition (Zcash standard path).** All Zcash account-level keys
are derived along the hardened path
$m / 32' / \text{coin\_type}' / \text{account}'$. Coin type is
$133'\;(\text{0x80000085})$ for mainnet and $1'\;(\text{0x80000001})$
for testnet.

### 2.2 Sapling key tree

**Definition (Sapling expanded spending key).** From the 32-byte
output of ZIP 32 at the account level $\mathsf{sk}_{\text{sap}}$:

$$
\mathsf{ask} = \mathsf{ToScalar}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{sap}}}(0\text{x}00)\bigr),
\quad
\mathsf{nsk} = \mathsf{ToScalar}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{sap}}}(0\text{x}01)\bigr),
$$

$$
\mathsf{ovk} = \mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{sap}}}(0\text{x}02)[0..32],
\quad
\mathsf{dk}  = \mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{sap}}}(0\text{x}10)[0..32].
$$

Then $\mathsf{ak} = [\mathsf{ask}] G^{\mathsf{ak}}$ and
$\mathsf{nk} = [\mathsf{nsk}] G^{\mathsf{nk}}$ are Jubjub points;
$\mathsf{ovk}, \mathsf{dk}$ are 32-byte strings.

**Definition (Sapling incoming viewing key).**

$$
\mathsf{ivk}_{\text{sap}}
\;=\;
\mathsf{CRH}^{\mathsf{ivk}}(\mathsf{ak}, \mathsf{nk})
\;=\;
\mathsf{BLAKE2s\text{-}256}\!\bigl(
\text{pers}=\text{"Zcashivk"},
\text{repr}(\mathsf{ak}) \mathbin{\|} \text{repr}(\mathsf{nk})
\bigr) \;\bmod\; \ell.
$$

**Definition (Sapling diversifier).** Indexed by $i \in \{0, 1, 2,
\ldots\}$,

$$
\mathsf{div}_i \;=\; \mathsf{FF1\text{-}AES}_{\mathsf{dk}}(\mathsf{Encode}(i))
\;\bmod\; 2^{88}.
$$

Not every $\mathsf{div}_i$ produces a valid Jubjub point;
$\mathsf{DiversifyHash}$ returns $\bot$ on failure and the wallet
enumerates $i$ until a valid one is found.

**Definition (Sapling payment address).**

$$
\mathrm{addr}_i = \bigl(\mathsf{div}_i,\;
\mathsf{pk}_d^{(i)} = [\mathsf{ivk}_{\text{sap}}] g_d^{(i)}\bigr),
$$

encoded as 43 bytes (11-byte diversifier $\\|$ 32-byte
$\mathsf{pk}_d$) and bech32m-encoded with HRP `zs` on mainnet.

### 2.3 Orchard key tree

**Definition (Orchard key components).** From
$\mathsf{sk}_{\text{orch}}$:

$$
\mathsf{ask} = \mathsf{ToScalar}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{orch}}}(0\text{x}06)\bigr),
\quad
\mathsf{nk}  = \mathsf{ToBase}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{orch}}}(0\text{x}07)\bigr),
$$

$$
\mathsf{rivk} = \mathsf{ToScalar}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{orch}}}(0\text{x}08)\bigr),
\quad
\mathsf{ovk} \mathbin{\|} \mathsf{dk}
\;=\; \mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{orch}}}(0\text{x}82,
\mathsf{ak}, \mathsf{nk}).
$$

Unlike Sapling, Orchard's $\mathsf{nk}$ is a Pallas field element,
not a curve point. Feeding a scalar straight into Poseidon is much
cheaper in-circuit than first decoding a curve point.

**Definition (Orchard incoming viewing key).** $\mathsf{rivk}$
randomises a Sinsemilla commitment $\mathsf{CommitIvk}$ that produces
$\mathsf{ivk}_{\text{orch}}$.

### 2.4 Unified containers

**Definition (Unified Spending Key, USK).**

$$
\mathsf{USK} = \bigl(\, \mathsf{xsk}_{\text{T}},\; \mathsf{esk}_{\text{S}},\; \mathsf{sk}_{\text{O}} \,\bigr),
$$

containing whichever pool keys are configured. The corresponding
**Unified Full Viewing Key** is

$$
\mathsf{UFVK} = \bigl(\, \mathsf{xpub}_{\text{T}},\; \mathsf{efvk}_{\text{S}},\; \mathsf{fvk}_{\text{O}} \,\bigr).
$$

**Definition (Unified Address encoding, ZIP 316).** Given a set of
typed receivers $\{(\text{typecode}_k, \text{data}_k)\}$,

1. Concatenate per-typecode TLVs of the form
   $\text{typecode}_k \mathbin{\|} \text{len}_k \mathbin{\|}
   \text{data}_k$.
2. Append a 16-byte HMAC tag over the concatenation under a fixed
   key.
3. Apply **F4Jumble** to the resulting byte string.
4. Bech32m-encode with HRP `u` (UAs) or `uview` (UFVKs).

**Definition (F4Jumble).** A length-preserving unkeyed Feistel that
turns any 1-bit input change into a uniformly random output change.
Split the message $m$ into $L \mathbin{\|} R$ where
$\ell_L = \min(\lfloor \ell_m / 2 \rfloor + 1, 128)$. Then

$$
R_1 = R \oplus G_0(L), \quad
L_1 = L \oplus H_0(R_1), \quad
R_2 = R_1 \oplus G_1(L_1), \quad
L_2 = L_1 \oplus H_1(R_2),
$$

with $G_i$ and $H_i$ built from BLAKE2b with per-round
personalisations. Output is $L_2 \mathbin{\|} R_2$. F4Jumble is its
own inverse when the round order is reversed.

**Invariant (UFVK sensitivity).** A UFVK includes $\mathsf{dk}$ for
each shielded pool, so leaking a UFVK reveals every diversified
address an account has ever used. UFVKs cannot spend, but they are
not "public": they are full-view, not no-spend-public.

## 3. The code

### 3.1 The big picture

```text
                seed (32 B)
                  |
        ZIP 32 path m / purpose' / coin_type' / account'
                  |
   +--------------+--------------------+-----------------+
   |              |                    |                 |
 Transparent    Sapling              Orchard          (TZE future)
 ExtendedKey    ExtendedSpendingKey  SpendingKey
   |              |                    |
  ...           Sapling FVK,         Orchard FVK,
                IVK, OVK, dk         IVK, OVK, dk, rivk
                  |                    |
            diversified address     diversified address
```

The Unified Address is a packaged set of per-pool *receivers* derived
from those keys, encoded so that a casual observer cannot tell which
pools are available.

### 3.2 USK from seed

The top-level entry point is `UnifiedSpendingKey::from_seed`, which
delegates to the per-pool derivation crates (`transparent`,
`sapling-crypto`, `orchard`):

```rust reference title="zcash_keys/src/keys.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs#L236-L256
```

The Sapling helper `sapling::spending_key` follows the ZIP 32
hardened path:

```rust reference title="zcash_keys/src/keys.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs#L60-L83
```

The ZIP 32 derivation logic itself lives in the external `zip32`
crate; `librustzcash` exposes only the per-pool glue.

### 3.3 USK to UFVK

`UnifiedSpendingKey::to_unified_full_viewing_key` walks each pool
field and computes the corresponding viewing key:

```rust reference title="zcash_keys/src/keys.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs#L280-L290
```

The `unknown` field is the forward-compatibility hook: when a UFVK
is parsed that contains a typecode the current binary does not know,
the typecode plus its data is preserved here so that round-trip
encoding remains byte-exact.

### 3.4 Unified receivers

A Unified Address contains a set of receivers; the receiver enum
keeps the four standard typecodes plus an `Unknown` catch-all:

```rust reference title="components/zcash_address/src/kind/unified/address.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_address/src/kind/unified/address.rs#L8-L39
```

| Typecode | Receiver |
| --- | --- |
| 0x00 | P2PKH transparent receiver (20-byte $\mathsf{hash160}$) |
| 0x01 | P2SH transparent receiver (20-byte $\mathsf{hash160}$) |
| 0x02 | Sapling receiver (43 bytes: 11 + 32) |
| 0x03 | Orchard receiver (43 bytes) |

Padding with `null` (0xFFFFFFFF) typecode entries aligns to F4Jumble
break points, hiding which receivers were omitted. The wallet
selects the highest-priority pool both sides support (typically
`Orchard > Sapling > P2PKH > P2SH`).

### 3.5 F4Jumble inside the encoder

The Feistel state and the four rounds are tiny:

```rust reference title="components/f4jumble/src/lib.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/f4jumble/src/lib.rs#L137-L173
```

Two key observations:

1. The split point is $\min(\lfloor \ell_m / 2 \rfloor + 1, 128)$,
   so for any message under 256 bytes the left half is the smaller
   half plus one byte. This asymmetry is deliberate.
2. Inversion just reverses the round order. The `Decoder` path in
   ZIP 316 calls `f4jumble_inv_mut` on the bytes received from
   bech32m, then verifies the HMAC, then parses TLVs.

The `f4jumble`-encoded buffer is what bech32m then turns into the
final `u1...` address string.

### 3.6 Transparent layer

The transparent layer uses standard Bitcoin-style BIP-44 derivation:

- Path: $m / 44' / 133' / \text{account}' / \text{change} / \text{index}$.
- secp256k1 keys.
- $\mathsf{addr} = \text{base58check}(\text{prefix} \mathbin{\|}
  \mathsf{hash160}(\mathsf{pubkey}))$ for P2PKH,
  $\mathsf{hash160}(x) = \mathsf{RIPEMD160}(\mathsf{SHA256}(x))$.

Encoded in
[`zcash_transparent/src/keys.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_transparent/src/keys.rs)
and consumed by `zcash_keys` via the `transparent-inputs` feature.

ZIP 316 also defines transparent **receivers** inside UAs: just the
20-byte $\mathsf{hash160}$ with a typecode (0x00 P2PKH, 0x01 P2SH);
these do not specify a derivation path, since the parent UFVK does.

ZIP 48 (in
[`zcash_transparent/src/zip48.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_transparent/src/zip48.rs))
defines transparent account-level keys for use inside a UFVK.

### 3.7 Incoming vs outgoing viewing keys

Two viewing-key flavours per shielded pool:

- **Incoming viewing key** ($\mathsf{ivk}$): decrypts outputs sent
  *to* this account.
- **Outgoing viewing key** ($\mathsf{ovk}$): decrypts outputs sent
  *from* this account (so the sender can see their own outgoing
  payments without keeping per-output state).

The full viewing key includes both. The `dk` (diversifier key) is
needed to enumerate one's own diversified addresses.

### 3.8 Address encoding cheat sheet

| Address kind | HRP | Encoding | Length |
| --- | --- | --- | --- |
| P2PKH (mainnet) | `t1` (prefix) | base58check | 35 chars |
| P2SH | `t3` | base58check | 35 |
| Sprout | `zc` | base58check | 95 |
| Sapling | `zs` | bech32 | 78 |
| Unified Address | `u` | bech32m + F4Jumble | variable |
| Unified Full Viewing Key | `uview` | bech32m + F4Jumble | variable |

HRPs differ on testnet (typical convention: `tm`, `tn`, `zt`,
`utest`, etc.). See
[`components/zcash_protocol/src/constants/mainnet.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/constants/mainnet.rs)
and `testnet.rs`.

## 4. Failure modes

- **Non-hardened shielded derivation.** ZIP 32 originally allowed
  non-hardened Sapling derivation. ZIP 316 explicitly disallows it
  inside the unified container. Code paths that allow it produce
  USKs whose viewing-key descendants can be inverted to spending
  keys; any change must keep the hardened-only check.
- **F4Jumble length-rounding bugs.** Forgetting to include the
  16-byte HMAC tag in the F4Jumble input is a documented historical
  implementation bug. The padding rule must be applied to the
  TLV-plus-HMAC concatenation, not the TLV alone, or the encoding
  is not the spec's encoding and external wallets reject it. The
  test vectors in
  [`components/f4jumble/src/test_vectors.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/f4jumble/src/test_vectors.rs)
  cover both directions and the length boundaries.
- **Diversifier-skip side channels.** Diversifier enumeration must
  skip invalid points without leaking timing information beyond
  "this index did not work". `DiversifyHash` failures are uniform
  in cost across indices.
- **UFVK leakage equals address graph leakage.** A leaked UFVK
  reveals every diversified address an account has ever used.
  Wallet UI must treat UFVKs as sensitive even though they cannot
  spend. This is a policy invariant, not a code bug per se.
- **Wrong $\mathsf{ToScalar}$ reduction.** $\mathsf{ToScalar}$
  reduces a 64-byte string modulo the curve order. Substituting a
  32-byte truncation biases the key distribution and silently
  breaks unlinkability proofs. The same failure mode applies to
  $\mathsf{ToBase}$ for Orchard.
- **Forgetting the `unknown` field on round trip.** A UFVK parsed
  with an unknown typecode must preserve the bytes in the
  `unknown` field so re-encoding produces the exact same string.
  Dropping unknown typecodes breaks future-compatible wallets.

Round-trip tests under
[`zcash_keys/src/keys.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs#L1920-L2030)
cover USK -> UFVK -> string -> UFVK paths.

## 5. Spec pointers

- [ZIP 32 - Shielded Hierarchical Deterministic Wallets](https://zips.z.cash/zip-0032):
  the derivation algorithm cited in Section 2.1 and implemented in
  the `zip32` crate.
- [ZIP 316 - Unified Addresses and Viewing Keys](https://zips.z.cash/zip-0316):
  defines USK, UFVK, UA, the typecode table, the padding and HMAC
  rules, and references F4Jumble.
- [ZIP 48 - Deriving Transparent UFVKs](https://zips.z.cash/zip-0048):
  the transparent-account-level key inside a UFVK; implemented in
  `zcash_transparent/src/zip48.rs`.
- [Zcash Protocol Specification, section 4.2](https://zips.z.cash/protocol/protocol.pdf):
  the Sapling and Orchard key trees including the
  $\mathsf{ToScalar}$ and $\mathsf{ToBase}$ reductions.
- [BIP 32 - Hierarchical Deterministic Wallets](https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki):
  the parent algorithm ZIP 32 extends.
- [F4Jumble specification (ZIP 316 appendix)](https://zips.z.cash/zip-0316#solution-jumbling):
  the Feistel round structure and BLAKE2b personalisations.

## 6. Exercises

1. **Decode a UA by hand.** Take a mainnet Unified Address, run
   bech32m decode on it, then call
   [`f4jumble::f4jumble_inv`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/f4jumble/src/lib.rs#L300-L320)
   on the bytes. Identify the TLVs and the trailing 16-byte HMAC.
   Cite the typecodes you found.
2. **Find the hardened check.** Locate the assertion in the `zip32`
   crate (or in `zcash_keys`) that prevents non-hardened derivation
   on shielded paths. State the file and line and explain what the
   error message tells a caller.
3. **Modify and test (code change).** Under `zcash_keys`, add a unit
   test that builds a `UnifiedSpendingKey` from a fixed seed,
   converts it to a `UnifiedFullViewingKey`, re-encodes to a string
   and back, and asserts byte-exact equality. The test must fail if
   the `unknown` field is dropped during a round trip; verify by
   temporarily clearing the field and confirming the assertion
   fires.

### Answers in the code

- USK construction:
  [`zcash_keys/src/keys.rs#L236-L256`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs#L236-L256).
- USK -> UFVK:
  [`zcash_keys/src/keys.rs#L280-L290`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs#L280-L290).
- F4Jumble core:
  [`components/f4jumble/src/lib.rs#L137-L173`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/f4jumble/src/lib.rs#L137-L173).
- UA receivers:
  [`components/zcash_address/src/kind/unified/address.rs#L8-L39`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_address/src/kind/unified/address.rs#L8-L39).

## 7. Further reading

- [chapter 07](./07-transactions-and-builder.md): how Unified keys
  become inputs to the transaction builder.
- [chapter 08](./08-note-encryption.md): how $\mathsf{ivk}$ and
  $\mathsf{ovk}$ are used at decryption time.
- [chapter 23](./23-key-catalog.md): per-symbol reference for every
  key in this chapter.
