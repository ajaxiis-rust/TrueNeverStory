// BRING v3 — Graph Operations FFI (C port)
// Batch relationship lookups, RRF fusion

#include <stdint.h>

#ifdef _WIN32
  #define EXPORT __declspec(dllexport)
#else
  #define EXPORT __attribute__((visibility("default")))
#endif

// ── Reciprocal Rank Fusion ───────────────────────────────────

EXPORT void bring_rrf_fusion(
    const float* scores_ptr,
    const int32_t* ranks_ptr,
    int32_t n_lists,
    int32_t n_items,
    int32_t k,
    float* out_ptr
) {
    for (int32_t i = 0; i < n_items; i++) {
        float rrf_score = 0.0f;
        for (int32_t l = 0; l < n_lists; l++) {
            int32_t rank = ranks_ptr[l * n_items + i];
            rrf_score += 1.0f / (float)(k + rank + 1);
        }
        out_ptr[i] = rrf_score;
    }
}

// ── Batch Relationship Strength ──────────────────────────────

EXPORT void bring_batch_relationship_strength(
    const int32_t* src_uids,
    const int32_t* tgt_uids,
    const float* strengths,
    int32_t n,
    int32_t query_src,
    float* out_ptr,
    int32_t* out_count
) {
    int32_t count = 0;
    for (int32_t i = 0; i < n; i++) {
        if (src_uids[i] == query_src) {
            out_ptr[count] = strengths[i];
            count++;
        }
    }
    out_count[0] = count;
}

// ── Batch Reputation ─────────────────────────────────────────

EXPORT void bring_batch_reputation(
    const float* rel_strengths,
    const int32_t* rel_types,
    int32_t n,
    float* out_ptr
) {
    // type 0=friend(+0.1), 1=enemy(-0.15), 2=neutral(0), 3=romantic(+0.05), 4=rival(-0.1)
    for (int32_t i = 0; i < n; i++) {
        float score = 0.5f;
        float strength = rel_strengths[i];
        int32_t rel_type = rel_types[i];
        if (rel_type == 0) score += strength * 0.1f;
        else if (rel_type == 1) score -= strength * 0.15f;
        else if (rel_type == 3) score += strength * 0.05f;
        else if (rel_type == 4) score -= strength * 0.1f;

        if (score < 0.0f) out_ptr[i] = 0.0f;
        else if (score > 1.0f) out_ptr[i] = 1.0f;
        else out_ptr[i] = score;
    }
}
