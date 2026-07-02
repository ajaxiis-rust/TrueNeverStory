from std.collections import Dict, List
from entity_store import EntityStore
from llm_client import LLMClient
from http_client import json_escape_string, str_int, str_float


struct EpisodicMemory(Movable):
    var id: String
    var description: String
    var importance: Float64
    var emotion: String
    var location: String

    def __init__(out self, id: String, description: String, importance: Float64 = 0.5, emotion: String = "neutral", location: String = ""):
        self.id = id
        self.description = description
        self.importance = importance
        self.emotion = emotion
        self.location = location


struct NPCProfile(Movable):
    var name: String
    var uid: String
    var location: String
    var health: Int
    var mood: String

    def __init__(out self, name: String, uid: String, location: String = "unknown"):
        self.name = name
        self.uid = uid
        self.location = location
        self.health = 100
        self.mood = "neutral"

    def to_json(self) -> String:
        var json = '{"name":"' + json_escape_string(self.name) + '","uid":"' + json_escape_string(self.uid) + '"'
        json += ',"location":"' + json_escape_string(self.location) + '"'
        json += ',"health":' + str_int(self.health)
        json += ',"mood":"' + json_escape_string(self.mood) + '"'
        json += "}"
        return json^


struct OptimizedMemoryStore(Movable):
    var npc_count: Int

    def __init__(out self, store: EntityStore, llm: LLMClient):
        self.npc_count = 0

    def register(mut self, name: String, uid: String, location: String = "unknown") -> NPCProfile:
        self.npc_count += 1
        return NPCProfile(name, uid, location)

    def get(self, name: String) -> String:
        return '{"name":"' + json_escape_string(name) + '"}'

    def add_memory(mut self, name: String, description: String, importance: Float64 = 0.5, emotion: String = "neutral", location: String = "") -> String:
        return "mem_" + name

    def get_memories(self, name: String, limit: Int = 20) -> String:
        return "[]"

    def move(mut self, name: String, location: String, story_time: String = "") -> String:
        return '{"status":"moved","location":"' + json_escape_string(location) + '"}'

    def adjust_health(mut self, name: String, delta: Int) -> Int:
        return 100

    def set_mood(mut self, name: String, mood: String) -> String:
        return '{"status":"ok","mood":"' + json_escape_string(mood) + '"}'

    def add_goal(mut self, name: String, goal: String) -> String:
        return '{"status":"ok"}'

    def add_item(mut self, name: String, item_name: String) -> String:
        return '{"status":"ok"}'

    def remove_item(mut self, name: String, item_name: String) -> String:
        return '{"status":"ok"}'

    def get_npc_count(self) -> Int:
        return self.npc_count
