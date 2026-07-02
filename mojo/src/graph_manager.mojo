from std.collections import Dict, List
from entity_store import EntityStore
from graph_engine import GraphEngine


# ── Graph Manager ──────────────────────────────────────────────────

struct GraphManager:
    var entity_store: EntityStore
    var graph: GraphEngine
    var _graph_dirty: Bool

    def __init__(out self, var store: EntityStore, var graph: GraphEngine):
        self.entity_store = store^
        self.graph = graph^
        self._graph_dirty = True
        self._build_graph_from_store()

    def _build_graph_from_store(mut self):
        self.graph.clear()
        for node in self.entity_store.all_nodes():
            self.graph.add_node(node.uid, name=node.name, entity_type=node.entity_type)
        self._graph_dirty = False

    def ensure_graph_fresh(mut self):
        if self._graph_dirty:
            self._build_graph_from_store()

    def _resolve_entity_uid(self, name: String) -> String:
        for node in self.entity_store.all_nodes():
            if node.name == name:
                return node.uid
        return ""

    def add_entity(mut self, name: String, entity_type: String, l1_json: String, group_id: String = "") -> String:
        var uid = entity_type + ":" + name
        self.graph.add_node(uid, name=name, entity_type=entity_type)
        return uid

    def get_l1(self, uid: String) raises -> String:
        var node = self.entity_store.get(uid)
        if node:
            return '{"uid":"' + node.value().uid + '","name":"' + node.value().name + '","type":"' + node.value().entity_type + '"}'
        return "{}"

    def get_l2(self, uid: String) raises -> String:
        return "{}"

    def get_l3(self, uid: String) raises -> String:
        return "{}"

    def search(self, query: String, entity_type: String = "", limit: Int = 20) -> String:
        return '{"results":[]}'

    def repair_all_relationships(self) -> String:
        return '{"resolved":0,"merged":0,"created":0,"failed":0,"skipped":0}'
