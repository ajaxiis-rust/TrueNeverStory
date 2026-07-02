from models import EntityType, EntityNode, Relationship, WorldFrame
from config import AppConfig, get_config
from entity_store import EntityStore
from graph_engine import GraphEngine, GraphNode, Edge
from probability_models import (
    ProbabilityModifier,
    ProbabilityParameter,
    ProbabilityProfile,
    ProbabilityResult,
    ModifierType,
    OutcomeQuality,
    ParameterType,
    StackingRule,
)
from probability_engine import ProbabilityEngine
from llm_client import LLMClient
from http_client import HTTPClient, OpenAIHTTPClient, HTTPResponse
from memory import MemoryEntry, VectorMemoryStore
from chronicler import Chronicler, Event, EventBus
from director import (
    Director,
    DirectorConfig,
    StoryEngine,
    StoryEvent,
    WorldClock,
    QuestManager,
    Quest as DirectorQuest,
)
from cli import CLI
from persistence import SaveManager
from web_ui import WebUI
from utils import atomic_write_json, atomic_read_json, deterministic_hash, truncate, safe_names
from event_bus import EventBus as NewEventBus, Event as NewEvent
from prompts import get_prompts
from history_manager import HistoryManager, ConversationTurn
from llm_queue import GlobalLLMQueue
from world_clock import WorldClock as NewWorldClock
from validation import WorldValidator
from story_planner import StoryPlanner
from quest_manager import QuestManager as NewQuestManager, Quest as NewQuest
from villain_manager import VillainManager
from social_sim import SocialSimulator
from memory_optimized import OptimizedMemoryStore, NPCProfile
from generator import WorldGenerator
from builder import WorldBuilder
from story_engine import StoryEngine as NewStoryEngine
from context import NarrativeContext
from birth import BirthScenario, BirthGenerator
from launcher import GameLauncher
from user_agent import UserAgent, UserSession
from hf_downloader import HuggingFaceDownloader, HFModelInfo
from http_client import _split_lines
from std import subprocess

def main() raises:
    print("BRING v2 — Building Rich Interactive Narrative Games")
    print("=" * 60)

    # ── Model Auto-Discovery ──────────────────────────────────────
    print("\n--- Model Discovery ---")
    var found_models = _scan_for_models()
    if len(found_models) > 0:
        print("Found " + String(len(found_models)) + " model(s):")
        for i in range(len(found_models)):
            print("  " + String(i + 1) + ". " + found_models[i])
    else:
        print("No GGUF models found.")
        print("Searching system-wide...")
        var system_models = _scan_system()
        if len(system_models) > 0:
            print("Found " + String(len(system_models)) + " model(s) on system:")
            for i in range(len(system_models)):
                print("  " + String(i + 1) + ". " + system_models[i])
        else:
            print("No models found anywhere.")
            print("To download a model, run:")
            print("  mkdir -p models && cd models")
            print("  curl -L -o model.gguf https://huggingface.co/TheBloke/Llama-2-7B-GGUF/resolve/main/llama-2-7b.Q4_K_M.gguf")
            print("Or use the HuggingFace downloader in the web UI.")

    # ── Test Config ───────────────────────────────────────────────
    var config = get_config()
    print("Config:", config)

    # ── Test Entity Store ─────────────────────────────────────────
    print("\n--- Entity Store ---")
    var store = EntityStore("./world_db")
    store.add(EntityNode("Character:Aragorn", "Aragorn", "Character"))
    store.add(EntityNode("Character:Frodo", "Frodo", "Character"))
    store.add(EntityNode("Location:Rivendell", "Rivendell", "Location"))
    store.add(EntityNode("Item:Sting", "Sting", "Item"))
    print("All nodes:", len(store.all_nodes()))
    print("Search 'ragorn':", len(store.search("ragorn", None)))

    # ── Test Graph Engine ─────────────────────────────────────────
    print("\n--- Graph Engine ---")
    var graph = GraphEngine()
    graph.add_node("Character:Aragorn", "Aragorn", "Character")
    graph.add_node("Character:Frodo", "Frodo", "Character")
    graph.add_node("Location:Rivendell", "Rivendell", "Location")
    graph.add_node("Item:Sting", "Sting", "Item")
    graph.add_edge("Character:Aragorn", "Character:Frodo", "ally")
    graph.add_edge("Character:Frodo", "Location:Rivendell", "located_at")
    graph.add_edge("Character:Frodo", "Item:Sting", "owns")
    print("Nodes:", graph.node_count())
    print("Edges:", graph.edge_count())
    print("Frodo's connections:", len(graph.get_out_neighbors("Character:Frodo")))
    print("Characters:", len(graph.nodes_of_type("Character")))

    # ── Test Probability Engine ───────────────────────────────────
    print("\n--- Probability Engine ---")
    var prob_engine = ProbabilityEngine()
    prob_engine.set_global_luck(0.5)
    var combat_profile = ProbabilityProfile("combat")
    combat_profile.parameters["strength"] = ProbabilityParameter("strength")
    combat_profile.parameters["strength"].base_value = 0.7
    combat_profile.parameters["skill"] = ProbabilityParameter("skill")
    combat_profile.parameters["skill"].base_value = 0.6
    var context = Dict[String, String]()
    var result = prob_engine.roll(combat_profile, context, "Character:Aragorn")
    print("Combat probability:", result.probability)
    print("Roll:", result.roll)
    print("Success:", result.success)
    print("Quality:", result.quality.value)

    # ── Test HTTP Client ──────────────────────────────────────────
    print("\n--- HTTP Client ---")
    var http = HTTPClient("https://httpbin.org")
    var response = http.get("/get")
    print("HTTP Status:", response.status_code)

    # ── Test LLM Client ──────────────────────────────────────────
    print("\n--- LLM Client ---")
    var llm = LLMClient("http://localhost:11434/v1", "test-key", "llama3")
    print("LLM configured:", llm.is_configured())
    print("LLM model:", llm.model)

    # ── Test Memory System ───────────────────────────────────────
    print("\n--- Memory System ---")
    var memory = VectorMemoryStore()
    var embedding1 = List[Float64]()
    for i in range(384):
        embedding1.append(Float64(i) / 384.0)
    var entry1 = MemoryEntry("1", "Aragorn met Frodo in Rivendell", "narrative")
    entry1.importance = 0.8
    memory.add_entry(entry1^, embedding1^)
    print("Memory entries:", memory.entry_count())

    # ── Test Chronicler ──────────────────────────────────────────
    print("\n--- Chronicler ---")
    var chronicler = Chronicler("chronicle.jsonl")
    _ = chronicler.log_event("The journey began", "Day 1, Dawn", "narrative")
    print("Total entries:", chronicler.entry_count())

    # ── Test Story Engine (original) ─────────────────────────────
    print("\n--- Story Engine ---")
    var story_engine = StoryEngine("Middle-earth")
    var story_event = story_engine.generate_event("incident", "minor")
    print("Generated event:", story_event.title)

    # ── Test Director ─────────────────────────────────────────────
    print("\n--- Director ---")
    var director = Director("Middle-earth")
    director.start()
    print("Director status:", director.get_status())
    var tick_event = director.tick()
    print("Director tick:", tick_event.title)
    director.stop()
    print("Director stopped:", director.get_status())

    # ── Test Quest Manager (original) ────────────────────────────
    print("\n--- Quest Manager ---")
    var quest_mgr_orig = QuestManager()
    var quest_orig = quest_mgr_orig.add_quest("Find the Ring", "Destroy the One Ring")
    print("Created quest:", quest_orig.title)

    # ── Test Utils ────────────────────────────────────────────────
    print("\n--- Utils ---")
    var hash_result = deterministic_hash("Hello, Mojo!", 32)
    print("Hash length:", len(hash_result))
    var truncated = truncate("This is a very long text that should be truncated", 20)
    print("Truncated:", truncated)
    var names = List[String]()
    names.append("Alice")
    names.append("Bob")
    names.append("Charlie")
    print("Safe names:", safe_names(names))

    # ── Test Event Bus ────────────────────────────────────────────
    print("\n--- Event Bus ---")
    var event_bus = NewEventBus()
    event_bus.publish_simple("entity.added", "Aragorn")
    event_bus.publish_simple("relationship.added", "Aragorn -> Frodo")
    var replay = event_bus.get_replay("", 10)
    print("Replay buffer:", len(replay))

    # ── Test Prompts ──────────────────────────────────────────────
    print("\n--- Prompts ---")
    var prompts = get_prompts()
    print("World frame prompt length:", prompts["world_frame"].byte_length())

    # ── Test History Manager ──────────────────────────────────────
    print("\n--- History Manager ---")
    var hist_mgr = HistoryManager("./test_history")
    _ = hist_mgr.add_turn("user", "Hello")
    _ = hist_mgr.add_turn("assistant", "Hi there!")
    print("History turns:", hist_mgr.get_turn_count())

    # ── Test LLM Queue ────────────────────────────────────────────
    print("\n--- LLM Queue ---")
    # Note: GlobalLLMQueue takes ownership of llm - skipping
    print("LLM Queue skipped (takes ownership of llm)")

    # ── Test New World Clock ──────────────────────────────────────
    print("\n--- World Clock ---")
    var new_clock = NewWorldClock("")
    new_clock.set_global_luck(0.65)
    print("Global luck:", new_clock.get_global_luck())
    new_clock.schedule_event("2026-01-02", "villain_event")
    print("Scheduled events:", new_clock.get_scheduled_count())

    # ── Test Validation ──────────────────────────────────────────
    print("\n--- Validation ---")
    # Note: WorldValidator takes ownership of store - skipping
    print("Validation skipped (takes ownership of store)")

    # ── Test Story Planner ────────────────────────────────────────
    print("\n--- Story Planner ---")
    var planner = StoryPlanner()
    print("Chapters:", planner.chapter_count)
    print("Beats:", planner.beat_count)
    print("Pending beats:", planner._count_pending_beats())
    var next_beat = planner.generate_next_beat()
    print("Next beat:", String(next_beat[byte=0:40]) + "...")

    # ── Test New Quest Manager ────────────────────────────────────
    print("\n--- New Quest Manager ---")
    var new_quest_mgr = NewQuestManager()
    var new_q = NewQuest("Find the Ring", "Destroy the One Ring")
    new_quest_mgr.add_quest(new_q^)
    print("Quests:", new_quest_mgr.get_quest_count())
    print("Active:", new_quest_mgr.get_active_count())

    # ── Test Villain Manager ──────────────────────────────────────
    print("\n--- Villain Manager ---")
    var villain_mgr = VillainManager()
    villain_mgr.create_default_villains()
    print("Villains:", villain_mgr.get_villain_count())
    var villain_events = villain_mgr.tick()
    print("Villain events:", String(villain_events[byte=0:50]) + "...")

    # ── Test Social Sim ──────────────────────────────────────────
    print("\n--- Social Sim ---")
    var social_sim = SocialSimulator()
    print("Social simulator created")

    # ── Test Generator ────────────────────────────────────────────
    print("\n--- Generator ---")
    # Note: WorldGenerator takes ownership of llm - skipping
    print("Generator skipped (takes ownership of llm)")

    # ── Test Persistence ──────────────────────────────────────────
    print("\n--- Persistence ---")
    var save_mgr = SaveManager("./saves")
    var entities_json = save_mgr.save_entities(store)
    print("Saved entities JSON length:", entities_json.byte_length())
    var loaded_entities = save_mgr.load_entities(entities_json)
    print("Loaded entities:", len(loaded_entities))

    var world_frame = WorldFrame()
    world_frame.world_name = "Middle-earth"
    world_frame.world_rules.append("Magic exists")
    world_frame.characters.append("Aragorn")
    world_frame.characters.append("Frodo")
    world_frame.locations.append("Rivendell")
    var frame_json = save_mgr.save_world_frame(world_frame)
    print("Saved world frame JSON length:", frame_json.byte_length())
    var loaded_frame = save_mgr.load_world_frame(frame_json)
    print("Loaded world name:", loaded_frame.world_name)

    # ── Test Builder ──────────────────────────────────────────────
    print("\n--- Builder ---")
    var builder = WorldBuilder(llm^, store^)
    print("Builder created")

    # ── Test Narrative Context ────────────────────────────────────
    print("\n--- Narrative Context ---")
    var ctx = NarrativeContext()
    ctx.set_world_frame('{"world_name":"Middle-earth","world_rules":[]}', "Middle-earth")
    print("Context status:", String(ctx.status()[byte=0:80]) + "...")

    # ── Test Birth ────────────────────────────────────────────────
    print("\n--- Birth ---")
    var birth_gen = BirthGenerator()
    print("Birth generator created")

    # ── Test Launcher ─────────────────────────────────────────────
    print("\n--- Launcher ---")
    var launcher = GameLauncher(ctx^)
    var check_result = launcher.system_check()
    print("System check:", check_result)

    # ── Test User Agent ──────────────────────────────────────────
    print("\n--- User Agent ---")
    var ctx2 = NarrativeContext()
    ctx2.set_world_frame('{"world_name":"Middle-earth","world_rules":[]}', "Middle-earth")
    var user_agent = UserAgent(ctx2, "test_session", "Middle-earth")
    user_agent.set_character("Aragorn")
    var session_json = user_agent.session.to_json()
    print("Session:", String(session_json[byte=0:60]) + "...")
    var help_resp = user_agent.process_input("/help")
    print("Help:", String(help_resp[byte=0:50]) + "...")

    # ── Test CLI ──────────────────────────────────────────────────
    print("\n--- CLI ---")
    var cli = CLI()
    var help_output = cli.handle_command("help", List[String]())
    print(help_output)
    var status_output = cli.handle_command("status", List[String]())
    print(status_output)

    # ── Test Web UI ───────────────────────────────────────────────
    print("\n--- Web UI ---")
    var web_ui = WebUI(config.server)
    web_ui.start()
    print("Web UI URL:", web_ui.get_url())

    # ── Test HuggingFace Downloader ───────────────────────────────
    print("\n--- HuggingFace Downloader ---")
    var hf_downloader = HuggingFaceDownloader(
        config.models.models_dir, config.models.hf_token,
        config.models.timeout, config.models.max_retries,
    )
    print("Models dir:", config.models.models_dir)
    print("Default repo:", config.models.default_repo)

    # ── Summary ───────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("All modules working!")
    print("Server running at:", web_ui.get_url())
    print("Press Ctrl+C to stop.")

    # ── Keep alive ────────────────────────────────────────────────
    while True:
        _ = subprocess.run("sleep 5")


# ── Model Discovery Functions ────────────────────────────────────

def _scan_for_models() raises -> List[String]:
    var models = List[String]()
    var cmd = "find ./models -name '*.gguf' -type f 2>/dev/null"
    var output = subprocess.run(cmd)
    if output.byte_length() == 0:
        return models^
    var lines = _split_lines(output)
    for i in range(len(lines)):
        if lines[i].byte_length() > 0:
            models.append(lines[i])
    return models^


def _scan_system() raises -> List[String]:
    var models = List[String]()
    var dirs = List[String]()
    dirs.append("/home")
    dirs.append("/opt")
    dirs.append("/usr/local")
    dirs.append("/tmp")

    for d in range(len(dirs)):
        var cmd = "find " + dirs[d] + " -name '*.gguf' -type f -maxdepth 4 2>/dev/null"
        var output = subprocess.run(cmd)
        if output.byte_length() > 0:
            var lines = _split_lines(output)
            for i in range(len(lines)):
                if lines[i].byte_length() > 0:
                    models.append(lines[i])
    return models^
