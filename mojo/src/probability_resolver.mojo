from std.collections import Dict, List
from probability_models import ParameterType
from http_client import json_escape_string


struct ProbabilityContextResolver(Movable):
    var world_frame: String
    var npc_health: Dict[String, Float64]
    var npc_mood: Dict[String, String]
    var npc_skills: Dict[String, Dict[String, Float64]]

    def __init__(out self):
        self.world_frame = "{}"
        self.npc_health = Dict[String, Float64]()
        self.npc_mood = Dict[String, String]()
        self.npc_skills = Dict[String, Dict[String, Float64]]()

    def set_world_frame(mut self, frame_json: String):
        self.world_frame = frame_json

    def set_npc_health(mut self, name: String, health: Float64):
        self.npc_health[name] = health

    def set_npc_mood(mut self, name: String, mood: String):
        self.npc_mood[name] = mood

    def set_npc_skill(mut self, name: String, skill: String, value: Float64) raises:
        if name not in self.npc_skills:
            self.npc_skills[name] = Dict[String, Float64]()
        self.npc_skills[name][skill] = value

    def build_context(
        self,
        actor: String,
        target: String,
        action_type: String,
        location: String,
        extra: String,
    ) raises -> String:
        var context = '{"actor":"' + json_escape_string(actor) + '"'
        context += ',"target":"' + json_escape_string(target) + '"'
        context += ',"action_type":"' + json_escape_string(action_type) + '"'
        context += ',"location":"' + json_escape_string(location) + '"'

        context += self._get_actor_stats(actor, action_type)

        if target != "":
            context += self._get_target_stats(target, action_type)

        if actor != "" and target != "":
            var strength = self._get_relationship_strength(actor, target)
            context += ',"relationship_strength":' + String(strength)

        if location != "":
            context += self._get_environment_modifiers(location)

        if extra != "" and extra != "{}":
            context += "," + String(extra[byte=1:])

        context += self._fill_defaults()

        context += "}"
        return context^

    def _get_actor_stats(self, actor: String, action_type: String) raises -> String:
        var result = ""

        if actor in self.npc_health:
            result += ',"actor_health":' + String(self.npc_health[actor])
        else:
            result += ',"actor_health":0.5'

        if actor in self.npc_mood:
            var mood = self.npc_mood[actor].lower()
            var mood_factor = self._mood_to_factor(mood)
            result += ',"actor_mood_factor":' + String(mood_factor)
        else:
            result += ',"actor_mood_factor":0.5'

        result += ',"actor_has_goals":0.0,"actor_resources":0.0'
        result += ',"actor_combat_skill":0.5,"actor_weapon_proficiency":0.5'
        result += ',"actor_charisma":0.5,"actor_strength":0.5'
        result += ',"actor_dexterity":0.5,"actor_intelligence":0.5,"actor_wisdom":0.5'
        return result^

    def _get_target_stats(self, target: String, action_type: String) raises -> String:
        var result = ""
        if target in self.npc_health:
            result += ',"target_defense":' + String(self.npc_health[target] / 100.0)
        else:
            result += ',"target_defense":0.5'

        result += ',"target_health":0.5'
        result += ',"target_resistance":0.5'

        if target in self.npc_mood:
            var mood = self.npc_mood[target].lower()
            result += ',"target_mood_factor":' + String(self._mood_to_factor(mood))
        else:
            result += ',"target_mood_factor":0.5'
        return result^

    def _get_relationship_strength(self, actor: String, target: String) -> Float64:
        return 0.5

    def _get_environment_modifiers(self, location: String) -> String:
        var result = ""
        result += ',"environment_light":0.5'
        result += ',"environment_noise":0.5'
        result += ',"environment_modifier":0.0'
        result += ',"environment_terrain_mod":0.0'
        return result^

    def _fill_defaults(self) -> String:
        return ',"faction_reputation":0.5,"rule_penalty":0.0,"item_bonus":0.0,"argument_quality":0.5'

    def _mood_to_factor(self, mood: String) -> Float64:
        if mood == "joy" or mood == "happiness" or mood == "happy":
            return 0.9
        if mood == "excited":
            return 0.85
        if mood == "content":
            return 0.7
        if mood == "neutral" or mood == "calm":
            return 0.5
        if mood == "worried":
            return 0.4
        if mood == "sad":
            return 0.3
        if mood == "fear" or mood == "angry" or mood == "anger":
            return 0.2
        if mood == "rage" or mood == "depressed":
            return 0.1
        return 0.5

    def _get_skill_map(self) -> Dict[String, String]:
        var skill_map = Dict[String, String]()
        skill_map["combat"] = "strength"
        skill_map["attack"] = "strength"
        skill_map["fight"] = "strength"
        skill_map["persuasion"] = "charisma"
        skill_map["persuade"] = "charisma"
        skill_map["diplomacy"] = "charisma"
        skill_map["deception"] = "charisma"
        skill_map["stealth"] = "dexterity"
        skill_map["sneak"] = "dexterity"
        skill_map["investigation"] = "intelligence"
        skill_map["investigate"] = "intelligence"
        skill_map["search"] = "intelligence"
        skill_map["athletics"] = "strength"
        skill_map["climb"] = "strength"
        skill_map["swim"] = "strength"
        skill_map["perception"] = "wisdom"
        skill_map["survival"] = "wisdom"
        skill_map["intimidation"] = "charisma"
        return skill_map^
