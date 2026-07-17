import { EN } from "./en";
import type { LanguagePack } from "./types";

export const ZH: LanguagePack = {
  ...EN,
  code: "zh",
  name: "Chinese",
  nativeName: "中文",

  uiSettings: "设置",
  uiBackToChat: "返回聊天",
  uiSave: "保存",
  uiReset: "恢复默认",
  uiCancel: "取消",
  uiLanguage: "语言",
  uiLlmConfig: "LLM配置",
  uiModel: "模型",
  uiTemperature: "温度",
  uiEnabled: "启用",
  uiDisabled: "禁用",
  uiSaveSuccess: "设置已保存",
  uiSaveFail: "保存失败",
  uiLoadFail: "加载失败",
  uiResetSuccess: "设置已重置",
  uiConfirmReset: "重置所有设置？",
};
