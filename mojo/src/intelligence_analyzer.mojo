from std.collections import Dict, List
from entity_store import EntityStore
from graph_engine import GraphEngine


# ── Graph Analyzer ─────────────────────────────────────────────────

struct GraphAnalyzer:
    var entity_store: EntityStore
    var graph: GraphEngine

    def __init__(out self, var store: EntityStore, var graph: GraphEngine):
        self.entity_store = store^
        self.graph = graph^

    def centrality_report(self, top_n: Int = 10) raises -> String:
        var report = '{"top_degree":['
        var count = 0
        for node in self.graph.nodes.values():
            if count >= top_n:
                break
            var degree = len(self.graph.get_out_neighbors(node.uid))
            if count > 0:
                report += ","
            report += '{"uid":"' + node.uid + '","name":"' + node.name + '","degree":' + String(degree) + '}'
            count += 1
        report += ']}'
        return report^

    def community_detection(self) -> String:
        return '{"communities":{}}'

    def path_stats(self) -> String:
        var node_count = self.graph.node_count()
        var edge_count = self.graph.edge_count()
        return '{"node_count":' + String(node_count) + ',"edge_count":' + String(edge_count) + '}'
