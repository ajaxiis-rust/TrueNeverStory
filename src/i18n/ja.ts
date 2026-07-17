import { EN } from "./en";
import type { LanguagePack } from "./types";

export const JA: LanguagePack = {
  ...EN,
  code: "ja",
  name: "Japanese",
  nativeName: "日本語",

  uiSettings: "設定",
  uiBackToChat: "チャットへ",
  uiSave: "保存",
  uiReset: "デフォルト",
  uiCancel: "キャンセル",
  uiLanguage: "言語",
  uiLlmConfig: "LLM設定",
  uiModel: "モデル",
  uiTemperature: "温度",
  uiEnabled: "有効",
  uiDisabled: "無効",
  uiSaveSuccess: "設定を保存しました",
  uiSaveFail: "保存に失敗しました",
  uiLoadFail: "読み込みに失敗しました",
  uiResetSuccess: "設定をリセットしました",
  uiConfirmReset: "すべての設定をリセットしますか？",
};
