import { EN } from "./en";
import type { LanguagePack } from "./types";

export const FR: LanguagePack = {
  ...EN,
  code: "fr",
  name: "French",
  nativeName: "Français",

  uiSettings: "Paramètres",
  uiBackToChat: "AU CHAT",
  uiSave: "Enregistrer",
  uiReset: "Par défaut",
  uiCancel: "Annuler",
  uiLanguage: "Langue",
  uiLlmConfig: "Configuration LLM",
  uiModel: "Modèle",
  uiTemperature: "Température",
  uiEnabled: "Activé",
  uiDisabled: "Désactivé",
  uiSaveSuccess: "Paramètres enregistrés",
  uiSaveFail: "Échec de l'enregistrement",
  uiLoadFail: "Échec du chargement",
  uiResetSuccess: "Paramètres réinitialisés",
  uiConfirmReset: "Réinitialiser tous les paramètres ?",
};
