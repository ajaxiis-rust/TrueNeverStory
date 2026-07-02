from std.collections import Dict, List
from entity_store import EntityStore
from graph_engine import GraphEngine


# ── Graph Builder ──────────────────────────────────────────────────

struct GraphBuilder:
    var entity_store: EntityStore
    var graph: GraphEngine

    def __init__(out self, var store: EntityStore, var graph: GraphEngine):
        self.entity_store = store^
        self.graph = graph^

    def build_graph(mut self) raises -> String:
        self.graph.clear()
        for node in self.entity_store.all_nodes():
            self.graph.add_node(node.uid, name=node.name, entity_type=node.entity_type)
        return '{"status":"graph_built","nodes":' + String(self.graph.node_count()) + '}'

    def add_entity(mut self, uid: String, name: String, entity_type: String) raises -> String:
        self.graph.add_node(uid, name=name, entity_type=entity_type)
        return '{"uid":"' + uid + '","status":"added"}'

    def add_edge(mut self, source: String, target: String, edge_type: String) raises -> String:
        self.graph.add_edge(source, target, edge_type)
        return '{"source":"' + source + '","target":"' + target + '","status":"edge_added"}'
