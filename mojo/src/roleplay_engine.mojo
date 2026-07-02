from std.collections import Dict, List
from entity_store import EntityStore
from graph_engine import GraphEngine
from llm_client import LLMClient
from chronicler import Chronicler
from director import Director
from memory_optimized import OptimizedMemoryStore
from validation import WorldValidator
from quest_manager import QuestManager
from world_clock import WorldClock
from probability_engine import ProbabilityEngine
from http_client import json_escape_string


# ── Roleplay Engine ────────────────────────────────────────────────

struct RoleplayEngine:
    var entity_store: EntityStore
    var graph: GraphEngine
    var llm: LLMClient
    var chronicler: Chronicler
    var director: Director
    var npc_mgr: OptimizedMemoryStore
    var validator: WorldValidator
    var quest_mgr: QuestManager
    var clock: WorldClock
    var prob_engine: ProbabilityEngine
    var world_frame_json: String
    var active_session_id: String
    var current_character: String
    var current_location: String

    def __init__(out self, var store: EntityStore, var graph: GraphEngine, var llm: LLMClient, var chronicler: Chronicler, var director: Director, var npc_mgr: OptimizedMemoryStore, var validator: WorldValidator, var quest_mgr: QuestManager, var clock: WorldClock, var prob_engine: ProbabilityEngine, world_frame_json: String):
        self.entity_store = store^
        self.graph = graph^
        self.llm = llm^
        self.chronicler = chronicler^
        self.director = director^
        self.npc_mgr = npc_mgr^
        self.validator = validator^
        self.quest_mgr = quest_mgr^
        self.clock = clock^
        self.prob_engine = prob_engine^
        self.world_frame_json = world_frame_json
        self.active_session_id = ""
        self.current_character = ""
        self.current_location = ""

    def process_input(mut self, user_input: String) raises -> String:
        if user_input.startswith("/"):
            return self._handle_command(user_input)
        elif user_input.startswith("go ") or user_input.startswith("move "):
            return self._handle_movement(user_input)
        elif user_input.startswith("talk to ") or user_input.startswith("say to "):
            return self._handle_dialogue(user_input)
        else:
            return self._handle_generic_action(user_input)

    def _handle_command(self, cmd: String) raises -> String:
        if cmd == "/help":
            return '{"command":"help","description":"Available commands: /help, /look, /status, /inventory, /quests, /time, /save, /quit"}'
        elif cmd == "/look":
            return '{"narrative":"You look around the area."}'
        elif cmd == "/status":
            return '{"character":"' + self.current_character + '","location":"' + self.current_location + '"}'
        elif cmd == "/inventory":
            return '{"inventory":[]}'
        elif cmd == "/quests":
            return self.quest_mgr.get_active_quests()
        elif cmd == "/time":
            return '{"time":"' + self.clock.current_time_str + '"}'
        elif cmd == "/save":
            return '{"status":"saved"}'
        elif cmd == "/quit":
            return '{"status":"quitting"}'
        return '{"error":"unknown command"}'

    def _handle_movement(mut self, input: String) raises -> String:
        var destination = String(input[byte=3:])
        self.current_location = destination
        return '{"narrative":"You move to ' + json_escape_string(destination) + '.","new_location":"' + json_escape_string(destination) + '"}'

    def _handle_dialogue(self, input: String) raises -> String:
        return '{"narrative":"You speak to an NPC.","response":"The NPC listens attentively."}'

    def _handle_generic_action(self, input: String) raises -> String:
        return '{"narrative":"You perform an action.","effects":[]}'

    def get_session_state(self) -> String:
        return '{"session_id":"' + self.active_session_id + '","character":"' + self.current_character + '","location":"' + self.current_location + '"}'
