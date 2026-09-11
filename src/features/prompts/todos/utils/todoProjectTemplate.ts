import type { TodoProject } from "../../types";
import { parseTodoImportText } from "./todoImportParser";

export const TODO_PROJECT_TEMPLATE_ID = "progress-report" as const;

export const TODO_PROJECT_TEMPLATE_EXAMPLE = `apRelay 的「已适配应用目录」（AppCatalogMetadata.BuiltInKeys）目前共 17 个应用；其中已实现手机端「继续会话(resume)」完整适配记录（含 AgentProxy 续接实现 + 端到端验证文档）的有 9 个——claude、codex、opencode、deepseekharness、freebuff 走 CLI/HTTP 续接，trae、traework、zcode、workbuddy 走窗口聚焦续接；还有 8 个没做「继续会话」适配：claude-haha、doubao、suyan、baidunetdisk、quarknetdisk、adrive、comfyui、leigod（基本是网盘/生图/加速器类，本身没有会话续接语义，claude-haha 则复用 claude 通道未单列）。补充一点：旧版的 AgentResumeRunner + AgentResumeScripts/resume-*.ps1 那套已经重构删掉了，现在「继续」能力分散在 ShellAgentApiProxy / WindowFocusAgentProxy / WorkBuddyAcpAgentProxy / FreebuffApiProxy 这些代理类里，Android 端原来的 RETRYABLE_AGENT_SOURCES 也已经移除。`;

export const BUILT_IN_TODO_PROJECT_TEMPLATES = [
  {
    id: TODO_PROJECT_TEMPLATE_ID,
    name: "项目进度文本",
    description: "自动识别项目标题、已完成事项和未完成事项。",
  },
] as const;

export type TodoProjectTemplateItem = {
  title: string;
  description?: string;
};

export type TodoProjectTemplateResult = {
  templateId: typeof TODO_PROJECT_TEMPLATE_ID;
  projectTitle: string;
  projectDescription?: string;
  completedItems: TodoProjectTemplateItem[];
  pendingItems: TodoProjectTemplateItem[];
  warnings: string[];
};

const appRelaySignal = /AppCatalogMetadata\.BuiltInKeys|已适配应用目录|继续会话(?:\(resume\))?/iu;
const appNamePattern = /[A-Za-z][A-Za-z0-9_-]*/gu;
const groupedAppsPattern = /([A-Za-z][A-Za-z0-9_-]*(?:\s*[、,]\s*[A-Za-z][A-Za-z0-9_-]*)*)\s*(?:走|使用|通过|采用)\s*([^，；。]+)/gu;

export function parseTodoProjectTemplate(input: string, templateId = TODO_PROJECT_TEMPLATE_ID): TodoProjectTemplateResult {
  if (templateId !== TODO_PROJECT_TEMPLATE_ID) return emptyTemplateResult("未知模板。");
  const text = normalizeText(input);
  if (!text) return emptyTemplateResult("内容为空，请粘贴项目进度文本。");
  if (appRelaySignal.test(text)) return parseAppRelayReport(text);
  return parseGenericProgressReport(text);
}

export function buildTodoProjectTemplateTasks(result: TodoProjectTemplateResult, project: TodoProject): {
  completed: Array<{ title: string; description?: string; projectId: string; status: "completed"; progress: 100 }>;
  pending: Array<{ title: string; description?: string; projectId: string; status: "todo"; progress: 0 }>;
} {
  return {
    completed: result.completedItems.map((item) => ({ ...item, projectId: project.id, status: "completed" as const, progress: 100 as const })),
    pending: result.pendingItems.map((item) => ({ ...item, projectId: project.id, status: "todo" as const, progress: 0 as const })),
  };
}

function parseAppRelayReport(text: string): TodoProjectTemplateResult {
  const firstLine = text.split("\n").find(Boolean) ?? text;
  const titleMatch = firstLine.match(/^(.+?)\s*的\s*[「【\[]([^」】\]]+)[」】\]]/u);
  const projectTitle = cleanTitle(titleMatch ? `${titleMatch[1]} ${titleMatch[2]}` : "apRelay 应用适配进度");
  const completedItems: TodoProjectTemplateItem[] = [];
  const pendingItems: TodoProjectTemplateItem[] = [];
  const warnings: string[] = [];

  const completedMatch = text.match(/有\s*(\d+)\s*个\s*[——-]\s*([\s\S]*?)(?:；\s*还有|。\s*还有|$)/u);
  if (completedMatch) {
    const expectedCount = Number(completedMatch[1]);
    for (const match of completedMatch[2].matchAll(groupedAppsPattern)) {
      const mode = cleanTitle(match[2]);
      splitAppNames(match[1]).forEach((name) => completedItems.push({ title: `${name}：${mode}适配` }));
    }
    if (completedItems.length === 0) {
      completedItems.push({ title: cleanTitle(completedMatch[2]) });
    }
    if (expectedCount !== completedItems.length) warnings.push(`已完成事项识别到 ${completedItems.length} 项，原文标记为 ${expectedCount} 项，请在创建前确认。`);
  } else {
    warnings.push("没有识别到“已完成”事项段落。");
  }

  const pendingMatch = text.match(/还有\s*(\d+)\s*个[^：:]*[：:]\s*([A-Za-z][\s\S]*?)(?:（|\(|。|$)/u);
  if (pendingMatch) {
    const expectedCount = Number(pendingMatch[1]);
    const names = [...pendingMatch[2].matchAll(appNamePattern)].map((match) => match[0]);
    names.forEach((name) => pendingItems.push({ title: `${name}：继续会话适配` }));
    if (expectedCount !== pendingItems.length) warnings.push(`未完成事项识别到 ${pendingItems.length} 项，原文标记为 ${expectedCount} 项，请在创建前确认。`);
  } else {
    warnings.push("没有识别到“未完成”事项段落。");
  }

  const note = text.match(/补充一点[：:]\s*([\s\S]+)$/u)?.[1];
  return {
    templateId: TODO_PROJECT_TEMPLATE_ID,
    projectTitle,
    ...(note ? { projectDescription: cleanDescription(note) } : {}),
    completedItems,
    pendingItems,
    warnings,
  };
}

function parseGenericProgressReport(text: string): TodoProjectTemplateResult {
  const parsed = parseTodoImportText(text, { sourceLabel: "项目进度模板" });
  const candidates = parsed.candidates;
  const projectTitle = extractGenericProjectTitle(text, candidates[0]?.projectName);
  const completedItems = candidates.filter((candidate) => candidate.status === "completed").map((candidate) => ({ title: candidate.title, description: candidate.description }));
  const pendingItems = candidates.filter((candidate) => candidate.status !== "completed").map((candidate) => ({ title: candidate.title, description: candidate.description }));
  return {
    templateId: TODO_PROJECT_TEMPLATE_ID,
    projectTitle,
    completedItems,
    pendingItems,
    warnings: candidates.length ? parsed.warnings : ["没有识别到可创建的事项，请使用项目标题、事项列表或完成状态描述。"],
  };
}

function extractGenericProjectTitle(text: string, projectName?: string): string {
  if (projectName?.trim()) return cleanTitle(projectName);
  const heading = text.match(/^#{1,6}\s+(.+)$/mu)?.[1] ?? text.match(/^项目(?:名称)?\s*[:：]\s*(.+)$/mu)?.[1];
  if (heading?.trim()) return cleanTitle(heading);
  const firstLine = text.split("\n").find(Boolean) ?? "";
  const sentence = firstLine.split(/[。！？!?]/u)[0] ?? firstLine;
  return cleanTitle(sentence).slice(0, 80) || "文本项目";
}

function splitAppNames(value: string): string[] {
  return value.split(/[、,]/u).map((name) => name.trim()).filter(Boolean);
}

function emptyTemplateResult(warning: string): TodoProjectTemplateResult {
  return { templateId: TODO_PROJECT_TEMPLATE_ID, projectTitle: "未命名项目", completedItems: [], pendingItems: [], warnings: [warning] };
}

function normalizeText(value: string): string {
  return value.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, "").trim();
}

function cleanTitle(value: string): string {
  return value.replace(/\s+/gu, " ").replace(/^[：:、，,。；;\-]+|[：:、，,。；;]+$/gu, "").trim();
}

function cleanDescription(value: string): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, 500);
}
