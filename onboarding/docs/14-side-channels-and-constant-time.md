# 14 - Side channels and constant-time

## Goal

Every cryptographic implementation in this workspace must be
constant-time with respect to secret data. This chapter explains why,
what "constant-time" means precisely, how the supporting Rust crates
realise it, the specific patterns to use (and avoid), and the
historical context for the constant-time work in `bellman`,
`bls12_381`, `jubjub`,
[`pasta_curves`](https://github.com/zcash/pasta_curves), and friends.

## 1. The threat model

A side-channel adversary learns information about secrets by
observing the *physical* execution of the program: time taken,
electromagnetic emissions, cache state, branch-predictor state,
power consumption.

Categories you must defend against in software:

- **Timing side channels**: total runtime differs based on secret
  bits. Even a few clock cycles can be enough over many samples.
- **Cache side channels**: secret-dependent memory access patterns
  leave traces in the CPU cache that a co-resident attacker can
  read (Flush+Reload, Prime+Probe).
- **Branch-prediction side channels**: secret-dependent control flow
  leaves traces in the branch predictor (Spectre v1, BHB attacks).
- **Memory-allocation side channels**: secret-dependent allocation
  sizes can leak through `mmap` patterns.

Out of scope (typically): power analysis, electromagnetic emanation.
Those are hardware-wallet concerns; the firmware on a hardware wallet
is the relevant codebase, not `librustzcash`.

## 2. The definition

A piece of code is **constant-time with respect to secret $s$** if its
*observable* behaviour - runtime, memory access pattern, branch
pattern - is independent of $s$, given fixed non-secret inputs.

Note that "constant-time" is about *secrets*; non-secret inputs can
freely influence behaviour. The borderline can be subtle: in a wallet,
`ivk` is secret, but the *number* of outputs to scan is not. The
runtime of the scan should not depend on `ivk`; it can depend on the
output count.

## 3. What can leak

A non-exhaustive list of constructs that leak in straightforward
code:

- `if secret_bit { ... } else { ... }` - branch leaks via timing,
  branch predictor, and (often) cache.
- `array[secret_index]` - cache-line access pattern leaks.
- `if x == 0 { return Err(...) }` for a secret $x$ - early exit
  leaks zero-ness.
- `match secret_value { ... }` - same as `if`.
- `format!("{}", secret)` - inner allocation paths leak.
- Naive scalar mul `for bit in scalar.bits() { ... }` with a
  per-bit branch.

What does *not* leak (under the assumption the underlying primitive
is implemented constant-time):

- Arithmetic operations on field/group elements via the curve
  crates (`+`, `*`, scalar mul).
- `subtle::Choice` and `subtle::CtOption` conditional types.
- Hashing (BLAKE2 is constant-time by design).
- AEAD encryption/decryption (ChaCha20-Poly1305 in the `chacha20poly1305`
  crate is constant-time).

## 4. The `subtle` crate

`subtle` provides constant-time primitives that are the backbone of
constant-time programming in this stack:

```rust
pub struct Choice(u8);              // 0 or 1, no early-out
pub struct CtOption<T> { ... }      // like Option<T> but no branching

impl Choice {
    fn unwrap_u8(&self) -> u8;
    fn from(u: u8) -> Choice;       // 0 -> false, 1 -> true
}

impl<T: ConditionallySelectable> {
    fn conditional_select(a: &T, b: &T, c: Choice) -> T;
}
```

Use `CtOption` instead of `Option` whenever the option carries
information about a secret. `Option::unwrap` is fine if the failure
case is structurally impossible (a typed invariant), but
`CtOption::unwrap_or` and `CtOption::into_option` are the
appropriate primitives when failure depends on a secret.

The `subtle::ConstantTimeEq` trait is the constant-time replacement
for `==`. For curve and field types:

```rust
let are_equal: Choice = secret_point_a.ct_eq(&secret_point_b);
```

When in doubt, grep `ct_eq` and `conditional_select` in the codebase
to see the idiom.

## 5. Constant-time scalar multiplication

The dominant cost in any curve op is scalar mul $[k] P$. A naive
double-and-add leaks $\mathsf{popcount}(k)$ and the positions of
set bits. The standard mitigations:

### Montgomery ladder

For each bit of $k$ from high to low, maintain a pair $(R_0, R_1)$
and unconditionally update both based on the bit. The number of
additions is constant; cache and branch patterns are bit-independent.

### Fixed-base comb / windowed methods

For fixed bases (Sapling's $G^{\mathsf{ak}}$, $G^{\mathsf{nk}}$,
etc.) the implementation precomputes a table of multiples and
selects them constant-time via `conditional_select`. The table
lookup is constant-time because the entire table is *touched* and
the selection happens via masking, not array indexing.

### What you do not need to write

`jubjub::SubgroupPoint::mul(scalar)` and
[`pallas::Point`](https://github.com/zcash/pasta_curves/blob/main/src/pallas.rs#L12)`::mul(scalar)`
are implemented constant-time. You typically just use them.

You should never roll your own scalar multiplication for secret
scalars. If you find yourself doing that, stop and reuse the crate
API.

## 6. Constant-time field arithmetic

`bls12_381::Scalar`, `jubjub::Fr`,
[`pallas::Base`](https://github.com/zcash/pasta_curves/blob/main/src/pallas.rs#L6),
etc. all use
Montgomery form and constant-time Barrett reduction. Field inversion
is implemented via the inverter (Bernstein-Yang's safegcd or its
predecessors), which is constant-time.

What is *not* constant-time in some libraries:

- Newer Bernstein-Yang implementations are constant-time;
  Euclidean-based inversion is not.
- `pow_vartime` is *vartime*: it leaks the exponent. Never use it
  for secret exponents.

Grep for `pow_vartime`, `mul_vartime`, etc. to spot vartime APIs.
If they appear in a path that touches secrets, that's a bug.

## 7. Zeroize

`zeroize::Zeroize` is the trait for "after I'm done with this
secret, overwrite it from memory before deallocation":

```rust
use zeroize::Zeroize;

let mut sk: [u8; 32] = derive_sk();
// ... use sk ...
sk.zeroize();
```

Or, more ergonomically, use `Zeroizing<T>`:

```rust
let sk = Zeroizing::new(derive_sk());
// sk's bytes are zeroed on drop
```

The Zcash key types implement `Zeroize` and `Drop` to zero the
underlying material. Look at `sapling-crypto::keys::ExpandedSpendingKey`
or `orchard::keychain::SpendingKey` for examples.

Caveats:

- Compiler optimisations can eliminate "dead writes" of zeros.
  `zeroize` uses volatile writes (and a compiler fence) to prevent
  this.
- Stack copies of secrets are hard to zero. The library minimises
  this by working with `Box<Secret>` for large secrets.

## 8. Allocation patterns

Heap allocations are not constant-time by default: `malloc` paths
vary based on size, and large allocations may cause OS-level page
faults observable through timing.

For known-size key material, allocate on the stack or use
`[u8; 32]` directly. The Zcash key types are mostly stack-allocated.

For variable-size intermediate data (e.g. transcript hashing
buffers), the allocation pattern is *function of the public input
size*, not of secrets, so it does not leak secrets.

## 9. Constant-time validation of byte inputs

When parsing a public key or signature from bytes:

```rust
let pk = SubgroupPoint::from_bytes(bytes);  // CtOption<SubgroupPoint>
```

The `from_bytes` API returns a `CtOption` which encodes "valid or
not" without branching on the result. The caller decides what to do:

```rust
// OK: no secret-dependent branch
let pk: SubgroupPoint = pk.into_option().ok_or(Error::BadPubkey)?;
```

The `into_option` consumes the `CtOption` and produces an `Option`.
The `?` operator on the `Option` branches based on whether the
parsing succeeded, but the parsing itself was constant-time and the
result is *public* (success/failure is not a secret).

When the validity *is* a secret (rare), keep using `CtOption` all
the way through.

## 10. Specific patterns in this workspace

### Pattern: "decrypt and discard non-matching"

In `zcash_client_backend::scanning`, the trial-decryption loop
ostensibly looks like:

```rust
for output in block.outputs {
    for ivk in tracked_ivks {
        if let Some(note) = try_decrypt(output, ivk) {
            ...
        }
    }
}
```

The `try_decrypt` does:

1. Compute ECDH shared secret (constant-time scalar mul).
2. Derive KDF key (constant-time hash).
3. Attempt AEAD decryption (constant-time on tag mismatch).
4. Re-derive commitment and compare (constant-time `ct_eq`).
5. Return `None` if tag fails; else `Some(note)`.

The overall loop is constant-time per `(output, ivk)` pair.
Success leaks (the wallet records the note, which leaves a
side-channel trace), but failure is fully constant-time.

### Pattern: secret-dependent loop bounds

A loop whose iteration count depends on a secret is the canonical
non-constant-time mistake. In Zcash, the closest analogue is
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

Here the secret is $\mathsf{dk}$. An attacker who observes the
runtime of address derivation learns roughly how many indices were
tried, which leaks a small amount of information about $\mathsf{dk}$
(via the FF1 output distribution).

The mitigation in `librustzcash` is to **not enumerate over a
secret-dependent space**: ZIP 32 designates specific indices as
"default" or "preferred" and the wallet does not expose the
side-channel beyond the user's own actions. Where enumeration is
necessary (e.g. importing a wallet with unknown used indices), the
operation is rare and not in a hot path.

### Pattern: aggregating proofs without secret-dependent paths

When verifying a Sapling bundle, the verifier computes
$\mathsf{bvk} = \sum \mathsf{cv}_i^{\text{in}} - \sum \mathsf{cv}_j^{\text{out}} - [v_{\text{bal}}] V$
unconditionally, then checks the binding signature. The
non-shielded code does not branch on the result of any intermediate
arithmetic. This is constant-time over public inputs.

## 11. Pitfalls to actively grep for

When reviewing code:

```sh
# Vartime APIs
grep -r "vartime\|_vt(" --include='*.rs'

# Naive equality on potentially-secret data
grep -r "\.eq(\|== &\b" --include='*.rs' | grep -i "key\|secret\|sk\|ivk\|nsk"

# Match arms with secret expressions
grep -rB2 "match.*secret\|match.*sk\b\|match.*key" --include='*.rs'

# `if x.iter().any(...)` style early-exits over secret data
grep -rB1 ".any(\|.all(" --include='*.rs'
```

These are heuristics; results need human review. Many hits are
benign.

## 12. Compiler-level concerns

LLVM, the Rust compiler's backend, can in principle introduce
secret-dependent branches even into seemingly constant-time source.
The Rust crypto ecosystem mitigates this by:

- Working in Montgomery form so reductions are uniform.
- Using `core::hint::black_box` to hide values from the optimiser
  in critical sections.
- Conservative use of inline-assembly stubs (sparingly).
- Periodic audits with constant-time analysis tools (`ctgrind`,
  `dudect`, `Lima`).

The Zcash core crypto crates (`bls12_381`, `jubjub`,
[`pasta_curves`](https://github.com/zcash/pasta_curves),
`pairing`) have been audited and have constant-time test suites in
their repos.

## 13. Spectre and friends

Modern microarchitectural attacks (Spectre v1-v4, BHB, Retbleed,
Downfall, ...) can leak data even from constant-time code if
adjacent code has secret-dependent branches.

`librustzcash` does not implement Spectre mitigations directly;
that is a kernel and microarchitecture concern. The wallet should be
deployed on systems with appropriate mitigations enabled (CPU
microcode, kernel patches). If you operate a hosted prover service,
this becomes your problem.

## 14. The Sapling proving-key argument

A Sapling Spend proof takes ~2 seconds on a modern CPU. The proving
process touches secret material extensively: $\mathsf{ask}$,
$\mathsf{nsk}$, $\alpha$, $\mathsf{rcm}$, $\mathsf{rcv}$, the note
value $v$, the Merkle path, etc. Each of these flows through
`bellman`'s circuit synthesiser and multi-exponentiation.

For the proving stack to be safe:

- `bellman` must use constant-time field/curve arithmetic for
  secret data. (It does.)
- The proving key must be loaded once and kept in memory in a
  predictable allocation so cache layout is stable.
- The proving thread should not be co-resident with attacker code
  (operating-system level concern).

For a hardware wallet, the constraints are tighter: side-channel
resistance is the entire concern. The PCZT flow lets the hardware
wallet sign without proving, side-stepping the proving-side-channel
issue.

## 15. Memo and length leakage

A subtle leak: Sapling encrypted memos are up to 512 bytes. If a
wallet truncates the memo for display based on a secret predicate
(e.g. "show only if it looks like ASCII"), that leak might be
observable.

Best practice: always treat memos as opaque bytes for storage and
make display decisions based on user-visible policy, not on the
content.

## 16. Anonymity-network considerations

The wallet may use Tor (via the `tor` feature in
`zcash_client_backend`) to talk to `lightwalletd`. Tor protects
network metadata but not local side channels. Both are needed for
privacy.

## What you should know after this chapter

- The threat model: timing, cache, branch, allocation.
- The role of `subtle::CtOption`, `Choice`, and `ConditionallySelectable`.
- Why `pow_vartime` and similar are dangerous on secrets.
- How `zeroize` is used and why volatile writes matter.
- Patterns to grep for when auditing.
- That the proving stack is the most secret-rich code path in the
  wallet; the PCZT design exists in part to keep it off
  resource-constrained signers.

Next: the trusted setup ceremonies behind Sapling and Sprout.
