from std.collections import Dict, List
from std.math import exp, sqrt, min, max
from std.random import random_float64
from probability_expression import safe_eval
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

# ── Probability Engine ────────────────────────────────────────────

@fieldwise_init
struct ProbabilityEngine(Movable):
    var modifiers: Dict[String, List[ProbabilityModifier]]
    var global_luck: Float64

    def __init__(out self):
        self.modifiers = Dict[String, List[ProbabilityModifier]]()
        self.global_luck = 0.5

    def set_global_luck(mut self, luck: Float64):
        self.global_luck = max(0.0, min(1.0, luck))

    # ── Modifier Management ───────────────────────────────────────

    def apply_modifier(mut self, entity_uid: String, modifier: ProbabilityModifier) raises:
        if entity_uid not in self.modifiers:
            self.modifiers[entity_uid] = List[ProbabilityModifier]()
        self.modifiers[entity_uid].append(modifier)

    def remove_modifier(mut self, entity_uid: String, parameter_name: String) raises -> Bool:
        if entity_uid not in self.modifiers:
            return False

        var original_count = len(self.modifiers[entity_uid])
        var new_list = List[ProbabilityModifier]()
        for m in self.modifiers[entity_uid]:
            if m.parameter_name != parameter_name:
                new_list.append(m)
        self.modifiers[entity_uid] = new_list^
        return len(self.modifiers[entity_uid]) < original_count

    def remove_expired_modifiers(mut self, entity_uid: String, current_time: Float64) raises:
        if entity_uid not in self.modifiers:
            return

        var new_list = List[ProbabilityModifier]()
        for m in self.modifiers[entity_uid]:
            if not m.is_expired(current_time):
                new_list.append(m)
        self.modifiers[entity_uid] = new_list^

    def get_active_modifiers(self, entity_uid: String, param_name: String) raises -> List[ProbabilityModifier]:
        if entity_uid not in self.modifiers:
            return List[ProbabilityModifier]()

        var relevant = List[ProbabilityModifier]()
        for m in self.modifiers[entity_uid]:
            if m.parameter_name == param_name and not m.is_expired(0.0):
                relevant.append(m)

        if len(relevant) == 0:
            return List[ProbabilityModifier]()

        # Group by stacking rule
        var by_stack = Dict[String, List[ProbabilityModifier]]()
        for m in relevant:
            var rule = m.stacking_rule.value
            if rule not in by_stack:
                by_stack[rule] = List[ProbabilityModifier]()
            by_stack[rule].append(m)

        var result = List[ProbabilityModifier]()
        for entry in by_stack.items():
            var rule = entry.key
            var group = List[ProbabilityModifier]()
            for item in entry.value:
                group.append(item.copy())
            if rule == "stack":
                for m in group:
                    result.append(m)
            elif rule == "highest":
                if len(group) > 0:
                    var best = group[0]
                    for m in group:
                        if m.value > best.value:
                            best = m
                    result.append(best)
            elif rule == "lowest":
                if len(group) > 0:
                    var worst = group[0]
                    for m in group:
                        if m.value < worst.value:
                            worst = m
                    result.append(worst)
            elif rule == "override":
                if len(group) > 0:
                    var last = group[len(group) - 1]
                    for m in group:
                        if m.expires_at > last.expires_at or last.expires_at <= 0.0:
                            if m.expires_at > 0.0:
                                last = m
                    result.append(last)
        return result^

    def clear_all_modifiers(mut self, entity_uid: String):
        self.modifiers[entity_uid] = List[ProbabilityModifier]()

    # ── Parameter Value Computation ───────────────────────────────

    def compute_parameter_value(
        self,
        param: ProbabilityParameter,
        context: Dict[String, String],
        entity_uid: String,
    ) raises -> Float64:
        var val = param.base_value

        # For now, use base_value. Dynamic resolution can be added later
        if param.param_type.value == "dynamic" and param.dynamic_source != "":
            val = param.base_value
        elif param.param_type.value == "relationship":
            if "relationship_strength" in context:
                val = 0.5
        elif param.param_type.value == "external":
            if param.dynamic_source != "" and param.dynamic_source in context:
                val = 0.5

        # Apply modifiers
        var active = self.get_active_modifiers(entity_uid, param.name)

        var add_mods = List[Float64]()
        var mul_mods = List[Float64]()
        var replace_val: Float64 = -1.0

        for mod in active:
            if mod.modifier_type.value == "add":
                add_mods.append(mod.value)
            elif mod.modifier_type.value == "multiply":
                mul_mods.append(mod.value)
            elif mod.modifier_type.value == "replace":
                if replace_val < 0.0 or mod.stacking_rule.value == "override":
                    replace_val = mod.value

        # Apply in order: replace -> multiply -> add
        if replace_val >= 0.0:
            val = replace_val

        for m in mul_mods:
            val *= m

        var add_sum: Float64 = 0.0
        for a in add_mods:
            add_sum += a
        val += add_sum

        # Clamp to min/max
        return max(param.min_value, min(param.max_value, val))

    # ── Main Probability Computation ──────────────────────────────

    def compute(
        self,
        profile: ProbabilityProfile,
        context: Dict[String, String],
        entity_uid: String,
    ) raises -> Float64:
        if len(profile.parameters) == 0:
            return 0.5

        var raw_values = Dict[String, Float64]()
        var total_weight: Float64 = 0.0

        # Compute each parameter value
        for entry in profile.parameters.items():
            var val = self.compute_parameter_value(entry.value, context, entity_uid)
            var weighted = val * entry.value.weight
            raw_values[entry.key] = weighted
            total_weight += entry.value.weight

        # Apply formula
        var prob: Float64 = 0.5
        if profile.formula == "sum_weighted":
            if total_weight > 0.0:
                var sum_vals: Float64 = 0.0
                for entry in raw_values.items():
                    sum_vals += entry.value
                prob = sum_vals / total_weight
        elif profile.formula == "product":
            var prod: Float64 = 1.0
            var count = 0
            for entry in raw_values.items():
                if entry.value > 0.0:
                    prod *= entry.value
                    count += 1
            if count > 0:
                prob = pow(prod, 1.0 / Float64(count))
        elif profile.formula == "logistic":
            var sum_vals: Float64 = 0.0
            var count = 0
            for entry in raw_values.items():
                sum_vals += entry.value
                count += 1
            if count > 0:
                var avg = sum_vals / Float64(count)
                var k: Float64 = 4.0
                prob = 1.0 / (1.0 + exp(-k * (avg - 0.5)))
        elif profile.formula.startswith("expression:"):
            var expr = String(profile.formula[byte=11:])
            prob = safe_eval(expr, raw_values)

        # Apply difficulty modifier
        prob *= profile.difficulty_modifier

        # Apply global luck (shifts probability toward 0.5)
        prob = prob * (0.5 + self.global_luck)

        # Final clamp
        return max(0.0, min(1.0, prob))

    def roll(
        self,
        profile: ProbabilityProfile,
        context: Dict[String, String],
        entity_uid: String,
    ) raises -> ProbabilityResult:
        # Compute probability
        var probability = self.compute(profile, context, entity_uid)

        # Perform roll
        var roll_val = random_float64()

        # Determine success/failure
        var success = roll_val < probability

        # Determine quality
        var quality = self._determine_quality(roll_val, probability, profile)

        # Build result
        var result = ProbabilityResult()
        result.probability = probability
        result.roll = roll_val
        result.success = success
        result.quality = quality
        result.narrative = quality.value

        return result^

    def _determine_quality(
        self,
        roll: Float64,
        probability: Float64,
        profile: ProbabilityProfile,
    ) -> OutcomeQuality:
        var margin: Float64 = 0.0
        var max_margin: Float64 = 1.0

        if roll < probability:
            margin = probability - roll
            max_margin = probability
        else:
            margin = roll - probability
            max_margin = 1.0 - probability

        var normalized_margin: Float64 = 0.0
        if max_margin > 0.0:
            normalized_margin = margin / max_margin

        if roll < probability:
            if normalized_margin < 0.1:
                return OutcomeQuality.marginal_success()
            elif normalized_margin > 0.8 and roll > profile.critical_success_threshold:
                return OutcomeQuality.critical_success()
            else:
                return OutcomeQuality.success()
        else:
            if normalized_margin < 0.1:
                return OutcomeQuality.marginal_success()
            elif normalized_margin > 0.8 and roll < profile.critical_failure_threshold:
                return OutcomeQuality.critical_failure()
            else:
                return OutcomeQuality.failure()

    def get_success_chance(
        self,
        profile: ProbabilityProfile,
        context: Dict[String, String],
        entity_uid: String,
    ) raises -> Float64:
        return self.compute(profile, context, entity_uid)

    def roll_with_explicit(
        self,
        profile: ProbabilityProfile,
        context: Dict[String, String],
        entity_uid: String,
        explicit_roll: Float64,
    ) raises -> ProbabilityResult:
        var probability = self.compute(profile, context, entity_uid)
        var roll_val = explicit_roll
        var success = roll_val < probability
        var quality = self._determine_quality(roll_val, probability, profile)
        var result = ProbabilityResult()
        result.probability = probability
        result.roll = roll_val
        result.success = success
        result.quality = quality
        result.narrative = quality.value
        return result^

    def get_all_modifiers(self, entity_uid: String) raises -> List[ProbabilityModifier]:
        if entity_uid not in self.modifiers:
            return List[ProbabilityModifier]()
        var result = List[ProbabilityModifier]()
        for m in self.modifiers[entity_uid]:
            if not m.is_expired(0.0):
                result.append(m)
        return result^

    def get_modifier_summary(self, entity_uid: String) raises -> String:
        var mods = self.get_all_modifiers(entity_uid)
        var summary = '{"total_modifiers":' + String(len(mods))
        summary += ',"global_luck":' + String(self.global_luck) + '}'
        return summary^
