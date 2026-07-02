/**
 * i18n — Language packs for TrueNeverStory engine.
 */

export type { Language, LanguagePack } from "./types";
import type { Language, LanguagePack } from "./types";

import { EN } from "./en";
import { RU } from "./ru";
import { DE } from "./de";
import { FR } from "./fr";
import { ES } from "./es";
import { JA } from "./ja";
import { ZH } from "./zh";

const PACKS: Record<Language, LanguagePack> = {
  en: EN, ru: RU, de: DE, fr: FR, es: ES, ja: JA, zh: ZH,
};

let _current: LanguagePack = EN;

export function setLanguage(lang: Language): void {
  _current = PACKS[lang] ?? EN;
}

export function t(): LanguagePack {
  return _current;
}

export function getLanguagePack(lang: Language): LanguagePack {
  return PACKS[lang] ?? EN;
}

export const LANGUAGES: Array<{ code: Language; name: string; native: string }> = [
  { code: "en", name: "English", native: "English" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "fr", name: "French", native: "Français" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "zh", name: "Chinese", native: "中文" },
];
