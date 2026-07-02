from std.collections import Dict, List
from http_client import json_escape_string, json_extract_string, str_int


struct RomanceStatus(Movable):
    var value: String

    def __init__(out self, val: String = "stranger"):
        self.value = val

    @staticmethod
    def stranger() -> RomanceStatus:
        return RomanceStatus("stranger")

    @staticmethod
    def acquaintance() -> RomanceStatus:
        return RomanceStatus("acquaintance")

    @staticmethod
    def friend() -> RomanceStatus:
        return RomanceStatus("friend")

    @staticmethod
    def close_friend() -> RomanceStatus:
        return RomanceStatus("close_friend")

    @staticmethod
    def crush() -> RomanceStatus:
        return RomanceStatus("crush")

    @staticmethod
    def dating() -> RomanceStatus:
        return RomanceStatus("dating")

    @staticmethod
    def engaged() -> RomanceStatus:
        return RomanceStatus("engaged")

    @staticmethod
    def married() -> RomanceStatus:
        return RomanceStatus("married")

    @staticmethod
    def estranged() -> RomanceStatus:
        return RomanceStatus("estranged")

    @staticmethod
    def rival() -> RomanceStatus:
        return RomanceStatus("rival")


struct RomanceProgression(Movable):
    var value: String

    def __init__(out self, val: String = "attraction"):
        self.value = val

    @staticmethod
    def attraction() -> RomanceProgression:
        return RomanceProgression("attraction")

    @staticmethod
    def confession() -> RomanceProgression:
        return RomanceProgression("confession")

    @staticmethod
    def date() -> RomanceProgression:
        return RomanceProgression("date")

    @staticmethod
    def kiss() -> RomanceProgression:
        return RomanceProgression("kiss")

    @staticmethod
    def relationship() -> RomanceProgression:
        return RomanceProgression("relationship")

    @staticmethod
    def proposal() -> RomanceProgression:
        return RomanceProgression("proposal")

    @staticmethod
    def marriage() -> RomanceProgression:
        return RomanceProgression("marriage")

    @staticmethod
    def breakup() -> RomanceProgression:
        return RomanceProgression("breakup")

    @staticmethod
    def jealousy() -> RomanceProgression:
        return RomanceProgression("jealousy")


struct RelationshipMemory(Movable):
    var pair_id: String
    var status: RomanceStatus
    var progression_stage: RomanceProgression
    var compatibility: Float64
    var affection: Float64
    var history: List[String]
    var last_interaction: String
    var notes: String
    var gifts_given: List[String]

    def __init__(
        out self,
        pair_id: String,
        var status: RomanceStatus,
        var progression_stage: RomanceProgression,
        compatibility: Float64,
        affection: Float64,
    ):
        self.pair_id = pair_id
        self.status = status^
        self.progression_stage = progression_stage^
        self.compatibility = max(0.0, min(1.0, compatibility))
        self.affection = max(0.0, min(1.0, affection))
        self.history = List[String]()
        self.last_interaction = ""
        self.notes = ""
        self.gifts_given = List[String]()

    def to_json(self) -> String:
        var json = '{"pair_id":"' + json_escape_string(self.pair_id) + '"'
        json += ',"status":"' + json_escape_string(self.status.value) + '"'
        json += ',"progression_stage":"' + json_escape_string(self.progression_stage.value) + '"'
        json += ',"compatibility":' + String(self.compatibility)
        json += ',"affection":' + String(self.affection)
        json += ',"notes":"' + json_escape_string(self.notes) + '"'
        json += ',"gifts_given":['
        for i in range(len(self.gifts_given)):
            if i > 0:
                json += ","
            json += '"' + json_escape_string(self.gifts_given[i]) + '"'
        json += ']}'
        return json^

    def add_history(mut self, event_json: String):
        self.history.append(event_json)

    def is_relationship(self) -> Bool:
        return self.status.value == "dating" or self.status.value == "engaged" or self.status.value == "married"

    def can_progress(self) -> Bool:
        return self.status.value != "estranged" and self.status.value != "rival" and self.status.value != "married"


struct RomanceParams(Movable):
    var actor: String
    var target: String
    var action: String
    var location: String

    def __init__(out self, actor: String, target: String, action: String, location: String = ""):
        self.actor = actor
        self.target = target
        self.action = action
        self.location = location


struct RomanceEvent(Movable):
    var event_type: String
    var actor: String
    var target: String
    var success: Bool
    var affection_change: Float64
    var narrative: String
    var location: String

    def __init__(
        out self,
        event_type: String,
        actor: String,
        target: String,
        success: Bool,
        affection_change: Float64,
        narrative: String,
        location: String = "",
    ):
        self.event_type = event_type
        self.actor = actor
        self.target = target
        self.success = success
        self.affection_change = affection_change
        self.narrative = narrative
        self.location = location

    def to_json(self) -> String:
        var json = '{"event_type":"' + json_escape_string(self.event_type) + '"'
        json += ',"actor":"' + json_escape_string(self.actor) + '"'
        json += ',"target":"' + json_escape_string(self.target) + '"'
        json += ',"success":' + ("true" if self.success else "false")
        json += ',"affection_change":' + String(self.affection_change)
        json += ',"narrative":"' + json_escape_string(self.narrative) + '"'
        json += ',"location":"' + json_escape_string(self.location) + '"'
        json += "}"
        return json^
