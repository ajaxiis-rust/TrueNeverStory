from std.collections import Dict, List
from std import subprocess
from http_client import json_escape_string, json_extract_string, json_extract_int, _find_substring, str_int


struct ConversationTurn(Movable):
    var role: String
    var content: String
    var timestamp: String
    var metadata: String

    def __init__(out self, role: String, content: String, timestamp: String = "", metadata: String = "{}"):
        self.role = role
        self.content = content
        self.timestamp = timestamp
        self.metadata = metadata

    def to_json(self) -> String:
        return '{"role":"' + json_escape_string(self.role) + '","content":"' + json_escape_string(self.content) + '","timestamp":"' + json_escape_string(self.timestamp) + '","metadata":' + self.metadata + "}"


struct SessionHistory(Movable):
    var session_id: String
    var storage_dir: String
    var turn_count: Int

    def __init__(out self, session_id: String, storage_dir: String):
        self.session_id = session_id
        self.storage_dir = storage_dir
        self.turn_count = 0

    def add_turn(mut self, role: String, content: String, timestamp: String = "") -> ConversationTurn:
        var ts = timestamp
        if ts == "":
            ts = "2026-01-01T00:00:00"
        var turn = ConversationTurn(role, content, ts)
        self.turn_count += 1
        return turn

    def clear(mut self):
        self.turn_count = 0

    def is_empty(self) -> Bool:
        return self.turn_count == 0


struct HistoryManager:
    var storage_dir: String
    var turn_count: Int

    def __init__(out self, db_path: String):
        self.storage_dir = db_path + "/session_history"
        self.turn_count = 0

    def add_turn(mut self, role: String, content: String, timestamp: String = "") -> ConversationTurn:
        self.turn_count += 1
        var ts = timestamp
        if ts == "":
            ts = "2026-01-01T00:00:00"
        return ConversationTurn(role, content, ts)

    def get_turn_count(self) -> Int:
        return self.turn_count

    def clear_cache(mut self):
        self.turn_count = 0
