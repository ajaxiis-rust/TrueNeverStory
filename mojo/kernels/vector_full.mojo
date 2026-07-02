# BRING v3 — Full-Dimension Vector Operations FFI
# Handles 768-dim BGE-M3 embeddings via pointer-based FFI

@export
def bring_cosine_similarity_full(
    a_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    b_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    dim: Int,
) -> Float32:
    """Cosine similarity for arbitrary-dimension vectors."""
    var dot: Float32 = 0.0
    var norm_a: Float32 = 0.0
    var norm_b: Float32 = 0.0
    for i in range(dim):
        var va = a_ptr[i]
        var vb = b_ptr[i]
        dot += va * vb
        norm_a += va * va
        norm_b += vb * vb
    var denom = (norm_a * norm_b) ** 0.5
    if denom == 0.0:
        return 0.0
    return dot / denom

@export
def bring_l2_distance_full(
    a_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    b_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    dim: Int,
) -> Float32:
    """L2 distance for arbitrary-dimension vectors."""
    var sum: Float32 = 0.0
    for i in range(dim):
        var d = a_ptr[i] - b_ptr[i]
        sum += d * d
    return sum ** 0.5

@export
def bring_dot_product_full(
    a_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    b_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    dim: Int,
) -> Float32:
    """Dot product for arbitrary-dimension vectors."""
    var dot: Float32 = 0.0
    for i in range(dim):
        dot += a_ptr[i] * b_ptr[i]
    return dot

@export
def bring_batch_cosine(
    query_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    db_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    n_rows: Int,
    dim: Int,
    out_ptr: UnsafePointer[Float32, MutAnyOrigin],
) abi("c") -> None:
    """Batch cosine: compute similarity of query against n_rows vectors.
    db_ptr is flat [n_rows * dim]."""
    for row in range(n_rows):
        var dot: Float32 = 0.0
        var norm_a: Float32 = 0.0
        var norm_b: Float32 = 0.0
        for d in range(dim):
            var va = query_ptr[d]
            var vb = db_ptr[row * dim + d]
            dot += va * vb
            norm_a += va * va
            norm_b += vb * vb
        var denom = (norm_a * norm_b) ** 0.5
        if denom == 0.0:
            out_ptr[row] = 0.0
        else:
            out_ptr[row] = dot / denom
