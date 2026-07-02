from std.collections import Dict, List
from llm_client import LLMClient
from http_client import json_escape_string


# ── Prompt Builder ─────────────────────────────────────────────────

struct PromptBuilder:

    @staticmethod
    def build_narrator_prompt(context_json: String, recent_memories_json: String, world_facts_json: String, conversation_json: String) -> String:
        return 'You are a master storyteller. Describe the environment, NPC actions, and consequences. Do not speak for the user character. Output narrative text only.'

    @staticmethod
    def build_npc_prompt(npc_name: String, npc_personality: String, player_character: String, location: String, player_line: String, recent_events_json: String, relationship: String = "neutral") -> String:
        return npc_name + ' responds in character. Keep it short and natural.'

    @staticmethod
    def build_scene_transition_prompt(current_location: String, destination: String, character: String, recent_events_json: String, world_rules_json: String) -> String:
        return 'Describe the journey from ' + current_location + ' to ' + destination + '. Do not speak for the character.'
