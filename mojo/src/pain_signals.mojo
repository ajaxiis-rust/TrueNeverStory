from std.collections import Dict, List
from entity_store import EntityStore
from llm_client import LLMClient


# ── Pain Signal Manager ───────────────────────────────────────────

struct PainSignalManager:
    var entity_store: EntityStore
    var signals: List[String]
    var signal_count: Int

    def __init__(out self, var store: EntityStore):
        self.entity_store = store^
        self.signals = List[String]()
        self.signal_count = 0

    def record_pain_signal(mut self, description: String, severity: Float64 = 0.5) -> String:
        self.signal_count += 1
        var id = "pain_" + String(self.signal_count)
        self.signals.append(description)
        return id

    def get_pain_level(self) -> Float64:
        if len(self.signals) == 0:
            return 0.0
        return Float64(len(self.signals)) / 100.0

    def get_pain_history(self) -> String:
        var result = '{"signals":['
        for i in range(len(self.signals)):
            if i > 0:
                result += ","
            result += '"' + self.signals[i] + '"'
        result += ']}'
        return result^

    def apply_decay(mut self, decay_rate: Float64 = 0.1) -> String:
        return '{"decayed":0}'

    def get_narrative_context(self) -> String:
        return '{"pain_level":' + String(self.get_pain_level()) + ',"signal_count":' + String(self.signal_count) + '}'
