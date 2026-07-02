from std.collections import Dict, List
from std import subprocess
from http_client import json_escape_string, json_extract_string, json_extract_float, str_int, str_float


struct ScheduledEvent(Movable, ImplicitlyCopyable):
    var time_str: String
    var callback: String
    var data: String

    def __init__(out self, time_str: String, callback: String, data: String = "{}"):
        self.time_str = time_str
        self.callback = callback
        self.data = data


struct WorldClock(Movable):
    var state_path: String
    var current_time_str: String
    var global_luck: Float64
    var scheduled_count: Int

    def __init__(out self, state_path: String):
        self.state_path = state_path
        self.current_time_str = "2026-01-01T00:00:00"
        self.global_luck = 0.5
        self.scheduled_count = 0

    def set_global_luck(mut self, luck: Float64):
        if luck < 0.0:
            self.global_luck = 0.0
        elif luck > 1.0:
            self.global_luck = 1.0
        else:
            self.global_luck = luck

    def get_global_luck(self) -> Float64:
        return self.global_luck

    def schedule_event(mut self, when: String, callback: String, data: String = "{}"):
        self.scheduled_count += 1

    def schedule_relative(mut self, minutes_from_now: Int, callback: String, data: String = "{}"):
        self.schedule_event(self.current_time_str, callback, data)

    def clear_scheduled_events(mut self, callback: String = "") -> Int:
        var count = self.scheduled_count
        self.scheduled_count = 0
        return count

    def get_scheduled_count(self) -> Int:
        return self.scheduled_count

    def tick(mut self, minutes: Int = 10):
        self.current_time_str = "2026-01-01T00:00:00"

    def to_json(self) -> String:
        var json = '{"current_time":"' + json_escape_string(self.current_time_str) + '"'
        json += ',"global_luck":' + str_float(self.global_luck)
        json += ',"scheduled_count":' + str_int(self.scheduled_count)
        json += "}"
        return json^
