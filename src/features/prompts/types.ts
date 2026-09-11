export type PromptType = "text" | "image" | "video" | "workflow" | "api-config" | "email-config" | "account" | "github-project";
/** 旧色名仅用于兼容历史数据；新建和编辑时只提供胶囊色系。 */
export type PromptColorId =
  | "sage" | "mist" | "clay" | "lavender" | "fog" | "rose" | "sand" | "stone"
  | "blue" | "violet" | "amber" | "emerald" | "cyan" | "indigo" | "orange";
export type PromptSource = "manual" | "clipboard" | "import" | "duplicate";
export type PromptAnalysisStatus = "analyzing" | "ready" | "failed";
export type PromptMetadataSource = {
  title?: "system" | "ai" | "user";
  description?: "system" | "ai" | "user";
  type?: "system" | "ai" | "user";
  category?: "system" | "ai" | "user";
  tags?: "system" | "ai" | "user";
  variables?: "system" | "ai" | "user";
};

export type PromptVariable = {
  name: string;
  defaultValue?: string;
  description?: string;
};

export type PromptGithubFile = {
  path: string;
  type: "file" | "directory";
  size?: number;
  htmlUrl?: string;
  downloadUrl?: string;
};

export type PromptGithubReleaseAsset = {
  name: string;
  label?: string;
  size?: number;
  downloadCount?: number;
  contentType?: string;
  htmlUrl?: string;
  downloadUrl?: string;
};

export type PromptGithubRelease = {
  id: string;
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  publishedAt?: string;
  createdAt?: string;
  prerelease: boolean;
  draft: boolean;
  assets: PromptGithubReleaseAsset[];
};

export type PromptGithubProject = {
  owner: string;
  repository: string;
  fullName: string;
  name: string;
  url: string;
  releasesUrl: string;
  defaultBranch: string;
  readmeName: string;
  readmeContent: string;
  files: PromptGithubFile[];
  /** GitHub Releases；旧版本条目可能没有该字段，渲染层按空列表兼容。 */
  releases?: PromptGithubRelease[];
  treeTruncated?: boolean;
  readmeCollapsed?: boolean;
};

export type PromptEntry = {
  id: string;
  type: PromptType;
  title: string;
  description?: string;
  content: string;
  /** 受限 HTML 正文；content 继续保存纯文本，供搜索和 AI 分析使用。 */
  contentHtml?: string;
  categoryId?: string;
  tagIds: string[];
  favorite: boolean;
  variables: PromptVariable[];
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
  orderKey: string;
  colorId?: PromptColorId;
  source?: PromptSource;
  sourceUrl?: string;
  analysisStatus?: PromptAnalysisStatus;
  metadataSource?: PromptMetadataSource;
  /** 用户在详情中选择的脱敏显示偏好。 */
  masked?: boolean;
  /** 灵感卡片的用户自定义宽高，缺省时使用界面默认尺寸。 */
  cardWidth?: number;
  cardHeight?: number;
  /** 账号条目：密码只以加密形式落盘，读取时经主进程解密。 */
  account?: PromptAccount;
  /** GitHub 项目条目：README 和文件树作为灵感卡片的结构化正文。 */
  github?: PromptGithubProject;
};

/** 账号条目的结构化数据（密码为加密密文，明文永不落盘）。 */
export type PromptAccount = {
  /** 账号名称（邮箱格式）。 */
  name?: string;
  /** safeStorage 加密后的密码（base64）。 */
  passwordEncrypted?: string;
  /** 站点 / 平台名称。 */
  site?: string;
};

/** 账号创建/编辑时经 IPC 发送的短暂明文输入；不会直接写入 library.json。 */
export type PromptAccountInput = {
  name?: string;
  password?: string;
  site?: string;
};

/** 账号读取接口返回给渲染层的明文视图（仅存在于内存）。 */
export type PromptAccountView = {
  name?: string;
  password?: string;
  site?: string;
};

export type PromptCategory = {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  description?: string;
  orderKey: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PromptLibraryFile = {
  schemaVersion: 2;
  updatedAt: string;
  entries: PromptEntry[];
  categories: PromptCategory[];
};

export type PromptInput = { content: string; contentHtml?: string; title?: string; account?: PromptAccountInput } &
  Partial<Pick<PromptEntry, "type" | "description" | "categoryId" | "tagIds" | "variables" | "source" | "sourceUrl" | "colorId" | "metadataSource" | "analysisStatus" | "masked" | "cardWidth" | "cardHeight" | "github">>;

export type PromptCreateInput = PromptInput;

export type PromptUpdate = Partial<PromptInput> & { id: string; favorite?: boolean; type?: PromptType; analysisStatus?: PromptAnalysisStatus };

export type PromptCopyInput = {
  id: string;
  values?: Record<string, string>;
};

export type PromptViewSettings = {
  sidebarMode: "expanded" | "compact" | "hidden";
  sidebarWidth: number;
  viewMode: "grid" | "list";
  sortMode: "manual" | "updated" | "created" | "lastUsed" | "usageCount" | "name";
  cardDensity: "compact" | "comfortable";
  todoSidebarVisible: boolean;
  todoSidebarWidth: number;
};

export type PromptCategoryInput = Pick<PromptCategory, "name"> & Partial<Pick<PromptCategory, "icon" | "color" | "description">>;
export type PromptCategoryUpdate = PromptCategoryInput & { id: string };
export type PromptCategoryDeleteInput = { id: string; targetCategoryId?: string; deleteEntries?: boolean };
export type PromptReorderInput = { promptIds: string[]; targetCategoryId?: string; beforePromptId?: string; afterPromptId?: string };
export type PromptClipboardPayload = { text: string; html?: string; imageDataUrl?: string; source: "text" | "image" | "empty" };
export type PromptClipboardCreateInput = {
  title?: string;
  content: string;
  categoryId?: string;
  tagIds?: string[];
  type?: PromptType;
  sourceUrl?: string;
  github?: PromptGithubProject;
};

export type PromptLibraryExportResult = {
  canceled: boolean;
  filePath: string | null;
  exportedCount: number;
};

export type PromptLibraryImportResult = {
  canceled: boolean;
  filePath: string | null;
  importedCount: number;
  skippedCount: number;
  library: PromptLibraryFile;
};

export type TodoStatus = "todo" | "in-progress" | "completed" | "cancelled";
export type TodoPriority = "low" | "normal" | "high" | "urgent";
export type TodoWidgetViewType = "project" | "date";
export type TodoDatePreset = "today" | "this-week" | "this-month" | "custom";
export type TodoProjectScope = "all" | "specific";

export type TodoTask = {
  id: string;
  title: string;
  description?: string;
  projectId?: string;
  /** 计划在哪一天处理；只表达日期，不包含具体时刻。 */
  plannedDate?: string;
  /** 计划开始工作的具体时间；与计划日独立。 */
  scheduledAt?: string;
  /** 必须完成的硬截止时间；与计划时间独立。 */
  deadlineAt?: string;
  status: TodoStatus;
  priority: TodoPriority;
  progress: number;
  startAt?: string;
  dueAt?: string;
  /** 预计工作时长，单位为分钟。 */
  timeEstimateMinutes?: number;
  /** 实际记录的工作时长，单位为分钟。 */
  timeSpentMinutes?: number;
  /** 父任务 ID；父子任务均为独立任务。 */
  parentId?: string;
  /** 有序子任务 ID 列表，和子任务 parentId 保持一致。 */
  subtaskIds?: string[];
  completedAt?: string;
  /** 已归档任务不参与默认列表和进度汇总，但仍保留在待办库中。 */
  archived?: boolean;
  linkedPromptIds: string[];
  tagIds: string[];
  orderKey: string;
  createdAt: string;
  updatedAt: string;
};

export type TodoProject = {
  id: string;
  name: string;
  description?: string;
  colorId?: PromptColorId;
  icon?: string;
  /** 项目卡片的用户自定义宽高，缺省时按工作区宽度和五项任务高度展示。 */
  cardWidth?: number;
  cardHeight?: number;
  archived: boolean;
  orderKey: string;
  createdAt: string;
  updatedAt: string;
};

export type TodoProgressWidget = {
  id: string;
  viewType: TodoWidgetViewType;
  title?: string;
  projectScope?: TodoProjectScope;
  projectId?: string;
  datePreset?: TodoDatePreset;
  dateFrom?: string;
  dateTo?: string;
  includeCompleted: boolean;
  showOverdue: boolean;
  orderKey: string;
  createdAt: string;
  updatedAt: string;
};

export type TodoLibraryFile = {
  kind: "suyan-todo-library";
  schemaVersion: 1;
  updatedAt: string;
  tasks: TodoTask[];
  projects: TodoProject[];
  widgets: TodoProgressWidget[];
};

/** 用于批量操作与撤销/重做的完整待办快照。 */
export type TodoLibraryReplaceInput = TodoLibraryFile;

export type TodoExportOptions = { taskIds?: string[] };
export type TodoExportResult = { canceled: boolean; filePath: string | null; exportedCount: number; projectCount: number };

export type CreateTodoTaskInput = Partial<Pick<TodoTask, "description" | "projectId" | "plannedDate" | "scheduledAt" | "deadlineAt" | "status" | "priority" | "progress" | "startAt" | "dueAt" | "timeEstimateMinutes" | "timeSpentMinutes" | "parentId" | "linkedPromptIds" | "tagIds">> & { title: string };
export type UpdateTodoTaskInput = Partial<Omit<TodoTask, "id" | "createdAt" | "updatedAt" | "orderKey">>;
export type CreateTodoProjectInput = Pick<TodoProject, "name"> & Partial<Pick<TodoProject, "description" | "colorId" | "icon" | "cardWidth" | "cardHeight" | "archived">>;
export type UpdateTodoProjectInput = Partial<Omit<TodoProject, "id" | "createdAt" | "updatedAt" | "orderKey">>;
export type CreateTodoWidgetInput = Pick<TodoProgressWidget, "viewType" | "includeCompleted" | "showOverdue"> & Partial<Omit<TodoProgressWidget, "id" | "viewType" | "includeCompleted" | "showOverdue" | "createdAt" | "updatedAt" | "orderKey">>;
export type UpdateTodoWidgetInput = Partial<Omit<TodoProgressWidget, "id" | "createdAt" | "updatedAt" | "orderKey">>;

/** 从文本或文档中识别出的待办候选，不直接写入待办库。 */
export type TodoImportCandidate = {
  title: string;
  description?: string;
  projectName?: string;
  status: TodoStatus;
  priority: TodoPriority;
  progress: number;
  startAt?: string;
  dueAt?: string;
  plannedDate?: string;
  scheduledAt?: string;
  deadlineAt?: string;
  timeEstimateMinutes?: number;
  sourceLabel?: string;
};

export type TodoImportParseResult = {
  candidates: TodoImportCandidate[];
  warnings: string[];
  format: "text" | "markdown" | "csv" | "json" | "docx";
};

export type TodoImportFileSummary = {
  fileName: string;
  format: TodoImportParseResult["format"];
  candidateCount: number;
  warnings: string[];
};

export type TodoImportFilesData = {
  canceled: boolean;
  files: TodoImportFileSummary[];
  candidates: TodoImportCandidate[];
  warnings: string[];
  /** Native exports retain project/task relationships and archive state. */
  libraries?: TodoLibraryFile[];
};

export type TodoTaskMutationData = { library: TodoLibraryFile; task: TodoTask };
export type TodoProjectMutationData = { library: TodoLibraryFile; project: TodoProject };
export type TodoWidgetMutationData = { library: TodoLibraryFile; widget: TodoProgressWidget };
