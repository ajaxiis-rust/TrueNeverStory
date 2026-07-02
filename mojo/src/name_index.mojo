from std.collections import Dict, List
from entity_store import EntityStore


# ── Name Index ─────────────────────────────────────────────────────

struct NameIndex:
    var entity_store: EntityStore
    var index: Dict[String, String]
    var index_size: Int

    def __init__(out self, var store: EntityStore):
        self.entity_store = store^
        self.index = Dict[String, String]()
        self.index_size = 0

    def build_index(mut self):
        self.index.clear()
        for node in self.entity_store.all_nodes():
            var key = node.name.lower() + ":" + node.entity_type
            self.index[key] = node.uid
        self.index_size = len(self.index)

    def lookup(self, name: String, entity_type: String = "") raises -> String:
        var key = name.lower() + ":" + entity_type
        if key in self.index:
            return self.index[key].copy()
        return ""

    def search(self, query: String) -> String:
        var results = List[String]()
        var query_lower = query.lower()
        for entry in self.index.items():
            if query_lower in entry.key:
                results.append(entry.value)
        var json = '{"results":['
        for i in range(len(results)):
            if i > 0:
                json += ","
            json += '"' + results[i] + '"'
        json += ']}'
        return json^

    def index_count(self) -> Int:
        return self.index_size
