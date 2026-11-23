/**
 * 中国大陆常用：WGS-84（GPS / OSM）↔ GCJ-02（火星坐标，Apple 地图国内 / 高德等）。
 * 算法为公开流传的近似实现，境外坐标原样返回。
 */

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;
const X_PI = (PI * 3000.0) / 180.0;

export function isCoordInChina(lat: number, lng: number): boolean {
  return lng > 72.004 && lng < 137.8347 && lat > 0.8293 && lat < 55.8271;
}

function transformLat(x: number, y: number): number {
  let ret =
    -100.0 +
    2.0 * x +
    3.0 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret +=
    ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret +=
    ((160.0 * Math.sin((y / 12.0) * PI) + 320.0 * Math.sin((y * PI) / 30.0)) * 2.0) /
    3.0;
  return ret;
}

function transformLng(x: number, y: number): number {
  let ret =
    300.0 +
    x +
    2.0 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x));
  ret +=
    ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret +=
    ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) /
    3.0;
  return ret;
}

function delta(lat: number, lng: number): { lat: number; lng: number } {
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return { lat: dLat, lng: dLng };
}

/** GPS / 网页底图（WGS-84）→ 国内地图 App（GCJ-02） */
export function wgs84ToGcj02(lat: number, lng: number): { lat: number; lng: number } {
  if (!isCoordInChina(lat, lng)) return { lat, lng };
  const d = delta(lat, lng);
  return { lat: lat + d.lat, lng: lng + d.lng };
}

/** 国内地图 App（GCJ-02）→ GPS / 网页底图（WGS-84）。 */
export function gcj02ToWgs84(lat: number, lng: number): { lat: number; lng: number } {
  if (!isCoordInChina(lat, lng)) return { lat, lng };

  // 用正向转换迭代求逆，避免一次减偏移在城市级缩放下仍留下明显误差。
  let wgsLat = lat;
  let wgsLng = lng;
  for (let i = 0; i < 4; i += 1) {
    const projected = wgs84ToGcj02(wgsLat, wgsLng);
    wgsLat -= projected.lat - lat;
    wgsLng -= projected.lng - lng;
  }
  return { lat: wgsLat, lng: wgsLng };
}

/** 百度经纬度（BD-09）→ 国测局坐标（GCJ-02）。 */
export function bd09ToGcj02(lat: number, lng: number): { lat: number; lng: number } {
  const x = lng - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return { lat: z * Math.sin(theta), lng: z * Math.cos(theta) };
}

/** 百度经纬度（BD-09）→ GPS / 网页底图（WGS-84）。 */
export function bd09ToWgs84(lat: number, lng: number): { lat: number; lng: number } {
  const gcj = bd09ToGcj02(lat, lng);
  return gcj02ToWgs84(gcj.lat, gcj.lng);
}
