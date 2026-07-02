# BRING v3 — Batch Operations FFI
# Batch NPC stat updates, probability rolls

import std.random

@export
def bring_batch_age_decay(
    health_ptr: UnsafePointer[Float32, MutAnyOrigin],
    age_ptr: UnsafePointer[Int32, StaticConstantOrigin],
    n: Int,
    decay_rate: Float32,
) abi("c") -> None:
    """Batch age decay: health -= decay_rate * age_factor for n NPCs."""
    for i in range(n):
        var age = Float32(age_ptr[i])
        var factor: Float32 = 0.0
        if age < 20:
            factor = -0.5
        elif age < 40:
            factor = 0.0
        elif age < 60:
            factor = 0.3
        elif age < 80:
            factor = 0.6
        else:
            factor = 1.0
        var new_health = health_ptr[i] - decay_rate * factor
        if new_health < 0.0:
            health_ptr[i] = 0.0
        elif new_health > 1000.0:
            health_ptr[i] = 1000.0
        else:
            health_ptr[i] = new_health

@export
def bring_batch_vice_decay(
    stats_ptr: UnsafePointer[Float32, MutAnyOrigin],
    vices_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    n: Int,
    n_stats: Int,
    n_vices: Int,
) abi("c") -> None:
    """Batch vice decay on stats. stats is [n * n_stats], vices is [n * n_vices]."""
    for i in range(n):
        for s in range(n_stats):
            var total_decay: Float32 = 0.0
            for v in range(n_vices):
                total_decay += vices_ptr[i * n_vices + v] * 0.01
            var new_val = stats_ptr[i * n_stats + s] - total_decay
            if new_val < 0.0:
                stats_ptr[i * n_stats + s] = 0.0
            else:
                stats_ptr[i * n_stats + s] = new_val

@export
def bring_batch_tax(
    income_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    tax_rate_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    out_ptr: UnsafePointer[Float32, MutAnyOrigin],
    n: Int,
) abi("c") -> None:
    """Batch tax calculation: out[i] = floor(income[i] * tax_rate[i])."""
    for i in range(n):
        out_ptr[i] = Float32(Int(income_ptr[i] * tax_rate_ptr[i]))

@export
def bring_batch_wealth_sum(
    wealth_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    n: Int,
) -> Float32:
    """Sum all wealth values."""
    var total: Float32 = 0.0
    for i in range(n):
        total += wealth_ptr[i]
    return total

@export
def bring_batch_loyalty_check(
    loyalty_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    threshold: Float32,
    n: Int,
    out_ptr: UnsafePointer[Int32, MutAnyOrigin],
) abi("c") -> None:
    """Check loyalty below threshold. out[i] = 1 if loyalty < threshold."""
    for i in range(n):
        if loyalty_ptr[i] < threshold:
            out_ptr[i] = 1
        else:
            out_ptr[i] = 0

@export
def bring_batch_random_roll(
    probabilities_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    n: Int,
    out_ptr: UnsafePointer[Int32, MutAnyOrigin],
) abi("c") -> None:
    """Roll random against each probability. out[i] = 1 if random < prob."""
    for i in range(n):
        var r = Float32(std.random.random_ui64(0, 1000)) / 1000.0
        if r < probabilities_ptr[i]:
            out_ptr[i] = 1
        else:
            out_ptr[i] = 0
