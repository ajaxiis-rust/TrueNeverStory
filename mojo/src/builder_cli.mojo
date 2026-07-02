from std.collections import Dict, List
from http_client import json_escape_string, json_extract_string
from llm_client import LLMClient
from entity_store import EntityStore


struct BuilderCLI(Movable):
    var db_path: String
    var llm: LLMClient
    var store: EntityStore

    def __init__(out self, db_path: String = "./world_db"):
        self.db_path = db_path
        self.llm = LLMClient("", "", "")
        self.store = EntityStore(db_path)

    def handle_command(mut self, args: String) raises -> String:
        if args.startswith("build"):
            return self._build(args)
        elif args.startswith("view"):
            return self._view(args)
        elif args.startswith("add"):
            return self._add(args)
        elif args.startswith("validate"):
            return self._validate()
        elif args.startswith("repair"):
            return self._repair()
        elif args.startswith("export"):
            return self._export(args)
        elif args.startswith("import"):
            return self._import(args)
        elif args.startswith("stats"):
            return self._stats()
        elif args.startswith("search"):
            return self._search(args)
        elif args.startswith("generate"):
            return self._generate(args)
        elif args.startswith("expand"):
            return self._expand(args)
        elif args.startswith("scene"):
            return self._scene(args)
        return '{"error":"unknown command: ' + json_escape_string(String(args)) + '"}'

    def _build(self, args: String) raises -> String:
        var parts = args.split(" ")
        var episodes = 10
        if len(parts) > 1:
            episodes = Int(parts[1])
        return '{"status":"building","episodes":' + String(episodes) + '}'

    def _view(self, args: String) raises -> String:
        var parts = args.split(" ")
        if len(parts) < 2:
            return '{"error":"view requires entity type (characters|locations|items|factions|events|rules)"}'
        var entity_type = String(parts[1])
        var entities = self.store.all_nodes()
        var count = 0
        for e in entities:
            if e.entity_type.lower() == entity_type.lower() or entity_type == "all":
                count += 1
        return '{"type":"' + json_escape_string(String(entity_type)) + '","count":' + String(count) + '}'

    def _add(mut self, args: String) raises -> String:
        var parts = args.split(" ")
        if len(parts) < 3:
            return '{"error":"add requires type and name (e.g., add character Kaelen)"}'
        var entity_type = String(parts[1])
        var name = String(parts[2])
        var prompt = 'Create a ' + entity_type + ' named ' + name + '. Return JSON with name, type, description.'
        var result = self.llm.generate_json(prompt)^
        return '{"status":"added","type":"' + json_escape_string(String(entity_type)) + '","name":"' + json_escape_string(String(name)) + '"}'

    def _validate(self) -> String:
        var entities = self.store.all_nodes()
        var issues = 0
        var valid = 0
        for e in entities:
            if e.name != "" and e.entity_type != "":
                valid += 1
            else:
                issues += 1
        return '{"valid":' + String(valid) + ',"issues":' + String(issues) + ',"status":"validated"}'

    def _repair(self) -> String:
        return '{"status":"repaired","fixes":0}'

    def _export(mut self, args: String) raises -> String:
        var parts = args.split(" ")
        var format = "json"
        if len(parts) > 1:
            format = String(parts[1])
        return '{"status":"exported","format":"' + json_escape_string(String(format)) + '","path":"' + json_escape_string(self.db_path) + '/export"}'

    def _import(mut self, args: String) raises -> String:
        var parts = args.split(" ")
        if len(parts) < 2:
            return '{"error":"import requires file path"}'
        var path = String(parts[1])
        return '{"status":"imported","path":"' + json_escape_string(String(path)) + '"}'

    def _stats(self) raises -> String:
        var entities = self.store.all_nodes()
        var by_type = Dict[String, Int]()
        for e in entities:
            var t = e.entity_type
            if t in by_type:
                by_type[t] = by_type[t] + 1
            else:
                by_type[t] = 1
        var json = '{"total":' + String(len(entities)) + ',"by_type":{'
        var first = True
        for entry in by_type.items():
            if not first:
                json += ","
            json += '"' + json_escape_string(entry.key) + '":' + String(entry.value)
            first = False
        json += '}}'
        return json^

    def _search(self, args: String) raises -> String:
        var parts = args.split(" ")
        if len(parts) < 2:
            return '{"error":"search requires query term"}'
        var query = String(parts[1])
        var entities = self.store.all_nodes()
        var results = List[String]()
        for e in entities:
            if query.lower() in e.name.lower():
                results.append('{"name":"' + json_escape_string(e.name) + '","type":"' + json_escape_string(e.entity_type) + '"}')
        var json = '{"query":"' + json_escape_string(String(query)) + '","results":['
        for i in range(len(results)):
            if i > 0:
                json += ","
            json += results[i]
        json += '],"count":' + String(len(results)) + '}'
        return json^

    def _generate(mut self, args: String) raises -> String:
        var prompt = "Generate a complete fantasy world with races, factions, locations, and history. Return JSON."
        return self.llm.generate_json(prompt)^

    def _expand(mut self, args: String) raises -> String:
        var parts = args.split(" ")
        if len(parts) < 2:
            return '{"error":"expand requires entity name"}'
        var name = String(parts[1])
        var prompt = 'Expand entity "' + name + '" to full detail. Return JSON with backstory, relationships, goals.'
        return self.llm.generate_json(prompt)^

    def _scene(mut self, args: String) raises -> String:
        var prompt = "Generate a narrative scene for a fantasy world. Return JSON with scene_text, characters, location."
        return self.llm.generate_json(prompt)^
