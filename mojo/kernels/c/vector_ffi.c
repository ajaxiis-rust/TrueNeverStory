// BRING v3 — Vector Operations FFI (C port)
// 4-element vector operations for TypeScript FFI via Bun

#include <stdint.h>
#include <math.h>

#ifdef _WIN32
  #define EXPORT __declspec(dllexport)
#else
  #define EXPORT __attribute__((visibility("default")))
#endif

// ── Cosine Similarity ────────────────────────────────────────

EXPORT float bring_cosine_similarity(
    float a0, float a1, float a2, float a3,
    float b0, float b1, float b2, float b3
) {
    float dot = a0*b0 + a1*b1 + a2*b2 + a3*b3;
    float norm_a = a0*a0 + a1*a1 + a2*a2 + a3*a3;
    float norm_b = b0*b0 + b1*b1 + b2*b2 + b3*b3;
    if (norm_a == 0.0f || norm_b == 0.0f) return 0.0f;
    return dot / sqrtf(norm_a * norm_b);
}

// ── L2 Distance ──────────────────────────────────────────────

EXPORT float bring_l2_distance(
    float a0, float a1, float a2, float a3,
    float b0, float b1, float b2, float b3
) {
    float d0 = a0 - b0;
    float d1 = a1 - b1;
    float d2 = a2 - b2;
    float d3 = a3 - b3;
    return sqrtf(d0*d0 + d1*d1 + d2*d2 + d3*d3);
}

// ── Dot Product ──────────────────────────────────────────────

EXPORT float bring_dot_product(
    float a0, float a1, float a2, float a3,
    float b0, float b1, float b2, float b3
) {
    return a0*b0 + a1*b1 + a2*b2 + a3*b3;
}

// ── Normalize Vector ─────────────────────────────────────────

EXPORT void bring_normalize4(
    float v0, float v1, float v2, float v3,
    float* out0, float* out1, float* out2, float* out3
) {
    float norm = sqrtf(v0*v0 + v1*v1 + v2*v2 + v3*v3);
    if (norm > 0.0f) {
        *out0 = v0/norm;
        *out1 = v1/norm;
        *out2 = v2/norm;
        *out3 = v3/norm;
    } else {
        *out0 = 0.0f;
        *out1 = 0.0f;
        *out2 = 0.0f;
        *out3 = 0.0f;
    }
}
