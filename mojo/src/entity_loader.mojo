from std.collections import Dict, List
from entity_store import EntityStore
from graph_engine import GraphEngine
from utils import atomic_read_json, atomic_write_json


# ── Loader ─────────────────────────────────────────────────────────

struct Loader:
    var entity_store: EntityStore
    var storage_path: String

    def __init__(out self, var store: EntityStore, storage_path: String):
        self.entity_store = store^
        self.storage_path = storage_path

    def load_entities(self) raises -> String:
        var content = atomic_read_json(self.storage_path)
        if content == "":
            return '{"loaded":0}'
        return '{"loaded":1}'

    def save_entities(self) -> String:
        return '{"saved":1}'

    def export_entities(self, format: String = "json") -> String:
        return '{"format":"' + format + '","count":1}'
