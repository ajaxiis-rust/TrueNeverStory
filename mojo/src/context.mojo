from std.collections import Dict, List
from http_client import json_escape_string, json_extract_string, str_int
from llm_client import LLMClient
from entity_store import EntityStore
from graph_engine import GraphEngine


struct NarrativeContext(Movable):
    var world_name: String
    var world_frame_json: String
    var entity_count: Int
    var event_count: Int
    var quest_count: Int
    var is_booted: Bool
    var current_location: String
    var active_character: String

    def __init__(out self):
        self.world_frame_json = "{}"
        self.world_name = "Unknown World"
        self.entity_count = 0
        self.event_count = 0
        self.quest_count = 0
        self.is_booted = False
        self.current_location = "unknown"
        self.active_character = ""

    def set_world_frame(mut self, frame_json: String, name: String):
        self.world_frame_json = frame_json
        self.world_name = name
        self.is_booted = True

    def set_location(mut self, location: String):
        self.current_location = location

    def set_character(mut self, name: String):
        self.active_character = name

    def register_character(mut self, name: String, uid: String, location: String = "unknown"):
        self.entity_count += 1

    def add_quest(mut self, id: String, title: String, description: String, giver: String = "Unknown"):
        self.quest_count += 1

    def record_event(mut self):
        self.event_count += 1

    def generate_story_event(self, story_time: String, entities: String, category: String = "incident") raises -> String:
        var event = '{"title":"Event","description":"A story event occurred."'
        event += ',"category":"' + json_escape_string(category) + '"'
        event += ',"time":"' + json_escape_string(story_time) + '"'
        event += ',"entities":' + entities
        event += ',"importance":0.5}'
        return event^

    def advance_story(self, story_time: String) raises -> String:
        return '{"event":null,"time":"' + json_escape_string(story_time) + '"}'

    def villain_tick(self) -> String:
        return "[]"

    def status(self) -> String:
        var json = '{"world_name":"' + json_escape_string(self.world_name) + '"'
        json += ',"entity_count":' + String(self.entity_count)
        json += ',"event_count":' + String(self.event_count)
        json += ',"quest_count":' + String(self.quest_count)
        json += ',"is_booted":' + ("true" if self.is_booted else "false")
        json += ',"current_location":"' + json_escape_string(self.current_location) + '"'
        json += ',"active_character":"' + json_escape_string(self.active_character) + '"'
        json += "}"
        return json^
