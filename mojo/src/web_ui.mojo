from std.collections import Dict, List
from std import subprocess
from config import ServerConfig
from http_client import json_escape_string, _shell_quote


# ── HTML Templates ────────────────────────────────────────────────

def get_ui_html() -> String:
    return """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BRING v2 - World Explorer</title>
    <style>
        :root { --bg: #1a1a2e; --surface: #16213e; --primary: #0f3460; --accent: #e94560; --text: #eee; --muted: #888; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); }
        .header { background: var(--primary); padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 1.5rem; }
        .header .status { color: var(--accent); font-size: 0.9rem; }
        .container { display: grid; grid-template-columns: 300px 1fr 300px; height: calc(100vh - 60px); }
        .sidebar { background: var(--surface); padding: 1rem; overflow-y: auto; border-right: 1px solid #333; }
        .main { padding: 1rem; overflow-y: auto; }
        .panel { background: var(--surface); padding: 1rem; overflow-y: auto; border-left: 1px solid #333; }
        .entity-card { background: var(--primary); padding: 0.8rem; margin: 0.5rem 0; border-radius: 6px; cursor: pointer; transition: background 0.2s; }
        .entity-card:hover { background: var(--accent); }
        .entity-card .name { font-weight: bold; font-size: 1rem; }
        .entity-card .type { color: var(--muted); font-size: 0.8rem; }
        .search-box { width: 100%; padding: 0.6rem; border: 1px solid #444; border-radius: 4px; background: #0d1117; color: var(--text); margin-bottom: 1rem; }
        .btn { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-secondary { background: #333; color: var(--text); }
        .detail-panel { padding: 1rem; }
        .detail-panel h2 { margin-bottom: 0.5rem; }
        .detail-panel .field { margin: 0.3rem 0; }
        .detail-panel .label { color: var(--muted); font-size: 0.8rem; }
        .chat-box { display: flex; gap: 0.5rem; margin-top: 1rem; }
        .chat-box input { flex: 1; padding: 0.6rem; border: 1px solid #444; border-radius: 4px; background: #0d1117; color: var(--text); }
        .chat-messages { height: 300px; overflow-y: auto; padding: 0.5rem; background: #0d1117; border-radius: 4px; margin-bottom: 0.5rem; }
        .msg { padding: 0.4rem; margin: 0.3rem 0; border-radius: 4px; }
        .msg.user { background: var(--primary); }
        .msg.npc { background: #1a3a1a; }
        .tabs { display: flex; gap: 0; margin-bottom: 1rem; }
        .tab { padding: 0.5rem 1rem; background: #222; cursor: pointer; border: 1px solid #333; }
        .tab.active { background: var(--primary); border-bottom-color: var(--primary); }
    </style>
</head>
<body>
    <div class="header">
        <h1>BRING v2 - World Explorer</h1>
        <div class="status" id="status">Loading...</div>
    </div>
    <div class="container">
        <div class="sidebar">
            <input type="text" class="search-box" id="search" placeholder="Search entities...">
            <div id="entity-list"></div>
        </div>
        <div class="main">
            <div class="tabs">
                <div class="tab active" onclick="showTab('explore')">Explore</div>
                <div class="tab" onclick="showTab('chat')">Chat</div>
                <div class="tab" onclick="showTab('map')">Map</div>
            </div>
            <div id="explore-tab">
                <div class="detail-panel" id="entity-detail">
                    <h2>Select an entity</h2>
                    <p>Click on an entity in the sidebar to view details.</p>
                </div>
            </div>
            <div id="chat-tab" style="display:none">
                <div class="chat-messages" id="chat-messages"></div>
                <div class="chat-box">
                    <input type="text" id="chat-input" placeholder="Type a message...">
                    <button class="btn btn-primary" onclick="sendChat()">Send</button>
                </div>
            </div>
            <div id="map-tab" style="display:none">
                <p>Map view coming soon.</p>
            </div>
        </div>
        <div class="panel">
            <h3>World Info</h3>
            <div id="world-info">
                <p class="field"><span class="label">World:</span> <span id="world-name">Unknown</span></p>
                <p class="field"><span class="label">Entities:</span> <span id="entity-count">0</span></p>
                <p class="field"><span class="label">Time:</span> <span id="world-time">Day 1</span></p>
            </div>
            <h3 style="margin-top:1rem">Quick Actions</h3>
            <button class="btn btn-secondary" style="width:100%;margin:0.3rem 0" onclick="quickAction('status')">Status</button>
            <button class="btn btn-secondary" style="width:100%;margin:0.3rem 0" onclick="quickAction('build')">Build World</button>
            <button class="btn btn-secondary" style="width:100%;margin:0.3rem 0" onclick="quickAction('validate')">Validate</button>
        </div>
    </div>
    <script>
        let entities = [];
        let selectedEntity = null;
        async function loadEntities() {
            try {
                const resp = await fetch('/api/entities');
                entities = await resp.json();
                renderEntities();
            } catch(e) { document.getElementById('status').textContent = 'Error loading'; }
        }
        function renderEntities() {
            const list = document.getElementById('entity-list');
            list.innerHTML = entities.map(function(e) { return '<div class="entity-card" onclick="selectEntity(' + String.fromCharCode(39) + e.uid + String.fromCharCode(39) + ')"><div class="name">' + e.name + '</div><div class="type">' + e.type + '</div></div>'; }).join('');
        }
        function selectEntity(uid) {
            selectedEntity = entities.find(e => e.uid === uid);
            if (selectedEntity) {
                document.getElementById('entity-detail').innerHTML = '<h2>' + selectedEntity.name + '</h2><p class="field"><span class="label">Type:</span> ' + selectedEntity.type + '</p><p class="field"><span class="label">UID:</span> ' + selectedEntity.uid + '</p>';
            }
        }
        function showTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('[id$=-tab]').forEach(t => t.style.display = 'none');
            event.target.classList.add('active');
            document.getElementById(tab + '-tab').style.display = 'block';
        }
        async function sendChat() {
            const input = document.getElementById('chat-input');
            const msg = input.value;
            if (!msg) return;
            const messages = document.getElementById('chat-messages');
            messages.innerHTML += '<div class="msg user">' + msg + '</div>';
            input.value = '';
            try {
                const resp = await fetch('/api/chat', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({message: msg}) });
                const data = await resp.json();
                messages.innerHTML += '<div class="msg npc">' + (data.response || 'No response') + '</div>';
                messages.scrollTop = messages.scrollHeight;
            } catch(e) { messages.innerHTML += '<div class="msg npc">Error: ' + e.message + '</div>'; }
        }
        async function quickAction(action) {
            try {
                const resp = await fetch('/api/' + action);
                const data = await resp.json();
                document.getElementById('status').textContent = JSON.stringify(data).substring(0, 100);
            } catch(e) { document.getElementById('status').textContent = 'Error'; }
        }
        document.getElementById('search').addEventListener('input', function(e) {
            const q = e.target.value.toLowerCase();
            const filtered = entities.filter(en => en.name.toLowerCase().includes(q) || en.type.toLowerCase().includes(q));
            const list = document.getElementById('entity-list');
            list.innerHTML = filtered.map(en => '<div class="entity-card" onclick="selectEntity(\'' + en.uid + '\')"><div class="name">' + en.name + '</div><div class="type">' + en.type + '</div></div>').join('');
        });
        document.getElementById('chat-input').addEventListener('keypress', function(e) { if (e.key === 'Enter') sendChat(); });
        loadEntities();
    </script>
</body>
</html>"""


# ── Web UI Server ─────────────────────────────────────────────────

struct WebUI(Movable):
    var host: String
    var port: Int
    var static_path: String
    var running: Bool

    def __init__(out self, config: ServerConfig):
        self.host = config.host.copy()
        self.port = config.port
        self.static_path = "./static"
        self.running = False

    def start(mut self) raises:
        self.running = True
        var cmd = self._build_start_command()
        _ = subprocess.run("mkdir -p " + _shell_quote(self.static_path))
        var html = self.get_ui_html()
        _ = subprocess.run("cat << 'MOJOEOF' > " + _shell_quote(self.static_path + "/index.html") + "\n" + html + "\nMOJOEOF")
        var bg_cmd = "nohup " + cmd + " > /tmp/bring_webui.log 2>&1 &"
        _ = subprocess.run(bg_cmd)
        print("Starting web UI on http://" + self.host + ":" + String(self.port))

    def stop(mut self):
        self.running = False
        print("Web UI stopped")

    def _build_start_command(self) -> String:
        var cmd = "python3 -m http.server " + String(self.port)
        cmd += " --bind " + self.host
        cmd += " --directory " + self.static_path
        return cmd^

    def get_url(self) -> String:
        return "http://" + self.host + ":" + String(self.port)

    def get_ui_html(self) -> String:
        return get_ui_html()

    def handle_api(self, path: String) raises -> String:
        if path == "/" or path == "/index.html":
            return get_ui_html()
        if path == "/api/status":
            return '{"status":"running","version":"2.0.0"}'
        if path == "/api/entities":
            return '{"entities":[]}'
        if path == "/api/graph":
            return '{"nodes":0,"edges":0}'
        if path == "/api/world":
            return '{"world_name":"Unknown","entities":0}'
        if path == "/api/validate":
            return '{"valid":true,"issues":0}'
        if path == "/api/build":
            return '{"status":"building"}'
        return '{"error":"not found"}'


# ── API Router ────────────────────────────────────────────────────

struct APIRouter(Movable):
    var routes: Dict[String, String]
    var prefix: String

    def __init__(out self, prefix: String = "/api"):
        self.routes = Dict[String, String]()
        self.prefix = prefix

    def add_route(mut self, path: String, handler: String):
        var full_path = self.prefix + path
        self.routes[full_path] = handler

    def handle_request(self, method: String, path: String) raises -> String:
        if path in self.routes:
            return self.routes[path].copy()
        return '{"error": "Not found"}'


# ── Static File Server ────────────────────────────────────────────

struct StaticFileServer(Movable):
    var base_path: String
    var mime_types: Dict[String, String]

    def __init__(out self, base_path: String):
        self.base_path = base_path
        self.mime_types = Dict[String, String]()
        self._init_mime_types()

    def _init_mime_types(mut self):
        self.mime_types[".html"] = "text/html"
        self.mime_types[".css"] = "text/css"
        self.mime_types[".js"] = "application/javascript"
        self.mime_types[".json"] = "application/json"
        self.mime_types[".png"] = "image/png"
        self.mime_types[".jpg"] = "image/jpeg"
        self.mime_types[".gif"] = "image/gif"
        self.mime_types[".svg"] = "image/svg+xml"
        self.mime_types[".ico"] = "image/x-icon"
        self.mime_types[".woff"] = "font/woff"
        self.mime_types[".woff2"] = "font/woff2"
        self.mime_types[".ttf"] = "font/ttf"

    def get_mime_type(self, path: String) raises -> String:
        var last_dot = -1
        for i in range(path.byte_length()):
            if path[byte=i] == ".":
                last_dot = i
        if last_dot >= 0:
            var ext = String(path[byte=last_dot:])
            if ext in self.mime_types:
                return self.mime_types[ext].copy()
        return "application/octet-stream"
