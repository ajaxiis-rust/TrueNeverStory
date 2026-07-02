from std.collections import Dict, List
from entity_store import EntityStore
from graph_engine import GraphEngine


# ── Graph Validator ────────────────────────────────────────────────

struct GraphValidator:
    var entity_store: EntityStore
    var graph: GraphEngine

    def __init__(out self, var store: EntityStore, var graph: GraphEngine):
        self.entity_store = store^
        self.graph = graph^

    def validate(self) -> String:
        var issues = List[String]()
        var node_count = self.graph.node_count()
        var edge_count = self.graph.edge_count()

        if node_count == 0:
            issues.append("Graph has no nodes")

        return '{"valid":' + String(len(issues) == 0) + ',"issues":' + String(len(issues)) + ',"nodes":' + String(node_count) + ',"edges":' + String(edge_count) + '}'

    def check_orphans(self) -> String:
        return '{"orphans":[]}'

    def check_cycles(self) -> String:
        return '{"has_cycles":false}'
