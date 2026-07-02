# BRING v3 — Graph Operations FFI
# Batch relationship lookups, RRF fusion

@export
def bring_rrf_fusion(
    scores_ptr: UnsafePointer[Float32, StaticConstantOrigin],
    ranks_ptr: UnsafePointer[Int32, StaticConstantOrigin],
    n_lists: Int,
    n_items: Int,
    k: Int,
    out_ptr: UnsafePointer[Float32, MutAnyOrigin],
) abi("c") -> None:
    """Reciprocal Rank Fusion across n_lists, each with n_items items.
    scores_ptr: flat [n_lists * n_items], ranks_ptr: flat [n_lists * n_items]
    out_ptr: [n_items] output scores."""
    for i in range(n_items):
        var rrf_score: Float32 = 0.0
        for l in range(n_lists):
            var rank = ranks_ptr[l * n_items + i]
            rrf_score += 1.0 / Float32(k + rank + 1)
        out_ptr[i] = rrf_score

@export
def bring_batch_relationship_strength(
    src_uids: UnsafePointer[Int32, StaticConstantOrigin],
    tgt_uids: UnsafePointer[Int32, StaticConstantOrigin],
    strengths: UnsafePointer[Float32, StaticConstantOrigin],
    n: Int,
    query_src: Int32,
    out_ptr: UnsafePointer[Float32, MutAnyOrigin],
    out_count: UnsafePointer[Int32, MutAnyOrigin],
) abi("c") -> None:
    """Find all relationships for query_src. Returns count + strengths."""
    var count = 0
    for i in range(n):
        if src_uids[i] == query_src:
            out_ptr[count] = strengths[i]
            count += 1
    out_count[0] = count

@export
def bring_batch_reputation(
    rel_strengths: UnsafePointer[Float32, StaticConstantOrigin],
    rel_types: UnsafePointer[Int32, StaticConstantOrigin],
    n: Int,
    out_ptr: UnsafePointer[Float32, MutAnyOrigin],
) abi("c") -> None:
    """Compute reputation scores for n NPCs from their relationships.
    type 0=friend(+0.1), 1=enemy(-0.15), 2=neutral(0), 3=romantic(+0.05), 4=rival(-0.1)"""
    for i in range(n):
        var score: Float32 = 0.5
        var strength = rel_strengths[i]
        var rel_type = rel_types[i]
        if rel_type == 0:
            score += strength * 0.1
        elif rel_type == 1:
            score -= strength * 0.15
        elif rel_type == 3:
            score += strength * 0.05
        elif rel_type == 4:
            score -= strength * 0.1
        if score < 0.0:
            out_ptr[i] = 0.0
        elif score > 1.0:
            out_ptr[i] = 1.0
        else:
            out_ptr[i] = score
