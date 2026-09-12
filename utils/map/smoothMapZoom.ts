/**
 * Unified smooth map zoom (wheel + pinch): one goalZoom, lerp, inertia.
 *
 * Visual path matches Leaflet zoom animation: fire `zoomanim` each frame so
 * tiles/markers share CSS transforms, and only commit a real view reset when
 * settled — avoids per-frame marker reproject jitter vs Apple Maps–style lock.
 */
// @ts-nocheck — Leaflet private APIs (_move, _animatingZoom, …)
import L from 'leaflet';

const LERP = 0.3;
const SETTLE_EPS = 0.012;
const VELOCITY_EPS = 0.00004; // zoom levels / ms
const INERTIA_FRICTION = 0.94;
const IMPULSE_EMA = 0.45;
const MAX_IMPULSE_DT_MS = 80;
const MAX_COAST_VELOCITY = 0.02;
const SMOOTH_ZOOM_CONTAINER_CLASS = 'mapp-smooth-zooming';

L.Map.mergeOptions({
  smoothMapZoom: false,
  /** @deprecated alias — prefer smoothMapZoom */
  smoothWheelZoom: false,
  smoothSensitivity: 1.5,
  // Desktop trackpad pinch is exposed as a Ctrl+wheel stream. Its deltas are
  // much smaller than a physical mouse wheel's, so it needs its own gain.
  smoothTrackpadPinchSensitivity: 3.25,
  touchZoomSensitivity: undefined,
  // Touch devices use Leaflet's native handler by default. The custom handler
  // stays available for environments that need it (for example, touch laptops).
  smoothTouchZoom: true,
  smoothZoomInertia: true,
  // Touch input already has a natural physical stopping point. Coasting after
  // touchend makes a small pinch cross into the next tile zoom unexpectedly.
  smoothTouchZoomInertia: false,
  smoothZoomCenter: false
});

/** Subpixel marker positions (Leaflet rounds by default → visible jitter, especially on pinch zoom). */
const markerProto = L.Marker.prototype;
if (!markerProto._mappSmoothZoomPatched) {
  markerProto._mappSmoothZoomPatched = true;
  markerProto._animateZoom = function (opt) {
    if (!this._map) return;
    var pos = this._map._latLngToNewLayerPoint(this._latlng, opt.zoom, opt.center);
    this._setPos(pos);
  };
  const _updateOrig = markerProto.update;
  markerProto.update = function () {
    if (this._icon && this._map) {
      var pos = this._map.latLngToLayerPoint(this._latlng);
      this._setPos(pos);
      return this;
    }
    return _updateOrig.call(this);
  };
}

/**
 * Smooth zoom only CSS-transforms tiles until commit. If GridLayer._update runs
 * against the interpolating zoom, it will request an intermediate z with x/y from
 * that grid — the classic “fast zoom-in loads the wrong tiles” failure.
 */
const gridProto = L.GridLayer.prototype;
if (!gridProto._mappSmoothZoomPatched) {
  gridProto._mappSmoothZoomPatched = true;
  const _updateOrig = gridProto._update;
  gridProto._update = function (center) {
    if (this._map && this._map._mappSmoothZooming) return this;
    return _updateOrig.call(this, center);
  };
  const _resetViewOrig = gridProto._resetView;
  gridProto._resetView = function (e) {
    if (this._map && this._map._mappSmoothZooming && !(e && (e.pinch || e.flyTo))) {
      return;
    }
    return _resetViewOrig.call(this, e);
  };
}

const tileProto = L.TileLayer.prototype;
if (!tileProto._mappSmoothZoomPatched) {
  tileProto._mappSmoothZoomPatched = true;
  tileProto.getTileUrl = function (coords) {
    // Use this tile's own z. Leaflet's default fills `{z}` from `_tileZoom`,
    // so a parent tile kept across a fast zoom-in would request destination-z
    // with origin-z x/y — geographically wrong squares.
    var zoom = coords.z;
    if (this.options.zoomReverse) {
      zoom = this.options.maxZoom - zoom;
    }
    zoom += this.options.zoomOffset || 0;

    var data = {
      r: L.Browser.retina ? '@2x' : '',
      s: this._getSubdomain(coords),
      x: coords.x,
      y: coords.y,
      z: zoom
    };
    if (this._map && !this._map.options.crs.infinite && this._globalTileRange) {
      var invertedY = this._globalTileRange.max.y - coords.y;
      if (this.options.tms) {
        data.y = invertedY;
      }
      data['-y'] = invertedY;
    }

    return L.Util.template(this._url, L.extend(data, this.options));
  };

  /**
   * Leaflet normally cancels every in-flight tile from the previous zoom as
   * soon as the tile grid changes. Retain only requests whose parent/child
   * footprint intersects the new viewport: they can become a useful low-res
   * fallback while the final target tiles arrive. Everything else is aborted
   * immediately, so an old viewport cannot consume the request queue.
   */
  tileProto._abortLoading = function () {
    var map = this._map;
    var targetZoom = this._tileZoom;
    if (!map || targetZoom === undefined) return;

    var pixelBounds = this._getTiledPixelBounds(map.getCenter());
    var targetRange = this._pxBoundsToTileRange(pixelBounds);
    var overlapsTargetViewport = function (coords) {
      if (coords.z === targetZoom) return true;

      if (coords.z < targetZoom) {
        var parentScale = Math.pow(2, targetZoom - coords.z);
        return !(
          (coords.x + 1) * parentScale - 1 < targetRange.min.x ||
          coords.x * parentScale > targetRange.max.x ||
          (coords.y + 1) * parentScale - 1 < targetRange.min.y ||
          coords.y * parentScale > targetRange.max.y
        );
      }

      var childScale = Math.pow(2, coords.z - targetZoom);
      var targetX = Math.floor(coords.x / childScale);
      var targetY = Math.floor(coords.y / childScale);
      return (
        targetX >= targetRange.min.x &&
        targetX <= targetRange.max.x &&
        targetY >= targetRange.min.y &&
        targetY <= targetRange.max.y
      );
    };

    for (var key in this._tiles) {
      var record = this._tiles[key];
      if (record.coords.z === targetZoom || overlapsTargetViewport(record.coords)) continue;

      var tile = record.el;
      tile.onload = L.Util.falseFn;
      tile.onerror = L.Util.falseFn;
      if (tile.complete) continue;

      tile.src = L.Util.emptyImageUrl;
      var coords = record.coords;
      L.DomUtil.remove(tile);
      delete this._tiles[key];
      this.fire('tileabort', { tile: tile, coords: coords });
    }
  };
}

function wheelSens(map) {
  var s = map.options.smoothSensitivity;
  return typeof s === 'number' && s > 0 ? s : 1;
}

function trackpadPinchSens(map) {
  var s = map.options.smoothTrackpadPinchSensitivity;
  return typeof s === 'number' && s > 0 ? s : wheelSens(map);
}

function pinchSens(map) {
  var t = map.options.touchZoomSensitivity;
  if (typeof t === 'number' && t > 0) return t;
  return wheelSens(map);
}

function useCenterAnchor(map) {
  return (
    map.options.smoothZoomCenter === true ||
    map.options.smoothWheelZoom === 'center' ||
    map.options.smoothMapZoom === 'center'
  );
}

L.Map.SmoothMapZoom = L.Handler.extend({
  addHooks: function () {
    if (this._map.scrollWheelZoom) this._map.scrollWheelZoom.disable();
    if (this._map.touchZoom) this._map.touchZoom.disable();

    L.DomEvent.on(this._map._container, 'wheel', this._onWheel, this);
    if (this._map.options.smoothTouchZoom !== false) {
      L.DomEvent.on(this._map._container, 'touchstart', this._onTouchStart, this);
    }
  },

  removeHooks: function () {
    L.DomEvent.off(this._map._container, 'wheel', this._onWheel, this);
    L.DomEvent.off(this._map._container, 'touchstart', this._onTouchStart, this);
    this._unbindDocTouch();
    this._abort(false);
  },

  // —— lifecycle ——

  _begin: function () {
    if (this._active) return;
    var map = this._map;
    this._active = true;
    this._coasting = false;
    this._velocity = 0;
    this._lastImpulseAt = 0;
    this._lastFrameAt = performance.now();
    this._centerPoint = map.getSize()._divideBy(2);
    this._startLatLng = map.containerPointToLatLng(this._centerPoint);
    this._visualZoom = map.getZoom();
    this._goalZoom = this._visualZoom;
    this._center = map.getCenter();

    map._stop();
    if (map._panAnim) map._panAnim.stop();

    // Enter Leaflet zoom-anim mode: layers follow `zoomanim`, not discrete zoom events.
    map._mappSmoothZooming = true;
    map._animatingZoom = true;
    map._animateToCenter = this._center;
    map._animateToZoom = this._visualZoom;
    if (map._mapPane) {
      L.DomUtil.addClass(map._mapPane, 'leaflet-zoom-anim');
    }
    L.DomUtil.addClass(map.getContainer(), SMOOTH_ZOOM_CONTAINER_CLASS);
    map._moveStart(true, false);

    this._raf = requestAnimationFrame(this._tick.bind(this));
  },

  _abort: function (commit) {
    clearTimeout(this._wheelIdleTimer);
    this._wheelIdleTimer = null;
    if (this._raf != null) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    this._unbindDocTouch();
    this._pinching = false;
    this._wheeling = false;
    this._trackpadPinching = false;
    this._coasting = false;
    this._velocity = 0;

    if (!this._active) return;
    this._active = false;

    if (commit) {
      this._commitView();
    } else {
      this._clearAnimFlags();
    }
  },

  _clearAnimFlags: function () {
    var map = this._map;
    map._mappSmoothZooming = false;
    if (map._mapPane) {
      L.DomUtil.removeClass(map._mapPane, 'leaflet-zoom-anim');
    }
    L.DomUtil.removeClass(map.getContainer(), SMOOTH_ZOOM_CONTAINER_CLASS);
    map._animatingZoom = false;
  },

  /** One real settle: tiles/markers reproject once (Apple-style end of gesture). */
  _commitView: function () {
    var map = this._map;
    var center = this._center;
    var zoom = map._limitZoom(this._goalZoom);

    // 让 React 图层在 commit 后短时跳过 remount，避免与 Leaflet 重投影抢同一帧
    map._mappZoomCommitGuard = true;
    this._clearAnimFlags();

    // Match Leaflet `_onZoomTransitionEnd`: do not fire `viewreset` here.
    // `viewreset` re-enters GridLayer._setView and aborts the destination
    // tiles that `zoom` just started loading — worst when jumping many levels.
    L.DomUtil.setPosition(map._mapPane, new L.Point(0, 0));
    map._move(center, zoom, undefined, true);
    map.fire('zoom');
    map.fire('move');
    map._moveEnd(true);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        map._mappZoomCommitGuard = false;
        map.fire('mappzoomcommitdone');
      });
    });
  },

  _limitGoal: function () {
    var map = this._map;
    if (this._goalZoom < map.getMinZoom() || this._goalZoom > map.getMaxZoom()) {
      this._goalZoom = map._limitZoom(this._goalZoom);
      this._velocity = 0;
    }
  },

  _setAnchor: function (containerPoint) {
    var map = this._map;
    this._anchorPoint = containerPoint;
    // Anchor in frozen pre-gesture space: use current visual zoom's unproject
    this._anchorLatLng = map.containerPointToLatLng(containerPoint);
  },

  _applyImpulse: function (dZoom, now) {
    if (!dZoom) return;
    this._coasting = false;
    this._goalZoom += dZoom;
    this._limitGoal();

    if (this._lastImpulseAt > 0) {
      var dt = now - this._lastImpulseAt;
      if (dt > 0 && dt < MAX_IMPULSE_DT_MS) {
        var instant = dZoom / dt;
        this._velocity =
          this._velocity * (1 - IMPULSE_EMA) + instant * IMPULSE_EMA;
        if (this._velocity > MAX_COAST_VELOCITY) this._velocity = MAX_COAST_VELOCITY;
        if (this._velocity < -MAX_COAST_VELOCITY) this._velocity = -MAX_COAST_VELOCITY;
      }
    }
    this._lastImpulseAt = now;
  },

  _beginCoast: function (fromTouch) {
    if (
      !this._map.options.smoothZoomInertia ||
      (fromTouch && this._map.options.smoothTouchZoomInertia !== true)
    ) {
      this._velocity = 0;
    } else if (Math.abs(this._velocity) < VELOCITY_EPS) {
      this._velocity = 0;
    }
    this._coasting = true;
    this._wheeling = false;
  },

  _computeCenterForZoom: function (zoom) {
    var map = this._map;
    if (useCenterAnchor(map)) {
      return this._startLatLng;
    }
    var anchorPoint = this._anchorPoint || this._centerPoint;
    var delta = anchorPoint.subtract(this._centerPoint);
    return map.unproject(
      map.project(this._anchorLatLng, zoom).subtract(delta),
      zoom
    );
  },

  // —— wheel ——

  _onWheel: function (e) {
    if (this._pinching) {
      L.DomEvent.preventDefault(e);
      L.DomEvent.stopPropagation(e);
      return;
    }

    var now = performance.now();
    if (!this._active) this._begin();
    this._wheeling = true;
    this._coasting = false;

    // Chromium and Safari report a desktop trackpad pinch as a Ctrl+wheel
    // stream. Freeze its anchor for the gesture: tiny pointer-coordinate
    // variations otherwise turn a pure scale gesture into visible map jitter.
    var isTrackpadPinch = e.ctrlKey === true && e.deltaMode === 0;
    if (isTrackpadPinch && !this._trackpadPinching) {
      this._trackpadPinching = true;
      this._setAnchor(this._map.mouseEventToContainerPoint(e));
    } else if (!isTrackpadPinch) {
      this._trackpadPinching = false;
      this._setAnchor(this._map.mouseEventToContainerPoint(e));
    }

    var dZoom =
      L.DomEvent.getWheelDelta(e) *
      0.003 *
      (isTrackpadPinch ? trackpadPinchSens(this._map) : wheelSens(this._map));
    this._applyImpulse(dZoom, now);

    clearTimeout(this._wheelIdleTimer);
    this._wheelIdleTimer = setTimeout(this._onWheelIdle.bind(this), 48);

    L.DomEvent.preventDefault(e);
    L.DomEvent.stopPropagation(e);
  },

  _onWheelIdle: function () {
    this._wheeling = false;
    // Trackpad pinch is direct manipulation; a wheel-style inertial tail both
    // overshoots and makes the anchor correction look like a wobble.
    if (this._trackpadPinching) {
      this._velocity = 0;
      this._coasting = true;
      return;
    }
    this._beginCoast(false);
  },

  // —— pinch ——

  _onTouchStart: function (e) {
    var map = this._map;
    if (!e.touches || e.touches.length !== 2 || (map._animatingZoom && !map._mappSmoothZooming)) {
      return;
    }

    var p1 = map.mouseEventToContainerPoint(e.touches[0]);
    var p2 = map.mouseEventToContainerPoint(e.touches[1]);
    var dist = p1.distanceTo(p2);
    if (!(dist > 0)) return;

    this._pinching = true;
    this._wheeling = false;
    this._coasting = false;
    this._velocity = 0;
    this._lastImpulseAt = 0;
    this._pinchLastDist = dist;

    if (!this._active) this._begin();
    this._setAnchor(p1.add(p2)._divideBy(2));

    this._unbindDocTouch();
    L.DomEvent.on(document, 'touchmove', this._onTouchMove, this);
    L.DomEvent.on(document, 'touchend touchcancel', this._onTouchEnd, this);
    L.DomEvent.preventDefault(e);
  },

  _onTouchMove: function (e) {
    if (!this._pinching || !e.touches || e.touches.length !== 2) return;

    var map = this._map;
    var p1 = map.mouseEventToContainerPoint(e.touches[0]);
    var p2 = map.mouseEventToContainerPoint(e.touches[1]);
    var dist = p1.distanceTo(p2);
    var now = performance.now();

    if (this._pinchLastDist > 0 && dist > 0) {
      var scale = dist / this._pinchLastDist;
      var dZoom = (Math.log(scale) / Math.LN2) * pinchSens(map);
      this._applyImpulse(dZoom, now);
    }

    this._pinchLastDist = dist;
    // 固定 pinch 起点中点为缩放锚：每帧跟手指中点会因触点噪声导致地图/点位微抖
    L.DomEvent.preventDefault(e);
  },

  _onTouchEnd: function (e) {
    if (e.touches && e.touches.length >= 2) return;
    this._pinching = false;
    this._unbindDocTouch();
    this._beginCoast(true);
  },

  _unbindDocTouch: function () {
    L.DomEvent.off(document, 'touchmove', this._onTouchMove, this);
    L.DomEvent.off(document, 'touchend touchcancel', this._onTouchEnd, this);
  },

  // —— frame: zoomanim only (no zoom/move spam) ——

  _tick: function () {
    var map = this._map;
    if (!this._active) return;

    var now = performance.now();
    var dt = Math.min(48, Math.max(0, now - this._lastFrameAt));
    this._lastFrameAt = now;

    if (
      this._coasting &&
      !this._pinching &&
      !this._wheeling &&
      map.options.smoothZoomInertia !== false
    ) {
      if (Math.abs(this._velocity) >= VELOCITY_EPS) {
        this._goalZoom += this._velocity * dt;
        this._limitGoal();
        this._velocity *= Math.pow(INERTIA_FRICTION, dt / 16.67);
        if (Math.abs(this._velocity) < VELOCITY_EPS) this._velocity = 0;
      }
    }

    this._visualZoom =
      this._visualZoom + (this._goalZoom - this._visualZoom) * LERP;
    this._center = this._computeCenterForZoom(this._visualZoom);

    map._animateToCenter = this._center;
    map._animateToZoom = this._visualZoom;

    // Layers (GridLayer, Marker, …) follow this single transform stream.
    map.fire('zoomanim', {
      center: this._center,
      zoom: this._visualZoom,
      noUpdate: true
    });

    // Keep pointer-anchor math (`containerPointToLatLng`) in sync with the
    // visual zoom. Tile fetching is blocked separately while
    // `_mappSmoothZooming` is set, so this must not request intermediate z.
    map._move(this._center, this._visualZoom, undefined, true);

    var settled =
      !this._pinching &&
      !this._wheeling &&
      Math.abs(this._velocity) < VELOCITY_EPS &&
      Math.abs(this._goalZoom - this._visualZoom) < SETTLE_EPS;

    if (settled) {
      this._visualZoom = map._limitZoom(this._goalZoom);
      this._center = this._computeCenterForZoom(this._visualZoom);
      this._abort(true);
      return;
    }

    this._raf = requestAnimationFrame(this._tick.bind(this));
  }
});

L.Map.addInitHook('addHandler', 'smoothMapZoom', L.Map.SmoothMapZoom);
L.Map.addInitHook(function () {
  this.smoothWheelZoom = this.smoothMapZoom;
});

export {};
