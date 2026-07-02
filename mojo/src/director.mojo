from std.collections import Dict, List
from graph_engine import GraphEngine
from memory import MemoryEntry, VectorMemoryStore
from chronicler import Chronicler, Event, EventBus

# ── Story Event ───────────────────────────────────────────────────

struct StoryEvent(ImplicitlyCopyable, Movable, Writable):
    var id: String
    var title: String
    var description: String
    var category: String
    var severity: String

    def __init__(out self, title: String, description: String, category: String):
        self.id = ""
        self.title = title
        self.description = description
        self.category = category
        self.severity = "minor"

    def write_to(self, mut writer: Some[Writer]):
        writer.write("StoryEvent(title=", self.title, ", category=", self.category, ")")


# ── Story Engine ──────────────────────────────────────────────────

struct StoryEngine(Movable):
    var world_name: String
    var events: List[StoryEvent]
    var event_counter: Int

    def __init__(out self, world_name: String):
        self.world_name = world_name
        self.events = List[StoryEvent]()
        self.event_counter = 0

    def generate_event(mut self, category: String, severity: String) -> StoryEvent:
        var event = StoryEvent(
            title=self._generate_title(category),
            description=self._generate_description(category, severity),
            category=category,
        )
        event.id = String(self.event_counter)
        event.severity = severity
        self.event_counter += 1
        self.events.append(event^)
        return self.events[len(self.events) - 1]

    def _generate_title(self, category: String) -> String:
        if category == "incident":
            return "An Unexpected Incident"
        elif category == "discovery":
            return "A New Discovery"
        elif category == "conflict":
            return "Rising Tensions"
        elif category == "villain_move":
            return "Shadow Moves"
        elif category == "npc_event":
            return "NPC Activity"
        else:
            return "World Event"

    def _generate_description(self, category: String, severity: String) -> String:
        return "A " + severity + " " + category + " event occurred in " + self.world_name + "."

    def write_to(self, mut writer: Some[Writer]):
        writer.write("StoryEngine(world=", self.world_name, ", events=", len(self.events), ")")


# ── World Clock ───────────────────────────────────────────────────

@fieldwise_init
struct WorldClock(Copyable, Movable, Writable):
    var current_time: String
    var time_scale: Float64
    var global_luck: Float64

    def __init__(out self):
        self.current_time = "Day 1, Dawn"
        self.time_scale = 1.0
        self.global_luck = 0.5

    def get_global_luck(self) -> Float64:
        return self.global_luck

    def set_global_luck(mut self, luck: Float64):
        self.global_luck = max(0.0, min(1.0, luck))

    def write_to(self, mut writer: Some[Writer]):
        writer.write("WorldClock(time=", self.current_time, ", luck=", self.global_luck, ")")


# ── Quest ─────────────────────────────────────────────────────────

struct Quest(ImplicitlyCopyable, Movable, Writable):
    var id: String
    var title: String
    var description: String
    var status: String

    def __init__(out self, title: String, description: String):
        self.id = ""
        self.title = title
        self.description = description
        self.status = "active"

    def write_to(self, mut writer: Some[Writer]):
        writer.write("Quest(title=", self.title, ", status=", self.status, ")")


# ── Quest Manager ─────────────────────────────────────────────────

struct QuestManager(Movable):
    var quests: List[Quest]
    var quest_counter: Int

    def __init__(out self):
        self.quests = List[Quest]()
        self.quest_counter = 0

    def add_quest(mut self, title: String, description: String) -> Quest:
        var quest = Quest(title, description)
        quest.id = String(self.quest_counter)
        self.quest_counter += 1
        self.quests.append(quest^)
        return self.quests[len(self.quests) - 1]

    def get_active_quests(self) -> List[Quest]:
        var results = List[Quest]()
        for quest in self.quests:
            if quest.status == "active":
                results.append(quest)
        return results^

    def write_to(self, mut writer: Some[Writer]):
        writer.write("QuestManager(quests=", len(self.quests), ")")


# ── Director Config ───────────────────────────────────────────────

@fieldwise_init
struct DirectorConfig(Copyable, Movable, Writable):
    var tick_interval_minutes: Int
    var chance_event_probability: Float64
    var major_beat_cooldown_hours: Int
    var max_concurrent_beats: Int

    def __init__(out self):
        self.tick_interval_minutes = 30
        self.chance_event_probability = 0.3
        self.major_beat_cooldown_hours = 6
        self.max_concurrent_beats = 5


# ── Director ──────────────────────────────────────────────────────

struct Director(Movable):
    var world_name: String
    var config: DirectorConfig
    var story_engine: StoryEngine
    var chronicler: Chronicler
    var clock: WorldClock
    var quest_mgr: QuestManager
    var event_bus: EventBus
    var is_running: Bool

    def __init__(out self, world_name: String):
        self.world_name = world_name
        self.config = DirectorConfig()
        self.story_engine = StoryEngine(world_name)
        self.chronicler = Chronicler("chronicle.jsonl")
        self.clock = WorldClock()
        self.quest_mgr = QuestManager()
        self.event_bus = EventBus()
        self.is_running = False

    def tick(mut self) raises -> StoryEvent:
        var category = self._select_category()
        var severity = self._select_severity()
        var event = self.story_engine.generate_event(category, severity)
        _ = self.chronicler.log_event(
            event.title + ": " + event.description,
            self.clock.current_time,
            "narrative",
        )
        return event^

    def _select_category(self) -> String:
        var byte_len = self.clock.current_time.byte_length()
        var rand_val = Float64(byte_len % 100) / 100.0
        if rand_val < 0.3:
            return "incident"
        elif rand_val < 0.5:
            return "discovery"
        elif rand_val < 0.7:
            return "conflict"
        elif rand_val < 0.9:
            return "npc_event"
        else:
            return "villain_move"

    def _select_severity(self) -> String:
        var byte_len = self.clock.current_time.byte_length()
        var rand_val = Float64(byte_len % 100) / 100.0
        if rand_val < 0.5:
            return "minor"
        elif rand_val < 0.8:
            return "moderate"
        else:
            return "major"

    def start(mut self):
        self.is_running = True

    def stop(mut self):
        self.is_running = False

    def get_status(self) -> String:
        return "Running" if self.is_running else "Stopped"

    def write_to(self, mut writer: Some[Writer]):
        writer.write("Director(world=", self.world_name, ", status=", self.get_status(), ")")
