from std.collections import List


struct EmbeddingQueue(Movable):
    var batch_size: Int
    var embedding_dim: Int
    var queue_size: Int

    def __init__(out self, batch_size: Int = 50, embedding_dim: Int = 384):
        self.batch_size = batch_size
        self.embedding_dim = embedding_dim
        self.queue_size = 0

    def generate_fallback_embedding(self, text: String) raises -> List[Float64]:
        var embedding = List[Float64]()
        var hash_val = 0
        for i in range(text.byte_length()):
            hash_val = (hash_val * 31 + Int(text[byte=i])) % 256
        for i in range(self.embedding_dim):
            var byte_idx = i % 4
            var shift = byte_idx * 8
            var val = Float64(((hash_val >> shift) & 0xFF) - 128) / 128.0
            embedding.append(val)
        return embedding^

    def get_queue_size(self) -> Int:
        return self.queue_size
