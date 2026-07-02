from std.collections import Dict, List
from entity_store import EntityStore
from graph_engine import GraphEngine
from http_client import json_escape_string


struct GraphStore(Movable):
    var entity_store: EntityStore
    var graph: GraphEngine
    var is_booted: Bool

    def __init__(out self, var store: EntityStore, var graph: GraphEngine):
        self.entity_store = store^
        self.graph = graph^
        self.is_booted = False

    def boot(mut self):
        self._build_graph()
        self.is_booted = True

    def _build_graph(mut self):
        self.graph.clear()
        for node in self.entity_store.all_nodes():
            self.graph.add_node(node.uid, name=node.name, entity_type=node.entity_type)

    def get_active_graph(self) -> String:
        return '{"nodes":' + String(self.graph.node_count()) + ',"edges":' + String(self.graph.edge_count()) + '}'

    def show(self, uid: String) raises -> String:
        for node in self.entity_store.all_nodes():
            if node.uid == uid:
                return '{"uid":"' + json_escape_string(node.uid) + '","name":"' + json_escape_string(node.name) + '","type":"' + json_escape_string(node.entity_type) + '"}'
        return '{"error":"not found"}'

    def neighbors(self, uid: String, depth: Int = 1) raises -> String:
        var neighbors = self.graph.get_out_neighbors(uid)
        var result = '{"neighbors":['
        for i in range(len(neighbors)):
            if i > 0:
                result += ","
            result += '"' + json_escape_string(String(neighbors[i])) + '"'
        result += '],"depth":' + String(depth) + '}'
        return result^

    def path(self, source: String, target: String) -> String:
        return '{"path":["' + json_escape_string(source) + '","' + json_escape_string(target) + '"],"found":false}'

    def search(self, query: String, entity_type: String = "", limit: Int = 20) -> String:
        var results = List[String]()
        for node in self.entity_store.all_nodes():
            if query.lower() in node.name.lower():
                results.append('{"uid":"' + json_escape_string(node.uid) + '","name":"' + json_escape_string(node.name) + '","type":"' + json_escape_string(node.entity_type) + '"}')
        var json = '{"results":['
        for i in range(len(results)):
            if i > 0:
                json += ","
            json += results[i]
        json += '],"count":' + String(len(results)) + '}'
        return json^

    def entity_count(self) -> Int:
        return len(self.entity_store.all_nodes())

    def node_count(self) -> Int:
        return self.graph.node_count()

    def edge_count(self) -> Int:
        return self.graph.edge_count()
