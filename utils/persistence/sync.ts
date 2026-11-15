import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Project } from '../../types';
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  hasSupabaseClientConfig
} from '../supabaseEnv';

// 创建 Supabase 客户端
let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!hasSupabaseClientConfig()) {
    console.info('Supabase is paused or not configured; cloud sync is unavailable');
    return null;
  }
  
  if (!supabase) {
    supabase = createClient(getSupabaseUrl(), getSupabasePublishableKey());
  }
  
  return supabase;
}

// Get device ID (for identifying different devices)
function getDeviceId(): string {
  let deviceId = localStorage.getItem('mapp-device-id');
  if (!deviceId) {
    deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('mapp-device-id', deviceId);
  }
  return deviceId;
}

// Sync status type
export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

// Get last synced project versions
function getLastSyncedVersions(): Map<string, number> {
  const stored = localStorage.getItem('mapp-synced-versions');
  if (!stored) return new Map();
  
  try {
    const data = JSON.parse(stored);
    return new Map(Object.entries(data).map(([id, version]) => [id, version as number]));
  } catch {
    return new Map();
  }
}

// Save last synced project versions
function saveLastSyncedVersions(projects: Project[]): void {
  const versions: Record<string, number> = {};
  projects.forEach(p => {
    versions[p.id] = p.version || 0;
  });
  localStorage.setItem('mapp-synced-versions', JSON.stringify(versions));
}

// Sync all projects to cloud (with incremental sync support)
export async function syncProjectsToCloud(projects: Project[]): Promise<{ success: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: '云端同步已暂停或尚未配置' };
  }

  const deviceId = getDeviceId();

  try {
    // For now, we still sync all projects (to maintain compatibility with current DB structure)
    // But we track versions for future incremental sync optimization
    const projectsData = JSON.stringify(projects);
    const lastSyncTime = Date.now();

    // Use upsert operation (update if exists, insert if not)
    const { error } = await client
      .from('user_projects')
      .upsert({
        device_id: deviceId,
        projects_data: projectsData,
        last_sync_time: lastSyncTime,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'device_id'
      });

    if (error) {
      console.error('同步失败:', error);
      return { success: false, error: error.message };
    }

    // Save last sync time and versions
    localStorage.setItem('mapp-last-sync-time', lastSyncTime.toString());
    saveLastSyncedVersions(projects);

    return { success: true };
  } catch (err) {
    let errorMessage = 'Unknown error';
    if (err instanceof Error) {
      errorMessage = err.message;
      // Check if it's a network error
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        errorMessage = 'Network connection failed, please check network or Supabase configuration';
      } else if (errorMessage.includes('CORS')) {
        errorMessage = 'CORS error, please check Supabase configuration';
      }
    }
    console.error('Sync exception:', err);
    return { success: false, error: errorMessage };
  }
}

// Load projects from cloud
export async function loadProjectsFromCloud(): Promise<{ 
  success: boolean; 
  projects?: Project[]; 
  error?: string;
  isNewDevice?: boolean;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { success: false, error: '云端同步已暂停或尚未配置' };
  }

  const deviceId = getDeviceId();

  try {
    const { data, error } = await client
      .from('user_projects')
      .select('*')
      .eq('device_id', deviceId)
      .single();

    if (error) {
      // If record not found, return empty array (new device)
      if (error.code === 'PGRST116') {
        return { success: true, projects: [], isNewDevice: true };
      }
      console.error('Load failed:', error);
      return { success: false, error: error.message };
    }

    if (!data || !data.projects_data) {
      return { success: true, projects: [], isNewDevice: true };
    }

    const projects = JSON.parse(data.projects_data) as Project[];
    const lastSyncTime = data.last_sync_time;

    // Save last sync time
    if (lastSyncTime) {
      localStorage.setItem('mapp-last-sync-time', lastSyncTime.toString());
    }

    return { success: true, projects };
  } catch (err) {
    let errorMessage = 'Unknown error';
    if (err instanceof Error) {
      errorMessage = err.message;
      // Check if it's a network error
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        errorMessage = 'Network connection failed, please check network or Supabase configuration';
      } else if (errorMessage.includes('CORS')) {
        errorMessage = 'CORS error, please check Supabase configuration';
      }
    }
    console.error('Load exception:', err);
    return { success: false, error: errorMessage };
  }
}

// Merge local and cloud data (resolve conflicts using version numbers)
export function mergeProjects(localProjects: Project[], cloudProjects: Project[]): Project[] {
  // Create project ID mapping
  const localMap = new Map(localProjects.map(p => [p.id, p]));
  const cloudMap = new Map(cloudProjects.map(p => [p.id, p]));

  const merged: Project[] = [];
  const allIds = new Set([...localMap.keys(), ...cloudMap.keys()]);

  for (const id of allIds) {
    const local = localMap.get(id);
    const cloud = cloudMap.get(id);

    if (local && cloud) {
      // Both exist, compare version numbers (higher version wins)
      const localVersion = local.version || 0;
      const cloudVersion = cloud.version || 0;
      
      if (localVersion >= cloudVersion) {
        // Local is newer or same, use local
        merged.push(local);
      } else {
        // Cloud is newer, use cloud
        merged.push(cloud);
      }
    } else if (local) {
      merged.push(local);
    } else if (cloud) {
      merged.push(cloud);
    }
  }

  return merged;
}

// Get changed projects (for incremental sync)
export function getChangedProjects(
  localProjects: Project[], 
  lastSyncedVersions: Map<string, number>
): Project[] {
  return localProjects.filter(project => {
    const lastSyncedVersion = lastSyncedVersions.get(project.id) || 0;
    const currentVersion = project.version || 0;
    return currentVersion > lastSyncedVersion;
  });
}

// Check if sync is needed (based on time interval)
export function shouldSync(): boolean {
  const lastSyncTime = localStorage.getItem('mapp-last-sync-time');
  if (!lastSyncTime) return true;

  const timeSinceLastSync = Date.now() - parseInt(lastSyncTime, 10);
  // If more than 5 minutes since last sync, sync
  return timeSinceLastSync > 5 * 60 * 1000;
}

// Get last sync time
export function getLastSyncTime(): number | null {
  const lastSyncTime = localStorage.getItem('mapp-last-sync-time');
  return lastSyncTime ? parseInt(lastSyncTime, 10) : null;
}
