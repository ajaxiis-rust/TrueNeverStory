from std.math import exp, pow, abs, min, max


struct MemoryScoringEngine(Movable):
    var importance_weight: Float64
    var recency_weight: Float64
    var access_weight: Float64
    var emotion_weight: Float64
    var relevance_weight: Float64
    var half_life: Float64

    def __init__(out self, half_life_days: Float64 = 30.0):
        self.importance_weight = 0.35
        self.recency_weight = 0.25
        self.access_weight = 0.15
        self.emotion_weight = 0.10
        self.relevance_weight = 0.15
        self.half_life = half_life_days

    def compute_score(
        self,
        importance: Float64,
        age_days: Float64,
        access_count: Int,
        emotional_valence: Float64,
        story_relevance: Float64,
    ) -> Float64:
        var recency = exp(-age_days / self.half_life)
        var accesses = min(Float64(access_count) / 10.0, 1.0)
        var emotion = abs(emotional_valence)

        var score = (
            self.importance_weight * importance +
            self.recency_weight * recency +
            self.access_weight * accesses +
            self.emotion_weight * emotion +
            self.relevance_weight * story_relevance
        )

        return min(1.0, max(0.0, score))

    def compute_salience(
        self,
        importance: Float64,
        age_days: Float64,
        access_count: Int,
    ) -> Float64:
        var decay = pow(2.0, -age_days / self.half_life)
        var access_boost = 0.0
        if access_count > 0:
            var log_val = 0.0
            var n = access_count
            while n > 0:
                log_val += 0.1
                n = n // 2
            access_boost = log_val * 0.1

        var salience = importance * decay + access_boost
        return min(1.0, max(0.0, salience))
