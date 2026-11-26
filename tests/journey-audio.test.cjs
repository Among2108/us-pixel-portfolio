// Run with node --test tests/journey-audio.test.cjs.
// Exercises the real hook and engine with controlled AudioContext lifecycle events.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const compiled = new Map();
function source(name) {
  if (!compiled.has(name)) {
    const filename = path.join(__dirname, '..', 'src', name + '.ts');
    compiled.set(name, ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  return compiled.get(name);
}

function session({ resume = 'immediate', failGainAt = 0 } = {}) {
  let now = 0;
  let timerId = 0;
  let changed = true;
  let hookIndex = 0;
  let api;
  const timers = new Map();
  const contexts = [];
  const notes = [];
  const hooks = [];
  const effects = [];
  const nodeFailures = new Set();
  let gainsCreated = 0;
  const options = { world: 0, portal: -1, returning: false, blocked: false };
  const timeout = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; };

  class Events {
    listeners = new Map();
    addEventListener(name, fn) {
      if (!this.listeners.has(name)) this.listeners.set(name, new Set());
      this.listeners.get(name).add(fn);
    }
    removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
    dispatch(name) { for (const fn of this.listeners.get(name) || []) fn(); }
  }
  class Parameter {
    value = 0;
    values = [];
    setValueAtTime(value, time) { this.value = value; this.values.push({ value, time }); }
    linearRampToValueAtTime(value, time) { this.value = value; this.values.push({ value, time }); }
    exponentialRampToValueAtTime(value, time) { this.value = value; this.values.push({ value, time }); }
    cancelScheduledValues() {}
  }
  class Node {
    connected = false;
    connect() { this.connected = true; }
    disconnect() { this.connected = false; }
  }
  class Oscillator extends Node {
    frequency = new Parameter();
    onended = null;
    stopTimer = null;
    start(at) { notes.push({ oscillator: this, pitch: this.frequency.values[0].value, at }); }
    stop(at) {
      timers.delete(this.stopTimer);
      if (at === undefined) this.onended?.();
      else this.stopTimer = timeout(() => this.onended?.(), Math.max(0, at * 1000 - now));
    }
  }
  class Context extends Events {
    state = 'suspended';
    destination = new Node();
    nodes = [];
    pendingResumes = [];
    closed = false;
    constructor() { super(); contexts.push(this); }
    get currentTime() { return now / 1000; }
    setState(state) { this.state = state; this.dispatch('statechange'); }
    resume() {
      if (resume === 'reject') return Promise.reject(new Error('Blocked'));
      if (resume === 'pending') return new Promise(resolve => this.pendingResumes.push(() => { this.setState('running'); resolve(); }));
      this.setState('running');
      return Promise.resolve();
    }
    suspend() { this.setState('suspended'); return Promise.resolve(); }
    close() { this.closed = true; this.setState('closed'); return Promise.resolve(); }
    createGain() {
      gainsCreated++;
      if (gainsCreated === failGainAt || nodeFailures.delete('gain')) throw new Error('Gain allocation failed');
      const node = Object.assign(new Node(), { gain: new Parameter() }); this.nodes.push(node); return node;
    }
    createBiquadFilter() {
      if (nodeFailures.delete('filter')) throw new Error('Filter allocation failed');
      const node = Object.assign(new Node(), { frequency: new Parameter(), Q: new Parameter() }); this.nodes.push(node); return node;
    }
    createOscillator() {
      if (nodeFailures.delete('oscillator')) throw new Error('Oscillator allocation failed');
      const node = new Oscillator(); this.nodes.push(node); return node;
    }
  }
  const window = Object.assign(new Events(), { AudioContext: Context, setTimeout: timeout, clearTimeout: id => timers.delete(id) });
  const document = Object.assign(new Events(), { hidden: false });
  const different = (previous, next) => !previous || !next || next.some((value, index) => value !== previous[index]);
  const react = {
    useState(initial) {
      const index = hookIndex++;
      if (!(index in hooks)) hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[index].value, value => {
        const next = typeof value === 'function' ? value(hooks[index].value) : value;
        if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; changed = true; }
      }];
    },
    useRef(value) { const index = hookIndex++; if (!(index in hooks)) hooks[index] = { current: value }; return hooks[index]; },
    useCallback(fn, dependencies) {
      const index = hookIndex++;
      if (different(hooks[index]?.dependencies, dependencies)) hooks[index] = { fn, dependencies };
      return hooks[index].fn;
    },
    useEffect(fn, dependencies) {
      const index = hookIndex++;
      const previous = hooks[index];
      if (different(previous?.dependencies, dependencies)) {
        hooks[index] = { dependencies };
        effects.push(() => { previous?.cleanup?.(); hooks[index].cleanup = fn(); });
      }
    },
  };
  const engineModule = { exports: {} };
  vm.runInNewContext(source('journeyAudio'), { module: engineModule, exports: engineModule.exports, window });
  const hookModule = { exports: {} };
  vm.runInNewContext(source('useJourneyAudio'), {
    module: hookModule, exports: hookModule.exports, window, document,
    require(name) { return name === 'react' ? react : engineModule.exports; },
  });
  const render = () => {
    let count = 0;
    do {
      assert.ok(count++ < 20, 'hook should settle');
      changed = false;
      hookIndex = 0;
      api = hookModule.exports.useJourneyAudio(options);
      while (effects.length) effects.shift()();
    } while (changed);
  };
  render();
  return {
    contexts, notes, timers,
    get api() { return api; },
    failNextNode(kind) { nodeFailures.add(kind); },
    update(values) { Object.assign(options, values); render(); },
    async flush() { for (let i = 0; i < 6; i++) await Promise.resolve(); render(); },
    toggle() { api.toggle(); render(); },
    hide() { document.hidden = true; document.dispatch('visibilitychange'); render(); },
    show() { document.hidden = false; document.dispatch('visibilitychange'); render(); },
    pagehide() { window.dispatch('pagehide'); render(); },
    pageshow() { window.dispatch('pageshow'); render(); },
    advance(milliseconds) {
      const end = now + milliseconds;
      let count = 0;
      while (true) {
        const ready = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!ready) break;
        assert.ok(count++ < 5000, 'timer work must remain bounded');
        now = ready[1].at;
        timers.delete(ready[0]);
        ready[1].fn();
        render();
      }
      now = end;
    },
    unmount() { for (const hook of hooks) hook.cleanup?.(); },
  };
}

test('Sound is silent by default and creates one context only after activation', async () => {
  const s = session();
  s.advance(5000);
  assert.equal(s.contexts.length, 0);
  assert.equal(s.api.enabled, false);
  s.toggle();
  assert.equal(s.contexts.length, 1);
  assert.equal(s.api.pending, true);
  await s.flush();
  assert.equal(s.api.enabled, true);
  s.advance(1000);
  assert.ok(s.notes.length > 0);
  s.toggle();
  assert.equal(s.api.enabled, false);
  assert.equal(s.contexts[0].state, 'suspended');
  s.toggle();
  await s.flush();
  assert.equal(s.contexts.length, 1);
  assert.equal(s.api.enabled, true);
  s.unmount();
  assert.equal(s.contexts[0].closed, true);
  assert.equal(s.timers.size, 0);
  assert.equal(s.contexts[0].nodes.filter(node => node.connected).length, 0);
});

test('Cancelling a pending activation stays silent even after its resume resolves', async () => {
  const s = session({ resume: 'pending' });
  s.toggle();
  assert.equal(s.api.pending, true);
  s.toggle();
  s.contexts[0].pendingResumes.shift()();
  await s.flush();
  assert.equal(s.api.enabled, false);
  assert.equal(s.api.pending, false);
  assert.equal(s.contexts[0].state, 'suspended');
  assert.equal(s.notes.length, 0);
  s.unmount();
});

test('A stalled or rejected resume ends pending state and permits a fresh retry', async () => {
  for (const resume of ['pending', 'reject']) {
    const s = session({ resume });
    s.toggle();
    s.advance(2500);
    await s.flush();
    assert.equal(s.api.enabled, false);
    assert.equal(s.api.pending, false);
    assert.match(s.api.error, /try again/i);
    assert.equal(s.contexts[0].closed, true);
    s.toggle();
    assert.equal(s.contexts.length, 2);
    s.unmount();
    await s.flush();
    assert.equal(s.timers.size, 0);
  }
});

test('Hidden tabs and pagehide stop notes, and visible return resumes the selected world', async () => {
  const s = session();
  s.toggle();
  await s.flush();
  s.advance(800);
  s.hide();
  assert.equal(s.api.enabled, false);
  const notes = s.notes.length;
  s.update({ world: 2 });
  s.advance(10000);
  assert.equal(s.notes.length, notes);
  assert.equal(s.timers.size, 0);
  s.show();
  await s.flush();
  assert.equal(s.api.enabled, true);
  assert.equal(s.contexts.length, 1);
  assert.ok(s.notes.slice(notes).some(note => note.pitch === 440 * 2 ** ((60 - 69) / 12)));
  s.pagehide();
  s.advance(1000);
  assert.equal(s.api.enabled, false);
  s.pageshow();
  await s.flush();
  assert.equal(s.api.enabled, true);
  s.unmount();
});

test('Portal boundary jitter and frame updates play each entry effect once', async () => {
  const s = session();
  s.toggle();
  await s.flush();
  s.update({ portal: 0 });
  for (let index = 0; index < 30; index++) { s.advance(35); s.update({ portal: index % 2 ? 0 : -1 }); }
  assert.equal(s.notes.filter(note => note.pitch === 110 && note.oscillator.frequency.values.length > 1).length, 1);
  s.update({ portal: -1 });
  s.advance(800);
  s.update({ portal: 0 });
  assert.equal(s.notes.filter(note => note.pitch === 110 && note.oscillator.frequency.values.length > 1).length, 2);
  s.advance(900);
  s.update({ returning: true });
  for (let index = 0; index < 20; index++) s.update({ returning: true });
  assert.equal(s.notes.filter(note => note.pitch === 110 && note.oscillator.frequency.values.length > 1).length, 3);
  s.unmount();
});

test('World changes stay bounded and blocked details suppress jump and warp effects', async () => {
  const s = session();
  s.toggle();
  await s.flush();
  for (let index = 0; index < 60; index++) { s.update({ world: index % 4 }); s.advance(120); }
  assert.ok(s.contexts[0].nodes.filter(node => node.connected).length < 45);
  s.update({ blocked: true });
  s.api.jump();
  s.update({ portal: 1 });
  assert.equal(s.notes.filter(note => (note.pitch === 280 || note.pitch === 110) && note.oscillator.frequency.values.length > 1).length, 0);
  s.update({ blocked: false });
  s.api.jump();
  assert.equal(s.notes.filter(note => note.pitch === 280).length, 1);
  s.toggle();
  assert.equal(s.contexts[0].nodes.filter(node => node instanceof Object && node.connected).length, 2);
  s.unmount();
  assert.equal(s.timers.size, 0);
});

test('An operating-system interruption exposes a retry and stops scheduling', async () => {
  const s = session();
  s.toggle();
  await s.flush();
  s.contexts[0].setState('interrupted');
  await s.flush();
  assert.equal(s.api.enabled, false);
  assert.equal(s.api.error, 'Tap Sound to resume.');
  const notes = s.notes.length;
  s.advance(10000);
  assert.equal(s.notes.length, notes);
  s.toggle();
  await s.flush();
  assert.equal(s.api.enabled, true);
  s.unmount();
});

test('Partial constructor failure closes its context and leaves the sound button retryable', async () => {
  for (const failGainAt of [1, 2]) {
    const s = session({ failGainAt });
    assert.doesNotThrow(() => s.toggle());
    await s.flush();
    assert.equal(s.contexts[0].closed, true);
    assert.equal(s.contexts[0].nodes.filter(node => node.connected).length, 0);
    assert.equal(s.api.enabled, false);
    assert.equal(s.api.pending, false);
    assert.match(s.api.error, /try again/i);
    s.toggle();
    await s.flush();
    assert.equal(s.api.enabled, true);
    s.unmount();
  }
});

test('A later scheduler allocation failure clears playback and allows retry', async () => {
  const s = session();
  s.toggle();
  await s.flush();
  s.failNextNode('oscillator');
  assert.doesNotThrow(() => s.advance(2000));
  assert.equal(s.api.enabled, false);
  assert.equal(s.api.pending, false);
  assert.equal(s.api.error, 'Tap Sound to resume.');
  assert.equal(s.timers.size, 0);
  assert.equal(s.contexts[0].nodes.filter(node => node.connected).length, 2);
  s.toggle();
  await s.flush();
  assert.equal(s.api.enabled, true);
  s.unmount();
});

test('World-switch allocation failures release partial music layers and expose retry', async () => {
  for (const kind of ['gain', 'filter']) {
    const s = session();
    s.toggle();
    await s.flush();
    s.failNextNode(kind);
    assert.doesNotThrow(() => s.update({ world: 1 }));
    assert.equal(s.api.enabled, false);
    assert.equal(s.api.error, 'Tap Sound to resume.');
    s.advance(1000);
    assert.equal(s.timers.size, 0);
    assert.equal(s.contexts[0].nodes.filter(node => node.connected).length, 2);
    s.toggle();
    await s.flush();
    assert.equal(s.api.enabled, true);
    s.unmount();
  }
});

test('First-tick and effect failures cannot overwrite the failed state with enabled', async () => {
  for (const trigger of ['first tick', 'jump', 'warp']) {
    const s = session();
    if (trigger === 'first tick') s.failNextNode('oscillator');
    s.toggle();
    await s.flush();
    if (trigger !== 'first tick') {
      s.failNextNode('oscillator');
      assert.doesNotThrow(() => trigger === 'jump' ? s.api.jump() : s.update({ returning: true }));
      await s.flush();
    }
    assert.equal(s.api.enabled, false);
    assert.equal(s.api.pending, false);
    assert.equal(s.api.error, 'Tap Sound to resume.');
    s.advance(1000);
    assert.equal(s.timers.size, 0);
    s.toggle();
    await s.flush();
    assert.equal(s.api.enabled, true);
    s.unmount();
  }
});
