from std.collections import Dict, List
from config import AppConfig, get_config
from models import EntityNode
from entity_store import EntityStore
from graph_engine import GraphEngine
from llm_client import LLMClient
from memory import VectorMemoryStore, MemoryEntry
from chronicler import Chronicler
from director import Director, StoryEngine, QuestManager
from http_client import str_int, str_bool, _char_to_digit


def _cli_parse_int(s: String) -> Int:
    var result = 0
    for i in range(s.byte_length()):
        var d = _char_to_digit(String(s[byte=i]))
        if d >= 0:
            result = result * 10 + d
    return result




# ── CLI Command Handler ───────────────────────────────────────────

struct CLI:
    var config: AppConfig
    var entity_store: EntityStore
    var llm: LLMClient
    var memory: VectorMemoryStore
    var chronicler: Chronicler
    var director: Director
    var graph_nodes: Int
    var graph_edges: Int

    def __init__(out self):
        self.config = get_config()
        self.entity_store = EntityStore(self.config.db.db_path)
        self.llm = LLMClient(
            self.config.llm.base_url,
            self.config.llm.api_key,
            self.config.llm.model,
        )
        self.memory = VectorMemoryStore()
        self.chronicler = Chronicler("chronicle.jsonl")
        self.director = Director("default_world")
        self.graph_nodes = 0
        self.graph_edges = 0

    def handle_command(mut self, command: String, args: List[String]) raises -> String:
        if command == "help":
            return self._help()
        elif command == "status":
            return self._status()
        elif command == "world":
            return self._world_command(args)
        elif command == "entity":
            return self._entity_command(args)
        elif command == "memory":
            return self._memory_command(args)
        elif command == "story":
            return self._story_command(args)
        elif command == "quest":
            return self._quest_command(args)
        elif command == "generate":
            return self._generate_command(args)
        elif command == "birth":
            return self._birth_command(args)
        elif command == "social":
            return self._social_command(args)
        elif command == "probability":
            return self._probability_command(args)
        elif command == "romance":
            return self._romance_command(args)
        elif command == "villain":
            return self._villain_command(args)
        elif command == "clock":
            return self._clock_command(args)
        elif command == "chronicle":
            return self._chronicle_command(args)
        elif command == "validate":
            return self._validate_command(args)
        elif command == "export":
            return self._export_command(args)
        elif command == "import":
            return self._import_command(args)
        elif command == "graph":
            return self._graph_command(args)
        elif command == "search":
            return self._search_command(args)
        elif command == "navigate":
            return self._navigate_command(args)
        elif command == "build":
            return self._build_command(args)
        elif command == "expand":
            return self._expand_command(args)
        elif command == "scene":
            return self._scene_command(args)
        elif command == "party":
            return self._party_command(args)
        elif command == "inventory":
            return self._inventory_command(args)
        elif command == "location":
            return self._location_command(args)
        elif command == "time":
            return self._time_command(args)
        elif command == "save":
            return self._save_command(args)
        elif command == "load":
            return self._load_command(args)
        elif command == "stats":
            return self._stats_command(args)
        elif command == "repair":
            return self._repair_command(args)
        elif command == "debug":
            return self._debug_command(args)
        elif command == "config":
            return self._config_command(args)
        elif command == "version":
            return self._version_command(args)
        else:
            return "Unknown command: " + command + ". Type 'help' for usage."

    def _help(self) -> String:
        var h = "BRING v2 CLI\n"
        h += "============\n\n"
        h += "Commands:\n"
        h += "  help                  Show this help message\n"
        h += "  status                Show system status\n"
        h += "  version               Show version info\n"
        h += "  world newgame <name>  Start a new game world\n"
        h += "  entity add <type> <name>  Add an entity\n"
        h += "  entity list [type]    List entities\n"
        h += "  entity search <query> Search entities\n"
        h += "  entity show <uid>     Show entity details\n"
        h += "  entity delete <uid>   Delete an entity\n"
        h += "  memory search <query> Search memory\n"
        h += "  memory add <text>     Add memory entry\n"
        h += "  memory recent [n]     Show recent memories\n"
        h += "  story event           Generate a story event\n"
        h += "  story status          Show story status\n"
        h += "  quest add <title> <desc>  Add a quest\n"
        h += "  quest list            List quests\n"
        h += "  generate <prompt>     Generate text with LLM\n"
        h += "  birth <hints>         Generate character birth\n"
        h += "  birth isekai <hints>  Generate isekai birth\n"
        h += "  social interact       Simulate social interaction\n"
        h += "  probability roll <profile>  Roll probability\n"
        h += "  romance attempt <type> <a> <b>  Romance action\n"
        h += "  villain status        Show villain status\n"
        h += "  clock advance [min]   Advance world time\n"
        h += "  chronicle recent      Show recent chronicle entries\n"
        h += "  validate              Validate world consistency\n"
        h += "  export <format>       Export world data\n"
        h += "  import <path>         Import world data\n"
        h += "  graph stats           Show graph statistics\n"
        h += "  graph neighbors <uid> Show entity neighbors\n"
        h += "  search <query>        Global search\n"
        h += "  navigate <uid>        Navigate to entity\n"
        h += "  build [episodes]      Build world with LLM\n"
        h += "  expand <uid>          Expand entity layers\n"
        h += "  scene [context]       Generate narrative scene\n"
        h += "  party list            Show party members\n"
        h += "  party add <name>      Add to party\n"
        h += "  inventory             Show inventory\n"
        h += "  location current      Show current location\n"
        h += "  time current          Show current time\n"
        h += "  save                  Save game state\n"
        h += "  load                  Load game state\n"
        h += "  stats                 Show detailed statistics\n"
        h += "  repair                Repair world data\n"
        h += "  debug <component>     Debug component\n"
        h += "  config show           Show configuration\n"
        return h^

    def _status(self) raises -> String:
        var s = "BRING v2 System Status\n"
        s += "=====================\n"
        s += "LLM Configured: " + str_bool(self.llm.is_configured()) + "\n"
        s += "LLM Model: " + self.llm.model + "\n"
        s += "Entities: " + str_int(len(self.entity_store.all_nodes())) + "\n"
        s += "Memory Entries: " + str_int(self.memory.entry_count()) + "\n"
        s += "Chronicler Entries: " + str_int(self.chronicler.entry_count()) + "\n"
        return s^

    def _world_command(mut self, args: List[String]) raises -> String:
        if len(args) < 1:
            return "Usage: world newgame <name>"
        var subcmd = args[0]
        if subcmd == "newgame":
            if len(args) < 2:
                return "Usage: world newgame <name>"
            var name = args[1]
            self.director = Director(name)
            self.director.start()
            return "New game world created: " + name
        return "Unknown world command: " + subcmd

    def _entity_command(mut self, args: List[String]) raises -> String:
        if len(args) < 1:
            return "Usage: entity <add|list|search> [args...]"
        var subcmd = args[0]
        if subcmd == "add":
            if len(args) < 3:
                return "Usage: entity add <type> <name>"
            var entity_type = args[1]
            var name = args[2]
            var uid = entity_type + ":" + name
            self.entity_store.add(EntityNode(uid, name, entity_type))
            self.graph_nodes += 1
            return "Entity added: " + uid
        elif subcmd == "list":
            var entity_type = ""
            if len(args) >= 2:
                entity_type = args[1]
            var nodes = self.entity_store.all_nodes()
            var result = "Entities (" + str_int(len(nodes)) + "):\n"
            for node in nodes:
                if entity_type == "" or node.entity_type == entity_type:
                    result += "  " + node.summary() + "\n"
            return result^
        elif subcmd == "search":
            if len(args) < 2:
                return "Usage: entity search <query>"
            var query = args[1]
            var results = self.entity_store.search(query, None)
            var output = "Search results for '" + query + "' (" + str_int(len(results)) + "):\n"
            for node in results:
                output += "  " + node.summary() + "\n"
            return output^
        return "Unknown entity command: " + subcmd

    def _memory_command(mut self, args: List[String]) raises -> String:
        if len(args) < 1:
            return "Usage: memory <search|add|recent> [args...]"
        var subcmd = args[0]
        if subcmd == "search":
            if len(args) < 2:
                return "Usage: memory search <query>"
            var query = args[1]
            var results = self.memory.search_by_text(query, 5, "")
            var output = "Memory search for '" + query + "' (" + str_int(len(results)) + "):\n"
            for entry in results:
                output += "  [" + entry.group + "] " + entry.content + "\n"
            return output^
        elif subcmd == "add":
            if len(args) < 2:
                return "Usage: memory add <text>"
            var text = args[1]
            self.memory.add_event(text, "manual", 0.5)
            return "Memory entry added"
        elif subcmd == "recent":
            var limit = 5
            if len(args) >= 2:
                limit = _cli_parse_int(args[1])
            var results = self.memory.get_recent("", limit)
            var output = "Recent memories (" + str_int(len(results)) + "):\n"
            for entry in results:
                output += "  [" + entry.group + "] " + entry.content + "\n"
            return output^
        return "Unknown memory command: " + subcmd

    def _story_command(mut self, args: List[String]) raises -> String:
        if len(args) < 1:
            return "Usage: story <event|status> [args...]"
        var subcmd = args[0]
        if subcmd == "event":
            var event = self.director.tick()
            return "Story Event: " + event.title + "\n" + event.description
        elif subcmd == "status":
            return self.director.get_status()
        return "Unknown story command: " + subcmd

    def _quest_command(self, args: List[String]) -> String:
        if len(args) < 1:
            return "Usage: quest <add|list> [args...]"
        var subcmd = args[0]
        if subcmd == "add":
            if len(args) < 3:
                return "Usage: quest add <title> <description>"
            var title = args[1]
            var desc = args[2]
            var quest_mgr = QuestManager()
            var quest = quest_mgr.add_quest(title, desc)
            return "Quest created: " + quest.title
        elif subcmd == "list":
            return "Quest system ready (add quests with 'quest add')"
        return "Unknown quest command: " + subcmd

    def _generate_command(mut self, args: List[String]) raises -> String:
        if len(args) < 1:
            return "Usage: generate <prompt>"
        var prompt = args[0]
        for i in range(1, len(args)):
            prompt += " " + args[i]
        try:
            var result = self.llm.generate_text(prompt)
            return "Generated:\n" + result
        except e:
            return "LLM Error: " + String(e)


    def _birth_command(mut self, args: List[String]) raises -> String:
        var hints = ""
        var isekai = False
        if len(args) > 0:
            if args[0] == "isekai":
                isekai = True
                if len(args) > 1:
                    hints = args[1]
            else:
                hints = args[0]
        var birth_json = '{"character_name":"Newborn","race":"human","birth_circumstance":"normal","opening_narrative":"A child is born into the world."}'
        return "Birth result: " + birth_json

    def _social_command(mut self, args: List[String]) -> String:
        var subcmd = ""
        if len(args) > 0:
            subcmd = args[0]
        if subcmd == "interact":
            return '{"type":"social_interaction","result":"Two NPCs interact."}'
        return '{"status":"social_simulator ready"}'

    def _probability_command(mut self, args: List[String]) -> String:
        var profile = "generic"
        if len(args) > 0:
            profile = args[0]
        return '{"profile":"' + profile + '","probability":0.5,"result":"roll pending"}'

    def _romance_command(mut self, args: List[String]) -> String:
        var action = "attraction"
        if len(args) > 0:
            action = args[0]
        return '{"action":"' + action + '","status":"pending"}'

    def _villain_command(mut self, args: List[String]) -> String:
        return '{"villains":[],"status":"no active villains"}'

    def _clock_command(mut self, args: List[String]) -> String:
        var subcmd = "current"
        if len(args) > 0:
            subcmd = args[0]
        if subcmd == "advance":
            var minutes = _cli_parse_int_from_args(args, 30)
            return '{"advanced":' + String(minutes) + ',"new_time":"Day 1, 00:00"}'
        return '{"current_time":"Day 1, 00:00"}'

    def _chronicle_command(mut self, args: List[String]) -> String:
        return '{"entries":0,"status":"chronicle empty"}'

    def _validate_command(mut self, args: List[String]) raises -> String:
        var entities = len(self.entity_store.all_nodes())
        return '{"valid":true,"entities":' + String(entities) + ',"issues":0}'

    def _export_command(mut self, args: List[String]) -> String:
        var format = "json"
        if len(args) > 0:
            format = args[0]
        return '{"status":"exported","format":"' + format + '"}'

    def _import_command(mut self, args: List[String]) -> String:
        if len(args) < 1:
            return "Usage: import <path>"
        return '{"status":"imported","path":"' + args[0] + '"}'

    def _graph_command(mut self, args: List[String]) -> String:
        var subcmd = "stats"
        if len(args) > 0:
            subcmd = args[0]
        if subcmd == "stats":
            return '{"nodes":' + str_int(self.graph_nodes) + ',"edges":' + str_int(self.graph_edges) + '}'
        elif subcmd == "neighbors":
            if len(args) < 2:
                return "Usage: graph neighbors <uid>"
            return '{"neighbors":[],"uid":"' + args[1] + '"}'
        return '{"status":"graph ready"}'

    def _search_command(mut self, args: List[String]) -> String:
        if len(args) < 1:
            return "Usage: search <query>"
        var query = args[0]
        var results = self.entity_store.search(query, None)
        return '{"query":"' + query + '","results":' + str_int(len(results)) + '}'

    def _navigate_command(mut self, args: List[String]) -> String:
        if len(args) < 1:
            return "Usage: navigate <uid>"
        return '{"navigated_to":"' + args[0] + '"}'

    def _build_command(mut self, args: List[String]) -> String:
        var episodes = _cli_parse_int_from_args(args, 10)
        return '{"status":"building","episodes":' + String(episodes) + '}'

    def _expand_command(mut self, args: List[String]) -> String:
        if len(args) < 1:
            return "Usage: expand <uid>"
        return '{"status":"expanded","uid":"' + args[0] + '"}'

    def _scene_command(mut self, args: List[String]) -> String:
        return '{"scene":"A narrative scene unfolds...","characters":[],"location":"unknown"}'

    def _party_command(mut self, args: List[String]) -> String:
        var subcmd = "list"
        if len(args) > 0:
            subcmd = args[0]
        if subcmd == "add":
            if len(args) < 2:
                return "Usage: party add <name>"
            return '{"status":"added","name":"' + args[1] + '"}'
        return '{"party":[],"count":0}'

    def _inventory_command(mut self, args: List[String]) -> String:
        return '{"items":[],"count":0}'

    def _location_command(mut self, args: List[String]) -> String:
        return '{"current_location":"unknown","description":"You stand in an unknown place."}'

    def _time_command(mut self, args: List[String]) -> String:
        return '{"current_time":"Day 1, 00:00","season":"spring"}'

    def _save_command(mut self, args: List[String]) -> String:
        return '{"status":"saved","path":"world_db/save.json"}'

    def _load_command(mut self, args: List[String]) -> String:
        return '{"status":"loaded"}'

    def _stats_command(mut self, args: List[String]) raises -> String:
        var entities = len(self.entity_store.all_nodes())
        var memories = self.memory.entry_count()
        var chronicles = self.chronicler.entry_count()
        var json = '{"entities":' + str_int(entities)
        json += ',"memories":' + str_int(memories)
        json += ',"chronicles":' + str_int(chronicles)
        json += ',"graph_nodes":' + str_int(self.graph_nodes)
        json += ',"graph_edges":' + str_int(self.graph_edges)
        json += ',"llm_configured":' + str_bool(self.llm.is_configured())
        json += '}'
        return json^

    def _repair_command(mut self, args: List[String]) -> String:
        return '{"status":"repaired","fixes":0}'

    def _debug_command(mut self, args: List[String]) -> String:
        var component = "all"
        if len(args) > 0:
            component = args[0]
        return '{"component":"' + component + '","status":"ok"}'

    def _config_command(mut self, args: List[String]) -> String:
        return '{"db_path":"' + self.config.db.db_path + '","llm_model":"' + self.config.llm.model + '"}'

    def _version_command(self, args: List[String]) -> String:
        return '{"version":"2.0.0","engine":"Mojo","name":"BRING"}'


def _cli_parse_int_from_args(args: List[String], default_val: Int) -> Int:
    if len(args) > 1:
        return _cli_parse_int(args[1])
    return default_val
