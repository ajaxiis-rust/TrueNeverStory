from std.collections import Dict, List
from llm_client import LLMClient
from entity_store import EntityStore
from models import EntityNode, WorldFrame
from http_client import json_escape_string, json_extract_string


struct WorldBuilder(Movable):
    var llm: LLMClient
    var store: EntityStore
    var entity_count: Int

    def __init__(out self, var llm: LLMClient, var store: EntityStore):
        self.llm = llm^
        self.store = store^
        self.entity_count = 0

    def create_world(mut self) raises -> String:
        var prompt = "Generate a fantasy world with name, description, races, and factions. Return JSON with: world_name, description, races (array), factions (array)."
        var result = self.llm.generate_json(prompt)^
        self.entity_count += 1
        return result

    def load_existing_world(self, frame_json: String) -> String:
        return frame_json

    def build_L2(mut self) raises -> String:
        var entities = self.store.all_nodes()
        var expanded = 0
        for entity in entities:
            var prompt = 'Expand this entity to Layer 2 (detailed profile). Name: ' + entity.name + ', Type: ' + entity.entity_type + '. Return JSON with abilities, stats, background.'
            var l2 = self.llm.generate_json(prompt)^
            expanded += 1
        return '{"status":"L2 build complete","entities":' + String(expanded) + '}'

    def build_L3(mut self) raises -> String:
        var entities = self.store.all_nodes()
        var expanded = 0
        for entity in entities:
            var prompt = 'Expand this entity to Layer 3 (deep personality). Name: ' + entity.name + '. Return JSON with secrets, fears, dreams, relationships.'
            var l3 = self.llm.generate_json(prompt)^
            expanded += 1
        return '{"status":"L3 build complete","entities":' + String(expanded) + '}'

    def add_npc(mut self, name: String) raises -> String:
        var prompt = 'Create a fantasy NPC named ' + name + '. Return JSON with race, class, personality, backstory.'
        var result = self.llm.generate_json(prompt)^
        self.entity_count += 1
        return result

    def add_item(mut self, name: String) raises -> String:
        var prompt = 'Create a fantasy item named ' + name + '. Return JSON with type, rarity, description, effects.'
        var result = self.llm.generate_json(prompt)^
        self.entity_count += 1
        return result

    def add_faction(mut self, name: String) raises -> String:
        var prompt = 'Create a fantasy faction named ' + name + '. Return JSON with leader, goals, members, territory.'
        var result = self.llm.generate_json(prompt)^
        self.entity_count += 1
        return result

    def add_location(mut self, name: String) raises -> String:
        var prompt = 'Create a fantasy location named ' + name + '. Return JSON with type, description, features, inhabitants.'
        var result = self.llm.generate_json(prompt)^
        self.entity_count += 1
        return result

    def add_event(mut self, name: String) raises -> String:
        var prompt = 'Create a historical event named ' + name + '. Return JSON with date, description, participants, consequences.'
        var result = self.llm.generate_json(prompt)^
        self.entity_count += 1
        return result

    def add_rule(mut self, name: String) raises -> String:
        var prompt = 'Create a world rule named ' + name + '. Return JSON with description, category, effects, exceptions.'
        var result = self.llm.generate_json(prompt)^
        self.entity_count += 1
        return result

    def get_entity_count(self) -> Int:
        return self.entity_count
