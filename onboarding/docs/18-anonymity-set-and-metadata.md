---
sidebar_position: 18
title: Anonymity set and metadata
description: "Privacy beyond cryptography: behaviour, network, dummies."
---

# 18 - Anonymity set and metadata

## Goal

The cryptography in Zcash provides strong unlinkability of *shielded*
spend/output pairs. But cryptography alone does not give privacy:
the **anonymity set** (the set of plausible alternative spenders /
recipients) and the **metadata** observable on-chain and off-chain
both shape what an adversary can infer.

This chapter walks through the analytical lens you should apply
when reasoning about a privacy-touching change. It is the operational
counterpart to chapters 04, 05, 08.

## 1. What "privacy" means in Zcash

There are at least three orthogonal goals:

1. **Transaction graph unlinkability**: cannot link an output to
   the input that funded it.
2. **Value privacy**: cannot tell the value being moved.
3. **Sender/recipient privacy**: cannot tell who sent or received.

Shielded Zcash provides all three *within the shielded pool*, in
principle. The strength depends on the anonymity set.

## 2. The anonymity set

For a shielded spend, the anonymity set is the set of unspent
shielded notes at the moment of spending: any of them *could* have
been the one spent. Larger sets mean stronger privacy.

For Sapling: ~all notes in the Sapling tree that have not been
spent. The tree is global; the proof shows membership without
revealing which leaf.

For Orchard: same but in the Orchard tree.

The cardinality of these sets, at any moment, can be approximated
from on-chain data:

$$
|\text{anonymity set}_{\text{Sap}}|
\;=\;
\sum_{\text{blocks}} (\text{outputs created}) \;-\; \sum_{\text{blocks}} (\text{spends})
\;-\; (\text{dust})
$$

(With the implicit assumption that all unspent notes are uniformly
plausible candidates.)

As of late 2024, the Sapling anonymity set is on the order of a few
million notes; Orchard's is growing but smaller. ZIP 320 and the
Orchard adoption push, plus the late 2024 deprecation of Sapling
for new outputs (under discussion), aim to consolidate the
anonymity set in Orchard.

## 3. The "Sprout linkability" lesson

In 2017, Quesnelle showed that a sizeable fraction of Sprout usage
was *trivially linkable*: many users moved funds in transparent
$\to$ Sprout $\to$ transparent patterns where the value and timing
on both transparent sides could be matched.

Lesson: the anonymity set is reduced to *transactions with
similar shape and timing*. If you are the only person to spend
$1.234 \text{ ZEC}$ shielded that hour, you stand out.

Wallet UX must avoid distinctive patterns:

- Round-number amounts that match transparent inputs.
- Same-block in/out flows.
- User-identifiable memos.
- Address reuse (sending many shielded txs to the same transparent
  address).

The wallet layer in this codebase does not enforce these directly;
that is the wallet UI's responsibility. But the proposal and fee
APIs expose enough surface to make some of these explicit.

## 4. The Kappos et al. analysis

USENIX 2018. Kappos, Yousaf, Maller, Meiklejohn.

Methodology:

- Cluster Sprout deposits and withdrawals by amount, timing, and
  user heuristics.
- Use mining-pool addresses (publicly known) as a "ground truth" to
  estimate how many shielded txs were merely passing through pool
  payouts.
- Estimated that $\sim 70\%$ of Sprout txs at the time could be
  linked with high confidence.

The fix is not cryptographic; it is operational. Users must
understand that their behaviour determines their privacy.

## 5. Side-channel deanonymisation (Tramèr et al.)

USENIX 2020.

Demonstrated that an attacker who can probe a wallet's network
traffic or measure its CPU usage can determine which trial
decryption succeeded (and thus which key was used). Mitigations:

- Constant-time trial decryption (chapter 14).
- Padded outbound network traffic.
- Tor or other anonymity network for `lightwalletd` connections.

In `zcash_client_backend::tor`, the wallet can tunnel traffic
through Tor circuits. Whether it does so is a deployment choice;
the library exposes the capability.

## 6. The diversifier and address reuse

A Sapling/Orchard $\mathsf{ivk}$ can produce $\sim 2^{88}$
diversified addresses. Best practice: a new diversifier per
counterparty (or even per transaction). The wallet implements this
as the `addresses` table in the SQLite backend, with a
"next_diversifier_index" counter.

Address reuse leaks across multiple transactions: the same
$(d, \mathsf{pk}_d)$ being credited multiple times tells the
counterparty (who supplied $d$) about your transaction activity to
the address.

For a privacy-conscious wallet, ALWAYS use a fresh diversifier per
payment-request. The cost is tiny (an FF1 evaluation).

## 7. The memo leak

The memo is up to 512 bytes of arbitrary recipient-only data. It
is encrypted to the recipient. But:

- Its length is fixed (512 bytes ciphertext) regardless of content,
  so length does not leak.
- Its content is opaque from a third-party view.
- The recipient sees it in plaintext.
- The sender sees it (via $\mathsf{ovk}$ recovery).

Recipient-side leaks:

- A merchant logging memos as customer references creates a
  cross-link between identities and shielded inflows.
- A user importing all received memos into a search-indexable
  database trivially deanonymises themselves.

Wallet UX must surface these risks, but the library cannot enforce
them.

## 8. Timing and IBD privacy

A new wallet doing initial block download (IBD) must scan every
shielded output since the wallet's birthday. This is a
non-trivial computational task and visible on the network: the
wallet downloads $\sim 100$ blocks of compact data, decrypts $\sim
10{,}000$ outputs, and records the matches.

Privacy concerns:

- The wallet's "birthday" leaks the wallet's existence.
- The wallet's network endpoints (lightwalletd, Tor) see the IBD
  pattern.
- A malicious lightwalletd can attempt to slow-feed blocks to
  fingerprint clients.

Mitigations in `zcash_client_backend`:

- Birthday is configurable; users can set it to a reasonable point
  in the past.
- Multiple lightwalletd backends can be configured.
- Tor is supported.

## 9. The ZIP 320 "transparent payments through unified addresses"

A user with only a Unified Address (UA) cannot trivially receive a
transparent payment without exposing a transparent receiver. ZIP
320 proposes a mechanism where the wallet operator pre-generates
transparent addresses that map back to a shielded balance, allowing
transparent senders to pay a UA-only user. The privacy property:
the transparent address rotates so it cannot be used to track the
user across payments.

The proposal touches the wallet (transparent address rotation,
shielding policy) and the fee module (transparent inputs become
shielded outputs). It also has implications for the anonymity set:
each "shield-on-receive" transaction adds to the Orchard set.

Status: under active development; you will see ZIP 320 references
in issues and PRs.

## 10. Anonymity-set sizing in practice

The wallet's `data_api` can be extended with metrics:

- Per-pool unspent-output count.
- "Effective anonymity set" estimates, perhaps excluding obviously
  un-spendable outputs.
- Per-output "noteworthy" flags (round amount, distinctive memo,
  etc.) to warn users.

Implementing such metrics is one of the on-roadmap items; ZIP-Y
drafts exist.

## 11. Cross-pool linkability

Sapling and Orchard pools are operationally separate but
transactions can move value between them. A transaction with
inputs in Sapling and outputs in Orchard (or vice versa) is
visible as such on-chain (the bundle structure reveals which pools
are present).

Therefore:

- A "Sapling-to-Orchard migration" transaction is distinguishable
  from a pure-Orchard transaction.
- Adversaries can cluster users by their migration patterns.

Wallet best practice: batch migrations (so multiple users' funds
mingle in the migration set) and randomise timing.

## 12. The "shielded value gain" leak

Each transaction reveals its $v_{\text{balance}}$ per shielded pool
publicly. Over time, an analyst can see the *net* shielded inflow
vs outflow at the chain level. Some forms of analysis:

- Total shielded value over time.
- Rate of shielded $\to$ transparent migrations.
- Mining pool behaviour (most mining payouts are transparent, which
  shields the pool's payout patterns from shielded-side analysis).

This is a *macro* leak: it does not deanonymise individual users.
But it does affect the privacy-quality of the chain as a whole.

## 13. The "dummy" defence

Sapling and Orchard support dummy spends/outputs (zero-value, with
fresh randomness and valid proofs). They are indistinguishable from
real ones to outside observers and pad the visible input/output
counts.

The cost is the proving time for the dummy. The benefit is that an
adversary cannot use input/output count as a signal.

`zcash_client_backend::data_api::wallet`'s proposal pipeline can
add dummies to reach a configurable minimum count. ZIP-X drafts
discuss making this mandatory above some threshold.

## 14. Memo padding and standardisation

A common privacy improvement: pad memos to a fixed sub-length
ladder (e.g. 0, 32, 96, 224, 512 bytes) instead of using a single
560-byte ciphertext for all memos. But the existing format already
uses a single 512-byte plaintext field, so length does not leak.
What does leak (a tiny bit): whether the memo is "empty" (all
zeros) or "non-empty". The convention is that the wallet emits
randomly-chosen padding for empty memos, but this is not enforced.

## 15. Where this lives in the code

There is little direct code in this workspace dedicated to
anonymity-set analysis; it is the wallet developer's
responsibility. But several pieces matter:

- `zcash_client_backend::scanning`: must be constant-time per
  output regardless of which key matches.
- `zcash_client_backend::data_api::wallet`: proposal pipeline; can
  add dummies, can prefer Orchard over Sapling.
- `zcash_client_backend::tor`: the privacy-preserving network
  layer.
- The PCZT design: hardware wallets can sign without revealing
  spend keys or note values to the host.

## 16. The "shielded value pool consolidation"

There is an ongoing protocol discussion about whether to encourage
or even mandate consolidation into a single shielded pool (likely
Orchard) over time, by:

- Disabling new Sapling outputs (post-NU6 discussion).
- Adding incentive structures for migration.
- Eventually retiring Sapling entirely.

The arguments for and against involve anonymity-set economics:
a single large pool is better than two small pools, but only if
the migration is graceful.

## 17. Best-practice list (for you, as a principal)

When reviewing or designing a wallet feature, ask:

1. Does this leak any *secret*-dependent timing?
2. Does this leak any *user behaviour*-dependent metadata
   (which keys, which counterparties, which times)?
3. Does this introduce a new way for users to make their
   transactions distinctive?
4. Does this allow batching with other users' txs?
5. Are dummies used to obscure counts?
6. Does the network layer respect Tor or other anonymity
   provisions?
7. Is the memo handling explicit about its trust model?

## What you should know after this chapter

- That privacy in Zcash is cryptography + anonymity set +
  user behaviour, not just cryptography.
- The historical analyses (Quesnelle, Kappos, Tramèr) and what
  they taught us.
- Operational mitigations: dummies, address rotation, Tor,
  pool consolidation.
- That the wallet stack mediates many of these decisions, and
  that "library" decisions propagate to user privacy at scale.

Next: a catalog of the ZIPs you should read, in suggested order.
