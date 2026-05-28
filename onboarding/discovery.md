# Discovery Notes

Frozen snapshot of the upstream state the onboarding course was built
against. Used as the citation backbone for all chapter content and as
the pin target for source-link URLs.

Re-run discovery and bump the SHA below whenever a non-trivial round
of editing touches more than a few chapters.

## 1. Upstream pin

- Upstream: <https://github.com/zcash/librustzcash>
- Fork (deploy target): <https://github.com/dannywillems/librustzcash>
- Course branch: `onboarding`
- Pinned SHA at last discovery: `7c9f63f16f76994432aec5402fb196784f7dd6e2`
- Nearest tag: `zcash_client_sqlite-0.20.2` + 63 commits

### Two-tier pinning convention

The pin choice depends on what the citation is anchoring.

**Tactical pin (use the SHA above).** Use the discovery-tip SHA for
content whose lifetime is the lifetime of the workspace state at
discovery: build commands, file paths in the contribution loop,
hot-files lists, CI workflow excerpts, fixtures. These citations
must survive upstream renames; a SHA pin does that for a few months
until the next discovery refresh.

**Protocol-version pin.** Use a release tag that corresponds to the
network upgrade the math statement describes, when one exists.
Cryptographic statements are stable under the protocol they document
but not under refactors of the implementation. Pinning a Sapling
spend-circuit relation to a `main` SHA is mathematically meaningless:
a renaming refactor moves the SHA without changing the statement,
and a protocol-level upgrade may leave the SHA stale even when the
relation has changed.

Convention:

- Sapling math (chapters 04, 13, 14, 16) pins to the upstream tag
  corresponding to the network upgrade the prose describes
  (Heartwood, Canopy, NU5 for the post-ZIP-212 form), or to the
  `main` of `sapling-crypto` when the statement transcends NU
  versions.
- Orchard math (chapter 24 R_Action, the redirect-stub on chapter
  05) pins to the upstream `orchard` tag for NU5; later NUs that
  modify Orchard (e.g. NU7 ZSA) get their own pinned tag.
- Halo 2 math (redirect-stub on chapter 17) pins to a frozen
  `zcash/halo2` release rather than the workspace SHA.
- ZIPs are cited by ZIP number; the ZIPs repository is the
  authoritative source of versioning.

When in doubt, prefer two citations: one tactical (current SHA) and
one protocol (release tag). The tactical link shows the reader what
the code looks like today; the protocol link is the stable anchor
for future-proof verification.

## 2. Top-level workspace

- Rust edition `2024`, MSRV `1.85.1` (`rust-toolchain.toml`).
- Workspace declared in the root `Cargo.toml`. Members:
  - `components/eip681`
  - `components/equihash`
  - `components/f4jumble`
  - `components/zcash_address`
  - `components/zcash_encoding`
  - `components/zcash_protocol`
  - `components/zip321`
  - `pczt`
  - `zcash`
  - `zcash_client_backend`
  - `zcash_client_memory`
  - `zcash_client_sqlite`
  - `zcash_extensions`
  - `zcash_history`
  - `zcash_keys`
  - `zcash_primitives`
  - `zcash_proofs`
  - `zcash_transparent`
- Resolver `2`.
- License `MIT OR Apache-2.0`.

## 3. External crypto dependencies (workspace deps)

- `bellman = "0.14"` (Groth16 prover/verifier)
- `bls12_381 = "0.8"`
- `ff = "0.13"`, `group = "0.13"`
- `jubjub = "0.10"`, `redjubjub = "0.8"`
- `pasta_curves = "0.5"`
- `orchard = "0.13"`
- `sapling = "sapling-crypto 0.7"`
- `secp256k1 = "0.29"` (transparent)
- `incrementalmerkletree`, `shardtree`
- `zcash_note_encryption = "0.4.1"`
- `zcash_spec = "0.2"`

These crates own the cryptography; the workspace crates are the
glue, parsers, builders, and wallet layer.

## 4. Public-facing entry points

- `zcash`: meta-crate that re-exports the others; the most common
  dependency for downstream consumers.
- `zcash_client_backend` + `zcash_client_sqlite` + `zcash_client_memory`:
  wallet layer (data API, scanning, fees, SQLite-backed storage).
- `zcash_keys`: HD key derivation, address types, UFVK / UA.
- `zcash_primitives`: transaction parsing, builder, sighash.
- `zcash_transparent`: transparent-pool support, BIP-32 / secp256k1.
- `zcash_protocol`: protocol constants, consensus parameters.
- `pczt`: Partially Created Zcash Transaction format.

## 5. CI graph (`.github/workflows/`)

- `ci.yml`: build matrix, tests, clippy, fmt.
- `audits.yml`, `aggregate-audits.yml`: cargo-vet pipeline.
- `book.yml`: mdBook build (separate from this course).
- `mutants.yml`: cargo-mutants run.
- `zizmor.yml`: workflow-security lint.
- `onboarding-docs.yml`: this course's same-branch Pages deploy.

## 6. Release / versioning

- Per-crate `CHANGELOG.md`; entries reference commit hashes.
- Tags follow `<crate>-<semver>` (e.g. `zcash_client_sqlite-0.20.2`).
- No global release; each crate releases independently.

## 7. Recent activity (last 6 months)

573 commits across the workspace. Top-touched files:

1. `zcash_client_backend/CHANGELOG.md` (62)
2. `supply-chain/imports.lock` (59) - cargo-vet
3. `zcash_client_sqlite/CHANGELOG.md` (50)
4. `zcash_client_sqlite/src/wallet.rs` (49)
5. `Cargo.lock` (49)
6. `zcash_client_sqlite/src/lib.rs` (38)
7. `components/eip681/src/parse.rs` (36)
8. `zcash_transparent/CHANGELOG.md` (33)
9. `zcash_primitives/CHANGELOG.md` (31)
10. `zcash_client_backend/src/data_api/ll/wallet.rs` (29)

Hot zones for contributors: the wallet layer
(`zcash_client_sqlite`, `zcash_client_backend`), the transparent
pool, and changelog discipline.

## 8. Contribution gate

`AGENTS.md` enforces a PR compliance gate that must be satisfied
before any pull request:

1. The change must be discussed on a GitHub issue.
2. The issue must have a response from a `librustzcash` team member
   acknowledging the proposed work.
3. The PR description must link the issue.

This gate applies to humans and AI agents alike. Surface it in any
chapter that walks the reader towards opening a PR.

## 9. Canonical external references

- Zcash Protocol Specification (the "yellow paper"):
  <https://zips.z.cash/protocol/protocol.pdf>
- ZIP index: <https://zips.z.cash/>
- `zcashd` consensus implementation: <https://github.com/zcash/zcash>
- Zebra (Rust full node): <https://github.com/ZcashFoundation/zebra>
- `sapling-crypto`: <https://github.com/zcash/sapling-crypto>
- `orchard`: <https://github.com/zcash/orchard>
- `halo2`: <https://github.com/zcash/halo2>
- `pasta_curves`: <https://github.com/zcash/pasta_curves>

## 10. Chapter coverage map

The 24 existing chapters map onto the discovery surface roughly as:

| Topic | Chapter |
| --- | --- |
| Workspace overview / module graph | 01 |
| Protocol foundations | 02 |
| Cryptography primer | 03 |
| Sprout, Sapling, Orchard subsystems | 04, 05 |
| Keys, addresses, transactions, encryption | 06, 07, 08 |
| Consensus + PoW | 09 |
| Wallet stack | 10 |
| Study plan | 11 |
| Failure modes (bugs, side channels, encodings) | 12, 13, 14 |
| Setup, deep dives, anonymity, ZIPs, audits, research | 15-21 |
| Code review checklist | 22 |
| References (keys, circuits) | 23, 24 |

### Known gaps to fill in a future audit

- No dedicated "Build, test, contribute" chapter (skill mandates it).
- No glossary, hot-files list, good-first-issue map, or PR checklist.
- Code-reference embeds underused (only chapters 02, 07, 15).
- Source links still pin to `main`, not the SHA above.
- Per-chapter section headings are ad-hoc, not the mandated
  skeleton (Why / Definitions / The code / Failure modes / Spec
  pointers / Exercises / Further reading).
