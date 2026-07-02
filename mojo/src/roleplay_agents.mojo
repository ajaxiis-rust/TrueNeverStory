from std.collections import Dict, List
from llm_client import LLMClient
from http_client import json_escape_string


# ── Narrator Agent ─────────────────────────────────────────────────

struct NarratorAgent:
    var llm: LLMClient

    def __init__(out self, var llm: LLMClient):
        self.llm = llm^

    def generate(mut self, context_json: String, recent_memories_json: String, world_facts_json: String, conversation_json: String) raises -> String:
        var prompt = 'You are a master storyteller. Describe the environment and NPC actions.'
        return self.llm.generate_text(prompt)



# ── NPC Agent ──────────────────────────────────────────────────────

struct NPCAgent:
    var llm: LLMClient

    def __init__(out self, var llm: LLMClient):
        self.llm = llm^

    def respond(mut self, npc_name: String, npc_personality: String, player_character: String, location: String, player_line: String, recent_events_json: String, relationship: String = "neutral") raises -> String:
        var prompt = npc_name + ' responds to ' + player_character + ': ' + player_line
        return self.llm.generate_text(prompt)



# ── Scene Agent ────────────────────────────────────────────────────

struct SceneAgent:
    var llm: LLMClient

    def __init__(out self, var llm: LLMClient):
        self.llm = llm^

    def transition(mut self, current_location: String, destination: String, character: String, recent_events_json: String, world_rules_json: String) raises -> String:
        var prompt = 'Describe ' + character + ' moving from ' + current_location + ' to ' + destination
        return self.llm.generate_text(prompt)



# ── Director Agent ─────────────────────────────────────────────────

struct DirectorAgent:
    var llm: LLMClient

    def __init__(out self, var llm: LLMClient):
        self.llm = llm^

    def inject_beat(mut self, beat_description: String, current_narrative: String) raises -> String:
        var prompt = 'Integrate this story beat into the narrative: ' + beat_description
        return self.llm.generate_text(prompt)
