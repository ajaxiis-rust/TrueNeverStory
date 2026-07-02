from std.collections import Dict, List
from entity_store import EntityStore
from graph_engine import GraphEngine
from llm_client import LLMClient
from http_client import json_escape_string


# ── Start Resolver ─────────────────────────────────────────────────

struct StartingPoint(Movable):
    var character: String
    var location: String
    var story_time: String
    var scenario: String
    var custom_context: String

    def __init__(out self):
        self.character = ""
        self.location = ""
        self.story_time = ""
        self.scenario = ""
        self.custom_context = ""

    def to_json(self) -> String:
        var json = '{"character":"' + self.character + '"'
        json += ',"location":"' + self.location + '"'
        json += ',"story_time":"' + self.story_time + '"'
        json += ',"scenario":"' + self.scenario + '"'
        json += ',"custom_context":"' + self.custom_context + '"}'
        return json^


struct StartResolver:
    var entity_store: EntityStore
    var graph: GraphEngine

    def __init__(out self, var store: EntityStore, var graph: GraphEngine):
        self.entity_store = store^
        self.graph = graph^

    def resolve(self, user_spec: String) -> StartingPoint:
        var start = StartingPoint()
        start.scenario = user_spec
        start.custom_context = user_spec
        return start^

    def _find_closest_entity(self, name: String, entity_type: String) -> String:
        for node in self.entity_store.all_nodes():
            if node.entity_type == entity_type:
                if node.name == name:
                    return node.name
        return ""

    def _get_default_location(self) -> String:
        for node in self.entity_store.all_nodes():
            if node.entity_type == "Location":
                return node.name
        return ""
