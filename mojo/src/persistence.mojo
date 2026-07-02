from std.collections import Dict, List
from std import subprocess
from models import EntityNode, Relationship, WorldFrame
from entity_store import EntityStore
from memory import MemoryEntry
from http_client import (
    json_escape_string,
    json_unescape_string,
    json_extract_string,
    json_extract_int,
    json_extract_float,
    json_extract_array_strings,
    _find_substring,
    str_int,
)

# ── Save Manager ──────────────────────────────────────────────────

struct SaveManager:
    var save_dir: String

    def __init__(out self, save_dir: String):
        self.save_dir = save_dir

    def save_entities(self, store: EntityStore) raises -> String:
        var nodes = store.all_nodes()
        var json = '{"entities":['
        for i in range(len(nodes)):
            if i > 0:
                json += ","
            json += '{"uid":"' + json_escape_string(nodes[i].uid)
            json += '","name":"' + json_escape_string(nodes[i].name)
            json += '","type":"' + json_escape_string(nodes[i].entity_type)
            json += '","group":"' + json_escape_string(nodes[i].group_id)
            json += '","created_at":' + String(nodes[i].created_at)
            json += ',"updated_at":' + String(nodes[i].updated_at) + "}"
        json += '],"count":' + str_int(len(nodes)) + "}"
        return json^

    def load_entities(self, json: String) raises -> List[EntityNode]:
        var result = List[EntityNode]()
        var count = json_extract_int(json, "count")
        var search_from = 0
        for _ in range(count):
            var uid_marker = '"uid":"'
            var uid_start = _find_substring(String(json[byte=search_from:]), uid_marker)
            if uid_start == -1:
                break
            uid_start += search_from
            var obj_start = _find_substring(String(json[byte=uid_start:]), "{")
            if obj_start == -1:
                break
            obj_start += uid_start
            var obj_end = _find_substring(String(json[byte=obj_start:]), "}")
            if obj_end == -1:
                break
            obj_end += obj_start
            var obj_str = String(json[byte=obj_start:obj_end + 1])
            var uid = json_extract_string(obj_str, "uid")
            var name = json_extract_string(obj_str, "name")
            var etype = json_extract_string(obj_str, "type")
            var group = json_extract_string(obj_str, "group")
            var node = EntityNode(uid, name, etype)
            node.group_id = group
            node.created_at = json_extract_float(obj_str, "created_at")
            node.updated_at = json_extract_float(obj_str, "updated_at")
            result.append(node^)
            search_from = obj_end + 1
        return result^

    def save_world_frame(self, frame: WorldFrame) -> String:
        var json = '{"world_name":"' + json_escape_string(frame.world_name) + '"'
        json += ',"world_rules":['
        for i in range(len(frame.world_rules)):
            if i > 0:
                json += ","
            json += '"' + json_escape_string(frame.world_rules[i]) + '"'
        json += '],"characters":['
        for i in range(len(frame.characters)):
            if i > 0:
                json += ","
            json += '"' + json_escape_string(frame.characters[i]) + '"'
        json += '],"locations":['
        for i in range(len(frame.locations)):
            if i > 0:
                json += ","
            json += '"' + json_escape_string(frame.locations[i]) + '"'
        json += "]}"
        return json^

    def load_world_frame(self, json: String) -> WorldFrame:
        var frame = WorldFrame()
        frame.world_name = json_extract_string(json, "world_name")
        frame.world_rules = json_extract_array_strings(json, "world_rules")
        frame.characters = json_extract_array_strings(json, "characters")
        frame.locations = json_extract_array_strings(json, "locations")
        return frame^

    def save_to_file(self, filename: String, content: String) raises -> String:
        var cmd = "cat << 'BRING_EOF' > " + filename + "\n" + content + "\nBRING_EOF"
        subprocess.run(cmd)
        return "Saved to " + filename

    def load_from_file(self, filename: String) raises -> String:
        var cmd = "cat " + filename
        return subprocess.run(cmd)
