export type UpscaleOrientationSize = {
  width: number;
  height: number;
};

/**
 * 把「文件里存的像素尺寸」换算成「屏幕上看到的逻辑尺寸」。
 *
 * sharp 的 metadata() 返回的是原始像素宽高，不含 EXIF 方向；而预览图是经过
 * .rotate() 的（按 EXIF 摆正）。不换算就会出现「列表写着 1080x1620、预览却是
 * 横图」，后续按比例排版、显示倍率都会跟着错。
 *
 * EXIF Orientation 语义：
 *   1       正常
 *   2       水平翻转
 *   3       旋转 180°
 *   4       垂直翻转
 *   5       转置（旋转 90° + 翻转）
 *   6       顺时针 90°
 *   7       反转置
 *   8       逆时针 90°
 * 其中 5/6/7/8 都会让宽高互换。
 */
export function normalizeImageOrientationSize(
  width: number,
  height: number,
  orientation?: number,
): UpscaleOrientationSize {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width, height };
  }

  const swapped =
    typeof orientation === "number" &&
    Number.isInteger(orientation) &&
    orientation >= 5 &&
    orientation <= 8;

  return swapped ? { width: height, height: width } : { width, height };
}
