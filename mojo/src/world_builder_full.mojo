from std.collections import Dict, List
from entity_store import EntityStore
from graph_engine import GraphEngine
from llm_client import LLMClient
from http_client import json_escape_string
from prompts import get_prompts


# ── World Builder ──────────────────────────────────────────────────

struct WorldBuilder:
    var entity_store: EntityStore
    var graph: GraphEngine
    var llm: LLMClient
    var world_frame_json: String
    var num_episodes: Int

    def __init__(out self, var store: EntityStore, var graph: GraphEngine, var llm: LLMClient, num_episodes: Int = 10):
        self.entity_store = store^
        self.graph = graph^
        self.llm = llm^
        self.world_frame_json = "{}"
        self.num_episodes = num_episodes

    def create_world(self) raises -> String:
        return '{"world_name":"New World","status":"created"}'

    def load_existing_world(self) raises -> String:
        return self.world_frame_json

    def build_L1(self) raises -> String:
        return '{"status":"L1 built","entities":0}'

    def build_L2(self) raises -> String:
        return '{"status":"L2 built","entities":0}'

    def build_L3(self) raises -> String:
        return '{"status":"L3 built","entities":0}'

    def build_relationships(self) raises -> String:
        return '{"status":"relationships built"}'

    def add_npc(self, faction_or_race: String) raises -> String:
        var name = "NPC_" + json_escape_string(faction_or_race)
        return '{"name":"' + name + '","type":"Character"}'

    def add_item(self, item_type: String, rarity: String = "uncommon") raises -> String:
        var name = json_escape_string(item_type) + "_Item"
        return '{"name":"' + name + '","type":"Item"}'

    def add_faction(self) raises -> String:
        return '{"name":"New_Faction","type":"Faction"}'

    def add_location(self) raises -> String:
        return '{"name":"New_Location","type":"Location"}'

    def add_event(self) raises -> String:
        return '{"name":"New_Event","type":"Event"}'

    def add_rule(self) raises -> String:
        return '{"name":"New_Rule","type":"WorldRule"}'

    def add_narrative_episodes(self) raises -> String:
        return '{"episodes":' + String(self.num_episodes) + ',"status":"generated"}'

    def repair_relationships(self) -> String:
        return '{"status":"repaired"}'

    def _get_rules_text(self) -> String:
        return ""
