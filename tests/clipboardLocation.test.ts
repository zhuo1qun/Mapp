import assert from 'node:assert/strict';
import { parseClipboardLocation } from '../utils/map/clipboardLocation';
import {
  externalMapShareUrl,
  type ExternalMapAppId
} from '../utils/map/openExternalNavigation';
import { bd09ToWgs84, gcj02ToWgs84 } from '../utils/map/chinaCoords';

const shanghai = { lat: 31.230416, lng: 121.473701 };

function assertNear(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) < 0.00002, `${label}: expected ${expected}, got ${actual}`);
}

for (const appId of ['apple', 'amap', 'baidu', 'google'] satisfies ExternalMapAppId[]) {
  const url = externalMapShareUrl(appId, shanghai.lat, shanghai.lng, { label: '上海' });
  assert.ok(url, `${appId} should create a share URL`);
  const parsed = parseClipboardLocation(`朋友分享了一个点位：${url}\n请在地图中查看`);
  assert.ok(parsed, `${appId} share URL should be recognized from surrounding text`);
  assertNear(parsed.coords.lat, shanghai.lat, `${appId} latitude`);
  assertNear(parsed.coords.lng, shanghai.lng, `${appId} longitude`);
}

const osm = parseClipboardLocation('https://www.openstreetmap.org/?mlat=48.85837&mlon=2.294481#map=18/48.85837/2.294481');
assert.deepEqual(osm?.coords, { lat: 48.85837, lng: 2.294481 });

const generic = parseClipboardLocation('查看网页 https://example.com/place?latitude=35.65858&longitude=139.745433');
assert.deepEqual(generic?.coords, { lat: 35.65858, lng: 139.745433 });

const appleUnified = parseClipboardLocation('https://maps.apple.com/place?coordinate=31.230416,121.473701&name=上海');
assert.deepEqual(appleUnified?.coords, shanghai);

const amapWgs84 = parseClipboardLocation('https://uri.amap.com/marker?position=121.473701,31.230416&coordinate=wgs84');
assert.deepEqual(amapWgs84?.coords, shanghai);

const baiduDefault = parseClipboardLocation('https://api.map.baidu.com/marker?location=31.237,121.484&output=html');
const expectedBaidu = bd09ToWgs84(31.237, 121.484);
assertNear(baiduDefault!.coords.lat, expectedBaidu.lat, 'Baidu default BD-09 latitude');
assertNear(baiduDefault!.coords.lng, expectedBaidu.lng, 'Baidu default BD-09 longitude');

const googlePlaceData = parseClipboardLocation('https://www.google.com/maps/place/Test/data=!3d31.230416!4d121.473701!16s');
assert.deepEqual(googlePlaceData?.coords, shanghai);

const amapIframe = parseClipboardLocation(
  '<iframe src="https://www.amap.com/ssr/embed/place?id=B0KDY9SGRX&amp;name=Good+Lab&amp;lng=114.150868&amp;lat=22.335088&amp;address=Kowloon&amp;zoom=16"></iframe>'
);
assert.ok(amapIframe, 'Amap iframe embed HTML should be recognized');
assert.equal(amapIframe.source, 'amap');
assert.equal(amapIframe.title, 'Good Lab');
assert.equal(amapIframe.body, 'Kowloon');
const expectedAmapIframe = gcj02ToWgs84(22.335088, 114.150868);
assertNear(amapIframe.coords.lat, expectedAmapIframe.lat, 'Amap iframe latitude');
assertNear(amapIframe.coords.lng, expectedAmapIframe.lng, 'Amap iframe longitude');

const escapedAmapIframe = parseClipboardLocation(
  '<iframe src="https\\://www\\.amap.com/ssr/embed/place?lng=114.150868&amp;lat=22.335088"></iframe>'
);
assert.ok(escapedAmapIframe, 'escaped Amap iframe text should be recognized');

assert.equal(parseClipboardLocation('https://example.com/article-without-location'), null);

console.log('PASS: clipboard location recognizes generated web share links and explicit coordinate URLs');
