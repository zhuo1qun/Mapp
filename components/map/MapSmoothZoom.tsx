import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import '../../utils/map/smoothMapZoom';

export type MapSmoothZoomProps = {
  /** Wheel / shared sensitivity (default 1.5). */
  sensitivity?: number;
  /** Pinch sensitivity; defaults to `sensitivity`. */
  touchSensitivity?: number;
  /** Coast with decaying velocity after fast wheel / pinch (default true). */
  inertia?: boolean;
  /** Continue coasting after a pinch ends. Disabled by default for stable touch zoom. */
  touchInertia?: boolean;
  /** Zoom about map center instead of pointer / pinch midpoint. */
  centerMode?: boolean;
};

/**
 * Desktop wheel uses the custom smooth handler. On touch-first devices, Leaflet's
 * native pinch handler owns the gesture so tiles and markers use its battle-tested
 * direct-manipulation path instead of a simulated touch loop.
 */
export function MapSmoothZoom({
  sensitivity = 1.5,
  touchSensitivity,
  inertia = true,
  touchInertia = false,
  centerMode = false
}: MapSmoothZoomProps) {
  const map = useMap();

  useEffect(() => {
    const useNativeTouchZoom =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(any-pointer: coarse)').matches;
    const pinch = touchSensitivity ?? sensitivity;
    map.options.smoothMapZoom = centerMode ? 'center' : true;
    map.options.smoothWheelZoom = centerMode ? 'center' : true;
    map.options.smoothSensitivity = sensitivity;
    map.options.touchZoomSensitivity = pinch;
    map.options.smoothTouchZoom = !useNativeTouchZoom;
    map.options.smoothZoomInertia = inertia;
    map.options.smoothTouchZoomInertia = touchInertia;
    map.options.smoothZoomCenter = centerMode;
    map.options.touchZoom = useNativeTouchZoom;

    map.scrollWheelZoom?.disable();
    map.touchZoom?.disable();
    map.smoothMapZoom?.enable();
    if (useNativeTouchZoom) map.touchZoom?.enable();

    return () => {
      map.smoothMapZoom?.disable();
      map.touchZoom?.disable();
    };
  }, [map, sensitivity, touchSensitivity, inertia, touchInertia, centerMode]);

  return null;
}
