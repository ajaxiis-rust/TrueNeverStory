from std.collections import Dict, List
from probability_models import (
    ProbabilityProfile,
    ProbabilityParameter,
    ParameterType,
)


def _make_combat() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["combat_skill"] = ProbabilityParameter(name="combat_skill", base_value=0.5, weight=0.30, param_type=ParameterType.dynamic(), dynamic_source="actor_combat_skill")
    params["health_factor"] = ProbabilityParameter(name="health_factor", base_value=1.0, weight=0.15, param_type=ParameterType.dynamic(), dynamic_source="actor_health")
    params["weapon_proficiency"] = ProbabilityParameter(name="weapon_proficiency", base_value=0.0, weight=0.10, param_type=ParameterType.dynamic(), dynamic_source="actor_weapon_proficiency")
    params["target_defense"] = ProbabilityParameter(name="target_defense", base_value=0.5, weight=0.20, param_type=ParameterType.dynamic(), dynamic_source="target_defense")
    params["terrain_modifier"] = ProbabilityParameter(name="terrain_modifier", base_value=0.0, weight=0.10, param_type=ParameterType.external(), dynamic_source="environment_terrain_mod")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.15, param_type=ParameterType.external())
    return ProbabilityProfile(name="combat", parameters=params^, formula="sum_weighted", difficulty_modifier=1.0, critical_success_threshold=0.90, critical_failure_threshold=0.10)


def _make_persuasion() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["charisma"] = ProbabilityParameter(name="charisma", base_value=0.5, weight=0.25, param_type=ParameterType.dynamic(), dynamic_source="actor_charisma")
    params["relationship"] = ProbabilityParameter(name="relationship", base_value=0.3, weight=0.25, param_type=ParameterType.relationship(), dynamic_source="relationship_strength")
    params["argument_quality"] = ProbabilityParameter(name="argument_quality", base_value=0.5, weight=0.15, param_type=ParameterType.external(), dynamic_source="extra_argument_quality")
    params["target_mood"] = ProbabilityParameter(name="target_mood", base_value=0.5, weight=0.15, param_type=ParameterType.dynamic(), dynamic_source="target_mood_factor")
    params["target_resistance"] = ProbabilityParameter(name="target_resistance", base_value=0.5, weight=0.10, param_type=ParameterType.dynamic(), dynamic_source="target_resistance")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.10, param_type=ParameterType.external())
    return ProbabilityProfile(name="persuasion", parameters=params^, formula="logistic", difficulty_modifier=0.9, critical_success_threshold=0.85, critical_failure_threshold=0.15)


def _make_stealth() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["dexterity"] = ProbabilityParameter(name="dexterity", base_value=0.5, weight=0.30, param_type=ParameterType.dynamic(), dynamic_source="actor_dexterity")
    params["light_level"] = ProbabilityParameter(name="light_level", base_value=0.5, weight=0.20, param_type=ParameterType.external(), dynamic_source="environment_light")
    params["noise_level"] = ProbabilityParameter(name="noise_level", base_value=0.5, weight=0.15, param_type=ParameterType.external(), dynamic_source="environment_noise")
    params["actor_mood"] = ProbabilityParameter(name="actor_mood", base_value=0.5, weight=0.10, param_type=ParameterType.dynamic(), dynamic_source="actor_mood_factor")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.25, param_type=ParameterType.external())
    return ProbabilityProfile(name="stealth", parameters=params^, formula="product", difficulty_modifier=1.0, critical_success_threshold=0.85, critical_failure_threshold=0.15)


def _make_romance() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["charisma"] = ProbabilityParameter(name="charisma", base_value=0.5, weight=0.25, param_type=ParameterType.dynamic(), dynamic_source="actor_charisma")
    params["relationship"] = ProbabilityParameter(name="relationship", base_value=0.5, weight=0.35, param_type=ParameterType.relationship(), dynamic_source="relationship_strength")
    params["romantic_setting"] = ProbabilityParameter(name="romantic_setting", base_value=0.0, weight=0.15, param_type=ParameterType.external(), dynamic_source="environment_modifier")
    params["actor_mood"] = ProbabilityParameter(name="actor_mood", base_value=0.5, weight=0.10, param_type=ParameterType.dynamic(), dynamic_source="actor_mood_factor")
    params["target_mood"] = ProbabilityParameter(name="target_mood", base_value=0.5, weight=0.10, param_type=ParameterType.dynamic(), dynamic_source="target_mood_factor")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.05, param_type=ParameterType.external())
    return ProbabilityProfile(name="romance", parameters=params^, formula="sum_weighted", difficulty_modifier=1.1, critical_success_threshold=0.90, critical_failure_threshold=0.10)


def _make_investigation() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["intelligence"] = ProbabilityParameter(name="intelligence", base_value=0.5, weight=0.35, param_type=ParameterType.dynamic(), dynamic_source="actor_intelligence")
    params["perception"] = ProbabilityParameter(name="perception", base_value=0.5, weight=0.25, param_type=ParameterType.dynamic(), dynamic_source="actor_wisdom")
    params["environment_light"] = ProbabilityParameter(name="environment_light", base_value=0.5, weight=0.15, param_type=ParameterType.external(), dynamic_source="environment_light")
    params["time_pressure"] = ProbabilityParameter(name="time_pressure", base_value=0.5, weight=0.10, param_type=ParameterType.external(), dynamic_source="extra_time_pressure")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.15, param_type=ParameterType.external())
    return ProbabilityProfile(name="investigation", parameters=params^, formula="sum_weighted", difficulty_modifier=1.0, critical_success_threshold=0.85, critical_failure_threshold=0.15)


def _make_athletics() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["strength"] = ProbabilityParameter(name="strength", base_value=0.5, weight=0.35, param_type=ParameterType.dynamic(), dynamic_source="actor_strength")
    params["health"] = ProbabilityParameter(name="health", base_value=0.5, weight=0.20, param_type=ParameterType.dynamic(), dynamic_source="actor_health")
    params["terrain"] = ProbabilityParameter(name="terrain", base_value=0.0, weight=0.20, param_type=ParameterType.external(), dynamic_source="environment_terrain_mod")
    params["actor_mood"] = ProbabilityParameter(name="actor_mood", base_value=0.5, weight=0.10, param_type=ParameterType.dynamic(), dynamic_source="actor_mood_factor")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.15, param_type=ParameterType.external())
    return ProbabilityProfile(name="athletics", parameters=params^, formula="sum_weighted", difficulty_modifier=1.0, critical_success_threshold=0.85, critical_failure_threshold=0.15)


def _make_deception() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["charisma"] = ProbabilityParameter(name="charisma", base_value=0.5, weight=0.30, param_type=ParameterType.dynamic(), dynamic_source="actor_charisma")
    params["target_wisdom"] = ProbabilityParameter(name="target_wisdom", base_value=0.5, weight=0.20, param_type=ParameterType.dynamic(), dynamic_source="target_resistance")
    params["relationship"] = ProbabilityParameter(name="relationship", base_value=0.3, weight=0.15, param_type=ParameterType.relationship(), dynamic_source="relationship_strength")
    params["lie_quality"] = ProbabilityParameter(name="lie_quality", base_value=0.5, weight=0.15, param_type=ParameterType.external(), dynamic_source="extra_lie_quality")
    params["actor_mood"] = ProbabilityParameter(name="actor_mood", base_value=0.5, weight=0.05, param_type=ParameterType.dynamic(), dynamic_source="actor_mood_factor")
    params["target_mood"] = ProbabilityParameter(name="target_mood", base_value=0.5, weight=0.10, param_type=ParameterType.dynamic(), dynamic_source="target_mood_factor")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.05, param_type=ParameterType.external())
    return ProbabilityProfile(name="deception", parameters=params^, formula="logistic", difficulty_modifier=1.2, critical_success_threshold=0.85, critical_failure_threshold=0.15)


def _make_intimidation() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["strength"] = ProbabilityParameter(name="strength", base_value=0.5, weight=0.25, param_type=ParameterType.dynamic(), dynamic_source="actor_strength")
    params["charisma"] = ProbabilityParameter(name="charisma", base_value=0.5, weight=0.20, param_type=ParameterType.dynamic(), dynamic_source="actor_charisma")
    params["target_wisdom"] = ProbabilityParameter(name="target_wisdom", base_value=0.5, weight=0.20, param_type=ParameterType.dynamic(), dynamic_source="target_resistance")
    params["actor_reputation"] = ProbabilityParameter(name="actor_reputation", base_value=0.5, weight=0.15, param_type=ParameterType.external(), dynamic_source="extra_reputation")
    params["target_mood"] = ProbabilityParameter(name="target_mood", base_value=0.5, weight=0.10, param_type=ParameterType.dynamic(), dynamic_source="target_mood_factor")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.10, param_type=ParameterType.external())
    return ProbabilityProfile(name="intimidation", parameters=params^, formula="sum_weighted", difficulty_modifier=1.1, critical_success_threshold=0.85, critical_failure_threshold=0.15)


def _make_generic() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["skill"] = ProbabilityParameter(name="skill", base_value=0.5, weight=0.60, param_type=ParameterType.dynamic(), dynamic_source="extra.skill")
    params["difficulty"] = ProbabilityParameter(name="difficulty", base_value=0.5, weight=0.20, param_type=ParameterType.external(), dynamic_source="extra.difficulty")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.20, param_type=ParameterType.external())
    return ProbabilityProfile(name="generic", parameters=params^, formula="sum_weighted", difficulty_modifier=1.0, critical_success_threshold=0.90, critical_failure_threshold=0.10)


def _make_birth_race() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["world_rarity"] = ProbabilityParameter(name="world_rarity", base_value=0.5, weight=0.40, param_type=ParameterType.external(), dynamic_source="race_rarity")
    params["user_hint"] = ProbabilityParameter(name="user_hint", base_value=0.0, weight=0.30, param_type=ParameterType.external(), dynamic_source="hint_weight")
    params["demographic_weight"] = ProbabilityParameter(name="demographic_weight", base_value=0.3, weight=0.20, param_type=ParameterType.external(), dynamic_source="race_demographic")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.10, param_type=ParameterType.external())
    return ProbabilityProfile(name="birth_race", parameters=params^, formula="sum_weighted", difficulty_modifier=1.0, critical_success_threshold=0.85, critical_failure_threshold=0.15)


def _make_birth_social_class() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["demographic_weight"] = ProbabilityParameter(name="demographic_weight", base_value=0.3, weight=0.35, param_type=ParameterType.external(), dynamic_source="class_demographic")
    params["parental_influence"] = ProbabilityParameter(name="parental_influence", base_value=0.5, weight=0.25, param_type=ParameterType.external(), dynamic_source="parent_class")
    params["user_hint"] = ProbabilityParameter(name="user_hint", base_value=0.0, weight=0.25, param_type=ParameterType.external(), dynamic_source="hint_weight")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.15, param_type=ParameterType.external())
    return ProbabilityProfile(name="birth_social_class", parameters=params^, formula="logistic", difficulty_modifier=0.9, critical_success_threshold=0.80, critical_failure_threshold=0.20)


def _make_birth_magic_affinity() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["world_magic_density"] = ProbabilityParameter(name="world_magic_density", base_value=0.5, weight=0.30, param_type=ParameterType.external(), dynamic_source="magic_density")
    params["bloodline_magic"] = ProbabilityParameter(name="bloodline_magic", base_value=0.3, weight=0.35, param_type=ParameterType.external(), dynamic_source="parent_magic_affinity")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.35, param_type=ParameterType.external())
    return ProbabilityProfile(name="birth_magic_affinity", parameters=params^, formula="sum_weighted", difficulty_modifier=1.0, critical_success_threshold=0.85, critical_failure_threshold=0.15)


def _make_birth_talent() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["base_chance"] = ProbabilityParameter(name="base_chance", base_value=0.3, weight=0.40, param_type=ParameterType.external())
    params["social_class_bonus"] = ProbabilityParameter(name="social_class_bonus", base_value=0.0, weight=0.30, param_type=ParameterType.external(), dynamic_source="class_education_bonus")
    params["race_bonus"] = ProbabilityParameter(name="race_bonus", base_value=0.0, weight=0.20, param_type=ParameterType.external(), dynamic_source="race_talent_bonus")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.10, param_type=ParameterType.external())
    return ProbabilityProfile(name="birth_talent", parameters=params^, formula="logistic", difficulty_modifier=1.0, critical_success_threshold=0.90, critical_failure_threshold=0.10)


# ── Profile Registry ────────────────────────────────────────────


def get_profile(name: String) raises -> ProbabilityProfile:
    var lower = name.lower()
    if lower == "combat":
        return _make_combat()
    if lower == "persuasion" or lower == "persuade":
        return _make_persuasion()
    if lower == "stealth" or lower == "sneak":
        return _make_stealth()
    if lower == "romance":
        return _make_romance()
    if lower == "investigation" or lower == "investigate" or lower == "search":
        return _make_investigation()
    if lower == "athletics" or lower == "climb" or lower == "swim":
        return _make_athletics()
    if lower == "deception" or lower == "lie" or lower == "bluff":
        return _make_deception()
    if lower == "intimidation" or lower == "intimidate":
        return _make_intimidation()
    if lower == "birth_race":
        return _make_birth_race()
    if lower == "birth_social_class":
        return _make_birth_social_class()
    if lower == "birth_magic_affinity":
        return _make_birth_magic_affinity()
    if lower == "birth_talent":
        return _make_birth_talent()
    return _make_generic()


def list_profiles() -> List[String]:
    var result = List[String]()
    result.append("combat")
    result.append("persuasion")
    result.append("persuade")
    result.append("stealth")
    result.append("sneak")
    result.append("romance")
    result.append("investigation")
    result.append("investigate")
    result.append("search")
    result.append("athletics")
    result.append("climb")
    result.append("swim")
    result.append("deception")
    result.append("lie")
    result.append("bluff")
    result.append("intimidation")
    result.append("intimidate")
    result.append("generic")
    result.append("default")
    result.append("birth_race")
    result.append("birth_social_class")
    result.append("birth_magic_affinity")
    result.append("birth_talent")
    return result^


def register_profile(profile: ProbabilityProfile):
    pass


def _build_profiles() -> Dict[String, ProbabilityProfile]:
    var profiles = Dict[String, ProbabilityProfile]()
    profiles["combat"] = _make_combat()
    profiles["persuasion"] = _make_persuasion()
    profiles["persuade"] = _make_persuasion()
    profiles["stealth"] = _make_stealth()
    profiles["sneak"] = _make_stealth()
    profiles["romance"] = _make_romance()
    profiles["investigation"] = _make_investigation()
    profiles["investigate"] = _make_investigation()
    profiles["search"] = _make_investigation()
    profiles["athletics"] = _make_athletics()
    profiles["climb"] = _make_athletics()
    profiles["swim"] = _make_athletics()
    profiles["deception"] = _make_deception()
    profiles["lie"] = _make_deception()
    profiles["bluff"] = _make_deception()
    profiles["intimidation"] = _make_intimidation()
    profiles["intimidate"] = _make_intimidation()
    profiles["generic"] = _make_generic()
    profiles["default"] = _make_generic()
    profiles["birth_race"] = _make_birth_race()
    profiles["birth_social_class"] = _make_birth_social_class()
    profiles["birth_magic_affinity"] = _make_birth_magic_affinity()
    profiles["birth_talent"] = _make_birth_talent()
    return profiles^
