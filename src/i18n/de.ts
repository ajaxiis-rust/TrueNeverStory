import { EN } from "./en";
import type { LanguagePack } from "./types";

export const DE: LanguagePack = {
  ...EN,
  code: "de",
  name: "German",
  nativeName: "Deutsch",

  systemPrompt: "Antworte nur auf Deutsch.",

  narratorIntro: (name: string) => `Du bist ein Meister-Erzähler in der Welt "${name}".`,
  npcIntro: (name: string, personality: string, location: string) =>
    `${name} ist ein ${personality}-Charakter, der sich in ${location} befindet.`,
  npcInstruction: (name: string) =>
    `Schreibe ${name}'s Antwort im Charakter. Kurz, natürlich und konsistent mit ihrer Persönlichkeit.
Gib nur die Dialogzeile aus, keine zusätzliche Beschreibung.`,
  sceneIntro: (char: string, from: string, to: string) =>
    `Du bist ein Szenen-Agent. Die Spielerfigur ${char} bewegt sich von "${from}" nach "${to}".`,
  noPlace: (name: string) => `Du kennst keinen Ort namens '${name}'.`,
  toWhom: (name: string) => `Wem? Sag '${name} Hallo'.`,
  whatSay: (name: string) => `Was möchtest du ${name} sagen?`,
  noNpc: (name: string) => `Es gibt niemanden namens '${name}'.`,
  unknownCommand: (cmd: string) => `Unbekannter Befehl: ${cmd}. Tippe /help.`,
  uiSettings: "Einstellungen",
  uiBackToChat: "ZUM CHAT",
  uiLlmConfig: "LLM-Konfiguration",
  uiModel: "Modell",
  uiTemperature: "Temperatur",
  uiSave: "Einstellungen speichern",
  uiReset: "Auf Standard zurücksetzen",
  uiCancel: "Abbrechen",
  uiLanguage: "Sprache",
  uiEnabled: "Aktiviert",
  uiDisabled: "Deaktiviert",
  uiSaveSuccess: "Einstellungen gespeichert",
  uiSaveFail: "Speichern fehlgeschlagen",
  uiLoadFail: "Laden fehlgeschlagen",
  uiResetSuccess: "Einstellungen zurückgesetzt",
  uiConfirmReset: "Alle Einstellungen zurücksetzen?",
};
