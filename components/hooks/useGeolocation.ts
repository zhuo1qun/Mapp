import { useState, useEffect, useCallback, useRef } from 'react';

export interface LocationData {
  lat: number;
  lng: number;
}

type DeviceOrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
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

/** Derive compass heading (degrees clockwise from true/magnetic north, device top). */
const headingFromOrientationEvent = (event: DeviceOrientationEvent): number | null => {
  const webkitHeading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
    .webkitCompassHeading;
  if (typeof webkitHeading === 'number' && !Number.isNaN(webkitHeading)) {
    return normalizeHeading(webkitHeading);
  }

  if (event.alpha == null || Number.isNaN(event.alpha)) return null;

  // `alpha` is a counter-clockwise rotation around Z for both orientation
  // event types. A compass bearing increases clockwise, so absolute data must
  // be inverted too; treating deviceorientationabsolute as a direct heading
  // makes the on-map direction sector rotate the opposite way.
  let heading = 360 - event.alpha;
  heading = normalizeHeading(heading - getScreenOrientationAngle());
  return heading;
};

const HEADING_DEAD_ZONE_DEG = 2.5;
const HEADING_LOW_PASS = 0.28;

export const useGeolocation = (isMapMode: boolean) => {
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [hasLocationPermission, setHasLocationPermission] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const filteredHeadingRef = useRef<number | null>(null);
  const orientationAttachedRef = useRef(false);
  const orientationCleanupRef = useRef<(() => void) | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Check location permission
  const checkLocationPermission = useCallback(async (): Promise<string> => {
    // Special handling for WeChat and mobile browsers
    const isWeChat = /micromessenger/i.test(navigator.userAgent);
    const isAndroid = /android/i.test(navigator.userAgent);
    const isEdge = /edg/i.test(navigator.userAgent);
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);

    // For WeChat and problematic mobile browsers, be more aggressive
    if (isWeChat || (isAndroid && isEdge)) {
      // WeChat and some mobile browsers have issues with Permissions API
      // Try direct geolocation call with very short timeout
      try {
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('timeout'));
          }, 2000); // Very short timeout for quick check

          navigator.geolocation.getCurrentPosition(
            (position) => {
              clearTimeout(timeoutId);
              resolve(position);
            },
            (error) => {
              clearTimeout(timeoutId);
              reject(error);
            },
            {
              timeout: 2000,
              enableHighAccuracy: false,
              maximumAge: 30000 // Accept cached positions up to 30 seconds old
            }
          );
        });
        return 'granted';
      } catch (error: any) {
        if (error.code === 1) { // PERMISSION_DENIED
          return 'denied';
        }
        // For WeChat and Edge, treat timeout/network errors as potentially recoverable
        return 'prompt'; // Encourage user to try again
      }
    }

    // Check if Permissions API is available for modern browsers
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        return result.state; // 'granted', 'denied', or 'prompt'
      } catch (e) {
        // Permissions API might not support 'geolocation' name in some browsers
        console.log('Permissions API not fully supported, falling back to basic check');
      }
    }

    // Fallback for browsers without full Permissions API support
    if (isMobile) {
      // Try a quick geolocation call to test permission
      try {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            (error) => reject(error),
            { timeout: 5000, enableHighAccuracy: false, maximumAge: 30000 }
          );
        });
        return 'granted';
      } catch (error: any) {
        if (error.code === 1) { // PERMISSION_DENIED
          return 'denied';
        }
        // Other errors might be temporary, treat as unknown
        return 'unknown';
      }
    }

    return 'unknown';
  }, []);

  // Format location error for user display
  const formatLocationError = useCallback((error: any): string => {
    const isWeChat = /micromessenger/i.test(navigator.userAgent);
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);
    const isAndroid = /android/i.test(navigator.userAgent);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (!error) {
      return '无法获取您的当前位置。';
    }

    const errorCode = error.code;

    // Check error codes
    if (errorCode === 1) { // PERMISSION_DENIED
      if (isWeChat) {
        return '位置权限被拒绝。在微信中：\n1. 点击地址栏右侧的设置图标\n2. 选择"允许使用位置信息"\n3. 刷新页面后重试\n\n或者在微信设置中允许位置权限。';
      } else if (isMobile) {
        if (isAndroid) {
          return '位置权限被拒绝。请检查：\n1. 浏览器设置中的位置权限\n2. 系统设置 > 应用 > [浏览器] > 权限 > 位置\n3. 设备的位置服务开关\n4. 刷新页面后重新授权';
        } else if (isIOS) {
          return '位置权限被拒绝。请检查：\n1. Safari设置中的位置权限\n2. 系统设置 > 隐私与安全性 > 定位服务\n3. 允许该网站访问位置信息\n4. 刷新页面后重试';
        }
        return '位置权限被拒绝。请在浏览器设置中允许位置访问，并确保设备位置服务已开启。';
      }
      return '位置权限被拒绝。请在浏览器设置中允许位置访问权限。';
    } else if (errorCode === 2) { // POSITION_UNAVAILABLE
      if (isWeChat) {
        return '位置信息不可用。微信中可能的原因：\n• 微信未获得位置权限\n• 网络环境不佳\n• GPS信号弱\n\n建议：退出微信重新进入，或使用手机自带浏览器试试。';
      } else if (isMobile) {
        return '位置信息不可用。可能的原因：\n• 设备位置服务未开启\n• GPS信号弱或无信号\n• 室内环境或网络问题\n• 浏览器不支持精确定位\n\n请检查设备设置并尝试在室外使用。';
      }
      return '位置信息不可用。可能的原因：\n• 设备位置服务未开启\n• GPS信号弱\n• 室内环境限制\n• 网络连接问题';
    } else if (errorCode === 3) { // TIMEOUT
      if (isWeChat) {
        return '位置请求超时。微信中可能的原因：\n• 网络连接慢\n• GPS信号弱\n• 微信定位功能受限\n\n建议：检查网络连接，或使用其他浏览器试试。';
      } else if (isMobile) {
        return '位置请求超时。可能的原因：\n• GPS信号弱\n• 网络连接问题\n• 定位服务响应慢\n\n请在有良好网络和GPS信号的地方重试。';
      }
      return '位置请求超时。请检查网络连接和GPS信号后重试。';
    }

    // Check error message for additional clues
    const errorMessage = error.message || '';
    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      return '位置请求超时。请确保设备位置服务已开启并在有良好GPS信号的地方重试。';
    }
    if (errorMessage.includes('denied') || errorMessage.includes('permission')) {
      if (isWeChat) {
        return '位置权限问题。在微信中：\n1. 点击地址栏右侧设置图标\n2. 允许位置信息访问\n3. 如不行，请在微信设置中开启位置权限\n4. 刷新页面重试';
      }
      return '位置权限问题。请检查浏览器和系统的位置权限设置。';
    }
    if (errorMessage.includes('unavailable') || errorMessage.includes('not available')) {
      return '位置服务当前不可用。请检查：\n• 设备位置服务是否开启\n• GPS/Wi-Fi定位是否启用\n• 是否在有定位信号覆盖的区域';
    }

    // Default error message with browser-specific guidance
    let defaultMsg = `无法获取当前位置。错误：${errorMessage || '未知错误'}\n\n请检查：\n• 浏览器位置权限\n• 设备位置服务设置\n• GPS信号强度\n• 网络连接状态`;

    if (isWeChat) {
      defaultMsg += '\n\n微信用户额外检查：\n• 微信版本是否为最新\n• 是否在微信设置中允许了位置权限\n• 尝试使用手机自带浏览器';
    } else if (isMobile) {
      defaultMsg += '\n\n移动设备用户检查：\n• 系统位置服务是否开启\n• 应用的定位权限\n• GPS和网络定位是否启用';
    }

    return defaultMsg;
  }, []);

  const applyHeadingSample = useCallback((raw: number) => {
    const prev = filteredHeadingRef.current;
    if (prev == null) {
      filteredHeadingRef.current = raw;
      setDeviceHeading(Math.round(raw));
      return;
    }
    // Shortest-path delta on circle
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
    if (orientationAttachedRef.current || !('DeviceOrientationEvent' in window)) return;

    let gotAbsoluteSample = false;
    const handleAbsolute = (event: DeviceOrientationEvent) => {
      const heading = headingFromOrientationEvent(event);
      if (heading == null) return;
      gotAbsoluteSample = true;
      applyHeadingSample(heading);
    };
    const handleRelative = (event: DeviceOrientationEvent) => {
      // Prefer absolute stream when it is producing samples (Android).
      // Always accept webkitCompassHeading (iOS) even if absolute also exists.
      const webkitHeading = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      if (gotAbsoluteSample && typeof webkitHeading !== 'number') return;
      const heading = headingFromOrientationEvent(event);
      if (heading != null) applyHeadingSample(heading);
    };

    // Prefer absolute when available (Android Chrome); iOS uses webkitCompassHeading on relative event.
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

  /** Must be called from a user gesture on iOS (Safari 13+). */
  const requestOrientationPermission = useCallback(async (): Promise<boolean> => {
    const DOE = DeviceOrientationEvent as DeviceOrientationConstructor;
    if (typeof DOE.requestPermission === 'function') {
      try {
        const state = await DOE.requestPermission();
        if (state !== 'granted') return false;
      } catch (err) {
        console.warn('Device orientation permission request failed:', err);
        return false;
      }
    }
    attachOrientationListeners();
    return true;
  }, [attachOrientationListeners]);

  const applyPositionUpdate = useCallback((position: GeolocationPosition) => {
    const loc = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    if (!mountedRef.current) return loc;
    setCurrentLocation(loc);
    setLocationError(null);
    setHasLocationPermission(true);

    // Weak GPS heading fallback when orientation has not produced a sample yet
    const gpsHeading = position.coords.heading;
    if (
      filteredHeadingRef.current == null &&
      typeof gpsHeading === 'number' &&
      !Number.isNaN(gpsHeading) &&
      gpsHeading >= 0
    ) {
      applyHeadingSample(gpsHeading);
    }
  }, [applyHeadingSample]);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  /** Continuous GPS updates for the live location marker. */
  const startWatching = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current != null) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        applyPositionUpdate(position);
      },
      (error) => {
        console.warn('Location watch error:', error);
        // Permission denied: stop watching; keep last known position for other transient errors
        if (error.code === 1) {
          setHasLocationPermission(false);
          stopWatching();
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 15000
      }
    );
  }, [applyPositionUpdate, stopWatching]);

  const locationRequestSeqRef = useRef(0);

  // Enhanced geolocation function with retry logic and accuracy fallback
  const getCurrentPositionWithRetry = useCallback((
    onSuccess: (position: GeolocationPosition) => void,
    onError: (error: GeolocationPositionError) => void,
    maxRetries: number = 3,
    currentRetry: number = 0,
    requestSeq?: number
  ): void => {
    const seq = requestSeq ?? ++locationRequestSeqRef.current;
    // Progressive timeout and accuracy settings
    const settings = [
      // 与实时 watchPosition 对齐：先接受数秒内的定位修复，避免每次点击都重新等待 GPS 冷启动。
      { timeout: 6000, enableHighAccuracy: true, maximumAge: 5000 },
      { timeout: 10000, enableHighAccuracy: false, maximumAge: 15000 },
      { timeout: 15000, enableHighAccuracy: false, maximumAge: 30000 }
    ];

    const currentSettings = settings[Math.min(currentRetry, settings.length - 1)];

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (seq !== locationRequestSeqRef.current) return;
        onSuccess(position);
      },
      (error) => {
        if (seq !== locationRequestSeqRef.current) return;
        if (currentRetry < maxRetries) {
          const accuracy = currentSettings.enableHighAccuracy ? '高精度' : '普通精度';
          console.log(`位置获取尝试 ${currentRetry + 1} 失败 (${accuracy})，正在重试...`, error);
          setTimeout(() => {
            if (seq !== locationRequestSeqRef.current) return;
            getCurrentPositionWithRetry(onSuccess, onError, maxRetries, currentRetry + 1, seq);
          }, 1500); // Wait 1.5 seconds before retry
        } else {
          onError(error);
        }
      },
      currentSettings
    );
  }, []);

  // Get current browser location (used for live fallback)
  const getCurrentBrowserLocation = useCallback(async (): Promise<LocationData> => {
    return new Promise((resolve, reject) => {
      getCurrentPositionWithRetry(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          reject(new Error(formatLocationError(error)));
        }
      );
    });
  }, [getCurrentPositionWithRetry, formatLocationError]);

  /**
   * Manual / auto location request.
   * Resolves with coords on success, null on failure (avoids stale-closure flyTo).
   * Also requests orientation permission when invoked from a user gesture path.
   */
  const requestLocation = useCallback(async (opts?: { requestOrientation?: boolean }): Promise<LocationData | null> => {
    try {
      if (mountedRef.current) setLocationError(null);

      if (opts?.requestOrientation !== false) {
        void requestOrientationPermission();
      }

      // Check if geolocation is available
      if (!navigator.geolocation) {
        if (mountedRef.current) setLocationError('此设备或浏览器不支持地理位置功能。请尝试使用现代浏览器。');
        return null;
      }

      const isWeChat = /micromessenger/i.test(navigator.userAgent);
      const isAndroid = /android/i.test(navigator.userAgent);
      const isEdge = /edg/i.test(navigator.userAgent);

      // Check permission first
      const permission = await checkLocationPermission();
      if (mountedRef.current) setHasLocationPermission(permission === 'granted');

      if (permission === 'denied') {
        const deniedMessage = isWeChat
          ? '位置权限被拒绝。'
          : isAndroid && isEdge
          ? '位置权限被拒绝。'
          : '位置权限被拒绝。';
        if (mountedRef.current) setLocationError(deniedMessage);
        return null;
      }

      // Special handling for WeChat and problematic mobile browsers
      if ((isWeChat || (isAndroid && isEdge)) && permission === 'unknown') {
        const specialMessage = isWeChat
          ? '微信浏览器需要额外的位置权限设置。请尝试：\n1. 点击地址栏右侧的设置图标\n2. 选择"允许使用位置信息"\n3. 刷新页面后重试\n\n如果仍然失败，请在微信设置中开启位置权限。'
          : 'Edge浏览器可能需要额外的位置权限设置。请尝试：\n1. 点击地址栏左侧的锁图标\n2. 选择"网站权限" > "位置" > "允许"\n3. 刷新页面后重试';
        if (mountedRef.current) setLocationError(specialMessage);
        return null;
      }

      return await new Promise<LocationData | null>((resolve) => {
        getCurrentPositionWithRetry(
          (position) => {
            applyPositionUpdate(position);
            if (mountedRef.current) startWatching();
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude
            });
          },
          (error) => {
            console.warn('Location request failed:', error);
            if (mountedRef.current) {
              setLocationError(formatLocationError(error));
              setHasLocationPermission(false);
            }
            resolve(null);
          }
        );
      });
    } catch (error) {
      console.warn('Location request error:', error);
      if (mountedRef.current) setLocationError('获取位置信息时发生错误。请检查网络连接和位置权限设置。');
      return null;
    }
  }, [
    getCurrentPositionWithRetry,
    checkLocationPermission,
    formatLocationError,
    requestOrientationPermission,
    applyPositionUpdate,
    startWatching
  ]);

  // Initialize permission check; attach orientation when no iOS gate (non-gesture OK)
  useEffect(() => {
    if (!isMapMode) {
      stopWatching();
      detachOrientationListeners();
      return;
    }

    const isWeChat = /micromessenger/i.test(navigator.userAgent);
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);

    checkLocationPermission().then(permission => {
      setHasLocationPermission(permission === 'granted');

      if (permission === 'granted') {
        // Already authorized: start continuous tracking without waiting for a button tap
        startWatching();
      }

      if ((isWeChat || isMobile) && permission === 'unknown') {
        console.log('Mobile browser detected, location permission status unclear');
      }
    }).catch((error) => {
      console.warn('Permission check failed:', error);
      setHasLocationPermission(false);

      if (isWeChat || isMobile) {
        console.log('Mobile browser permission check failed, will retry on user request');
      }
    });

    const DOE = DeviceOrientationEvent as DeviceOrientationConstructor;
    // iOS requires gesture + requestPermission; skip auto-attach there.
    if (typeof DOE.requestPermission !== 'function') {
      attachOrientationListeners();
    }

    return () => {
      stopWatching();
      detachOrientationListeners();
    };
  }, [
    isMapMode,
    checkLocationPermission,
    attachOrientationListeners,
    detachOrientationListeners,
    startWatching,
    stopWatching
  ]);

  return {
    currentLocation,
    deviceHeading,
    hasLocationPermission,
    locationError,
    setLocationError,
    requestLocation,
    requestOrientationPermission,
    getCurrentBrowserLocation,
    checkLocationPermission,
    startWatching,
    stopWatching
  };
};
