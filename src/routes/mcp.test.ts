import { describe, test, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import { mcpRouter } from "./mcp";
import { GutenbergCatalog } from "@/mcp/gutenberg/catalog";
import { join } from "node:path";

describe("MCP routes", () => {
  const app = new Hono();
  app.route("/mcp", mcpRouter);

  // Clear catalog DB before tests
  beforeAll(() => {
    const catalogDbPath = join(process.cwd(), 'data', 'mcp', 'gutenberg-catalog.db');
    try {
      const catalog = new GutenbergCatalog(catalogDbPath);
      catalog.deselectAll();
      // Delete all books to start fresh
      const db = (catalog as any).db;
      db.run('DELETE FROM books');
      catalog.close();
    } catch {
      // DB might not exist yet
    }
  });

  // ── System ──────────────────────────────────────────────────

  describe("GET /mcp/status", () => {
    test("returns databases array and system info", async () => {
      const res = await app.request("/mcp/status");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.databases).toBeArrayOfSize(5);
      expect(body.databases[0].name).toBe("bible");
      expect(body.databases[1].name).toBe("gutenberg");
      expect(body.databases[2].name).toBe("wikipedia");
      expect(body.databases[3].name).toBe("literary");
      expect(body.databases[4].name).toBe("economics");
      expect(typeof body.uptime).toBe("number");
      expect(body.memory).toBeDefined();
      expect(typeof body.mcpMode).toBe("boolean");
    });

    test("each database entry has name, exists, size, path", async () => {
      const res = await app.request("/mcp/status");
      const body = await res.json();
      for (const db of body.databases) {
        expect(db.name).toBeString();
        expect(typeof db.exists).toBe("boolean");
        expect(typeof db.size).toBe("number");
        expect(db.path).toBeString();
      }
    });
  });

  test("POST /mcp/rebuild-index returns pending", async () => {
    const res = await app.request("/mcp/rebuild-index", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("pending");
  });

  test("POST /mcp/clean-orphans returns pending", async () => {
    const res = await app.request("/mcp/clean-orphans", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("pending");
  });

  // ── Economics ───────────────────────────────────────────────

  describe("GET /mcp/economics/phase", () => {
    test("returns phase info", async () => {
      const res = await app.request("/mcp/economics/phase");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.phase).toBe("normal");
      expect(body.message).toBeString();
    });
  });

  describe("GET /mcp/economics/dilemma", () => {
    test("returns dilemma placeholder", async () => {
      const res = await app.request("/mcp/economics/dilemma");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.dilemma).toBeNull();
      expect(body.message).toBeString();
    });
  });

  // ── 404 when DB files missing ───────────────────────────────

  describe("404 responses when DB not found", () => {
    const routes404 = [
      "/mcp/bible/stats",
      "/mcp/bible/search?q=test",
      "/mcp/bible/books",
      "/mcp/bible/characters",
      "/mcp/bible/character/test",
      "/mcp/gutenberg/stats",
      "/mcp/gutenberg/search?q=test",
      "/mcp/gutenberg/styles",
      "/mcp/wikipedia/stats",
    ];

    for (const route of routes404) {
      test(`${route} returns 404 with error when DB missing`, async () => {
        const res = await app.request(route);
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toContain("not found");
      });
    }
  });

  describe("POST 404 when DB missing", () => {
    const postRoutes = [
      "/mcp/bible/compact",
      "/mcp/gutenberg/compact",
      "/mcp/gutenberg/delexify",
      "/mcp/wikipedia/compact",
    ];

    for (const route of postRoutes) {
      test(`${route} returns 404 when DB missing`, async () => {
        const res = await app.request(route, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: "test" }),
        });
        expect(res.status).toBe(404);
      });
    }
  });

  // ── SSE Stream ──────────────────────────────────────────────

  describe("GET /mcp/stream/:jobId", () => {
    test("returns 404 for unknown job", async () => {
      const res = await app.request("/mcp/stream/nonexistent-id");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Job not found");
    });
  });

  // ── Wikipedia stubs ─────────────────────────────────────────

  describe("Wikipedia stubs", () => {
    test("POST /mcp/wikipedia/download returns pending", async () => {
      const res = await app.request("/mcp/wikipedia/download", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("pending");
    });

    test("POST /mcp/wikipedia/convert returns pending", async () => {
      const res = await app.request("/mcp/wikipedia/convert", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("pending");
    });
  });

  // ── Literary stubs ──────────────────────────────────────────

  describe("Literary compile stub", () => {
    test("POST /mcp/literary/compile returns pending", async () => {
      const res = await app.request("/mcp/literary/compile", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("pending");
    });
  });

  // ── Bible bootstrap ─────────────────────────────────────────

  describe("POST /mcp/bible/bootstrap", () => {
    test("returns jobId and stream URL", async () => {
      const res = await app.request("/mcp/bible/bootstrap", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.jobId).toBeString();
      expect(body.stream).toContain("/mcp/stream/");
    });
  });

  // ── Gutenberg Catalog ───────────────────────────────────────

  describe("Gutenberg Catalog", () => {
    test("GET /mcp/gutenberg/catalog/stats returns zero when empty", async () => {
      const res = await app.request("/mcp/gutenberg/catalog/stats");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(0);
      expect(body.downloaded).toBe(0);
      expect(body.selected).toBe(0);
    });

    test("POST /mcp/gutenberg/catalog/build starts job", async () => {
      const res = await app.request("/mcp/gutenberg/catalog/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authors: ["Mark Twain"] }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.jobId).toBeString();
      expect(body.stream).toContain("/mcp/stream/");
    });

    test("GET /mcp/gutenberg/catalog returns paginated results", async () => {
      const res = await app.request("/mcp/gutenberg/catalog?page=1&limit=50");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.books).toBeArray();
      expect(body.total).toBeNumber();
      expect(body.page).toBe(1);
      expect(body.totalPages).toBeNumber();
    });

    test("GET /mcp/gutenberg/catalog/search finds by title", async () => {
      const res = await app.request("/mcp/gutenberg/catalog/search?q=adventures");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toBeArray();
      expect(body.query).toBe("adventures");
    });

    test("GET /mcp/gutenberg/catalog/search finds by author", async () => {
      const res = await app.request("/mcp/gutenberg/catalog/search?q=Twain");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toBeArray();
    });

    test("GET /mcp/gutenberg/catalog/filter filters by author", async () => {
      const res = await app.request("/mcp/gutenberg/catalog/filter?author=Twain");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toBeArray();
      expect(body.filter.author).toBe("Twain");
    });

    test("GET /mcp/gutenberg/catalog/filter filters by year range", async () => {
      const res = await app.request("/mcp/gutenberg/catalog/filter?year_from=1850&year_to=1910");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results).toBeArray();
      expect(body.filter.year_from).toBe(1850);
      expect(body.filter.year_to).toBe(1910);
    });

    test("POST /mcp/gutenberg/catalog/select-all selects matching", async () => {
      const res = await app.request("/mcp/gutenberg/catalog/select-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.selected).toBeNumber();
    });

    test("POST /mcp/gutenberg/catalog/deselect-all clears selections", async () => {
      const res = await app.request("/mcp/gutenberg/catalog/deselect-all", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    test("POST /mcp/gutenberg/catalog/select toggles individual book", async () => {
      // First select-all so we have books with selected=1
      await app.request("/mcp/gutenberg/catalog/select-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      // Deselect one book
      const res = await app.request("/mcp/gutenberg/catalog/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etextnos: [74], selected: false }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.changed).toBeNumber();
    });

    test("POST /mcp/gutenberg/catalog/select with empty etextnos returns 400", async () => {
      const res = await app.request("/mcp/gutenberg/catalog/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etextnos: [], selected: true }),
      });
      expect(res.status).toBe(400);
    });

    test("POST /mcp/gutenberg/download-selected with empty list returns error", async () => {
      const res = await app.request("/mcp/gutenberg/download-selected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etextnos: [] }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("No etextnos");
    });

    test("POST /mcp/gutenberg/download-selected starts job", async () => {
      const res = await app.request("/mcp/gutenberg/download-selected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etextnos: [74, 76] }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.jobId).toBeString();
      expect(body.stream).toContain("/mcp/stream/");
    });
  });
});
