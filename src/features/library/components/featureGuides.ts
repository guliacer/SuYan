import type { SidebarEntryId } from "../types/library";

export type FeatureGuideStep = {
  title: string;
  description: string;
  /** Every step must point at a stable, visible control or work area. */
  target: string;
};

export type FeatureGuideDefinition = {
  title: string;
  intro: string;
  steps: readonly FeatureGuideStep[];
};

export type FeatureGuideId = SidebarEntryId | "promptCard" | "promptCardMasonry" | "promptDetail" | "canvasResult" | "visualLife";

/**
 * Feature tours are intentionally bound to controls instead of page roots.
 * A selector may contain fallbacks for mutually exclusive logged-in/empty states;
 * FeatureGuide chooses the first visible match.
 */
export const featureGuideDefinitions: Record<FeatureGuideId, FeatureGuideDefinition> = {
  home: {
    title: "素材浏览",
    intro: "先了解窗口布局和素材浏览：可以调整或隐藏边栏、固定窗口位置，再查找、筛选和打开作品。切换到网格后，还可以按卡片的每个区域了解具体用法。",
    steps: [
      { title: "显示或隐藏边栏", description: "点击标题栏左侧的按钮可以隐藏或恢复导航边栏；隐藏后会为画布和素材留出更多空间，恢复后仍保留之前的边栏宽度和位置。", target: '[data-feature-guide="sidebar-toggle"]' },
      { title: "调整边栏宽度", description: "拖动边栏最右侧的分隔线即可调整导航宽度，也可以选中分隔线后使用键盘左右方向键微调。边栏已隐藏时，这一步会先提示左上角的恢复按钮。", target: '[data-feature-guide="sidebar-resize"], [data-feature-guide="sidebar-toggle"]' },
      { title: "固定窗口在最上方", description: "点击标题栏右侧的图钉按钮，可以让素言保持在其他窗口上方；再次点击即可取消置顶，按钮状态会同步显示当前设置。", target: '[data-feature-guide="window-always-on-top"]' },
      { title: "搜索全库", description: "输入标题、文件名、提示词或标签，搜索会同时覆盖本地素材和已整理的信息。", target: '[aria-label="搜索提示词"]' },
      { title: "切换收藏范围", description: "这里可以在全部素材和精选素材之间切换；精选只影响浏览范围，不会删除或移动作品。", target: '[data-feature-guide="gallery-collection"]' },
      { title: "选择展示方式", description: "瀑布流适合快速浏览图片，网格适合对照多组提示词；瀑布流旁边还可以调整列数。切换到网格后会进入卡片分区引导。", target: '[data-feature-guide="gallery-display"]' },
      { title: "调整排序", description: "打开排序后可按导入时间、修改时间等方式排列，并切换升序或降序。", target: '[data-feature-guide="gallery-sort"]' },
      { title: "打开作品", description: "点击结果中的图像或详情入口，会打开完整作品；详情页可以查看提示词、效果图、分类、标签，并继续复制、编辑或收录。", target: '[data-feature-guide="gallery-results"]' },
    ],
  },
  promptCard: {
    title: "提示词卡片",
    intro: "网格卡片把一组作品拆成标题、效果图、提示词、分类标签和操作区，按顺序查看即可完成浏览或处理。",
    steps: [
      { title: "标题与选择状态", description: "卡片顶部显示提示词组标题；在支持批量管理的页面，选择框会记录当前提示词组，后续可批量导出、同步或处理。", target: '[data-feature-guide="prompt-card-title"]' },
      { title: "查看效果图", description: "点击效果图可以打开详情或全屏预览；右下角的数量表示同一提示词组下还有多少张效果图。", target: '[data-feature-guide="prompt-card-media"]' },
      { title: "阅读来源与提示词", description: "图像下方先显示来源，再显示提示词预览；内容过长时只展示摘要，点击查看详情可以阅读完整内容。", target: '[data-feature-guide="prompt-card-content"]' },
      { title: "识别分类与标签", description: "分类用于表达作品的主题归属，标签用于描述主体、风格、镜头等细节；显示“+数量”时，详情页可以查看完整标签。", target: '[data-feature-guide="prompt-card-tags"]' },
      { title: "查看或复制", description: "查看详情可以编辑提示词、查看全部效果图和继续处理；复制提示词会把当前提示词直接放入系统剪贴板。", target: '[data-feature-guide="prompt-card-actions"]' },
    ],
  },
  promptCardMasonry: {
    title: "瀑布流卡片",
    intro: "瀑布流优先展示效果图，适合快速扫看；需要完整提示词、分类标签和操作按钮时，再切换为网格。",
    steps: [
      { title: "浏览效果图", description: "每张图片代表一组提示词的效果图；点击图片可以打开详情或全屏预览，按列从上到下快速浏览。", target: '[data-feature-guide="prompt-card-masonry-media"]' },
      { title: "识别卡片状态", description: "图片上的爱心表示组内有收藏作品，右下角的数量表示同组还有其他效果图；这些状态只用于提示，不会改变原图。", target: '[data-feature-guide="prompt-card-masonry-status"], [data-feature-guide="prompt-card-masonry-media"]' },
      { title: "进入完整卡片", description: "想查看来源、完整提示词、分类标签或复制操作时，点击图片打开详情；也可以切换到网格查看完整卡片结构。", target: '[data-feature-guide="prompt-card-masonry-card"]' },
    ],
  },
  promptDetail: {
    title: "素材详情",
    intro: "详情页把一组提示词的效果图、归类信息、提示词内容和后续操作集中在一起，按区域快速了解使用方式。",
    steps: [
      { title: "查看效果图", description: "左侧显示当前效果图或视频；同组有多张时可以用左右切换，双击图像还可以进入全屏预览。", target: '[data-feature-guide="prompt-detail-media"]' },
      { title: "操作效果图", description: "将鼠标移到效果图下方可以显示操作栏：传送到画布、复制图像、导出到本地、压缩、导入替换、收藏或删除当前效果图；不同素材会按可用能力显示按钮。", target: '[data-feature-guide="prompt-detail-media-actions"]' },
      { title: "确认素材信息", description: "顶部显示来源、模型、提示词类型和标题；标题可以直接编辑，模型入口可以为这组素材重新选择模型。", target: '[data-feature-guide="prompt-detail-header"]' },
      { title: "维护分类", description: "分类用于表达作品的主题或用途；可以点击已有分类进行编辑、移除，也可以通过加号补充分类。", target: '[data-feature-guide="prompt-detail-category"]' },
      { title: "维护标签", description: "标签用于记录主体、风格、镜头等细节；可以编辑、删除或新增标签，AI 按钮会结合当前规则继续识别。", target: '[data-feature-guide="prompt-detail-tags"]' },
      { title: "快速选择 AI 服务", description: "分类、标签和提示词工具栏中的 AI 按钮都可以直接点击执行；在按钮上点击鼠标右键，会打开快速设置，可切换服务商、模型和规则后再执行操作。", target: '[data-feature-guide="prompt-detail-ai-quick-switch"]' },
      { title: "添加参考图", description: "点击提示词工具栏中的图片加号，可以从本地文件或剪贴板添加参考图；添加后可在提示词区域预览和管理。视频素材不提供此入口。", target: '[data-feature-guide="prompt-detail-reference-image"], [data-feature-guide="prompt-detail-prompt-actions"]' },
      { title: "使用提示词工具栏", description: "提示词标题右侧可以切换中文或英文版本、翻译、编辑、撤销修改、AI 优化提示词和进行图像反推；部分按钮会根据当前素材状态启用或禁用。", target: '[data-feature-guide="prompt-detail-prompt-actions"]' },
      { title: "查看和处理提示词", description: "这里可以查看正向提示词与负向提示词，编辑内容并管理参考图；分析结果出现后，还可以查看模型、参数和标签等结构化信息。", target: '[data-feature-guide="prompt-detail-prompt"]' },
      { title: "继续使用作品", description: "底部可以分享作品、复制提示词，或把提示词直接传送到创作画布；这些操作不会改变原始提示词内容。", target: '[data-feature-guide="prompt-detail-actions"]' },
    ],
  },
  categoryLexicon: {
    title: "分类浏览",
    intro: "分类用于表达作品属于什么主题或用途，和标签的细粒度描述分开维护。",
    steps: [
      { title: "从分类菜单定位", description: "左侧按分组和层级展示分类；选择分类后，右侧只显示该分类关联的提示词组。", target: '[data-feature-guide="category-menu"]' },
      { title: "搜索分类或作品", description: "在当前分类工作区搜索词条或提示词组，适合分类很多时快速定位。", target: '[data-feature-guide="lexicon-search"]' },
      { title: "让 AI 继续归纳", description: "AI 分类会根据当前结果补充归属；没有意义或无法判断的内容会被跳过，不会强行生成分类。", target: '[data-feature-guide="lexicon-analysis"]' },
      { title: "维护分类库", description: "通过新增、导入、导出和清空分类整理词库；导入导出会保留层级与分类图像。", target: '[data-feature-guide="lexicon-import-export"]' },
      { title: "处理分类结果", description: "结果区支持批量选择、移出分类、打开详情以及继续调整单个作品的归属。", target: '[data-feature-guide="category-results"]' },
    ],
  },
  tagLexicon: {
    title: "标签浏览",
    intro: "标签用于描述主体、材质、镜头、风格等细节，分析后可以继续归纳到正确分组。",
    steps: [
      { title: "从标签菜单定位", description: "左侧标签层级会把相近标签归到同一组；选择具体标签即可查看关联作品。", target: '[data-feature-guide="tag-menu"]' },
      { title: "搜索标签或提示词组", description: "搜索会限制当前标签结果，适合从大量标签中找到需要修正的内容。", target: '[data-feature-guide="lexicon-search"]' },
      { title: "使用 AI 标签分析", description: "AI 会优先复用已有标签知识和分组规则；不具备明确意义的词不会被随意变成标签。", target: '[data-feature-guide="lexicon-analysis"]' },
      { title: "导入或导出标签库", description: "标签库的名称、分组和封面可以通过导入导出维护，批量管理导出作品时也会携带对应库信息。", target: '[data-feature-guide="lexicon-import-export"]' },
      { title: "整理当前结果", description: "勾选提示词组后可以移出标签、打开详情或继续进行归纳整理，不会误删原始素材。", target: '[data-feature-guide="tag-results"]' },
    ],
  },
  importMaterial: {
    title: "导入素材",
    intro: "不同来源的图像、文档和分享包都从同一个入口进入本地素材库。",
    steps: [
      { title: "先看懂导入菜单", description: "展开菜单后会看到五种来源：本机图片、素材目录、剪贴板、Word 文档和分享包；按来源选择，后续解析方式也不同。", target: '[data-feature-guide="import-menu"]' },
      { title: "导入图片", description: "适合一次选择多张本机图片直接入库。软件会尽量读取图片中的提示词和元数据，并将同组效果图整理到一起。", target: '[data-feature-guide="import-image"]' },
      { title: "添加目录", description: "适合管理已有的图片或视频文件夹；下一步可选择只建立索引，或复制到软件目录，原始文件不会被静默修改。", target: '[data-feature-guide="import-directory"]' },
      { title: "粘贴导入", description: "适合把剪贴板中的图片、分享链接或可识别的网页图文直接带入素材库，软件会尝试解析提示词和媒体。", target: '[data-feature-guide="import-clipboard"]' },
      { title: "导入文档", description: "选择 Word 文档后，软件会提取文档中的图片，并尝试将图片与相邻提示词配对，适合整理图文资料。", target: '[data-feature-guide="import-document"]' },
      { title: "导入分享", description: "选择别人导出的 ZIP 分享包，可恢复图像、提示词、分类库、标签库及已有的作者信息，不需要重新手动整理。", target: '[data-feature-guide="import-share"]' },
    ],
  },
  libraryRoots: {
    title: "素材目录",
    intro: "挂载外部文件夹后，软件可以持续扫描目录变化，同时保留原文件不被改动。",
    steps: [
      { title: "查看已挂载目录", description: "每个目录会显示可用状态、上次扫描时间和监视开关；不可用的目录需要重新定位。", target: '[data-feature-guide="library-roots-list"]' },
      { title: "处理目录操作", description: "可以重新扫描、重新定位、清理失效索引或移除挂载；移除只清理软件索引，不删除磁盘原文件。", target: '[data-feature-guide="library-roots-actions"]' },
      { title: "添加新的素材目录", description: "添加后软件会按目录建立外链索引，适合管理大量本地素材而不重复复制原图。", target: '[data-feature-guide="library-roots-add"]' },
    ],
  },
  promptLibrary: {
    title: "批量管理",
    intro: "这里适合一次处理多组提示词，尤其是同步作品、导出分类标签和批量压缩。",
    steps: [
      { title: "先选择提示词组", description: "用全选、反选或逐组勾选建立当前批次；“仅选未关联作品”可以快速找到还没有账户归属的作品。", target: '[data-feature-guide="prompt-library-selection"]' },
      { title: "搜索和查看统计", description: "搜索会按标题、内容、分类和标签过滤，右侧统计会同步显示结果组数、效果图数和标签数量。", target: '#prompt-library-manager-search' },
      { title: "同步账户作品", description: "登录后可以把已勾选作品关联到当前账户；系统会区分已有作者信息的作品，避免快速选择误替换其他账户。", target: '[data-feature-guide="prompt-library-actions"]' },
      { title: "导出完整分享包", description: "导出所选会携带图像、提示词以及对应的分类库、标签库、分组和封面；导入方不需要重新手动归纳。", target: '[data-feature-guide="prompt-library-actions"]' },
      { title: "打开批处理工具", description: "同一工具栏还可以进入去重检测、图像压缩和视频压缩；这些操作只作用于选定或当前筛选范围。", target: '[data-feature-guide="prompt-library-actions"]' },
    ],
  },
  textPrompts: {
    title: "灵感创作",
    intro: "把零散想法整理为可搜索、可分类、可复用的灵感卡片。",
    steps: [
      { title: "新建和交换灵感", description: "顶部可以新建、粘贴、导入或导出灵感；导出适合备份和跨设备转移文本内容。", target: '[data-feature-guide="prompt-ideas-actions"]' },
      { title: "搜索与排序", description: "搜索标题、内容、分类或标签，再用排序切换最近修改、最近使用和常用灵感。", target: '[data-feature-guide="prompt-ideas-search"]' },
      { title: "切换工作区", description: "全部、收藏、最近使用和最常使用是不同的浏览范围，不会改变灵感本身。", target: '[data-feature-guide="prompt-ideas-workspace"]' },
      { title: "按分类和标签过滤", description: "分类适合主题归属，标签适合细节描述；两个筛选可以组合使用。", target: '[data-feature-guide="prompt-ideas-filters"]' },
      { title: "编辑灵感卡片", description: "结果区可以打开、编辑、复制、收藏或加入待办；卡片尺寸和视图模式也可以按习惯调整。", target: '[data-feature-guide="prompt-ideas-results"]' },
    ],
  },
  todo: {
    title: "待办事项",
    intro: "把创作计划变成可执行的任务，并按日期、工作模式和进度持续跟踪。",
    steps: [
      { title: "新建和管理任务", description: "点击新建事项后填写标题、项目、优先级、截止时间和完成状态；更多菜单可以导入、导出、批量管理，或把文本整理成项目。", target: '[data-feature-guide="todo-actions"]' },
      { title: "切换工作视图", description: "待办用于逐项执行，规划月历用于安排日期和工作日，进度用于查看阶段完成情况，归档用于查找已结束任务。", target: '[data-feature-guide="todo-views"]' },
      { title: "查看当前内容", description: "下方区域会跟随当前视图变化；月历中可切换月份并调整工作日与休息日，进度视图中可切换或新增进度范围。", target: '[data-feature-guide="todo-content"]' },
    ],
  },
  canvas: {
    title: "创作画布",
    intro: "按照“描述画面 → 调整画布 → 配置模型 → 生成 → 处理作品”的顺序完成一次创作。",
    steps: [
      { title: "描述你要创作的画面", description: "正向提示词可以写主体、场景、光线、镜头和风格；负向提示词用于排除不希望出现的内容。", target: '[data-feature-guide="canvas-prompt-editor"]' },
      { title: "拖动文本框调整画布高度", description: "把鼠标放到正向提示词文本框右下角，向上或向下拖动即可改变文本框高度；左侧参数区和右侧创作画布会同步调整到相同高度，方便长提示词和大图预览。", target: '[data-feature-guide="canvas-prompt-resize"]' },
      { title: "收起或展开参数区域", description: "点击创作区左上角的侧栏按钮，可以隐藏整个参数调整区域，让作品画布获得更大空间；收起后会保留一个图标，点击图标即可恢复原来的参数区域。", target: '[data-feature-guide="canvas-creation-panel-toggle"]' },
      { title: "编辑和添加参考图", description: "提示词操作区支持 AI 优化、复制、粘贴、撤销和清空；“添加参考图”可从文件或剪贴板带入视觉参考。", target: '[data-feature-guide="canvas-prompt-actions"]' },
      { title: "集中调整生成参数", description: "比例、尺寸、质量、格式、透明背景和视频参数统一放在参数设置中，修改后会保留你的选择。", target: '[data-feature-guide="canvas-generation-settings"]' },
      { title: "选择服务和模型", description: "当前配置会显示服务商与模型，打开后可切换可用模型；默认模型会按功能记住，下次直接定位到对应项。", target: '[data-feature-guide="canvas-model-config"]' },
      { title: "开始生成并决定归属", description: "生成按钮启动任务；旁边可以控制自动收录和完成提醒，生成后再决定是否导出到素材库。", target: '[data-feature-guide="canvas-generation-actions"]' },
      { title: "处理生成结果", description: "结果会在右侧画布中以最大可视效果展示；生成后可以预览、复制、导出、查看提示词或收录到素材库。", target: '[data-feature-guide="canvas-output"]' },
    ],
  },
  canvasResult: {
    title: "生成结果预览",
    intro: "这里是生成完成后的大图预览；可以切换结果、处理当前作品，并查看本次生成使用的提示词。",
    steps: [
      { title: "查看完整作品", description: "中央区域会按原始比例显示当前生成的图像或视频，并尽量利用可用空间展示细节。", target: '[data-feature-guide="canvas-fullscreen-media"]' },
      { title: "切换多张结果", description: "同一次生成有多张结果时，使用图像两侧的上一张、下一张按钮切换；底部编号会标记当前所在位置。", target: '[data-feature-guide="canvas-fullscreen-navigation"], [data-feature-guide="canvas-fullscreen-media"]' },
      { title: "处理当前作品", description: "右侧操作栏可以导出文件、收录到素材库或复制图像到系统剪贴板；收录状态会即时反馈。", target: '[data-feature-guide="canvas-fullscreen-actions"]' },
      { title: "查看生成信息", description: "点击信息按钮展开提示词面板，可查看本次实际使用的提示词、模型、尺寸和生成用时，并复制提示词。", target: '[data-feature-guide="canvas-fullscreen-prompt"]' },
      { title: "退出全屏预览", description: "完成查看后点击右上角关闭，返回创作画布；生成结果仍会保留在当前画布中。", target: '[data-feature-guide="canvas-fullscreen-close"]' },
    ],
  },
  webAssistant: {
    title: "网页助手",
    intro: "在浏览器中的网页工具与本地素材库之间快速传递提示词和截图。",
    steps: [
      { title: "选择站点或添加网址", description: "先在站点目录选择工具，或输入并保存自己的网址；选择后网页会加载到下方工作区，站点切换不会修改本地素材。", target: '[data-feature-guide="web-assistant-directory"]' },
      { title: "在网页与素材库之间传递内容", description: "网页加载后，顶部按钮可以复制、粘贴或清空提示词；保存会把当前截图和已读取的提示词带回素材库，便于继续整理。", target: '[data-feature-guide="web-assistant-actions"]' },
      { title: "选择浏览方式", description: "普通模式适合边看网页边操作；专注模式会扩大网页工作区；需要完整登录、上传或浏览器扩展能力时，使用系统浏览器打开。", target: '[data-feature-guide="web-assistant-view"]' },
    ],
  },
  promptSites: {
    title: "资源推荐",
    intro: "集中浏览提示词、模型和创作工具站点，收藏后更容易再次找到。",
    steps: [
      { title: "按目录筛选资源", description: "推荐内容按提示词、模型和工具等类型分组；先切换目录，再根据站点标题和说明判断是否符合当前任务。", target: '[data-feature-guide="prompt-sites-catalog"]' },
      { title: "收藏常用站点", description: "点击站点卡片上的星标即可置顶，之后优先显示在收藏区域；取消星标只改变排序，不会删除站点。", target: '[data-feature-guide="prompt-sites-star"]' },
      { title: "预览、打开或复制网址", description: "有截图的站点可以先打开图片预览；确认后可直达站点，或复制网址到浏览器、网页助手继续使用。", target: '[data-feature-guide="prompt-sites-actions"]' },
    ],
  },
  aiSettings: {
    title: "模型配置",
    intro: "先配置连接，再按能力和功能指定模型，画布与 AI 分析才会使用正确的服务。",
    steps: [
      { title: "选择或新增 AI 连接", description: "先在左侧点击已有连接切换配置；没有连接时点击加号新增。连接列表还支持拖动排序，带星标的连接是全局默认连接。", target: '[data-feature-guide="ai-connection-list"]' },
      { title: "填写接口地址和 API Key", description: "在当前连接中填写服务商提供的接口地址和 API Key。接口地址通常以 /v1 结尾；也可以使用字段旁的快速导入，一次带入接口、密钥和模型。", target: '[data-feature-guide="ai-connection-credentials"]' },
      { title: "测试、启用并设为默认", description: "填写后先点击“测试 API”确认连接可用，再打开“已停用”开关启用。需要让新连接服务所有功能时，在更多操作中选择“设为默认”。", target: '[data-feature-guide="ai-connection-actions"]' },
      { title: "查询并维护实际模型", description: "连接可用后点击“查询模型”读取服务商返回的真实模型名称。选中模型可作为该连接默认模型；也可以手动添加模型，并勾选它支持的生图、图像理解或文本能力。", target: '[data-feature-guide="ai-model-list"]' },
      { title: "选择要配置的 AI 功能", description: "在规则设置左侧选择具体功能，例如生图、提示词分析或图片理解。每个功能可以独立配置，列表中的能力和数量提示可帮助你判断当前是否已经配置。", target: '[data-feature-guide="ai-rules-actions"]' },
      { title: "绑定模型并维护规则内容", description: "选定功能后，先在右侧上方选择服务商和适用模型，再在下方规则表中勾选要使用的规则。需要调整效果时可新增、编辑或删除规则，修改会自动保存。", target: '[data-feature-guide="ai-rules-configuration"]' },
    ],
  },
  nsfwSettings: {
    title: "内容分级",
    intro: "控制敏感内容的识别、模糊和批量校正方式，避免素材浏览时误展示。",
    steps: [
      { title: "选择识别方式", description: "可以根据设备和依赖情况选择本地、远程或自动识别；本地模块未安装时页面会给出明确提示。", target: '[aria-label="选择 NSFW 分级方式"]' },
      { title: "选择图片理解模型", description: "使用远程识别时，选择具备图片理解能力的连接和模型，并先确认模型列表中确实存在。", target: '[aria-label="选择图片理解模型"], [aria-label="选择 NSFW 分级方式"]' },
      { title: "控制模糊与分级速度", description: "自动分级、默认模糊和速度会影响新素材的处理方式；修改后会自动保存。", target: '[aria-label="选择 NSFW 分级速度"], [aria-label="选择 NSFW 分级方式"]' },
      { title: "批量补充分级", description: "已有素材可以补充分级或重新校正；重新校正会重新读取规则，不会删除原图。", target: '[data-feature-guide="nsfw-batch-actions"]' },
    ],
  },
  systemPreferences: {
    title: "系统设置",
    intro: "系统设置按左侧分区组织；点击下一步会依次打开每个设置区域并说明实际用途，视觉生命和主题另有专属引导。",
    steps: [
      { title: "网络代理", description: "用于网页助手、远程下载和其他网络请求。可以选择直连、系统代理或自定义代理；自定义模式下填写代理地址和绕过地址，必要时先自动检测再测试连接。", target: '[data-feature-guide="system-preferences-panel-proxy"]' },
      { title: "创作页面背景", description: "控制标题栏下方主工作区的整页背景。可以使用默认柔雾、经典白色、自定义颜色或本地图片；选择后会自动保存，生成卡片本身的效果不受影响。", target: '[data-feature-guide="system-preferences-panel-canvasBackground"]' },
      { title: "界面布局", description: "拖动工作区宽度滑块调整背景层与主工作区的比例，中央预览会同步展示结果。数值越高，创作区越宽；修改会立即应用。", target: '[data-feature-guide="system-preferences-panel-layout"]' },
      { title: "边栏入口", description: "按分组控制左侧导航是否显示。固定入口不能关闭，其他入口可用复选框隐藏或恢复；设置会即时保存，并影响之后的导航区域。", target: '[data-feature-guide="system-preferences-panel-sidebar"]' },
      { title: "模块管理", description: "管理可选功能和运行依赖。可用模块可以启用或停用，视频处理和本地 NSFW 识别等依赖在这里安装、恢复或删除；删除前会提示受影响的功能。", target: '[data-feature-guide="system-preferences-panel-modules"]' },
      { title: "启动图库", description: "管理软件启动时轮播的图片。点击图片可以预览，使用“添加图片”或“粘贴图片”导入，单张图片可以移除，也可以恢复内置默认图库；修改会自动保存。", target: '[data-feature-guide="system-preferences-panel-startupGallery"]' },
    ],
  },
  visualLife: {
    title: "视觉生命",
    intro: "视觉生命把图像内部的扫光和卡片外部的扩散光效分开控制；首次使用可以按这四步选择适合自己的组合。",
    steps: [
      { title: "开启图像内扫光", description: "扫光只在图像内部掠过，默认开启；关闭后，图像仍可独立使用卡片外部光效。", target: '[data-feature-guide="visual-life-sheen-toggle"]' },
      { title: "开启卡片外部光效", description: "外部光效从卡片边缘向外扩散，不覆盖图像内容；关闭后，只保留图像内扫光。", target: '[data-feature-guide="visual-life-outer-toggle"]' },
      { title: "选择外部效果池", description: "默认只启用星尘、宇宙尘埃和流星；可以按喜好增加或减少效果，气泡效果已移除。", target: '[data-feature-guide="visual-life-effect-pool"]' },
      { title: "调整模式与强度", description: "模式决定如何选取效果，强度控制粒子数量和透明度；设置只影响悬停时的外扩效果，不改变图像尺寸。", target: '[data-feature-guide="visual-life-mode"], [data-feature-guide="visual-life-intensity"]' },
    ],
  },
  logExport: {
    title: "日志导出",
    intro: "遇到登录、导入或生图异常时，导出脱敏日志可以帮助快速定位问题。",
    steps: [
      { title: "筛选日志级别", description: "默认偏向错误信息，也可以扩大到警告、普通信息或全部调试日志；级别越详细，文件内容越多。", target: '[data-feature-guide="log-level-filter"]' },
      { title: "限定时间范围", description: "重现问题后优先导出今天或近 7 天，既方便定位也能减少无关日志。", target: '[data-feature-guide="log-time-range"]' },
      { title: "选择反馈格式", description: "TXT 适合快速阅读，ZIP 适合提交反馈；日志会经过脱敏处理，不包含密钥和密码。", target: '[data-feature-guide="log-export-format"]' },
      { title: "导出或提交反馈", description: "先导出文件保存到本地，也可以直接进入 GitHub 反馈并附加生成的日志包。", target: '[data-feature-guide="log-export-actions"]' },
    ],
  },
  account: {
    title: "账户",
    intro: "账户引导同时覆盖登录、资料确认和多登录方式关联。授权后仍需确认资料，作品归属不会自动误切换。",
    steps: [
      { title: "选择自己的登录方式", description: "未登录时可用邮箱、Google、Linux.do、GitHub或设备验证码进入真实授权流程；密码在身份服务页面验证。", target: '[data-feature-guide="account-login-methods"], [data-feature-guide="account-profile"]' },
      { title: "确认昵称与头像", description: "授权返回后可以选择当前资料、新账户资料或自定义昵称和头像，确认后才会切换或建立归属。", target: '[data-feature-guide="account-profile"], [data-feature-guide="account-login-methods"]' },
      { title: "关联多个登录方式", description: "已登录后在已绑定账号区域关联新的方式；关联只增加入口，不会替换当前账户，也不会把作品转给其他用户。", target: '[data-feature-guide="account-identities"], [data-feature-guide="account-login-methods"]' },
    ],
  },
  appearance: {
    title: "主题",
    intro: "主题设置不仅改变颜色，也会同步影响导航区、按钮、画布背景和工作区层级。",
    steps: [
      { title: "切换浅色或深色模式", description: "显示模式控制整体明暗，主题预设和自定义颜色会在当前模式下即时预览。", target: '[aria-label="显示模式"]' },
      { title: "选择主题预设", description: "预设会统一调整主色、次要色、第三色和界面材质；切换后画布与外部主题区保持同一套颜色来源。", target: '[aria-label="主题预设"]' },
      { title: "细调颜色与背景", description: "可以自定义主色、次要色、第三色、透明度、画布背景颜色或背景图像，设置会按主题分别记忆。", target: '[data-feature-guide="appearance-colors"]' },
    ],
  },
  about: {
    title: "关于",
    intro: "这里可以确认版本、查看主要能力、重新打开功能引导和检查更新。",
    steps: [
      { title: "确认当前版本", description: "反馈问题或核对发布内容时，先查看软件名称和版本号。", target: '[data-feature-guide="about-version"]' },
      { title: "查看功能与重新引导", description: "功能区可以展开版本能力摘要，也可以随时重新查看完整的页面功能引导。", target: '[data-feature-guide="about-features"]' },
      { title: "检查更新并备份", description: "检查更新后如有新版本，升级前先打开 data 数据目录并复制备份，再进行升级。", target: '[data-feature-guide="about-update"]' },
    ],
  },
};
