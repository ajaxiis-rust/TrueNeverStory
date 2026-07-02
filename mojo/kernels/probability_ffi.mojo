# BRING v3 — Probability Kernels (shared library)
# Compiled to .so for TypeScript FFI via Bun

# ── Success Chance ───────────────────────────────────────────

@export
def bring_compute_success_chance(
    skill: Float32,
    difficulty: Float32,
    luck: Float32,
    mod_sum: Float32,
) -> Float32:
    """Compute probability of success with modifiers."""
    var base = skill * (1.0 - difficulty * 0.5)
    base = base * (0.7 + luck * 0.3)
    var result = base + mod_sum
    if result < 0.0:
        return 0.0
    if result > 1.0:
        return 1.0
    return result

# ── Roll Outcome ─────────────────────────────────────────────

@export
def bring_roll_outcome(probability: Float32, roll: Float32) -> Int:
    """Roll against probability. Returns 0-4 quality."""
    if roll > probability:
        if roll > probability + 0.3:
            return 0
        return 1
    else:
        if roll < probability * 0.3:
            return 4
        if roll < probability * 0.6:
            return 3
        return 2

# ── Modifier Value ───────────────────────────────────────────

@export
def bring_compute_modifier(base: Float32, mod_type: Int, value: Float32) -> Float32:
    """Apply modifier: 0=ADD, 1=MULTIPLY, 2=SET."""
    if mod_type == 0:
        return base + value
    elif mod_type == 1:
        return base * value
    elif mod_type == 2:
        return value
    return base

# ── Batch Success Chance ─────────────────────────────────────

@export
def bring_batch_success_chance(
    skill_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    diff_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    luck_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    mod_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    out_ptr: UnsafePointer[Float32, MutAnyOrigin],
    n: Int,
) abi("c") -> None:
    """Batch compute success chances for n rolls."""
    for i in range(n):
        var base = skill_ptr[i] * (1.0 - diff_ptr[i] * 0.5)
        base = base * (0.7 + luck_ptr[i] * 0.3)
        var result = base + mod_ptr[i]
        if result < 0.0:
            out_ptr[i] = 0.0
        elif result > 1.0:
            out_ptr[i] = 1.0
        else:
            out_ptr[i] = result

# ── Batch Roll ───────────────────────────────────────────────

@export
def bring_batch_roll(
    prob_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    roll_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    out_ptr: UnsafePointer[Int32, MutAnyOrigin],
    n: Int,
) abi("c") -> None:
    """Batch roll outcomes. out[i] = 0-4 quality."""
    for i in range(n):
        var prob = prob_ptr[i]
        var roll = roll_ptr[i]
        if roll > prob:
            if roll > prob + 0.3:
                out_ptr[i] = 0
            else:
                out_ptr[i] = 1
        else:
            if roll < prob * 0.3:
                out_ptr[i] = 4
            elif roll < prob * 0.6:
                out_ptr[i] = 3
            else:
                out_ptr[i] = 2
