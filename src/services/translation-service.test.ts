import { describe, it, expect, mock, beforeEach } from "bun:test";
import { TranslationService, type LanguageCode } from "./translation-service";
import type { LLMQueue } from "@/lib/llm-queue";

function createMockQueue(overrides: Partial<LLMQueue> = {}): LLMQueue {
  return {
    generateText: mock(() => Promise.resolve("translated text")),
    generateJson: mock(() => Promise.resolve({})),
    ...overrides,
  } as unknown as LLMQueue;
}

describe("TranslationService", () => {
  describe("detectLanguage", () => {
    it("detects Russian", () => {
      const svc = new TranslationService(createMockQueue());
      expect(svc.detectLanguage("Привет мир")).toBe("ru");
    });

    it("detects Japanese", () => {
      const svc = new TranslationService(createMockQueue());
      expect(svc.detectLanguage("こんにちは")).toBe("ja");
    });

    it("detects Chinese", () => {
      const svc = new TranslationService(createMockQueue());
      expect(svc.detectLanguage("你好世界")).toBe("zh");
    });

    it("detects German", () => {
      const svc = new TranslationService(createMockQueue());
      expect(svc.detectLanguage("Hallo Übermut")).toBe("de");
    });

    it("detects French", () => {
      const svc = new TranslationService(createMockQueue());
      expect(svc.detectLanguage("Bonjour à tous")).toBe("fr");
    });

    it("detects Spanish", () => {
      const svc = new TranslationService(createMockQueue());
      expect(svc.detectLanguage("¿Hola cómo estás?")).toBe("es");
    });

    it("defaults to English", () => {
      const svc = new TranslationService(createMockQueue());
      expect(svc.detectLanguage("Hello world")).toBe("en");
    });
  });

  describe("translate", () => {
    it("returns text unchanged for English target", async () => {
      const svc = new TranslationService(createMockQueue());
      const result = await svc.translate("Hello", "en");
      expect(result).toBe("Hello");
    });

    it("calls LLM for non-English target", async () => {
      const generateText = mock(() => Promise.resolve("Привет"));
      const svc = new TranslationService(createMockQueue({ generateText }));
      const result = await svc.translate("Hello", "ru");
      expect(result).toBe("Привет");
      expect(generateText).toHaveBeenCalledTimes(1);
    });

    it("returns original text if translation is too short", async () => {
      const generateText = mock(() => Promise.resolve("x"));
      const svc = new TranslationService(createMockQueue({ generateText }));
      const result = await svc.translate("This is a long text that should not be translated to just one character", "ru");
      expect(result).toBe("This is a long text that should not be translated to just one character");
    });
  });

  describe("translateToEnglish", () => {
    it("returns text unchanged for English source", async () => {
      const svc = new TranslationService(createMockQueue());
      const result = await svc.translateToEnglish("Hello", "en");
      expect(result).toBe("Hello");
    });

    it("calls LLM for non-English source", async () => {
      const generateText = mock(() => Promise.resolve("Go to the tavern"));
      const svc = new TranslationService(createMockQueue({ generateText }));
      const result = await svc.translateToEnglish("Иди в таверну", "ru");
      expect(result).toBe("Go to the tavern");
    });
  });

  describe("translateAndClassify", () => {
    it("returns null for English input", async () => {
      const svc = new TranslationService(createMockQueue());
      const result = await svc.translateAndClassify("Hello", "en");
      expect(result).toBeNull();
    });

    it("returns null for unsupported language", async () => {
      const svc = new TranslationService(createMockQueue());
      const result = await svc.translateAndClassify("Hello", "xx" as LanguageCode);
      expect(result).toBeNull();
    });

    it("returns translated text and intent for valid input", async () => {
      const generateJson = mock(() => Promise.resolve({
        translated: "Go to the tavern",
        intent: { type: "movement", target: "tavern", detail_level: "normal" },
      }));
      const svc = new TranslationService(createMockQueue({ generateJson }));
      const result = await svc.translateAndClassify("Иди в таверну", "ru");
      expect(result).toEqual({
        translated: "Go to the tavern",
        intent: { type: "movement", target: "tavern", detail_level: "normal" },
      });
    });

    it("returns null if response is invalid", async () => {
      const generateJson = mock(() => Promise.resolve({ translated: "", intent: null }));
      const svc = new TranslationService(createMockQueue({ generateJson }));
      const result = await svc.translateAndClassify("Иди в таверну", "ru");
      expect(result).toBeNull();
    });

    it("returns null on LLM error", async () => {
      const generateJson = mock(() => Promise.reject(new Error("LLM failed")));
      const svc = new TranslationService(createMockQueue({ generateJson }));
      const result = await svc.translateAndClassify("Иди в таверну", "ru");
      expect(result).toBeNull();
    });
  });

  describe("translateResponse", () => {
    it("returns response unchanged for English", async () => {
      const svc = new TranslationService(createMockQueue());
      const response = { narrative: "Hello", heartbeatMessage: "World" };
      const result = await svc.translateResponse(response, "en");
      expect(result).toEqual(response);
    });

    it("translates narrative and heartbeatMessage", async () => {
      const generateText = mock(() => Promise.resolve("Переведено"));
      const svc = new TranslationService(createMockQueue({ generateText }));
      const response = { narrative: "Hello", heartbeatMessage: "World" };
      const result = await svc.translateResponse(response, "ru");
      expect(result.narrative).toBe("Переведено");
      expect(result.heartbeatMessage).toBe("Переведено");
    });
  });
});
