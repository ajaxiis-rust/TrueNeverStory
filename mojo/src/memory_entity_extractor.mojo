from std.collections import Dict, List


struct EntityExtractor(Movable):
    var canonical_map: Dict[String, String]
    var entity_attributes: Dict[String, String]

    def __init__(out self):
        self.canonical_map = Dict[String, String]()
        self.entity_attributes = Dict[String, String]()

    def extract_from_text(self, text: String, source_id: String) raises -> String:
        return "[]"

    def resolve_entity(mut self, name: String, etype: String, attrs: String) raises -> String:
        var lower_name = name.lower()
        if lower_name in self.canonical_map:
            return self.canonical_map[lower_name]
        self.canonical_map[lower_name] = name
        self.entity_attributes[name] = attrs
        return name

    def update_entity_attributes(mut self, entity_uid: String, attributes: String):
        self.entity_attributes[entity_uid] = attributes

    def get_entity_info(self, entity_uid: String) raises -> String:
        if entity_uid in self.entity_attributes:
            return self.entity_attributes[entity_uid]
        return "{}"

    def get_canonical_name(self, name: String) raises -> String:
        var lower = name.lower()
        if lower in self.canonical_map:
            return self.canonical_map[lower]
        return name
