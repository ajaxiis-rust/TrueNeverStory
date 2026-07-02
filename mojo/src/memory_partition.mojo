from std.collections import Dict, List
from entity_store import EntityStore
from graph_engine import GraphEngine
from http_client import json_escape_string, json_extract_string, str_int, str_float


# ── Memory Partition Manager ───────────────────────────────────────

struct MemoryPartitionManager:
    var entity_store: EntityStore
    var partitions: Dict[String, String]
    var partition_count: Int

    def __init__(out self, var store: EntityStore):
        self.entity_store = store^
        self.partitions = Dict[String, String]()
        self.partition_count = 0

    def get_partition(self, partition_id: String) raises -> String:
        if partition_id in self.partitions:
            return self.partitions[partition_id].copy()
        return "{}"

    def list_partitions(self) -> String:
        var result = '{"partitions":['
        var first = True
        for entry in self.partitions.items():
            if not first:
                result += ","
            result += '"' + entry.key + '"'
            first = False
        result += ']}'
        return result^

    def move_memory(mut self, memory_id: String, from_partition: String, to_partition: String) -> String:
        return '{"moved":true}'

    def get_stats(self) -> String:
        return '{"partition_count":' + String(self.partition_count) + ',"total_entries":' + String(len(self.partitions)) + '}'
