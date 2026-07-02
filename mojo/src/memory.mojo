from std.collections import Dict, List
from http_client import _char_to_ord

# ── Memory Entry ──────────────────────────────────────────────────

struct MemoryEntry(ImplicitlyCopyable, Movable, Writable):
    var id: String
    var content: String
    var group: String
    var importance: Float64
    var access_count: Int
    var emotional_valence: Float64
    var story_relevance: Float64
    var timestamp: String

    def __init__(out self, id: String, content: String, group: String):
        self.id = id
        self.content = content
        self.group = group
        self.importance = 0.5
        self.access_count = 0
        self.emotional_valence = 0.0
        self.story_relevance = 0.5
        self.timestamp = ""

    def write_to(self, mut writer: Some[Writer]):
        writer.write("MemoryEntry(id=", self.id, ", group=", self.group, ", importance=", self.importance, ")")


# ── Memory Config ─────────────────────────────────────────────────

@fieldwise_init
struct MemoryConfig(Copyable, Movable, Writable):
    var max_entries: Int
    var embedding_dim: Int
    var auto_consolidate: Bool
    var consolidation_interval: Int

    def __init__(out self):
        self.max_entries = 10000
        self.embedding_dim = 384
        self.auto_consolidate = True
        self.consolidation_interval = 100


# ── Vector Memory Store ───────────────────────────────────────────

struct VectorMemoryStore:
    var entries: List[MemoryEntry]
    var embeddings: List[List[Float64]]
    var group_index: Dict[String, List[Int]]
    var config: MemoryConfig

    def __init__(out self):
        self.entries = List[MemoryEntry]()
        self.embeddings = List[List[Float64]]()
        self.group_index = Dict[String, List[Int]]()
        self.config = MemoryConfig()

    def add_entry(mut self, var entry: MemoryEntry, var embedding: List[Float64]) raises:
        var idx = len(self.entries)
        self.entries.append(entry)
        self.embeddings.append(embedding^)
        var group = self.entries[idx].group.copy()
        if group not in self.group_index:
            self.group_index[group] = List[Int]()
        self.group_index[group].append(idx)

    def search_by_embedding(
        self,
        query_embedding: List[Float64],
        top_k: Int,
        group: String,
    ) -> List[MemoryEntry]:
        var results = List[MemoryEntry]()
        var scores = List[Float64]()

        var indices = List[Int]()
        if group == "" or group == "*":
            for i in range(len(self.entries)):
                indices.append(i)
        elif group in self.group_index:
            indices = self.group_index[group].copy()

        for idx in indices:
            if idx < len(self.embeddings):
                var sim = self._cosine_similarity(query_embedding, self.embeddings[idx])
                var boosted = sim * 0.8 + self.entries[idx].importance * 0.2
                scores.append(boosted)

        var sorted_indices = self._argsort(scores)

        var count = 0
        for i in sorted_indices:
            if count >= top_k:
                break
            if i < len(self.entries):
                results.append(self.entries[i])
                count += 1

        return results^

    def search_by_text(self, query: String, top_k: Int, group: String) -> List[MemoryEntry]:
        var results = List[MemoryEntry]()
        var query_lower = query.lower()

        for i in range(len(self.entries)):
            var entry = self.entries[i]
            var matches_group = group == "" or group == "*" or entry.group == group
            var matches_query = query_lower in entry.content.lower()
            if matches_group and matches_query:
                results.append(entry)
                if len(results) >= top_k:
                    break

        return results^

    def add_event(mut self, description: String, group: String, importance: Float64) raises:
        var entry = MemoryEntry(String(len(self.entries)), description, group)
        entry.importance = importance
        var embedding = self._create_embedding(description)
        self.add_entry(entry^, embedding^)

    def get_recent(self, group: String, limit: Int) -> List[MemoryEntry]:
        var results = List[MemoryEntry]()
        var count = 0
        var i = len(self.entries) - 1
        while i >= 0 and count < limit:
            var entry = self.entries[i]
            if group == "" or group == "*" or entry.group == group:
                results.append(entry)
                count += 1
            i -= 1
        return results^

    def _cosine_similarity(self, a: List[Float64], b: List[Float64]) -> Float64:
        if len(a) != len(b) or len(a) == 0:
            return 0.0
        var dot_product: Float64 = 0.0
        var norm_a: Float64 = 0.0
        var norm_b: Float64 = 0.0
        for i in range(len(a)):
            dot_product += a[i] * b[i]
            norm_a += a[i] * a[i]
            norm_b += b[i] * b[i]
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return dot_product / (sqrt(norm_a) * sqrt(norm_b))

    def _create_embedding(self, text: String) raises -> List[Float64]:
        var embedding = List[Float64]()
        var hash_val: Float64 = 0.0
        for i in range(text.byte_length()):
            hash_val += Float64(_char_to_ord(String(text[byte=i])))
        for i in range(self.config.embedding_dim):
            var val = (hash_val * Float64(i + 1)) % 1.0
            embedding.append(val)
        return embedding^

    def _argsort(self, scores: List[Float64]) -> List[Int]:
        var indexed = List[Float64]()
        var indices = List[Int]()
        for i in range(len(scores)):
            indexed.append(scores[i])
            indices.append(i)
        var n = len(indexed)
        for i in range(n):
            for j in range(0, n - i - 1):
                if indexed[j] < indexed[j + 1]:
                    var temp_val = indexed[j]
                    indexed[j] = indexed[j + 1]
                    indexed[j + 1] = temp_val
                    var temp_idx = indices[j]
                    indices[j] = indices[j + 1]
                    indices[j + 1] = temp_idx
        return indices^

    def entry_count(self) -> Int:
        return len(self.entries)

    def write_to(self, mut writer: Some[Writer]):
        writer.write("VectorMemoryStore(entries=", len(self.entries), ")")
