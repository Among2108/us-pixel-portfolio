/* Run with: node --test tests/journey-motion.test.cjs
 * JOURNEY_SOURCE_ROOT can point at an unpatched source checkout to prove the
 * regression tests fail there. This is a deterministic hook test, not an iOS
 * browser emulator: only React scheduling and browser inputs are simulated.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const sourceRoot = process.env.JOURNEY_SOURCE_ROOT || path.resolve(__dirname, '..');
const compiled = new Map();

function sourceCode(filename) {
  if (!compiled.has(filename)) {
    compiled.set(filename, ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  return compiled.get(filename);
}

function session({ hz = 60, lag = false, jitter = false, start = 0, reduced = false, viewportHeight = 932 } = {}) {
  let time = 0;
  let nextId = 0;
  let changed = true;
  let hookIndex = 0;
  let api;
  let overlay = false;
  let physicalY = start;
  let pendingScroll = null;
  let frameNumber = 0;
  let scrollRange = 0;
  const layout = { height: viewportHeight, width: 430 };
  const scrollCommands = [];
  const hooks = [];
  const effects = [];
  const raf = new Map();
  const timers = new Map();
  const listeners = new Map();
  const documentListeners = new Map();
  const preferenceListeners = new Set();

  const subscribe = (collection, name, fn) => {
    if (!collection.has(name)) collection.set(name, new Set());
    collection.get(name).add(fn);
  };
  const dispatch = (name, event = {}) => {
    const input = { isTrusted: true, preventDefault() {}, ...event };
    for (const fn of listeners.get(name) || []) fn(input);
  };
  const dependenciesChanged = (previous, next) => !previous || !next
    || previous.length !== next.length || next.some((value, index) => value !== previous[index]);
  const react = {
    useState(initial) {
      const index = hookIndex++;
      if (!(index in hooks)) hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, value => {
        const next = typeof value === 'function' ? value(hooks[index].value) : value;
        if (!Object.is(next, hooks[index].value)) {
          hooks[index].value = next;
          changed = true;
        }
      }];
    },
    useRef(initial) {
      const index = hookIndex++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useCallback(fn, dependencies) {
      const index = hookIndex++;
      if (dependenciesChanged(hooks[index]?.dependencies, dependencies)) hooks[index] = { fn, dependencies };
      return hooks[index].fn;
    },
    useEffect(fn, dependencies) {
      const index = hookIndex++;
      const previous = hooks[index];
      if (dependenciesChanged(previous?.dependencies, dependencies)) {
        hooks[index] = { dependencies };
        effects.push(() => {
          previous?.cleanup?.();
          hooks[index].cleanup = fn();
        });
      }
    },
  };

  class Element {
    constructor(selectors = '') { this.selectors = selectors; }
    closest(query) {
      return query.split(',').some(selector => this.selectors.includes(selector.trim())) ? this : null;
    }
  }
  class HTMLElement extends Element {}
  class HTMLInputElement extends HTMLElement {}
  class HTMLTextAreaElement extends HTMLElement {}
  const preference = {
    matches: reduced,
    addEventListener(_name, fn) { preferenceListeners.add(fn); },
    removeEventListener(_name, fn) { preferenceListeners.delete(fn); },
  };
  const observe = y => {
    if (window.scrollY !== y) {
      window.scrollY = y;
      dispatch('scroll');
    }
  };
  const addTimer = (fn, delay = 0, interval = false) => {
    const token = ++nextId;
    timers.set(token, { fn, at: time + delay, interval: interval ? delay : null });
    return token;
  };
  const window = {
    scrollY: start,
    matchMedia: () => preference,
    getSelection: () => ({ rangeCount: 0, isCollapsed: true }),
    addEventListener: (name, fn) => subscribe(listeners, name, fn),
    removeEventListener: (name, fn) => listeners.get(name)?.delete(fn),
    setTimeout: (fn, delay) => addTimer(fn, delay),
    clearTimeout: token => timers.delete(token),
    setInterval: (fn, delay) => addTimer(fn, delay, true),
    clearInterval: token => timers.delete(token),
    scrollTo({ top, behavior }) {
      scrollCommands.push({ top, behavior, time });
      const target = Math.max(0, Math.min(scrollRange, top));
      if (lag && behavior === 'instant') pendingScroll = target;
      else {
        physicalY = target;
        observe(target);
      }
    },
  };
  const document = {
    hidden: false,
    activeElement: null,
    documentElement: { style: { overflowY: '' } },
    querySelector: () => overlay ? new Element() : null,
    addEventListener: (name, fn) => subscribe(documentListeners, name, fn),
    removeEventListener: (name, fn) => documentListeners.get(name)?.delete(fn),
  };
  const base = {
    console, window, document, Element, HTMLElement, HTMLInputElement, HTMLTextAreaElement,
    localStorage: { getItem: () => null, setItem() {} },
    performance: { now: () => time },
    requestAnimationFrame: fn => { const token = ++nextId; raf.set(token, fn); return token; },
    cancelAnimationFrame: token => raf.delete(token),
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    setInterval: window.setInterval,
    clearInterval: window.clearInterval,
  };
  const moduleCache = new Map();
  function load(filename) {
    if (moduleCache.has(filename)) return moduleCache.get(filename).exports;
    const module = { exports: {} };
    moduleCache.set(filename, module);
    vm.runInNewContext(sourceCode(filename), {
      ...base,
      module,
      exports: module.exports,
      require(name) {
        if (name === 'react') return react;
        assert.ok(name.startsWith('.'), `Unexpected module import: ${name}`);
        return load(path.resolve(path.dirname(filename), `${name}.ts`));
      },
    }, { filename });
    return module.exports;
  }
  const journey = load(path.join(sourceRoot, 'src/useJourney.ts'));
  // Mobile layout's minimum scroll distance is 330 CSS px per route unit.
  scrollRange = journey.routeLength * 330;
  const track = { current: {
    get offsetHeight() { return Math.round(layout.height + scrollRange); },
    getBoundingClientRect: () => ({ top: -window.scrollY, height: layout.height + scrollRange }),
  } };
  const screen = { current: {
    get offsetHeight() { return Math.round(layout.height); },
    get clientWidth() { return layout.width; },
    getBoundingClientRect: () => ({ top: 0, height: layout.height, width: layout.width }),
  } };

  function render() {
    let attempts = 0;
    while (changed) {
      assert.ok(++attempts < 30, 'The hook must settle without a render loop');
      changed = false;
      hookIndex = 0;
      api = journey.useJourney(track, screen, overlay);
      while (effects.length) effects.shift()();
    }
  }
  render();

  function tick(count = 1) {
    for (let frame = 0; frame < count; frame++) {
      time += 1000 / hz;
      frameNumber++;
      if (pendingScroll !== null) {
        physicalY = pendingScroll;
        pendingScroll = null;
        observe(physicalY);
      }
      // A synthetic acknowledgement pattern represents compositor jitter;
      // it is deliberately below the existing 2 px interruption tolerance.
      // It does not assert that a particular Safari build emits this pattern.
      if (jitter && time > 500 && physicalY > 2 && api.playing) {
        const offset = frameNumber % 4 === 1 ? -1 / 3 : frameNumber % 4 === 2 ? -2 / 3 : 0;
        observe(physicalY + offset);
      }
      const batch = [...raf.entries()];
      for (const [token, fn] of batch) {
        if (!raf.delete(token)) continue;
        fn(time);
      }
      for (const [token, timer] of [...timers]) {
        if (!timers.has(token) || timer.at > time) continue;
        if (timer.interval === null) timers.delete(token);
        else timer.at = time + timer.interval;
        timer.fn();
      }
      render();
    }
    return api;
  }

  return {
    tick,
    dispatch,
    Element,
    get api() { render(); return api; },
    get y() { return window.scrollY; },
    get time() { return time; },
    get route() { return journey; },
    get range() { return scrollRange; },
    get scrollCommands() { return scrollCommands; },
    resize({ height = layout.height, width = layout.width, range = scrollRange } = {}, notify = true) {
      layout.height = height;
      layout.width = width;
      scrollRange = range;
      if (notify) dispatch('resize');
    },
    setY(y) { physicalY = y; pendingScroll = null; observe(y); },
    setHidden(value) {
      document.hidden = value;
      for (const fn of documentListeners.get('visibilitychange') || []) fn({ isTrusted: true });
      render();
    },
    setOverlay(value) { overlay = value; changed = true; render(); },
    setReduced(value) {
      preference.matches = value;
      for (const fn of preferenceListeners) fn({ matches: value });
      render();
    },
    dispose() {
      for (const hook of hooks) hook?.cleanup?.();
      raf.clear();
      timers.clear();
    },
  };
}

for (const hz of [60, 120]) {
  for (const speed of ['Slow', 'Normal', 'Fast']) {
    test(`${speed} at ${hz} Hz keeps forward facing through subpixel acknowledgements`, t => {
      const s = session({ hz, lag: true, jitter: true });
      t.after(() => s.dispose());
      s.api.setSpeed(speed);
      s.api.play();
      let previousProgress = 0;
      for (let frame = 0; frame < hz * 8; frame++) {
        s.tick();
        assert.equal(s.api.playing, true, `Auto Run paused at ${s.time} ms`);
        assert.equal(s.api.direction, 1, `Facing reversed at ${s.time} ms / ${s.y} px`);
        assert.equal(s.api.running, true);
        if (frame % hz === hz - 1) {
          assert.ok(s.api.progress > previousProgress, 'Each second must advance the journey');
          previousProgress = s.api.progress;
        }
      }
    });
  }
}

test('Play faces forward immediately after manual reverse', t => {
  const s = session({ start: 100 });
  t.after(() => s.dispose());
  s.setY(90);
  s.tick();
  assert.equal(s.api.direction, -1);
  s.api.play();
  assert.equal(s.api.direction, 1);
  s.tick(60);
  assert.equal(s.api.playing, true);
  assert.equal(s.api.direction, 1);
});

test('Manual direction ignores small noise but accumulates a genuine slow reversal', t => {
  const s = session({ start: 100 });
  t.after(() => s.dispose());
  s.setY(90);
  s.tick();
  assert.equal(s.api.direction, -1);
  for (const delta of [.3, .6, .9, 1.2, 1.5, 1.8]) {
    s.setY(90 + delta);
    s.tick();
    assert.equal(s.api.direction, -1, 'Sub-threshold movement must retain facing');
  }
  s.setY(92.1);
  s.tick();
  assert.equal(s.api.direction, 1, 'Accumulated manual movement must still reverse facing');
  for (let frame = 0; frame < 10; frame++) {
    s.setY(92.1);
    s.tick();
    assert.equal(s.api.direction, 1, 'Unchanged scroll values must not change facing');
  }
});

test('Elastic overscroll at route edges does not turn the mascot', t => {
  const s = session();
  t.after(() => s.dispose());
  for (const y of [-30, -10, 0]) {
    s.setY(y);
    s.tick();
    assert.equal(s.api.direction, 1, 'Top-edge bounce is not backwards route travel');
  }
  s.setY(s.range - 10);
  s.tick();
  for (const y of [s.range, s.range + 30, s.range + 10, s.range]) {
    s.setY(y);
    s.tick();
    assert.equal(s.api.direction, 1, 'Bottom-edge rebound is not backwards route travel');
  }
  s.setY(s.range - 3);
  s.tick();
  assert.equal(s.api.direction, -1, 'Real reverse travel after the rebound remains possible');
});

for (const event of ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'keydown']) {
  test(`${event} still interrupts Auto Run and allows manual reverse`, t => {
    const s = session({ start: 100 });
    t.after(() => s.dispose());
    s.api.play();
    s.tick(60);
    s.dispatch(event, { target: new s.Element(), key: 'ArrowDown', pointerId: 1 });
    s.setY(s.y - 10);
    s.tick(2);
    assert.equal(s.api.playing, false);
    assert.equal(s.api.direction, -1);
  });
}

test('An uncommanded scroll still stops playback, but tapping the mascot does not', t => {
  const s = session({ start: 100 });
  t.after(() => s.dispose());
  s.api.play();
  s.tick(60);
  s.dispatch('pointerdown', { target: new s.Element('[data-auto-gesture]'), pointerId: 1 });
  s.dispatch('pointerup', { target: new s.Element('[data-auto-gesture]'), pointerId: 1 });
  s.tick(60);
  assert.equal(s.api.playing, true);
  s.setY(s.y - 40);
  s.tick(2);
  assert.equal(s.api.playing, false);
  assert.equal(s.api.direction, -1);
});

for (const interrupt of ['hidden', 'overlay', 'reduced']) {
  test(`${interrupt} still pauses Auto Run`, t => {
    const s = session();
    t.after(() => s.dispose());
    s.api.play();
    s.tick(60);
    if (interrupt === 'hidden') s.setHidden(true);
    else if (interrupt === 'overlay') s.setOverlay(true);
    else s.setReduced(true);
    s.tick(2);
    assert.equal(s.api.playing, false);
  });
}

test('Reduced motion prevents automatic playback', t => {
  const s = session({ reduced: true });
  t.after(() => s.dispose());
  s.api.play();
  s.tick(60);
  assert.equal(s.api.playing, false);
  assert.equal(s.y, 0);
});

test('An unchanged resize notification does not interrupt Auto Run', t => {
  const s = session({ start: 1000 });
  t.after(() => s.dispose());
  s.api.play();
  s.tick(60);
  const y = s.y;
  s.resize();
  s.tick(60);
  assert.equal(s.api.playing, true);
  assert.equal(s.api.direction, 1);
  assert.ok(s.y > y, 'Travel continues after a redundant resize event');
});

test('Height-only toolbar resize keeps Auto Run moving through fractional viewport changes', t => {
  const s = session({ start: 1000, viewportHeight: 800.4 });
  t.after(() => s.dispose());
  s.api.play();
  s.tick(60);
  let previousY = s.y;
  for (const height of [840.4, 890.8, 932.4, 932.8, 872.4, 800.8]) {
    s.resize({ height });
    s.tick(30);
    assert.equal(s.api.playing, true, `A toolbar height of ${height} must not pause the tour`);
    assert.equal(s.api.direction, 1);
    assert.ok(s.y > previousY, 'Toolbar resizing must not stop or reverse travel');
    previousY = s.y;
  }
});

test('Fractional toolbar rounding does not rebase a paused scene or move native scroll', t => {
  const s = session({ start: 1600, viewportHeight: 932.4 });
  t.after(() => s.dispose());
  const progress = s.api.progress;
  const scenery = s.api.sceneryDistance;
  const commands = s.scrollCommands.length;
  // offsetHeight subtraction changes from 4591 to 4590 at these heights,
  // while the real outer-height difference stays 4590.3 CSS px throughout.
  for (const height of [932.8, 932.4, 932.8, 932.4]) {
    s.resize({ height }, false);
    s.dispatch('scroll');
    s.tick();
    assert.equal(s.y, 1600, 'A toolbar acknowledgement must not issue a scroll correction');
    assert.equal(s.scrollCommands.length, commands);
    assert.ok(Math.abs(s.api.progress - progress) < 1e-10);
    assert.ok(Math.abs(s.api.sceneryDistance - scenery) < 1e-8);
  }
});

test('Subpixel range noise uses one canonical range without repeated reanchoring', t => {
  const s = session({ start: 1600 });
  t.after(() => s.dispose());
  const range = s.range;
  const progress = s.api.progress;
  const commands = s.scrollCommands.length;
  for (const noise of [.25, -.5, .75, -.75, 0]) {
    s.resize({ range: range + noise }, false);
    s.dispatch('scroll');
    s.tick();
    assert.equal(s.scrollCommands.length, commands);
    assert.equal(s.y, 1600);
    assert.ok(Math.abs(s.api.progress - progress) < 1e-10);
  }
});

test('A real orientation resize rebases progress and scenery, then permits resuming', t => {
  const s = session({ start: 1600 });
  t.after(() => s.dispose());
  s.api.play();
  s.tick(60);
  const progress = s.api.progress;
  const scenery = s.api.sceneryDistance;
  s.resize({ height: 430, width: 932, range: s.route.routeLength * (932 * .41) });
  s.tick(2);
  assert.equal(s.api.playing, false, 'A real orientation change still pauses safely');
  assert.ok(Math.abs(s.api.progress - progress) < 1e-10, 'The selected story position stays anchored');
  assert.ok(Math.abs(s.api.sceneryDistance - scenery) < 1e-8, 'The scenery phase stays anchored');
  assert.equal(s.api.sceneryTileCount, 5, 'The larger viewport gains enough scenery tiles');
  const rebasedY = s.y;
  s.api.play();
  s.tick(120);
  assert.equal(s.api.playing, true);
  assert.equal(s.api.direction, 1);
  assert.ok(s.y > rebasedY);
  assert.ok(s.api.progress > progress);
});

for (const hz of [60, 120]) {
  test(`A continuous Fast tour at ${hz} Hz reaches all 15 stops`, t => {
    const s = session({ hz, lag: true });
    t.after(() => s.dispose());
    s.api.setSpeed('Fast');
    s.api.play();
    const stops = new Set([s.api.stop.id]);
    const worlds = new Set([s.api.world]);
    const portals = new Set();
    while (s.time < 65_000 && s.api.autoState !== 'ended') {
      s.tick();
      stops.add(s.api.stop.id);
      worlds.add(s.api.world);
      if (s.api.portal >= 0) portals.add(s.api.portal);
      assert.equal(s.api.direction, 1);
      if (s.api.autoState !== 'ended') assert.equal(s.api.running, true);
    }
    assert.equal(s.api.autoState, 'ended');
    assert.equal(s.api.stop.id, 'contact');
    assert.equal(stops.size, 15);
    assert.equal(worlds.size, 4);
    assert.equal(portals.size, 3);
    assert.ok(s.y >= s.range - 1 && s.y <= s.range);
  });
}
