import { describe, test, expect } from "bun:test";
import { resolveTemplate } from "./template-resolver";

describe("resolveTemplate", () => {
  test("replaces simple string vars", () => {
    const result = resolveTemplate("Hello {name}, welcome to {world}", {
      name: "Aria",
      world: "Dark Realm",
    });
    expect(result).toBe("Hello Aria, welcome to Dark Realm");
  });

  test("replaces array vars with comma join", () => {
    const result = resolveTemplate("NPCs: {npcs}", {
      npcs: ["Gandalf", "Aragorn", "Legolas"],
    });
    expect(result).toBe("NPCs: Gandalf, Aragorn, Legolas");
  });

  test("replaces empty array with None", () => {
    const result = resolveTemplate("NPCs: {npcs}", { npcs: [] });
    expect(result).toBe("NPCs: None");
  });

  test("leaves unmatched vars as-is", () => {
    const result = resolveTemplate("Hello {name} and {missing}", { name: "Aria" });
    expect(result).toBe("Hello Aria and {missing}");
  });

  test("handles null/undefined vars by keeping placeholder", () => {
    const result = resolveTemplate("{a} {b}", { a: null, b: undefined });
    expect(result).toBe("{a} {b}");
  });

  test("handles empty template", () => {
    expect(resolveTemplate("", {})).toBe("");
  });

  test("handles template with no placeholders", () => {
    expect(resolveTemplate("plain text", { x: "y" })).toBe("plain text");
  });

  test("handles multiple occurrences of same var", () => {
    const result = resolveTemplate("{x} and {x} again", { x: "foo" });
    expect(result).toBe("foo and foo again");
  });
});
