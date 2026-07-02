from std.collections import Dict, List
from std import subprocess

# ── HTTP Response ─────────────────────────────────────────────────

struct HTTPResponse(Movable, Writable):
    var status_code: Int
    var body: String

    def __init__(out self):
        self.status_code = 0
        self.body = ""

    def __init__(out self, status_code: Int, body: String):
        self.status_code = status_code
        self.body = body

    def is_success(self) -> Bool:
        return self.status_code >= 200 and self.status_code < 300

    def write_to(self, mut writer: Some[Writer]):
        writer.write("HTTPResponse(status=", self.status_code, ", bytes=", self.body.byte_length(), ")")


# ── HTTP Client ───────────────────────────────────────────────────

struct HTTPClient(Movable):
    var base_url: String

    def __init__(out self, base_url: String):
        self.base_url = base_url

    def get(self, path: String) raises -> HTTPResponse:
        var url = self.base_url + path
        var cmd = "curl -s -w '\\n%{http_code}' --max-time 120"
        cmd += " -X GET '" + url + "'"
        var result = subprocess.run(cmd)
        var lines = _split_lines(result)
        if len(lines) < 2:
            return HTTPResponse(0, result)
        var status_code = _parse_int(lines[len(lines) - 1])
        var body_str = _join_lines(lines, len(lines) - 1)
        return HTTPResponse(status_code, body_str)

    def post_json_with_auth(
        self, path: String, body: String, api_key: String,
    ) raises -> HTTPResponse:
        var url = self.base_url + path
        var cmd = "curl -s -w '\\n%{http_code}' --max-time 120"
        cmd += " -X POST"
        cmd += " -H 'Content-Type: application/json'"
        cmd += " -H 'Authorization: Bearer " + api_key + "'"
        cmd += " -d " + _shell_quote(body)
        cmd += " '" + url + "'"
        var result = subprocess.run(cmd)
        var lines = _split_lines(result)
        if len(lines) < 2:
            return HTTPResponse(0, result)
        var status_code = _parse_int(lines[len(lines) - 1])
        var body_str = _join_lines(lines, len(lines) - 1)
        return HTTPResponse(status_code, body_str)


# ── Utility functions ─────────────────────────────────────────────

def _shell_quote(s: String) -> String:
    var result = String("'")
    for i in range(s.byte_length()):
        var ch = String(s[byte=i])
        if ch == "'":
            result += "'\\''"
        else:
            result += ch
    result += "'"
    return result^


def _split_lines(s: String) -> List[String]:
    var lines = List[String]()
    var current = String("")
    for i in range(s.byte_length()):
        var ch = String(s[byte=i])
        if ch == "\n":
            lines.append(current^)
            current = String("")
        else:
            current += ch
    if current.byte_length() > 0:
        lines.append(current^)
    return lines^


def _join_lines(lines: List[String], count: Int) -> String:
    var result = String("")
    for i in range(count):
        if i > 0:
            result += "\n"
        result += lines[i]
    return result^


def _parse_int(s: String) raises -> Int:
    var result = 0
    for i in range(s.byte_length()):
        var d = _char_to_digit(String(s[byte=i]))
        if d >= 0:
            result = result * 10 + d
    return result


def _char_to_digit(ch: String) -> Int:
    if ch == "0":
        return 0
    elif ch == "1":
        return 1
    elif ch == "2":
        return 2
    elif ch == "3":
        return 3
    elif ch == "4":
        return 4
    elif ch == "5":
        return 5
    elif ch == "6":
        return 6
    elif ch == "7":
        return 7
    elif ch == "8":
        return 8
    elif ch == "9":
        return 9
    return -1


def _char_to_ord(ch: String) -> Int:
    if ch == "0":
        return 48
    elif ch == "1":
        return 49
    elif ch == "2":
        return 50
    elif ch == "3":
        return 51
    elif ch == "4":
        return 52
    elif ch == "5":
        return 53
    elif ch == "6":
        return 54
    elif ch == "7":
        return 55
    elif ch == "8":
        return 56
    elif ch == "9":
        return 57
    elif ch == "a":
        return 97
    elif ch == "b":
        return 98
    elif ch == "c":
        return 99
    elif ch == "d":
        return 100
    elif ch == "e":
        return 101
    elif ch == "f":
        return 102
    elif ch == "g":
        return 103
    elif ch == "h":
        return 104
    elif ch == "i":
        return 105
    elif ch == "j":
        return 106
    elif ch == "k":
        return 107
    elif ch == "l":
        return 108
    elif ch == "m":
        return 109
    elif ch == "n":
        return 110
    elif ch == "o":
        return 111
    elif ch == "p":
        return 112
    elif ch == "q":
        return 113
    elif ch == "r":
        return 114
    elif ch == "s":
        return 115
    elif ch == "t":
        return 116
    elif ch == "u":
        return 117
    elif ch == "v":
        return 118
    elif ch == "w":
        return 119
    elif ch == "x":
        return 120
    elif ch == "y":
        return 121
    elif ch == "z":
        return 122
    elif ch == "A":
        return 65
    elif ch == "B":
        return 66
    elif ch == "C":
        return 67
    elif ch == "D":
        return 68
    elif ch == "E":
        return 69
    elif ch == "F":
        return 70
    elif ch == "G":
        return 71
    elif ch == "H":
        return 72
    elif ch == "I":
        return 73
    elif ch == "J":
        return 74
    elif ch == "K":
        return 75
    elif ch == "L":
        return 76
    elif ch == "M":
        return 77
    elif ch == "N":
        return 78
    elif ch == "O":
        return 79
    elif ch == "P":
        return 80
    elif ch == "Q":
        return 81
    elif ch == "R":
        return 82
    elif ch == "S":
        return 83
    elif ch == "T":
        return 84
    elif ch == "U":
        return 85
    elif ch == "V":
        return 86
    elif ch == "W":
        return 87
    elif ch == "X":
        return 88
    elif ch == "Y":
        return 89
    elif ch == "Z":
        return 90
    return 0


# ── OpenAI-Compatible HTTP Client ─────────────────────────────────

struct OpenAIHTTPClient(Movable):
    var http: HTTPClient
    var api_key: String
    var embedding_api_key: String
    var embedding_base_url: String

    def __init__(
        out self,
        base_url: String,
        api_key: String,
        embedding_base_url: String,
        embedding_api_key: String,
    ):
        self.http = HTTPClient(base_url)
        self.api_key = api_key
        self.embedding_api_key = embedding_api_key
        self.embedding_base_url = embedding_base_url

    def chat_completion(
        mut self,
        model: String,
        var messages: List[Dict[String, String]],
        temperature: Float64,
        max_tokens: Int,
        json_mode: Bool,
    ) raises -> String:
        var body = "{"
        body += '"model":"' + model + '"'
        body += ',"messages":['
        for i in range(len(messages)):
            if i > 0:
                body += ","
            body += '{"role":"' + messages[i]["role"] + '","content":"' + _escape_json(messages[i]["content"]) + '"}'
        body += "]"
        body += ',"temperature":' + _float_to_string(temperature)
        body += ',"max_tokens":' + String(max_tokens)
        if json_mode:
            body += ',"response_format":{"type":"json_object"}'
        body += "}"

        var response = self.http.post_json_with_auth("/chat/completions", body, self.api_key)
        if not response.is_success():
            var err_msg = "Chat completion failed: HTTP " + String(response.status_code)
            if response.body.byte_length() > 0:
                var limit = min(200, response.body.byte_length())
                err_msg += " - " + String(response.body[byte=0:limit])
            raise Error(err_msg)

        return _extract_choice_content(response.body)

    def embedding(
        mut self, model: String, text: String,
    ) raises -> List[Float64]:
        var body = "{"
        body += '"model":"' + model + '"'
        body += ',"input":"' + _escape_json(text) + '"'
        body += "}"

        var api_key = self.api_key
        var saved_base = self.http.base_url
        if self.embedding_base_url.byte_length() > 0:
            api_key = self.embedding_api_key
            self.http.base_url = self.embedding_base_url

        var response = self.http.post_json_with_auth("/embeddings", body, api_key)

        if self.embedding_base_url.byte_length() > 0:
            self.http.base_url = saved_base

        if not response.is_success():
            raise Error("Embedding failed: HTTP " + String(response.status_code))

        return _extract_embedding(response.body)


# ── JSON/string utility functions ─────────────────────────────────

def _escape_json(s: String) -> String:
    var result = String("")
    for i in range(s.byte_length()):
        var ch = String(s[byte=i])
        if ch == '"':
            result += '\\"'
        elif ch == "\\":
            result += "\\\\"
        elif ch == "\n":
            result += "\\n"
        elif ch == "\r":
            result += "\\r"
        elif ch == "\t":
            result += "\\t"
        else:
            result += ch
    return result^


def _float_to_string(val: Float64) -> String:
    var s = String(val)
    var has_dot = False
    for i in range(s.byte_length()):
        if String(s[byte=i]) == ".":
            has_dot = True
            break
    if not has_dot:
        s += ".0"
    return s^


def _extract_choice_content(json_response: String) -> String:
    var content_marker = '"content":'
    var start = _find_substring(json_response, content_marker)
    if start == -1:
        return json_response

    var content_start = start + content_marker.byte_length()
    while content_start < json_response.byte_length():
        if not (String(json_response[byte=content_start]) == " "):
            break
        content_start += 1

    if content_start >= json_response.byte_length():
        return ""

    if not (String(json_response[byte=content_start]) == '"'):
        return ""

    var i = content_start + 1
    var result = String("")
    while i < json_response.byte_length():
        var ch = String(json_response[byte=i])
        if ch == "\\" and i + 1 < json_response.byte_length():
            var next_ch = String(json_response[byte=i + 1])
            if next_ch == '"':
                result += '"'
                i += 2
                continue
            elif next_ch == "n":
                result += "\n"
                i += 2
                continue
            elif next_ch == "\\":
                result += "\\"
                i += 2
                continue
            elif next_ch == "t":
                result += "\t"
                i += 2
                continue
            else:
                result += ch
                i += 1
                continue
        elif ch == '"':
            break
        else:
            result += ch
        i += 1
    return result^


def _extract_embedding(json_response: String) raises -> List[Float64]:
    var result = List[Float64]()
    var marker = '"embedding":['
    var start = _find_substring(json_response, marker)
    if start == -1:
        return result^

    var arr_start = start + marker.byte_length()
    var i = arr_start
    var current_num = String("")
    var in_number = False

    while i < json_response.byte_length():
        var ch = String(json_response[byte=i])
        var is_digit = (ch >= "0" and ch <= "9")
        var is_special = (ch == "-" or ch == "." or ch == "e" or ch == "E")
        if is_digit or is_special:
            current_num += ch
            in_number = True
        elif in_number:
            result.append(_parse_float(current_num))
            current_num = String("")
            in_number = False
            if ch == "]":
                break
        elif ch == "]":
            break
        i += 1
    return result^


def _find_substring(haystack: String, needle: String) -> Int:
    if needle.byte_length() == 0:
        return 0
    if needle.byte_length() > haystack.byte_length():
        return -1
    var i = 0
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


def _parse_float(s: String) -> Float64:
    if s.byte_length() == 0:
        return 0.0
    var result: Float64 = 0.0
    var sign: Float64 = 1.0
    var i = 0
    var decimal_pos = -1

    if String(s[byte=0]) == "-":
        sign = -1.0
        i = 1

    while i < s.byte_length():
        if String(s[byte=i]) == ".":
            decimal_pos = i
            break
        i += 1

    var int_end = s.byte_length()
    if decimal_pos >= 0:
        int_end = decimal_pos

    var idx = 0
    if sign < 0:
        idx = 1

    while idx < int_end:
        var d = _char_to_digit(String(s[byte=idx]))
        if d >= 0:
            result = result * 10.0 + Float64(d)
        idx += 1

    if decimal_pos >= 0:
        var frac: Float64 = 0.0
        var frac_divisor: Float64 = 10.0
        idx = decimal_pos + 1
        while idx < s.byte_length():
            var d = _char_to_digit(String(s[byte=idx]))
            if d >= 0:
                frac += Float64(d) / frac_divisor
                frac_divisor *= 10.0
            idx += 1
        result += frac

    return result * sign


def json_escape_string(s: String) -> String:
    return _escape_json(s)


def json_unescape_string(s: String) -> String:
    var result = String("")
    var i = 0
    while i < s.byte_length():
        var ch = String(s[byte=i])
        if ch == "\\" and i + 1 < s.byte_length():
            var next_ch = String(s[byte=i + 1])
            if next_ch == '"':
                result += '"'
                i += 2
                continue
            elif next_ch == "n":
                result += "\n"
                i += 2
                continue
            elif next_ch == "r":
                result += "\r"
                i += 2
                continue
            elif next_ch == "t":
                result += "\t"
                i += 2
                continue
            elif next_ch == "\\":
                result += "\\"
                i += 2
                continue
        result += ch
        i += 1
    return result^


def json_extract_string(json_str: String, key: String) -> String:
    var marker = '"' + key + '":"'
    var start = _find_substring(json_str, marker)
    if start == -1:
        return ""
    var value_start = start + marker.byte_length()
    var i = value_start
    while i < json_str.byte_length():
        var ch = String(json_str[byte=i])
        if ch == "\\":
            i += 2
            continue
        if ch == '"':
            break
        i += 1
    return json_unescape_string(String(json_str[byte=value_start:i]))


def json_extract_int(json_str: String, key: String) raises -> Int:
    var marker = '"' + key + '":'
    var start = _find_substring(json_str, marker)
    if start == -1:
        return 0
    var value_start = start + marker.byte_length()
    var result = 0
    var i = value_start
    while i < json_str.byte_length():
        var d = _char_to_digit(String(json_str[byte=i]))
        if d >= 0:
            result = result * 10 + d
        elif not (String(json_str[byte=i]) == "-"):
            break
        i += 1
    return result


def json_extract_float(json_str: String, key: String) -> Float64:
    var marker = '"' + key + '":'
    var start = _find_substring(json_str, marker)
    if start == -1:
        return 0.0
    var value_start = start + marker.byte_length()
    var num_str = String("")
    var i = value_start
    while i < json_str.byte_length():
        var ch = String(json_str[byte=i])
        var is_digit = (ch >= "0" and ch <= "9")
        var is_special = (ch == "." or ch == "-")
        if is_digit or is_special:
            num_str += ch
        else:
            break
        i += 1
    return _parse_float(num_str)


def json_extract_array_strings(json_str: String, key: String) -> List[String]:
    var result = List[String]()
    var marker = '"' + key + '":['
    var start = _find_substring(json_str, marker)
    if start == -1:
        return result^
    var arr_start = start + marker.byte_length()
    var i = arr_start
    while i < json_str.byte_length():
        var ch = String(json_str[byte=i])
        if ch == "]":
            break
        if ch == '"':
            var str_start = i + 1
            i += 1
            while i < json_str.byte_length():
                var inner = String(json_str[byte=i])
                if inner == '"':
                    break
                if inner == "\\":
                    i += 1
                i += 1
            result.append(json_unescape_string(String(json_str[byte=str_start:i])))
        i += 1
    return result^


def str_int(val: Int) -> String:
    return String(val)


def str_float(val: Float64) -> String:
    return String(val)


def str_bool(val: Bool) -> String:
    if val:
        return "True"
    return "False"
