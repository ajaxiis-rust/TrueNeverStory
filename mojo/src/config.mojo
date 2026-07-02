from std.collections import Dict

# ── LLM Configuration ─────────────────────────────────────────────

@fieldwise_init
struct LLMConfig(Copyable, Movable, Writable):
    var base_url: String
    var api_key: String
    var model: String
    var embedding_model: String
    var embedding_base_url: String
    var embedding_api_key: String
    var timeout: Float64
    var max_tokens: Int
    var temperature: Float64
    var max_retries: Int
    var max_concurrent: Int

    def __init__(out self):
        self.base_url = ""
        self.api_key = ""
        self.model = "gpt-4o-mini"
        self.embedding_model = "text-embedding-3-small"
        self.embedding_base_url = ""
        self.embedding_api_key = ""
        self.timeout = 120.0
        self.max_tokens = 4096
        self.temperature = 0.7
        self.max_retries = 3
        self.max_concurrent = 8

    def is_configured(self) -> Bool:
        return self.base_url.byte_length() > 0 and self.api_key.byte_length() > 0

    def write_to(self, mut writer: Some[Writer]):
        writer.write("LLMConfig(url=", self.base_url, ", model=", self.model, ", key_set=", self.is_configured(), ")")


# ── Database Configuration ────────────────────────────────────────

@fieldwise_init
struct DBConfig(Copyable, Movable, Writable):
    var db_path: String

    def __init__(out self):
        self.db_path = "./world_db"

    def write_to(self, mut writer: Some[Writer]):
        writer.write("DBConfig(path=", self.db_path, ")")


# ── Server Configuration ──────────────────────────────────────────

@fieldwise_init
struct ServerConfig(Copyable, Movable, Writable):
    var host: String
    var port: Int
    var reload: Bool

    def __init__(out self):
        self.host = "0.0.0.0"
        self.port = 8000
        self.reload = False

    def write_to(self, mut writer: Some[Writer]):
        writer.write("ServerConfig(host=", self.host, ", port=", self.port, ")")


# ── Model Download Configuration ──────────────────────────────────

@fieldwise_init
struct ModelConfig(Copyable, Movable, Writable):
    var models_dir: String
    var hf_token: String
    var default_repo: String
    var default_filename: String
    var timeout: Float64
    var max_retries: Int

    def __init__(out self):
        self.models_dir = "./models"
        self.hf_token = ""
        self.default_repo = ""
        self.default_filename = ""
        self.timeout = 600.0
        self.max_retries = 3

    def is_configured(self) -> Bool:
        return self.default_repo.byte_length() > 0

    def write_to(self, mut writer: Some[Writer]):
        writer.write("ModelConfig(dir=", self.models_dir, ", repo=", self.default_repo, ", file=", self.default_filename, ")")

    @staticmethod
    def get_model_path(models_dir: String, repo: String, filename: String) -> String:
        var flat_repo = repo.replace("/", "_")
        return models_dir + "/" + flat_repo + "/" + filename


# ── Application Configuration ─────────────────────────────────────

@fieldwise_init
struct AppConfig(Copyable, Movable, Writable):
    var llm: LLMConfig
    var db: DBConfig
    var server: ServerConfig
    var models: ModelConfig
    var auto_heal: Bool

    def __init__(out self):
        self.llm = LLMConfig()
        self.db = DBConfig()
        self.server = ServerConfig()
        self.models = ModelConfig()
        self.auto_heal = True

    def validate(self) -> Bool:
        if not self.llm.is_configured():
            print("Warning: LLM not configured")
            return False
        return True

    def write_to(self, mut writer: Some[Writer]):
        writer.write("AppConfig(llm=", self.llm, ", db=", self.db, ", server=", self.server, ")")


# ── Config factory ────────────────────────────────────────────────

def get_config() -> AppConfig:
    return AppConfig()
