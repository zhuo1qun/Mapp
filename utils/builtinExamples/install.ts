import { loadAllProjects, saveProject } from '../persistence/storage';
import { fetchBuiltinExamplesManifest } from './manifest';
import { buildFreshProjectFromExportedProject, parseExportPayload } from './projectFromExport';

export const BUILTIN_EXAMPLE_INSTALLED_KEY = 'mapp-builtin-examples-installed';
export const BUILTIN_EXAMPLE_PROJECT_IDS_KEY = 'mapp-builtin-example-project-ids';

/**
 * 用清单中的稳定 id 记录本地项目 id。旧的数组 key 仍保留，供项目列表排序和兼容旧数据。
 */
const BUILTIN_EXAMPLE_REGISTRY_KEY = 'mapp-builtin-example-projects-by-source-id';

let activeInstallation: Promise<void> | null = null;

function readExampleProjectIds(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(BUILTIN_EXAMPLE_PROJECT_IDS_KEY) ?? '[]') as unknown;
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === 'string')
      : [];
  } catch {
    return [];
  }
}

function readExampleRegistry(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(BUILTIN_EXAMPLE_REGISTRY_KEY) ?? '{}') as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([sourceId, projectId]) => typeof sourceId === 'string' && typeof projectId === 'string'
      )
    );
  } catch {
    return {};
  }
}

function persistExampleRegistry(registry: Record<string, string>, legacyIds: string[]): void {
  localStorage.setItem(BUILTIN_EXAMPLE_REGISTRY_KEY, JSON.stringify(registry));
  localStorage.setItem(
    BUILTIN_EXAMPLE_PROJECT_IDS_KEY,
    JSON.stringify([...new Set([...legacyIds, ...Object.values(registry)])])
  );
}

async function installBuiltinExamplesOnce(): Promise<void> {
  const legacyIds = readExampleProjectIds();
  const registry = readExampleRegistry();

  // saveProject 成功但 localStorage 尚未来得及写入时，也能从项目自身恢复登记，避免重建一份。
  const localProjects = await loadAllProjects();
  for (const project of localProjects) {
    if (
      typeof project.builtinExampleId === 'string' &&
      project.builtinExampleId.length > 0 &&
      !registry[project.builtinExampleId]
    ) {
      registry[project.builtinExampleId] = project.id;
    }
  }
  persistExampleRegistry(registry, legacyIds);

  // 已由旧版本完整安装过的示例没有来源标识；保留现状，避免升级后再补一份。
  if (
    localStorage.getItem(BUILTIN_EXAMPLE_INSTALLED_KEY) === '1' &&
    Object.keys(registry).length === 0 &&
    legacyIds.length > 0
  ) {
    return;
  }

  const manifest = await fetchBuiltinExamplesManifest();
  if (manifest.length === 0) return;

  for (const example of manifest) {
    // 登记过的示例即使后来由开发者维护入口删除，也不会在下次启动时自动复活。
    if (registry[example.id]) continue;

    const response = await fetch(`/examples/${example.file}`, { cache: 'no-cache' });
    if (!response.ok) continue;

    const { project } = parseExportPayload(await response.text());
    const name = typeof project.name === 'string' && project.name.trim() ? project.name.trim() : example.title;
    const fresh = buildFreshProjectFromExportedProject(project, name);
    fresh.builtinExampleId = example.id;
    await saveProject(fresh);

    // 每成功创建一个就立即记录；中途失败、刷新或崩溃后也不会把已完成的示例再建一次。
    registry[example.id] = fresh.id;
    persistExampleRegistry(registry, legacyIds);
  }

  if (manifest.every((example) => registry[example.id])) {
    localStorage.setItem(BUILTIN_EXAMPLE_INSTALLED_KEY, '1');
  }
}

/**
 * 页面内共用同一个安装任务，且优先使用 Web Locks 串行化多个标签页的首次安装。
 */
export function installBuiltinExamples(): Promise<void> {
  if (activeInstallation) return activeInstallation;

  const run = () => installBuiltinExamplesOnce();
  activeInstallation =
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('mapp-builtin-examples-installation', run)
      : run();

  return activeInstallation.finally(() => {
    activeInstallation = null;
  });
}
