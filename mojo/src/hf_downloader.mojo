from std.collections import Dict, List
from std import subprocess
from std.pathlib import Path
from http_client import (
    HTTPClient, HTTPResponse, json_extract_string, json_extract_int,
    json_escape_string, _shell_quote, _find_substring, _split_lines,
    _join_lines, _parse_int,
)


# ── HuggingFace Model Info ────────────────────────────────────────

struct HFModelInfo(Movable, Writable):
    var model_id: String
    var model_type: String
    var tags: String
    var siblings_json: String

    def __init__(out self):
        self.model_id = ""
        self.model_type = ""
        self.tags = ""
        self.siblings_json = ""

    def write_to(self, mut writer: Some[Writer]):
        writer.write("HFModelInfo(id=", self.model_id, ", type=", self.model_type, ")")


# ── HuggingFace Downloader ────────────────────────────────────────

struct HuggingFaceDownloader(Movable):
    var models_dir: String
    var token: String
    var http: HTTPClient
    var timeout: Float64
    var max_retries: Int

    def __init__(out self, models_dir: String, token: String, timeout: Float64, max_retries: Int):
        self.models_dir = models_dir
        self.token = token
        self.http = HTTPClient("https://huggingface.co")
        self.timeout = timeout
        self.max_retries = max_retries

    def get_model_info(self, repo: String) raises -> HFModelInfo:
        var path = "/api/models/" + repo
        var response = self.http.get(path)
        if not response.is_success():
            raise Error("Failed to get model info: HTTP " + String(response.status_code))

        var info = HFModelInfo()
        info.model_id = json_extract_string(response.body, "modelId")
        if info.model_id.byte_length() == 0:
            info.model_id = json_extract_string(response.body, "id")
        info.model_type = json_extract_string(response.body, "pipeline_tag")
        info.siblings_json = response.body
        return info^

    def list_gguf_files(self, repo: String) raises -> List[String]:
        var info = self.get_model_info(repo)
        var result = List[String]()
        var marker = '"rfilename":"'
        var search_in = info.siblings_json
        var search_start = 0

        while True:
            var start = _find_substring_from(search_in, marker, search_start)
            if start == -1:
                break
            var value_start = start + marker.byte_length()
            var i = value_start
            while i < search_in.byte_length():
                var ch = String(search_in[byte=i])
                if ch == '"':
                    break
                i += 1
            var filename = String(search_in[byte=value_start:i])
            if filename.endswith(".gguf"):
                result.append(filename^)
            search_start = i + 1

        return result^

    def download(
        mut self, repo: String, filename: String,
    ) raises -> String:
        var url = "https://huggingface.co/" + repo + "/resolve/main/" + filename
        var flat_repo = repo.replace("/", "_")
        var dir_path = self.models_dir + "/" + flat_repo

        _ = subprocess.run("mkdir -p " + _shell_quote(dir_path))

        var out_path = dir_path + "/" + filename
        var tmp_path = out_path + ".part"

        print("Downloading " + filename + " from " + repo + "...")
        print("  URL: " + url)
        print("  Destination: " + out_path)

        var cmd = "curl -L --progress-bar"
        cmd += " --max-time " + String(Int(self.timeout))
        cmd += " -o " + _shell_quote(tmp_path)

        if self.token.byte_length() > 0:
            cmd += " -H 'Authorization: Bearer " + self.token + "'"

        cmd += " " + _shell_quote(url)

        var attempt = 0
        while attempt < self.max_retries:
            attempt += 1
            print("  Attempt " + String(attempt) + "/" + String(self.max_retries) + "...")
            var result = subprocess.run(cmd)
            if result.byte_length() == 0 or not _file_exists(tmp_path):
                print("  Download failed, retrying...")
                continue

            var size_cmd = "stat -c%s " + _shell_quote(tmp_path) + " 2>/dev/null || echo 0"
            var size_str = subprocess.run(size_cmd)
            var file_size = 0
            for i in range(size_str.byte_length()):
                var ch = String(size_str[byte=i])
                if ch >= "0" and ch <= "9":
                    file_size = file_size * 10 + (ord(ch) - 48)
                elif file_size > 0:
                    break

            if file_size > 0:
                _ = subprocess.run("mv " + _shell_quote(tmp_path) + " " + _shell_quote(out_path))
                print("  Downloaded: " + out_path + " (" + _format_size(file_size) + ")")
                return out_path

            print("  Empty file, retrying...")

        _ = subprocess.run("rm -f " + _shell_quote(tmp_path))
        raise Error("Download failed after " + String(self.max_retries) + " attempts")

    def list_local(self) raises -> List[String]:
        var result = List[String]()
        var cmd = "find " + _shell_quote(self.models_dir) + " -name '*.gguf' -type f 2>/dev/null"
        var output = subprocess.run(cmd)
        if output.byte_length() == 0:
            return result^

        var lines = _split_lines(output)
        for i in range(len(lines)):
            if lines[i].byte_length() > 0:
                result.append(lines[i]^)

        return result^

    def get_local_path(self, repo: String, filename: String) -> String:
        var flat_repo = repo.replace("/", "_")
        return self.models_dir + "/" + flat_repo + "/" + filename

    def is_downloaded(self, repo: String, filename: String) -> Bool:
        var path = self.get_local_path(repo, filename)
        return _file_exists(path)

    def verify(self, repo: String, filename: String) -> Bool:
        var path = self.get_local_path(repo, filename)
        if not _file_exists(path):
            return False
        var size_cmd = "stat -c%s " + _shell_quote(path) + " 2>/dev/null || echo 0"
        var size_str = subprocess.run(size_cmd)
        var file_size = 0
        for i in range(size_str.byte_length()):
            var ch = String(size_str[byte=i])
            if ch >= "0" and ch <= "9":
                file_size = file_size * 10 + (ord(ch) - 48)
            elif file_size > 0:
                break
        return file_size > 0

    def delete_model(self, repo: String, filename: String) raises -> Bool:
        var path = self.get_local_path(repo, filename)
        if not _file_exists(path):
            return False
        _ = subprocess.run("rm -f " + _shell_quote(path))
        print("Deleted: " + path)
        return True


# ── Helper functions ──────────────────────────────────────────────

def _file_exists(path: String) -> Bool:
    var cmd = "test -f " + _shell_quote(path) + " && echo yes || echo no"
    var result = subprocess.run(cmd)
    return result.startswith("yes")


def _find_substring_from(haystack: String, needle: String, start: Int) -> Int:
    if needle.byte_length() == 0:
        return start
    if needle.byte_length() > haystack.byte_length():
        return -1
    var i = start
    var limit = haystack.byte_length() - needle.byte_length() + 1
    while i < limit:
        var found = True
        var j = 0
        while j < needle.byte_length():
            if String(haystack[byte=i + j]) != String(needle[byte=j]):
                found = False
                break
            j += 1
        if found:
            return i
        i += 1
    return -1


def _format_size(bytes: Int) -> String:
    if bytes < 1024:
        return String(bytes) + " B"
    elif bytes < 1048576:
        return String(bytes // 1024) + " KB"
    elif bytes < 1073741824:
        return String(bytes // 1048576) + " MB"
    else:
        return String(bytes // 1073741824) + " GB"



