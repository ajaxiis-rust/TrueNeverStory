from std.collections import Dict, List
from entity_store import EntityStore
from llm_client import LLMClient
from builder import WorldBuilder
from graph_engine import GraphEngine


# ── Enrichment Pipeline ────────────────────────────────────────────

struct EnrichmentPipeline:
    var entity_store: EntityStore
    var builder: WorldBuilder
    var graph: GraphEngine

    def __init__(out self, var store: EntityStore, var builder: WorldBuilder, var graph: GraphEngine):
        self.entity_store = store^
        self.builder = builder^
        self.graph = graph^

    def run(self, complete_layers: Bool = True, relationships: Bool = True, check_rules: Bool = True, fix_rules: Bool = False) -> String:
        return '{"status":"completed"}'
