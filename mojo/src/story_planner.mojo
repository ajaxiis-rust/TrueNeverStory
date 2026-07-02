from std.collections import Dict, List
from std import subprocess
from http_client import json_escape_string, json_extract_string, json_extract_int, str_int


struct Chapter(Movable):
    var id: String
    var title: String
    var summary: String
    var completed: Bool
    var beats: List[String]

    def __init__(out self, id: String, title: String, summary: String, completed: Bool = False):
        self.id = id
        self.title = title
        self.summary = summary
        self.completed = completed
        self.beats = List[String]()


struct StoryBeat(Movable):
    var id: String
    var chapter_id: String
    var beat_type: String
    var description: String
    var triggered: Bool
    var involved_entities: List[String]

    def __init__(out self, id: String, chapter_id: String, beat_type: String, description: String, triggered: Bool = False):
        self.id = id
        self.chapter_id = chapter_id
        self.beat_type = beat_type
        self.description = description
        self.triggered = triggered
        self.involved_entities = List[String]()


struct StoryPlanner:
    var chapter_count: Int
    var beat_count: Int
    var pending_beat_count: Int
    var current_chapter_id: String

    def __init__(out self):
        self.chapter_count = 3
        self.beat_count = 15
        self.pending_beat_count = 15
        self.current_chapter_id = "ch1"

    def should_generate_beat(self) -> Bool:
        return self.pending_beat_count > 0

    def generate_next_beat(mut self) -> String:
        if self.pending_beat_count <= 0:
            return "{}"
        self.pending_beat_count -= 1
        self.beat_count += 1
        return '{"id":"beat_' + str_int(self.beat_count) + '","type":"inciting_incident","description":"A surprising event pushes the story forward.","category":"story_beat"}'

    def mark_beat_done(mut self, beat_id: String):
        if self.pending_beat_count > 0:
            self.pending_beat_count -= 1

    def get_plan_summary(self) -> String:
        return '{"current_chapter":"ch1","chapters":{"ch1":{"title":"The Awakening","completed":false},"ch2":{"title":"Trials and Tribulations","completed":false},"ch3":{"title":"Climax","completed":false}},"pending_beats":' + str_int(self.pending_beat_count) + "}"

    def _count_pending_beats(self) -> Int:
        return self.pending_beat_count
