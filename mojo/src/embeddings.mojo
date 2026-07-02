from std.collections import Dict, List
from entity_store import EntityStore
from llm_client import LLMClient


# ── Embeddings ─────────────────────────────────────────────────────

struct EmbeddingManager:
    var entity_store: EntityStore
    var llm: LLMClient
    var embedding_cache: Dict[String, String]
    var cache_size: Int

    def __init__(out self, var store: EntityStore, var llm: LLMClient):
        self.entity_store = store^
        self.llm = llm^
        self.embedding_cache = Dict[String, String]()
        self.cache_size = 0

    def get_embedding(self, text: String) raises -> String:
        if text in self.embedding_cache:
            return self.embedding_cache[text].copy()
        return "[]"

    def set_embedding(mut self, text: String, embedding: String):
        self.embedding_cache[text] = embedding
        self.cache_size += 1

    def clear_cache(mut self):
        self.embedding_cache.clear()
        self.cache_size = 0

    def cache_stats(self) -> String:
        return '{"cache_size":' + String(self.cache_size) + '}'
