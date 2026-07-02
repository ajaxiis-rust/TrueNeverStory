from std.collections import Dict, List
from entity_store import EntityStore


struct WorldValidator(Movable):
    var world_rules_json: String

    def __init__(out self, store: EntityStore, world_rules_json: String = "[]"):
        self.world_rules_json = world_rules_json

    def validate_action(self, actor_name: String, action: String, location: String = "", target: String = "") -> String:
        var action_lower = action
        var loc_lower = location

        if action_lower == "cast_magic" and loc_lower != "":
            if "no magic" in self.world_rules_json and loc_lower in self.world_rules_json:
                return '{"valid":false,"message":"Magic is forbidden in this location!","effects":[{"type":"npc_health","entity":"' + actor_name + '","delta":-15}]}'

        if (action_lower == "attack" or action_lower == "fight") and loc_lower != "":
            if "no combat" in self.world_rules_json and loc_lower in self.world_rules_json:
                return '{"valid":false,"message":"Combat is forbidden in this location!","effects":[]}'

        return '{"valid":true,"message":"ok","effects":[]}'
