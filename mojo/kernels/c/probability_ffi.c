// BRING v3 — Probability Kernels (C port)
// Compiled to .so for TypeScript FFI via Bun

#include <stdint.h>

#ifdef _WIN32
  #define EXPORT __declspec(dllexport)
#else
  #define EXPORT __attribute__((visibility("default")))
#endif

// ── Success Chance ───────────────────────────────────────────

EXPORT float bring_compute_success_chance(
    float skill,
    float difficulty,
    float luck,
    float mod_sum
) {
    float base = skill * (1.0f - difficulty * 0.5f);
    base = base * (0.7f + luck * 0.3f);
    float result = base + mod_sum;
    if (result < 0.0f) return 0.0f;
    if (result > 1.0f) return 1.0f;
    return result;
}

// ── Roll Outcome ─────────────────────────────────────────────

EXPORT int32_t bring_roll_outcome(float probability, float roll) {
    if (roll > probability) {
        if (roll > probability + 0.3f) return 0;
        return 1;
    } else {
        if (roll < probability * 0.3f) return 4;
        if (roll < probability * 0.6f) return 3;
        return 2;
    }
}

// ── Modifier Value ───────────────────────────────────────────

EXPORT float bring_compute_modifier(float base, int32_t mod_type, float value) {
    if (mod_type == 0) return base + value;
    if (mod_type == 1) return base * value;
    if (mod_type == 2) return value;
    return base;
}

// ── Batch Success Chance ─────────────────────────────────────

EXPORT void bring_batch_success_chance(
    const float* skill_ptr,
    const float* diff_ptr,
    const float* luck_ptr,
    const float* mod_ptr,
    float* out_ptr,
    int32_t n
) {
    for (int32_t i = 0; i < n; i++) {
        float base = skill_ptr[i] * (1.0f - diff_ptr[i] * 0.5f);
        base = base * (0.7f + luck_ptr[i] * 0.3f);
        float result = base + mod_ptr[i];
        if (result < 0.0f) out_ptr[i] = 0.0f;
        else if (result > 1.0f) out_ptr[i] = 1.0f;
        else out_ptr[i] = result;
    }
}

// ── Batch Roll ───────────────────────────────────────────────

EXPORT void bring_batch_roll(
    const float* prob_ptr,
    const float* roll_ptr,
    int32_t* out_ptr,
    int32_t n
) {
    for (int32_t i = 0; i < n; i++) {
        float prob = prob_ptr[i];
        float roll = roll_ptr[i];
        if (roll > prob) {
            if (roll > prob + 0.3f) out_ptr[i] = 0;
            else out_ptr[i] = 1;
        } else {
            if (roll < prob * 0.3f) out_ptr[i] = 4;
            else if (roll < prob * 0.6f) out_ptr[i] = 3;
            else out_ptr[i] = 2;
        }
    }
}
