import { loadAllProjects, saveProject } from '../persistence/storage';
import { fetchBuiltinExamplesManifest } from './manifest';
import { buildFreshProjectFromExportedProject, parseExportPayload } from './projectFromExport';

export const BUILTIN_EXAMPLE_INSTALLED_KEY = 'mapp-builtin-examples-installed';
export const BUILTIN_EXAMPLE_PROJECT_IDS_KEY = 'mapp-builtin-example-project-ids';

/**
 * 用清单中的稳定 id 记录本地项目 id。旧的数组 key 仍保留，供项目列表排序和兼容旧数据。
 */
const BUILTIN_EXAMPLE_REGISTRY_KEY = 'mapp-builtin-example-projects-by-source-id';

let activeInstallation: Promise<boolean> | null = null;
// 用于 React StrictMode：首轮已经创建示例、第二轮 effect 随后接管时仍会刷新列表一次。
let lastInstallationChanged = false;

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

async function installBuiltinExamplesOnce(): Promise<boolean> {
  const legacyIds = readExampleProjectIds();
  const registry = readExampleRegistry();

  // 日常启动只读两个小型 localStorage 条目，不再扫描 IndexedDB 中的全部项目。
  // 旧版本已安装的数组记录同样视为完成，避免升级时补建一份。
  if (
    localStorage.getItem(BUILTIN_EXAMPLE_INSTALLED_KEY) === '1' &&
    (Object.keys(registry).length > 0 || legacyIds.length > 0)
  ) {
    return false;
  }

  // 仅在安装记录缺失或未完成时扫描：saveProject 成功但 localStorage 尚未来得及写入时，
  // 仍可从项目自身恢复登记，避免重建一份。
  let registryRecovered = false;
  const localProjects = await loadAllProjects();
  for (const project of localProjects) {
    if (
      typeof project.builtinExampleId === 'string' &&
      project.builtinExampleId.length > 0 &&
      !registry[project.builtinExampleId]
    ) {
      registry[project.builtinExampleId] = project.id;
      registryRecovered = true;
    }
  }
  persistExampleRegistry(registry, legacyIds);

  const manifest = await fetchBuiltinExamplesManifest();
  if (manifest.length === 0) return registryRecovered;

  let created = false;
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
    created = true;
  }

  if (manifest.every((example) => registry[example.id])) {
    localStorage.setItem(BUILTIN_EXAMPLE_INSTALLED_KEY, '1');
  }
  return registryRecovered || created;
}

/**
 * 页面内共用同一个安装任务，且优先使用 Web Locks 串行化多个标签页的首次安装。
 */
export function installBuiltinExamples(): Promise<boolean> {
  if (activeInstallation) return activeInstallation;

  if (
    localStorage.getItem(BUILTIN_EXAMPLE_INSTALLED_KEY) === '1' &&
    (Object.keys(readExampleRegistry()).length > 0 || readExampleProjectIds().length > 0)
  ) {
    return Promise.resolve(lastInstallationChanged);
  }

  const run = () => installBuiltinExamplesOnce();
  activeInstallation =
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('mapp-builtin-examples-installation', run)
      : run();

  return activeInstallation
    .then((changed) => {
      lastInstallationChanged = changed;
      return changed;
    })
    .finally(() => {
      activeInstallation = null;
    });
}
