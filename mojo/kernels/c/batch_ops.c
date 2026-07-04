// BRING v3 — Batch Operations FFI (C port)
// Batch NPC stat updates, probability rolls

#include <stdint.h>
#include <stdlib.h>

#ifdef _WIN32
  #define EXPORT __declspec(dllexport)
#else
  #define EXPORT __attribute__((visibility("default")))
#endif

// ── Batch Age Decay ──────────────────────────────────────────

EXPORT void bring_batch_age_decay(
    float* health_ptr,
    const int32_t* age_ptr,
    int32_t n,
    float decay_rate
) {
    for (int32_t i = 0; i < n; i++) {
        float age = (float)age_ptr[i];
        float factor = 0.0f;
        if (age < 20.0f) factor = -0.5f;
        else if (age < 40.0f) factor = 0.0f;
        else if (age < 60.0f) factor = 0.3f;
        else if (age < 80.0f) factor = 0.6f;
        else factor = 1.0f;

        float new_health = health_ptr[i] - decay_rate * factor;
        if (new_health < 0.0f) health_ptr[i] = 0.0f;
        else if (new_health > 1000.0f) health_ptr[i] = 1000.0f;
        else health_ptr[i] = new_health;
    }
}

// ── Batch Vice Decay ─────────────────────────────────────────

EXPORT void bring_batch_vice_decay(
    float* stats_ptr,
    const float* vices_ptr,
    int32_t n,
    int32_t n_stats,
    int32_t n_vices
) {
    for (int32_t i = 0; i < n; i++) {
        for (int32_t s = 0; s < n_stats; s++) {
            float total_decay = 0.0f;
            for (int32_t v = 0; v < n_vices; v++) {
                total_decay += vices_ptr[i * n_vices + v] * 0.01f;
            }
            float new_val = stats_ptr[i * n_stats + s] - total_decay;
            if (new_val < 0.0f) stats_ptr[i * n_stats + s] = 0.0f;
            else stats_ptr[i * n_stats + s] = new_val;
        }
    }
}

// ── Batch Tax ────────────────────────────────────────────────

EXPORT void bring_batch_tax(
    const float* income_ptr,
    const float* tax_rate_ptr,
    float* out_ptr,
    int32_t n
) {
    for (int32_t i = 0; i < n; i++) {
        out_ptr[i] = (float)(int)(income_ptr[i] * tax_rate_ptr[i]);
    }
}

// ── Batch Wealth Sum ─────────────────────────────────────────

EXPORT float bring_batch_wealth_sum(
    const float* wealth_ptr,
    int32_t n
) {
    float total = 0.0f;
    for (int32_t i = 0; i < n; i++) {
        total += wealth_ptr[i];
    }
    return total;
}

// ── Batch Loyalty Check ──────────────────────────────────────

EXPORT void bring_batch_loyalty_check(
    const float* loyalty_ptr,
    float threshold,
    int32_t n,
    int32_t* out_ptr
) {
    for (int32_t i = 0; i < n; i++) {
        out_ptr[i] = (loyalty_ptr[i] < threshold) ? 1 : 0;
    }
}

// ── Batch Random Roll ────────────────────────────────────────

EXPORT void bring_batch_random_roll(
    const float* probabilities_ptr,
    int32_t n,
    int32_t* out_ptr
) {
    for (int32_t i = 0; i < n; i++) {
        float r = (float)(rand() % 1000) / 1000.0f;
        out_ptr[i] = (r < probabilities_ptr[i]) ? 1 : 0;
    }
}
