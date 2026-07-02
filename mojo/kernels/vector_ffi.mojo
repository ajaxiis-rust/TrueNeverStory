# BRING v3 — Vector Operations FFI (shared library)
# Compiled to .so for TypeScript FFI via Bun
# Uses SIMD types for FFI compatibility

# ── Cosine Similarity ────────────────────────────────────────

@export
def bring_cosine_similarity(
    a0: Float32, a1: Float32, a2: Float32, a3: Float32,
    b0: Float32, b1: Float32, b2: Float32, b3: Float32,
) -> Float32:
    """Compute cosine similarity for 4-element vectors.
    For larger vectors, call multiple times or use batch version."""
    var dot = a0*b0 + a1*b1 + a2*b2 + a3*b3
    var norm_a = a0*a0 + a1*a1 + a2*a2 + a3*a3
    var norm_b = b0*b0 + b1*b1 + b2*b2 + b3*b3
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b) ** 0.5

# ── L2 Distance ──────────────────────────────────────────────

@export
def bring_l2_distance(
    a0: Float32, a1: Float32, a2: Float32, a3: Float32,
    b0: Float32, b1: Float32, b2: Float32, b3: Float32,
) -> Float32:
    """Compute L2 distance for 4-element vectors."""
    var d0 = a0 - b0
    var d1 = a1 - b1
    var d2 = a2 - b2
    var d3 = a3 - b3
    return (d0*d0 + d1*d1 + d2*d2 + d3*d3) ** 0.5

# ── Dot Product ──────────────────────────────────────────────

@export
def bring_dot_product(
    a0: Float32, a1: Float32, a2: Float32, a3: Float32,
    b0: Float32, b1: Float32, b2: Float32, b3: Float32,
) -> Float32:
    """Compute dot product for 4-element vectors."""
    return a0*b0 + a1*b1 + a2*b2 + a3*b3

# ── Normalize Vector ─────────────────────────────────────────

@export
def bring_normalize4(
    v0: Float32, v1: Float32, v2: Float32, v3: Float32,
) -> Tuple[Float32, Float32, Float32, Float32]:
    """Normalize 4-element vector to unit length."""
    var norm = (v0*v0 + v1*v1 + v2*v2 + v3*v3) ** 0.5
    if norm > 0.0:
        return (v0/norm, v1/norm, v2/norm, v3/norm)
    return (0.0, 0.0, 0.0, 0.0)
