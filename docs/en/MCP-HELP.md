# MCP Console — User Guide

The MCP Console is a web-based management interface for all TrueNeverStory databases. Access it at `/mcp.html` when running in MCP mode.

## Getting Started

### Launch MCP Mode

```bash
TNS_MCP_MODE=1 bun run src/index.ts
```

Open `http://localhost:8000` in your browser. If a password is configured, you'll be redirected to the login page.

### Password Protection

MCP mode uses the same password as the main game server. Configure it via:
- **Environment variable:** `AUTH_PASSWORD=your_password`
- **Settings page:** Settings → Auth Password

If no password is configured, MCP mode runs without authentication (suitable for local development).

## Tabs Overview

| Tab | Purpose |
|-----|---------|
| **Dashboard** | Database status overview (exists, size) |
| **Bible** | Search verses, characters, bootstrap/compact |
| **Gutenberg** | Search styles, delexify text, download/convert corpus |
| **Catalog** | Build and manage book catalog for style learning |
| **Wikipedia** | Search articles, verify facts |
| **Literary** | Quest templates, compile/compact |
| **Economics** | Economic phase, dilemma generation |
| **System** | Uptime, memory, operation logs |

## Catalog — Download Favorite Authors

The Catalog tab lets you build a personal library from Project Gutenberg to improve the Stylist agent's writing quality.

### Step 1: Build a Catalog

Enter one or more author names (comma-separated) and click **Build Catalog**:

```
Mark Twain, Jack London, Edgar Allan Poe
```

Or enter a topic (e.g., `adventure`, `romance`, `gothic`) to discover authors.

For a quick start, click **Popular 500** to load the most downloaded books.

### Step 2: Browse and Filter

- **Search** — full-text search across titles, authors, and subjects
- **Filter** — by author name, birth/death year range, minimum download count
- **Sort** — click column headers to sort by title, author, downloads, or word count
- **Paginate** — navigate with Prev/Next buttons

### Step 3: Select Books

- **Individual** — click checkboxes next to each book
- **All on page** — click the header checkbox
- **All matching filter** — click "Select All" (applies current filter)
- **Deselect** — click "Deselect All" to clear

### Step 4: Download Selected

Click **Download Selected** to fetch the full texts. The process runs in the background with progress tracking.

After download, the Stylist agent automatically extracts writing patterns (vocabulary, sentence structures, mood tags) from each author's texts.

### How It Improves Writing

Downloaded texts are processed by the Gutenberg Parser which:
1. **Delexifies** — replaces proper nouns with placeholders to preserve structure
2. **Extracts vocabulary** — identifies characteristic word choices per author
3. **Extracts sentence patterns** — common syntactic structures
4. **Infers mood tags** — dark, bright, romantic, mysterious, etc.

The Stylist agent then uses these patterns when generating narrative prose, matching the mood and style of your chosen authors.

## API Endpoints

All endpoints are under `/mcp/`:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/mcp/status` | System status and database info |
| `GET` | `/mcp/gutenberg/catalog/stats` | Catalog statistics (total, downloaded, selected) |
| `GET` | `/mcp/gutenberg/catalog` | Paginated catalog listing |
| `GET` | `/mcp/gutenberg/catalog/search?q=` | Full-text search in catalog |
| `GET` | `/mcp/gutenberg/catalog/filter?author=&year_from=&year_to=&min_downloads=&subject=` | Filter catalog |
| `POST` | `/mcp/gutenberg/catalog/build` | Start catalog build job |
| `POST` | `/mcp/gutenberg/catalog/select` | Toggle individual book selection |
| `POST` | `/mcp/gutenberg/catalog/select-all` | Select all (with optional filter) |
| `POST` | `/mcp/gutenberg/catalog/deselect-all` | Clear all selections |
| `POST` | `/mcp/gutenberg/download-selected` | Download selected books |
| `POST` | `/mcp/gutenberg/process` | Trigger Gutenberg processing pipeline |

### POST /mcp/gutenberg/process

Trigger the Gutenberg processing pipeline from the MCP Console.

**Request body:**
```json
{
  "phase": "all"  // "v1" | "v2" | "all"
}
```

**Response (SSE stream):**
```json
{"phase":"parse","pct":10,"message":"Parsed 45/59 books"}
{"phase":"compile","pct":50,"message":"Running DramaturgicPass..."}
{"phase":"analyze","pct":75,"message":"Analyzing chunks..."}
{"phase":"done","pct":100,"message":"Pipeline complete"}
```

**Phases:**
- `v1` — Phase A only (rule-based, no LLM): parse → compile → done
- `v2` — Phase B only (LLM): analyze → extract → done  
- `all` — Both phases sequentially

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Catalog is empty | Build a catalog first (enter authors → Build Catalog) |
| Checkbox resets | Ensure the server is running; check browser console for API errors |
| "Authentication required" | Set `AUTH_PASSWORD` in env or Settings |
| Download hangs | Check System tab → Operation Logs for errors |
| Styles not appearing | Run Gutenberg Convert after download |
