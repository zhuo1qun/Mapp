import 'leaflet';

declare module 'leaflet' {
  interface MapOptions {
    /** Unified smooth zoom (wheel + pinch). */
    smoothMapZoom?: boolean | string;
    /** @deprecated alias of smoothMapZoom */
    smoothWheelZoom?: boolean | string;
    smoothSensitivity?: number;
    touchZoomSensitivity?: number;
    smoothTouchZoom?: boolean;
    smoothZoomInertia?: boolean;
    smoothTouchZoomInertia?: boolean;
    smoothZoomCenter?: boolean;
  }

  interface Map {
    smoothMapZoom?: Handler;
    smoothWheelZoom?: Handler;
    /** True while MapSmoothZoom owns the gesture (zoomanim path). */
    _mappSmoothZooming?: boolean;
    _animatingZoom?: boolean;
    /** True briefly after smooth zoom commits — React layers should skip remount. */
    _mappZoomCommitGuard?: boolean;
  }
}
