/* Run with: node --test tests/image-readiness.test.cjs
 * Exercises the actual image-readiness module with controlled image events.
 * IMAGE_READINESS_SOURCE_ROOT optionally selects an unpatched source checkout.
 * This checks reference ownership and scheduling, not measured browser memory.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const sourceRoot = process.env.IMAGE_READINESS_SOURCE_ROOT || path.resolve(__dirname, '..');
const filename = path.join(sourceRoot, 'src/imageReadiness.ts');
const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function session(previewCount = 2) {
  const manifest = Array.from({ length: previewCount }, (_, index) => ({ src: `/preview-${index}.webp` }));
  const allocations = [];
  const images = [];
  const requests = [];
  const timers = new Map();
  let nextTimer = 0;
  let now = 0;

  // Observe the real store's ownership without exporting a testing API from
  // production code. Map behavior is unchanged; only allocations are recorded.
  class ObservedMap extends Map {
    constructor(...args) { super(...args); allocations.push(this); }
  }
  class Image {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this.naturalWidth = 720;
      this.removedSources = 0;
      images.push(this);
    }
    set src(value) { this._src = value; requests.push(value); }
    get src() { return this._src; }
    decode() { return Promise.resolve(); }
    removeAttribute(name) {
      assert.equal(name, 'src');
      this._src = undefined;
      this.removedSources++;
    }
  }
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, exports: module.exports, Map: ObservedMap, Image,
    require(name) {
      if (name === './story') return { journeyImageManifest: manifest };
      assert.equal(name, 'react');
      return { useEffect: fn => fn(), useSyncExternalStore: (_subscribe, snapshot) => snapshot() };
    },
    window: {
      setTimeout(fn, delay) { const token = ++nextTimer; timers.set(token, { fn, at: now + delay }); return token; },
      clearTimeout(token) { timers.delete(token); },
    },
  }, { filename });
  const api = module.exports;
  const store = allocations[0];
  return {
    api, images, requests, manifest, store,
    get activeTimers() { return timers.size; },
    async succeed(image) { image.onload?.(); await Promise.resolve(); },
    fail(image) { image.onerror?.(); },
    advance(milliseconds) {
      now += milliseconds;
      for (const [token, timer] of [...timers]) {
        if (timer.at > now || !timers.delete(token)) continue;
        timer.fn();
      }
    },
    progress() { return JSON.parse(JSON.stringify(api.usePreviewProgress())); },
  };
}

test('Successful journey previews retain their warming references and settle readiness', async () => {
  const s = session();
  s.api.startJourneyPreviews();
  assert.deepEqual(s.progress(), { settled: 0, total: 2 });
  for (const image of s.images) await s.succeed(image);
  assert.deepEqual(s.progress(), { settled: 2, total: 2 });
  for (const image of s.images) {
    const asset = s.store.get(image.src);
    assert.equal(asset.status, 'ready');
    assert.equal(asset.image, image);
    assert.equal(image.onload, null);
    assert.equal(image.onerror, null);
    assert.equal(image.removedSources, 0);
  }
  assert.equal(s.activeTimers, 0);
});

test('Successful Details images release the preloader reference while remaining ready', async () => {
  const s = session(1);
  s.api.startJourneyPreviews();
  await s.succeed(s.images[0]);
  const detail = '/project-detail.webp';
  assert.equal(s.api.usePreparedImage(detail), 'loading');
  const image = s.images.at(-1);
  assert.equal(s.store.get(detail).image, image, 'Keep the in-flight loader alive');
  await s.succeed(image);
  assert.equal(s.store.get(detail).image, undefined, 'Do not pin a decoded Details image for the whole visit');
  assert.equal(s.api.usePreparedImage(detail), 'ready');
  assert.equal(image.src, detail, 'Success must not cancel or strip the cached resource');
  assert.equal(image.removedSources, 0);
  assert.equal(image.onload, null);
  assert.equal(image.onerror, null);
  assert.deepEqual(s.progress(), { settled: 1, total: 1 });
  for (let visit = 0; visit < 20; visit++) {
    assert.equal(s.api.usePreparedImage(detail), 'ready');
    s.api.startJourneyPreviews();
  }
  assert.deepEqual(s.requests, ['/preview-0.webp', detail], 'Revisits must not restart preloading');
  assert.equal(s.activeTimers, 0);
});

test('Image failure settles startup, releases ownership and can be retried', async () => {
  const s = session();
  s.api.startJourneyPreviews();
  await s.succeed(s.images[0]);
  const failed = s.images[1];
  s.fail(failed);
  assert.equal(s.store.get('/preview-1.webp').status, 'failed');
  assert.equal(s.store.get('/preview-1.webp').image, undefined);
  assert.equal(failed.removedSources, 1);
  assert.deepEqual(s.progress(), { settled: 2, total: 2 });
  s.api.retryImage('/preview-1.webp');
  assert.deepEqual(s.progress(), { settled: 1, total: 2 });
  const retry = s.images[2];
  await s.succeed(retry);
  assert.equal(s.store.get('/preview-1.webp').image, retry);
  assert.deepEqual(s.progress(), { settled: 2, total: 2 });
  s.api.retryImage('/preview-1.webp');
  assert.equal(s.requests.length, 3, 'Retrying an already ready asset must not create another request');
});

test('The queue keeps four active requests and settles queued previews without duplicates', async () => {
  const s = session(6);
  s.api.startJourneyPreviews();
  assert.equal(s.images.length, 4);
  assert.equal(s.activeTimers, 4);
  await s.succeed(s.images[0]);
  assert.equal(s.images.length, 5);
  assert.equal(s.activeTimers, 4);
  s.fail(s.images[1]);
  assert.equal(s.images.length, 6);
  assert.equal(s.activeTimers, 4);
  for (const image of s.images.slice(2)) await s.succeed(image);
  assert.deepEqual(s.progress(), { settled: 6, total: 6 });
  assert.equal(s.activeTimers, 0);
  assert.equal(new Set(s.requests).size, 6);
  s.api.startJourneyPreviews();
  assert.equal(s.requests.length, 6);
});

test('A timed-out decode cannot overwrite a later successful retry', async () => {
  const s = session(1);
  const detail = '/slow-detail.webp';
  s.api.usePreparedImage(detail);
  const slow = s.images[0];
  let resolveDecode;
  slow.decode = () => new Promise(resolve => { resolveDecode = resolve; });
  slow.onload();
  s.advance(8000);
  assert.equal(s.api.usePreparedImage(detail), 'failed');
  assert.equal(s.store.get(detail).image, undefined);
  assert.equal(slow.removedSources, 1);
  s.api.retryImage(detail);
  await s.succeed(s.images[1]);
  resolveDecode();
  await Promise.resolve();
  assert.equal(s.api.usePreparedImage(detail), 'ready');
  assert.equal(s.store.get(detail).image, undefined);
  assert.equal(s.requests.length, 2);
  assert.equal(s.activeTimers, 0);
});

test('A rendered-image failure remains retryable after releasing its preloader', async () => {
  const s = session();
  const detail = '/render-error-detail.webp';
  s.api.usePreparedImage(detail);
  await s.succeed(s.images[0]);
  s.api.markImageUnavailable(detail);
  assert.equal(s.api.usePreparedImage(detail), 'failed');
  s.api.retryImage(detail);
  await s.succeed(s.images[1]);
  assert.equal(s.api.usePreparedImage(detail), 'ready');
  assert.equal(s.store.get(detail).image, undefined);
  assert.equal(s.requests.length, 2);
});
