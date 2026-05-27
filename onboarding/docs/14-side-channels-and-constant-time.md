---
sidebar_position: 14
title: Side channels and constant-time
description: "subtle, zeroize, vartime APIs to avoid."
---

# 14 - Side channels and constant-time

## 1. Why this chapter exists

Every cryptographic implementation in this workspace must be
constant-time with respect to secret data. A single non-constant-
time branch in a hot path can leak secrets to a co-resident
adversary, a network observer, or (for hardware wallets) a power
probe. The historical bellman timing leak (chapter 12) and the
remote-side-channel paper of Tramer et al. (USENIX 2020) show the
risk is operational, not theoretical. A contributor touching
[`zcash_primitives`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives),
the underlying `jubjub`, `bls12_381`,
[`pasta_curves`](https://github.com/zcash/pasta_curves), `subtle`,
or `zeroize` crates, or any wallet code that handles secrets must
understand the threat model, the `subtle::CtOption` and
`subtle::Choice` idioms, the vartime APIs that exist as foot-guns,
and the constant-time scalar-multiplication primitives those
crates expose.

## 2. Definitions

### Definition (constant-time with respect to a secret)

A piece of code is **constant-time with respect to secret $s$** if
its observable behaviour (wall-clock time, memory-access pattern,
branch pattern) is independent of $s$ given fixed non-secret
inputs. Constant-time is about secrets; non-secret inputs can
influence behaviour freely. In a wallet, $\mathsf{ivk}$ is secret
but the number of outputs to scan is public; the scan runtime
should depend on the latter, not the former.

### Definition (vartime API)

A function explicitly named `*_vartime` or `*_vt` is permitted to
leak its inputs via timing. Examples: `pow_vartime`,
`mul_vartime`, `invert_vartime`. These exist because the
constant-time versions are slower; the rule is that vartime
functions must never be called on a secret.

### Definition (Montgomery ladder)

A scalar-multiplication algorithm $[k] P$ that, for each bit of
$k$ from high to low, maintains a pair $(R_0, R_1) = ([m] P,
[m+1] P)$ and unconditionally executes one addition and one
doubling per bit. The number of group operations is exactly
$\lceil \log_2 \ell \rceil$ regardless of $k$. Both `jubjub` and
[`pasta_curves`](https://github.com/zcash/pasta_curves) implement
scalar-mul on secret-keyed paths via a windowed constant-time
variant of this skeleton.

### Threat-model boundary

In scope: timing, cache, branch-prediction, memory-allocation
side channels. Out of scope (typically): power analysis,
electromagnetic emanation. The latter are hardware-wallet
concerns; the firmware running on the wallet is the relevant
codebase, not `librustzcash`.

## 3. The code

### 3.1 What can leak (and what cannot)

Constructs that leak in straightforward Rust code:

- `if secret_bit { ... } else { ... }`: branch leaks via timing,
  branch predictor, and often cache.
- `array[secret_index]`: cache-line access pattern leaks.
- `if x == 0 { return Err(...) }` for a secret $x$: early exit
  leaks zero-ness.
- `match secret_value { ... }`: same.
- `format!("{}", secret)`: inner allocation paths leak.
- Naive scalar-mul `for bit in scalar.bits() { ... }` with a
  per-bit branch.

Under the assumption that the underlying primitive is implemented
constant-time, the following do not leak:

- Arithmetic on field/group elements via the curve crates (`+`,
  `*`, scalar mul).
- `subtle::Choice` and `subtle::CtOption`.
- BLAKE2 hashing.
- ChaCha20-Poly1305 AEAD decryption from the `chacha20poly1305`
  crate.

### 3.2 The `subtle` crate

`subtle` provides constant-time primitives that are the backbone
of this stack:

```rust
pub struct Choice(u8);              // 0 or 1, no early-out
pub struct CtOption<T> { ... }      // like Option<T> without branching

impl Choice {
    fn unwrap_u8(&self) -> u8;
    fn from(u: u8) -> Choice;       // 0 -> false, 1 -> true
}

impl<T: ConditionallySelectable> {
    fn conditional_select(a: &T, b: &T, c: Choice) -> T;
}
```

Use `CtOption` instead of `Option` whenever the option carries
information about a secret. `Option::unwrap` is fine when the
failure is structurally impossible; `CtOption::into_option` is the
appropriate consumer when failure depends on a secret.

`subtle::ConstantTimeEq` is the constant-time `==`:

```rust
let are_equal: Choice = secret_point_a.ct_eq(&secret_point_b);
```

When in doubt, grep `ct_eq` and `conditional_select` in the
codebase to see the idiom in context.

### 3.3 Constant-time deserialisation in the Sapling reader

The Sapling-component reader is the canonical example of a
constant-time wire path:

```rust reference title="zcash_primitives/src/transaction/components/sapling.rs"
https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L87-L100
```

`ValueCommitment::from_bytes_not_small_order` returns a
`CtOption`. The branch that follows (`if cv.is_none().into()`) is
on a public boolean: the parsing path was constant-time and the
result (valid or invalid) is itself non-secret. Convert via
`into_option` and propagate via `?`; never `unwrap()` on
attacker-controlled input.

### 3.4 Constant-time scalar multiplication

Scalar mul $[k] P$ is the dominant cost. A naive double-and-add
leaks $\mathsf{popcount}(k)$ and the positions of set bits.
Mitigations used in the workspace:

- **Montgomery ladder**: for each bit of $k$ from high to low,
  maintain $(R_0, R_1)$ and unconditionally update both based on
  the bit.
- **Fixed-base comb / windowed methods**: for fixed bases
  ($G^{\mathsf{ak}}$, $G^{\mathsf{nk}}$, ...) the implementation
  precomputes a table of multiples and selects them via
  `conditional_select` over the whole table.
- **What you do not need to write**: `jubjub::SubgroupPoint::mul`
  and
  [`pallas::Point`](https://github.com/zcash/pasta_curves/blob/main/src/pallas.rs#L12)`::mul`
  are constant-time. Use them directly.

Never roll your own scalar multiplication for secret scalars. If
you find yourself doing that, stop and use the crate API.

### 3.5 Constant-time field arithmetic and vartime foot-guns

`bls12_381::Scalar`, `jubjub::Fr`,
[`pallas::Base`](https://github.com/zcash/pasta_curves/blob/main/src/pallas.rs#L6),
etc. use Montgomery form and constant-time Barrett reduction.
Field inversion uses Bernstein-Yang's safegcd or equivalent,
which is constant-time.

Vartime APIs to grep for and never use on secrets:

- `pow_vartime`: leaks the exponent.
- `mul_vartime`: leaks the multiplicand.
- `invert_vartime`: leaks the input.

If they appear in a path that touches secrets, that is a bug.

### 3.6 `zeroize`

`zeroize::Zeroize` overwrites secret material before
deallocation:

```rust
use zeroize::Zeroize;

let mut sk: [u8; 32] = derive_sk();
// ... use sk ...
sk.zeroize();
```

Or ergonomically:

```rust
let sk = Zeroizing::new(derive_sk());
// sk's bytes are zeroed on drop
```

Zcash key types implement `Zeroize` and `Drop` to zero the
underlying material. See `sapling-crypto::keys::ExpandedSpendingKey`
or `orchard::keychain::SpendingKey` for examples.

Caveats:

- Compiler optimisations can eliminate "dead writes" of zeros.
  `zeroize` uses volatile writes and a compiler fence to prevent
  this.
- Stack copies of secrets are hard to zero. The library minimises
  this by working with `Box<Secret>` for large secrets.

### 3.7 Allocation patterns

Heap allocations are not constant-time by default: `malloc` paths
vary with size, and large allocations may cause OS-level page
faults observable through timing. For known-size key material,
allocate on the stack or use `[u8; 32]` directly. Most Zcash key
types are stack-allocated.

For variable-size intermediate data (transcript hashing buffers
etc.), the allocation pattern is a function of public input size,
not secrets, so it does not leak secrets.

### 3.8 Pattern: "decrypt and discard non-matching"

In `zcash_client_backend::scanning`, the trial-decryption loop
looks like:

```rust
for output in block.outputs {
    for ivk in tracked_ivks {
        if let Some(note) = try_decrypt(output, ivk) {
            // ...
        }
    }
}
```

`try_decrypt` does:

1. Compute ECDH shared secret (constant-time scalar mul).
2. Derive KDF key (constant-time hash).
3. Attempt AEAD decryption (constant-time on tag mismatch).
4. Re-derive commitment and compare (constant-time `ct_eq`).
5. Return `None` if tag fails; else `Some(note)`.

The overall loop is constant-time per `(output, ivk)` pair.
Success leaks (the wallet records the note, leaving a
side-channel trace), but failure is fully constant-time.

### 3.9 Pattern: secret-dependent loop bounds

A loop whose iteration count depends on a secret is the canonical
non-constant-time mistake. The closest analogue in Zcash is
diversifier enumeration:

```rust
let mut i = 0u64;
loop {
    let d = diversifier_index_to_bytes(dk, i);
    if let Some(g_d) = diversify_hash(d) {
        return (i, g_d);
    }
    i += 1;
}
```

Here $\mathsf{dk}$ is secret. An attacker who observes the
runtime of address derivation learns roughly how many indices
were tried, leaking a small amount of information about
$\mathsf{dk}$ via the FF1 output distribution. The mitigation in
`librustzcash` is to not enumerate over a secret-dependent space:
ZIP 32 designates specific indices as "default" and the wallet
does not expose the side channel beyond user-initiated actions.
Where enumeration is necessary (importing a wallet with unknown
used indices), the operation is rare and not in a hot path.

### 3.10 Pattern: aggregating proofs without secret-dependent paths

When verifying a Sapling bundle, the verifier computes

$$
\mathsf{bvk} \;=\; \sum_i \mathsf{cv}_i^{\text{in}}
- \sum_j \mathsf{cv}_j^{\text{out}}
- [v_{\text{bal}}] V
$$

unconditionally, then checks the binding signature. The
verification path does not branch on the result of any
intermediate arithmetic. This is constant-time over public
inputs.

### 3.11 Heuristics to grep for during review

```sh
# Vartime APIs
grep -r "vartime\|_vt(" --include='*.rs'

# Naive equality on potentially-secret data
grep -rn "\.eq(\|== &" --include='*.rs' \
    | grep -i "key\|secret\|sk\|ivk\|nsk"

# Match arms with secret-derived expressions
grep -rB2 "match.*secret\|match.*sk\b\|match.*key" --include='*.rs'

# Early-exit iterators over secret data
grep -rB1 "\.any(\|\.all(" --include='*.rs'
```

These are heuristics; results need human review. Many hits will
be benign (the grep is wide).

### 3.12 Compiler-level concerns

LLVM, the Rust compiler's backend, can in principle introduce
secret-dependent branches even into seemingly constant-time
source. The Rust crypto ecosystem mitigates this by:

- Working in Montgomery form so reductions are uniform.
- Using `core::hint::black_box` to hide values from the
  optimiser in critical sections.
- Conservative use of inline-assembly stubs (sparingly).
- Periodic audits with `ctgrind`, `dudect`, `Lima`.

The Zcash core crypto crates (`bls12_381`, `jubjub`,
[`pasta_curves`](https://github.com/zcash/pasta_curves),
`pairing`) have been audited and ship constant-time test suites.

### 3.13 Spectre and microarchitectural attacks

Modern attacks (Spectre v1-v4, BHB, Retbleed, Downfall) can leak
data from constant-time code if adjacent code has
secret-dependent branches. `librustzcash` does not implement
Spectre mitigations directly; that is a kernel and
microarchitecture concern. Operators of hosted prover services
must enable CPU microcode and kernel patches.

### 3.14 The Sapling proving-key argument

A Sapling Spend proof takes roughly 2 seconds on a modern CPU.
The proving process touches $\mathsf{ask}$, $\mathsf{nsk}$,
$\alpha$, $\mathsf{rcm}$, $\mathsf{rcv}$, the note value $v$, the
Merkle path, all flowing through `bellman`'s circuit synthesiser
and multi-exponentiation.

For the proving stack to be safe:

- `bellman` must use constant-time field/curve arithmetic for
  secret data (it does).
- The proving key must be loaded once and kept in memory in a
  predictable allocation so cache layout is stable.
- The proving thread should not be co-resident with attacker
  code (OS-level concern).

For a hardware wallet the constraints are tighter; the PCZT flow
lets the hardware wallet sign without proving, side-stepping the
proving-side-channel issue.

### 3.15 Memo and length leakage

Sapling encrypted memos are up to 512 bytes. If a wallet
truncates the memo for display based on a secret predicate
("show only if it looks like ASCII"), the truncation could be
observable. Best practice: treat memos as opaque bytes for
storage; make display decisions on user-visible policy, not on
content.

### 3.16 Anonymity-network considerations

The wallet may use Tor (via the `tor` feature in
`zcash_client_backend`) to talk to `lightwalletd`. Tor protects
network metadata but not local side channels. Both are needed
for privacy.

## 4. Failure modes

- **`pow_vartime` on a secret exponent.** Leaks the exponent.
  Use the non-vartime `pow` / `exp` API in
  [`pasta_curves`](https://github.com/zcash/pasta_curves) and
  `bls12_381`.
- **`if secret_byte == 0 { ... }` early exit.** Leaks zero-ness
  via timing. Use `ct_eq` and `conditional_select`.
- **Naive `for bit in scalar.bits() { ... }` scalar mul.** Leaks
  $\mathsf{popcount}$ and bit positions. Use the curve crates'
  built-in scalar mul.
- **`Option::unwrap()` on a `CtOption` from attacker bytes.**
  Re-introduces a branch on a secret-derived boolean and can
  panic on adversarial input. Use `into_option().ok_or(...)`.
- **Allocating a `Vec<u8>` whose length depends on a secret.**
  The allocation path leaks the size. Use a fixed-size buffer.
- **Forgetting `zeroize::Zeroize`** on a long-lived secret
  struct. The bytes persist in memory until overwritten by
  later allocations; a coredump or swap file exposes them.
- **Calling `format!` / `Debug::fmt` on a secret.** Formatting
  invokes allocator paths; the resulting string is also a
  liability. Implement `Debug` to redact for secret types.
- **Using `match` directly on a secret enum.** Convert to a
  bit-mask + `conditional_select` for each arm.

## 5. Spec pointers

- [`subtle` crate
  docs](https://docs.rs/subtle): the constant-time API surface
  cited throughout section 3.
- [`zeroize` crate
  docs](https://docs.rs/zeroize): the volatile-write contract
  that defeats LLVM's dead-store elimination.
- [Bernstein, Yang, *Fast constant-time gcd computation and
  modular inversion* (TCHES 2019)](https://eprint.iacr.org/2019/266):
  the safegcd algorithm behind constant-time field inversion in
  `bls12_381` / `jubjub` /
  [`pasta_curves`](https://github.com/zcash/pasta_curves).
- [Tramer, Boneh, Paterson, *Remote Side-Channel Attacks on
  Anonymous Transactions* (USENIX 2020)](https://www.usenix.org/conference/usenixsecurity20/presentation/tramer):
  the trial-decryption timing attack motivating section 3.8.
- [Chen, Lipp et al., *Spectre attacks: exploiting speculative
  execution*](https://spectreattack.com/): the microarchitectural
  threat model referenced in section 3.13.
- [Almeida, Barbosa et al., *Verifying Constant-Time Implementations*
  (USENIX 2016)](https://www.usenix.org/conference/usenixsecurity16/technical-sessions/presentation/almeida):
  formal background for `ctgrind`-style verification.

## 6. Exercises

1. **Map the vartime surface.** Run
   `grep -rn "vartime\|_vt(" --include='*.rs'` in the workspace
   and in
   [`pasta_curves`](https://github.com/zcash/pasta_curves) /
   `bls12_381` / `jubjub`. For each hit, classify it as
   (a) called only on public data, (b) called on secrets (a
   bug), or (c) ambiguous. Report any (b) hits.
2. **Trace a constant-time decode.** Read
   [`zcash_primitives/src/transaction/components/sapling.rs#L87-L150`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L87-L150)
   and explain in two sentences why the `is_none().into()`
   branch does not leak. What changes if the caller `unwrap()`s
   instead of going via `into_option`?
3. **Add a `Zeroize` test.** In a checkout, pick a struct in
   `zcash_keys` that holds secret bytes (e.g. a spending key
   wrapper). Write a unit test that creates the struct,
   captures its raw bytes via a pointer, drops it, and verifies
   the bytes are zero. The test should pass; remove the
   `Zeroize` impl and it must fail.

### Answers in the code

- Constant-time deserialiser pattern:
  [`zcash_primitives/src/transaction/components/sapling.rs#L87-L150`](https://github.com/zcash/librustzcash/blob/7c9f63f16f76994432aec5402fb196784f7dd6e2/zcash_primitives/src/transaction/components/sapling.rs#L87-L150).
- The `subtle::Choice` and `CtOption` types live in the external
  `subtle` crate; see its docs.
- `Zeroize` and `Zeroizing` live in the external `zeroize` crate;
  the Zcash key types implement the trait in the `sapling-crypto`
  and `orchard` repositories.

## 7. Further reading

- [Chapter 13](./13-cofactors-subgroups-canonical.md): the
  cofactor-clearing pattern these constant-time primitives
  protect.
- [Chapter 15](./15-trusted-setup.md): the proving-key flow
  that the constant-time bellman pipeline operates on.
- [Chapter 18](./18-anonymity-set-and-metadata.md): the
  network-level metadata model that complements local
  side-channel hardening.
- Almeida, Barbosa et al. (USENIX 2016) as above for the
  formal-verification side of constant-time validation.
