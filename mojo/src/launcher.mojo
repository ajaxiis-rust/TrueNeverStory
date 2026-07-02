from std.collections import Dict, List
from context import NarrativeContext
from birth import BirthScenario
from http_client import json_escape_string, json_extract_string


struct GameLauncher(Movable):
    var ctx: NarrativeContext

    def __init__(out self, var ctx: NarrativeContext):
        self.ctx = ctx^

    def system_check(self) -> String:
        return '{"ok":true,"message":"All systems operational."}'

    def launch_new_game(mut self, hints: String = "", isekai: Bool = False, starting_age: Int = 5) raises -> String:
        var check = self.system_check()
        var is_ok = json_extract_string(check, "ok")
        if is_ok != "true":
            return check

        var birth = BirthScenario()
        var birth_json = birth.generate_and_apply(hints, isekai, starting_age)
        var name = json_extract_string(birth_json, "character_name")
        if name == "":
            name = "Newborn"

        var session_id = "newgame_001"
        return '{"session_id":"' + json_escape_string(session_id) + '","character":"' + json_escape_string(name) + '","birth":' + birth_json + '}'

    def continue_game(self, session_id: String) raises -> String:
        return '{"session_id":"' + json_escape_string(session_id) + '","status":"continued"}'

    def list_sessions(self) -> String:
        return "[]"
