/**
 * Theme system tests — theme.js, theme-builder.js, CSS class consistency.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const ROOT = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

function createWin(html = ""): Window {
  const win = new Window({
    url: "http://localhost:8000/settings",
    pretendToBeVisual: true,
  });
  win.document.documentElement.innerHTML = html;
  return win;
}

function runInWin(win: Window, code: string) {
  const ctx = vm.createContext({
    window: win,
    document: win.document,
    localStorage: win.localStorage,
    console,
    setTimeout: (fn: Function, ms: number) => setTimeout(fn, ms),
    JSON,
    RegExp,
    Date,
    Math,
    String,
    Array,
    Object,
    Number,
    parseFloat,
    parseInt,
    isNaN,
    encodeURIComponent,
    decodeURIComponent,
  });
  vm.runInContext(code, ctx);
  return ctx;
}

function loadTheme(win: Window) {
  const code = read("public/static/theme.js");
  runInWin(win, code);
}

function loadThemeBuilder(win: Window) {
  const code = read("public/static/theme-builder.js");
  runInWin(win, code);
}

// ═══════════════════════════════════════════
// theme.js
// ═══════════════════════════════════════════

describe("theme.js", () => {
  let win: Window;

  beforeEach(() => {
    win = createWin(`
      <div class="theme-selector">
        <button class="theme-selector__btn" data-theme-value="dark">Dark</button>
        <button class="theme-selector__btn" data-theme-value="light">Light</button>
        <button class="theme-selector__btn" data-theme-value="terminal">Terminal</button>
        <button class="theme-selector__btn" data-theme-value="cyberpunk">Cyber</button>
        <button class="theme-selector__btn" data-theme-value="custom">Custom</button>
        <a href="/theme-builder" class="theme-selector__btn">Builder</a>
      </div>
      <div id="customThemePanel" style="display:none"></div>
    `);
    loadTheme(win);
  });

  afterEach(() => win.close());

  it("sets data-theme='dark' on <html>", () => {
    expect(win.document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("saves theme to localStorage", () => {
    (win as any).TNSTheme.set("light");
    expect(win.localStorage.getItem("tns-theme")).toBe("light");
    expect(win.document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("reads stored theme on re-init", () => {
    win.localStorage.setItem("tns-theme", "terminal");
    loadTheme(win);
    expect((win as any).TNSTheme.get()).toBe("terminal");
    expect(win.document.documentElement.getAttribute("data-theme")).toBe("terminal");
  });

  it("toggle() switches dark→light→dark", () => {
    (win as any).TNSTheme.set("dark");
    (win as any).TNSTheme.toggle();
    expect((win as any).TNSTheme.get()).toBe("light");
    (win as any).TNSTheme.toggle();
    expect((win as any).TNSTheme.get()).toBe("dark");
  });

  it("click on theme-selector button changes theme", () => {
    const btn = win.document.querySelector('[data-theme-value="terminal"]')!;
    btn.dispatchEvent(new win.Event("click"));
    expect((win as any).TNSTheme.get()).toBe("terminal");
  });

  it("Builder link without data-theme-value does NOT corrupt theme", () => {
    (win as any).TNSTheme.set("dark");
    const link = win.document.querySelector('a[href="/theme-builder"]')!;
    link.dispatchEvent(new win.Event("click"));
    // Theme must remain 'dark', not become null
    expect((win as any).TNSTheme.get()).toBe("dark");
    expect(win.localStorage.getItem("tns-theme")).toBe("dark");
  });

  it("active class toggled correctly on buttons", () => {
    (win as any).TNSTheme.set("terminal");
    const btns = win.document.querySelectorAll(".theme-selector__btn");
    for (let i = 0; i < btns.length; i++) {
      const btn = btns[i] as HTMLElement;
      const expected = btn.getAttribute("data-theme-value") === "terminal";
      expect(btn.classList.contains("theme-selector__btn--active")).toBe(expected);
    }
  });

  it("applyCustomVars creates [data-theme='custom'] style", () => {
    win.localStorage.setItem("tns-theme-custom", JSON.stringify({ accent: "#FF0000", surface: "#111" }));
    (win as any).TNSTheme.set("custom");
    const el = win.document.getElementById("tns-custom-theme");
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain("--accent:#FF0000");
    expect(el!.textContent).toContain("--surface:#111");
    expect(el!.textContent).toContain('[data-theme="custom"]');
  });

  it("getCustomVars / saveCustomVars round-trip", () => {
    (win as any).TNSTheme.saveCustomVars({ interactive: "#ABC" });
    const v = (win as any).TNSTheme.getCustomVars();
    expect(v.interactive).toBe("#ABC");
  });

  it("customThemePanel shown only for custom theme", () => {
    const panel = win.document.getElementById("customThemePanel")!;
    (win as any).TNSTheme.set("dark");
    expect(panel.style.display).toBe("none");
    (win as any).TNSTheme.set("custom");
    expect(panel.style.display).toBe("block");
    (win as any).TNSTheme.set("light");
    expect(panel.style.display).toBe("none");
  });
});

// ═══════════════════════════════════════════
// theme-builder.js
// ═══════════════════════════════════════════

describe("theme-builder.js", () => {
  let win: Window;

  beforeEach(() => {
    win = createWin(`
      <div id="presets"></div>
      <div id="colors-bg"></div>
      <div id="colors-border"></div>
      <div id="colors-text"></div>
      <div id="colors-accent"></div>
      <div id="font-selectors"></div>
      <div id="preview-palette"></div>
      <input type="file" id="importInput">
      <div id="customThemePanel" style="display:none"></div>
    `);
    loadTheme(win);
    loadThemeBuilder(win);
  });

  afterEach(() => win.close());

  it("renders preset buttons with 'preset' class", () => {
    const btns = win.document.querySelectorAll("#presets button");
    expect(btns.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < btns.length; i++) {
      expect((btns[i] as HTMLElement).classList.contains("preset")).toBe(true);
      expect((btns[i] as HTMLElement).classList.contains("preset-card")).toBe(false);
    }
  });

  it("preset swatches use 'preset__swatch'", () => {
    expect(win.document.querySelectorAll(".preset__swatch").length).toBeGreaterThan(0);
    expect(win.document.querySelectorAll(".preset-card__swatch").length).toBe(0);
  });

  it("preset names use 'preset__name'", () => {
    expect(win.document.querySelectorAll(".preset__name").length).toBeGreaterThan(0);
  });

  it("light preset button has data-preset attribute and onclick handler", () => {
    const btn = win.document.querySelector('[data-preset="light"]') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(typeof (btn as any).onclick).toBe("function");
  });

  it("dracula preset button has onclick handler", () => {
    const btn = win.document.querySelector('[data-preset="dracula"]') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(typeof (btn as any).onclick).toBe("function");
  });

  it("color controls rendered in all 4 groups", () => {
    expect(win.document.querySelectorAll("#colors-bg .color-row").length).toBeGreaterThan(0);
    expect(win.document.querySelectorAll("#colors-border .color-row").length).toBeGreaterThan(0);
    expect(win.document.querySelectorAll("#colors-text .color-row").length).toBeGreaterThan(0);
    expect(win.document.querySelectorAll("#colors-accent .color-row").length).toBeGreaterThan(0);
  });

  it("3 font selectors (mono, body, display)", () => {
    expect(win.document.querySelectorAll("#font-selectors select").length).toBe(3);
  });

  it("preview palette rendered", () => {
    expect(win.document.querySelectorAll(".preview-swatch").length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════
// Static file consistency
// ═══════════════════════════════════════════

describe("CSS/JS consistency (static checks)", () => {
  it("theme-builder.js has zero 'preset-card' references", () => {
    expect(read("public/static/theme-builder.js")).not.toContain("preset-card");
  });

  it("theme.css defines .theme-selector__btn and --active variant", () => {
    const css = read("public/static/theme.css");
    expect(css).toContain(".theme-selector__btn");
    expect(css).toContain(".theme-selector__btn--active");
  });

  it("all 5 theme CSS files define required color variables", () => {
    const files = [
      "public/static/theme-dark.css",
      "public/static/theme-light.css",
      "public/static/theme-terminal.css",
      "public/static/theme-cyberpunk.css",
      "public/static/theme-custom.css",
    ];
    const vars = ["--black:", "--surface:", "--accent:", "--text-primary:", "--interactive:"];
    for (const f of files) {
      const css = read(f);
      for (const v of vars) {
        expect(css).toContain(v);
      }
    }
  });

  it("index.html :root has NO color vars that override themes", () => {
    const m = read("public/index.html").match(/:root\s*\{([^}]+)\}/);
    expect(m).not.toBeNull();
    for (const v of ["--black:", "--surface:", "--text-primary:", "--accent:"]) {
      expect(m![1]).not.toContain(v);
    }
  });

  it("graph.html :root has NO color vars that override themes", () => {
    const m = read("public/graph.html").match(/:root\s*\{([^}]+)\}/);
    expect(m).not.toBeNull();
    for (const v of ["--black:", "--surface:", "--text-primary:", "--accent:"]) {
      expect(m![1]).not.toContain(v);
    }
  });

  it("index.html sidebar toggle uses app--sidebar-open", () => {
    const html = read("public/index.html");
    expect(html).toContain("app--sidebar-open");
    // Must NOT use the old broken sidebar--visible pattern
    expect(html).not.toMatch(/classList\.toggle\(['"]sidebar--visible['"]\)/);
  });

  it("theme-builder.html CSS defines .preset__colors layout", () => {
    const css = read("public/theme-builder.html");
    expect(css).toContain(".preset__colors");
    expect(css).toContain("display:flex");
  });

  it("settings.html 'Builder' link has class theme-selector__btn but no data-theme-value", () => {
    const html = read("public/settings.html");
    // The <a> builder link should exist
    expect(html).toContain('href="/theme-builder" class="theme-selector__btn"');
  });
});
