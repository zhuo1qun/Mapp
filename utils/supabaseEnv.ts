/**
 * 云端服务总开关。暂停期间即使部署环境仍保留 URL / public key，也绝不发起
 * Supabase 请求；恢复时将 VITE_SUPABASE_ENABLED 设为 true 即可。
 */
export function isSupabaseEnabled(): boolean {
  return import.meta.env.VITE_SUPABASE_ENABLED === 'true';
}

/** Supabase 项目 URL（Vite 注入） */
export function getSupabaseUrl(): string {
  return isSupabaseEnabled() ? import.meta.env.VITE_SUPABASE_URL || '' : '';
}

/**
 * 前端可用的「可公开」密钥：新版 `sb_publishable_...` 或旧版 JWT `anon`（eyJ...）
 * 见 https://supabase.com/docs/guides/api/api-keys
 */
export function getSupabasePublishableKey(): string {
  if (!isSupabaseEnabled()) return '';
  return (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    ''
  );
}

export function hasSupabaseClientConfig(): boolean {
  return isSupabaseEnabled() && Boolean(getSupabaseUrl() && getSupabasePublishableKey());
}
