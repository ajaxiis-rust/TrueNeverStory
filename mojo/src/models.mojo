from std.collections import Dict, List

# ── Entity Type ───────────────────────────────────────────────────

@fieldwise_init
struct EntityType(Copyable, Movable, Writable):
    var value: String

    def __str__(self) -> String:
        return self.value

    @staticmethod
    def character() -> EntityType:
        return EntityType("Character")

    @staticmethod
    def faction() -> EntityType:
        return EntityType("Faction")

    @staticmethod
    def location() -> EntityType:
        return EntityType("Location")

    @staticmethod
    def item() -> EntityType:
        return EntityType("Item")

    @staticmethod
    def event() -> EntityType:
        return EntityType("Event")

    @staticmethod
    def world_rule() -> EntityType:
        return EntityType("WorldRule")

    @staticmethod
    def race() -> EntityType:
        return EntityType("Race")

    @staticmethod
    def unknown() -> EntityType:
        return EntityType("Unknown")

    @staticmethod
    def from_string(s: String) -> EntityType:
        if s == "Character":
            return EntityType.character()
        elif s == "Faction":
            return EntityType.faction()
        elif s == "Location":
            return EntityType.location()
        elif s == "Item":
            return EntityType.item()
        elif s == "Event":
            return EntityType.event()
        elif s == "WorldRule":
            return EntityType.world_rule()
        elif s == "Race":
            return EntityType.race()
        else:
            return EntityType.unknown()

    def write_to(self, mut writer: Some[Writer]):
        writer.write("EntityType(", self.value, ")")


# ── Entity Node ───────────────────────────────────────────────────

@fieldwise_init
struct EntityNode(Copyable, Movable, Writable):
    var uid: String
    var name: String
    var entity_type: String
    var group_id: String
    var created_at: Float64
    var updated_at: Float64

    def __init__(out self, uid: String, name: String, entity_type: String):
        self.uid = uid
        self.name = name
        self.entity_type = entity_type
        self.group_id = ""
        self.created_at = 0.0
        self.updated_at = 0.0

    def etype(self) -> EntityType:
        return EntityType.from_string(self.entity_type)

    def summary(self) -> String:
        return self.name + " (" + self.entity_type + ")"

    def write_to(self, mut writer: Some[Writer]):
        writer.write("EntityNode(uid=", self.uid, ", name=", self.name, ", type=", self.entity_type, ")")


# ── Relationship ──────────────────────────────────────────────────

@fieldwise_init
struct Relationship(Copyable, Movable, Writable):
    var source_uid: String
    var target_uid: String
    var rel_type: String
    var strength: Float64
    var source_layer: String

    def __init__(out self, source_uid: String, target_uid: String, rel_type: String):
        self.source_uid = source_uid
        self.target_uid = target_uid
        self.rel_type = rel_type
        self.strength = 0.0
        self.source_layer = "l1"

    def write_to(self, mut writer: Some[Writer]):
        writer.write("Relationship(", self.source_uid, " -> ", self.target_uid, ": ", self.rel_type, ")")


# ── World Frame ───────────────────────────────────────────────────

@fieldwise_init
struct WorldFrame(Copyable, Movable, Writable):
    var world_name: String
    var world_rules: List[String]
    var characters: List[String]
    var locations: List[String]

    def __init__(out self):
        self.world_name = ""
        self.world_rules = List[String]()
        self.characters = List[String]()
        self.locations = List[String]()

    def get_rules_text(self) -> String:
        var result = String("")
        for rule in self.world_rules:
            result += "- " + rule + "\n"
        return result

    def get_entity_names(self) -> List[String]:
        var names = List[String]()
        for rule in self.world_rules:
            names.append(rule)
        for char in self.characters:
            names.append(char)
        for loc in self.locations:
            names.append(loc)
        return names

    def write_to(self, mut writer: Some[Writer]):
        writer.write("WorldFrame(name=", self.world_name, ")")
