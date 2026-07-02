from std.collections import List, Dict
from std.math import sqrt, abs as math_abs


struct ClusterEngine(Movable):
    var similarity_threshold: Float64
    var min_cluster_size: Int
    var merge_threshold: Int

    def __init__(
        out self,
        similarity_threshold: Float64 = 0.85,
        min_cluster_size: Int = 3,
        merge_threshold: Int = 5,
    ):
        self.similarity_threshold = similarity_threshold
        self.min_cluster_size = min_cluster_size
        self.merge_threshold = merge_threshold

    def cosine_similarity(self, vec1: List[Float64], vec2: List[Float64]) -> Float64:
        if len(vec1) != len(vec2) or len(vec1) == 0:
            return 0.0

        var dot: Float64 = 0.0
        var norm1: Float64 = 0.0
        var norm2: Float64 = 0.0

        for i in range(len(vec1)):
            dot += vec1[i] * vec2[i]
            norm1 += vec1[i] * vec1[i]
            norm2 += vec2[i] * vec2[i]

        norm1 = sqrt(norm1)
        norm2 = sqrt(norm2)

        if norm1 == 0.0 or norm2 == 0.0:
            return 0.0

        return dot / (norm1 * norm2)

    def find_clusters_simple(
        self,
        embeddings: List[List[Float64]],
        ids: List[String],
    ) -> List[List[String]]:
        var clusters = List[List[String]]()
        if len(embeddings) < self.min_cluster_size:
            return clusters^

        var assigned = List[Bool]()
        for _ in range(len(embeddings)):
            assigned.append(False)

        for i in range(len(embeddings)):
            if assigned[i]:
                continue

            var cluster = List[String]()
            cluster.append(ids[i])
            assigned[i] = True

            for j in range(i + 1, len(embeddings)):
                if assigned[j]:
                    continue
                var sim = self.cosine_similarity(embeddings[i], embeddings[j])
                if sim >= self.similarity_threshold:
                    cluster.append(ids[j])
                    assigned[j] = True

            if len(cluster) >= self.min_cluster_size:
                clusters.append(cluster^)

        return clusters^

    def get_cluster_summary(
        self,
        contents: List[String],
        importances: List[Float64],
    ) -> String:
        if len(contents) == 0:
            return '{"count":0,"avg_importance":0.0}'

        var total_imp: Float64 = 0.0
        for imp in importances:
            total_imp += imp
        var avg_imp = total_imp / Float64(len(importances))

        var summary = '{"count":' + String(len(contents))
        summary += ',"avg_importance":' + String(avg_imp)
        summary += ',"sources":['
        for i in range(min(3, len(contents))):
            if i > 0:
                summary += ","
            summary += '"' + String(contents[i][byte=0:50]) + '"'
        summary += ']}'
        return summary^
