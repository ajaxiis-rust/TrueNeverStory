from std.collections import Dict, List

# ── Parameter Type ────────────────────────────────────────────────

@fieldwise_init
struct ParameterType(ImplicitlyCopyable, Movable, Writable):
    var value: String

    @staticmethod
    def static() -> ParameterType:
        return ParameterType("static")

    @staticmethod
    def dynamic() -> ParameterType:
        return ParameterType("dynamic")

    @staticmethod
    def relationship() -> ParameterType:
        return ParameterType("relationship")

    @staticmethod
    def external() -> ParameterType:
        return ParameterType("external")

    def write_to(self, mut writer: Some[Writer]):
        writer.write("ParameterType(", self.value, ")")


# ── Modifier Type ─────────────────────────────────────────────────

@fieldwise_init
struct ModifierType(ImplicitlyCopyable, Movable, Writable):
    var value: String

    @staticmethod
    def add() -> ModifierType:
        return ModifierType("add")

    @staticmethod
    def multiply() -> ModifierType:
        return ModifierType("multiply")

    @staticmethod
    def replace() -> ModifierType:
        return ModifierType("replace")

    def write_to(self, mut writer: Some[Writer]):
        writer.write("ModifierType(", self.value, ")")


# ── Stacking Rule ─────────────────────────────────────────────────

@fieldwise_init
struct StackingRule(ImplicitlyCopyable, Movable, Writable):
    var value: String

    @staticmethod
    def stack() -> StackingRule:
        return StackingRule("stack")

    @staticmethod
    def take_highest() -> StackingRule:
        return StackingRule("highest")

    @staticmethod
    def take_lowest() -> StackingRule:
        return StackingRule("lowest")

    @staticmethod
    def override() -> StackingRule:
        return StackingRule("override")

    def write_to(self, mut writer: Some[Writer]):
        writer.write("StackingRule(", self.value, ")")


# ── Outcome Quality ───────────────────────────────────────────────

@fieldwise_init
struct OutcomeQuality(ImplicitlyCopyable, Movable, Writable):
    var value: String

    @staticmethod
    def critical_failure() -> OutcomeQuality:
        return OutcomeQuality("critical_failure")

    @staticmethod
    def failure() -> OutcomeQuality:
        return OutcomeQuality("failure")

    @staticmethod
    def marginal_success() -> OutcomeQuality:
        return OutcomeQuality("marginal_success")

    @staticmethod
    def success() -> OutcomeQuality:
        return OutcomeQuality("success")

    @staticmethod
    def critical_success() -> OutcomeQuality:
        return OutcomeQuality("critical_success")

    def is_success(self) -> Bool:
        return self.value == "success" or self.value == "critical_success" or self.value == "marginal_success"

    def is_critical(self) -> Bool:
        return self.value == "critical_failure" or self.value == "critical_success"

    def write_to(self, mut writer: Some[Writer]):
        writer.write("OutcomeQuality(", self.value, ")")


# ── Probability Modifier ──────────────────────────────────────────

@fieldwise_init
struct ProbabilityModifier(ImplicitlyCopyable, Movable, Writable):
    var parameter_name: String
    var value: Float64
    var modifier_type: ModifierType
    var duration_seconds: Int
    var source: String
    var stacking_rule: StackingRule
    var expires_at: Float64
    var description: String

    def __init__(out self, parameter_name: String, value: Float64, modifier_type: ModifierType):
        self.parameter_name = parameter_name
        self.value = value
        self.modifier_type = modifier_type
        self.duration_seconds = 0
        self.source = ""
        self.stacking_rule = StackingRule.stack()
        self.expires_at = 0.0
        self.description = ""

    def is_expired(self, current_time: Float64) -> Bool:
        if self.expires_at <= 0.0:
            return False
        return current_time >= self.expires_at

    def write_to(self, mut writer: Some[Writer]):
        writer.write("ProbabilityModifier(", self.parameter_name, "=", self.value, ")")


# ── Probability Parameter ─────────────────────────────────────────

struct ProbabilityParameter(ImplicitlyCopyable, Movable, Writable):
    var name: String
    var base_value: Float64
    var weight: Float64
    var param_type: ParameterType
    var dynamic_source: String
    var min_value: Float64
    var max_value: Float64

    def __init__(
        out self,
        var name: String,
        base_value: Float64 = 0.5,
        weight: Float64 = 1.0,
        var param_type: ParameterType = ParameterType.static(),
        var dynamic_source: String = "",
        min_value: Float64 = 0.0,
        max_value: Float64 = 1.0,
    ):
        self.name = name
        self.base_value = base_value
        self.weight = weight
        self.param_type = param_type
        self.dynamic_source = dynamic_source
        self.min_value = min_value
        self.max_value = max_value

    def write_to(self, mut writer: Some[Writer]):
        writer.write("ProbabilityParameter(", self.name, "=", self.base_value, ")")


# ── Probability Profile ───────────────────────────────────────────

struct ProbabilityProfile(Movable, Writable):
    var name: String
    var parameters: Dict[String, ProbabilityParameter]
    var formula: String
    var difficulty_modifier: Float64
    var critical_success_threshold: Float64
    var critical_failure_threshold: Float64

    def __init__(
        out self,
        var name: String,
        var parameters: Dict[String, ProbabilityParameter] = Dict[String, ProbabilityParameter](),
        var formula: String = "sum_weighted",
        difficulty_modifier: Float64 = 1.0,
        critical_success_threshold: Float64 = 0.95,
        critical_failure_threshold: Float64 = 0.05,
    ):
        self.name = name
        self.parameters = parameters^
        self.formula = formula
        self.difficulty_modifier = difficulty_modifier
        self.critical_success_threshold = critical_success_threshold
        self.critical_failure_threshold = critical_failure_threshold

    def write_to(self, mut writer: Some[Writer]):
        writer.write("ProbabilityProfile(", self.name, ")")


# ── Probability Result ────────────────────────────────────────────

@fieldwise_init
struct ProbabilityResult(ImplicitlyCopyable, Movable, Writable):
    var probability: Float64
    var roll: Float64
    var success: Bool
    var quality: OutcomeQuality
    var narrative: String

    def __init__(out self):
        self.probability = 0.0
        self.roll = 0.0
        self.success = False
        self.quality = OutcomeQuality.failure()
        self.narrative = ""

    def write_to(self, mut writer: Some[Writer]):
        writer.write("ProbabilityResult(prob=", self.probability, ", success=", self.success, ", quality=", self.quality, ")")
