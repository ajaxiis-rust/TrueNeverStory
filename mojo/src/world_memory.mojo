from std.collections import Dict, List
from entity_store import EntityStore
from llm_client import LLMClient
from http_client import json_escape_string, json_extract_string, str_int, str_float


# ── World Memory ───────────────────────────────────────────────────

struct WorldMemoryEntry(Movable):
    var id: String
    var content: String
    var importance: Float64
    var group: String
    var timestamp: String

    def __init__(out self, id: String, content: String, importance: Float64 = 0.5, group: String = "default"):
        self.id = id
        self.content = content
        self.importance = importance
        self.group = group
        self.timestamp = ""

    def to_json(self) -> String:
        return '{"id":"' + json_escape_string(self.id) + '","content":"' + json_escape_string(self.content) + '","importance":' + str_float(self.importance) + ',"group":"' + json_escape_string(self.group) + '"}'


struct WorldMemory:
    var entity_store: EntityStore
    var llm: LLMClient
    var entries: List[WorldMemoryEntry]
    var max_entries: Int
    var entry_counter: Int

    def __init__(out self, var store: EntityStore, var llm: LLMClient, max_entries: Int = 1000):
        self.entity_store = store^
        self.llm = llm^
        self.entries = List[WorldMemoryEntry]()
        self.max_entries = max_entries
        self.entry_counter = 0

    def add_memory(mut self, content: String, importance: Float64 = 0.5, group: String = "default") -> String:
        self.entry_counter += 1
        var id = "mem_" + String(self.entry_counter)
        var entry = WorldMemoryEntry(id, content, importance, group)
        self.entries.append(entry^)
        if len(self.entries) > self.max_entries:
            _ = self.entries.pop(0)
        return id

    def query_memories(self, query: String, limit: Int = 10) -> String:
        var results = List[String]()
        var count = 0
        for entry in self.entries:
            if count >= limit:
                break
            if query == "" or query in entry.content:
                results.append(entry.to_json())
                count += 1
        var json = '{"results":['
        for i in range(len(results)):
            if i > 0:
                json += ","
            json += results[i]
        json += '],"total":' + String(len(self.entries)) + '}'
        return json^

    def get_recent_memories(self, limit: Int = 10) -> String:
        var results = List[String]()
        var start = len(self.entries) - limit
        if start < 0:
            start = 0
        var i = start
        while i < len(self.entries):
            results.append(self.entries[i].to_json())
            i += 1
        var json = '{"memories":['
        for j in range(len(results)):
            if j > 0:
                json += ","
            json += results[j]
        json += ']}'
        return json^

    def consolidate_memories(self) -> String:
        return '{"consolidated":0}'

    def memory_count(self) -> Int:
        return len(self.entries)
