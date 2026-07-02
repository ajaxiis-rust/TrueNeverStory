from std.collections import Dict, List

# ── Chronicler ────────────────────────────────────────────────────

struct Chronicler(Movable):
    var log_path: String
    var max_log_size: Int
    var entries: List[String]

    def __init__(out self, log_path: String):
        self.log_path = log_path
        self.max_log_size = 10 * 1024 * 1024
        self.entries = List[String]()

    def log_event(
        mut self,
        description: String,
        story_time: String,
        group: String,
    ) -> String:
        var event_id = String(len(self.entries))
        var entry = '{"id":"' + event_id + '","timestamp":"' + story_time + '","group":"' + group + '","description":"' + description + '"}'
        self.entries.append(entry^)
        return event_id

    def get_recent(self, group: String, limit: Int) -> List[String]:
        var results = List[String]()
        var count = 0
        var i = len(self.entries) - 1
        while i >= 0 and count < limit:
            var entry = self.entries[i]
            if group == "" or group == "*" or self._matches_group(entry, group):
                results.append(entry)
                count += 1
            i -= 1
        return results^

    def _matches_group(self, entry: String, group: String) -> Bool:
        var group_pattern = '"group":"' + group + '"'
        return group_pattern in entry

    def entry_count(self) -> Int:
        return len(self.entries)

    def write_to(self, mut writer: Some[Writer]):
        writer.write("Chronicler(path=", self.log_path, ", entries=", len(self.entries), ")")


# ── Event ─────────────────────────────────────────────────────────

struct Event(Movable, Writable):
    var topic: String
    var payload: String

    def __init__(out self, topic: String, payload: String):
        self.topic = topic
        self.payload = payload

    def write_to(self, mut writer: Some[Writer]):
        writer.write("Event(topic=", self.topic, ")")


# ── Event Bus ─────────────────────────────────────────────────────

struct EventBus(Movable):
    var subscribers: Dict[String, List[String]]

    def __init__(out self):
        self.subscribers = Dict[String, List[String]]()

    def subscribe(mut self, topic: String, callback_id: String) raises:
        if topic not in self.subscribers:
            self.subscribers[topic] = List[String]()
        self.subscribers[topic].append(callback_id)

    def publish(mut self, event: Event):
        if event.topic in self.subscribers:
            pass

    def clear(mut self):
        self.subscribers.clear()
