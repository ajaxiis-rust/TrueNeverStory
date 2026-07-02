from std.collections import Dict, List
from entity_store import EntityStore
from graph_engine import GraphEngine


# ── Recommender ────────────────────────────────────────────────────

struct Recommender:
    var entity_store: EntityStore
    var graph: GraphEngine

    def __init__(out self, var store: EntityStore, var graph: GraphEngine):
        self.entity_store = store^
        self.graph = graph^

    def suggest_missing_relationships(self, top_k: Int = 20) -> String:
        return '{"suggestions":[]}'

    def suggest_new_entities(self) -> String:
        return '{"suggestions":[]}'
