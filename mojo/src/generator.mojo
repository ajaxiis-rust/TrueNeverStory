from std.collections import Dict, List
from llm_client import LLMClient
from http_client import json_escape_string


struct WorldGenerator(Movable):
    var llm: LLMClient

    def __init__(out self, var llm: LLMClient):
        self.llm = llm^

    def generate_world_frame(mut self) raises -> String:
        var prompt = "Generate a complete fantasy world frame with world_name, description, magic_system, races, factions, locations, items, historical_events, world_rules. Return as JSON."
        return self.llm.generate_json(prompt)^

    def expand_character_L2(mut self, l1_json: String, rules_summary: String, existing_names: String) raises -> String:
        var prompt = "Expand this character to Layer 2 (detailed profile).\nL1: " + l1_json + "\nRules: " + rules_summary + "\nExisting: " + existing_names + "\nReturn JSON with abilities, stats, weapons, background, social_class."
        return self.llm.generate_json(prompt)^

    def expand_location_L2(mut self, l1_json: String, rules_summary: String, existing_names: String) raises -> String:
        var prompt = "Expand this location to Layer 2 (detailed profile).\nL1: " + l1_json + "\nRules: " + rules_summary + "\nReturn JSON with terrain, light_level, noise_level, probability_modifier, active_rules, romance_modifier."
        return self.llm.generate_json(prompt)^

    def expand_item_L2(mut self, l1_json: String, magic_rules: String, existing_names: String) raises -> String:
        var prompt = "Expand this item to Layer 2.\nL1: " + l1_json + "\nMagic rules: " + magic_rules + "\nReturn JSON with rarity, effects, history, owner."
        return self.llm.generate_json(prompt)^

    def expand_event_L2(mut self, l1_json: String, existing_names: String) raises -> String:
        var prompt = "Expand this event to Layer 2.\nL1: " + l1_json + "\nReturn JSON with participants, consequences, location, date."
        return self.llm.generate_json(prompt)^

    def expand_faction_L2(mut self, l1_json: String, existing_names: String) raises -> String:
        var prompt = "Expand this faction to Layer 2.\nL1: " + l1_json + "\nReturn JSON with leader, goals, members, territory, alignment, reputation."
        return self.llm.generate_json(prompt)^

    def expand_rule_L2(mut self, l1_json: String, existing_names: String) raises -> String:
        var prompt = "Expand this world rule to Layer 2.\nL1: " + l1_json + "\nReturn JSON with category, action_category, effect, exceptions."
        return self.llm.generate_json(prompt)^

    def expand_character_L3(mut self, l1_json: String, l2_json: String) raises -> String:
        var prompt = "Expand this character to Layer 3 (deep personality).\nL1: " + l1_json + "\nL2: " + l2_json + "\nReturn JSON with secrets, fears, dreams, innate_skills, personality_traits."
        return self.llm.generate_json(prompt)^

    def expand_location_L3(mut self, l1_json: String, l2_json: String) raises -> String:
        var prompt = "Expand this location to Layer 3.\nL1: " + l1_json + "\nL2: " + l2_json + "\nReturn JSON with hidden_areas, secrets, lore."
        return self.llm.generate_json(prompt)^

    def expand_item_L3(mut self, l1_json: String, l2_json: String, magic_rules: String) raises -> String:
        var prompt = "Expand this item to Layer 3.\nL1: " + l1_json + "\nL2: " + l2_json + "\nReturn JSON with origin_story, curse, quest_link."
        return self.llm.generate_json(prompt)^

    def expand_event_L3(mut self, l1_json: String, l2_json: String) raises -> String:
        var prompt = "Expand this event to Layer 3.\nL1: " + l1_json + "\nL2: " + l2_json + "\nReturn JSON with prophecy, ripple_effects, hidden_connections."
        return self.llm.generate_json(prompt)^

    def expand_faction_L3(mut self, l1_json: String, l2_json: String) raises -> String:
        var prompt = "Expand this faction to Layer 3.\nL1: " + l1_json + "\nL2: " + l2_json + "\nReturn JSON with internal_conflicts, secret_agenda, enemies."
        return self.llm.generate_json(prompt)^

    def expand_rule_L3(mut self, l1_json: String, l2_json: String) raises -> String:
        var prompt = "Expand this world rule to Layer 3.\nL1: " + l1_json + "\nL2: " + l2_json + "\nReturn JSON with origin, exceptions, interactions_with_other_rules."
        return self.llm.generate_json(prompt)^

    def generate_scene(mut self, world_name: String, rules: String, context: String) raises -> String:
        var prompt = "Generate a narrative scene for the world '" + world_name + "'.\nRules: " + rules + "\nContext: " + context + "\nReturn JSON with scene_text, characters_involved, location, mood."
        return self.llm.generate_json(prompt)^
