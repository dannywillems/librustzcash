---
sidebar_position: 12
title: Historical bugs and security incidents
description: "2018 counterfeit bug, ZIP 212, audit findings catalog."
---

# 12 - Historical bugs and security incidents

## 1. Why this chapter exists

The fastest way to internalise where the sharp edges of a protocol
are is to study the bugs that actually shipped. This chapter walks
through the historically significant incidents in the Zcash
ecosystem, names the cryptographic root cause of each, and points
at the code that fixed them. The hybrid-Sprout circuit in
[`zcash_proofs/src/circuit/sprout/mod.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout/mod.rs)
exists because of the 2018 counterfeiting CVE; the parameter
hashes in
[`zcash_proofs/src/lib.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs#L49-L52)
exist to make the regenerated MPC output verifiable. Read this
chapter twice: once to learn, once before committing a non-trivial
change. All incidents below are public; primary sources are
linked.

## 2. Definitions

### Definition (proof-system soundness)

A non-interactive argument system $(\mathsf{Prove},
\mathsf{Verify})$ for relation $R$ is **sound** if, for any
PPT prover $P^*$ and any statement $x \notin L_R$,

$$
\Pr\!\bigl[\mathsf{Verify}(\mathsf{vk}, x, \pi) = 1 :
\pi \leftarrow P^*(\mathsf{pk}, x)\bigr]
\;\leq\; \mathrm{negl}(\lambda).
$$

A soundness break lets a prover produce $\pi$ for false $x$. For
Zcash, this means a forged JoinSplit or Spend/Action with no
underlying note: counterfeit ZEC.

### Definition (note malleability)

For a commitment scheme $\mathsf{Com}$ used in a note,
**malleability** means an attacker can derive a related commitment
or plaintext that the recipient interprets differently from the
sender. If $\mathsf{rcm}$ is sent as a raw scalar and reused as
both encryption nonce input and commitment trapdoor, the
ciphertext and the commitment can be made to disagree.

### Definition (small-subgroup leak)

For a curve with cofactor $h > 1$, if an honest party computes
$[k] P$ on an attacker-controlled $P$ outside $E^{\circ}$ and
leaks any deterministic function of the result, the attacker
recovers $k \bmod h_T$ for the order $h_T \mid h$ of the torsion
component of $P$. Chapter 13 develops this formally.

### Invariant (the audit-finding checklist)

The recurring themes across years of Zcash audits compress to
eight invariants on every cryptographic PR:

1. Subgroup membership is checked on every wire-derived point.
2. Field elements use canonical (minimal-residue) encoding.
3. Domain-separation tags are unique per use.
4. Error branches are constant-time.
5. Test vectors cover zero, identity, and max-bit edges.
6. Length prefixes match total length on serialisation.
7. `from_bytes` failure propagates instead of being unwrapped.
8. Prover and signer roles never share more secret material than
   their role requires.

The rest of the chapter argues for each invariant with a real
incident.

## 3. The code

### 3.1 The 2018 counterfeiting vulnerability (CVE-2019-7167)

The single most important security incident in Zcash history.

In March 2018, Sean Bowe (then Zcash Co. cryptographer) discovered
a soundness flaw in BCTV14, which Sprout's zk-SNARK was built on.
The flaw allowed an adversary with a specific knowledge assumption
solution to produce valid Sprout proofs for false statements;
i.e. to create ZEC out of thin air. A fix (migrating Sprout to
Groth16 with a new MPC trusted setup) was deployed in `zcashd`
1.1.1 in late 2018. Public disclosure followed in February 2019
once Zcash and other affected chains had migrated.

**The mathematical issue.** BCTV14 extended Pinocchio with an
attempted optimisation that introduced extra public parameters of
the form $[\beta \gamma]_1$ used to tie the proof's $A, B, C$
pieces together. Certain published auxiliary points let a prover
construct $\widetilde{C}$ such that the verifier's pairing
equation

$$
e(A, B) \;\overset{?}{=}\; e(g^{\alpha}, h) \cdot e(C, h^{\delta})
$$

held even though no satisfying witness existed. This is not a bug
in BLS12-381 arithmetic, BLAKE2b, or SHA-256; it is in the
**structure of the BCTV14 proof system**. Groth16 has a tighter
soundness analysis and fewer auxiliary elements; replacing BCTV14
with Groth16 closed the issue.

**Where this lives in code.** The Sprout circuit is the post-fix
"hybrid Sprout" implementation: the original Sprout statement
re-expressed in `bellman` for Groth16, instead of the original
`libsnark`/BCTV14 stack:

```rust reference title="zcash_proofs/src/circuit/sprout/mod.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout/mod.rs#L25-L54
```

Sprout-Groth16 parameters were generated in a fresh MPC ceremony
(the Sapling MPC plus a hybrid Sprout addendum). The parameter
hash is hardcoded so a wallet cannot accidentally load the old
BCTV14 file:

```rust reference title="zcash_proofs/src/lib.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs#L49-L52
```

**Lessons.** The math under a SNARK matters as much as the
circuit on top. Trusted-setup parameters are cryptographically
structured objects, not just numbers. Migration paths must be
planned: Zcash had a Sprout-to-Sapling migration that made
disclosure manageable.

### 3.2 ZIP 212: `rcm` malleability and pre-Canopy notes

Before Canopy, the Sapling note's commitment randomness
$\mathsf{rcm}$ was a uniform 32-byte scalar directly inserted into
both the note plaintext and the commitment formula. A malicious
sender could craft a payment whose commitment matched the
agreed-upon value $v$ but whose encrypted plaintext claimed a
different value $v' < v$. The recipient's wallet, trusting the
plaintext, considered only $v'$ spendable, letting the sender
equivocate later.

**The fix.** ZIP 212 derives $\mathsf{rcm}$ and $\mathsf{esk}$
from a 32-byte seed $\mathsf{rseed}$ via a PRF, instead of sending
them as raw scalars:

$$
\mathsf{rcm} \;=\; \mathsf{ToScalar}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{rseed}}(0\text{x}04)\bigr),
\qquad
\mathsf{esk} \;=\; \mathsf{ToScalar}\!\bigl(
\mathsf{PRF}^{\text{expand}}_{\mathsf{rseed}}(0\text{x}05)\bigr).
$$

The recipient receives $\mathsf{rseed}$, re-derives the same
$\mathsf{rcm}$ and $\mathsf{esk}$, and checks
$\mathsf{epk} = [\mathsf{esk}] g_d$.

**Where this lives.** In the external `sapling-crypto` crate's
`note::Rseed` enum:

```rust
pub enum Rseed {
    BeforeZip212(jubjub::Fr),  // pre-Canopy
    AfterZip212([u8; 32]),     // post-Canopy
}
```

The wallet code in `zcash_client_backend::decrypt` and
`sapling-crypto::note_encryption` handles both variants based on
the output's block height.

**Lessons.** Anything sent in plaintext is a potential
malleability vector if also used in a commitment. Derive things
from seeds. Compatibility is a permanent cost: pre-Canopy notes
still exist and the code maintains both code paths.

### 3.3 The Sapling "InternalH" cofactor issue

Early Sapling implementations used a derived $h$ parameter
($h = [4]G$ on Jubjub) without explicitly clearing the cofactor.
A maliciously crafted spend description could produce a value
commitment with a small-order torsion component that passed
verification but should not have. This is the canonical
**cofactor handling bug**.

**The fix.** Always multiply by the cofactor on receipt and check
that the result is in the prime-order subgroup. The `jubjub`
crate's API distinguishes `SubgroupPoint` from `ExtendedPoint`
specifically to carry this invariant in the type system. The
Sapling reader enforces both clauses by routing every wire-derived
`cv`/`rk`/`epk` through `SubgroupPoint`-returning constructors:

```rust reference title="zcash_primitives/src/transaction/components/sapling.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L87-L100
```

See chapter 13 for the full cofactor / subgroup story.

### 3.4 Metadata deanonymisation: Quesnelle, Kappos, Tramer

Aside from cryptographic bugs, several papers showed that metadata
leaks can deanonymise shielded users:

- Quesnelle (2017): early Sprout usage was largely linkable
  because users moved funds in/out of Sprout in identifiable
  patterns ("round trip" transactions).
- Kappos et al., USENIX 2018: empirical analysis of anonymity in
  Zcash; shielded-to-transparent flows leaked sender/recipient
  pairings.
- Tramer et al., USENIX 2020: remote side-channel attacks on
  anonymous transactions; timing of trial decryption could leak
  which view-key was used.

These are operational and informational leaks rather than
implementation bugs. Mitigations: constant-time trial decryption
regardless of success/failure (chapter 14); limit the rate at
which users move in/out of pools; wallet UX best-practices to
avoid "shielded -> transparent -> shielded" round trips. The
cryptography is necessary but not sufficient.

### 3.5 Subgroup-check omissions in note encryption

Early Sapling code accepted any $\mathsf{epk} \in
\mathbb{G}_{\text{Jubjub}}$ without checking it lay in the
prime-order subgroup. With cofactor 8, a malicious sender could
craft $\mathsf{epk}$ with a non-trivial 8-torsion component; the
shared secret $[\mathsf{ivk}] \mathsf{epk}$ then leaked partial
information about $\mathsf{ivk}$ across multiple outputs.

The fix is ZIP 216 (canonical-encoding consensus rule) plus
explicit subgroup checks at decryption time. The `epk` is decoded
to a `SubgroupPoint` or rejected. The pattern in the Sapling
reader is uniform: any wire-derived Jubjub point ascends to
`SubgroupPoint` or is rejected.

### 3.6 Bellman early-version timing leaks

Pre-1.0 `bellman` (and the underlying `pairing` crate) had
non-constant-time scalar multiplications and field inversions.
This never affected proof correctness, but it did affect
prover-time secret material: a prover side-channel could leak the
witness. For a wallet running locally this is largely theoretical;
for a remote prover or multi-party prover setup it is critical.
The current `bls12_381`, `pairing`, `bellman`, `jubjub`,
[`pasta_curves`](https://github.com/zcash/pasta_curves) crates
implement constant-time field arithmetic and constant-time
conditional selection via the `subtle` crate. Chapter 14 covers
constant time in depth.

### 3.7 The dummy-spend / dummy-output indistinguishability

A Sapling bundle may include zero-value "dummy" spends or outputs
to hide the true input/output count. For dummies to be
indistinguishable from real ones they must look identical in all
observable ways:

- Same value-commitment shape: $\mathsf{cv} = [0]V + [\mathsf{rcv}]
  R$ with random $\mathsf{rcv}$.
- Same proof structure: the circuit accepts dummies via a flag
  but the proof still verifies (the circuit makes the Merkle-path
  check conditional on $v \neq 0$, with care).
- Same encryption ciphertext: real-looking note plaintext, with
  random padding.

Historically, an early Sapling builder produced dummy ciphertexts
whose internal structure was statistically distinct from real ones
(e.g. zero memo bytes). A passive observer could partially
distinguish dummies. The fix: sample dummy plaintexts the same way
as real ones, with uniform-random memo content and proper note
structure (`OutputBuilder::DummyOutput` in
`sapling-crypto::builder`).

### 3.8 Halo 2 audit findings (Orchard)

Halo 2 and the Orchard circuit went through multiple audits before
NU5 (NCC Group, Trail of Bits, Least Authority). Selected
findings (paraphrased):

- **Incomplete-addition edge cases.** Sinsemilla uses incomplete
  point addition for efficiency; if operands coincide or are
  inverses the formula returns garbage. Mitigation: prove
  in-circuit that the required points are distinct. An early
  draft forgot this check.
- **Witness encoding tightness.** Each field element occupies
  specific bits in the public-input vector. Misalignment would
  not cause obvious failures but would let an adversary inject
  silent extra structure.
- **Lookup-argument soundness.** A bug in early code allowed
  certain table cells to remain uninitialised (treated as zero),
  which a malicious prover could exploit. Fixed by explicit
  value-binding.
- **Transcript domain separation.** Fiat-Shamir transcripts must
  be domain-separated per circuit; early versions allowed
  "transcript replay" across different circuit instantiations.

All findings were addressed before Orchard activation. The audit
list is a study guide: each finding shows a class of attack you
can apply elsewhere.

### 3.9 ZIP 215 and secp256k1 validation rules

A transparent input's signature might use a non-canonical $s$ or
a $y$-parity not matching the canonical form. ZIP 215 (originally
from Bitcoin) tightens validation: only canonical signatures are
accepted. `librustzcash` delegates to the `secp256k1` crate, which
enforces canonical signatures; consensus rejects non-canonical
transactions.

### 3.10 The PCZT spend-authorisation race

A PCZT signer must produce a spend-authorisation signature whose
challenge depends on the sighash. The sighash includes the value
commitments, which depend on the per-spend $\mathsf{rcv}$, which
is local to the constructor role (not the signer). A naive design
forces the constructor to share $\mathsf{rcv}$ with the signer,
leaking the value being moved.

The PCZT design splits the roles by giving the signer only the
sighash itself, not the underlying $\mathsf{rcv}$ values. The
constructor pre-commits to all randomness and the signer trusts
the bundled sighash. Bugs in this area are not visible in normal
tests; cross-role audits are needed. See the comments and
integration tests in `pczt/src/roles/signer/mod.rs`.

### 3.11 Wallet-state bookkeeping bugs

Not strictly cryptographic, but with direct cryptographic
consequences (constructed transactions get rejected because their
proofs reference invalid anchors or already-spent nullifiers):

- **Witness desynchronisation.** Computing the Merkle path for a
  note from a stale checkpoint produces an invalid path for the
  current anchor. The fix is checkpoint discipline in
  `shardtree`. Bugs in this area produced unspendable notes
  requiring a wallet rescan.
- **Nullifier-set update lag.** Spending a note must immediately
  insert its nullifier into the wallet's spent set so the
  proposal pipeline does not re-select it. Race conditions led
  to double-construction (two transactions spending the same
  note, only one accepted).

### 3.12 The Equihash (n, k) Bitcoin Gold reorg attack

Not a Zcash incident: in 2018 Bitcoin Gold (Equihash (144, 5),
different from Zcash's (200, 9)) suffered a 51% attack because
cheap GPUs could solve their parameter choice for less than the
block reward. Zcash's (200, 9) requires roughly 700 MB of memory
per solution and remained costly enough through the GPU era.
Parameter selection in proof-of-work matters as much as the
algorithm; a "memory-hard" function with insufficient memory
requirements is no longer memory-hard.

### 3.13 Common patterns in audit findings

Reading several years of audit reports, the recurring themes
(restated as the invariants in section 2):

1. Subgroup checks missing on points read from the wire.
2. Non-canonical encodings of field elements accepted.
3. Domain-separation tags reused across distinct uses.
4. Constant-time violations in error-handling branches.
5. Test vectors not covering edge cases (zero, identity,
   max-bit).
6. Off-by-one in serialisation (length prefix vs total length).
7. Insufficient input validation at trust boundaries (a
   `from_bytes` returning `Option` where the caller unwraps).
8. Race conditions between prover and signer roles.

## 4. Failure modes

The whole chapter is a failure-mode catalogue, but reading it
back the contributor-facing risks are:

- **Removing range constraints from the Sprout circuit** silently
  restores the BCTV14 failure mode at the application layer. Any
  change to the boolean range constraints must be reviewed
  against the post-CVE-2019-7167 design.
- **Touching the `Rseed` enum without updating both
  `BeforeZip212` and `AfterZip212` paths** breaks pre-Canopy note
  decryption.
- **Removing the `SubgroupPoint::try_from` step** in any reader
  re-introduces the cofactor leak.
- **Using `pow_vartime` or `mul_vartime` on secret-keyed paths**
  re-introduces the bellman timing leak.
- **Generating dummy outputs with a different distribution from
  real ones** restores statistical distinguishability.
- **Sharing `rcv` from constructor to signer in a PCZT** leaks
  values to the signing role.
- **Skipping the SHA-256 check on a parameter file** lets the
  wallet accept a substituted file: the entire trusted-setup
  argument collapses.

## 5. Spec pointers

- [Sean Bowe, Daira Hopwood, ECC remediation post](https://electriccoin.co/blog/zcash-counterfeiting-vulnerability-successfully-remediated/):
  the public disclosure of CVE-2019-7167 with the timeline.
- [Gabizon, "On the security of the BCTV pinocchio zk-SNARK
  variant", IACR ePrint 2019/119](https://eprint.iacr.org/2019/119):
  the formal analysis of the BCTV14 soundness flaw.
- [ZIP 212](https://zips.z.cash/zip-0212): the post-Canopy `rseed`
  derivation that closes the malleability.
- [ZIP 215](https://zips.z.cash/zip-0215): canonical secp256k1
  signature consensus rule.
- [ZIP 216](https://zips.z.cash/zip-0216): canonical Jubjub
  encoding consensus rule that closes the small-subgroup leak in
  `epk`.
- [Kappos et al., USENIX 2018](https://www.usenix.org/conference/usenixsecurity18/presentation/kappos):
  empirical Zcash anonymity analysis; metadata leaks.
- [Tramer et al., USENIX 2020](https://www.usenix.org/conference/usenixsecurity20/presentation/tramer):
  remote side-channel attacks on shielded transactions.
- [NCC Group, "Cryptographic Review of the Orchard Halo 2
  Implementation"](https://research.nccgroup.com/2022/02/03/public-report-zcash-nu5-cryptography-review/):
  one of the public NU5 audit reports.

## 6. Exercises

1. **Re-derive the Sprout migration story.** From the ECC
   remediation post and Gabizon's ePrint 2019/119, restate in
   your own words why replacing BCTV14 with Groth16 closes the
   soundness gap. Cite the specific BCTV14 element that is
   absent in Groth16.
2. **Find the `Rseed` branch.** In the external `sapling-crypto`
   crate (a separate repository), locate the `Rseed` enum and the
   call sites in `zcash_client_backend::decrypt` that branch on
   `BeforeZip212` vs `AfterZip212`. Identify the height predicate
   that selects the branch.
3. **Add a negative test for cofactor handling.** In a checkout,
   add a unit test under `zcash_primitives` that constructs a
   32-byte string encoding a Jubjub 8-torsion point and asserts
   that `read_value_commitment` in
   [`zcash_primitives/src/transaction/components/sapling.rs`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs)
   rejects it with `InvalidInput`. The test should pass; a
   regression that removes the `not_small_order` clause must
   make it fail.

### Answers in the code

- Hybrid Sprout circuit shape (post-CVE-2019-7167):
  [`zcash_proofs/src/circuit/sprout/mod.rs#L25-L54`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/circuit/sprout/mod.rs#L25-L54).
- Parameter SHA-256 constants:
  [`zcash_proofs/src/lib.rs#L49-L52`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_proofs/src/lib.rs#L49-L52).
- Sapling-component readers (cofactor + canonical encoding):
  [`zcash_primitives/src/transaction/components/sapling.rs#L87-L150`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L87-L150).

## 7. Further reading

- [Chapter 13](./13-cofactors-subgroups-canonical.md): the
  cofactor / subgroup / canonical-encoding deep dive that
  formalises the invariants cited above.
- [Chapter 14](./14-side-channels-and-constant-time.md): the
  constant-time discipline that the bellman timing-leak story
  points at.
- [Chapter 15](./15-trusted-setup.md): the MPC ceremony machinery
  behind the Sprout-Groth16 and Sapling parameter files.
- [Chapter 20](./20-audits-and-cross-impl.md): the audit-report
  index from which several findings in section 3.8 are drawn.
