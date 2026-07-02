from std.collections import Dict, List
from llm_client import LLMClient
from http_client import json_escape_string


# ── Global LLM Queue ───────────────────────────────────────────────

struct LLMTask(Movable):
    var id: String
    var task_type: String
    var priority: Int
    var prompt: String
    var temperature: Float64

    def __init__(out self, id: String, task_type: String, prompt: String, priority: Int = 0, temperature: Float64 = 0.7):
        self.id = id
        self.task_type = task_type
        self.priority = priority
        self.prompt = prompt
        self.temperature = temperature


struct GlobalLLMQueue:
    var llm: LLMClient
    var max_concurrent: Int
    var task_counter: Int

    def __init__(out self, var llm: LLMClient, max_concurrent: Int = 3):
        self.llm = llm^
        self.max_concurrent = max_concurrent
        self.task_counter = 0

    def generate_text(mut self, prompt: String, priority: Int = 0, temperature: Float64 = 0.7) raises -> String:
        self.task_counter += 1
        return self.llm.generate_text(prompt)

    def generate_json(mut self, prompt: String, priority: Int = 0, temperature: Float64 = 0.7) raises -> String:
        self.task_counter += 1
        return self.llm.generate_json(prompt)

    def generate_text_with_system(mut self, prompt: String, system: String) raises -> String:
        self.task_counter += 1
        return self.llm.generate_text_with_system(prompt, system)

    def task_count(self) -> Int:
        return self.task_counter
