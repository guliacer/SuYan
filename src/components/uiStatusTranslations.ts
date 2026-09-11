type StatusTranslator = (text: string) => string | undefined;

const staticStatusTranslations: Record<string, string> = {
  "视频依赖安装完成。": "Video dependencies installed.",
  "模型配置稍后再试。": "Try loading the model settings again later.",
  "网络代理读取失败。": "Could not read the network proxy settings.",
  "画布草稿自动保存失败，请稍后重试。": "Could not save the canvas draft automatically. Try again later.",
  "画布背景保存失败，请重试。": "Could not save the canvas background. Try again.",
  "工作区宽度自动保存失败，请稍后重试。": "Could not save the workspace width automatically. Try again later.",
  "素材浏览位置保存失败，请稍后重试。": "Could not save the library position. Try again later.",
  "正在保存 API 设置...": "Saving API settings...",
  "已保存远程模型配置。": "Remote model settings saved.",
  "已关闭远程 AI。": "Remote AI disabled.",
  "API 设置保存失败。": "Could not save API settings.",
  "已导入 AI 设置备份。": "AI settings backup imported.",
  "所选 API 或模型不可用于当前功能。": "The selected API or model cannot be used for this feature.",
  "API 模型偏好保存失败。": "Could not save the API model preference.",
  "正在测试远程 AI 连接...": "Testing the remote AI connection...",
  "远程 AI 连接成功。": "Remote AI connection succeeded.",
  "正在查询模型列表...": "Fetching the model list...",
  "标签已识别，但归纳依据保存失败。本次未应用，请检查本地目录权限后重试。": "Tags were recognized, but the organization knowledge could not be saved. Nothing was applied; check local folder permissions and try again.",
  "当前素材没有提示词内容，请改用「从效果图分析」。": "This material has no prompt text. Use “Analyze from result image” instead.",
  "远程 AI 未配置，已使用本地分析。": "Remote AI is not configured. Local analysis was used.",
  "未识别到有检索价值的标签，未新增标签。": "No useful searchable tags were found. No tags were added.",
  "远程 AI 结果不可用，未更新图片识别结果。": "The remote AI result was unavailable. Image analysis was not updated.",
  "远程 AI 结果不可用，已使用本地分析。": "The remote AI result was unavailable. Local analysis was used.",
  "远程 AI 暂不可用，已使用本地分析。": "Remote AI is temporarily unavailable. Local analysis was used.",
  "正在优化提示词...": "Optimizing the prompt...",
  "已完成提示词优化。": "Prompt optimization completed.",
  "请先输入需要翻译的提示词。": "Enter a prompt to translate first.",
  "正在翻译提示词...": "Translating the prompt...",
  "已完成提示词翻译。": "Prompt translation completed.",
  "需要可用效果图才能进行图像反推。": "A usable result image is required for image-to-prompt.",
  "正在进行图像反推...": "Running image-to-prompt...",
  "已完成图像反推。": "Image-to-prompt completed.",
  "网络代理已保存并应用。": "Network proxy saved and applied.",
  "正在检测系统代理和本机代理软件...": "Detecting the system proxy and local proxy apps...",
  "正在打开网页...": "Opening the web page...",
  "已在浏览器打开网页。": "Opened the web page in the browser.",
  "正在打开视频依赖下载页...": "Opening the video dependency download page...",
  "已在浏览器打开视频依赖下载页。": "Opened the video dependency download page in the browser.",
  "正在打开本地 NSFW 模块下载页...": "Opening the local NSFW module download page...",
  "已在浏览器打开本地 NSFW 模块下载页。": "Opened the local NSFW module download page in the browser.",
  "正在导入素材...": "Importing materials...",
  "已取消导入。": "Import cancelled.",
  "未选择素材。": "No material selected.",
  "正在复制目录素材到软件目录...": "Copying folder materials into the app directory...",
  "未选择素材目录。": "No material folder selected.",
  "正在选择并扫描素材目录...": "Choosing and scanning the material folder...",
  "目录监视已开启。": "Folder monitoring enabled.",
  "目录监视已关闭。": "Folder monitoring disabled.",
  "正在保存素材目录顺序...": "Saving material-folder order...",
  "素材目录顺序已保存。": "Material-folder order saved.",
  "正在重新定位素材目录...": "Relocating the material folder...",
  "目录已重新定位，外链素材已恢复。": "Folder relocated and external materials restored.",
  "正在移除素材目录...": "Removing the material folder...",
  "正在校验外链素材...": "Validating external materials...",
  "没有可导入的图片。": "There are no images to import.",
  "正在同步作品归属…": "Syncing work ownership…",
  "已取消同步作品。": "Work sync cancelled.",
  "同步作品失败，请重试。": "Could not sync works. Try again.",
  "正在导入 Word 文档...": "Importing the Word document...",
  "正在导入剪贴板素材...": "Importing clipboard materials...",
  "正在导入剪贴板图片...": "Importing clipboard images...",
  "正在下载网络素材...": "Downloading the web material...",
  "正在补全网络素材信息...": "Completing web material information...",
  "网络素材已下载到本地。": "Web material downloaded locally.",
  "网络素材信息已更新。": "Web material information updated.",
  "正在生成视频关键帧...": "Generating video keyframes...",
  "已刷新视频关键帧。": "Video keyframes refreshed.",
  "正在导入参考图...": "Importing reference images...",
  "正在删除参考图...": "Deleting reference images...",
  "已删除参考图。": "Reference images deleted.",
  "正在从剪切板导入参考图...": "Importing reference images from the clipboard...",
  "已从剪切板导入参考图。": "Reference images imported from the clipboard.",
  "正在从链接下载参考图...": "Downloading reference images from the link...",
  "已从链接导入参考图。": "Reference images imported from the link.",
  "正在导入素材包...": "Importing the share package...",
  "分享包导入失败，请重试或查看日志。": "Share-package import failed. Try again or check the logs.",
  "分享包导出失败，请重试或查看日志。": "Share-package export failed. Try again or check the logs.",
  "已保存。": "Saved.",
  "正在清空分类…": "Clearing categories…",
  "正在清空标签…": "Clearing tags…",
  "已清空素材分类（系统目录保留）。": "Material categories cleared; system folders were kept.",
  "已清空素材标签与标签词库。": "Material tags and the tag lexicon were cleared.",
  "清空词库失败，请重试。": "Could not clear the lexicon. Try again.",
  "已更新标签。": "Tags updated.",
  "词库保存连接中断，请重试。": "The lexicon save connection was interrupted. Try again.",
  "已保存词库。": "Lexicon saved.",
  "分类名称不能为空。": "Category name cannot be empty.",
  "无法创建或更新分类。": "Could not create or update the category.",
  "未找到该分类，可能已被删除。": "The category was not found. It may have been deleted.",
  "删除分类失败，请重试。": "Could not delete the category. Try again.",
  "正在导入词库文件...": "Importing the lexicon file...",
  "未选择词库文件。": "No lexicon file selected.",
  "正在上传词库图像...": "Uploading lexicon images...",
  "已上传词库图像。": "Lexicon images uploaded.",
  "已取消喜爱图片。": "Image removed from favorites.",
  "已加入喜爱图片。": "Image added to favorites.",
  "已取消星标。": "Star removed.",
  "已星标并置顶。": "Starred and pinned.",
  "该网址已在「我的网址」中。": "This URL is already in My URLs.",
  "已保存到「我的网址」。": "Saved to My URLs.",
  "已从「我的网址」移除。": "Removed from My URLs.",
  "已复制图片。": "Image copied.",
  "已导出文件。": "File exported.",
  "正在扫描重复文件...": "Scanning for duplicate files...",
  "正在压缩图像...": "Compressing images...",
  "需要视频依赖（FFmpeg）才能压缩视频，请先安装。": "Video dependencies (FFmpeg) are required to compress videos. Install them first.",
  "正在压缩视频...": "Compressing videos...",
  "已取消压缩。": "Compression cancelled.",
  "必需模块不可删除。": "Required modules cannot be deleted.",
  "正在安装模块...": "Installing the module...",
  "已取消安装。": "Installation cancelled.",
  "模块安装失败，依赖校验未通过。": "Module installation failed because dependency verification did not pass.",
  "模块安装成功，已自动校验并启用。": "Module installed, verified, and enabled automatically.",
  "本地 NSFW 识别模块未安装或已停用，请先在模块管理中安装。": "The local NSFW recognition module is missing or disabled. Install it in Module Management first.",
  "没有可用的 NSFW 分级方式。": "No NSFW rating method is available.",
  "没有需要补充分级的图片。": "No images need additional rating.",
  "NSFW 分级暂不可用，未更新图片。": "NSFW rating is temporarily unavailable. Images were not updated.",
  "导入素材超时，请检查网络或代理后重试。": "Material import timed out. Check the network or proxy and try again.",
};

const dynamicStatusTranslators: StatusTranslator[] = [
  (text) => {
    const match = text.match(/^已查询到 (\d+) 个模型。$/);
    return match ? `Found ${match[1]} models.` : undefined;
  },
  (text) => {
    const match = text.match(/^代理连接测试成功（HTTP (\d+)）。$/);
    return match ? `Proxy connection succeeded (HTTP ${match[1]}).` : undefined;
  },
  (text) => {
    const match = text.match(/^已在浏览器打开 (.+)。$/);
    return match ? `Opened ${match[1]} in the browser.` : undefined;
  },
  (text) => {
    const match = text.match(/^正在(?:导入|复制|扫描)：(.+) \((\d+)\/(\d+)\)$/);
    return match ? `Processing: ${match[1]} (${match[2]}/${match[3]})` : undefined;
  },
  (text) => {
    const match = text.match(/^已扫描 (.+)，新增 (\d+) 个素材。$/);
    return match ? `Scanned ${match[1]}; added ${match[2]} materials.` : undefined;
  },
  (text) => {
    const match = text.match(/^正在扫描 (.+)\.\.\.$/);
    return match ? `Scanning ${match[1]}...` : undefined;
  },
  (text) => {
    const match = text.match(/^扫描完成，新增 (\d+) 个素材，已跳过 (\d+) 个。$/);
    return match ? `Scan complete: ${match[1]} materials added, ${match[2]} skipped.` : undefined;
  },
  (text) => {
    const match = text.match(/^正在(?:开启|关闭) (.+) 监视\.\.\.$/);
    return match ? `${text.startsWith("正在开启") ? "Enabling" : "Disabling"} monitoring for ${match[1]}...` : undefined;
  },
  (text) => {
    const match = text.match(/^正在解析 (\d+) 张图片的提示词…$/);
    return match ? `Parsing prompts from ${match[1]} images…` : undefined;
  },
  (text) => {
    const match = text.match(/^正在保存 (\d+) 个(.+)…$/);
    return match ? `Saving ${match[1]} ${match[2]}…` : undefined;
  },
  (text) => {
    const match = text.match(/^已保存 (\d+) 个(.+)到素材库。$/);
    return match ? `Saved ${match[1]} ${match[2]} to the library.` : undefined;
  },
  (text) => {
    const match = text.match(/^已关联 (\d+) 张素材，跳过 (\d+) 张已有作者信息的素材。$/);
    return match ? `Associated ${match[1]} materials; skipped ${match[2]} with existing author information.` : undefined;
  },
  (text) => {
    const match = text.match(/^已导入 (\d+) 张参考图。$/);
    return match ? `Imported ${match[1]} reference images.` : undefined;
  },
  (text) => {
    const match = text.match(/^已导入 (\d+) 条素材。$/);
    return match ? `Imported ${match[1]} materials.` : undefined;
  },
  (text) => {
    const match = text.match(/^已删除 (\d+) 条提示词。$/);
    return match ? `Deleted ${match[1]} prompts.` : undefined;
  },
  (text) => {
    const match = text.match(/^已完成提示词分类识别。$/);
    return match ? "Prompt category recognition completed." : undefined;
  },
  (text) => text === "已完成提示词标签识别。" ? "Prompt tag recognition completed." : undefined,
  (text) => text === "已完成图片分类识别。" ? "Image category recognition completed." : undefined,
  (text) => text === "已完成图片标签识别。" ? "Image tag recognition completed." : undefined,
  (text) => text === "已完成 NSFW 分级。" ? "NSFW rating completed." : undefined,
  (text) => text === "已生成 AI 词条。" ? "AI entries generated." : undefined,
  (text) => text === "已完成提示词参数分析。" ? "Prompt parameter analysis completed." : undefined,
  (text) => text === "正在识别提示词分类..." ? "Recognizing prompt categories..." : undefined,
  (text) => text === "正在识别提示词标签..." ? "Recognizing prompt tags..." : undefined,
  (text) => text === "正在识别图片分类..." ? "Recognizing image categories..." : undefined,
  (text) => text === "正在识别图片标签..." ? "Recognizing image tags..." : undefined,
  (text) => text === "正在进行 NSFW 分级..." ? "Running NSFW rating..." : undefined,
  (text) => text === "正在生成 AI 词条..." ? "Generating AI entries..." : undefined,
  (text) => text === "正在进行提示词参数分析..." ? "Analyzing prompt parameters..." : undefined,
];

export function translateUiStatusText(text: string): string | undefined {
  return staticStatusTranslations[text] ?? dynamicStatusTranslators.map((translate) => translate(text)).find(Boolean);
}
