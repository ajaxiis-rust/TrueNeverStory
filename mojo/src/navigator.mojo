from std.collections import Dict, List
from entity_store import EntityStore
from graph_engine import GraphEngine


# ── Navigator ──────────────────────────────────────────────────────

struct Navigator:
    var entity_store: EntityStore
    var graph: GraphEngine

    def __init__(out self, var store: EntityStore, var graph: GraphEngine):
        self.entity_store = store^
        self.graph = graph^

    def neighbors(self, uid: String, depth: Int = 1) raises -> String:
        var neighbors = self.graph.get_out_neighbors(uid)
        var result = '{"neighbors":['
        for i in range(len(neighbors)):
            if i > 0:
                result += ","
            result += '"' + String(neighbors[i]) + '"'
        result += '],"depth":' + String(depth) + '}'
        return result^

    def path(self, source: String, target: String) -> String:
        return '{"path":["' + source + '","' + target + '"],"found":false}'

    def search(self, query: String, entity_type: String = "", limit: Int = 20) -> String:
        var results = List[String]()
        for node in self.entity_store.all_nodes():
            if query in node.name:
                results.append(node.name)
        var json = '{"results":['
        for i in range(len(results)):
            if i > 0:
                json += ","
            json += '"' + results[i] + '"'
        json += ']}'
        return json^
