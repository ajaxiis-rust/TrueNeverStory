from std.collections import Dict, List
from world_director_models import StoryArc
from utils import atomic_write_json, atomic_read_json


# ── Story Arc Manager ──────────────────────────────────────────────

struct StoryArcManager:
    var storage_path: String
    var arcs: Dict[String, StoryArc]
    var _arc_counter: Int

    def __init__(out self, storage_path: String):
        self.storage_path = storage_path
        self.arcs = Dict[String, StoryArc]()
        self._arc_counter = 0

    def _load(mut self) raises:
        var content = atomic_read_json(self.storage_path)
        if content == "":
            return

    def _save(mut self) raises:
        pass

    def create_arc(mut self, name: String, protagonist: String, arc_type: String, phases_json: String) -> StoryArc:
        self._arc_counter += 1
        var arc_id = "arc_" + String(self._arc_counter)
        var arc = StoryArc(
            id=arc_id,
            name=name,
            protagonist=protagonist,
            arc_type=arc_type,
            phases_json=phases_json,
        )
        var arc_copy = arc.copy()
        self.arcs[arc_id] = arc^
        return arc_copy^

    def advance_phase(mut self, arc_id: String) raises -> Bool:
        if arc_id not in self.arcs:
            return False
        var arc = self.arcs[arc_id]
        arc.current_phase += 1
        self.arcs[arc_id] = arc^
        self._save()
        return True

    def add_event(mut self, arc_id: String, event_description: String, story_time: String) raises:
        if arc_id in self.arcs:
            var arc = self.arcs[arc_id]
            var new_event = '{"description":"' + event_description + '","timestamp":"' + story_time + '"}'
            if arc.timeline_json == "[]":
                arc.timeline_json = "[" + new_event + "]"
            else:
                var trimmed = arc.timeline_json.rstrip("]")
                arc.timeline_json = trimmed + "," + new_event + "]"
            self.arcs[arc_id] = arc^
            self._save()

    def get_arcs_for_character(self, character_uid: String) -> List[StoryArc]:
        var result = List[StoryArc]()
        for entry in self.arcs.items():
            if entry.value.protagonist == character_uid:
                result.append(entry.value.copy())
        return result^

    def arc_count(self) -> Int:
        return len(self.arcs)
