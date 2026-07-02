from std.collections import Dict, List
from entity_store import EntityStore
from llm_client import LLMClient
from builder import WorldBuilder
from graph_engine import GraphEngine


# ── Intelligence CLI ───────────────────────────────────────────────

struct IntelligenceCLI:
    var entity_store: EntityStore
    var builder: WorldBuilder
    var graph: GraphEngine

    def __init__(out self, var store: EntityStore, var builder: WorldBuilder, var graph: GraphEngine):
        self.entity_store = store^
        self.builder = builder^
        self.graph = graph^

    def handle_command(mut self, args: String) -> String:
        if args.startswith("analyze"):
            return self._analyze()
        elif args.startswith("recommend"):
            return self._recommend()
        elif args.startswith("enrich"):
            return self._enrich()
        elif args.startswith("deduplicate"):
            return self._deduplicate()
        return '{"error":"unknown command"}'

    def _analyze(self) -> String:
        return '{"status":"analysis_complete"}'

    def _recommend(self) -> String:
        return '{"status":"recommendations_complete"}'

    def _enrich(self) -> String:
        return '{"status":"enrichment_complete"}'

    def _deduplicate(self) -> String:
        return '{"status":"deduplication_complete"}'
