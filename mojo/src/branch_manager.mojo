from std.collections import Dict, List
from entity_store import EntityStore
from graph_engine import GraphEngine
from http_client import json_escape_string


# ── Branch Manager ─────────────────────────────────────────────────

struct Branch(Movable):
    var name: String
    var description: String
    var created_at: String

    def __init__(out self, name: String, description: String = ""):
        self.name = name
        self.description = description
        self.created_at = ""

    def to_json(self) -> String:
        return '{"name":"' + json_escape_string(self.name) + '","description":"' + json_escape_string(self.description) + '"}'


struct BranchManager:
    var entity_store: EntityStore
    var graph: GraphEngine
    var branches: Dict[String, Branch]
    var current_branch: String
    var branch_counter: Int

    def __init__(out self, var store: EntityStore, var graph: GraphEngine):
        self.entity_store = store^
        self.graph = graph^
        self.branches = Dict[String, Branch]()
        self.current_branch = "main"
        self.branch_counter = 0

    def create_branch(mut self, name: String, description: String = "") -> String:
        self.branch_counter += 1
        var branch = Branch(name, description)
        self.branches[name] = branch^
        return '{"branch":"' + json_escape_string(name) + '","status":"created"}'

    def switch_branch(mut self, name: String) -> String:
        if name in self.branches:
            self.current_branch = name
            return '{"branch":"' + json_escape_string(name) + '","status":"switched"}'
        return '{"error":"branch not found"}'

    def list_branches(self) -> String:
        var result = '{"branches":['
        var first = True
        for entry in self.branches.items():
            if not first:
                result += ","
            result += entry.value.to_json()
            first = False
        result += '],"current":"' + json_escape_string(self.current_branch) + '"}'
        return result^

    def merge_branch(self, name: String) -> String:
        if name in self.branches:
            return '{"branch":"' + json_escape_string(name) + '","status":"merged"}'
        return '{"error":"branch not found"}'

    def branch_count(self) -> Int:
        return len(self.branches)
