from std.collections import Dict, List
from http_client import json_escape_string, json_extract_string, str_int
from probability_engine import ProbabilityEngine
from probability_profiles import get_profile


struct SocialSimulator(Movable):
    var interaction_count: Int
    var last_pair_a: String
    var last_pair_b: String

    def __init__(out self):
        self.interaction_count = 0
        self.last_pair_a = ""
        self.last_pair_b = ""

    def select_interaction_pair(mut self, npc_names: List[String]) -> String:
        if len(npc_names) < 2:
            return "[]"
        var a_idx = self.interaction_count % len(npc_names)
        var b_idx = (self.interaction_count + 1) % len(npc_names)
        if a_idx == b_idx:
            b_idx = (b_idx + 1) % len(npc_names)
        self.last_pair_a = npc_names[a_idx]
        self.last_pair_b = npc_names[b_idx]
        self.interaction_count += 1
        return '["' + json_escape_string(self.last_pair_a) + '","' + json_escape_string(self.last_pair_b) + '"]'

    def simulate_interaction(self, actor: String, target: String) raises -> String:
        var context = Dict[String, String]()
        context["actor"] = actor
        context["target"] = target
        context["relationship_strength"] = "0.5"
        context["luck"] = "0.5"
        var profile = get_profile("persuasion")
        var engine = ProbabilityEngine()
        var result = engine.roll(profile, context, actor)

        var event_type = "conversation"
        if result.success:
            event_type = "positive_interaction"
        else:
            event_type = "negative_interaction"

        var event_json = '{"type":"' + json_escape_string(event_type) + '"'
        event_json += ',"actor":"' + json_escape_string(actor) + '"'
        event_json += ',"target":"' + json_escape_string(target) + '"'
        event_json += ',"success":' + ("true" if result.success else "false")
        event_json += ',"quality":"' + json_escape_string(result.quality.value) + '"'
        event_json += ',"probability":' + String(result.probability)
        event_json += ',"roll":' + String(result.roll)
        event_json += '}'
        return event_json^

    def get_interaction_count(self) -> Int:
        return self.interaction_count
