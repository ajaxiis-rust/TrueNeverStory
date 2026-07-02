from std.collections import Dict, List
from entity_store import EntityStore
from llm_client import LLMClient
from builder import WorldBuilder
from http_client import json_escape_string


# ── Scene Generator ────────────────────────────────────────────────

struct SceneGenerator:
    var entity_store: EntityStore
    var builder: WorldBuilder
    var llm: LLMClient

    def __init__(out self, var store: EntityStore, var builder: WorldBuilder, var llm: LLMClient):
        self.entity_store = store^
        self.builder = builder^
        self.llm = llm^

    def generate_scene_from_cluster(self, center_uid: String, num_characters: Int = 3) -> String:
        return '{"scene_text":"","entities_mentioned":[]}'
