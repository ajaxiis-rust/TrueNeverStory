from std.collections import Dict, List
from probability_models import ProbabilityProfile, ProbabilityResult, OutcomeQuality
from probability_engine import ProbabilityEngine
from probability_profiles import get_profile
from romance_models import (
    RomanceStatus,
    RomanceProgression,
    RelationshipMemory,
)
from romance_profiles import get_romance_profile
from http_client import json_escape_string, json_extract_string


struct RomanceEngine(Movable):
    var prob_engine: ProbabilityEngine
    var rel_status: Dict[String, String]
    var rel_stage: Dict[String, String]
    var rel_affection: Dict[String, Float64]
    var rel_compatibility: Dict[String, Float64]
    var rel_history: Dict[String, List[String]]
    var data_dir: String

    def __init__(out self):
        self.prob_engine = ProbabilityEngine()
        self.rel_status = Dict[String, String]()
        self.rel_stage = Dict[String, String]()
        self.rel_affection = Dict[String, Float64]()
        self.rel_compatibility = Dict[String, Float64]()
        self.rel_history = Dict[String, List[String]]()
        self.data_dir = "world_db/romance"

    def _pair_id(self, a: String, b: String) -> String:
        if a.lower() < b.lower():
            return a.lower() + "_" + b.lower()
        return b.lower() + "_" + a.lower()

    def _ensure_relationship(mut self, pid: String):
        if pid not in self.rel_status:
            self.rel_status[pid] = "stranger"
            self.rel_stage[pid] = "attraction"
            self.rel_affection[pid] = 0.3
            self.rel_compatibility[pid] = 0.5
            self.rel_history[pid] = List[String]()

    def get_relationship_json(self, pid: String) raises -> String:
        if pid not in self.rel_status:
            return "{}"
        var json = '{"pair_id":"' + json_escape_string(pid) + '"'
        json += ',"status":"' + json_escape_string(self.rel_status[pid]) + '"'
        json += ',"progression_stage":"' + json_escape_string(self.rel_stage[pid]) + '"'
        json += ',"compatibility":' + String(self.rel_compatibility[pid])
        json += ',"affection":' + String(self.rel_affection[pid])
        json += '}'
        return json^

    def get_relationship(self, a: String, b: String) raises -> String:
        return self.get_relationship_json(self._pair_id(a, b))

    def build_context_dict(self, pid: String) raises -> Dict[String, String]:
        var ctx = Dict[String, String]()
        ctx["current_affection"] = String(self.rel_affection[pid])
        ctx["compatibility"] = String(self.rel_compatibility[pid])
        ctx["actor_charisma"] = "0.5"
        ctx["target_mood_factor"] = "0.5"
        ctx["environment_modifier"] = "0.0"
        ctx["luck"] = "0.5"
        ctx["past_positive_interactions"] = "0.0"
        ctx["relationship_duration"] = "0.1"
        ctx["family_approval"] = "0.5"
        ctx["time_of_day_modifier"] = "0.0"
        ctx["conflict_level"] = String(1.0 - self.rel_affection[pid])
        ctx["external_pressure"] = "0.0"
        ctx["relationship_strength"] = String(self.rel_compatibility[pid])
        ctx["relationship_compatibility"] = String(self.rel_compatibility[pid])
        return ctx^

    def _apply_delta(mut self, pid: String, delta: Float64) raises -> Float64:
        var new_aff = max(0.0, min(1.0, self.rel_affection[pid] + delta))
        self.rel_affection[pid] = new_aff
        return new_aff

    def _record_event(mut self, pid: String, event_json: String) raises:
        if pid not in self.rel_history:
            self.rel_history[pid] = List[String]()
        self.rel_history[pid].append(event_json)

    def attempt_attraction(
        mut self, actor: String, target: String, location: String
    ) raises -> String:
        var pid = self._pair_id(actor, target)
        self._ensure_relationship(pid)
        var ctx = self.build_context_dict(pid)
        var profile = get_romance_profile("romance_attraction")
        var result = self.prob_engine.roll(profile, ctx, actor)

        var affection_delta = 0.15 if result.success else -0.05
        if result.quality.value == "critical_success":
            affection_delta = 0.25
        elif result.quality.value == "critical_failure":
            affection_delta = -0.10

        var new_affection = self._apply_delta(pid, affection_delta)

        if result.success and self.rel_status[pid] == "stranger":
            self.rel_status[pid] = "acquaintance"
        elif result.success and new_affection > 0.6 and (self.rel_status[pid] == "acquaintance" or self.rel_status[pid] == "friend"):
            self.rel_status[pid] = "crush"

        var event_json = '{"type":"attraction_check","success":' + ("true" if result.success else "false")
        event_json += ',"quality":"' + json_escape_string(result.quality.value) + '"'
        event_json += ',"affection_change":' + String(affection_delta) + '}'
        self._record_event(pid, event_json)

        var quality_desc = self._quality_description(result.quality.value)
        var narrative = actor + " feels " + quality_desc + " drawn to " + target + ". "
        if result.success:
            narrative += "There seems to be a spark between them."
        else:
            narrative += "Perhaps it just wasn't meant to be."

        return '{"success":' + ("true" if result.success else "false") + ',"narrative":"' + json_escape_string(narrative) + '","new_affection":' + String(new_affection) + '}'

    def attempt_confession(
        mut self, actor: String, target: String, location: String, message: String = ""
    ) raises -> String:
        var pid = self._pair_id(actor, target)
        self._ensure_relationship(pid)

        if self.rel_affection[pid] < 0.4:
            var msg = actor + " doesn't feel strongly enough to confess yet."
            return '{"success":false,"narrative":"' + json_escape_string(msg) + '","new_affection":' + String(self.rel_affection[pid]) + '}'

        var ctx = self.build_context_dict(pid)
        var profile = get_romance_profile("romance_confession")
        var result = self.prob_engine.roll(profile, ctx, actor)

        var affection_delta: Float64
        if result.success:
            affection_delta = 0.25
            self.rel_status[pid] = "dating"
            self.rel_stage[pid] = "confession"
        else:
            affection_delta = -0.15
            self.rel_status[pid] = "estranged"
            self.rel_stage[pid] = "breakup"

        var new_affection = self._apply_delta(pid, affection_delta)

        var event_json = '{"type":"confession","success":' + ("true" if result.success else "false")
        event_json += ',"quality":"' + json_escape_string(result.quality.value) + '"'
        event_json += ',"affection_change":' + String(affection_delta) + '}'
        self._record_event(pid, event_json)

        var quality_desc = self._quality_description(result.quality.value)
        var narrative = actor + " confesses their feelings to " + target + " " + quality_desc + ". "
        if message != "":
            narrative += message + " "
        if result.success:
            narrative += target + " accepts!"
        else:
            narrative += target + " rejects " + actor + "."

        return '{"success":' + ("true" if result.success else "false") + ',"narrative":"' + json_escape_string(narrative) + '","new_affection":' + String(new_affection) + '}'

    def attempt_date(
        mut self, actor: String, target: String, location: String
    ) raises -> String:
        var pid = self._pair_id(actor, target)
        self._ensure_relationship(pid)

        if self.rel_status[pid] == "stranger":
            return '{"success":false,"narrative":"' + json_escape_string(actor + " and " + target + " don't know each other well enough to date.") + '","new_affection":0.0}'

        var ctx = self.build_context_dict(pid)
        var profile = get_romance_profile("romance_date")
        var result = self.prob_engine.roll(profile, ctx, actor)

        var affection_delta = 0.15 if result.success else -0.05
        if result.quality.value == "critical_success":
            affection_delta = 0.25
        elif result.quality.value == "critical_failure":
            affection_delta = -0.10

        var new_affection = self._apply_delta(pid, affection_delta)
        if result.success and (self.rel_status[pid] == "crush" or self.rel_status[pid] == "acquaintance"):
            self.rel_status[pid] = "dating"
        self.rel_stage[pid] = "date"

        var event_json = '{"type":"date","success":' + ("true" if result.success else "false")
        event_json += ',"quality":"' + json_escape_string(result.quality.value) + '"'
        event_json += ',"affection_change":' + String(affection_delta) + '}'
        self._record_event(pid, event_json)

        var quality_desc = self._quality_description(result.quality.value)
        var narrative = actor + " and " + target + " go on a date"
        if location != "":
            narrative += " at " + location
        narrative += ". "
        if result.success:
            narrative += "It goes " + quality_desc + "!"
        else:
            narrative += "It doesn't go well."

        return '{"success":' + ("true" if result.success else "false") + ',"narrative":"' + json_escape_string(narrative) + '","new_affection":' + String(new_affection) + '}'

    def attempt_kiss(
        mut self, actor: String, target: String, location: String
    ) raises -> String:
        var pid = self._pair_id(actor, target)
        self._ensure_relationship(pid)

        if self.rel_status[pid] != "dating" and self.rel_status[pid] != "crush" and self.rel_status[pid] != "close_friend":
            return '{"success":false,"narrative":"' + json_escape_string(actor + " and " + target + " aren't close enough for a kiss yet.") + '","new_affection":0.0}'

        var ctx = self.build_context_dict(pid)
        var profile = get_romance_profile("romance_kiss")
        var result = self.prob_engine.roll(profile, ctx, actor)

        var affection_delta = 0.10 if result.success else -0.08
        if result.quality.value == "critical_success":
            affection_delta = 0.20
        elif result.quality.value == "critical_failure":
            affection_delta = -0.15

        var new_affection = self._apply_delta(pid, affection_delta)
        self.rel_stage[pid] = "kiss"

        var event_json = '{"type":"kiss","success":' + ("true" if result.success else "false")
        event_json += ',"quality":"' + json_escape_string(result.quality.value) + '"'
        event_json += ',"affection_change":' + String(affection_delta) + '}'
        self._record_event(pid, event_json)

        var quality_desc = self._quality_description(result.quality.value)
        var narrative = actor + " kisses " + target + " " + quality_desc + ". "
        if result.success:
            narrative += "It's magical!"
        else:
            narrative += "They pull away."

        return '{"success":' + ("true" if result.success else "false") + ',"narrative":"' + json_escape_string(narrative) + '","new_affection":' + String(new_affection) + '}'

    def attempt_proposal(
        mut self, actor: String, target: String, location: String
    ) raises -> String:
        var pid = self._pair_id(actor, target)
        self._ensure_relationship(pid)

        if self.rel_status[pid] != "dating":
            return '{"success":false,"narrative":"' + json_escape_string(actor + " and " + target + " aren't in a serious relationship yet.") + '","new_affection":' + String(self.rel_affection[pid]) + '}'

        if self.rel_affection[pid] < 0.7:
            var msg = target + " doesn't love " + actor + " enough to marry yet."
            return '{"success":false,"narrative":"' + json_escape_string(msg) + '","new_affection":' + String(self.rel_affection[pid]) + '}'

        var ctx = self.build_context_dict(pid)
        var profile = get_romance_profile("romance_proposal")
        var result = self.prob_engine.roll(profile, ctx, actor)

        var affection_delta = 0.15 if result.success else -0.25
        var new_affection = self._apply_delta(pid, affection_delta)

        if result.success:
            self.rel_status[pid] = "engaged"
            self.rel_stage[pid] = "proposal"
        else:
            self.rel_status[pid] = "estranged"
            self.rel_stage[pid] = "breakup"

        var event_json = '{"type":"proposal","success":' + ("true" if result.success else "false")
        event_json += ',"quality":"' + json_escape_string(result.quality.value) + '"'
        event_json += ',"affection_change":' + String(affection_delta) + '}'
        self._record_event(pid, event_json)

        var quality_desc = self._quality_description(result.quality.value)
        var narrative = actor + " proposes to " + target + " " + quality_desc + ". "
        if result.success:
            narrative += "They say yes!"
        else:
            narrative += "They say no..."

        return '{"success":' + ("true" if result.success else "false") + ',"narrative":"' + json_escape_string(narrative) + '","new_affection":' + String(new_affection) + '}'

    def attempt_breakup(
        mut self, actor: String, target: String, reason: String = ""
    ) raises -> String:
        var pid = self._pair_id(actor, target)
        if pid not in self.rel_status:
            return '{"success":false,"narrative":"' + json_escape_string(actor + " and " + target + " aren't in a relationship.") + '","new_affection":0.0}'

        if self.rel_status[pid] != "dating" and self.rel_status[pid] != "engaged" and self.rel_status[pid] != "married":
            return '{"success":false,"narrative":"' + json_escape_string(actor + " and " + target + " aren't in a relationship.") + '","new_affection":0.0}'

        var ctx = Dict[String, String]()
        ctx["current_affection"] = String(self.rel_affection[pid])
        ctx["conflict_level"] = String(1.0 - self.rel_affection[pid])
        ctx["external_pressure"] = "0.0"
        ctx["luck"] = "0.5"
        var profile = get_romance_profile("romance_breakup")
        var result = self.prob_engine.roll(profile, ctx, actor)

        var affection_delta = -0.4 if result.success else 0.1
        var new_affection = self._apply_delta(pid, affection_delta)
        self.rel_status[pid] = "estranged"
        self.rel_stage[pid] = "breakup"

        var event_json = '{"type":"breakup","success":' + ("true" if result.success else "false")
        event_json += ',"quality":"' + json_escape_string(result.quality.value) + '"'
        event_json += ',"affection_change":' + String(affection_delta) + '}'
        self._record_event(pid, event_json)

        var quality_desc = self._quality_description(result.quality.value)
        var narrative = actor + " breaks up with " + target + " " + quality_desc + ". "
        if reason != "":
            narrative += reason + " "
        if not result.success:
            narrative += "They part on bad terms."
        else:
            narrative += "They remain friends."

        return '{"success":' + ("true" if result.success else "false") + ',"narrative":"' + json_escape_string(narrative) + '","new_affection":' + String(new_affection) + '}'

    def give_gift(
        mut self, actor: String, target: String, gift_name: String
    ) raises -> String:
        var pid = self._pair_id(actor, target)
        self._ensure_relationship(pid)
        var affection_delta = 0.1
        var new_affection = self._apply_delta(pid, affection_delta)

        var event_json = '{"type":"gift","gift":"' + json_escape_string(gift_name)
        event_json += '","success":true,"affection_change":' + String(affection_delta) + '}'
        self._record_event(pid, event_json)

        var narrative = actor + " gives " + target + " a " + gift_name + ". " + target + " appreciates the gesture."
        return '{"success":true,"narrative":"' + json_escape_string(narrative) + '","new_affection":' + String(new_affection) + '}'

    def _quality_description(self, quality: String) -> String:
        if quality == "critical_success":
            return "amazingly"
        if quality == "success":
            return "successfully"
        if quality == "marginal_success":
            return "barely"
        if quality == "marginal_failure":
            return "almost"
        if quality == "failure":
            return "unsuccessfully"
        if quality == "critical_failure":
            return "disastrously"
        return "unexpectedly"

    def get_all_relationships_for(self, character: String) raises -> String:
        var result = "["
        var first = True
        var char_lower = character.lower()
        for pid in self.rel_status:
            if char_lower in pid:
                if not first:
                    result += ","
                result += self.get_relationship_json(pid)
                first = False
        result += "]"
        return result^

    def get_relationship_status(self, a: String, b: String) raises -> String:
        var pid = self._pair_id(a, b)
        if pid in self.rel_status:
            return self.rel_status[pid]
        return "stranger"

    def get_dating_pairs(self) raises -> String:
        var result = "["
        var first = True
        for pid in self.rel_status:
            if self.rel_status[pid] == "dating":
                if not first:
                    result += ","
                var names = String(pid).split("_")
                if len(names) >= 2:
                    result += '["' + json_escape_string(String(names[0])) + '","' + json_escape_string(String(names[1])) + '"]'
                    first = False
        result += "]"
        return result^
