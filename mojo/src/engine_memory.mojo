from std.collections import Dict, List
from std.pathlib import Path
from std import subprocess
from http_client import json_escape_string, json_extract_string
from utils import atomic_write_json, atomic_read_json


# ── Memory Manager ─────────────────────────────────────────────────

struct MemoryManager:
    var storage_path: String
    var max_history: Int
    var conversation_history: List[String]
    var _entry_counter: Int

    def __init__(out self, storage_path: String, max_history: Int = 20):
        self.storage_path = storage_path
        self.max_history = max_history
        self.conversation_history = List[String]()
        self._entry_counter = 0

    def add_entry(mut self, user_input: String, assistant_output: String, metadata_json: String = "{}"):
        var entry = '{"user":"' + json_escape_string(user_input) + '","assistant":"' + json_escape_string(assistant_output) + '","metadata":' + metadata_json + '}'
        self.conversation_history.append(entry^)
        if len(self.conversation_history) > self.max_history:
            _ = self.conversation_history.pop(0)
        self._entry_counter += 1

    def get_recent(self, limit: Int = 10) -> List[String]:
        var result = List[String]()
        var start = len(self.conversation_history) - limit
        if start < 0:
            start = 0
        var i = start
        while i < len(self.conversation_history):
            result.append(self.conversation_history[i])
            i += 1
        return result^

    def clear(mut self):
        self.conversation_history.clear()
        self._entry_counter = 0

    def entry_count(self) -> Int:
        return len(self.conversation_history)
