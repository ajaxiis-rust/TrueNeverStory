from std.collections import Dict, List
from std import subprocess
from http_client import json_escape_string, json_extract_string, json_extract_int, str_int


struct VillainMemory(Movable):
    var timestamp: String
    var description: String
    var success: Bool

    def __init__(out self, timestamp: String, description: String, success: Bool = True):
        self.timestamp = timestamp
        self.description = description
        self.success = success


struct VillainAgenda(Movable):
    var name: String
    var description: String
    var current_phase: String
    var progress_clock: Int
    var target_clock: Int
    var ultimate_goal: String

    def __init__(out self, name: String, description: String, phase: String = "plotting", progress: Int = 0, target: Int = 10, goal: String = ""):
        self.name = name
        self.description = description
        self.current_phase = phase
        self.progress_clock = progress
        self.target_clock = target
        self.ultimate_goal = goal

    def advance_phase(mut self) -> Bool:
        if self.current_phase == "plotting":
            self.current_phase = "preparing"
        elif self.current_phase == "preparing":
            self.current_phase = "executing"
        elif self.current_phase == "executing":
            self.current_phase = "climax"
        elif self.current_phase == "climax":
            self.progress_clock = 0
            self.current_phase = "plotting"
            self.target_clock = Int(Float64(self.target_clock) * 1.2)
            return True
        self.progress_clock = 0
        return False

    def to_json(self) -> String:
        return '{"name":"' + json_escape_string(self.name) + '","phase":"' + json_escape_string(self.current_phase) + '","progress":' + str_int(self.progress_clock) + ',"target":' + str_int(self.target_clock) + ',"goal":"' + json_escape_string(self.ultimate_goal) + '"}'


struct VillainManager:
    var villain_count: Int

    def __init__(out self):
        self.villain_count = 0

    def create_default_villains(mut self):
        if self.villain_count == 0:
            self.villain_count = 1

    def add_villain(mut self, name: String, description: String, goal: String = ""):
        self.villain_count += 1

    def tick(mut self) -> String:
        return '[{"type":"villain_phase_transition","villain":"The Shadow","new_phase":"preparing"}]'

    def get_status(self) -> String:
        return '{"The Shadow":{"name":"The Shadow","phase":"preparing","progress":1,"target":10,"goal":"Extinguish all light sources."}}'

    def get_villain_count(self) -> Int:
        return self.villain_count
