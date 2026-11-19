import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Camera, Check, ChevronRight, Clipboard, Compass, Download, HardDrive, Loader2, MapPin, PackageCheck } from 'lucide-react';
import {
  featureResourceSnapshot,
  loadBoardResource,
  loadCutoutResource,
  loadEditorResource,
  loadMapResource,
  loadMediaToolsResource,
  loadTableResource,
  refreshFeatureResourceState,
  subscribeFeatureResources,
  type FeatureResourceId,
  type FeatureResourceState
} from '../utils/resources/featureResources';
import {
  readDeviceOrientationPermission,
  requestDeviceOrientationPermission,
  subscribeDeviceOrientationPermission
} from '../utils/permissions/deviceOrientation';

type PermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported' | 'unknown';

const resourceLoaders = {
  map: loadMapResource,
  board: loadBoardResource,
  table: loadTableResource,
  editor: loadEditorResource,
  media: loadMediaToolsResource,
  cutout: loadCutoutResource
} as const;

type ResourceId = FeatureResourceId;

const resources: Array<{ id: ResourceId; title: string; detail: string; optional?: boolean }> = [
  { id: 'map', title: 'Mapping 视图', detail: '地图、点位、聚类与位置工具' },
  { id: 'board', title: 'Board 视图', detail: '画布、便签、框选与待定框' },
  { id: 'table', title: 'Table 视图', detail: '表格、筛选与数据关联' },
  { id: 'editor', title: '编辑组件', detail: '正文、媒体栏与属性编辑' },
  { id: 'media', title: '高级媒体工具', detail: '涂鸦、相机与图片详情', optional: true },
  { id: 'cutout', title: 'AI 抠图模型', detail: '首次抠图所需的本地推理模型', optional: true }
];

export function ResourcePermissionsPanel({ themeColor }: { themeColor: string }) {
  const resourceStates = useSyncExternalStore(subscribeFeatureResources, featureResourceSnapshot, featureResourceSnapshot);
  const [permissions, setPermissions] = useState<Record<string, PermissionState>>({
    location: 'unknown', orientation: readDeviceOrientationPermission(), camera: 'unknown', clipboard: 'unknown', storage: 'unknown'
  });
  const [storageText, setStorageText] = useState('正在读取…');

  const setPermission = (id: string, state: PermissionState) => setPermissions((current) => ({ ...current, [id]: state }));

  useEffect(() => {
    let active = true;
    const permissionStatuses: PermissionStatus[] = [];
    const query = async (id: string, name: PermissionName) => {
      if (!navigator.permissions?.query) return setPermission(id, 'unknown');
      try {
        const result = await navigator.permissions.query({ name });
        if (active) {
          setPermission(id, result.state as PermissionState);
          result.onchange = () => setPermission(id, result.state as PermissionState);
          permissionStatuses.push(result);
        }
      } catch {
        if (active) setPermission(id, 'unknown');
      }
    };
    void query('location', 'geolocation');
    void query('camera', 'camera' as PermissionName);
    void query('clipboard', 'clipboard-read' as PermissionName);
    setPermission('orientation', readDeviceOrientationPermission());
    const unsubscribeOrientation = subscribeDeviceOrientationPermission((state) => {
      if (active) setPermission('orientation', state);
    });
    void refreshFeatureResourceState();
    const refreshResources = () => void refreshFeatureResourceState();
    const refreshVisibleResources = () => {
      if (document.visibilityState === 'visible') refreshResources();
    };
    window.addEventListener('focus', refreshResources);
    document.addEventListener('visibilitychange', refreshVisibleResources);
    void (async () => {
      if (!navigator.storage?.estimate) {
        setPermission('storage', 'unsupported');
        setStorageText('浏览器不支持容量查询');
        return;
      }
      const estimate = await navigator.storage.estimate();
      const used = (estimate.usage || 0) / 1024 / 1024;
      const quota = (estimate.quota || 0) / 1024 / 1024;
      const persisted = await navigator.storage.persisted?.();
      if (!active) return;
      setPermission('storage', persisted ? 'granted' : 'prompt');
      setStorageText(`${used.toFixed(1)} MB / ${quota.toFixed(0)} MB${persisted ? '，已持久保存' : ''}`);
    })();
    return () => {
      active = false;
      permissionStatuses.forEach((status) => { status.onchange = null; });
      unsubscribeOrientation();
      window.removeEventListener('focus', refreshResources);
      document.removeEventListener('visibilitychange', refreshVisibleResources);
    };
  }, []);

  const loadResource = async (id: ResourceId, requestPersistence = true) => {
    try {
      if (requestPersistence) {
        const persisted = await navigator.storage?.persist?.();
        if (typeof persisted === 'boolean') setPermission('storage', persisted ? 'granted' : 'prompt');
      }
      await resourceLoaders[id]();
    } catch {
      // 失败状态由统一资源登记器更新。
    }
  };

  const requestPermission = async (id: string) => {
    try {
      if (id === 'location') {
        await new Promise<void>((resolve, reject) => navigator.geolocation.getCurrentPosition(() => resolve(), reject, { timeout: 10000 }));
        setPermission(id, 'granted');
      } else if (id === 'orientation') {
        setPermission(id, await requestDeviceOrientationPermission());
      } else if (id === 'camera') {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        stream.getTracks().forEach((track) => track.stop());
        setPermission(id, 'granted');
      } else if (id === 'clipboard') {
        await navigator.clipboard.read();
        setPermission(id, 'granted');
      } else if (id === 'storage') {
        const granted = await navigator.storage.persist?.();
        setPermission(id, granted ? 'granted' : 'denied');
      }
    } catch {
      setPermission(id, 'denied');
    }
  };

  const downloadAllResources = async () => {
    // A durable storage grant reduces browser eviction of explicitly downloaded resources.
    await navigator.storage?.persist?.().catch(() => false);
    await Promise.all(resources.map(({ id }) => loadResource(id, false)));
    await refreshFeatureResourceState();
    if (navigator.storage?.persisted) {
      const persisted = await navigator.storage.persisted();
      setPermission('storage', persisted ? 'granted' : 'prompt');
    }
  };

  const statusText = (state: FeatureResourceState) => state === 'ready' ? '已就绪' : state === 'downloaded' ? '已下载' : state === 'loading' ? '加载中' : state === 'error' ? '重试' : '加载';
  const permissionText = (state: PermissionState) => ({ granted: '已允许', denied: '已拒绝', prompt: '未授权', unsupported: '不支持', unknown: '待确认' }[state]);
  const permissionItems = [
    { id: 'location', title: '位置', detail: '当前位置、地图定位和点位创建', icon: MapPin },
    { id: 'orientation', title: '方向与运动', detail: '当前位置标记的朝向扇区', icon: Compass },
    { id: 'camera', title: '相机', detail: '直接拍照添加媒体', icon: Camera },
    { id: 'clipboard', title: '剪贴板读取', detail: '读取复制的图片', icon: Clipboard },
    { id: 'storage', title: '本地存储', detail: storageText, icon: HardDrive }
  ];

  return <div className="space-y-5 pb-2">
    <section>
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div><h3 className="text-sm font-bold text-gray-800">功能资源</h3><p className="text-xs text-gray-500">可提前下载，首次打开对应功能时更快。</p></div>
        <button type="button" className="shrink-0 rounded-xl px-3 py-2 text-xs font-bold text-theme-chrome-fg" style={{ backgroundColor: themeColor }} onClick={() => void downloadAllResources()}>下载全部</button>
      </div>
      <div>
        {resources.map((item, index) => {
          const task = resourceStates[item.id];
          const state = task.state;
          const stateDetail = state === 'loading' ? `${task.progress}%` : state === 'downloaded' ? '已下载' : state === 'ready' ? '已就绪' : '';
          return <div key={item.id} className={`flex items-center gap-3 px-1 py-3 ${index ? 'border-t border-gray-300/35' : ''}`}>
            <span className="flex h-9 w-7 shrink-0 items-center justify-center text-gray-500"><PackageCheck size={18} /></span>
            <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">{item.title}{item.optional ? <span className="text-[10px] font-medium text-gray-400">可选</span> : null}</span><span className="block truncate text-xs text-gray-500">{item.detail}{stateDetail ? ` · ${stateDetail}` : ''}</span></span>
            <button type="button" disabled={state === 'loading' || state === 'ready' || (item.id === 'cutout' && state === 'downloaded')} onClick={() => void loadResource(item.id)} className="flex min-w-[4.5rem] items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-70">{state === 'loading' ? <Loader2 size={13} className="animate-spin" /> : state === 'ready' || (item.id === 'cutout' && state === 'downloaded') ? <Check size={13} /> : <Download size={13} />}{state === 'downloaded' ? item.id === 'cutout' ? '已下载' : '加载' : statusText(state)}</button>
          </div>;
        })}
      </div>
    </section>
    <section>
      <div className="mb-2 px-1"><h3 className="text-sm font-bold text-gray-800">权限</h3><p className="text-xs text-gray-500">权限只会在点击授权时向浏览器申请。</p></div>
      <div>
        {permissionItems.map((item, index) => { const Icon = item.icon; const state = permissions[item.id]; return <button key={item.id} type="button" disabled={(state === 'granted' && item.id !== 'orientation') || state === 'unsupported'} onClick={() => void requestPermission(item.id)} className={`flex w-full items-center gap-3 px-1 py-3 text-left hover:opacity-75 disabled:cursor-default ${index ? 'border-t border-gray-300/35' : ''}`}><span className="flex h-9 w-7 shrink-0 items-center justify-center text-gray-500"><Icon size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-gray-800">{item.title}</span><span className="block truncate text-xs text-gray-500">{item.detail}</span></span><span className={`shrink-0 text-xs font-semibold ${state === 'granted' ? 'text-emerald-600' : state === 'denied' ? 'text-red-500' : 'text-gray-500'}`}>{permissionText(state)}</span><ChevronRight size={15} className="shrink-0 text-gray-300" /></button>; })}
      </div>
    </section>
  </div>;
}
