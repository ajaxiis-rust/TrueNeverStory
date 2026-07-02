from std.collections import Dict, List
from entity_store import EntityStore
from llm_client import LLMClient
from chronicler import Chronicler
from validation import WorldValidator
from quest_manager import QuestManager
from social_sim import SocialSimulator
from world_clock import WorldClock
from memory_optimized import OptimizedMemoryStore
from http_client import json_escape_string, json_extract_string, str_int, str_float


# ── Story Engine ───────────────────────────────────────────────────

struct StoryEngine:
    var world_name: String
    var entity_store: EntityStore
    var llm: LLMClient
    var chronicler: Chronicler
    var event_counter: Int

    def __init__(out self, world_name: String, var store: EntityStore, var llm: LLMClient, var chronicler: Chronicler):
        self.world_name = world_name
        self.entity_store = store^
        self.llm = llm^
        self.chronicler = chronicler^
        self.event_counter = 0

    def generate_event(mut self, category: String = "incident", severity: String = "minor") -> String:
        self.event_counter += 1
        var title = "Story Event " + String(self.event_counter)
        var desc = "A " + category + " occurred in " + self.world_name
        return '{"title":"' + json_escape_string(title) + '","description":"' + json_escape_string(desc) + '","category":"' + category + '","severity":"' + severity + '","effects":[]}'

    def apply_effects(mut self, effects_json: String, story_time: String) -> String:
        return '{"applied":true,"effects_count":0}'

    def tick(mut self, story_time: String) -> String:
        var event = self.generate_event()
        _ = self.chronicler.log_event(
            json_extract_string(event, "title") + ": " + json_extract_string(event, "description"),
            story_time,
            "narrative",
        )
        return '{"event":' + event + ',"next_story_time":"' + json_escape_string(story_time) + '"}'

    def event_count(self) -> Int:
        return self.event_counter
