import { EN } from "./en";
import type { LanguagePack } from "./types";

export const ES: LanguagePack = {
  ...EN,
  code: "es",
  name: "Spanish",
  nativeName: "Español",

  systemPrompt: "Responde solo en español.",
  uiSettings: "Ajustes",
  uiBackToChat: "AL CHAT",
  uiSave: "Guardar",
  uiReset: "Por defecto",
  uiCancel: "Cancelar",
  uiLanguage: "Idioma",
  uiLlmConfig: "Configuración LLM",
  uiModel: "Modelo",
  uiTemperature: "Temperatura",
  uiEnabled: "Activado",
  uiDisabled: "Desactivado",
  uiSaveSuccess: "Ajustes guardados",
  uiSaveFail: "Error al guardar",
  uiLoadFail: "Error al cargar",
  uiResetSuccess: "Ajustes restablecidos",
  uiConfirmReset: "¿Restablecer todos los ajustes?",
};
