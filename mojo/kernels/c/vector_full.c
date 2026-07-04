// BRING v3 — Full-Dimension Vector Operations FFI (C port)
// Handles 768-dim BGE-M3 embeddings via pointer-based FFI

#include <stdint.h>
#include <math.h>

#ifdef _WIN32
  #define EXPORT __declspec(dllexport)
#else
  #define EXPORT __attribute__((visibility("default")))
#endif

// ── Cosine Similarity (arbitrary dimension) ──────────────────

EXPORT float bring_cosine_similarity_full(
    const float* a_ptr,
    const float* b_ptr,
    int32_t dim
) {
    float dot = 0.0f;
    float norm_a = 0.0f;
    float norm_b = 0.0f;
    for (int32_t i = 0; i < dim; i++) {
        float va = a_ptr[i];
        float vb = b_ptr[i];
        dot += va * vb;
        norm_a += va * va;
        norm_b += vb * vb;
    }
    float denom = sqrtf(norm_a * norm_b);
    if (denom == 0.0f) return 0.0f;
    return dot / denom;
}

// ── L2 Distance (arbitrary dimension) ────────────────────────

EXPORT float bring_l2_distance_full(
    const float* a_ptr,
    const float* b_ptr,
    int32_t dim
) {
    float sum = 0.0f;
    for (int32_t i = 0; i < dim; i++) {
        float d = a_ptr[i] - b_ptr[i];
        sum += d * d;
    }
    return sqrtf(sum);
}

// ── Dot Product (arbitrary dimension) ────────────────────────

EXPORT float bring_dot_product_full(
    const float* a_ptr,
    const float* b_ptr,
    int32_t dim
) {
    float dot = 0.0f;
    for (int32_t i = 0; i < dim; i++) {
        dot += a_ptr[i] * b_ptr[i];
    }
    return dot;
}

// ── Batch Cosine ─────────────────────────────────────────────

EXPORT void bring_batch_cosine(
    const float* query_ptr,
    const float* db_ptr,
    int32_t n_rows,
    int32_t dim,
    float* out_ptr
) {
    for (int32_t row = 0; row < n_rows; row++) {
        float dot = 0.0f;
        float norm_a = 0.0f;
        float norm_b = 0.0f;
        for (int32_t d = 0; d < dim; d++) {
            float va = query_ptr[d];
            float vb = db_ptr[row * dim + d];
            dot += va * vb;
            norm_a += va * va;
            norm_b += vb * vb;
        }
        float denom = sqrtf(norm_a * norm_b);
        if (denom == 0.0f) out_ptr[row] = 0.0f;
        else out_ptr[row] = dot / denom;
    }
}
