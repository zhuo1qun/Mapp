export type DeviceOrientationPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

const STORAGE_KEY = 'mapp-device-orientation-permission-v1';
const CHANGE_EVENT = 'mapp:device-orientation-permission-change';

type PermissionCapableEvent = {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

function orientationConstructor() {
  return window.DeviceOrientationEvent as typeof DeviceOrientationEvent & PermissionCapableEvent;
}

function motionConstructor() {
  return window.DeviceMotionEvent as typeof DeviceMotionEvent & PermissionCapableEvent;
}

export function readDeviceOrientationPermission(): DeviceOrientationPermissionState {
  if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
    return 'unsupported';
  }
  const orientation = orientationConstructor();
  // Chromium/Android does not expose a prompt API; events are available once listeners attach.
  if (typeof orientation.requestPermission !== 'function') return 'granted';
  let saved: string | null = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* private storage may be unavailable */ }
  return saved === 'granted' || saved === 'denied' ? saved : 'prompt';
}

function publish(state: DeviceOrientationPermissionState) {
  try {
    if (state === 'granted' || state === 'denied') localStorage.setItem(STORAGE_KEY, state);
  } catch { /* event still keeps the current page in sync */ }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: state }));
}

/** Must be called directly from a user click on iOS. */
export async function requestDeviceOrientationPermission(): Promise<DeviceOrientationPermissionState> {
  if (typeof window.DeviceOrientationEvent === 'undefined') return 'unsupported';
  const orientation = orientationConstructor();
  const motion = typeof window.DeviceMotionEvent === 'undefined' ? null : motionConstructor();
  try {
    // Start both requests before awaiting: Safari requires the original user gesture for each.
    const requests: Array<Promise<'granted' | 'denied' | 'default'>> = [];
    if (typeof orientation.requestPermission === 'function') requests.push(orientation.requestPermission());
    if (motion && typeof motion.requestPermission === 'function') requests.push(motion.requestPermission());
    const results = await Promise.all(requests);
    const state: DeviceOrientationPermissionState = results.every((result) => result === 'granted')
      ? 'granted'
      : 'denied';
    publish(state);
    return state;
  } catch {
    publish('denied');
    return 'denied';
  }
}

export function subscribeDeviceOrientationPermission(
  listener: (state: DeviceOrientationPermissionState) => void
) {
  const handleChange = (event: Event) => {
    const state = (event as CustomEvent<DeviceOrientationPermissionState>).detail;
    listener(state || readDeviceOrientationPermission());
  };
  window.addEventListener(CHANGE_EVENT, handleChange);
  return () => window.removeEventListener(CHANGE_EVENT, handleChange);
}

