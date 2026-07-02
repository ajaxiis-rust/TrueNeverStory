from std.collections import Dict, List
from std import subprocess
from http_client import json_escape_string, json_extract_string, json_extract_int, str_int


struct Quest(Movable):
    var id: String
    var title: String
    var description: String
    var giver: String
    var status: String
    var objectives: String

    def __init__(out self, title: String, description: String):
        self.id = ""
        self.title = title
        self.description = description
        self.giver = "Unknown"
        self.status = "active"
        self.objectives = "[]"

    def to_json(self) -> String:
        return '{"id":"' + json_escape_string(self.id) + '","title":"' + json_escape_string(self.title) + '","description":"' + json_escape_string(self.description) + '","giver":"' + json_escape_string(self.giver) + '","status":"' + json_escape_string(self.status) + '","objectives":' + self.objectives + "}"


struct QuestManager(Movable):
    var quest_count: Int
    var active_count: Int

    def __init__(out self):
        self.quest_count = 0
        self.active_count = 0

    def add_quest(mut self, quest: Quest):
        self.quest_count += 1
        self.active_count += 1

    def get_quest_count(self) -> Int:
        return self.quest_count

    def get_active_count(self) -> Int:
        return self.active_count

    def get_active_quests(self) -> String:
        return '{"quests":[],"count":' + String(self.active_count) + '}'
