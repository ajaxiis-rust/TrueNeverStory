from std import subprocess
from http_client import json_escape_string, json_extract_string, json_extract_int, _find_substring, str_int


def atomic_write_json(path: String, content: String) raises -> String:
    var cmd = "mkdir -p $(dirname " + path + ") && cat << 'BRING_EOF' > " + path + "\n" + content + "\nBRING_EOF"
    _ = subprocess.run(cmd)
    return path


def atomic_read_json(path: String) raises -> String:
    var cmd = "cat " + path + " 2>/dev/null"
    return subprocess.run(cmd)


def deterministic_hash(text: String, length: Int = 384) raises -> List[Float64]:
    var embedding = List[Float64]()
    var hash_val: Int = 0
    for i in range(text.byte_length()):
        hash_val = (hash_val * 31 + ord(text[byte=i])) & 0xFFFFFFFF
    var base = Float64((hash_val % 256 - 128)) / 128.0
    for i in range(length):
        embedding.append(base + Float64(i % 7) * 0.01 - 0.03)
    return embedding^


def truncate(text: String, max_len: Int = 200) -> String:
    if text.byte_length() <= max_len:
        return text
    return String(text[byte=0:max_len - 3]) + "..."


def merge_dicts(base: String, overlay: String) -> String:
    if overlay.byte_length() == 0:
        return base
    return overlay


def safe_names(items: List[String], separator: String = ", ") -> String:
    var result = String("")
    for i in range(len(items)):
        if i > 0:
            result += separator
        result += items[i]
    return result^
