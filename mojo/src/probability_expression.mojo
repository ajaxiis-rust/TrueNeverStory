from std.math import (
    sqrt, pow, log, exp, floor, ceil,
    pi, e, min, max, abs,
)


# Custom trig functions to avoid libm dependency
def _sin(x: Float64) -> Float64:
    var result = x
    var term = x
    var x2 = x * x
    for i in range(1, 10):
        term *= -x2 / Float64((2 * i) * (2 * i + 1))
        result += term
    return result


def _cos(x: Float64) -> Float64:
    var result = 1.0
    var term = 1.0
    var x2 = x * x
    for i in range(1, 10):
        term *= -x2 / Float64((2 * i - 1) * (2 * i))
        result += term
    return result


def _tan(x: Float64) -> Float64:
    var c = _cos(x)
    if abs(c) < 1e-10:
        return 0.0
    return _sin(x) / c
from std.collections import Dict


def safe_eval(expr: String, context: Dict[String, Float64]) raises -> Float64:
    if expr == "" or not expr.strip():
        return 0.0

    var lower = expr.lower().strip()
    if lower == "true":
        return 1.0
    if lower == "false":
        return 0.0

    var resolved = String(expr)
    for entry in context.items():
        resolved = resolved.replace(entry.key, String(entry.value))

    var state = ParserState(_tokenize(resolved))
    return state.parse_add_sub()


struct ParserState:
    var tokens: List[String]
    var pos: Int

    def __init__(out self, var tokens: List[String]):
        self.tokens = tokens.copy()
        self.pos = 0

    def parse_add_sub(mut self) raises -> Float64:
        var left = self.parse_mul_div()
        while self.pos < len(self.tokens):
            var op = self.tokens[self.pos]
            if op == "+":
                self.pos += 1
                left += self.parse_mul_div()
            elif op == "-":
                self.pos += 1
                left -= self.parse_mul_div()
            else:
                break
        return left

    def parse_mul_div(mut self) raises -> Float64:
        var left = self.parse_power()
        while self.pos < len(self.tokens):
            var op = self.tokens[self.pos]
            if op == "*":
                if self.pos + 1 < len(self.tokens) and self.tokens[self.pos + 1] == "**":
                    self.pos += 2
                    left = pow(left, self.parse_power())
                else:
                    self.pos += 1
                    left *= self.parse_power()
            elif op == "/":
                self.pos += 1
                var right = self.parse_power()
                if right != 0.0:
                    left /= right
                else:
                    left = 0.0
            elif op == "%":
                self.pos += 1
                var right2 = self.parse_power()
                if right2 != 0.0:
                    left = left - floor(left / right2) * right2
                else:
                    left = 0.0
            else:
                break
        return left

    def parse_power(mut self) raises -> Float64:
        var base = self.parse_unary()
        if self.pos < len(self.tokens) and self.tokens[self.pos] == "**":
            self.pos += 1
            var exp_val = self.parse_unary()
            return pow(base, exp_val)
        return base

    def parse_unary(mut self) raises -> Float64:
        if self.pos >= len(self.tokens):
            return 0.0
        var op = self.tokens[self.pos]
        if op == "-":
            self.pos += 1
            return -self.parse_primary()
        if op == "+":
            self.pos += 1
            return self.parse_primary()
        if op == "!":
            self.pos += 1
            var val = self.parse_primary()
            return 1.0 if val == 0.0 else 0.0
        return self.parse_primary()

    def parse_primary(mut self) raises -> Float64:
        if self.pos >= len(self.tokens):
            return 0.0

        var token = self.tokens[self.pos]

        if _is_digit(token) or (token.byte_length() > 1 and token.startswith("-") and _is_digit(String(token[byte=1:]))):
            self.pos += 1
            return Float64(token)

        if token == "(":
            self.pos += 1
            var result = self.parse_add_sub()
            if self.pos < len(self.tokens) and self.tokens[self.pos] == ")":
                self.pos += 1
            return result

        if _is_alpha(token) and self.pos + 1 < len(self.tokens) and self.tokens[self.pos + 1] == "(":
            var func_name = token
            self.pos += 2
            var args = List[Float64]()
            if self.pos < len(self.tokens) and self.tokens[self.pos] != ")":
                args.append(self.parse_add_sub())
                while self.pos < len(self.tokens) and self.tokens[self.pos] == ",":
                    self.pos += 1
                    args.append(self.parse_add_sub())
            if self.pos < len(self.tokens) and self.tokens[self.pos] == ")":
                self.pos += 1
            return _call_function(func_name, args)

        if token.lower() == "true":
            self.pos += 1
            return 1.0
        if token.lower() == "false":
            self.pos += 1
            return 0.0

        if token.lower() == "pi":
            self.pos += 1
            return pi
        if token.lower() == "e":
            self.pos += 1
            return e

        if _is_alpha(token):
            self.pos += 1
            return 0.0

        self.pos += 1
        return 0.0


def _tokenize(expr: String) -> List[String]:
    var tokens = List[String]()
    var i = 0
    var length = expr.byte_length()
    while i < length:
        var ch = String(expr[byte=i])
        if ch == " ":
            i += 1
            continue
        if ch == "(" or ch == ")" or ch == ",":
            tokens.append(ch)
            i += 1
        elif ch == "+" or ch == "-" or ch == "*" or ch == "/" or ch == "%" or ch == "^":
            if ch == "*" and i + 1 < length and String(expr[byte=i + 1]) == "*":
                tokens.append("**")
                i += 2
            else:
                tokens.append(ch)
                i += 1
        elif ch == "<" or ch == ">" or ch == "=" or ch == "!":
            if i + 1 < length:
                var next_ch = String(expr[byte=i + 1])
                if next_ch == "=":
                    tokens.append(ch + "=")
                    i += 2
                    continue
            if ch == "<":
                tokens.append("<")
            elif ch == ">":
                tokens.append(">")
            i += 1
        elif _is_digit(ch) or ch == ".":
            var num = String("")
            while i < length and (_is_digit(String(expr[byte=i])) or String(expr[byte=i]) == "."):
                num += String(expr[byte=i])
                i += 1
            tokens.append(num)
        elif _is_alpha(ch):
            var name = String("")
            while i < length and (_is_alpha(String(expr[byte=i])) or _is_digit(String(expr[byte=i])) or String(expr[byte=i]) == "_"):
                name += String(expr[byte=i])
                i += 1
            tokens.append(name)
        else:
            i += 1
    return tokens^


def _is_digit(ch: String) -> Bool:
    if ch.byte_length() == 0:
        return False
    var b = ch.as_bytes()
    return b[0] >= 48 and b[0] <= 57


def _is_alpha(ch: String) -> Bool:
    if ch.byte_length() == 0:
        return False
    var b = ch.as_bytes()
    var c = b[0]
    return (c >= 65 and c <= 90) or (c >= 97 and c <= 122) or c == 95


def _call_function(name: String, args: List[Float64]) raises -> Float64:
    var lower = name.lower()
    if lower == "abs":
        if len(args) > 0:
            return abs(args[0])
        return 0.0
    if lower == "min":
        if len(args) >= 2:
            return min(args[0], args[1])
        if len(args) == 1:
            return args[0]
        return 0.0
    if lower == "max":
        if len(args) >= 2:
            return max(args[0], args[1])
        if len(args) == 1:
            return args[0]
        return 0.0
    if lower == "sqrt":
        if len(args) > 0:
            return sqrt(args[0])
        return 0.0
    if lower == "pow":
        if len(args) >= 2:
            return pow(args[0], args[1])
        return 0.0
    if lower == "log":
        if len(args) > 0:
            return log(args[0])
        return 0.0
    if lower == "exp":
        if len(args) > 0:
            return exp(args[0])
        return 0.0
    if lower == "sin":
        if len(args) > 0:
            return _sin(args[0])
        return 0.0
    if lower == "cos":
        if len(args) > 0:
            return _cos(args[0])
        return 0.0
    if lower == "tan":
        if len(args) > 0:
            return _tan(args[0])
        return 0.0
    if lower == "floor":
        if len(args) > 0:
            return floor(args[0])
        return 0.0
    if lower == "ceil":
        if len(args) > 0:
            return ceil(args[0])
        return 0.0
    if lower == "round":
        if len(args) > 0:
            return Float64(Int(args[0]))
        return 0.0
    if lower == "clamp":
        if len(args) >= 3:
            return max(args[1], min(args[2], args[0]))
        return 0.0
    if lower == "clamp01":
        if len(args) >= 1:
            return max(0.0, min(1.0, args[0]))
        return 0.0
    if lower == "lerp":
        if len(args) >= 3:
            return args[0] + (args[1] - args[0]) * args[2]
        return 0.0
    if lower == "smoothstep":
        if len(args) >= 3:
            var t = max(0.0, min(1.0, args[0]))
            return t * t * (3.0 - 2.0 * t)
        return 0.0
    return 0.0
