import type { MessageTable } from "../../i18n/messages";

const en = {
  "image.adjust.kind.levels": "Levels",
  "image.adjust.kind.curves": "Curves",
  "image.adjust.kind.exposure": "Exposure",
  "image.adjust.kind.hueSaturation": "Hue/Saturation",
  "image.adjust.kind.gradientMap": "Gradient Map",
  "image.adjust.kind.blackWhite": "Black & White",
  "image.adjust.kind.colorBalance": "Color Balance",
  "image.adjust.kind.invert": "Invert",
  "image.adjust.kind.grain": "Grain",
  "image.adjust.kind.addNoise": "Add Noise",
  "image.adjust.kind.gaussianBlur": "Gaussian Blur",
  "image.adjust.kind.motionBlur": "Motion Blur",
  "image.adjust.add": "New adjustment layer",
  "image.adjust.change": "Adjust",
  "image.adjust.reset": "Reset",
} satisfies Record<string, string>;

export type AdjustKey = keyof typeof en;
export type AdjustMessages = Record<AdjustKey, string>;

export const adjustMessages: MessageTable<AdjustKey> = {
  en,
  "zh-TW": {
    "image.adjust.kind.levels": "色階",
    "image.adjust.kind.curves": "曲線",
    "image.adjust.kind.exposure": "曝光度",
    "image.adjust.kind.hueSaturation": "色相/飽和度",
    "image.adjust.kind.gradientMap": "漸層對應",
    "image.adjust.kind.blackWhite": "黑白",
    "image.adjust.kind.colorBalance": "色彩平衡",
    "image.adjust.kind.invert": "負片效果",
    "image.adjust.kind.grain": "顆粒",
    "image.adjust.kind.addNoise": "增加雜訊",
    "image.adjust.kind.gaussianBlur": "高斯模糊",
    "image.adjust.kind.motionBlur": "動態模糊",
    "image.adjust.add": "新增調整圖層",
    "image.adjust.change": "調整",
    "image.adjust.reset": "重設",
  },
};
