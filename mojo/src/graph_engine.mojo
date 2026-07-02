from std.collections import Dict, List

# ── Edge ──────────────────────────────────────────────────────────

@fieldwise_init
struct Edge(ImplicitlyCopyable, Movable, Writable):
    var target: String
    var edge_type: String
    var strength: Float64

    def __init__(out self, target: String, edge_type: String):
        self.target = target
        self.edge_type = edge_type
        self.strength = 1.0

    def write_to(self, mut writer: Some[Writer]):
        writer.write("Edge(", self.target, ": ", self.edge_type, ")")


# ── Graph Node ────────────────────────────────────────────────────

@fieldwise_init
struct GraphNode(ImplicitlyCopyable, Movable, Writable):
    var uid: String
    var name: String
    var entity_type: String

    def __init__(out self, uid: String, name: String):
        self.uid = uid
        self.name = name
        self.entity_type = ""

    def write_to(self, mut writer: Some[Writer]):
        writer.write("GraphNode(", self.uid, ": ", self.name, ")")


# ── Graph Engine ──────────────────────────────────────────────────

@fieldwise_init
struct GraphEngine(Movable):
    var nodes: Dict[String, GraphNode]
    var adj: Dict[String, List[Edge]]
    var rev_adj: Dict[String, List[Edge]]

    def __init__(out self):
        self.nodes = Dict[String, GraphNode]()
        self.adj = Dict[String, List[Edge]]()
        self.rev_adj = Dict[String, List[Edge]]()

    def add_node(mut self, uid: String, name: String, entity_type: String):
        var node = GraphNode(uid, name)
        node.entity_type = entity_type
        self.nodes[uid] = node

        # Initialize adjacency lists
        if uid not in self.adj:
            self.adj[uid] = List[Edge]()
        if uid not in self.rev_adj:
            self.rev_adj[uid] = List[Edge]()

    def add_edge(mut self, source: String, target: String, edge_type: String) raises:
        # Ensure nodes exist
        if source not in self.nodes:
            self.add_node(source, source, "")
        if target not in self.nodes:
            self.add_node(target, target, "")

        # Add forward edge
        var edge = Edge(target, edge_type)
        if source not in self.adj:
            self.adj[source] = List[Edge]()
        self.adj[source].append(edge)

        # Add reverse edge
        var rev_edge = Edge(source, edge_type)
        if target not in self.rev_adj:
            self.rev_adj[target] = List[Edge]()
        self.rev_adj[target].append(rev_edge)

    def remove_node(mut self, uid: String) raises:
        # Remove all edges involving this node
        if uid in self.adj:
            for edge in self.adj[uid]:
                self._remove_reverse_edge(edge.target, uid)
            self.adj.pop(uid)

        if uid in self.rev_adj:
            for edge in self.rev_adj[uid]:
                self._remove_forward_edge(edge.target, uid)
            self.rev_adj.pop(uid)

        self.nodes.pop(uid)

    def _remove_forward_edge(mut self, source: String, target: String) raises:
        if source in self.adj:
            var new_list = List[Edge]()
            for edge in self.adj[source]:
                if edge.target != target:
                    new_list.append(edge)
            self.adj[source] = new_list

    def _remove_reverse_edge(mut self, target: String, source: String) raises:
        if target in self.rev_adj:
            var new_list = List[Edge]()
            for edge in self.rev_adj[target]:
                if edge.target != source:
                    new_list.append(edge)
            self.rev_adj[target] = new_list

    def get_out_neighbors(self, uid: String) raises -> List[Edge]:
        if uid in self.adj:
            return self.adj[uid].copy()
        return List[Edge]()

    def get_in_neighbors(self, uid: String) raises -> List[Edge]:
        if uid in self.rev_adj:
            return self.rev_adj[uid].copy()
        return List[Edge]()

    def get_edges_between(self, uid1: String, uid2: String) raises -> List[Edge]:
        var result = List[Edge]()
        if uid1 in self.adj:
            for edge in self.adj[uid1]:
                if edge.target == uid2:
                    result.append(edge)
        if uid2 in self.adj:
            for edge in self.adj[uid2]:
                if edge.target == uid1:
                    result.append(edge)
        return result^

    def nodes_of_type(self, entity_type: String) raises -> List[String]:
        var result = List[String]()
        for entry in self.nodes.items():
            if entry.value.entity_type == entity_type:
                result.append(entry.key)
        return result^

    def clear(mut self):
        self.nodes.clear()
        self.adj.clear()
        self.rev_adj.clear()

    def node_count(self) -> Int:
        return len(self.nodes)

    def edge_count(self) -> Int:
        var count = 0
        for entry in self.adj.items():
            count += len(entry.value)
        return count
