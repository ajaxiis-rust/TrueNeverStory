from std.collections import Dict, List


# ── Task Priority ──────────────────────────────────────────────────

@fieldwise_init
struct TaskPriority(Copyable, Movable, ImplicitlyCopyable, Writable):
    var value: Int

    def __str__(self) -> String:
        if self.value == 0:
            return "CRITICAL"
        elif self.value == 1:
            return "HIGH"
        elif self.value == 2:
            return "NORMAL"
        else:
            return "LOW"

    @staticmethod
    def critical() -> TaskPriority:
        return TaskPriority(0)

    @staticmethod
    def high() -> TaskPriority:
        return TaskPriority(1)

    @staticmethod
    def normal() -> TaskPriority:
        return TaskPriority(2)

    @staticmethod
    def low() -> TaskPriority:
        return TaskPriority(3)

    def write_to(self, mut writer: Some[Writer]):
        writer.write("TaskPriority(", self.__str__(), ")")


# ── Director Task ──────────────────────────────────────────────────

struct DirectorTask(Movable, Writable):
    var id: String
    var task_type: String
    var priority: TaskPriority
    var data_json: String
    var created_at: String
    var scheduled_time: String

    def __init__(out self, id: String, task_type: String, priority: TaskPriority, data_json: String):
        self.id = id
        self.task_type = task_type
        self.priority = priority
        self.data_json = data_json
        self.created_at = ""
        self.scheduled_time = ""

    def to_json(self) -> String:
        var json = '{"id":"' + self.id + '","type":"' + self.task_type + '"'
        json += ',"priority":' + String(self.priority.value)
        json += ',"data":' + self.data_json
        json += ',"created_at":"' + self.created_at + '"'
        if self.scheduled_time != "":
            json += ',"scheduled_time":"' + self.scheduled_time + '"'
        json += "}"
        return json^

    def write_to(self, mut writer: Some[Writer]):
        writer.write("DirectorTask(id=", self.id, ", type=", self.task_type, ")")


# ── Story Arc ──────────────────────────────────────────────────────

struct StoryArc(Movable, ImplicitlyCopyable, Writable):
    var id: String
    var name: String
    var protagonist: String
    var arc_type: String
    var current_phase: Int
    var phases_json: String
    var timeline_json: String

    def __init__(out self, id: String, name: String, protagonist: String, arc_type: String, phases_json: String):
        self.id = id
        self.name = name
        self.protagonist = protagonist
        self.arc_type = arc_type
        self.current_phase = 0
        self.phases_json = phases_json
        self.timeline_json = "[]"

    def to_json(self) -> String:
        var json = '{"id":"' + self.id + '","name":"' + self.name + '"'
        json += ',"protagonist":"' + self.protagonist + '"'
        json += ',"arc_type":"' + self.arc_type + '"'
        json += ',"current_phase":' + String(self.current_phase)
        json += ',"phases":' + self.phases_json
        json += ',"timeline":' + self.timeline_json
        json += "}"
        return json^

    def write_to(self, mut writer: Some[Writer]):
        writer.write("StoryArc(name=", self.name, ", protagonist=", self.protagonist, ")")
