from std.collections import Dict, List
from context import NarrativeContext
from http_client import json_escape_string
from llm_client import LLMClient


struct UserSession(Movable):
    var session_id: String
    var world_name: String
    var current_location: String
    var active_character: String
    var user_role: String

    def __init__(out self, session_id: String, world_name: String, active_character: String = ""):
        self.session_id = session_id
        self.world_name = world_name
        self.current_location = "unknown"
        self.active_character = active_character
        self.user_role = "protagonist"

    def to_json(self) -> String:
        return '{"session_id":"' + json_escape_string(self.session_id) + '","world_name":"' + json_escape_string(self.world_name) + '","location":"' + json_escape_string(self.current_location) + '","character":"' + json_escape_string(self.active_character) + '"}'


struct UserAgent:
    var session: UserSession

    def __init__(out self, ctx: NarrativeContext, session_id: String = "default", world_name: String = "Unknown"):
        self.session = UserSession(session_id, world_name)

    def set_character(mut self, name: String):
        self.session.active_character = name

    def process_input(self, user_input: String) raises -> String:
        var lower = user_input.lower()
        if lower.startswith("/"):
            var cmd = String(lower[byte=1:])
            return self._handle_command(cmd)
        if lower.startswith("go ") or lower.startswith("move "):
            return "You move forward."
        if lower.startswith("look"):
            return "You look around."
        if lower.startswith("talk"):
            return "You speak."
        return self._generate_narrative(user_input)

    def _handle_command(self, cmd: String) -> String:
        if cmd.startswith("help"):
            return "Commands: /help, /time, /status, /save, /look, /talk <npc>, /inventory, /go <location>, /quests"
        if cmd.startswith("time"):
            return "Story time: 2026-01-01"
        if cmd.startswith("status"):
            return '{"status":"ok"}'
        if cmd.startswith("save"):
            return "Session saved."
        if cmd.startswith("look"):
            return "You see nothing of note."
        if cmd.startswith("inventory"):
            return "You are carrying nothing."
        if cmd.startswith("quests"):
            return "[]"
        return "Unknown command: " + cmd

    def _generate_narrative(self, input: String) raises -> String:
        var prompt = 'You are a narrative AI in the world "' + self.session.world_name + '".\n'
        prompt += "Player input: " + input + "\n"
        prompt += "Respond in character, move the story forward."
        var llm = LLMClient("", "", "")
        return llm.generate_text(prompt)^
