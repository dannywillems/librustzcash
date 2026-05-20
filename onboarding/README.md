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
