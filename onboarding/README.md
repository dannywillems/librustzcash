# librustzcash Onboarding

A graduate-level reading course on `librustzcash`, with strong focus on the
cryptography. Each chapter combines protocol theory (with LaTeX math), pointers
into the actual Rust code in this workspace, and references to the canonical
specifications (ZIPs, the Zcash Protocol Specification, original papers).

The chapters are ordered as a study plan: you can read them in sequence, but
each is also written to be useful on its own as a reference once you know your
way around.

## How to read this course

LaTeX is rendered by GitHub when it is wrapped in `$...$` (inline) or
`$$...$$` (display). If you read this in plain text, install a viewer that
understands KaTeX (e.g. Obsidian, VSCode + Markdown+Math, `mdbook` with the
KaTeX preprocessor). The math is the substance of the chapters, not
decoration.

Every chapter has the same skeleton:

1. Motivation in 3-5 sentences.
2. The math: definitions, equations, security games.
3. The implementation: which crates, which modules, which functions.
4. Pointers to the spec (ZIPs, protocol PDF) and seminal papers.
5. Exercises with answers in the code.

## Chapters

The course splits into two halves. The first eleven chapters are the
"reading" course: protocol math, code layout, study plan. The second
half goes deeper into the parts a senior cryptographer must really
internalise: known bugs, low-level pitfalls, side channels, trusted
setups, anonymity-set analysis, and the practical checklist for
reviewing crypto PRs.

### Part I - Reading course

| # | Title | Focus |
| --- | --- | --- |
| 01 | [Overview and roadmap](./01-overview-and-roadmap.md) | Crate graph, layering, how the pieces fit |
| 02 | [Zcash protocol foundations](./02-zcash-protocol-foundations.md) | Consensus, value pools, network upgrades, transaction shape |
| 03 | [Cryptography primer](./03-cryptography-primer.md) | Groups, pairings, Pedersen, BLAKE2, RedDSA, ZK primer |
| 04 | [Sprout and Sapling](./04-sprout-and-sapling.md) | JoinSplit math, Sapling Spend/Output, Jubjub, BLS12-381, Groth16 |
| 05 | [Orchard and Halo 2](./05-orchard-and-halo2.md) | Pallas/Vesta, Action circuit, Halo 2 + IPA |
| 06 | [Keys, addresses, ZIP 32, unified addresses](./06-keys-addresses-zip32.md) | HD derivation, viewing keys, F4Jumble |
| 07 | [Transactions, sighash, builder, PCZT](./07-transactions-and-builder.md) | v4/v5/v6 layout, sighash trees, PCZT roles |
| 08 | [Note encryption](./08-note-encryption.md) | In-band secret distribution, OutCiphertext, KDF |
| 09 | [Equihash and consensus rules](./09-equihash-and-consensus.md) | Generalised birthday, history tree, PoW math |
| 10 | [Wallet stack](./10-wallet-stack.md) | client_backend, scanning, fees, SQLite storage |
| 11 | [Study plan and exercises](./11-study-plan-and-exercises.md) | Week-by-week schedule with self-tests |

### Part II - Deep dives and operational rigour

| # | Title | Focus |
| --- | --- | --- |
| 12 | [Historical bugs and security incidents](./12-historical-bugs.md) | 2018 counterfeit bug, ZIP 212, audit findings catalog |
| 13 | [Cofactors, subgroups, canonical encodings](./13-cofactors-subgroups-canonical.md) | Jubjub cofactor 8, ZIP 216, subgroup checks |
| 14 | [Side channels and constant-time](./14-side-channels-and-constant-time.md) | `subtle`, `zeroize`, vartime APIs to avoid |
| 15 | [Trusted setup ceremonies](./15-trusted-setup.md) | Powers of Tau, Sapling MPC, toxic waste, Halo 2 alternative |
| 16 | [Pedersen hash deep dive](./16-pedersen-hash-deep-dive.md) | Windowed encoding, generators, constraint counts |
| 17 | [Halo 2 deep dive](./17-halo2-deep-dive.md) | PLONKish, custom gates, lookups, IPA, transcript |
| 18 | [Anonymity set and metadata](./18-anonymity-set-and-metadata.md) | Privacy beyond cryptography: behaviour, network, dummies |
| 19 | [ZIP catalog and reading order](./19-zip-catalog.md) | Curated index of the ZIPs you must know |
| 20 | [Audits and cross-implementation testing](./20-audits-and-cross-impl.md) | Public audit reports, test vectors, Zebra / zcashd parity |
| 21 | [Active research and the road to NU7](./21-active-research-and-nu7.md) | v6 tx, ZSAs, ZIP 233 burn, recursion, PQ |
| 22 | [Cryptographer's code review checklist](./22-cryptographer-code-review.md) | The operational checklist for every crypto PR |

### Part III - Authoritative references

| # | Title | Focus |
| --- | --- | --- |
| 23 | [The complete key catalog](./23-key-catalog.md) | Every key symbol (ask, ak, nsk, nk, ivk, ovk, dk, esk, epk, ock, rsk, rk, rcm, rcv, rho, cv, cm, nf, bvk, ...) defined, derived, typed, and located in code |
| 24 | [Circuits, constraint by constraint](./24-circuits-constraint-by-constraint.md) | Sapling Spend, Sapling Output, Orchard Action: every clause with its constraint count and the attack each clause prevents |

## Notation used throughout

- $\mathbb{F}_p$: a prime field of order $p$.
- $\mathbb{G}$: a cyclic group of prime order $q$ written additively.
- $[k]P$: scalar multiplication of point $P$ by scalar $k$.
- $H_\ell(\cdot)$: a hash function with output length $\ell$ bits.
- $\langle \cdot, \cdot \rangle$: a pairing $e : \mathbb{G}_1 \times \mathbb{G}_2 \to \mathbb{G}_T$ when used in pairing contexts.
- $\mathsf{Com}(m; r)$: a commitment to message $m$ with randomness $r$.
- $\mathsf{Enc}_k, \mathsf{Dec}_k$: symmetric encryption/decryption with key $k$.
- $\stackrel{\$}{\leftarrow}$: uniform random sampling.
- $a \mathbin{\|} b$: byte-string concatenation.

## Canonical references

- Zcash Protocol Specification (the "yellow paper"): https://zips.z.cash/protocol/protocol.pdf
- The ZIP index: https://zips.z.cash/
- `zcashd` consensus implementation (for cross-checking): https://github.com/zcash/zcash
- Zebra (Rust full node): https://github.com/ZcashFoundation/zebra
- `sapling-crypto` (external repo): https://github.com/zcash/sapling-crypto
- `orchard` (external repo): https://github.com/zcash/orchard
- `halo2` (external repo): https://github.com/zcash/halo2
- The original Zerocash paper: Ben-Sasson et al., 2014.
- The Sapling design notes: https://github.com/zcash/zips/blob/main/protocol/sapling.pdf
- The Halo paper: Bowe, Grigg, Hopwood, 2019.
