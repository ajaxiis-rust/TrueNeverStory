from std.collections import Dict, List
from llm_client import LLMClient
from http_client import json_escape_string, json_extract_string
from probability_engine import ProbabilityEngine
from probability_profiles import get_profile
from romance_models import RomanceStatus, RomanceProgression, RelationshipMemory


struct SocialClass(Movable):
    var value: String
    def __init__(out self, val: String = "commoner"):
        self.value = val
    @staticmethod
    def slave() -> SocialClass:
        return SocialClass("slave")
    @staticmethod
    def peasant() -> SocialClass:
        return SocialClass("peasant")
    @staticmethod
    def commoner() -> SocialClass:
        return SocialClass("commoner")
    @staticmethod
    def merchant() -> SocialClass:
        return SocialClass("merchant")
    @staticmethod
    def nobility() -> SocialClass:
        return SocialClass("nobility")
    @staticmethod
    def royalty() -> SocialClass:
        return SocialClass("royalty")


struct BirthCircumstance(Movable):
    var value: String
    def __init__(out self, val: String = "normal"):
        self.value = val
    @staticmethod
    def normal() -> BirthCircumstance:
        return BirthCircumstance("normal")
    @staticmethod
    def prophecy() -> BirthCircumstance:
        return BirthCircumstance("prophecy")
    @staticmethod
    def omen() -> BirthCircumstance:
        return BirthCircumstance("omen")
    @staticmethod
    def tragedy() -> BirthCircumstance:
        return BirthCircumstance("tragedy")
    @staticmethod
    def miracle() -> BirthCircumstance:
        return BirthCircumstance("miracle")
    @staticmethod
    def secret() -> BirthCircumstance:
        return BirthCircumstance("secret")


struct InnateSkill(Movable):
    var name: String
    var base_value: Float64
    var cap: Float64
    var growth_rate: Float64

    def __init__(out self, name: String, base_value: Float64 = 0.5, cap: Float64 = 1.0, growth_rate: Float64 = 0.01):
        self.name = name
        self.base_value = base_value
        self.cap = cap
        self.growth_rate = growth_rate

    def to_json(self) -> String:
        return '{"name":"' + json_escape_string(self.name) + '","base_value":' + String(self.base_value) + ',"cap":' + String(self.cap) + ',"growth_rate":' + String(self.growth_rate) + '}'


struct FamilyMember(Movable):
    var name: String
    var relation: String
    var age: Int
    var occupation: String
    var alive: Bool

    def __init__(out self, name: String, relation: String, age: Int = 30, occupation: String = "", alive: Bool = True):
        self.name = name
        self.relation = relation
        self.age = age
        self.occupation = occupation
        self.alive = alive

    def to_json(self) -> String:
        return '{"name":"' + json_escape_string(self.name) + '","relation":"' + json_escape_string(self.relation) + '","age":' + String(self.age) + ',"occupation":"' + json_escape_string(self.occupation) + '","alive":' + ("true" if self.alive else "false") + '}'


struct FamilyTree(Movable):
    var father: FamilyMember
    var mother: FamilyMember
    var siblings: List[FamilyMember]

    def __init__(out self):
        self.father = FamilyMember("Unknown", "father")
        self.mother = FamilyMember("Unknown", "mother")
        self.siblings = List[FamilyMember]()

    def to_json(self) -> String:
        var json = '{"father":' + self.father.to_json()
        json += ',"mother":' + self.mother.to_json()
        json += ',"siblings":['
        for i in range(len(self.siblings)):
            if i > 0:
                json += ","
            json += self.siblings[i].to_json()
        json += ']}'
        return json^


struct BirthResult(Movable):
    var character_name: String
    var race: String
    var gender: String
    var social_class: String
    var birthplace: String
    var magic_affinity: String
    var birth_circumstance: String
    var opening_narrative: String
    var innate_skills: List[String]
    var family_tree: FamilyTree

    def __init__(out self):
        self.character_name = "Newborn"
        self.race = "human"
        self.gender = "male"
        self.social_class = "commoner"
        self.birthplace = "unknown"
        self.magic_affinity = ""
        self.birth_circumstance = "normal"
        self.opening_narrative = "A child is born."
        self.innate_skills = List[String]()
        self.family_tree = FamilyTree()

    def to_json(self) -> String:
        var json = '{"character_name":"' + json_escape_string(self.character_name) + '"'
        json += ',"race":"' + json_escape_string(self.race) + '"'
        json += ',"gender":"' + json_escape_string(self.gender) + '"'
        json += ',"social_class":"' + json_escape_string(self.social_class) + '"'
        json += ',"birthplace":"' + json_escape_string(self.birthplace) + '"'
        json += ',"magic_affinity":"' + json_escape_string(self.magic_affinity) + '"'
        json += ',"birth_circumstance":"' + json_escape_string(self.birth_circumstance) + '"'
        json += ',"opening_narrative":"' + json_escape_string(self.opening_narrative) + '"'
        json += ',"innate_skills":['
        for i in range(len(self.innate_skills)):
            if i > 0:
                json += ","
            json += '"' + json_escape_string(self.innate_skills[i]) + '"'
        json += '],"family_tree":' + self.family_tree.to_json()
        json += '}'
        return json^


struct BirthGenerator(Movable):
    var llm: LLMClient
    var prob_engine: ProbabilityEngine

    def __init__(out self):
        self.llm = LLMClient("", "", "")
        self.prob_engine = ProbabilityEngine()

    def generate(mut self, user_hints: String = "", isekai: Bool = False, starting_age: Int = 5) raises -> String:
        var prompt = 'Generate a fantasy character birth'
        if isekai:
            prompt += ' (isekai/reincarnation)'
        prompt += ' with these details:\n'
        if user_hints != "":
            prompt += "User hints: " + user_hints + "\n"
        prompt += """Return JSON with:
{
    "character_name": "generated name",
    "race": "race name",
    "gender": "male|female|non_binary",
    "social_class": "peasant|commoner|merchant|nobility|royalty",
    "birthplace": "location name",
    "magic_affinity": "element name or null",
    "birth_circumstance": "normal|prophecy|omen|tragedy|miracle|secret",
    "innate_skills": [{"name": "skill_name", "base_value": 0.5, "cap": 1.0, "growth_rate": 0.01}],
    "opening_narrative": "2-3 paragraph opening narrative",
    "father": {"name": "name", "age": 35, "occupation": "occupation", "alive": true},
    "mother": {"name": "name", "age": 32, "occupation": "occupation", "alive": true},
    "siblings": [{"name": "name", "relation": "brother|sister", "age": 12}]
}
Return ONLY the JSON object."""
        return self.llm.generate_json(prompt)^

    def generate_isekai(mut self, previous_life: String = "", hints: String = "") raises -> String:
        var prompt = 'Generate an isekai/reincarnation birth.\n'
        if previous_life != "":
            prompt += "Previous life: " + previous_life + "\n"
        if hints != "":
            prompt += "Hints: " + hints + "\n"
        prompt += "Return JSON with character_name, race, social_class, birthplace, magic_affinity, opening_narrative, memories_of_previous_life."
        return self.llm.generate_json(prompt)^

    def generate_family_tree(mut self, character_name: String, race: String, social_class: String) raises -> String:
        var prompt = 'Generate a family tree for ' + character_name + ' (race: ' + race + ', class: ' + social_class + ').\n'
        prompt += "Return JSON with father, mother, siblings, grandparents. Include names, ages, occupations, personalities."
        return self.llm.generate_json(prompt)^

    def apply_birth(self, birth_json: String) raises -> String:
        var name = json_extract_string(birth_json, "character_name")
        if name == "":
            name = "Newborn"
        return '{"character_name":"' + json_escape_string(name) + '","status":"applied"}'


struct BirthScenario(Movable):
    var llm: LLMClient

    def __init__(out self):
        self.llm = LLMClient("", "", "")

    def generate_and_apply(mut self, user_hints: String = "", isekai: Bool = False, starting_age: Int = 5) raises -> String:
        var prompt = 'Generate a fantasy character birth'
        if isekai:
            prompt += ' (isekai/reincarnation)'
        prompt += ' with these details:\n'
        if user_hints != "":
            prompt += "User hints: " + user_hints + "\n"
        prompt += """Return JSON with:
{
    "character_name": "generated name",
    "race": "race name",
    "social_class": "peasant|commoner|merchant|nobility|royalty",
    "birthplace": "location name",
    "magic_affinity": "element name or null",
    "innate_skills": ["skill1", "skill2"],
    "birth_circumstance": "normal|prophecy|omen|tragedy|miracle|secret",
    "opening_narrative": "2-3 paragraph opening narrative"
}
Return ONLY the JSON object."""
        var birth_json = self.llm.generate_json(prompt)^
        return birth_json
