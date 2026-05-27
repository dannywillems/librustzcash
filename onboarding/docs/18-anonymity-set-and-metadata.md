---
sidebar_position: 18
title: Anonymity set and metadata
description: "Privacy beyond cryptography: behaviour, network, dummies."
---

# 18 - Anonymity set and metadata

## 1. Why this chapter exists

The cryptography in Zcash provides strong unlinkability of shielded
spend/output pairs, but cryptography alone does not give privacy. The
**anonymity set** (the set of plausible alternative spenders or
recipients) and the **metadata** observable on-chain and off-chain
both shape what an adversary can infer. A contributor who modifies
[`zcash_client_backend::scanning`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/scanning.rs),
the proposal pipeline in
[`zcash_client_backend::data_api::wallet`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/data_api/wallet.rs),
or the Tor integration in
[`zcash_client_backend::tor`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/tor.rs)
needs the analytical lens this chapter provides. It is the operational
counterpart to chapters 04, 05, and 08.

## 2. Definitions

**Definition (Anonymity set).** For a shielded spend at height $h$
in a pool $P$, the anonymity set is the set of unspent notes in $P$
at height $h$ that could plausibly have been the one spent. Formally,

$$
A_P(h) \;=\; \{ \mathsf{cm} \in T_P(h) :
   \mathsf{cm} \text{ has not been nullified, } v > 0\},
$$

where $T_P(h)$ is the commitment tree of pool $P$ at height $h$.

A first-order estimate of $|A_P(h)|$ is

$$
|A_P(h)| \;\approx\; \sum_{i \le h} \text{outputs}_P(i)
              \;-\; \sum_{i \le h} \text{spends}_P(i)
              \;-\; \text{dust}(h),
$$

with the implicit assumption that all unspent notes are uniformly
plausible candidates. The assumption is rarely exact; behavioural
heuristics shrink the effective set.

**Definition (Privacy goals).** Three orthogonal properties:

1. **Transaction graph unlinkability**: an observer cannot link an
   output to the input that funded it.
2. **Value privacy**: an observer cannot tell the value being moved.
3. **Sender/recipient privacy**: an observer cannot identify the
   sender or recipient.

Shielded Zcash provides all three within a shielded pool, conditional
on a non-trivial anonymity set.

**Definition (Metadata leak).** Any side-channel observable outside
the cryptographic envelope: amounts that match transparent flows on
either side, distinctive timing, address reuse, network endpoints
contacted by the wallet, memos written to logs, scanning duration.
Metadata can reduce the effective anonymity set arbitrarily, down to
one in worst cases.

**Definition (Dummy spend/output).** A zero-value
SpendDescription or OutputDescription with fresh randomness and a
valid proof, indistinguishable from a real one to outside observers.
Used to pad input/output counts so that the bundle's shape does not
leak.

**Definition (Diversifier).** An $88$-bit input to
$\mathsf{DiversifyHash}$ that produces a distinct diversified
transmission key $\mathsf{pk}_d$ from the same incoming viewing key
$\mathsf{ivk}$. A wallet can hand out fresh diversifiers without
disclosing the shared $\mathsf{ivk}$. See chapter 23 for the
keying-material details.

## 3. The code

### 3.1 Scanning and trial decryption

Scanning is where most secret-dependent timing risks live. Every
compact output is trial-decrypted against every active incoming
viewing key, and the result must be constant-time so that a network
observer or a side-channel attacker cannot tell which key succeeded.

The scanner's entry point is `scan_block` in
[`zcash_client_backend/src/scanning.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/scanning.rs):

```rust reference title="zcash_client_backend/src/scanning.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/scanning.rs#L609-L622
```

Per-output trial decryption must not branch on the success of an
individual key match (see chapter 14). The constant-time discipline
is the reason a wallet's "decryption time per block" is roughly
linear in the key count regardless of how many notes belong to the
user.

### 3.2 Network privacy: Tor

The wallet can tunnel light-client traffic through Tor circuits via
`arti_client`. The integration lives in
[`zcash_client_backend/src/tor.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/tor.rs):

```rust reference title="zcash_client_backend/src/tor.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/tor.rs#L1-L60
```

The library exposes the capability; whether the embedding application
uses it is a deployment decision. The HTTP and gRPC clients have
Tor-aware variants under `tor/http.rs` and `tor/grpc.rs`.

### 3.3 The diversifier and address rotation

A Sapling or Orchard $\mathsf{ivk}$ can produce roughly $2^{88}$
diversified addresses. Best practice: a new diversifier per
counterparty, or even per payment request. The wallet stores
diversifier indices per account in the SQLite backend; the
`UnifiedAddressRequest` API in
[`zcash_keys/src/keys.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_keys/src/keys.rs)
selects which receivers a fresh address contains.

Address reuse leaks across multiple transactions: the same
$(d, \mathsf{pk}_d)$ being credited multiple times tells the
counterparty who supplied $d$ about the holder's transaction
activity to that address. The cost of fresh diversifiers is one
FF1 evaluation per address; the privacy gain is significant.

### 3.4 Memo handling

The Sapling and Orchard memo is up to 512 bytes of recipient-only
plaintext, encrypted as part of the note ciphertext. The container
type is `MemoBytes` in
[`components/zcash_protocol/src/memo.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/memo.rs):

```rust reference title="components/zcash_protocol/src/memo.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/memo.rs#L54-L94
```

The fixed 512-byte ciphertext length means content length does not
leak from the wire. What leaks at the application boundary:

- The recipient holds the plaintext and can leak it via logging or
  indexing.
- A merchant logging memos as customer references creates a
  cross-link between identities and shielded inflows.
- The sender can also see the memo on outgoing recovery via
  $\mathsf{ovk}$.

The library cannot enforce recipient-side discretion; wallet UX must.

### 3.5 Proposal pipeline and dummies

`zcash_client_backend::data_api::wallet` exposes the proposal
construction APIs that decide which notes to spend, how many dummies
to add, and which pool to prefer. The dummy-insertion logic, when
present, lives behind the proposal step before transactions are
built. The fee module
[`zcash_primitives/src/transaction/fees.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/fees.rs)
governs the per-component pricing, which influences whether dummies
are cheap enough to add by default.

A bundle with $k$ real spends and $k'$ dummies presents an
attacker with at least $\binom{k + k'}{k}$ candidate "real spend"
subsets, all of which produce identical wire footprints.

### 3.6 Cross-pool migrations

A transaction with inputs in Sapling and outputs in Orchard (or vice
versa) is visible as such on-chain: the bundle structure reveals
which pools are present. The
[`zcash_primitives/src/transaction/components.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components.rs)
component types make this explicit, and the builder in
[`zcash_primitives/src/transaction/builder.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/builder.rs)
emits separate Sapling and Orchard bundles. A migration transaction
is therefore distinguishable from a pure-Orchard one. Batching and
random timing are the operational mitigations; neither is enforced
in code.

### 3.7 ZIP 320 and TEX addresses

A user with only a Unified Address (UA) cannot trivially receive a
transparent payment without exposing a transparent receiver. ZIP 320
defines TEX (Transparent-Source-Only) addresses that signal to the
sender that the destination converts incoming transparent value into
shielded value immediately. The address type lives in
[`components/zcash_address/`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_address/src)
and the wallet transparent address rotation in
[`zcash_transparent/src/keys.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_transparent/src/keys.rs).

### 3.8 The shielded-value-balance leak

Each transaction reveals its per-pool $v_{\text{balance}}$
publicly. Over many blocks an analyst can compute the net shielded
inflow and outflow at the chain level. This is a macro leak: it
does not deanonymise individual users, but it shapes the
privacy quality of the chain as a whole.

## 4. Failure modes

- **Sprout linkability (Quesnelle 2017).** A sizeable fraction of
  early Sprout usage was trivially linkable because users moved
  funds in transparent -> Sprout -> transparent patterns where the
  value and timing on both transparent sides matched. Lesson: the
  effective anonymity set is the set of transactions with similar
  shape and timing.
- **Sprout deanonymisation via mining pools (Kappos et al., USENIX
  2018).** Using publicly known mining-pool addresses as ground
  truth, the authors estimated that roughly 70% of Sprout
  transactions at the time could be linked with high confidence.
  The fix is operational, not cryptographic.
- **Side-channel deanonymisation (Tramer et al., USENIX 2020).** An
  attacker who can probe a wallet's network traffic or measure its
  CPU usage can determine which trial decryption succeeded. The
  scanner in
  [`zcash_client_backend/src/scanning.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/scanning.rs)
  must execute identical work per output regardless of which key
  matches. See chapter 14.
- **Address reuse.** Repeated payments to the same $(d, \mathsf{pk}_d)$
  let the supplier of $d$ correlate the recipient's transaction
  history. The wallet must rotate diversifiers per payment request.
- **Birthday leak during IBD.** A new wallet doing initial block
  download must scan every shielded output since its birthday. The
  birthday timestamp leaks the wallet's existence. The user-
  configurable birthday in the data API is the only mitigation.
- **Dummy mismatch.** A bundle with dummies that have non-default
  field shapes (different randomness distributions, different
  encrypted-note structure) is trivially distinguishable from a
  bundle of real spends. The builder must produce dummies that are
  bit-by-bit indistinguishable.
- **Memo leakage at the recipient.** A merchant or service that
  logs memos verbatim creates a cross-link between counterparty
  identities and shielded inflows. The library cannot prevent this.
- **Network-layer correlation.** A non-Tor wallet connecting to a
  single lightwalletd reveals the wallet's IP address and timing
  pattern. Multiple endpoints plus Tor are the available defences.

## 5. Spec pointers

- [Zcash Protocol Specification, section 8 (Differences from the
  Zerocash paper)](https://zips.z.cash/protocol/protocol.pdf):
  documents the privacy properties relative to the original
  Zerocash construction.
- [ZIP 316](https://zips.z.cash/zip-0316): Unified Addresses,
  diversifier semantics, and the internal/external sub-tree split
  that change addresses use.
- [ZIP 320](https://zips.z.cash/zip-0320): TEX addresses and
  transparent payment flows into UAs.
- [Quesnelle, "On the linkability of Zcash transactions"](https://arxiv.org/abs/1712.01210):
  the 2017 paper on Sprout-era linkability. Read for the
  methodology, not the numbers; usage patterns have changed.
- [Kappos, Yousaf, Maller, Meiklejohn, "An empirical analysis of
  anonymity in Zcash"](https://www.usenix.org/conference/usenixsecurity18/presentation/kappos):
  USENIX Security 2018. The clustering-by-mining-pool methodology.
- [Tramer, Boneh, Paterson, "Remote side-channel attacks on
  anonymous transactions"](https://www.usenix.org/conference/usenixsecurity20/presentation/tramer):
  USENIX Security 2020. The trial-decryption timing leak and its
  remediation.

## 6. Exercises

1. **Estimate an anonymity set.** Using on-chain data (e.g.
   `zcashd`'s `getblockchaininfo` and `getrawtransaction`, or a
   block explorer), compute the cumulative count of unspent
   Sapling notes and unspent Orchard notes at the current tip.
   State the assumption you made about "dust" and how it affects
   the estimate. Cite the data source.
2. **Trace a scan path.** Open
   [`zcash_client_backend/src/scanning.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/scanning.rs)
   and identify the function that performs trial decryption per
   output. Locate the line where a successful match is recorded
   and confirm that no `if` or `match` branches on whether the
   match succeeded before that point.
3. **Modify and test.** In a checkout, add a unit test under
   `zcash_client_backend` that constructs two compact outputs, one
   addressed to a known $\mathsf{ivk}$ and one to a random one,
   and asserts that `scan_block` runs in indistinguishable wall
   time for both. (The assertion can be heuristic, e.g. the ratio
   of medians over $n$ runs is within 5%.) State whether your
   test reproduces a known leak or confirms its absence.
4. **Audit a memo path.** Locate every site in the workspace where
   a memo plaintext is logged, printed, or written to disk. Argue
   whether each such site is privacy-safe given the threat model
   in Section 4.

### Answers in the code

- `scan_block` entry point:
  [`zcash_client_backend/src/scanning.rs#L609-L622`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/scanning.rs#L609-L622).
- Tor client setup:
  [`zcash_client_backend/src/tor.rs#L1-L60`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_client_backend/src/tor.rs#L1-L60).
- Memo container:
  [`components/zcash_protocol/src/memo.rs#L54-L94`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/components/zcash_protocol/src/memo.rs#L54-L94).

## 7. Further reading

- [chapter 14](./14-side-channels-and-constant-time.md):
  constant-time scanning and other side-channel disciplines.
- [chapter 21](./21-active-research-and-nu7.md): anonymity-set
  consolidation discussions and ZIP 233 burn mechanism.
- Biryukov, Khovratovich, Tikhomirov, "Privacy aspects and
  subliminal channels in Zcash" (CCS 2019): a broader empirical
  view of Zcash privacy from outside the project.
- [The Zcash Foundation engineering blog](https://www.zfnd.org/blog/):
  periodic posts on anonymity-set size and protocol-level mitigations.
