import { uniqueTags } from "./buildLibraryFile";
import {
  parsePromptTemplateSegments,
  getPromptSectionKeyByVariable,
  normalizePromptSectionValue,
  promptSectionMeta,
  promptSplitSectionOrder,
  resolvePromptSectionKeyForValue,
  resolvePromptTemplateText,
  splitPromptToTemplate,
  type PromptSplitSection,
  type PromptSplitSectionKey,
} from "./promptSplit";

export type PromptReplacementChip = {
  id: string;
  sectionKey: PromptSplitSectionKey;
  label: string;
  variable: string;
  value: string;
  templateText: string;
};

export type PromptAnalysisSection = PromptSplitSection & {
  chips: PromptReplacementChip[];
};

export type PromptAnalysisResult = {
  chips: PromptReplacementChip[];
  sections: PromptAnalysisSection[];
  suggestedTags: string[];
  suggestedCategories: string[];
  primaryCategory: string;
  template: string;
};

type CategorySuggestionOptions = {
  includeFallback?: boolean;
  skipHeavyAnalysis?: boolean;
};

type CategoryInput = {
  title: string;
  prompt: string;
  tags: string[];
  currentCategory?: string;
  knownCategories?: readonly string[];
};

type PromptOptionAnalysisInput = {
  prompt: string;
  optionLabel?: string;
  optionValue?: string;
  optionVariable?: string;
};

const fallbackCategories = [
  "图像生成",
  "人像摄影",
  "插画设计",
  "海报设计",
  "产品摄影",
  "时尚大片",
  "赛博朋克",
  "水彩手绘",
  "写实厚涂",
  "影视概念",
];

const categoryRules: Array<{ label: string; keywords: RegExp[] }> = [
  { label: "人像摄影", keywords: [/人像|肖像|面部|妆容|发型|服装|姿态|手势|portrait|face|makeup|fashion/i] },
  { label: "插画设计", keywords: [/插画|2d|平面插画|水彩|手绘|浮世绘|illustration|watercolor|ukiyo/i] },
  { label: "艺术风格", keywords: [/立体主义|毕加索|超现实主义|弗里达|现实主义|列宾|cubism|surrealism|realism/i] },
  { label: "赛博朋克", keywords: [/赛博朋克|霓虹|未来感|cyberpunk|neon/i] },
  { label: "产品摄影", keywords: [/产品|商品|品牌|手持道具|包装|静物|product|brand|packshot|still life/i] },
  { label: "海报设计", keywords: [/海报|字体|文本内容|排版|标语|标题|poster|typography|slogan/i] },
  { label: "影视概念", keywords: [/电影感|镜头|景别|光影|景深|构图|cinematic|shot|lighting|composition/i] },
  { label: "图像生成", keywords: [/画面|图像|风格|比例|颜色|氛围|midjourney|stable diffusion|dall.?e|flux|imagen/i] },
];

const genericPromptLabels = new Set(
  [
    "未分类",
    "网页分享",
    "本地提示词",
    "网络提示词",
    "图像提示词",
    "视频提示词",
    "X",
    "Twitter",
    "WebToMind",
    "AIART.PICS",
    "Prompt Fill",
    "GPT-Image-2",
    "GPT Image 2",
    "图像提示词",
    "图片提示词",
    "图像标签",
    "图片标签",
    "标签识别",
    "分类识别",
    "图像识别",
    "图片识别",
    "图像分析",
    "图片分析",
    "识别",
    "标签",
    "分类",
  ].map((label) => label.toLowerCase()),
);

const sectionCuePatterns: Partial<Record<PromptSplitSectionKey, RegExp[]>> = {
  image_style: [
    /浮世绘|ukiyo|立体主义|cubism|超现实|surreal|现实主义|realism|2d|插画|写实|厚涂|赛博朋克|cyberpunk|水彩|手绘|手稿|二次元|风格|艺术|视觉|卡通|皮克斯|pixar|渲染|古典风|style|illustration/i,
  ],
  shot_size: [/全景|远景|中景|近景|特写|大特写|close-?up|medium shot|long shot|wide shot|full shot/i],
  aspect_ratio: [/\b(?:1:1|3:3|16:9|9:16|4:3|3:4|2:3|3:2|21:9)\b|横屏|竖屏|横构图|竖构图|横版|竖版|方图|宽屏|aspect ratio|horizontal|vertical/i],
  camera_angle: [/拍摄角度|视角|机位|俯视|仰视|平视|侧视|鸟瞰|航拍|顶视|低机位|高机位|top view|low angle|high angle|eye level|aerial/i],
  composition: [/构图|居中|对称|三分法|黄金分割|留白|负空间|引导线|框架式|透视|composition|symmetry|rule of thirds|negative space|leading lines/i],
  depth_of_field: [/景深|浅景深|深景深|虚化|焦外|散景|清晰背景|depth of field|bokeh|shallow focus|deep focus/i],
  subject_position: [/人物主体定位|主体定位|人物数量|单人|多人|画面占比|占据画面|中心偏左|中心偏右|画面中央|视觉重心|近距离半身|身体朝向|subject position|single subject/i],
  age_character: [/年龄气质|年龄感|视觉年龄|少年感|青年感|成熟感|沉稳感|自然松弛|清冷气质|温柔气质|自信气质|高级感|文艺感|temperament|visual age/i],
  body_frame: [/身体结构|身材骨架|身材比例|肩宽|肩部|腰线|腰臀比例|四肢|体态|S型曲线|body frame|body proportion|shoulder width/i],
  face_shape: [/脸型轮廓|脸型|脸部轮廓|面部轮廓|鹅蛋脸|瓜子脸|圆脸|方脸|长脸|椭圆脸|下颌线|face shape|jawline/i],
  eyebrow_detail: [/眉毛细节|眉毛|平直眉|弯眉|眉峰|眉毛粗细|眉毛浓淡|eyebrow|brow shape/i],
  eye_detail: [/眼睛眼神|眼睛|眼型|双眼皮|单眼皮|杏仁眼|狐狸眼|眼神|视线|凝视|gaze|eye shape/i],
  nose_detail: [/鼻子结构|鼻子|鼻梁|鼻头|鼻型|高挺鼻梁|精致鼻型|nose detail|nose shape/i],
  lip_detail: [/嘴唇唇形|嘴唇|唇形|嘴角|厚唇|薄唇|饱满唇形|lip detail|lip shape/i],
  skin_texture: [/肤质纹理|皮肤纹理|皮肤细节|毛孔|肌理|细微肌理|通透|自然光泽|skin texture|pores/i],
  face_makeup: [/面部|脸部|五官|妆容|眼妆|唇妆|腮红|睫毛|眼线|眉形|皮肤|肤色|表情|face|makeup|skin tone|lipstick/i],
  hair_accessory: [/发型|头发|刘海|卷发|长发|短发|盘发|编发|头饰|发饰|发簪|皇冠|帽子|hair|hairstyle|headpiece|headdress/i],
  clothing: [/服装|衣服|上衣|外套|裙|裤|礼服|婚纱|旗袍|盔甲|制服|刺绣|蕾丝|丝绸|clothing|outfit|dress|suit|jacket|fabric/i],
  pose: [/动作|姿态|姿势|站姿|坐姿|蹲姿|奔跑|跳跃|回眸|转身|倚靠|舞姿|pose|posture|standing|sitting|running|jumping/i],
  hand_gesture: [/手部|手势|手指|双手|单手|指尖|握拳|比心|摊手|抬手|合十|hand gesture|hands?|fingers?/i],
  hand_prop: [/手上道具|手持|手里拿|拿着|握着|捧着|举着|托着|holding|held in hand|in hand/i],
  light_shadow: [/光影|阴影|高光|暗部|明暗|轮廓光|柔光|硬光|自然光|窗光|棚灯|霓虹光|反射光|lighting|shadow|highlight|soft light|hard light|neon light/i],
  light_receiving: [/受光|侧受光|正面受光|背光|逆光轮廓|半明半暗|面部受光|主体受光|光线落在|lit from|frontlit|side lit|backlit|rim lit/i],
  lighting_source_type: [/光源类型|自然光源|人造光源|多光源关系|太阳光|天空散射光|窗户光|摄影灯|霓虹灯|light source/i],
  lighting_source_position: [/光源位置|画面左侧|画面右侧|左前方|右前方|背后光源|顶部光源|source position/i],
  lighting_direction: [/光线方向|左侧入射|右侧入射|正面照射|背后逆光|顶部照射|light direction/i],
  lighting_source_size: [/光源大小|大面积自然光入口|大型柔光箱|点状光源|聚光灯|source size/i],
  lighting_quality: [/光线硬软程度|光源性质|硬光|柔光|阴影边缘清晰|阴影边缘柔和|light quality/i],
  lighting_intensity: [/光线强弱|光线强度|高曝光|正常曝光|低调暗光|主体突出|背景压暗|light intensity/i],
  lighting_ratio: [/光比关系|低光比|中低光比|高光比|lighting ratio/i],
  lighting_distribution: [/明暗分布|亮部集中|中间调覆盖|暗部位于|light dark distribution/i],
  lighting_shadow_direction: [/阴影方向|短阴影|长阴影|向右后方延伸|shadow direction/i],
  lighting_shadow_quality: [/阴影软硬|清晰锐利|柔和扩散|浅灰阴影|深黑阴影|shadow quality/i],
  lighting_highlight: [/高光位置|点状高光|条状高光|大面积反射|柔和亮斑|强烈反光|highlight/i],
  lighting_reflection_refraction: [/反射折射|环境倒影|水杯变形|透明材质光线变化|自然折射|reflection|refraction/i],
  lighting_material_response: [/材质响应|金属强反射|木材柔和漫反射|皮肤半透明散射|布料吸光|material response/i],
  lighting_environment: [/环境光照|空间光照关系|墙面反射|天空补光|空气感|空间层次|environmental lighting/i],
  lighting_color_temperature: [/色温色彩|暖光|冷光|混合光|偏暖色温|冷暖平衡|color temperature/i],
  lighting_time_weather: [/时间天气|清晨|上午|午后|黄昏|夜晚|晴天|阴天|雨天|time weather/i],
  lighting_mood: [/氛围情绪|温暖生活感|高级商业感|电影感光影|lighting mood/i],
  lighting_setup: [/摄影灯光方案|灯光方案|布光方案|主光|辅光|轮廓光|lighting setup/i],
  lighting_micro_details: [/微观光学细节|边缘光|漫反射|次级反射|空气光|体积光|光尘|光雾|micro lighting/i],
  prop_identification: [/道具识别|辅助道具|陶瓷杯|纸质书籍|绿色植物|包装盒|品牌卡片|餐具|眼镜|乐器|prop identification/i],
  prop_category: [/道具类别|生活类道具|商业类道具|食品类道具|人像类道具|装饰型道具|功能型道具|品牌型道具|prop category/i],
  prop_purpose: [/道具功能作用|强化主体|表达尺度|增加真实性|营造情绪|建立使用场景|prop purpose/i],
  prop_quantity_grouping: [/数量组合关系|单个道具|少量组合|多元素堆叠|成组出现|层级组合|quantity grouping/i],
  prop_spatial_position: [/空间位置|主体左前方|紧贴主体|周围环绕|远距离背景|部分遮挡|spatial position/i],
  prop_scale_relationship: [/尺寸比例|小型点缀|同等比例|大型背景元素|合理比例|scale relationship/i],
  prop_shape_structure: [/外形结构|圆柱形结构|杯口|杯身|把手|封面|书页|shape structure/i],
  prop_material_texture: [/材质纹理|哑光陶瓷|纸张|木材|金属|玻璃|布料|细腻颗粒|material texture/i],
  prop_color_relationship: [/色彩关系|白色陶瓷|深色木材|对比色|统一色|融入背景|低饱和自然色调|color relationship/i],
  prop_arrangement: [/摆放方式|人为摆放|自然摆放|动态摆放|自然生活化摆放|倾斜|打开|arrangement/i],
  prop_usage_state: [/使用状态|未使用|新包装|使用中|书本打开|半满咖啡杯|轻微使用状态|usage state/i],
  prop_subject_relationship: [/主体关联关系|与主体关系|衬托关系|对比关系|场景关系|强化产品定位|subject relationship/i],
  prop_lighting_interaction: [/光影表现|道具受光|玻璃反光|投射阴影|金属倒影|侧向柔光|lighting interaction/i],
  prop_style_identity: [/风格属性|极简高级|日式自然|复古风|科技风|现代极简风格|style identity/i],
  prop_narrative_function: [/故事氛围|叙事功能|悠闲下午|办公状态|烹饪过程|安静阅读环境|narrative function/i],
  prop_micro_details: [/微观细节|杯壁水珠|纸张纹理|木纹细节|灰尘颗粒|轻微使用痕迹|micro details/i],
  costume_cultural_identity: [/服饰文化身份|文化身份|服装文化基因|传统服饰体系|历史地域服饰|cultural identity|historical costume/i],
  costume_country_region: [/国家地区体系|国家\/地区体系|地域体系|中国服饰|日本服饰|韩国服饰|印度服饰|阿拉伯地区|欧洲服饰|country region|national fashion/i],
  costume_ethnic_system: [/民族体系|民族服饰|汉服体系|和服体系|韩服体系|印度莎丽|阿拉伯长袍体系|ethnic system/i],
  costume_historical_period: [/历史时期|时间时期|平安时代|江户时代|中世纪|文艺复兴|巴洛克|维多利亚|historical period/i],
  costume_dynasty: [/历史朝代|朝代|先秦|汉代|唐代|宋代|明代|清代|dynasty/i],
  costume_construction_system: [/服装形制|形制结构|深衣体系|曲裾|直裾|交领右衽|高腰裙|马面裙|旗装|十二单|和服|紧身胸衣|garment construction/i],
  costume_cutting_method: [/裁剪方式|裁剪体系|东方平面裁剪|西方立体裁剪|直线裁剪|肩部结构|腰线塑造|cutting method/i],
  costume_wearing_method: [/穿着方式|穿法|衣片叠合|宽腰带固定|多层叠穿|包裹式穿着|wearing method/i],
  costume_layering_system: [/层次结构|层次系统|多层叠穿|外袍内衫|披帛层次|裙撑层次|layering system/i],
  costume_complete_system: [/配套系统|完整造型|服饰配套系统|头饰|发髻|发簪|披帛|鞋履|complete costume system/i],
  costume_social_status: [/社会身份|社会属性|皇室贵族|文人士大夫|军事身份|宗教身份|权力象征|social status/i],
  costume_craft: [/制作工艺|工艺分析|染织|刺绣|织锦|金线刺绣|盘扣工艺|craft|embroidery|brocade/i],
  costume_symbolic_pattern: [/民族纹样符号|民族纹样|图案寓意|象征纹样|龙凤|祥云|樱花|波浪纹样|波浪图案|花卉纹章|曼荼罗|symbolic pattern/i],
  costume_aesthetic_language: [/服饰审美语言|审美语言|审美特点|东方含蓄|儒雅克制|华丽开放|清雅含蓄|季节美学|aesthetic language/i],
  costume_photography_presentation: [/摄影呈现|服饰摄影呈现|摄影表现层|历史服饰摄影|影视造型|商业摄影复刻|costume photography/i],
  costume_micro_details: [/服饰微观细节|服装微观细节|纤维|针脚|褶皱|织物肌理|刺绣针法|micro costume details/i],
  color_detail: [/色彩细节|色调|配色|低饱和|高饱和|冷暖|渐变|撞色|复古色|莫兰迪|金属色|荧光色|palette|color grading|tone|saturation|gradient/i],
  portrait_photography: [/人像摄影参数|人像镜头|85mm人像|大光圈浅景深|人像摄影质感|专业人像摄影|面部高清细节|portrait lens|portrait photography/i],
  portrait_lighting_color: [/人像光影色彩|人像光线|人物受光|面部受光|肤色光泽|左前方柔光|均匀明暗过渡|低饱和人像色调|portrait lighting|portrait color/i],
  scene_identity: [/场景类型定位|场景类型|空间类别|室内空间|室外环境|城市空间|自然环境|商业空间|居住空间|工业空间|高端住宅|现代极简住宅|开放式客厅|酒店大堂|咖啡馆|海边|森林|街头|自然森林环境|高端酒店大堂|街头城市空间|顶层公寓|海边露台|古堡书房|豪车后座|酒店宴会厅|卧室|花园|泳池|scene identity|scene type/i],
  spatial_structure: [/空间结构|空间布局|三层空间结构|前景区域|中景区域|后景区域|空间纵深|主要活动区域|spatial structure|spatial layout/i],
  spatial_scale: [/空间比例尺度|空间尺度|层高|天花板高度|宽敞|开阔|狭窄|紧凑|大型落地窗|家具尺寸|人与环境比例|spatial scale/i],
  scene_perspective: [/场景透视关系|透视关系|一点透视|单点透视|两点透视|消失点|广角透视|人眼高度|镜头高度|vanishing point|scene perspective/i],
  scene_layering: [/前中后景分层|场景层级|前景层|中景层|背景层|前景存在|中景区域|背景为|遮挡关系|虚化程度|foreground layer|middle ground|background layer/i],
  architecture_structure: [/建筑空间结构|建筑结构|墙体|门窗|落地玻璃窗|金属窗框|吊顶|横梁|天花板|地面结构|建筑线条|architecture structure/i],
  object_elements: [/主要物体元素|物体元素|重要物体|物体数量|沙发|茶几|灯具|植物|家具主体|object elements|scene objects/i],
  material_texture: [/场景材质纹理|材质纹理|表面材质|木材纹理|木质纹理|金属反光|玻璃透明度|石材颗粒|布料纤维|哑光|高反光|material texture/i],
  scene_color_palette: [/场景色彩体系|色彩体系|主色|辅色|点缀色|米白|浅木色|深木色|低饱和自然色调|莫兰迪场景|scene color palette/i],
  scene_lighting: [/场景光影关系|场景光线|光线分析|光源位置|窗户自然光|自然光柔和扩散|阴影边缘|阴影方向|scene lighting/i],
  scene_atmosphere: [/场景氛围情绪|场景氛围|空间氛围|整体氛围|午后自然光环境|清晨氛围|黄昏氛围|夜晚氛围|生活方式感|scene atmosphere/i],
  scene_photography: [/场景摄影参数|场景摄影|建筑摄影|室内设计摄影|生活方式摄影|35mm广角|24mm广角|50mm自然视角|较深景深|interior photography/i],
  scene_micro_details: [/场景微观细节|细节增强层|微观细节|小物件|书籍|花瓶|摆件|轻微灰尘|使用痕迹|自然褶皱|不完全对称|自然摆放|micro details/i],
  food_category: [/食物大类别|食物类别|主食类|肉类|甜品|饮品|小吃|面食|米饭|面包|披萨|汉堡|牛排|海鲜|蛋糕|咖啡|food category/i],
  food_specific_identity: [/具体名称识别|食物身份|玛格丽特披萨|法式可颂|戚风蛋糕|照烧鸡肉盖饭|番茄肉酱意面|冰拿铁|厚切牛排|specific food/i],
  food_cuisine_style: [/菜系分类|菜系归属|地域料理类型|料理风格|菜系|亚洲料理|欧洲料理|美洲料理|中餐|日料|韩餐|泰餐|越南料理|印度料理|东南亚料理|法餐|意餐|墨西哥料理|cuisine style/i],
  cuisine_cultural_origin: [/地域文化来源|文化来源|饮食文化|东方饮食氛围|季节感|共享式饮食文化|家庭聚餐|江户前|传统日式|传统中餐|food culture/i],
  cuisine_ingredient_system: [/典型食材体系|食材体系|食材组合习惯|多种食材组合|荤素搭配|新鲜鱼类|海藻|季节性食材|高品质肉类|橄榄油|奶酪|signature ingredients/i],
  cuisine_flavor_visual: [/味型视觉表达|味型表达|酸辣香|酱汁光泽|汤汁|油亮光泽|镬气|热气|酱汁线条|香料元素|热带风味|flavor visual/i],
  cuisine_plating_habit: [/传统摆盘习惯|摆盘逻辑|菜系摆盘|留白|极简摆盘|平衡摆盘|艺术构图|精准位置|小菜组合|组合摆盘|plating habit/i],
  cuisine_tableware_style: [/常用餐具风格|餐具选择|器皿特点|瓷盘|深色陶碗|木桌|手工陶器|木盘|小碟|金属碗|石锅|大面积白盘|tableware/i],
  cuisine_color_gene: [/色彩基因|菜系色彩|中餐丰富色彩|日料白黑木色|韩餐红绿白|法餐低饱和高级灰|泰餐鲜艳高饱和|墨西哥明亮热烈|红色辣椒|绿色蔬菜|白色米饭|红绿白|白黑木色|原材料自然色|低饱和高级灰|color DNA/i],
  cuisine_spatial_context: [/空间环境特点|用餐氛围|家庭餐桌|木桌|厨房|家庭感|丰盛感|家庭聚餐|热闹氛围|街头感|高端餐厅环境|dining atmosphere/i],
  cuisine_photography_style: [/摄影表现风格|菜系摄影风格|美食摄影风格|安静高级自然|温暖家庭感|奢华精品广告|自然质朴|柔和侧光|低饱和色调|food photography style/i],
  food_main_ingredient: [/主体食材|核心食材|主要食材|牛肉|鸡肉|面条|米饭|奶油|奶酪|芝士|马苏里拉|番茄酱|main ingredient/i],
  food_supporting_ingredient: [/辅助食材|点缀元素|调味料|香草|罗勒|坚果|柠檬片|花瓣|香料粉|番茄片|garnish/i],
  food_structure_layer: [/结构层次|食物组成结构|多层结构|层叠结构|顶部面包|奶油层|蛋糕层|夹心|food layers/i],
  food_physical_form: [/外形轮廓|食物形态|圆形|长条形|方形|不规则形|切片|半切|薄片|厚切|food shape/i],
  food_cooking_method: [/烹饪方式|煎制|烤制|烘焙|油炸|蒸制|炖煮|烟熏|炒制|生食|cooking method|baked|fried|grilled/i],
  food_cooking_state: [/熟成状态|三分熟|五分熟|全熟|刚出炉|冰镇|融化|拉丝|冒热气|温热状态|doneness|melted/i],
  food_texture_visual: [/口感视觉表现|酥脆|柔软|多汁|裂纹|气泡|金黄色表皮|绵密|蓬松|油脂光泽|湿润表面|crispy|juicy/i],
  food_freshness: [/新鲜程度|新鲜表现|表皮光泽|果肉水润|切面颜色鲜艳|叶片挺立|海鲜湿润|新鲜现做|freshness/i],
  food_portion: [/份量比例|单人份|分享装|精致小份|尺寸适中|小巧|厚切|薄片|serving size|portion/i],
  food_plating: [/摆盘方式|摆盘|餐盘|木质托盘|精致摆盘|高级餐厅摆盘|视觉点缀|plating|food styling/i],
  commercial_food_identity: [/商业定位|食物品牌化表达|高端餐饮|快餐广告|烘焙商品|外卖展示|餐饮广告|手工制作|高品质原料|commercial food/i],
  product_identity: [/产品主体定位|产品类别|产品数量|产品主次关系|单品展示|产品组合|主产品|厨房电器|家电|食品|美妆|数码产品|家居用品|product identity|product category/i],
  product_form: [/产品外观结构|产品外观|整体形态|产品形态|方形|圆柱形|流线型|几何结构|边缘弧度|柔和弧度|曲面变化|product form|product shape/i],
  product_position: [/产品摆放角度|产品角度|正面展示|45\s*度|前侧视角|侧面展示|顶部俯视|logo朝向镜头|功能区域朝向|平放|悬浮|倾斜|product position|product angle/i],
  product_composition_ratio: [/产品比例关系|产品占画面比例|产品面积|留白比例|四周空间|上下空间|占据画面约?\s*\d{1,3}%|视觉中心|composition ratio/i],
  product_composition: [/产品构图布局|产品构图|视觉路径|中心构图|对称构图|三分构图|对角线构图|视线集中|product composition/i],
  product_material: [/产品材质纹理|产品材质|主材质|产品外壳|表面处理|亮面|哑光|磨砂|拉丝|金属纹理|塑料|金属|玻璃|陶瓷|皮革|product material/i],
  product_color: [/产品色彩体系|产品颜色|产品色彩|主色|辅助色|色彩关系|黑色主体|白色主体|深灰色主体|银色金属细节|高级灰|product color/i],
  product_feature_detail: [/产品细节卖点|产品卖点|可见功能|设计亮点|触控区域|按钮|屏幕|接口|开关|隐藏式结构|精密拼接|品牌标识|Logo|feature details/i],
  product_supporting_elements: [/产品配件元素|配件与辅助元素|配件|辅助元素|充电线|包装|食材|杯子|相关使用道具|衬托尺寸|使用场景|supporting elements/i],
  product_background: [/产品背景环境|产品背景|背景类型|纯色背景|渐变背景|场景背景|生活空间|背景材质|桌面背景|墙面背景|product background/i],
  product_environment_relation: [/产品环境关系|产品与环境关系|接触关系|空间关系|放在桌面|木质台面|产品融入环境|产品独立展示|真实使用关系|product environment/i],
  product_lighting: [/产品光影关系|产品光影|产品光线|商业摄影光影|产品高光|高光区域|侧前方柔光|大面积柔光|均匀渐变|product lighting/i],
  product_photography: [/产品摄影参数|产品摄影|商业产品摄影|35mm产品摄影|50mm标准镜头|85mm压缩视角|中等景深|产品主体超高清|微距细节|product photography/i],
  commercial_visual_style: [/商业视觉风格|电商风格|高级极简商业摄影|极简高级|科技未来|生活方式|奢侈精品|产品价值感|commercial style|commercial visual style/i],
  product_micro_details: [/产品微观细节|微观真实细节|产品表面细节|真实材质纹理|轻微划痕|灰尘|反射变化|折射|边缘光|真实摄影效果|product micro details/i],
  atmosphere: [/氛围|气氛|情绪|梦幻|孤独|温柔|紧张|神秘|浪漫|高级感|未来感|复古感|atmosphere|mood|vibe|dreamy|romantic|mysterious/i],
  famous_person: [/著名人物|名人|明星|演员|艺术家|毕加索|弗里达|列宾|梵高|达芬奇|奥黛丽|赫本|玛丽莲|爱因斯坦|马斯克|乔布斯|celebrity|famous|picasso|frida|repin|van gogh/i],
  brand: [/知名品牌|品牌|商标|logo|nike|adidas|apple|tesla|gucci|chanel|dior|lv|prada|canon|leica|耐克|阿迪达斯|苹果|特斯拉|香奈儿|迪奥|古驰|徕卡/i],
  color: [/颜色|红色|橙色|黄色|绿色|青色|蓝色|紫色|粉色|黑色|白色|灰色|黑白灰|金色|银色|棕色|米色|color|red|orange|yellow|green|blue|purple|black|white|gold|silver/i],
  typography: [/字体|字形|排版字体|无衬线|衬线|手写体|书法体|粗体|细体|标题字|typography|font|typeface|serif|lettering|calligraphy/i],
  text_content: [/文本内容|文字内容|文案|标语|标题|副标题|字幕|海报文字|写着|包含文字|slogan|caption|subtitle|text reads|copywriting/i],
  negative: [/不要|避免|排除|禁止|负面|反向|低质量|模糊|畸形|negative|avoid|bad|blurry/i],
};

export function analyzePromptText(prompt: string, options: Partial<CategoryInput> = {}): PromptAnalysisResult {
  const splitResult = splitPromptToTemplate(prompt);
  const detectedSections = splitResult.sections.map((section) => ({
    ...section,
    chips: buildReplacementChips(section),
  }));
  const explicitCapsuleAnalysis = buildPromptAnalysisFromSavedCapsules(prompt, options);
  const sections = mergePromptAnalysisSections(explicitCapsuleAnalysis?.sections ?? [], detectedSections);
  const chips = sections.flatMap((section) => section.chips);
  const suggestedCategories = suggestPromptCategories({
    title: options.title ?? "",
    prompt,
    tags: options.tags ?? splitResult.suggestedTags,
    currentCategory: options.currentCategory,
    knownCategories: options.knownCategories,
  });

  return {
    chips,
    sections,
    suggestedTags: splitResult.suggestedTags,
    suggestedCategories,
    primaryCategory: suggestedCategories[0] ?? "图像生成",
    template: splitResult.template,
  };
}

function mergePromptAnalysisSections(
  prioritySections: readonly PromptAnalysisSection[],
  fallbackSections: readonly PromptAnalysisSection[],
): PromptAnalysisSection[] {
  const groupedSections = new Map<string, PromptAnalysisSection>();

  for (const section of [...prioritySections, ...fallbackSections]) {
    const existingSection = groupedSections.get(section.variable);
    const values = uniqueTags(section.values);

    if (values.length === 0) {
      continue;
    }

    if (existingSection) {
      existingSection.values = uniqueTags([...existingSection.values, ...values]);
      existingSection.chips = existingSection.values.map((value, index) =>
        buildReplacementChip(existingSection.key, existingSection.label, existingSection.variable, value, index),
      );
      continue;
    }

    groupedSections.set(section.variable, {
      ...section,
      values,
      chips: values.map((value, index) => buildReplacementChip(section.key, section.label, section.variable, value, index)),
    });
  }

  return Array.from(groupedSections.values()).sort(
    (first, second) => promptSplitSectionOrder.indexOf(first.key) - promptSplitSectionOrder.indexOf(second.key),
  );
}

export function buildPromptAnalysisFromSavedCapsules(
  prompt: string,
  options: Partial<CategoryInput> = {},
): PromptAnalysisResult | null {
  const capsuleSegments = parsePromptTemplateSegments(prompt).filter((segment) => segment.type === "parameter");

  if (capsuleSegments.length === 0) {
    return null;
  }

  const groupedSections = new Map<string, PromptAnalysisSection>();

  for (const segment of capsuleSegments) {
    const declaredSectionKey = getPromptSectionKeyByVariable(segment.variable);
    const sectionKey = segment.source.startsWith("{{")
      ? getSupportedSectionKeyByVariable(segment.variable, segment.value)
      : declaredSectionKey;

    if (!sectionKey) {
      continue;
    }

    const meta = promptSectionMeta[sectionKey];
    const variable = declaredSectionKey === sectionKey ? normalizeVariable(segment.variable) || meta.variable : meta.variable;
    const value = normalizePromptSectionValue(sectionKey, segment.value);

    if (!value) {
      continue;
    }

    const existingSection = groupedSections.get(variable);

    if (existingSection) {
      existingSection.values = uniqueTags([...existingSection.values, value]);
      existingSection.chips = existingSection.values.map((value, index) =>
        buildReplacementChip(existingSection.key, existingSection.label, existingSection.variable, value, index),
      );
      continue;
    }

    groupedSections.set(variable, {
      key: sectionKey,
      label: meta.label,
      variable,
      values: uniqueTags([value]),
      chips: [buildReplacementChip(sectionKey, meta.label, variable, value, 0)],
    });
  }

  if (groupedSections.size === 0) {
    return null;
  }

  const sections = Array.from(groupedSections.values()).sort(
    (first, second) => promptSplitSectionOrder.indexOf(first.key) - promptSplitSectionOrder.indexOf(second.key),
  );
  const chips = sections.flatMap((section) => section.chips);
  const resolvedPrompt = resolvePromptTemplateText(prompt);
  const suggestedCategories = suggestPromptCategories(
    {
      title: options.title ?? "",
      prompt: resolvedPrompt,
      tags: options.tags ?? [],
      currentCategory: options.currentCategory,
      knownCategories: options.knownCategories,
    },
    { includeFallback: false },
  );

  return {
    chips,
    sections,
    suggestedTags: sections
      .filter((section) => section.key !== "negative" && section.key !== "other")
      .flatMap((section) => section.values.filter((value) => value.trim() && value.trim() !== section.label))
      .slice(0, 15),
    suggestedCategories,
    primaryCategory: suggestedCategories[0] ?? options.currentCategory ?? "图像生成",
    template: prompt.trim(),
  };
}

export function applyAnalysisTemplate(currentPrompt: string, analysis: PromptAnalysisResult): string {
  return analysis.template.trim() || currentPrompt;
}

export function applyAnalysisInlineChips(currentPrompt: string, analysis: PromptAnalysisResult): string {
  const source = currentPrompt.trim();

  if (!source) {
    return applyAnalysisTemplate(currentPrompt, analysis);
  }

  const chips = [...analysis.chips]
    .filter((chip) => chip.value.trim() && chip.templateText.trim())
    .sort((first, second) => second.value.length - first.value.length);

  if (chips.length === 0) {
    return applyAnalysisTemplate(currentPrompt, analysis);
  }

  const nextPrompt = parsePromptTemplateSegments(currentPrompt)
    .map((segment) => {
      if (segment.type === "parameter") {
        return segment.source;
      }

      return chips.reduce((text, chip) => replaceFirstPromptValue(text, chip.value, chip.templateText), segment.text);
    })
    .join("");

  if (nextPrompt !== currentPrompt) {
    return nextPrompt.trim();
  }

  return currentPrompt;
}

export function getNegativePromptValues(analysis: PromptAnalysisResult): string[] {
  return uniqueTags(
    analysis.sections
      .filter(isNegativeAnalysisSection)
      .flatMap((section) => section.values.map(cleanNegativePromptValue)),
  );
}

export function omitNegativeAnalysisSections(analysis: PromptAnalysisResult): PromptAnalysisResult {
  const sections = analysis.sections.filter((section) => !isNegativeAnalysisSection(section));
  const chips = sections.flatMap((section) => section.chips);

  return {
    ...analysis,
    chips,
    sections,
    template: sections
      .map((section) => `${section.label}：{{${section.variable}: ${section.values.join("，")}}}`)
      .join("\n"),
  };
}

export function moveNegativePromptValuesFromPrompt(
  prompt: string,
  negativePrompt: string,
  values: readonly string[],
): { prompt: string; negativePrompt: string } {
  const negativeValues = uniqueTags(values.map(cleanNegativePromptValue).filter(Boolean));

  if (negativeValues.length === 0) {
    return { prompt, negativePrompt };
  }

  const nextPrompt = cleanPromptAfterNegativeRemoval(negativeValues.reduce(removePromptValue, prompt));
  const existingNegativePrompt = negativePrompt.trim();
  const nextNegativePrompt = uniqueTags([
    ...(existingNegativePrompt ? [existingNegativePrompt] : []),
    ...negativeValues,
  ]).join("，");

  return {
    prompt: nextPrompt,
    negativePrompt: nextNegativePrompt,
  };
}

export function splitNegativePromptFromPrompt(
  prompt: string,
  negativePrompt: string,
  options: Partial<CategoryInput> = {},
): { prompt: string; negativePrompt: string } {
  const labeledNegativeBlocks = extractLabeledNegativePromptBlocks(prompt);
  const promptWithoutLabeledBlocks = cleanPromptAfterNegativeRemoval(labeledNegativeBlocks.prompt);
  const analysis = analyzePromptText(promptWithoutLabeledBlocks, options);
  const negativeValues = uniqueTags([...labeledNegativeBlocks.values, ...getNegativePromptValues(analysis)]);

  return moveNegativePromptValuesFromPrompt(promptWithoutLabeledBlocks, negativePrompt, negativeValues);
}

export function applyReplacementChip(prompt: string, chip: PromptReplacementChip): string {
  if (!prompt.trim() || prompt.includes(chip.templateText)) {
    return prompt;
  }

  const index = prompt.indexOf(chip.value);

  if (index < 0) {
    return prompt;
  }

  return `${prompt.slice(0, index)}${chip.templateText}${prompt.slice(index + chip.value.length)}`;
}

export function buildPromptOptionAnalysis(input: PromptOptionAnalysisInput): PromptAnalysisResult {
  const variable = normalizeVariable(input.optionVariable ?? "") || "textContent";
  const sectionKey = getSectionKeyByVariable(variable);
  const meta = promptSectionMeta[sectionKey];
  const label = input.optionLabel?.trim() || meta.label;
  const values = filterPromptOptionValues({
    variable,
    sectionKey,
    values: buildPromptOptionValues({
      prompt: input.prompt,
      sectionKey,
      value: input.optionValue ?? "",
    }),
    currentValue: input.optionValue,
  }).slice(0, 5);
  const section: PromptAnalysisSection = {
    key: sectionKey,
    label,
    variable,
    values,
    chips: values.map((value, index) => buildReplacementChip(sectionKey, label, variable, value, index)),
  };

  return {
    chips: section.chips,
    sections: [section],
    suggestedTags: [],
    suggestedCategories: [],
    primaryCategory: "图像生成",
    template: "",
  };
}

export function buildAiPromptOptionAnalysis(input: PromptOptionAnalysisInput): PromptAnalysisResult {
  const variable = normalizeVariable(input.optionVariable ?? "") || "textContent";
  const sectionKey = getSectionKeyByVariable(variable);
  const meta = promptSectionMeta[sectionKey];
  const label = input.optionLabel?.trim() || meta.label;
  const values = buildAiPromptOptionValues({
    prompt: input.prompt,
    optionValue: input.optionValue,
    optionVariable: variable,
  });
  const section: PromptAnalysisSection = {
    key: sectionKey,
    label,
    variable,
    values,
    chips: values.map((value, index) => buildReplacementChip(sectionKey, label, variable, value, index)),
  };

  return {
    chips: section.chips,
    sections: [section],
    suggestedTags: [],
    suggestedCategories: [],
    primaryCategory: "图像生成",
    template: "",
  };
}

export function getPromptOptionSectionKey(variable: string): PromptSplitSectionKey {
  return getSectionKeyByVariable(variable);
}

export function buildAiPromptOptionValues(input: {
  prompt: string;
  optionValue?: string;
  optionVariable?: string;
}): string[] {
  const sectionKey = getSectionKeyByVariable(normalizeVariable(input.optionVariable ?? ""));
  const currentValue = input.optionValue?.trim() ?? "";
  const values = buildContextualOptionVariants({
    currentValue,
    prompt: input.prompt,
    sectionKey,
  });

  return filterPromptOptionValues({
    variable: input.optionVariable ?? promptSectionMeta[sectionKey].variable,
    sectionKey,
    values,
    currentValue,
  }).slice(0, 5);
}

export function buildGeneratedPromptOptionValues(input: {
  optionLabel?: string;
  optionValue?: string;
  optionVariable: string;
  prompt: string;
  values: readonly string[];
}): string[] {
  const filteredValues = filterPromptOptionValues({
    variable: input.optionVariable,
    values: input.values,
    currentValue: input.optionValue,
  });
  const contextualValues = buildAiPromptOptionValues({
    prompt: input.prompt,
    optionValue: input.optionValue,
    optionVariable: input.optionVariable,
  });

  return uniqueTags([...filteredValues, ...contextualValues])
    .filter((value) => !isSamePromptLabel(value, input.optionValue ?? ""))
    .slice(0, 5);
}

export function filterPromptOptionValues({
  variable,
  sectionKey,
  values,
  currentValue = "",
}: {
  variable: string;
  sectionKey?: PromptSplitSectionKey;
  values: readonly string[];
  currentValue?: string;
}): string[] {
  const expectedSectionKey = sectionKey ?? getPromptOptionSectionKey(variable);

  return uniqueTags([...values]).filter((value) => isPromptOptionCompatible(expectedSectionKey, value, currentValue));
}

export function suggestPromptCategories(input: CategoryInput, options: CategorySuggestionOptions = {}): string[] {
  const includeFallback = options.includeFallback ?? true;
  const skipHeavyAnalysis = options.skipHeavyAnalysis === true;
  const content = [input.title, input.prompt, input.tags.join(" ")].join("\n");
  const suggestions: string[] = [];

  if (isSelectableCategory(input.currentCategory ?? "")) {
    suggestions.push(input.currentCategory as string);
  }

  suggestions.push(...findKnownCategoryMatches(input, content));

  for (const rule of categoryRules) {
    if (rule.keywords.some((keyword) => keyword.test(content))) {
      suggestions.push(rule.label);
    }
  }

  suggestions.push(...input.tags.filter(isSelectableCategory));

  if (!skipHeavyAnalysis) {
    suggestions.push(...splitPromptToTemplate(input.prompt).suggestedTags.filter(isSelectableCategory));
  }

  if (includeFallback) {
    suggestions.push(...fallbackCategories);
  }

  return uniqueTags(suggestions).slice(0, 10);
}

export function applyCategoryToTags(tags: readonly string[], currentCategory: string, nextCategory: string): string[] {
  const blockedCategories = [currentCategory, nextCategory, "未分类"].map(normalizePromptLabel).filter(Boolean);

  return uniqueTags(tags.filter((tag) => !blockedCategories.some((category) => isSamePromptLabel(tag, category))));
}

export function removeCategoryFromTags(tags: readonly string[], category: string): string[] {
  return applyCategoryToTags(tags, "", category);
}

export function normalizeConcretePromptTags(
  tags: readonly string[],
  options: { category?: string; maxCount?: number } = {},
): string[] {
  const normalizedTags = options.category ? removeCategoryFromTags(tags, options.category) : uniqueTags([...tags]);
  const concreteTags = normalizedTags.filter(isConcretePromptTag);

  return typeof options.maxCount === "number" ? concreteTags.slice(0, options.maxCount) : concreteTags;
}

export function addTags(tags: readonly string[], nextTags: readonly string[]): string[] {
  return uniqueTags([...tags, ...nextTags]);
}

export function isGenericPromptLabel(label: string): boolean {
  const normalized = normalizePromptLabel(label);

  if (!normalized) {
    return true;
  }

  if (genericPromptLabels.has(normalized.toLowerCase())) {
    return true;
  }

  if (
    Object.values(promptSectionMeta).some(
      (meta) => normalizePromptLabel(meta.label).toLowerCase() === normalized.toLowerCase(),
    )
  ) {
    return true;
  }

  return /^(nano banana|midjourney|stable diffusion|flux|imagen|gemini|sora|veo|runway|kling|higgsfield)/i.test(
    normalized,
  );
}

function isConcretePromptTag(label: string): boolean {
  const normalized = normalizePromptLabel(label);

  if (!normalized || isGenericPromptLabel(normalized)) {
    return false;
  }

  if (!isPromptTagLengthAcceptable(normalized)) {
    return false;
  }

  if (isVisibleSourceUiTag(normalized)) {
    return true;
  }

  if (isPromptTagModelOrSourceNoise(normalized)) {
    return false;
  }

  if (isPromptTagParameterLike(normalized)) {
    return false;
  }

  return true;
}

function isPromptTagLengthAcceptable(label: string): boolean {
  const compactLabel = label.replace(/\s+/g, "");
  const asciiWordCount = label.trim().split(/\s+/).filter(Boolean).length;

  if (/^[\x00-\x7F\s-]+$/.test(label)) {
    return label.length <= 28 && asciiWordCount <= 4;
  }

  return compactLabel.length <= 14;
}

function isVisibleSourceUiTag(label: string): boolean {
  return /(?:(?:来源|作者|站点|网站|网页|域名|平台|webtomind).*(?:头像|图标|标识|徽标|logo|卡片|标签|角标|浮层)|(?:头像|图标|标识|徽标|logo|卡片|标签|角标|浮层).*(?:来源|作者|站点|网站|网页|域名|平台|webtomind))/iu.test(
    label,
  );
}

function isPromptTagModelOrSourceNoise(label: string): boolean {
  return /(?:\bprompt(?:s)?\b|gpt(?:[-\s]?image)?|midjourney|stable diffusion|nano banana|webtomind|seo|gallery|\becommerce\b|dall[-\s]?e|flux|imagen|gemini|sora|veo|runway|kling|higgsfield)/i.test(
    label,
  );
}

function isPromptTagParameterLike(label: string): boolean {
  if (/[，,。；;：:！？!?]/u.test(label)) {
    return true;
  }

  if (/[a-z]+[A-Z][A-Za-z]+/.test(label) || /[_{}]/u.test(label)) {
    return true;
  }

  return /(?:请|上传|参考图|基于|重新|生成|创建|绘制|分析|画面目标|画面要求|文字排版|保留|不要|避免|禁止|必须|确保|使用|作为|放在|位于|占据|加入|前景加入|背景可以|表面|布满|轻微遮挡|标题空间|主体角度|可替换|参数|字段|变量)/u.test(
    label,
  );
}

function buildReplacementChips(section: PromptSplitSection): PromptReplacementChip[] {
  return section.values.slice(0, 8).map((value, index) => ({
    id: `${section.key}-${index}-${value}`,
    sectionKey: section.key,
    label: section.label,
    variable: section.variable,
    value,
    templateText: `{{${section.variable}: ${value}}}`,
  }));
}

function buildReplacementChip(
  sectionKey: PromptSplitSectionKey,
  label: string,
  variable: string,
  value: string,
  index: number,
): PromptReplacementChip {
  return {
    id: `option-${sectionKey}-${index}-${value}`,
    sectionKey,
    label,
    variable,
    value,
    templateText: `{{${variable}: ${value}}}`,
  };
}

function replaceFirstPromptValue(text: string, value: string, templateText: string): string {
  if (!value || text.includes(templateText)) {
    return text;
  }

  const index = text.indexOf(value);

  if (index < 0) {
    return text;
  }

  return `${text.slice(0, index)}${templateText}${text.slice(index + value.length)}`;
}

function buildPromptOptionValues({
  prompt,
  sectionKey,
  value,
}: {
  prompt: string;
  sectionKey: PromptSplitSectionKey;
  value: string;
}): string[] {
  const context = prompt.toLowerCase();
  const currentValue = value.trim();
  const options = getContextualOptions(sectionKey, context);

  return uniqueTags(options.filter((option) => !isSamePromptLabel(option, currentValue)));
}

function buildContextualOptionVariants({
  currentValue,
  prompt,
  sectionKey,
}: {
  currentValue: string;
  prompt: string;
  sectionKey: PromptSplitSectionKey;
}): string[] {
  const directVariants = getDirectSectionOptionVariants(sectionKey, currentValue);

  if (directVariants.length > 0) {
    return uniqueTags(directVariants.filter((value) => !isSamePromptLabel(value, currentValue)));
  }

  const core = getOptionContextCore(currentValue, prompt);
  const fallbackCore = core || promptSectionMeta[sectionKey].label;
  const sectionVariants: Partial<Record<PromptSplitSectionKey, string[]>> = {
    subject_position: [
      `单人${fallbackCore}主体`,
      `${fallbackCore}中心偏右位置`,
      `${fallbackCore}中心偏左位置`,
      `${fallbackCore}近距离半身构图`,
      `${fallbackCore}主体居中构图`,
    ],
    age_character: [
      `${fallbackCore}少年感`,
      `${fallbackCore}青年感`,
      `${fallbackCore}自然松弛气质`,
      `${fallbackCore}清冷气质`,
      `${fallbackCore}成熟感`,
    ],
    body_frame: [
      `${fallbackCore}肩部放松`,
      `${fallbackCore}自然站姿`,
      `${fallbackCore}修长四肢`,
      `${fallbackCore}清晰腰线`,
      `${fallbackCore}舒展肩颈体态`,
    ],
    face_shape: [
      `${fallbackCore}鹅蛋脸轮廓`,
      `${fallbackCore}椭圆脸轮廓`,
      `${fallbackCore}瓜子脸轮廓`,
      `${fallbackCore}方圆脸轮廓`,
      `${fallbackCore}清晰下颌线`,
    ],
    eyebrow_detail: [
      `${fallbackCore}自然平直眉`,
      `${fallbackCore}柔和弯眉`,
      `${fallbackCore}浓淡适中眉毛`,
      `${fallbackCore}细眉轮廓`,
      `${fallbackCore}眉峰柔和`,
    ],
    eye_detail: [
      `${fallbackCore}杏仁眼`,
      `${fallbackCore}双眼皮`,
      `${fallbackCore}眼神柔和`,
      `${fallbackCore}视线略微偏离镜头`,
      `${fallbackCore}直视镜头`,
    ],
    nose_detail: [
      `${fallbackCore}高挺鼻梁`,
      `${fallbackCore}自然鼻梁`,
      `${fallbackCore}小巧鼻头`,
      `${fallbackCore}精致鼻型`,
      `${fallbackCore}立体鼻梁`,
    ],
    lip_detail: [
      `${fallbackCore}自然唇形`,
      `${fallbackCore}饱满唇形`,
      `${fallbackCore}嘴角轻微上扬`,
      `${fallbackCore}薄唇轮廓`,
      `${fallbackCore}自然微笑状态`,
    ],
    skin_texture: [
      `${fallbackCore}自然真实肤质`,
      `${fallbackCore}细微肌理`,
      `${fallbackCore}自然毛孔`,
      `${fallbackCore}轻微自然光泽`,
      `${fallbackCore}通透肤质`,
    ],
    portrait_photography: [
      `${fallbackCore}85mm人像镜头`,
      `${fallbackCore}大光圈浅景深`,
      `${fallbackCore}近距离半身构图`,
      `${fallbackCore}面部高清细节`,
      `${fallbackCore}专业人像摄影质感`,
    ],
    portrait_lighting_color: [
      `${fallbackCore}左前方柔光`,
      `${fallbackCore}均匀明暗过渡`,
      `${fallbackCore}低饱和暖色调`,
      `${fallbackCore}面部柔和受光`,
      `${fallbackCore}自然肤色光泽`,
    ],
    scene_identity: [
      `${fallbackCore}现代极简住宅空间`,
      `${fallbackCore}开放式客厅`,
      `${fallbackCore}高端酒店大堂`,
      `${fallbackCore}街头城市空间`,
      `${fallbackCore}自然森林环境`,
    ],
    spatial_structure: [
      `${fallbackCore}三层空间结构`,
      `${fallbackCore}开放式布局`,
      `${fallbackCore}前景中景后景分明`,
      `${fallbackCore}主要活动区域居中`,
      `${fallbackCore}空间纵深明确`,
    ],
    spatial_scale: [
      `${fallbackCore}空间尺度宽敞`,
      `${fallbackCore}高层高空间`,
      `${fallbackCore}大型落地窗延伸感`,
      `${fallbackCore}家具尺寸协调`,
      `${fallbackCore}紧凑空间尺度`,
    ],
    scene_perspective: [
      `${fallbackCore}人眼高度水平视角`,
      `${fallbackCore}一点透视结构`,
      `${fallbackCore}两点透视结构`,
      `${fallbackCore}广角透视`,
      `${fallbackCore}低机位空间视角`,
    ],
    scene_layering: [
      `${fallbackCore}前景虚化植物枝叶`,
      `${fallbackCore}中景家具视觉中心`,
      `${fallbackCore}背景浅色墙面`,
      `${fallbackCore}前中后景分层`,
      `${fallbackCore}前景低矮装饰元素`,
    ],
    architecture_structure: [
      `${fallbackCore}落地玻璃窗设计`,
      `${fallbackCore}黑色金属窗框`,
      `${fallbackCore}浅色木质地面`,
      `${fallbackCore}现代建筑线条`,
      `${fallbackCore}吊顶横梁结构`,
    ],
    object_elements: [
      `${fallbackCore}低矮布艺沙发`,
      `${fallbackCore}圆形木质茶几`,
      `${fallbackCore}三盆绿色植物`,
      `${fallbackCore}桌面装饰物`,
      `${fallbackCore}两盏落地灯`,
    ],
    material_texture: [
      `${fallbackCore}自然木材纹理`,
      `${fallbackCore}石材细微颗粒感`,
      `${fallbackCore}玻璃透明质感`,
      `${fallbackCore}金属低反射质感`,
      `${fallbackCore}布料纤维质感`,
    ],
    scene_color_palette: [
      `${fallbackCore}低饱和自然色调`,
      `${fallbackCore}米白和浅木色`,
      `${fallbackCore}深木色辅色`,
      `${fallbackCore}绿色植物点缀`,
      `${fallbackCore}莫兰迪场景配色`,
    ],
    scene_lighting: [
      `${fallbackCore}右侧大面积窗户自然光`,
      `${fallbackCore}自然光柔和扩散`,
      `${fallbackCore}地面细腻明暗变化`,
      `${fallbackCore}阴影边缘较软`,
      `${fallbackCore}顶部柔和灯光`,
    ],
    scene_atmosphere: [
      `${fallbackCore}安静舒适氛围`,
      `${fallbackCore}午后自然光环境`,
      `${fallbackCore}轻松高级生活方式感`,
      `${fallbackCore}清晨宁静氛围`,
      `${fallbackCore}商业展示氛围`,
    ],
    scene_photography: [
      `${fallbackCore}35mm广角镜头`,
      `${fallbackCore}24mm广角空间摄影`,
      `${fallbackCore}较深景深`,
      `${fallbackCore}专业室内摄影效果`,
      `${fallbackCore}生活方式摄影`,
    ],
    scene_micro_details: [
      `${fallbackCore}少量生活化物件`,
      `${fallbackCore}自然分散植物叶片`,
      `${fallbackCore}轻微使用痕迹`,
      `${fallbackCore}不完全对称摆放`,
      `${fallbackCore}真实使用状态`,
    ],
    food_category: [
      `${fallbackCore}主食类`,
      `${fallbackCore}肉类`,
      `${fallbackCore}甜品`,
      `${fallbackCore}饮品`,
      `${fallbackCore}小吃`,
    ],
    food_specific_identity: [
      `${fallbackCore}手工薄底玛格丽特披萨`,
      `${fallbackCore}草莓奶油戚风蛋糕`,
      `${fallbackCore}日式照烧鸡肉盖饭`,
      `${fallbackCore}意大利番茄肉酱意面`,
      `${fallbackCore}冰拿铁咖啡`,
    ],
    food_cuisine_style: [
      `${fallbackCore}现代法式料理风格`,
      `${fallbackCore}日式料理风格`,
      `${fallbackCore}意式餐饮风格`,
      `${fallbackCore}中式家常料理`,
      `${fallbackCore}街头美食风格`,
    ],
    cuisine_cultural_origin: [
      `${fallbackCore}东方饮食氛围`,
      `${fallbackCore}季节感表达`,
      `${fallbackCore}共享式饮食文化`,
      `${fallbackCore}意式家庭用餐文化`,
      `${fallbackCore}墨西哥街头饮食文化`,
    ],
    cuisine_ingredient_system: [
      `${fallbackCore}多种食材组合`,
      `${fallbackCore}新鲜鱼类米饭海藻`,
      `${fallbackCore}高品质肉类海鲜香草`,
      `${fallbackCore}番茄橄榄油奶酪香草`,
      `${fallbackCore}玉米牛肉豆类辣椒`,
    ],
    cuisine_flavor_visual: [
      `${fallbackCore}自然油亮光泽`,
      `${fallbackCore}酱汁光泽`,
      `${fallbackCore}镬气热气`,
      `${fallbackCore}酸辣香味型`,
      `${fallbackCore}香料热带风味`,
    ],
    cuisine_plating_habit: [
      `${fallbackCore}极简留白摆盘`,
      `${fallbackCore}精确艺术构图`,
      `${fallbackCore}酱汁轨迹摆盘`,
      `${fallbackCore}小菜组合摆盘`,
      `${fallbackCore}粗犷街头摆盘`,
    ],
    cuisine_tableware_style: [
      `${fallbackCore}深色陶瓷器皿`,
      `${fallbackCore}手工陶器小碟`,
      `${fallbackCore}金属碗石锅`,
      `${fallbackCore}大面积白盘`,
      `${fallbackCore}木质器皿`,
    ],
    cuisine_color_gene: [
      `${fallbackCore}丰富色彩`,
      `${fallbackCore}白黑木色`,
      `${fallbackCore}红绿白色彩`,
      `${fallbackCore}低饱和高级灰`,
      `${fallbackCore}鲜艳高饱和`,
    ],
    cuisine_spatial_context: [
      `${fallbackCore}温暖家庭感`,
      `${fallbackCore}安静高级氛围`,
      `${fallbackCore}热闹家庭聚餐`,
      `${fallbackCore}木桌厨房场景`,
      `${fallbackCore}街头美食氛围`,
    ],
    cuisine_photography_style: [
      `${fallbackCore}温暖家庭感摄影`,
      `${fallbackCore}安静高级自然摄影`,
      `${fallbackCore}奢华精品广告摄影`,
      `${fallbackCore}自然质朴摄影风格`,
      `${fallbackCore}柔和侧光低饱和色调`,
    ],
    food_main_ingredient: [
      `${fallbackCore}马苏里拉奶酪`,
      `${fallbackCore}厚切牛排`,
      `${fallbackCore}金黄色炸鸡`,
      `${fallbackCore}新鲜水果`,
      `${fallbackCore}番茄肉酱`,
    ],
    food_supporting_ingredient: [
      `${fallbackCore}新鲜罗勒叶`,
      `${fallbackCore}番茄片`,
      `${fallbackCore}柠檬片`,
      `${fallbackCore}香草点缀`,
      `${fallbackCore}香料粉`,
    ],
    food_structure_layer: [
      `${fallbackCore}多层结构`,
      `${fallbackCore}顶部覆盖奶油`,
      `${fallbackCore}中间夹心层`,
      `${fallbackCore}底部支撑结构`,
      `${fallbackCore}圆形层叠结构`,
    ],
    food_physical_form: [
      `${fallbackCore}圆形轮廓`,
      `${fallbackCore}长条形外观`,
      `${fallbackCore}切片展示`,
      `${fallbackCore}半切形态`,
      `${fallbackCore}边缘略微不规则`,
    ],
    food_cooking_method: [
      `${fallbackCore}高温烘焙`,
      `${fallbackCore}高温煎制`,
      `${fallbackCore}油炸处理`,
      `${fallbackCore}蒸制处理`,
      `${fallbackCore}烟熏处理`,
    ],
    food_cooking_state: [
      `${fallbackCore}刚出炉状态`,
      `${fallbackCore}轻微融化状态`,
      `${fallbackCore}柔软拉丝效果`,
      `${fallbackCore}冒热气状态`,
      `${fallbackCore}冰镇状态`,
    ],
    food_texture_visual: [
      `${fallbackCore}酥脆金黄色纹理`,
      `${fallbackCore}自然气泡烘烤纹理`,
      `${fallbackCore}柔软细腻切面`,
      `${fallbackCore}多汁油脂光泽`,
      `${fallbackCore}湿润表面`,
    ],
    food_freshness: [
      `${fallbackCore}自然水润光泽`,
      `${fallbackCore}切面颜色鲜艳`,
      `${fallbackCore}叶片挺立`,
      `${fallbackCore}海鲜湿润光泽`,
      `${fallbackCore}新鲜现做`,
    ],
    food_portion: [
      `${fallbackCore}单人精致份量`,
      `${fallbackCore}分享装份量`,
      `${fallbackCore}精致小份`,
      `${fallbackCore}尺寸适中`,
      `${fallbackCore}与餐盘比例协调`,
    ],
    food_plating: [
      `${fallbackCore}圆形木质托盘`,
      `${fallbackCore}精致摆盘`,
      `${fallbackCore}高级餐厅摆盘`,
      `${fallbackCore}单人份餐盘摆放`,
      `${fallbackCore}视觉点缀摆盘`,
    ],
    commercial_food_identity: [
      `${fallbackCore}高级餐饮广告视觉`,
      `${fallbackCore}快餐广告定位`,
      `${fallbackCore}烘焙商品展示`,
      `${fallbackCore}外卖展示定位`,
      `${fallbackCore}手工制作质感`,
    ],
    product_identity: [
      `${fallbackCore}单品展示`,
      `${fallbackCore}产品组合`,
      `${fallbackCore}主品配件组合`,
      `${fallbackCore}家电产品`,
      `${fallbackCore}数码产品`,
    ],
    product_form: [
      `${fallbackCore}圆润流线型外观`,
      `${fallbackCore}几何结构外观`,
      `${fallbackCore}紧凑协调比例`,
      `${fallbackCore}柔和边缘弧度`,
      `${fallbackCore}简洁曲面变化`,
    ],
    product_position: [
      `${fallbackCore}45度前侧视角`,
      `${fallbackCore}正面展示`,
      `${fallbackCore}侧面展示`,
      `${fallbackCore}顶部俯视`,
      `${fallbackCore}轻微倾斜摆放`,
    ],
    product_composition_ratio: [
      `${fallbackCore}产品占据画面约60%`,
      `${fallbackCore}适量留白`,
      `${fallbackCore}四周呼吸感留白`,
      `${fallbackCore}中央偏上视觉中心`,
      `${fallbackCore}黄金比例位置`,
    ],
    product_composition: [
      `${fallbackCore}中心构图`,
      `${fallbackCore}对称构图`,
      `${fallbackCore}三分构图`,
      `${fallbackCore}对角线构图`,
      `${fallbackCore}背景层次引导视线`,
    ],
    product_material: [
      `${fallbackCore}细腻哑光材质`,
      `${fallbackCore}磨砂金属质感`,
      `${fallbackCore}玻璃透明质感`,
      `${fallbackCore}拉丝金属纹理`,
      `${fallbackCore}均匀颗粒质感`,
    ],
    product_color: [
      `${fallbackCore}低饱和深灰色`,
      `${fallbackCore}白色主体`,
      `${fallbackCore}黑色主体`,
      `${fallbackCore}银色金属细节`,
      `${fallbackCore}高级灰配色`,
    ],
    product_feature_detail: [
      `${fallbackCore}触控区域`,
      `${fallbackCore}品牌标识`,
      `${fallbackCore}功能按钮`,
      `${fallbackCore}精密拼接`,
      `${fallbackCore}隐藏式结构`,
    ],
    product_supporting_elements: [
      `${fallbackCore}相关使用道具`,
      `${fallbackCore}产品包装`,
      `${fallbackCore}充电线配件`,
      `${fallbackCore}食材道具`,
      `${fallbackCore}尺寸参照道具`,
    ],
    product_background: [
      `${fallbackCore}浅色极简空间环境`,
      `${fallbackCore}纯色背景`,
      `${fallbackCore}柔和渐变背景`,
      `${fallbackCore}木质桌面背景`,
      `${fallbackCore}低存在感背景`,
    ],
    product_environment_relation: [
      `${fallbackCore}自然放置于木质台面`,
      `${fallbackCore}产品独立展示`,
      `${fallbackCore}真实使用关系`,
      `${fallbackCore}悬浮展示`,
      `${fallbackCore}商业展示整洁感`,
    ],
    product_lighting: [
      `${fallbackCore}侧前方大面积柔光`,
      `${fallbackCore}产品表面均匀渐变`,
      `${fallbackCore}边缘曲面高光`,
      `${fallbackCore}柔和产品阴影`,
      `${fallbackCore}产品边缘光`,
    ],
    product_photography: [
      `${fallbackCore}50mm商业产品摄影镜头`,
      `${fallbackCore}35mm产品摄影`,
      `${fallbackCore}85mm压缩视角`,
      `${fallbackCore}中等景深`,
      `${fallbackCore}产品主体超高清`,
    ],
    commercial_visual_style: [
      `${fallbackCore}高级极简商业摄影风格`,
      `${fallbackCore}科技未来商业风格`,
      `${fallbackCore}生活方式商业摄影`,
      `${fallbackCore}奢侈精品风格`,
      `${fallbackCore}克制色彩产品价值感`,
    ],
    product_micro_details: [
      `${fallbackCore}真实材质纹理`,
      `${fallbackCore}轻微划痕`,
      `${fallbackCore}细微反射变化`,
      `${fallbackCore}自然阴影变化`,
      `${fallbackCore}真实摄影效果`,
    ],
    atmosphere: [
      `清冷${fallbackCore}氛围`,
      `低调奢华${fallbackCore}氛围`,
      `静默疏离${fallbackCore}氛围`,
      `夜色私宅${fallbackCore}氛围`,
      `柔和克制${fallbackCore}氛围`,
    ],
    mood_tone: [
      `清冷克制${fallbackCore}`,
      `低调松弛${fallbackCore}`,
      `疏离高级${fallbackCore}`,
      `温柔暗涌${fallbackCore}`,
      `静默富贵${fallbackCore}`,
    ],
    photography_style: [
      `${fallbackCore}杂志大片摄影`,
      `${fallbackCore}高定写真摄影`,
      `${fallbackCore}电影感摄影`,
      `${fallbackCore}私宅纪实摄影`,
      `${fallbackCore}高级商业摄影`,
    ],
    image_style: [
      `${fallbackCore}电影海报风格`,
      `${fallbackCore}高级插画风格`,
      `${fallbackCore}复古艺术风格`,
      `${fallbackCore}细腻写实风格`,
      `${fallbackCore}轻奢视觉风格`,
    ],
    camera_angle: [
      `${fallbackCore}平视近拍角度`,
      `${fallbackCore}低机位近拍角度`,
      `${fallbackCore}侧面近拍视角`,
      `${fallbackCore}微仰视拍摄角度`,
      `${fallbackCore}封面感近拍角度`,
    ],
    light_shadow: [
      `${fallbackCore}柔和侧逆光影`,
      `${fallbackCore}暖调轮廓光影`,
      `${fallbackCore}低调暗部光影`,
      `${fallbackCore}窗边漫射光影`,
      `${fallbackCore}高光边缘光影`,
    ],
    lighting_source_type: ["自然光源", "人造光源", "多光源关系", "窗户光", "摄影灯"],
    lighting_source_position: ["画面左侧", "左前方", "右前方", "背后光源", "顶部光源"],
    lighting_direction: ["左侧入射", "右侧入射", "正面照射", "背后逆光", "顶部照射"],
    lighting_source_size: ["大面积自然光入口", "大型柔光箱", "点状光源", "小型聚光灯", "宽幅窗户光"],
    lighting_quality: ["硬光", "柔光", "阴影边缘清晰", "阴影边缘柔和", "明暗反差强"],
    lighting_intensity: ["高曝光", "正常曝光", "低调暗光", "主体突出", "背景压暗"],
    lighting_ratio: ["低光比", "中低光比", "高光比", "亮暗平衡", "强烈明暗差异"],
    lighting_distribution: ["亮部集中于主体中心", "中间调覆盖主要细节", "暗部位于边缘", "最亮区域在主体", "最暗区域在背景角落"],
    lighting_shadow_direction: ["向右后方延伸", "向右延伸", "向后投射", "短阴影", "长阴影"],
    lighting_shadow_quality: ["清晰锐利", "柔和扩散", "浅灰阴影", "深黑阴影", "边缘逐渐扩散"],
    lighting_highlight: ["金属边缘", "皮肤表面", "食物油脂", "点状高光", "条状高光"],
    lighting_reflection_refraction: ["环境倒影", "光斑", "水杯变形", "透明材质光线变化", "自然折射"],
    lighting_material_response: ["金属强反射", "木材柔和漫反射", "皮肤半透明散射", "布料吸光", "差异化光学响应"],
    lighting_environment: ["墙面反射", "天空补光", "空气感", "空间层次", "统一的光照关系"],
    lighting_color_temperature: ["暖光", "冷光", "混合光", "偏暖色温", "冷暖平衡"],
    lighting_time_weather: ["清晨", "上午", "午后", "黄昏", "夜晚"],
    lighting_mood: ["温暖生活感", "高级商业感", "电影感", "安静高级", "温暖治愈"],
    lighting_setup: ["左侧大型柔光箱", "右侧弱补光", "轻微轮廓光", "主光辅光组合", "环境光补充"],
    lighting_micro_details: ["边缘光", "漫反射", "次级反射", "空气光", "光尘"],
    prop_identification: ["陶瓷杯", "纸质书籍", "绿色植物", "包装盒", "品牌卡片"],
    prop_category: ["生活类道具", "装饰型道具", "功能型道具", "品牌型道具", "人像类道具"],
    prop_purpose: ["强化主体", "表达尺度", "增加真实性", "营造情绪", "建立使用场景"],
    prop_quantity_grouping: ["单个道具", "少量组合", "多元素堆叠", "成组出现", "层级组合"],
    prop_spatial_position: ["主体左前方", "主体右侧", "紧贴主体", "周围环绕", "远距离背景"],
    prop_scale_relationship: ["小型点缀", "同等比例", "大型背景元素", "合理比例", "视觉补充"],
    prop_shape_structure: ["圆柱形结构", "方形轮廓", "不规则轮廓", "杯口略微外扩", "弧形把手"],
    prop_material_texture: ["哑光陶瓷材质", "纸张纤维纹理", "天然木材纹理", "透明玻璃材质", "磨砂金属质感"],
    prop_color_relationship: ["低饱和自然色调", "白色陶瓷", "深色木材", "统一色关系", "绿色点缀"],
    prop_arrangement: ["自然生活化摆放", "人为整齐摆放", "对称商业摆放", "轻微倾斜摆放", "打开使用中摆放"],
    prop_usage_state: ["未使用状态", "新包装状态", "轻微使用状态", "书本打开状态", "半满咖啡杯状态"],
    prop_subject_relationship: ["衬托主体关系", "对比主体关系", "场景使用关系", "强化产品定位", "突出自然属性"],
    prop_lighting_interaction: ["侧向柔光受光", "玻璃轻微反光", "底部接触阴影", "金属倒影", "投射柔和阴影"],
    prop_style_identity: ["现代极简风格", "日式自然风格", "复古风道具", "科技风道具", "极简高级道具"],
    prop_narrative_function: ["安静阅读环境", "悠闲下午氛围", "办公状态叙事", "烹饪过程氛围", "生活场景叙事"],
    prop_micro_details: ["纸张纤维", "木纹细节", "杯壁水珠", "灰尘颗粒", "轻微使用痕迹"],
    costume_cultural_identity: ["中国传统服饰体系", "日本服饰体系", "欧洲服饰体系", "东亚传统服饰体系", "民族服饰体系"],
    costume_country_region: ["中国", "日本", "韩国", "印度", "法国"],
    costume_ethnic_system: ["汉服体系", "和服体系", "韩服体系", "印度莎丽", "阿拉伯长袍体系"],
    costume_historical_period: ["平安时代", "江户时代", "中世纪", "文艺复兴时期", "维多利亚时期"],
    costume_dynasty: ["汉代", "唐代", "宋代", "明代", "清代"],
    costume_construction_system: ["深衣体系", "交领右衽", "高腰裙", "马面裙", "十二单"],
    costume_cutting_method: ["东方平面裁剪体系", "西方立体裁剪体系", "直线裁剪", "大片布料", "肩部结构"],
    costume_wearing_method: ["衣片叠合", "交领右衽", "宽腰带固定", "多层叠穿", "包裹式穿着"],
    costume_layering_system: ["多层叠穿", "外袍内衫", "上衣下装层次", "披帛层次", "裙撑层次"],
    costume_complete_system: ["发髻发簪", "上衣下装", "腰部装饰", "鞋履饰品", "披帛玉饰"],
    costume_social_status: ["皇室贵族", "文人士大夫", "军事身份", "宗教身份", "权力象征"],
    costume_craft: ["染织", "刺绣", "织锦", "金线刺绣", "盘扣工艺"],
    costume_symbolic_pattern: ["龙凤祥云", "花鸟纹样", "樱花与鹤", "花卉纹章", "曼荼罗纹样"],
    costume_aesthetic_language: ["儒雅克制", "华丽开放", "清雅含蓄", "克制精致", "奢华宫廷"],
    costume_photography_presentation: ["历史服饰摄影", "文化识别摄影", "影视造型呈现", "商业摄影复刻", "光影场景道具氛围"],
    costume_micro_details: ["织物纤维", "刺绣针脚", "自然褶皱", "袖口细节", "盘扣细节"],
    color_detail: [
      `${fallbackCore}低饱和配色`,
      `${fallbackCore}暖灰莫兰迪配色`,
      `${fallbackCore}冷暖对比色调`,
      `${fallbackCore}复古胶片色调`,
      `${fallbackCore}柔雾渐变色彩`,
    ],
    clothing_style: [
      `${fallbackCore}高定礼服`,
      `${fallbackCore}私宅套装`,
      `${fallbackCore}轻奢居家服`,
      `${fallbackCore}复古裙装`,
      `${fallbackCore}克制时装`,
    ],
    pose: [
      `${fallbackCore}松弛倚靠姿态`,
      `${fallbackCore}回眸转身姿态`,
      `${fallbackCore}安静坐姿动作`,
      `${fallbackCore}微侧身站姿`,
      `${fallbackCore}舒展肩颈姿态`,
    ],
    facial_expression: [
      `${fallbackCore}冷淡直视`,
      `${fallbackCore}慵懒放空`,
      `${fallbackCore}淡淡浅笑`,
      `${fallbackCore}疏离侧视`,
      `${fallbackCore}安静垂眼`,
    ],
  };
  const variants = sectionVariants[sectionKey] ?? [
    `${fallbackCore}精致版本`,
    `${fallbackCore}轻柔版本`,
    `${fallbackCore}高级版本`,
    `${fallbackCore}克制版本`,
    `${fallbackCore}电影感版本`,
  ];

  return uniqueTags(variants.map(compactOptionValue).filter((value) => !isSamePromptLabel(value, currentValue)));
}

function getDirectSectionOptionVariants(sectionKey: PromptSplitSectionKey, currentValue: string): string[] {
  const value = currentValue.toLowerCase();
  const variants: Partial<Record<PromptSplitSectionKey, string[]>> = {
    image_style: [
      "手稿风格",
      "二次元风格",
      "写实风格",
      "水彩手绘风格",
      "复古胶片风格",
    ],
    style_classification: ["极简主义", "复古风", "电影感", "商业广告风", "生活方式摄影风格", "艺术摄影"],
    style_visual_movement: ["北欧风", "日式侘寂", "工业风", "未来科技风", "奢华高级风"],
    style_era: ["古典时期", "复古年代", "Y2K 千禧年代", "当代现代", "轻复古元素"],
    style_cultural_origin: ["东方美学", "西方现代设计", "地中海风格", "阿拉伯风格", "东方自然美学"],
    style_aesthetic_tendency: ["简洁纯净", "安静克制", "自然质朴", "理性秩序", "高级质感"],
    style_color_language: ["低饱和自然色调", "莫兰迪色", "黑金风", "清新自然", "高饱和年轻色彩"],
    style_composition_language: ["中心构图", "对称构图", "三分构图", "留白构图", "中心偏置构图"],
    style_lighting_language: ["高级商业光", "电影光", "自然生活光", "自然侧光", "柔和窗边光"],
    style_material_language: ["天然木材", "陶瓷", "亚麻", "金属玻璃", "大理石真皮"],
    style_spatial_language: ["极简空间", "复古空间", "商业空间", "现代极简布局", "展示性空间"],
    style_design_language: ["柔和曲线", "几何直线", "圆润设计语言", "锐利设计语言", "不对称平衡"],
    style_mood: ["温暖治愈", "冷静高级", "活力年轻", "安静舒适", "放松感"],
    style_commercial_positioning: ["大众消费", "轻奢", "高端奢侈", "年轻消费者", "中高端生活方式品牌"],
    style_keywords: ["现代极简", "北欧生活方式", "自然光摄影", "低饱和色彩", "高级质感"],
    shot_size: ["全景", "中景", "近景", "特写", "大特写"],
    camera_angle: ["平视拍摄角度", "俯视拍摄角度", "仰视拍摄角度", "侧面视角", "低机位透视角度"],
    aspect_ratio: ["1:1 方形画幅", "16:9 横屏画幅", "9:16 竖屏画幅", "4:3 标准画幅", "21:9 宽银幕画幅"],
    composition: ["主体居中构图", "三分法构图", "对称构图", "大面积留白构图", "前景引导线构图"],
    depth_of_field: ["浅景深背景虚化", "深景深全画面清晰", "前景虚化景深", "焦外散景明显", "主体锐利背景柔化"],
    subject_position: ["单人女性", "单人男性", "画面中央", "中心偏右位置", "中心偏左位置", "近距离半身构图"],
    age_character: ["少年感", "青年感", "自然松弛气质", "清冷气质", "温柔气质", "成熟感"],
    body_frame: ["肩部放松", "自然站姿", "修长四肢", "清晰腰线", "身体比例自然协调"],
    face_shape: ["鹅蛋脸轮廓", "椭圆脸轮廓", "瓜子脸轮廓", "方圆脸轮廓", "清晰下颌线"],
    eyebrow_detail: ["自然平直眉", "柔和弯眉", "浓淡适中眉毛", "细眉轮廓", "眉峰柔和"],
    eye_detail: ["杏仁眼", "双眼皮", "眼神柔和", "视线略微偏离镜头", "直视镜头"],
    nose_detail: ["高挺鼻梁", "自然鼻梁", "小巧鼻头", "精致鼻型", "立体鼻梁"],
    lip_detail: ["自然唇形", "饱满唇形", "嘴角轻微上扬", "薄唇轮廓", "自然微笑状态"],
    skin_texture: ["自然真实肤质", "细微肌理", "自然毛孔", "轻微自然光泽", "通透肤质"],
    light_shadow: ["柔和窗边自然光影", "高对比硬光阴影", "霓虹反射光影", "暖色轮廓光影", "低调暗部光影"],
    lighting_source_type: ["自然光源", "人造光源", "多光源关系", "太阳光", "窗户光", "摄影灯"],
    lighting_source_position: ["画面左侧", "画面右侧", "左前方", "右前方", "顶部光源", "背后光源"],
    lighting_direction: ["左侧入射", "右侧入射", "正面照射", "背后逆光", "顶部照射"],
    lighting_source_size: ["大面积自然光入口", "大型柔光箱", "点状光源", "小型聚光灯", "宽幅窗户光"],
    lighting_quality: ["硬光", "柔光", "阴影边缘清晰", "阴影边缘柔和", "明暗反差强"],
    lighting_intensity: ["高曝光", "正常曝光", "低调暗光", "主体突出", "背景压暗"],
    lighting_ratio: ["低光比", "中低光比", "高光比", "亮暗平衡", "强烈明暗差异"],
    lighting_distribution: ["亮部集中于主体中心", "中间调覆盖主要细节", "暗部位于边缘", "最亮区域在主体", "最暗区域在背景角落"],
    lighting_shadow_direction: ["向右后方延伸", "向右延伸", "向后投射", "短阴影", "长阴影"],
    lighting_shadow_quality: ["清晰锐利", "柔和扩散", "浅灰阴影", "深黑阴影", "边缘逐渐扩散"],
    lighting_highlight: ["金属边缘", "皮肤表面", "食物油脂", "点状高光", "条状高光", "柔和亮斑"],
    lighting_reflection_refraction: ["环境倒影", "光斑", "水杯变形", "透明材质光线变化", "自然折射"],
    lighting_material_response: ["金属强反射", "木材柔和漫反射", "皮肤半透明散射", "布料吸光", "差异化光学响应"],
    lighting_environment: ["墙面反射", "天空补光", "空气感", "空间层次", "统一的光照关系"],
    lighting_color_temperature: ["暖光", "冷光", "混合光", "偏暖色温", "冷暖平衡", "中性白光"],
    lighting_time_weather: ["清晨", "上午", "午后", "黄昏", "夜晚", "阴天"],
    lighting_mood: ["温暖生活感", "高级商业感", "电影感", "安静高级", "温暖治愈"],
    lighting_setup: ["左侧大型柔光箱", "右侧弱补光", "轻微轮廓光", "主光辅光组合", "环境光补充"],
    lighting_micro_details: ["边缘光", "Rim Light", "漫反射", "次级反射", "光尘", "光雾"],
    prop_identification: ["陶瓷杯", "纸质书籍", "绿色植物", "包装盒", "品牌卡片", "餐具"],
    prop_category: ["生活类道具", "商业类道具", "食品类道具", "人像类道具", "装饰型道具", "功能型道具"],
    prop_purpose: ["强化主体", "表达尺度", "增加真实性", "营造情绪", "建立使用场景"],
    prop_quantity_grouping: ["单个道具", "少量组合", "多元素堆叠", "成组出现", "层级组合"],
    prop_spatial_position: ["主体左前方", "主体右侧", "紧贴主体", "周围环绕", "远距离背景"],
    prop_scale_relationship: ["小型点缀", "同等比例", "大型背景元素", "合理比例", "视觉补充"],
    prop_shape_structure: ["圆柱形结构", "方形轮廓", "不规则轮廓", "杯口略微外扩", "弧形把手"],
    prop_material_texture: ["哑光陶瓷材质", "纸张纤维纹理", "天然木材纹理", "透明玻璃材质", "磨砂金属质感"],
    prop_color_relationship: ["低饱和自然色调", "白色陶瓷", "深色木材", "统一色关系", "绿色点缀"],
    prop_arrangement: ["自然生活化摆放", "人为整齐摆放", "对称商业摆放", "轻微倾斜摆放", "打开使用中摆放"],
    prop_usage_state: ["未使用状态", "新包装状态", "轻微使用状态", "书本打开状态", "半满咖啡杯状态"],
    prop_subject_relationship: ["衬托主体关系", "对比主体关系", "场景使用关系", "强化产品定位", "突出自然属性"],
    prop_lighting_interaction: ["侧向柔光受光", "玻璃轻微反光", "底部接触阴影", "金属倒影", "投射柔和阴影"],
    prop_style_identity: ["现代极简风格", "日式自然风格", "复古风道具", "科技风道具", "极简高级道具"],
    prop_narrative_function: ["安静阅读环境", "悠闲下午氛围", "办公状态叙事", "烹饪过程氛围", "生活场景叙事"],
    prop_micro_details: ["纸张纤维", "木纹细节", "杯壁水珠", "灰尘颗粒", "轻微使用痕迹"],
    costume_cultural_identity: ["中国传统服饰体系", "日本服饰体系", "欧洲服饰体系", "东亚传统服饰体系", "民族服饰体系"],
    costume_country_region: ["中国", "日本", "韩国", "印度", "阿拉伯地区", "法国"],
    costume_ethnic_system: ["汉服体系", "和服体系", "韩服体系", "印度莎丽", "阿拉伯长袍体系"],
    costume_historical_period: ["平安时代", "江户时代", "中世纪", "文艺复兴时期", "维多利亚时期"],
    costume_dynasty: ["先秦", "汉代", "唐代", "宋代", "明代", "清代"],
    costume_construction_system: ["深衣体系", "交领右衽", "高腰裙", "马面裙", "十二单", "紧身胸衣"],
    costume_cutting_method: ["东方平面裁剪体系", "西方立体裁剪体系", "直线裁剪", "大片布料", "肩部结构"],
    costume_wearing_method: ["衣片叠合", "交领右衽", "宽腰带固定", "多层叠穿", "包裹式穿着"],
    costume_layering_system: ["多层叠穿", "外袍内衫", "上衣下装层次", "披帛层次", "裙撑层次"],
    costume_complete_system: ["发髻发簪", "上衣下装", "腰部装饰", "鞋履饰品", "披帛玉饰"],
    costume_social_status: ["皇室贵族", "文人士大夫", "军事身份", "宗教身份", "权力象征"],
    costume_craft: ["染织", "刺绣", "织锦", "金线刺绣", "盘扣工艺"],
    costume_symbolic_pattern: ["龙凤祥云", "花鸟纹样", "樱花与鹤", "花卉纹章", "曼荼罗纹样"],
    costume_aesthetic_language: ["儒雅克制", "华丽开放", "清雅含蓄", "克制精致", "奢华宫廷"],
    costume_photography_presentation: ["历史服饰摄影", "文化识别摄影", "影视造型呈现", "商业摄影复刻", "光影场景道具氛围"],
    costume_micro_details: ["织物纤维", "刺绣针脚", "自然褶皱", "袖口细节", "盘扣细节"],
    color_detail: ["低饱和莫兰迪配色", "冷暖对比色调", "复古胶片色调", "霓虹高饱和配色", "柔雾渐变色彩"],
    portrait_photography: ["85mm人像镜头", "大光圈浅景深", "近距离半身构图", "面部高清细节", "专业人像摄影质感"],
    portrait_lighting_color: ["左前方柔光", "均匀明暗过渡", "低饱和暖色调", "面部柔和受光", "自然肤色光泽"],
    scene_identity: ["现代极简住宅空间", "开放式客厅", "高端酒店大堂", "街头城市空间", "自然森林环境"],
    spatial_structure: ["三层空间结构", "开放式布局", "前景中景后景分明", "主要活动区域居中", "空间纵深明确"],
    spatial_scale: ["空间尺度宽敞", "高层高空间", "大型落地窗延伸感", "家具尺寸协调", "紧凑空间尺度"],
    scene_perspective: ["人眼高度水平视角", "一点透视结构", "两点透视结构", "广角透视", "低机位空间视角"],
    scene_layering: ["前景虚化植物枝叶", "中景家具视觉中心", "背景浅色墙面", "前中后景分层", "前景低矮装饰元素"],
    architecture_structure: ["落地玻璃窗设计", "黑色金属窗框", "浅色木质地面", "现代建筑线条", "吊顶横梁结构"],
    object_elements: ["低矮布艺沙发", "圆形木质茶几", "三盆绿色植物", "桌面装饰物", "两盏落地灯"],
    material_texture: ["自然木材纹理", "石材细微颗粒感", "玻璃透明质感", "金属低反射质感", "布料纤维质感"],
    scene_color_palette: ["低饱和自然色调", "米白和浅木色", "深木色辅色", "绿色植物点缀", "莫兰迪场景配色"],
    scene_lighting: ["右侧大面积窗户自然光", "自然光柔和扩散", "地面细腻明暗变化", "阴影边缘较软", "顶部柔和灯光"],
    scene_atmosphere: ["安静舒适氛围", "午后自然光环境", "轻松高级生活方式感", "清晨宁静氛围", "商业展示氛围"],
    scene_photography: ["35mm广角镜头", "24mm广角空间摄影", "较深景深", "专业室内摄影效果", "生活方式摄影"],
    scene_micro_details: ["少量生活化物件", "自然分散植物叶片", "轻微使用痕迹", "不完全对称摆放", "真实使用状态"],
    food_category: ["主食类", "肉类", "甜品", "饮品", "小吃"],
    food_specific_identity: ["手工薄底玛格丽特披萨", "草莓奶油戚风蛋糕", "日式照烧鸡肉盖饭", "意大利番茄肉酱意面", "冰拿铁咖啡"],
    food_cuisine_style: ["中餐", "日料", "韩餐", "法餐", "意餐", "墨西哥料理"],
    cuisine_cultural_origin: ["东方饮食氛围", "季节感表达", "共享式饮食文化", "意式家庭用餐文化", "墨西哥街头饮食文化"],
    cuisine_ingredient_system: ["多种食材组合", "新鲜鱼类米饭海藻", "高品质肉类海鲜香草", "番茄橄榄油奶酪香草", "玉米牛肉豆类辣椒"],
    cuisine_flavor_visual: ["自然油亮光泽", "酱汁光泽", "镬气热气", "酸辣香味型", "香料热带风味"],
    cuisine_plating_habit: ["极简留白摆盘", "精确艺术构图", "酱汁轨迹摆盘", "小菜组合摆盘", "粗犷街头摆盘"],
    cuisine_tableware_style: ["深色陶瓷器皿", "手工陶器小碟", "金属碗石锅", "大面积白盘", "木质器皿"],
    cuisine_color_gene: ["丰富色彩", "白黑木色", "红绿白色彩", "低饱和高级灰", "鲜艳高饱和"],
    cuisine_spatial_context: ["温暖家庭感", "安静高级氛围", "热闹家庭聚餐", "木桌厨房场景", "街头美食氛围"],
    cuisine_photography_style: ["温暖家庭感摄影", "安静高级自然摄影", "奢华精品广告摄影", "自然质朴摄影风格", "柔和侧光低饱和色调"],
    food_main_ingredient: ["马苏里拉奶酪", "厚切牛排", "金黄色炸鸡", "新鲜水果", "番茄肉酱"],
    food_supporting_ingredient: ["新鲜罗勒叶", "番茄片", "柠檬片", "香草点缀", "香料粉"],
    food_structure_layer: ["多层结构", "顶部覆盖奶油", "中间夹心层", "底部支撑结构", "圆形层叠结构"],
    food_physical_form: ["圆形轮廓", "长条形外观", "切片展示", "半切形态", "边缘略微不规则"],
    food_cooking_method: ["高温烘焙", "高温煎制", "油炸处理", "蒸制处理", "烟熏处理"],
    food_cooking_state: ["刚出炉状态", "轻微融化状态", "柔软拉丝效果", "冒热气状态", "冰镇状态"],
    food_texture_visual: ["酥脆金黄色纹理", "自然气泡烘烤纹理", "柔软细腻切面", "多汁油脂光泽", "湿润表面"],
    food_freshness: ["自然水润光泽", "切面颜色鲜艳", "叶片挺立", "海鲜湿润光泽", "新鲜现做"],
    food_portion: ["单人精致份量", "分享装份量", "精致小份", "尺寸适中", "与餐盘比例协调"],
    food_plating: ["圆形木质托盘", "精致摆盘", "高级餐厅摆盘", "单人份餐盘摆放", "视觉点缀摆盘"],
    commercial_food_identity: ["高级餐饮广告视觉", "快餐广告定位", "烘焙商品展示", "外卖展示定位", "手工制作质感"],
    product_identity: ["单品展示", "产品组合", "主品配件组合", "家电产品", "数码产品"],
    product_form: ["圆润流线型外观", "几何结构外观", "紧凑协调比例", "柔和边缘弧度", "简洁曲面变化"],
    product_position: ["45度前侧视角", "正面展示", "侧面展示", "顶部俯视", "轻微倾斜摆放"],
    product_composition_ratio: ["产品占据画面约60%", "适量留白", "四周呼吸感留白", "中央偏上视觉中心", "黄金比例位置"],
    product_composition: ["中心构图", "对称构图", "三分构图", "对角线构图", "背景层次引导视线"],
    product_material: ["细腻哑光材质", "磨砂金属质感", "玻璃透明质感", "拉丝金属纹理", "均匀颗粒质感"],
    product_color: ["低饱和深灰色", "白色主体", "黑色主体", "银色金属细节", "高级灰配色"],
    product_feature_detail: ["触控区域", "品牌标识", "功能按钮", "精密拼接", "隐藏式结构"],
    product_supporting_elements: ["相关使用道具", "产品包装", "充电线配件", "食材道具", "尺寸参照道具"],
    product_background: ["浅色极简空间环境", "纯色背景", "柔和渐变背景", "木质桌面背景", "低存在感背景"],
    product_environment_relation: ["自然放置于木质台面", "产品独立展示", "真实使用关系", "悬浮展示", "商业展示整洁感"],
    product_lighting: ["侧前方大面积柔光", "产品表面均匀渐变", "边缘曲面高光", "柔和产品阴影", "产品边缘光"],
    product_photography: ["50mm商业产品摄影镜头", "35mm产品摄影", "85mm压缩视角", "中等景深", "产品主体超高清"],
    commercial_visual_style: ["高级极简商业摄影风格", "科技未来商业风格", "生活方式商业摄影", "奢侈精品风格", "克制色彩产品价值感"],
    product_micro_details: ["真实材质纹理", "轻微划痕", "细微反射变化", "自然阴影变化", "真实摄影效果"],
    mood_tone: ["清冷疏离", "慵懒松弛", "温柔治愈", "复古忧郁", "性感高级"],
    atmosphere: ["安静温柔氛围", "梦幻浪漫氛围", "高级时尚氛围", "复古怀旧氛围", "神秘超现实氛围"],
    photography_style: ["韩系写真", "欧美时尚大片", "复古港风", "商业高定", "私房纪实"],
    clothing_style: ["居家服", "礼服", "西装", "休闲穿搭", "复古旗袍"],
    pose: ["自然站姿动作", "优雅坐姿动作", "回眸转身姿态", "倚靠松弛姿态", "奔跑动态姿态"],
    facial_expression: ["冷淡直视", "慵懒放空", "淡淡浅笑", "疏离侧视", "安静垂眼"],
  };
  const baseVariants = variants[sectionKey] ?? [];

  if (sectionKey === "image_style" && /pixar|皮克斯|卡通|渲染|3d/i.test(value)) {
    return ["手稿风格", "二次元风格", "写实风格", "水彩手绘风格", "低多边形 3D 风格"];
  }

  return baseVariants;
}

function getOptionContextCore(currentValue: string, prompt: string): string {
  const currentCore = cleanOptionCore(currentValue);

  if (currentCore) {
    return currentCore;
  }

  return cleanOptionCore(prompt.split(/[，,。；;\n]/u).find(Boolean) ?? "");
}

function cleanOptionCore(value: string): string {
  return value
    .replace(/\{\{\s*([^}:]+)\s*:\s*([^}]+?)\s*\}\}/g, (_match, _key: string, optionValue: string) => optionValue.trim())
    .replace(/^(?:当前|整体|画面|氛围|风格|镜头|使用|呈现|保持)\s*[:：]?\s*/u, "")
    .replace(/(?:主体定位|年龄气质|脸型轮廓|眉毛细节|眼睛眼神|鼻子结构|嘴唇唇形|肤质纹理|场景类型定位|空间结构|空间比例尺度|场景透视关系|前中后景分层|建筑空间结构|主要物体元素|场景材质纹理|场景色彩体系|场景光影关系|场景氛围情绪|场景摄影参数|场景微观细节|食物大类别|具体名称识别|菜系分类|地域料理类型|地域文化来源|典型食材体系|味型视觉表达|传统摆盘习惯|常用餐具风格|色彩基因|空间环境特点|摄影表现风格|主体食材|辅助食材|结构层次|外形轮廓|烹饪方式|熟成状态|口感视觉表现|新鲜程度|份量比例|摆盘方式|商业定位|产品主体定位|产品外观结构|产品摆放角度|产品比例关系|产品构图布局|产品材质纹理|产品色彩体系|产品细节卖点|产品配件元素|产品背景环境|产品环境关系|产品光影关系|产品摄影参数|商业视觉风格|产品微观细节|道具识别|道具类别|道具功能作用|数量组合关系|空间位置|尺寸比例|外形结构|材质纹理|色彩关系|使用状态|主体关联关系|光影表现|风格属性|故事氛围|服饰文化身份|国家地区体系|民族体系|历史时期|历史朝代|服装形制|裁剪方式|穿着方式|配套系统|社会身份|制作工艺|民族纹样符号|服饰审美语言|摄影呈现|服饰微观细节|微观细节|摄影参数|光影色彩|氛围|风格|摄影|拍摄角度|角度|视角|光影|配色|色调|姿态|动作|表情|妆容|服装|细节|版本)$/u, "")
    .replace(/[“”"']/g, "")
    .replace(/[，,。；;\n].*$/u, "")
    .trim()
    .slice(0, 12);
}

function compactOptionValue(value: string): string {
  return value.replace(/\s+/g, " ").replace(/(.{22}).+$/u, "$1").trim();
}

function isPromptOptionCompatible(sectionKey: PromptSplitSectionKey, value: string, _currentValue: string): boolean {
  if (!value.trim()) {
    return false;
  }

  const patterns = sectionCuePatterns[sectionKey];

  return !patterns || patterns.length === 0 || patterns.some((pattern) => pattern.test(value));
}

function isNegativeAnalysisSection(section: PromptAnalysisSection): boolean {
  return section.key === "negative" || section.variable.trim().toLowerCase() === "avoid";
}

function cleanNegativePromptValue(value: string): string {
  return value
    .trim()
    .replace(/^(?:反向提示词|负向提示词|负面提示词|反向|负向|负面|避免内容|negative prompt|negative|avoid)\s*[:：]\s*/i, "")
    .replace(/[。.!！]+$/u, "")
    .trim();
}

function removePromptValue(prompt: string, value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return prompt;
  }

  return prompt
    .replace(new RegExp(`\\s*${escapeRegExp(trimmedValue)}\\s*`, "u"), " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*([,，。；;])\s*/g, "$1")
    .replace(/([,，；;]){2,}/g, "$1")
    .trim();
}

function extractLabeledNegativePromptBlocks(prompt: string): { prompt: string; values: string[] } {
  const keptLines: string[] = [];
  const values: string[] = [];
  let isCollectingNegativeBlock = false;

  for (const line of prompt.replace(/\r\n/g, "\n").split("\n")) {
    const fullLineMatch = line.match(/^\s*(?:反向提示词|负向提示词|负面提示词|negative prompt|negative|avoid)\s*[:：]\s*(.*)$/iu);

    if (fullLineMatch) {
      values.push(...splitNegativePromptValueBlock(fullLineMatch[1] ?? ""));
      isCollectingNegativeBlock = true;
      continue;
    }

    const inlineLineMatch = line.match(
      /^(.*?)(?:^|[\s,，。；;])(?:反向提示词|负向提示词|负面提示词|negative prompt|negative|avoid)\s*[:：]\s*(.*)$/iu,
    );

    if (inlineLineMatch) {
      const beforeLabel = cleanPromptAfterNegativeRemoval(inlineLineMatch[1] ?? "");

      if (beforeLabel) {
        keptLines.push(beforeLabel);
      }

      values.push(...splitNegativePromptValueBlock(inlineLineMatch[2] ?? ""));
      isCollectingNegativeBlock = true;
      continue;
    }

    if (isCollectingNegativeBlock) {
      if (isPositivePromptLabelLine(line)) {
        isCollectingNegativeBlock = false;
        keptLines.push(line);
        continue;
      }

      values.push(...splitNegativePromptValueBlock(line));
      continue;
    }

    keptLines.push(line);
  }

  return {
    prompt: keptLines.join("\n"),
    values: uniqueTags(values.map(cleanNegativePromptValue).filter(Boolean)),
  };
}

function splitNegativePromptValueBlock(value: string): string[] {
  return cleanNegativePromptValue(value)
    .split(/[\n,，、；;]+/u)
    .map(cleanNegativePromptValue)
    .filter(Boolean);
}

function isPositivePromptLabelLine(line: string): boolean {
  return /^\s*(?:正向提示词|正面提示词|优化后提示词|优化提示词|最终提示词|提示词正文|positive prompt|prompt)\s*[:：]/iu.test(line);
}

function cleanPromptAfterNegativeRemoval(prompt: string): string {
  return prompt
    .replace(
      /(^|[\n,，。；;])\s*(?:反向提示词|负向提示词|负面提示词|negative prompt|negative|avoid)\s*[:：]\s*(?=$|[\n,，。；;])/giu,
      "$1",
    )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*([,，。；;])\s*/g, "$1")
    .replace(/([,，；;]){2,}/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s*[,，。；;]\s*$/u, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getContextualOptions(sectionKey: PromptSplitSectionKey, _context: string): string[] {
  const defaults: Partial<Record<PromptSplitSectionKey, string[]>> = {
    lens_equipment: ["85mm 定焦人像镜头", "35mm 广角环境人像", "50mm 标准镜头", "长焦压缩感", "微距人像镜头", "电影宽幅镜头"],
    image_style: [
      "浮世绘 Ukiyo-e 木版画风格",
      "毕加索立体主义 Cubism 风格",
      "弗里达超现实主义 Surrealism 风格",
      "列宾现实主义 Realism 风格",
      "赛博朋克霓虹风格",
      "2D 插画风格",
      "写实厚涂风格",
      "水彩手绘风格",
    ],
    style_classification: ["极简主义", "复古风", "电影感", "商业广告风", "生活方式摄影风格", "艺术摄影"],
    style_visual_movement: ["北欧风", "日式侘寂", "工业风", "未来科技风", "奢华高级风"],
    style_era: ["古典时期", "复古年代", "Y2K 千禧年代", "当代现代", "轻复古元素"],
    style_cultural_origin: ["东方美学", "西方现代设计", "地中海风格", "阿拉伯风格", "东方自然美学"],
    style_aesthetic_tendency: ["简洁纯净", "安静克制", "自然质朴", "理性秩序", "高级质感"],
    style_color_language: ["低饱和自然色调", "莫兰迪色", "黑金风", "清新自然", "高饱和年轻色彩"],
    style_composition_language: ["中心构图", "对称构图", "三分构图", "留白构图", "中心偏置构图"],
    style_lighting_language: ["高级商业光", "电影光", "自然生活光", "自然侧光", "柔和窗边光"],
    style_material_language: ["天然木材", "陶瓷", "亚麻", "金属玻璃", "大理石真皮"],
    style_spatial_language: ["极简空间", "复古空间", "商业空间", "现代极简布局", "展示性空间"],
    style_design_language: ["柔和曲线", "几何直线", "圆润设计语言", "锐利设计语言", "不对称平衡"],
    style_mood: ["温暖治愈", "冷静高级", "活力年轻", "安静舒适", "放松感"],
    style_commercial_positioning: ["大众消费", "轻奢", "高端奢侈", "年轻消费者", "中高端生活方式品牌"],
    style_keywords: ["现代极简", "北欧生活方式", "自然光摄影", "低饱和色彩", "高级质感"],
    photography_style: ["韩系写真", "欧美时尚大片", "复古港风", "中式暗调", "私房纪实", "商业高定", "随手私人快照", "油画人像"],
    shot_size: ["全景", "远景", "中景", "近景", "特写", "大特写"],
    aspect_ratio: ["1:1 方形构图", "3:3 方形画幅", "16:9 横屏画幅", "横屏横构图", "9:16 竖屏画幅", "竖屏竖构图"],
    camera_angle: ["平视拍摄角度", "俯视拍摄角度", "仰视拍摄角度", "侧面视角", "高机位鸟瞰视角", "低机位透视角度"],
    composition: ["主体居中构图", "三分法构图", "对称构图", "大面积留白构图", "前景引导线构图", "框架式构图"],
    depth_of_field: ["浅景深背景虚化", "深景深全画面清晰", "前景虚化景深", "焦外散景明显", "主体锐利背景柔化"],
    film_medium: ["柯达金 200 胶片质感", "富士 400H 胶片质感", "黑白胶片", "宝丽来拍立得", "数码原生", "CCD 复古", "IMAX 电影质感"],
    exposure_logic: ["过曝高光", "欠曝暗调", "均衡正常曝光", "高对比度硬调", "低对比柔雾灰调", "逆光轮廓冲光"],
    image_effect: ["暗角", "镜头眩光", "光斑散景", "柔焦雾化", "细腻颗粒", "胶片划痕", "轻微色散", "朦胧柔光"],
    subject_position: ["单人女性", "单人男性", "画面中央", "中心偏右位置", "中心偏左位置", "画面约70%视觉区域", "近距离半身构图", "身体略微侧向镜头"],
    identity_attribute: ["财阀气质", "校园少女感", "清冷御姐气质", "少年感", "混血气质", "成熟女性气质"],
    age_character: ["少年感", "青年感", "青年阶段", "成熟感", "自然松弛气质", "清冷气质", "温柔气质", "高级感", "文艺感"],
    body_frame: ["身体比例自然协调", "肩部放松", "肩膀自然下沉", "修长四肢", "清晰腰臀比例", "自然站姿", "S型曲线", "窄肩单薄骨架", "舒展肩宽", "优越头身比", "健硕体态骨架"],
    facial_structure: ["鹅蛋脸骨相", "方圆脸骨相", "菱形脸骨相", "高眉骨鼻梁", "清晰下颌线", "高颅顶比例"],
    face_shape: ["鹅蛋脸轮廓", "椭圆脸轮廓", "瓜子脸轮廓", "方圆脸轮廓", "圆脸轮廓", "长脸轮廓", "清晰下颌线"],
    eyebrow_detail: ["自然平直眉", "平直眉毛", "柔和弯眉", "浓密眉毛", "细眉轮廓", "眉峰柔和"],
    eye_detail: ["杏仁眼", "狐狸眼", "双眼皮", "眼神柔和", "视线略微偏离镜头", "直视镜头", "侧视不看镜头"],
    nose_detail: ["高挺鼻梁", "立体鼻梁", "自然鼻梁", "精致鼻型", "小巧鼻头"],
    lip_detail: ["自然唇形", "饱满唇形", "嘴角轻微上扬", "自然微笑状态", "薄唇轮廓"],
    skin_base: ["冷白皮", "暖黄皮", "蜜色健康皮", "细腻无暇肤质", "自然毛孔肤质", "轻微雀斑", "泛红破碎感"],
    skin_texture: ["自然真实肤质", "细微肌理", "自然毛孔", "均匀肤色", "轻微自然光泽", "通透肤质"],
    native_facial_feature: ["明显卧蚕", "浅泪沟", "高颧骨", "下颌痣", "上扬眼角弧度"],
    face_makeup: ["自然清透妆容", "复古红唇妆容", "精致眼妆与纤长睫毛", "真实皮肤纹理细节", "高光腮红面部细节"],
    base_makeup: ["哑光雾面底妆", "水光透亮底妆", "伪素颜轻薄底妆", "斑驳氛围感底妆"],
    eye_makeup: ["平直眉形", "冷棕眼影色系", "上扬眼线", "纤长睫毛", "卧蚕提亮", "眼睑下至妆效", "开眼角妆效"],
    midface_makeup: ["面中腮红", "低位腮红", "鼻梁高光", "锁骨高光", "柔和修容明暗", "轻微晒伤妆点"],
    lip_makeup: ["哑光红唇", "镜面唇釉", "丝绒豆沙唇", "润唇质地", "裸色唇妆"],
    special_makeup: ["亮片妆容", "彩绘妆容", "晒伤妆", "破碎感哭妆", "复古红唇", "极简裸妆", "舞台浓妆"],
    hair_accessory: ["柔顺长发造型", "复古盘发发型", "短发利落造型", "珍珠头饰细节", "金属发簪头饰", "编发与发带细节"],
    hair_color: ["纯黑发色", "冷棕发色", "奶茶发色", "粉棕发色", "白金发色", "红棕发色", "挑染发色", "渐变发色"],
    hair_length: ["短发", "锁骨发", "长发", "超长发", "齐刘海", "空气刘海", "无刘海", "中分"],
    hair_style: ["大波浪卷发", "柔顺直发", "高马尾", "低盘发", "丸子头", "羊毛卷", "湿发", "凌乱碎发", "油头"],
    body_hair_detail: ["眉毛毛发感", "浓密睫毛", "鬓角碎发", "胎毛修饰"],
    face_accessory: ["珍珠耳钉", "长款耳坠", "耳骨钉", "鼻钉", "珍珠面纱", "金丝眼镜", "黑框眼镜", "墨镜"],
    neck_accessory: ["细项链", "choker", "珍珠锁骨链", "钻石吊坠", "丝巾"],
    hand_accessory: ["戒指", "手链", "裸色美甲", "钻石手表"],
    head_accessory: ["发箍", "发夹", "丝带", "贝雷帽", "礼帽", "棒球帽"],
    body_accessory: ["披肩", "手套", "腰链", "胸针"],
    clothing: ["丝绸礼服服装细节", "刺绣织物服装细节", "赛博机能服装细节", "复古西装外套细节", "水彩轻薄纱裙细节"],
    clothing_style: ["居家服", "礼服", "西装", "休闲穿搭", "复古旗袍", "度假长裙", "机车皮衣", "针织套装", "丝绒套装", "羊绒套装"],
    clothing_material: ["真丝材质", "缎面材质", "羊毛材质", "蕾丝材质", "牛仔材质", "哑光棉材质", "亮面皮革", "薄纱材质", "毛绒材质"],
    clothing_color: ["香槟色系", "酒红色系", "黑色套装", "黑白配色", "低饱和色系", "纯色套装", "撞色搭配"],
    clothing_cut: ["吊带剪裁", "抹胸剪裁", "宽松廓形", "修身剪裁", "高开叉剪裁", "长款剪裁", "短款剪裁", "oversize 廓形", "紧身剪裁"],
    pose: ["自然站姿动作", "优雅坐姿动作", "回眸转身姿态", "奔跑动态姿态", "倚靠墙面的松弛姿态", "舞蹈延展姿态"],
    hand_gesture: ["双手自然垂放手势", "指尖轻触脸颊手势", "单手托腮手势", "双手合十手势", "比心手势", "抬手整理头发手势"],
    leg_pose: ["交叉腿", "屈膝", "双腿伸直", "盘腿", "单腿踮脚"],
    shoulder_neck_pose: ["含肩慵懒", "挺胸舒展", "歪头", "侧脸低头", "仰头"],
    facial_expression: ["冷淡疲惫", "慵懒放空", "淡淡浅笑", "破碎委屈", "冷艳疏离", "温柔柔和", "清冷厌世", "直视镜头", "侧视不看镜头", "闭眼松弛"],
    nail_detail: ["裸色美甲", "碎钻美甲", "短甲", "长甲"],
    tattoo_detail: ["无纹身", "手臂纹身", "锁骨纹身图案"],
    skin_detail: ["锁骨高光", "肩颈线条", "轻微泛红", "水光肌肤质感"],
    hand_prop: ["手持花束道具", "手握复古相机道具", "手捧书本道具", "手持透明雨伞道具", "手持发光装置道具"],
    portrait_photography: ["85mm人像镜头", "大光圈浅景深", "近距离半身构图", "面部高清细节", "专业人像摄影质感"],
    portrait_lighting_color: ["左前方柔光", "右前方柔光", "均匀明暗过渡", "低饱和暖色调", "面部柔和受光", "自然肤色光泽"],
    scene_identity: ["现代极简住宅空间", "开放式客厅", "室内空间", "室外环境", "城市空间", "自然环境", "商业空间", "高端酒店大堂", "街头场景"],
    spatial_structure: ["三层空间结构", "开放式布局", "前景中景后景分明", "主要活动区域居中", "空间纵深明确", "自然光入口"],
    spatial_scale: ["空间尺度宽敞", "高层高空间", "大型落地窗延伸感", "家具尺寸协调", "开阔空间", "紧凑空间"],
    scene_perspective: ["人眼高度水平视角", "一点透视结构", "两点透视结构", "广角透视", "低机位空间视角", "桌面高度视角"],
    scene_layering: ["前景虚化植物枝叶", "中景家具视觉中心", "背景浅色墙面", "前景低矮装饰元素", "窗外自然景观"],
    architecture_structure: ["落地玻璃窗设计", "黑色金属窗框", "浅色木质地面", "现代建筑线条", "吊顶横梁结构", "浅色墙面"],
    object_elements: ["低矮布艺沙发", "圆形木质茶几", "三盆绿色植物", "桌面装饰物", "两盏落地灯", "家具主体"],
    material_texture: ["自然木材纹理", "石材细微颗粒感", "玻璃透明质感", "金属低反射质感", "布料纤维质感", "半哑光表面"],
    scene_color_palette: ["低饱和自然色调", "米白和浅木色", "深木色辅色", "绿色植物视觉点缀", "莫兰迪场景配色", "金属黑点缀"],
    scene_lighting: ["右侧大面积窗户自然光", "左侧大面积窗户自然光", "自然光柔和扩散", "地面细腻明暗变化", "阴影边缘较软", "顶部柔和灯光"],
    scene_atmosphere: ["安静舒适氛围", "午后自然光环境", "轻松高级生活方式感", "清晨宁静氛围", "黄昏温暖氛围", "商业展示氛围"],
    scene_photography: ["35mm广角镜头", "24mm广角空间摄影", "50mm自然视角", "较深景深", "专业室内摄影效果", "生活方式摄影"],
    scene_micro_details: ["少量生活化物件", "自然分散植物叶片", "轻微使用痕迹", "不完全对称摆放", "自然褶皱", "真实使用状态"],
    food_category: ["主食类", "肉类", "甜品", "饮品", "小吃", "西式烘焙甜品"],
    food_specific_identity: ["手工薄底玛格丽特披萨", "草莓奶油戚风蛋糕", "日式照烧鸡肉盖饭", "意大利番茄肉酱意面", "冰拿铁咖啡", "厚切谷饲牛排"],
    food_cuisine_style: ["中餐", "日料", "韩餐", "泰餐", "法餐", "意餐", "墨西哥料理"],
    cuisine_cultural_origin: ["东方饮食氛围", "季节感表达", "共享式饮食文化", "传统中餐文化", "意式家庭用餐文化", "墨西哥街头饮食文化"],
    cuisine_ingredient_system: ["多种食材组合", "新鲜鱼类米饭海藻", "高品质肉类海鲜香草", "番茄橄榄油奶酪香草", "香草辣椒椰奶海鲜", "玉米牛肉豆类辣椒"],
    cuisine_flavor_visual: ["自然油亮光泽", "酱汁光泽", "镬气热气", "酸辣香味型", "香料热带风味", "酱汁线条"],
    cuisine_plating_habit: ["极简留白摆盘", "精确艺术构图", "酱汁轨迹摆盘", "小菜组合摆盘", "共享式摆盘", "粗犷街头摆盘"],
    cuisine_tableware_style: ["深色陶瓷器皿", "手工陶器小碟", "金属碗石锅", "大面积白盘", "简洁餐具", "木质器皿"],
    cuisine_color_gene: ["丰富色彩", "白黑木色", "红绿白色彩", "低饱和高级灰", "鲜艳高饱和", "明亮热烈色彩"],
    cuisine_spatial_context: ["温暖家庭感", "安静高级氛围", "热闹家庭聚餐", "木桌厨房场景", "街头美食氛围", "高端餐厅环境"],
    cuisine_photography_style: ["温暖家庭感摄影", "安静高级自然摄影", "奢华精品广告摄影", "自然质朴摄影风格", "热带风味摄影", "柔和侧光低饱和色调"],
    food_main_ingredient: ["马苏里拉奶酪", "厚切牛排", "金黄色炸鸡", "新鲜水果", "番茄肉酱", "柔软蛋糕层"],
    food_supporting_ingredient: ["新鲜罗勒叶", "番茄片", "柠檬片", "香草点缀", "坚果碎", "香料粉"],
    food_structure_layer: ["多层结构", "顶部覆盖奶油", "中间夹心层", "底部支撑结构", "圆形层叠结构"],
    food_physical_form: ["圆形轮廓", "长条形外观", "切片展示", "半切形态", "厚切形态", "边缘略微不规则"],
    food_cooking_method: ["高温烘焙", "高温煎制", "油炸处理", "蒸制处理", "烟熏处理", "生食处理"],
    food_cooking_state: ["刚出炉状态", "轻微融化状态", "柔软拉丝效果", "冒热气状态", "冰镇状态", "五分熟状态"],
    food_texture_visual: ["酥脆金黄色纹理", "自然气泡烘烤纹理", "柔软细腻切面", "多汁油脂光泽", "湿润表面", "明显切面层次"],
    food_freshness: ["自然水润光泽", "切面颜色鲜艳", "叶片挺立", "海鲜湿润光泽", "新鲜现做", "食材新鲜感"],
    food_portion: ["单人精致份量", "分享装份量", "精致小份", "尺寸适中", "小巧份量", "与餐盘比例协调"],
    food_plating: ["圆形木质托盘", "精致摆盘", "高级餐厅摆盘", "单人份餐盘摆放", "视觉点缀摆盘", "围绕主体摆放"],
    commercial_food_identity: ["高级餐饮广告视觉", "快餐广告定位", "烘焙商品展示", "外卖展示定位", "手工制作质感", "高品质原料卖点"],
    product_identity: ["单品展示", "产品组合", "主品配件组合", "家电产品", "美妆产品", "数码产品"],
    product_form: ["圆润流线型外观", "几何结构外观", "圆柱形结构", "紧凑协调比例", "柔和边缘弧度", "简洁曲面变化"],
    product_position: ["45度前侧视角", "正面展示", "侧面展示", "顶部俯视", "悬浮展示", "轻微倾斜摆放"],
    product_composition_ratio: ["产品占据画面约60%", "产品占据画面约80%", "适量留白", "四周呼吸感留白", "中央偏上视觉中心", "黄金比例位置"],
    product_composition: ["中心构图", "对称构图", "三分构图", "对角线构图", "背景层次引导视线"],
    product_material: ["细腻哑光材质", "磨砂金属质感", "玻璃透明质感", "拉丝金属纹理", "均匀颗粒质感", "陶瓷光泽"],
    product_color: ["低饱和深灰色", "白色主体", "黑色主体", "银色金属细节", "高级灰配色", "现代简洁色彩"],
    product_feature_detail: ["触控区域", "品牌标识", "功能按钮", "显示屏幕", "精密拼接", "隐藏式结构"],
    product_supporting_elements: ["相关使用道具", "产品包装", "充电线配件", "食材道具", "杯子道具", "尺寸参照道具"],
    product_background: ["浅色极简空间环境", "纯色背景", "柔和渐变背景", "木质桌面背景", "石材背景", "低存在感背景"],
    product_environment_relation: ["自然放置于木质台面", "产品独立展示", "真实使用关系", "悬浮展示", "手持展示", "商业展示整洁感"],
    product_lighting: ["侧前方大面积柔光", "产品表面均匀渐变", "边缘曲面高光", "金属区域高光", "柔和产品阴影", "产品边缘光"],
    product_photography: ["50mm商业产品摄影镜头", "35mm产品摄影", "85mm压缩视角", "中等景深", "产品主体超高清", "微距细节"],
    commercial_visual_style: ["高级极简商业摄影风格", "科技未来商业风格", "生活方式商业摄影", "奢侈精品风格", "克制色彩产品价值感"],
    product_micro_details: ["真实材质纹理", "轻微划痕", "细微灰尘", "细微反射变化", "自然阴影变化", "真实摄影效果"],
    location_scene: ["顶层公寓", "海边露台", "古堡书房", "豪车后座", "酒店宴会厅", "卧室", "花园", "泳池", "咖啡馆"],
    furniture_soft_decoration: ["丝绒沙发", "厚绒地毯", "复古桌椅", "落地镜", "纱质窗帘", "抱枕", "水晶灯具摆件"],
    background_view: ["城市夜景", "海面落日", "山林绿植", "窗外雨天", "街道霓虹", "阴天天空"],
    floor_material: ["大理石地面", "地毯地面", "实木地板", "沙滩地面", "草坪地面", "瓷砖地面"],
    spatial_detail: ["落地窗纱帘", "毛绒软装", "金属轻奢细节", "复古雕花", "极简留白空间"],
    environment_weather: ["室内无风", "窗外下雨", "薄雾", "黄昏", "深夜", "正午晴天"],
    light_shadow: ["柔和窗边自然光影", "高对比硬光阴影", "霓虹反射光影", "暖色轮廓光影", "低调暗部光影", "棚拍柔光光影"],
    lighting_source_type: ["自然光源", "人造光源", "多光源关系", "太阳光", "天空散射光", "窗户光", "摄影灯"],
    lighting_source_position: ["画面左侧", "画面右侧", "左前方", "右前方", "背后光源", "顶部光源"],
    lighting_direction: ["左侧入射", "右侧入射", "正面照射", "背后逆光", "顶部照射"],
    lighting_source_size: ["大面积自然光入口", "大型柔光箱", "点状光源", "小型聚光灯", "宽幅窗户光"],
    lighting_quality: ["硬光", "柔光", "阴影边缘清晰", "阴影边缘柔和", "明暗反差强", "过渡自然"],
    lighting_intensity: ["高曝光", "正常曝光", "低调暗光", "主体突出", "背景压暗", "亮度逐渐降低"],
    lighting_ratio: ["低光比", "中低光比", "高光比", "亮部与暗部保持平衡", "强烈明暗差异"],
    lighting_distribution: ["亮部集中于主体中心", "中间调覆盖主要细节", "暗部位于边缘", "最亮区域在主体", "最暗区域在背景角落"],
    lighting_shadow_direction: ["向右后方延伸", "向右延伸", "向后投射", "短阴影", "长阴影"],
    lighting_shadow_quality: ["清晰锐利", "柔和扩散", "浅灰阴影", "深黑阴影", "边缘逐渐扩散"],
    lighting_highlight: ["金属边缘", "皮肤表面", "食物油脂", "点状高光", "条状高光", "柔和亮斑"],
    lighting_reflection_refraction: ["环境倒影", "光斑", "水杯变形", "透明材质光线变化", "自然折射"],
    lighting_material_response: ["金属强反射", "木材柔和漫反射", "皮肤半透明散射", "布料吸光", "差异化光学响应"],
    lighting_environment: ["墙面反射", "天空补光", "空气感", "空间层次", "统一的光照关系"],
    lighting_color_temperature: ["暖光", "冷光", "混合光", "偏暖色温", "冷暖平衡", "中性白光"],
    lighting_time_weather: ["清晨", "上午", "午后", "黄昏", "夜晚", "晴天", "阴天", "雨天"],
    lighting_mood: ["温暖生活感", "高级商业感", "电影感", "安静高级", "温暖治愈"],
    lighting_setup: ["左侧大型柔光箱", "右侧弱补光", "轻微轮廓光", "主光辅光组合", "环境光补充"],
    lighting_micro_details: ["边缘光", "Rim Light", "漫反射", "Diffuse Reflection", "次级反射", "Bounce Light", "空气光", "光尘"],
    prop_identification: ["陶瓷杯", "纸质书籍", "绿色植物", "香薰蜡烛", "包装盒", "品牌卡片", "餐具"],
    prop_category: ["生活类道具", "商业类道具", "食品类道具", "人像类道具", "装饰型道具", "功能型道具", "品牌型道具"],
    prop_purpose: ["强化主体", "表达尺度", "增加真实性", "营造情绪", "建立使用场景", "增强生活化场景氛围"],
    prop_quantity_grouping: ["单个道具", "少量组合", "多元素堆叠", "成组出现", "层级组合", "两三个相关元素"],
    prop_spatial_position: ["主体左前方", "主体右侧", "紧贴主体", "周围环绕", "远距离背景", "位于主体之后"],
    prop_scale_relationship: ["小型点缀", "同等比例", "大型背景元素", "合理比例", "视觉补充", "不抢占主要空间"],
    prop_shape_structure: ["圆柱形结构", "方形轮廓", "不规则轮廓", "杯口略微外扩", "弧形把手", "整体轮廓简洁"],
    prop_material_texture: ["哑光陶瓷材质", "纸张纤维纹理", "天然木材纹理", "透明玻璃材质", "磨砂金属质感", "细腻颗粒感"],
    prop_color_relationship: ["低饱和自然色调", "白色陶瓷", "深色木材", "统一色关系", "绿色点缀", "融入背景"],
    prop_arrangement: ["自然生活化摆放", "人为整齐摆放", "对称商业摆放", "轻微倾斜摆放", "打开使用中摆放", "随意生活痕迹"],
    prop_usage_state: ["未使用状态", "新包装状态", "轻微使用状态", "书本打开状态", "半满咖啡杯状态", "桌面轻微杂乱"],
    prop_subject_relationship: ["衬托主体关系", "对比主体关系", "场景使用关系", "强化产品定位", "突出自然属性", "围绕主体形成完整使用场景"],
    prop_lighting_interaction: ["侧向柔光受光", "玻璃轻微反光", "底部接触阴影", "金属倒影", "投射柔和阴影", "自然接触阴影"],
    prop_style_identity: ["现代极简风格", "日式自然风格", "复古风道具", "科技风道具", "极简高级道具", "高级生活方式感"],
    prop_narrative_function: ["安静阅读环境", "悠闲下午氛围", "办公状态叙事", "烹饪过程氛围", "生活场景叙事", "情境表达"],
    prop_micro_details: ["纸张纤维", "木纹细节", "杯壁水珠", "灰尘颗粒", "轻微使用痕迹", "翻折磨损"],
    costume_cultural_identity: ["中国传统服饰体系", "日本服饰体系", "欧洲服饰体系", "东亚传统服饰体系", "民族服饰体系"],
    costume_country_region: ["中国", "日本", "韩国", "印度", "阿拉伯地区", "法国", "意大利", "墨西哥"],
    costume_ethnic_system: ["汉服体系", "和服体系", "韩服体系", "印度莎丽", "阿拉伯长袍体系", "波斯服饰"],
    costume_historical_period: ["平安时代", "江户时代", "中世纪", "文艺复兴时期", "巴洛克时期", "维多利亚时期"],
    costume_dynasty: ["先秦", "汉代", "唐代", "宋代", "明代", "清代"],
    costume_construction_system: ["深衣体系", "曲裾直裾", "交领右衽", "高腰裙宽袖", "马面裙", "十二单", "紧身胸衣"],
    costume_cutting_method: ["东方平面裁剪体系", "西方立体裁剪体系", "直线裁剪", "大片布料", "肩部结构", "腰线塑造"],
    costume_wearing_method: ["衣片叠合", "交领右衽", "宽腰带固定", "多层叠穿", "包裹式穿着"],
    costume_layering_system: ["多层叠穿", "外袍内衫", "上衣下装层次", "披帛层次", "裙撑层次"],
    costume_complete_system: ["发髻发簪", "大袖衫长裙", "披帛玉饰", "腰部装饰", "鞋履饰品", "武器工具"],
    costume_social_status: ["皇室贵族", "文人士大夫", "军事身份", "宗教身份", "权力象征"],
    costume_craft: ["染织", "刺绣", "织锦", "金线刺绣", "盘扣工艺", "蕾丝天鹅绒"],
    costume_symbolic_pattern: ["龙凤祥云", "花鸟纹样", "樱花与鹤", "花卉纹章", "曼荼罗纹样"],
    costume_aesthetic_language: ["古朴礼制", "修长流动典雅", "华丽开放", "清雅含蓄", "稳重规整", "奢华宫廷"],
    costume_photography_presentation: ["历史服饰摄影", "文化识别摄影", "影视造型呈现", "商业摄影复刻", "光影场景道具氛围"],
    costume_micro_details: ["织物纤维", "刺绣针脚", "自然褶皱", "衣缘袖口细节", "盘扣细节"],
    main_light_type: ["伦勃朗硬光", "柔光漫射", "侧逆光", "正面平光", "顶光", "底光", "轮廓发光"],
    light_source: ["落地灯光源", "窗外月光", "落日自然光", "室内水晶灯", "霓虹灯带", "蜡烛火光"],
    light_temperature: ["冷蓝调色温", "暖黄烛光", "冷暖对冲", "中性白光", "紫粉色霓虹"],
    shadow_layer: ["深黑浓郁阴影", "柔和浅阴影", "无阴影平光", "明暗对半分割"],
    reflection_environment: ["墙面反光", "水面反光", "玻璃镜面反光", "金属家具反光"],
    light_receiving: ["正面均匀受光", "侧面单向受光", "逆光轮廓受光", "面部半明半暗受光", "主体顶部受光", "背部边缘受光"],
    color_detail: ["低饱和莫兰迪配色", "冷暖对比色彩细节", "复古胶片色调", "霓虹高饱和色彩细节", "柔和水彩渐变色调"],
    mood_tone: ["清冷疏离", "慵懒松弛", "破碎伤感", "富贵克制", "温柔治愈", "复古忧郁", "冷淡厌世", "性感高级", "安静独处", "微醺氛围感"],
    atmosphere: ["安静温柔氛围", "神秘超现实氛围", "未来都市氛围", "复古怀旧氛围", "高级时尚氛围", "紧张戏剧氛围"],
    foreground_occlusion: ["薄纱前景遮挡", "绿植前景遮挡", "玻璃前景遮挡", "水雾前景遮挡", "光斑前景遮挡", "窗帘前景遮挡"],
    environment_prop: ["香薰蜡烛", "高脚杯", "书本", "鲜花", "地毯抱枕", "摆件"],
    environment_effect: ["空气中漂浮灰尘", "水雾雾气", "窗外雨丝", "飘落花瓣"],
    whitespace_composition: ["大面积留白", "紧凑满画面", "侧边留白", "顶部留白"],
    famous_person: ["毕加索艺术家气质", "弗里达式花冠肖像感", "列宾现实主义人物质感", "梵高式艺术家联想", "奥黛丽赫本复古气质"],
    brand: ["Apple 极简科技品牌感", "Nike 运动品牌感", "Chanel 高级时装品牌感", "Dior 精致奢华品牌感", "Leica 复古相机品牌感"],
    color: ["红色", "蓝色", "绿色", "金色", "黑白灰", "粉色", "银色"],
    typography: ["无衬线粗体字体", "优雅衬线字体", "水彩手写字体", "复古海报字体", "极简细体字体", "书法字体"],
    text_content: ["画面包含中文主标题", "画面包含英文短标语", "海报文字写着限量发售", "副标题为柔和小字", "无文本内容"],
    negative: ["低清晰度", "错误文字", "畸形手部", "过曝高光", "杂乱背景"],
    other: [],
  };

  return defaults[sectionKey] ?? [];
}

function getSectionKeyByVariable(variable: string): PromptSplitSectionKey {
  return getPromptSectionKeyByVariable(variable) ?? "other";
}

function getSupportedSectionKeyByVariable(variable: string, value?: string): PromptSplitSectionKey | null {
  return value === undefined ? getPromptSectionKeyByVariable(variable) : resolvePromptSectionKeyForValue(variable, value);
}

function normalizeVariable(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
}

function findKnownCategoryMatches(input: CategoryInput, content: string): string[] {
  const knownCategories = input.knownCategories ?? [];
  const normalizedContent = content.toLowerCase();

  return knownCategories
    .map((category) => category.trim())
    .filter(isSelectableCategory)
    .filter((category) => {
      if (isSamePromptLabel(category, input.currentCategory ?? "")) {
        return true;
      }

      if (input.tags.some((tag) => isSamePromptLabel(tag, category))) {
        return true;
      }

      if (normalizedContent.includes(category.toLowerCase())) {
        return true;
      }

      const matchingRule = categoryRules.find((rule) => isSamePromptLabel(rule.label, category));

      return Boolean(matchingRule?.keywords.some((keyword) => keyword.test(content)));
    });
}

function isSelectableCategory(label: string): boolean {
  const normalized = normalizePromptLabel(label);

  return Boolean(normalized && !isGenericPromptLabel(normalized));
}

function isSamePromptLabel(first: string, second: string): boolean {
  return normalizePromptLabel(first).toLowerCase() === normalizePromptLabel(second).toLowerCase();
}

function normalizePromptLabel(label: string): string {
  return label.trim().replace(/^#/, "");
}
