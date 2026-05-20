# 06 - Keys, addresses, ZIP 32, unified addresses

## Goal

Map the key-derivation hierarchy used in Zcash, with the math behind
each step. Then explain how the various key types are bundled into
**Unified Spending Keys**, **Unified Viewing Keys**, and **Unified
Addresses**, including the F4Jumble transformation that protects them
from visual-forgery attacks.

This is mostly bookkeeping cryptography (key derivation, encoding) but
the bookkeeping is where the wallet meets the protocol, and bugs here
have caused real-world incidents.

## 1. The big picture

Each Zcash account has, at the top, a 32-byte **mnemonic-derived seed**
(BIP-39 mnemonic feeds BIP-32-style derivation). From this seed,
deterministic per-pool spending keys are derived via **ZIP 32**, which
is a Zcash-specific extension of BIP 32 / SLIP-10.

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

The **Unified Spending Key (USK)** for an account is the tuple of all
the per-pool spending keys plus a transparent extended key. The
**Unified Full Viewing Key (UFVK)** is the corresponding tuple of full
viewing keys. The **Unified Address (UA)** is a packaged set of
per-pool *receivers* derived from those keys, encoded in a way that
hides which pools are available.

## 2. ZIP 32 derivation

ZIP 32 is the Zcash analogue of BIP 32. Two flavours:

- **Sapling extended spending keys** (ZIP 32, before NU5).
- **Orchard extended spending keys** (ZIP 32 + ZIP 316, since NU5).

The derivation function uses BLAKE2b with a per-pool personalisation.
At a high level, given a parent extended key $(\mathsf{esk}, c)$ where
$\mathsf{esk}$ is the spending key material and $c$ is a 32-byte
chain code, deriving a child at index $i$:

$$
I \;=\; \mathsf{BLAKE2b\text{-}512}(c, \mathsf{esk} \,\|\, i \,\|\, 0\text{x}11),
\qquad
\mathsf{esk}_\text{child} = \mathsf{ToScalar}(I[0..32]),
\quad
c_\text{child} = I[32..64].
$$

Hardened derivation prepends a different tag byte and uses the parent
*private* key; non-hardened derivation uses the parent *public* key
and is supported only for non-shielded paths.

For Zcash, all derivations along the standard path
$m / 32' / \text{coin\_type}' / \text{account}'$ are **hardened**.
Coin type is $133' \;(= 0x80000085)$ for mainnet, $1' \;(= 0x80000001)$
for testnet.

For Sapling specifically, the spending key at the account level is a
24-byte chain seed plus an `ovk` derivation. From there the full
viewing key $(\mathsf{ak}, \mathsf{nk}, \mathsf{ovk})$ is computed as
in chapter 04.

Read in code:

- `zcash_keys/src/keys.rs`: integration types,
  `UnifiedSpendingKey`, `UnifiedFullViewingKey`.
- `zip32` crate (external): the actual derivation logic, parameterised
  by per-pool key types.

## 3. Sapling derivation, in math

From a 32-byte expanded spending key $\mathsf{sk}_{\text{sap}}$:

$$
\mathsf{ask} = \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{sap}}}(0\text{x}00)\bigr),
$$

$$
\mathsf{nsk} = \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{sap}}}(0\text{x}01)\bigr),
$$

$$
\mathsf{ovk} = \mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{sap}}}(0\text{x}02)[0..32],
$$

$$
\mathsf{dk}  = \mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{sap}}}(0\text{x}10)[0..32].
$$

Then $\mathsf{ak} = [\mathsf{ask}] G^{\mathsf{ak}}$,
$\mathsf{nk} = [\mathsf{nsk}] G^{\mathsf{nk}}$.

Computing the **incoming viewing key**:

$$
\mathsf{ivk}_{\text{sap}}
\;=\;
\mathsf{CRH}^{\mathsf{ivk}}(\mathsf{ak}, \mathsf{nk})
\;=\;
\mathsf{BLAKE2s\text{-}256}\!\bigl(
\text{pers}=\text{"Zcashivk"}, \,
\text{repr}_{\mathbb{F}_r}(\mathsf{ak}) \mathbin{\|} \text{repr}_{\mathbb{F}_r}(\mathsf{nk})
\bigr) \mod \ell.
$$

Diversifiers are generated deterministically from $\mathsf{dk}$:

$$
\mathsf{div}_i \;=\; \mathsf{FF1\text{-}AES}_{\mathsf{dk}}(\text{Encode}(i)) \mod 2^{88},
$$

with FF1 the NIST format-preserving encryption (here over 88-bit
blocks). Not every $\mathsf{div}_i$ produces a valid Jubjub point: the
function $\mathsf{DiversifyHash}$ returns $\bot$ for invalid inputs, and
the wallet enumerates $i = 0, 1, 2, \ldots$ until it finds a valid one.

The Sapling payment address is

$$
\text{addr}_i = (\mathsf{div}_i, \mathsf{pk}_d^{(i)} = [\mathsf{ivk}_{\text{sap}}] g_d^{(i)}).
$$

Encoded as 43 bytes (11-byte diversifier $\|$ 32-byte $\mathsf{pk}_d$
$y$-bit encoded), then bech32m with HRP `zs` for mainnet.

## 4. Orchard derivation, in math

Similarly, from $\mathsf{sk}_{\text{orch}}$:

$$
\mathsf{ask} = \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{orch}}}(0\text{x}06)\bigr),
$$

$$
\mathsf{nk}  = \mathsf{ToBase}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{orch}}}(0\text{x}07)\bigr),
$$

$$
\mathsf{rivk} = \mathsf{ToScalar}\!\bigl(\mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{orch}}}(0\text{x}08)\bigr),
$$

$$
\mathsf{ovk} \mathbin{\|} \mathsf{dk}
\;=\; \mathsf{PRF}^{\text{expand}}_{\mathsf{sk}_{\text{orch}}}(0\text{x}82, \mathsf{ak}, \mathsf{nk}).
$$

$\mathsf{ak}$ is a Pallas point; $\mathsf{nk}$ is a Pallas *field
element*, not a point (this is one of the Orchard simplifications).
$\mathsf{rivk}$ randomises the $\mathsf{CommitIvk}$ Sinsemilla
commitment that produces $\mathsf{ivk}_{\text{orch}}$.

The fact that Orchard's $\mathsf{nk}$ is a field element matters for
efficient in-circuit hashing: feeding a scalar straight into Poseidon
is much cheaper than first decoding a curve point.

## 5. Unified Spending Keys and Viewing Keys

A **Unified Spending Key** is the tuple

$$
\mathsf{USK} = \bigl(\, \mathsf{xsk}_{\text{T}}, \; \mathsf{esk}_{\text{S}}, \; \mathsf{sk}_{\text{O}} \,\bigr),
$$

containing whichever pool keys are configured for the account. A
**Unified Full Viewing Key** is the analogous tuple of viewing keys:

$$
\mathsf{UFVK} = \bigl(\, \mathsf{xpub}_{\text{T}}, \; \mathsf{efvk}_{\text{S}}, \; \mathsf{fvk}_{\text{O}} \,\bigr).
$$

Each component has a typed identifier (`Typecode`, see ZIP 316). The
container format is **revisable**: as new pools are added, new typecodes
appear, and old parsers must skip them gracefully (or refuse to
display addresses with unknown receivers).

Encoding:

1. Concatenate per-typecode TLVs:
   $\text{typecode} \,\|\, \text{length} \,\|\, \text{data}$.
2. Append a 16-byte HMAC over the concatenation with a fixed key.
3. Apply **F4Jumble** to the resulting bytes.
4. Bech32m with HRP `u` for UAs, `uview` for UFVKs.

Read: ZIP 316. Code: `components/zcash_address/src/kind/unified.rs` and
`components/zcash_address/src/kind/unified/`.

## 6. F4Jumble

F4Jumble exists to defend against a specific attack: when a hardware
wallet displays an encoded address on a tiny screen, users compare a
few characters at the start and end. A naive encoding (concatenation
+ bech32) lets an attacker change the *middle* bytes without changing
the prefix or suffix, sneaking a different receiver past the user's
visual check.

F4Jumble is a length-preserving **4-round unkeyed Feistel** that turns
any 1-bit input change into a uniformly random output change. The
construction (from `f4jumble` crate header):

Split the message $m$ of byte length $\ell_m$ into halves $L \,\|\, R$
of lengths $\ell_L, \ell_R$ chosen as

$$
\ell_L = \min(\lfloor \ell_m / 2 \rfloor + 1, \, 128), \qquad \ell_R = \ell_m - \ell_L.
$$

Then four rounds:

$$
R_1 = R \oplus G_0(L), \quad
L_1 = L \oplus H_0(R_1), \quad
R_2 = R_1 \oplus G_1(L_1), \quad
L_2 = L_1 \oplus H_1(R_2).
$$

Output: $L_2 \,\|\, R_2$.

The $G$ and $H$ functions are constructed from BLAKE2b with rich
domain separation involving the round index, the chunk index (for
messages longer than 128 bytes), and a `f4jumble` personalisation.
For $\ell_m \leq 128$ this is 4 BLAKE2b compressions; for
$128 < \ell_m \leq 192$ it grows to 6; the algorithm is defined up to
$\ell_m = 4194368$ bytes.

Crucially, F4Jumble is **its own inverse** when the round structure is
reversed; both functions are length-preserving. The inverse is needed
on decode.

Read: `components/f4jumble/src/lib.rs`. Test vectors are in
`test_vectors.rs` and exercise both directions.

## 7. Unified Address structure

A Unified Address packages **receivers** for different pools:

| Typecode | Receiver |
| --- | --- |
| 0x00 | P2PKH transparent receiver (20-byte $\mathsf{hash160}$) |
| 0x01 | P2SH transparent receiver (20-byte $\mathsf{hash160}$) |
| 0x02 | Sapling receiver (43 bytes: 11 + 32) |
| 0x03 | Orchard receiver (43 bytes) |

Plus future-reserved typecodes. The wallet selects the *highest*
priority pool that both sides support when constructing a transaction
to a UA: typically `Orchard > Sapling > P2PKH > P2SH`. A sender's
viewing key must be capable of authoring a transaction in the chosen
pool, but the receiver of the UA simply provides the receiver public
data.

Padding rule: pad with `null` (0xFFFFFFFF) typecode entries up to a
length that aligns to F4Jumble's break points; this hides exactly
which receivers were omitted.

A length and revision marker is included so that wallets refuse to
display a UA they cannot fully parse: this is to prevent a
**privacy-leak attack** where a sophisticated attacker uses an
unknown typecode to identify the recipient by a side-channel.

## 8. Transparent keys

For completeness: the transparent layer uses standard Bitcoin-style
BIP-44 derivation:

- Path: $m / 44' / 133' / \text{account}' / \text{change} / \text{index}$.
- secp256k1 keys.
- $\mathsf{addr} = \text{base58check}\bigl(\text{prefix} \,\|\,
  \mathsf{hash160}(\mathsf{pubkey})\bigr)$ for P2PKH.
- $\mathsf{hash160}(x) = \mathsf{RIPEMD160}(\mathsf{SHA256}(x))$.

Encoded in `zcash_transparent/src/keys.rs`, `address.rs`, and consumed
by `zcash_keys` via the `transparent-inputs` feature.

ZIP 316 also defines transparent **receivers** inside UAs: just the
20-byte $\mathsf{hash160}$ with a typecode (0x00 P2PKH, 0x01 P2SH).
These do not specify a derivation path; the parent UFVK does.

ZIP 48 (in `zcash_transparent/src/zip48.rs`) defines transparent
account-level keys for use inside a UFVK.

## 9. Outgoing vs incoming viewing keys

Two viewing-key flavours per shielded pool:

- **Incoming viewing key** ($\mathsf{ivk}$): can decrypt outputs sent
  *to* this account.
- **Outgoing viewing key** ($\mathsf{ovk}$): can decrypt outputs sent
  *from* this account (the sender wants to be able to see their own
  outgoing payments without keeping per-output state).

The full viewing key includes both. The `dk` (diversifier key) is
needed to enumerate one's own diversified addresses.

## 10. Address encoding cheat sheet

| Address kind | HRP | Encoding | Length |
| --- | --- | --- | --- |
| P2PKH (mainnet) | `t1` (prefix) | base58check | 35 chars |
| P2SH | `t3` | base58check | 35 |
| Sprout | `zc` | base58check | 95 |
| Sapling | `zs` | bech32 | 78 |
| Unified Address | `u` | bech32m + F4Jumble | variable |
| Unified Full Viewing Key | `uview` | bech32m + F4Jumble | variable |

All HRPs change for testnet (typical convention: `tm`, `tn`, `zt`,
`utest`, etc.). See `components/zcash_protocol/src/constants/mainnet.rs`
and `testnet.rs`.

## 11. Pitfalls and historical bugs

- ZIP 32 originally allowed non-hardened Sapling derivation; ZIP 316
  explicitly disallows it inside the unified container.
- Diversifier enumeration must skip invalid points without leaking
  timing information beyond "this diversifier did not work" - the
  cost is uniform over indices in `librustzcash`.
- The F4Jumble padding must be correctly accounted for in length
  bounds; failing to include the HMAC bytes in the F4Jumble input was
  a real implementation bug caught early.
- UFVKs include the diversifier key $\mathsf{dk}$; a leaked UFVK
  reveals all of an account's diversified addresses. Wallet-policy
  consequence: UFVKs are sensitive, even though they cannot spend.

## What you should know after this chapter

- ZIP 32 path structure and what "hardened" means.
- The math of the Sapling and Orchard key trees.
- The structure of a Unified Address: TLV typecodes, HMAC, F4Jumble,
  bech32m.
- Why F4Jumble is necessary and what it computes.
- The split between IVK and OVK and what each lets you do.

Next chapter: how transactions are built, signed, and serialised.
