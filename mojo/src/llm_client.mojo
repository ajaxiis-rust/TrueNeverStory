from std.collections import Dict, List
from http_client import (
    OpenAIHTTPClient,
    HTTPResponse,
    str_int,
    str_float,
    str_bool,
)

# ── LLM Client ────────────────────────────────────────────────────

struct LLMClient(Movable):
    var base_url: String
    var api_key: String
    var model: String
    var embedding_model: String
    var temperature: Float64
    var max_tokens: Int
    var http_client: OpenAIHTTPClient

    def __init__(out self, base_url: String = "", api_key: String = "", model: String = ""):
        self.base_url = base_url
        self.api_key = api_key
        self.model = model
        self.embedding_model = "text-embedding-3-small"
        self.temperature = 0.7
        self.max_tokens = 4096
        self.http_client = OpenAIHTTPClient(base_url, api_key, base_url, api_key)

    def __init__(
        out self,
        base_url: String,
        api_key: String,
        model: String,
        embedding_base_url: String,
        embedding_api_key: String,
    ):
        self.base_url = base_url
        self.api_key = api_key
        self.model = model
        self.embedding_model = "text-embedding-3-small"
        self.temperature = 0.7
        self.max_tokens = 4096
        self.http_client = OpenAIHTTPClient(base_url, api_key, embedding_base_url, embedding_api_key)

    def is_configured(self) -> Bool:
        return self.base_url.byte_length() > 0 and self.api_key.byte_length() > 0

    def generate_text(mut self, prompt: String) raises -> String:
        var messages = List[Dict[String, String]]()
        var msg = Dict[String, String]()
        msg["role"] = "user"
        msg["content"] = prompt
        messages.append(msg^)
        return self.http_client.chat_completion(
            self.model, messages^, self.temperature, self.max_tokens, False
        )

    def generate_text_with_system(
        mut self, prompt: String, system: String,
    ) raises -> String:
        var messages = List[Dict[String, String]]()
        var sys_msg = Dict[String, String]()
        sys_msg["role"] = "system"
        sys_msg["content"] = system
        messages.append(sys_msg^)
        var user_msg = Dict[String, String]()
        user_msg["role"] = "user"
        user_msg["content"] = prompt
        messages.append(user_msg^)
        return self.http_client.chat_completion(
            self.model, messages^, self.temperature, self.max_tokens, False
        )

    def generate_json(mut self, prompt: String) raises -> String:
        var messages = List[Dict[String, String]]()
        var msg = Dict[String, String]()
        msg["role"] = "user"
        msg["content"] = prompt
        messages.append(msg^)
        return self.http_client.chat_completion(
            self.model, messages^, self.temperature, self.max_tokens, True
        )

    def chat(mut self, var messages: List[Dict[String, String]]) raises -> String:
        return self.http_client.chat_completion(
            self.model, messages^, self.temperature, self.max_tokens, False
        )

    def embed(mut self, text: String) raises -> List[Float64]:
        return self.http_client.embedding(self.embedding_model, text)

    def embed_many(mut self, texts: List[String]) raises -> List[List[Float64]]:
        var results = List[List[Float64]]()
        for text in texts:
            results.append(self.embed(text))
        return results^

    def cosine_similarity(self, a: List[Float64], b: List[Float64]) -> Float64:
        if len(a) != len(b) or len(a) == 0:
            return 0.0
        var dot_product: Float64 = 0.0
        var norm_a: Float64 = 0.0
        var norm_b: Float64 = 0.0
        for i in range(len(a)):
            dot_product += a[i] * b[i]
            norm_a += a[i] * a[i]
            norm_b += b[i] * b[i]
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        return dot_product / (sqrt(norm_a) * sqrt(norm_b))
