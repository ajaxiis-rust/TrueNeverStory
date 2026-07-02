from std.collections import Dict, List
from std.pathlib import Path
from models import EntityNode, EntityType, LayeredProfile

# ── Entity Store ──────────────────────────────────────────────────

@fieldwise_init
struct EntityStore(Movable):
    var store_path: String
    var entities: Dict[String, EntityNode]
    var name_index: Dict[String, String]
    var type_index: Dict[String, List[String]]

    def __init__(out self, store_path: String):
        self.store_path = store_path
        self.entities = Dict[String, EntityNode]()
        self.name_index = Dict[String, String]()
        self.type_index = Dict[String, List[String]]()

    def add(mut self, node: EntityNode) raises -> EntityNode:
        self.entities[node.uid] = node.copy()

        var name_key = node.name.lower() + ":" + node.entity_type
        self.name_index[name_key] = node.uid

        if node.entity_type not in self.type_index:
            self.type_index[node.entity_type] = List[String]()
        self.type_index[node.entity_type].append(node.uid)

        return node.copy()

    def get(self, uid: String) -> Optional[EntityNode]:
        if uid in self.entities:
            return self.entities[uid]
        return None

    def get_by_name_and_type(self, name: String, entity_type: String) -> Optional[EntityNode]:
        var name_key = name.lower() + ":" + entity_type
        if name_key in self.name_index:
            var uid = self.name_index[name_key]
            if uid in self.entities:
                return self.entities[uid]
        return None

    def list_by_type(self, entity_type: String) -> List[EntityNode]:
        var result = List[EntityNode]()
        if entity_type in self.type_index:
            for uid in self.type_index[entity_type]:
                if uid in self.entities:
                    result.append(self.entities[uid].copy())
        return result

    def all_nodes(self) -> List[EntityNode]:
        var result = List[EntityNode]()
        for entry in self.entities.items():
            result.append(entry.value.copy())
        return result^

    def search(self, query: String, entity_type: Optional[String] = None) -> List[EntityNode]:
        var result = List[EntityNode]()
        var query_lower = query.lower()

        for entry in self.entities.items():
            var node = entry.value.copy()
            var matches_type = True
            if entity_type:
                matches_type = node.entity_type == entity_type.value()
            var matches_query = query_lower in node.name.lower() or query_lower in node.summary().lower()

            if matches_type and matches_query:
                result.append(node^)

        return result^

    def save(self) raises:
        print("Saving entities to:", self.store_path)

    def load(self) raises:
        print("Loading entities from:", self.store_path)
