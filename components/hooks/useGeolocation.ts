import { useState, useEffect, useCallback, useRef } from 'react';
import {
  readDeviceOrientationPermission,
  requestDeviceOrientationPermission,
  subscribeDeviceOrientationPermission
} from '../../utils/permissions/deviceOrientation';

export interface LocationData {
  lat: number;
  lng: number;
}

export type LocationPermissionStatus = 'unknown' | 'prompt' | 'granted' | 'denied';
export type LocationAvailability = 'idle' | 'requesting' | 'available' | 'unavailable';
export type LocationFailureStage = 'environment' | 'support' | 'permission' | 'service' | 'position';
export type LocationFailure = {
  stage: LocationFailureStage;
  code: 'insecure' | 'unsupported' | 'denied' | 'unavailable' | 'timeout' | 'unknown';
  message: string;
};

const normalizeHeading = (deg: number): number => {
  const n = deg % 360;
  return n < 0 ? n + 360 : n;
};

const getScreenOrientationAngle = (): number => {
  const so = window.screen?.orientation?.angle;
  if (typeof so === 'number' && !Number.isNaN(so)) return so;
  const wo = (window as Window & { orientation?: number }).orientation;
  if (typeof wo === 'number' && !Number.isNaN(wo)) return wo;
  return 0;
};

const headingFromOrientationEvent = (event: DeviceOrientationEvent): number | null => {
  const webkitHeading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
    .webkitCompassHeading;
  if (typeof webkitHeading === 'number' && !Number.isNaN(webkitHeading)) {
    return normalizeHeading(webkitHeading);
  }
  if (event.alpha == null || Number.isNaN(event.alpha)) return null;
  let heading = 360 - event.alpha;
  heading = normalizeHeading(heading - getScreenOrientationAngle());
  return heading;
};

const HEADING_DEAD_ZONE_DEG = 2.5;
const HEADING_LOW_PASS = 0.28;
const ACTIVE_POSITION_TIMEOUT_MS = 10000;

/** 浏览器只在安全上下文允许定位：https、localhost、127.0.0.1。局域网 http://IP 会直接失败且不弹窗。 */
export const isSecureLocationContext = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
};

export const insecureLocationHint = (): string => {
  const { protocol, hostname, port } = window.location;
  if (protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1') {
    return '当前页面不是安全上下文，浏览器禁止申请位置权限。';
  }
  const portPart = port ? `:${port}` : '';
  return `手机通过 ${protocol}//${hostname}${portPart}（HTTP 局域网）打开时，浏览器会静默拒绝定位且不弹权限窗。请改用 HTTPS 打开同一地址（开发服务器已启用 https://），并在系统中信任自签名证书后再试。`;
};

/**
 * 冷启动优先「唤起权限 / 网络粗定位」，不要一上来高精度 GPS（手机端常直接 UNAVAILABLE 且不弹窗）。
 * 已授权后再提高精度。
 */
const isDesktopPositionEnvironment = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(pointer: fine)').matches &&
  (navigator.maxTouchPoints ?? 0) === 0;

/**
 * 定位模型（替代「无手势预热」）：
 * 1. 进地图：只读 Permissions；已 granted 才 watch
 * 2. 用户 click（启用横幅 / 定位 / 新建）：同步 getCurrentPosition 唤起系统权限
 * 3. 成功后 watch；之后定位/新建优先用 currentLocation
 */
export const useGeolocation = (isMapMode: boolean) => {
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<LocationPermissionStatus>('unknown');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [locationAvailability, setLocationAvailability] = useState<LocationAvailability>('idle');
  const [locationFailure, setLocationFailure] = useState<LocationFailure | null>(null);

  const filteredHeadingRef = useRef<number | null>(null);
  const orientationAttachedRef = useRef(false);
  const orientationCleanupRef = useRef<(() => void) | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const locationRequestSeqRef = useRef(0);
  const currentLocationRef = useRef<LocationData | null>(null);

  const hasLocationPermission = permissionStatus === 'granted';
  const needsLocationEnable =
    permissionStatus !== 'granted' && permissionStatus !== 'denied';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setPermission = useCallback((status: LocationPermissionStatus) => {
    if (mountedRef.current) setPermissionStatus(status);
  }, []);

  /** 只读 Permissions API；不调用 getCurrentPosition。 */
  const readPermissionStatus = useCallback(async (): Promise<LocationPermissionStatus> => {
    if (!('permissions' in navigator)) return 'unknown';
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      if (result.state === 'granted' || result.state === 'denied' || result.state === 'prompt') {
        return result.state;
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }, []);

  const describeLocationFailure = useCallback((error: GeolocationPositionError): LocationFailure => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return {
          stage: 'permission',
          code: 'denied',
          message: isIOS
            ? '权限环节失败：位置权限未获允许。请在「设置 → Safari → 位置」或地址栏中允许后重试。'
            : '权限环节失败：位置权限未获允许。请在浏览器站点设置中允许位置访问后重试。'
        };
      case error.POSITION_UNAVAILABLE:
        return {
          stage: 'service',
          code: 'unavailable',
          message: '定位服务环节失败：站点位置权限已经允许，因此浏览器不会再次弹出权限框；但系统定位服务没有返回坐标。请先在电脑系统设置中开启定位服务，并检查 Wi-Fi 或网络连接后重新获取。'
        };
      case error.TIMEOUT:
        return {
          stage: 'position',
          code: 'timeout',
          message: isDesktopPositionEnvironment()
            ? '坐标获取环节超时：站点位置权限已经允许，因此浏览器不会再次弹出权限框；但系统没有及时返回坐标。请检查系统定位、Wi-Fi 或网络后重新获取。'
            : '坐标获取环节超时：权限请求已完成，但设备没有及时返回坐标。请到信号较好的地方重试。'
        };
      default:
        return {
          stage: 'position',
          code: 'unknown',
          message: '坐标获取环节失败：暂时无法获取当前位置，请重试。'
        };
    }
  }, []);

  const applyHeadingSample = useCallback((raw: number) => {
    const prev = filteredHeadingRef.current;
    if (prev == null) {
      filteredHeadingRef.current = raw;
      setDeviceHeading(Math.round(raw));
      return;
    }
    let delta = raw - prev;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    if (Math.abs(delta) < HEADING_DEAD_ZONE_DEG) return;
    const next = normalizeHeading(prev + delta * HEADING_LOW_PASS);
    filteredHeadingRef.current = next;
    setDeviceHeading(Math.round(next));
  }, []);

  const detachOrientationListeners = useCallback(() => {
    orientationCleanupRef.current?.();
    orientationCleanupRef.current = null;
    orientationAttachedRef.current = false;
  }, []);

  const attachOrientationListeners = useCallback(() => {
    const supportsOrientationEvents =
      'ondeviceorientation' in window || 'ondeviceorientationabsolute' in window;
    if (orientationAttachedRef.current || !supportsOrientationEvents) return;

    let gotAbsoluteSample = false;
    const handleAbsolute = (event: DeviceOrientationEvent) => {
      const heading = headingFromOrientationEvent(event);
      if (heading == null) return;
      gotAbsoluteSample = true;
      applyHeadingSample(heading);
    };
    const handleRelative = (event: DeviceOrientationEvent) => {
      const webkitHeading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      if (gotAbsoluteSample && typeof webkitHeading !== 'number') return;
      const heading = headingFromOrientationEvent(event);
      if (heading != null) applyHeadingSample(heading);
    };

    const supportsAbsolute =
      typeof window !== 'undefined' && 'ondeviceorientationabsolute' in window;

    if (supportsAbsolute) {
      window.addEventListener('deviceorientationabsolute', handleAbsolute as EventListener, true);
    }
    window.addEventListener('deviceorientation', handleRelative, true);
    orientationAttachedRef.current = true;
    orientationCleanupRef.current = () => {
      if (supportsAbsolute) {
        window.removeEventListener('deviceorientationabsolute', handleAbsolute as EventListener, true);
      }
      window.removeEventListener('deviceorientation', handleRelative, true);
    };
  }, [applyHeadingSample]);

  const requestOrientationPermission = useCallback(async (): Promise<boolean> => {
    const state = await requestDeviceOrientationPermission();
    if (state !== 'granted') return false;
    attachOrientationListeners();
    return true;
  }, [attachOrientationListeners]);

  const applyPositionUpdate = useCallback(
    (position: GeolocationPosition) => {
      const loc = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      currentLocationRef.current = loc;
      if (!mountedRef.current) return loc;
      setCurrentLocation(loc);
      setLocationAvailability('available');
      setLocationFailure(null);
      setLocationError(null);
      setPermission('granted');

      const gpsHeading = position.coords.heading;
      if (
        filteredHeadingRef.current == null &&
        typeof gpsHeading === 'number' &&
        !Number.isNaN(gpsHeading) &&
        gpsHeading >= 0
      ) {
        applyHeadingSample(gpsHeading);
      }
      return loc;
    },
    [applyHeadingSample, setPermission]
  );

  const stopWatching = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current != null) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        applyPositionUpdate(position);
      },
      (error) => {
        console.warn('Location watch error:', error);
        if (error.code === 1) {
          setPermission('denied');
          setLocationAvailability('unavailable');
          stopWatching();
        } else if (!currentLocationRef.current) {
          setLocationAvailability('unavailable');
        }
      },
      isDesktopPositionEnvironment()
        ? { enableHighAccuracy: false, maximumAge: 120000, timeout: 15000 }
        : { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
  }, [applyPositionUpdate, setPermission, stopWatching]);

  /**
   * 必须在用户 click 调用栈内同步调用（不要 pointerdown+preventDefault，Safari 不认）。
   * 这是「比预热更好」的方案：用手势门闸代替无手势探测。
   */
  const requestLocation = useCallback(
    (opts?: { requestOrientation?: boolean }): Promise<LocationData | null> => {
      const wantOrientation = opts?.requestOrientation !== false;

      if (!isSecureLocationContext()) {
        const failure: LocationFailure = {
          stage: 'environment',
          code: 'insecure',
          message: `运行环境环节失败：${insecureLocationHint()}`
        };
        if (mountedRef.current) {
          setLocationError(failure.message);
          setLocationFailure(failure);
          setIsRequestingLocation(false);
          setLocationAvailability('unavailable');
        }
        return Promise.resolve(null);
      }

      if (!navigator.geolocation) {
        const failure: LocationFailure = {
          stage: 'support',
          code: 'unsupported',
          message: '浏览器支持环节失败：此设备或浏览器不支持地理位置功能。'
        };
        if (mountedRef.current) {
          setLocationError(failure.message);
          setLocationFailure(failure);
          setLocationAvailability('unavailable');
        }
        return Promise.resolve(null);
      }

      if (mountedRef.current) {
        setLocationError(null);
        setLocationFailure(null);
        setIsRequestingLocation(true);
        setLocationAvailability('requesting');
      }

      // iOS requires the orientation prompt to start in the original click stack.
      // Waiting for geolocation success first loses the user gesture and silently fails.
      if (wantOrientation) void requestOrientationPermission();

      return new Promise<LocationData | null>((resolve) => {
        const done = (value: LocationData | null) => {
          if (mountedRef.current) setIsRequestingLocation(false);
          resolve(value);
        };

        const seq = ++locationRequestSeqRef.current;
        // 每次主动定位只调用一次原生请求；这次用户手势同时负责刷新权限与坐标。
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (seq !== locationRequestSeqRef.current) return;
            const loc = applyPositionUpdate(position);
            if (mountedRef.current) startWatching();
            done(loc ?? { lat: position.coords.latitude, lng: position.coords.longitude });
          },
          (error) => {
            if (seq !== locationRequestSeqRef.current) return;
            console.warn('Location request failed:', error);
            stopWatching();
            const failure = describeLocationFailure(error);
            if (mountedRef.current) {
              setLocationError(failure.message);
              setLocationFailure(failure);
              setLocationAvailability('unavailable');
              if (error.code === 1) setPermission('denied');
            }
            done(null);
          },
          isDesktopPositionEnvironment()
            ? { timeout: ACTIVE_POSITION_TIMEOUT_MS, enableHighAccuracy: false, maximumAge: 600000 }
            : { timeout: ACTIVE_POSITION_TIMEOUT_MS, enableHighAccuracy: false, maximumAge: 120000 }
        );
      });
    },
    [
      applyPositionUpdate,
      describeLocationFailure,
      requestOrientationPermission,
      setPermission,
      startWatching,
      stopWatching
    ]
  );

  // 进地图：只观察已有授权；已 granted 才 watch。绝不预热 getCurrentPosition。
  useEffect(() => {
    if (!isMapMode) {
      stopWatching();
      detachOrientationListeners();
      return;
    }

    let permissionListener: PermissionStatus | null = null;

    void readPermissionStatus().then((status) => {
      if (!mountedRef.current) return;
      setPermission(status);
      if (status === 'granted') startWatching();
    });

    void (async () => {
      if (!('permissions' in navigator)) return;
      try {
        permissionListener = await navigator.permissions.query({
          name: 'geolocation' as PermissionName
        });
        permissionListener.onchange = () => {
          const next = permissionListener?.state;
          if (next === 'granted' || next === 'denied' || next === 'prompt') {
            setPermission(next);
            if (next === 'granted') startWatching();
            if (next === 'denied') stopWatching();
          }
        };
      } catch {
        // ignore
      }
    })();

    const syncOrientation = (state = readDeviceOrientationPermission()) => {
      if (state === 'granted') attachOrientationListeners();
      else detachOrientationListeners();
    };
    syncOrientation();
    const unsubscribeOrientation = subscribeDeviceOrientationPermission(syncOrientation);

    return () => {
      if (permissionListener) permissionListener.onchange = null;
      unsubscribeOrientation();
      stopWatching();
      detachOrientationListeners();
    };
  }, [
    isMapMode,
    readPermissionStatus,
    setPermission,
    attachOrientationListeners,
    detachOrientationListeners,
    startWatching,
    stopWatching
  ]);

  return {
    currentLocation,
    deviceHeading,
    hasLocationPermission,
    permissionStatus,
    needsLocationEnable,
    isRequestingLocation,
    isSecureContext: isSecureLocationContext(),
    locationError,
    locationAvailability,
    locationFailure,
    setLocationError,
    requestLocation,
    requestOrientationPermission,
    startWatching,
    stopWatching
  };
};
