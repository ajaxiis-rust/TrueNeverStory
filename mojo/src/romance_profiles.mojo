from std.collections import Dict, List
from probability_models import (
    ProbabilityProfile,
    ProbabilityParameter,
    ParameterType,
)


def _make_romance_attraction() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["charisma"] = ProbabilityParameter(name="charisma", base_value=0.5, weight=0.25, param_type=ParameterType.dynamic(), dynamic_source="actor_charisma")
    params["compatibility"] = ProbabilityParameter(name="compatibility", base_value=0.5, weight=0.30, param_type=ParameterType.relationship(), dynamic_source="relationship_compatibility")
    params["mood"] = ProbabilityParameter(name="mood", base_value=0.5, weight=0.15, param_type=ParameterType.dynamic(), dynamic_source="target_mood_factor")
    params["environment"] = ProbabilityParameter(name="environment", base_value=0.0, weight=0.10, param_type=ParameterType.external(), dynamic_source="environment_modifier")
    params["past_affection"] = ProbabilityParameter(name="past_affection", base_value=0.3, weight=0.20, param_type=ParameterType.external(), dynamic_source="current_affection")
    return ProbabilityProfile(name="romance_attraction", parameters=params^, formula="logistic", difficulty_modifier=1.0, critical_success_threshold=0.85, critical_failure_threshold=0.15)


def _make_romance_confession() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["affection"] = ProbabilityParameter(name="affection", base_value=0.5, weight=0.35, param_type=ParameterType.external(), dynamic_source="current_affection")
    params["compatibility"] = ProbabilityParameter(name="compatibility", base_value=0.5, weight=0.25, param_type=ParameterType.relationship(), dynamic_source="compatibility")
    params["charisma"] = ProbabilityParameter(name="charisma", base_value=0.5, weight=0.15, param_type=ParameterType.dynamic(), dynamic_source="actor_charisma")
    params["location_romance"] = ProbabilityParameter(name="location_romance", base_value=0.0, weight=0.10, param_type=ParameterType.external(), dynamic_source="environment_modifier")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.15, param_type=ParameterType.external())
    return ProbabilityProfile(name="romance_confession", parameters=params^, formula="logistic", difficulty_modifier=1.2, critical_success_threshold=0.80, critical_failure_threshold=0.20)


def _make_romance_date() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["affection"] = ProbabilityParameter(name="affection", base_value=0.5, weight=0.30, param_type=ParameterType.external(), dynamic_source="current_affection")
    params["charisma"] = ProbabilityParameter(name="charisma", base_value=0.5, weight=0.20, param_type=ParameterType.dynamic(), dynamic_source="actor_charisma")
    params["compatibility"] = ProbabilityParameter(name="compatibility", base_value=0.5, weight=0.20, param_type=ParameterType.relationship(), dynamic_source="compatibility")
    params["location_romance"] = ProbabilityParameter(name="location_romance", base_value=0.0, weight=0.15, param_type=ParameterType.external(), dynamic_source="environment_modifier")
    params["timing"] = ProbabilityParameter(name="timing", base_value=0.5, weight=0.15, param_type=ParameterType.external(), dynamic_source="time_of_day_modifier")
    return ProbabilityProfile(name="romance_date", parameters=params^, formula="logistic", difficulty_modifier=1.0, critical_success_threshold=0.85, critical_failure_threshold=0.15)


def _make_romance_proposal() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["affection"] = ProbabilityParameter(name="affection", base_value=0.7, weight=0.35, param_type=ParameterType.external(), dynamic_source="current_affection")
    params["compatibility"] = ProbabilityParameter(name="compatibility", base_value=0.6, weight=0.25, param_type=ParameterType.relationship(), dynamic_source="compatibility")
    params["charisma"] = ProbabilityParameter(name="charisma", base_value=0.5, weight=0.10, param_type=ParameterType.dynamic(), dynamic_source="actor_charisma")
    params["relationship_duration"] = ProbabilityParameter(name="relationship_duration", base_value=0.5, weight=0.15, param_type=ParameterType.external(), dynamic_source="relationship_duration")
    params["family_approval"] = ProbabilityParameter(name="family_approval", base_value=0.5, weight=0.15, param_type=ParameterType.external(), dynamic_source="family_approval")
    return ProbabilityProfile(name="romance_proposal", parameters=params^, formula="logistic", difficulty_modifier=1.3, critical_success_threshold=0.75, critical_failure_threshold=0.25)


def _make_romance_breakup() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["affection"] = ProbabilityParameter(name="affection", base_value=0.5, weight=0.35, param_type=ParameterType.external(), dynamic_source="current_affection")
    params["conflict_level"] = ProbabilityParameter(name="conflict_level", base_value=0.3, weight=0.25, param_type=ParameterType.external(), dynamic_source="conflict_level")
    params["external_pressure"] = ProbabilityParameter(name="external_pressure", base_value=0.0, weight=0.20, param_type=ParameterType.external(), dynamic_source="external_pressure")
    params["luck"] = ProbabilityParameter(name="luck", base_value=0.5, weight=0.20, param_type=ParameterType.external())
    return ProbabilityProfile(name="romance_breakup", parameters=params^, formula="sum_weighted", difficulty_modifier=0.8, critical_success_threshold=0.25, critical_failure_threshold=0.75)


def _make_romance_kiss() -> ProbabilityProfile:
    var params = Dict[String, ProbabilityParameter]()
    params["affection"] = ProbabilityParameter(name="affection", base_value=0.6, weight=0.35, param_type=ParameterType.external(), dynamic_source="current_affection")
    params["mood"] = ProbabilityParameter(name="mood", base_value=0.5, weight=0.20, param_type=ParameterType.dynamic(), dynamic_source="target_mood_factor")
    params["charisma"] = ProbabilityParameter(name="charisma", base_value=0.5, weight=0.15, param_type=ParameterType.dynamic(), dynamic_source="actor_charisma")
    params["environment"] = ProbabilityParameter(name="environment", base_value=0.0, weight=0.15, param_type=ParameterType.external(), dynamic_source="environment_modifier")
    params["past_moments"] = ProbabilityParameter(name="past_moments", base_value=0.3, weight=0.15, param_type=ParameterType.external(), dynamic_source="past_positive_interactions")
    return ProbabilityProfile(name="romance_kiss", parameters=params^, formula="logistic", difficulty_modifier=1.1, critical_success_threshold=0.85, critical_failure_threshold=0.15)


def get_romance_profile(name: String) raises -> ProbabilityProfile:
    var lower = name.lower()
    if lower == "romance_attraction" or lower == "attraction":
        return _make_romance_attraction()
    if lower == "romance_confession" or lower == "confess" or lower == "confession":
        return _make_romance_confession()
    if lower == "romance_date" or lower == "date":
        return _make_romance_date()
    if lower == "romance_proposal" or lower == "proposal" or lower == "propose":
        return _make_romance_proposal()
    if lower == "romance_breakup" or lower == "breakup":
        return _make_romance_breakup()
    if lower == "romance_kiss" or lower == "kiss":
        return _make_romance_kiss()
    return _make_romance_attraction()


def list_romance_profiles() -> List[String]:
    var result = List[String]()
    result.append("romance_attraction")
    result.append("attraction")
    result.append("romance_confession")
    result.append("confess")
    result.append("confession")
    result.append("romance_date")
    result.append("date")
    result.append("romance_proposal")
    result.append("proposal")
    result.append("propose")
    result.append("romance_breakup")
    result.append("breakup")
    result.append("romance_kiss")
    result.append("kiss")
    return result^
