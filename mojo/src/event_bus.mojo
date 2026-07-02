from std.collections import Dict, List


def _event_topic_id(topic: String) -> Int:
    if topic == "entity.added":
        return 1
    elif topic == "entity.updated":
        return 2
    elif topic == "entity.removed":
        return 3
    elif topic == "entity.layer_completed":
        return 4
    elif topic == "relationship.added":
        return 10
    elif topic == "relationship.repaired":
        return 11
    elif topic == "relationship.broken":
        return 12
    elif topic == "world.created":
        return 20
    elif topic == "world.frame_loaded":
        return 21
    elif topic == "world.evolved":
        return 22
    elif topic == "narrative.event":
        return 30
    elif topic == "narrative.beat":
        return 31
    elif topic == "narrative.villain_progress":
        return 32
    elif topic == "narrative.quest_added":
        return 33
    elif topic == "narrative.quest_updated":
        return 34
    elif topic == "memory.added":
        return 40
    elif topic == "memory.consolidated":
        return 41
    elif topic == "memory.forgotten":
        return 42
    elif topic == "system.maintenance_start":
        return 50
    elif topic == "system.maintenance_done":
        return 51
    elif topic == "system.graph_changed":
        return 52
    elif topic == "system.error":
        return 53
    return 0


struct Event(Movable, ImplicitlyCopyable):
    var id: String
    var topic: String
    var payload: String
    var timestamp: String
    var source: String

    def __init__(out self, topic: String, payload: String = "", source: String = ""):
        self.id = ""
        self.topic = topic
        self.payload = payload
        self.timestamp = ""
        self.source = source

    def write_to(self, mut writer: Some[Writer]):
        writer.write("Event(topic=", self.topic, ", source=", self.source, ")")


struct EventHandler(Movable, ImplicitlyCopyable):
    var name: String
    var priority: Int

    def __init__(out self, name: String = "", priority: Int = 0):
        self.name = name
        self.priority = priority


struct EventBus(Movable):
    var _replay_buffer: List[Event]
    var _replay_buffer_size: Int

    def __init__(out self):
        self._replay_buffer = List[Event]()
        self._replay_buffer_size = 100

    def publish(mut self, event: Event):
        self._replay_buffer.append(event)
        if len(self._replay_buffer) > self._replay_buffer_size:
            _ = self._replay_buffer.pop(0)

    def publish_simple(mut self, topic: String, payload: String = "", source: String = ""):
        self.publish(Event(topic, payload, source))

    def get_replay(self, topic: String = "", limit: Int = 50) -> List[Event]:
        var events = List[Event]()
        var count = 0
        for i in range(len(self._replay_buffer) - 1, -1, -1):
            if count >= limit:
                break
            if topic == "" or self._replay_buffer[i].topic == topic:
                events.append(self._replay_buffer[i])
                count += 1
        return events^


def get_event_bus() -> EventBus:
    return EventBus()
