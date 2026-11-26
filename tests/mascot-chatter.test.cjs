const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const source = ts.transpileModule(
  fs.readFileSync(path.resolve(__dirname, '../src/PixelArt.tsx'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } },
).outputText;

// Simulate timers and React effects to verify that scroll-state changes cannot
// starve the mascot's recurring gestures. Layout is checked in the browser.
function mascot(initial = {}) {
  let now = 0;
  let nextId = 0;
  let cursor = 0;
  let dirty = true;
  let tree;
  let seed = 537;
  let jumps = 0;
  const hooks = [];
  const effects = [];
  const timers = new Map();
  const visibilityListeners = new Set();
  let props = { running: true, unicorn: false, greeting: true, motion: true, interactive: true, world: 0, onJump: () => jumps++, ...initial };
  const dependenciesChanged = (old, next) => !old || !next || old.length !== next.length || next.some((value, index) => value !== old[index]);
  const react = {
    memo: component => component,
    useState(initialValue) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { value: typeof initialValue === 'function' ? initialValue() : initialValue };
      return [hooks[index].value, value => {
        const next = typeof value === 'function' ? value(hooks[index].value) : value;
        if (!Object.is(next, hooks[index].value)) {
          hooks[index].value = next;
          dirty = true;
        }
      }];
    },
    useRef(initialValue) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initialValue };
      return hooks[index];
    },
    useCallback(fn, dependencies) {
      const index = cursor++;
      if (dependenciesChanged(hooks[index]?.dependencies, dependencies)) hooks[index] = { fn, dependencies };
      return hooks[index].fn;
    },
    useEffect(fn, dependencies) {
      const index = cursor++;
      const old = hooks[index];
      if (dependenciesChanged(old?.dependencies, dependencies)) {
        hooks[index] = { dependencies };
        effects.push(() => {
          old?.cleanup?.();
          hooks[index].cleanup = fn();
        });
      }
    },
  };
  const window = {
    setTimeout(fn, delay) {
      const id = ++nextId;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  const document = {
    hidden: false,
    addEventListener(_name, fn) { visibilityListeners.add(fn); },
    removeEventListener(_name, fn) { visibilityListeners.delete(fn); },
  };
  const randomMath = Object.create(Math);
  randomMath.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    exports: module.exports, module, window, document, Math: randomMath,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) };
      if (name.endsWith('.css')) return {};
      throw new Error(`Unexpected import ${name}`);
    },
  });
  function render() {
    while (dirty || effects.length) {
      dirty = false;
      cursor = 0;
      tree = module.exports.Dino(props);
      effects.splice(0).forEach(fn => fn());
    }
  }
  render();
  return {
    get tree() { return tree; },
    get jumps() { return jumps; },
    get timerCount() { return timers.size; },
    get speech() { return tree.props.children.find(child => child?.props?.className === 'dino-hello'); },
    setProps(update) { props = { ...props, ...update }; dirty = true; render(); },
    click() { tree.props.onClick(); render(); },
    hide(value) { document.hidden = value; visibilityListeners.forEach(fn => fn()); render(); },
    advance(milliseconds) {
      const until = now + milliseconds;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
        render();
      }
      now = until;
      render();
    },
  };
}

test('continuous running still greets, chats, waves, winks and hops', () => {
  const scene = mascot();
  scene.advance(500);
  assert.equal(scene.speech.props.children, 'Hi!');
  const gestures = new Set();
  const lines = [];
  let lastSpeechId;
  for (let tick = 0; tick < 1200; tick++) {
    scene.advance(50);
    gestures.add(scene.tree.props['data-gesture']);
    if (scene.speech && scene.speech.key !== lastSpeechId) {
      lastSpeechId = scene.speech.key;
      lines.push(scene.speech.props.children);
    }
  }
  for (const gesture of ['wave', 'wink', 'hop']) assert.ok(gestures.has(gesture), gesture);
  assert.ok(scene.jumps > 0);
  assert.ok(lines.length >= 6);
  assert.ok(lines.slice(1).every((line, index) => line !== lines[index]));
});

test('repeated running-state changes do not restart the chat timers', () => {
  const scene = mascot({ greeting: false });
  let spoke = false;
  for (let tick = 0; tick < 100; tick++) {
    scene.setProps({ running: tick % 2 === 0 });
    scene.advance(100);
    spoke ||= Boolean(scene.speech);
  }
  assert.ok(spoke);
});

test('portal, details, hidden tabs and motion off clear all mascot timers', () => {
  const scene = mascot();
  scene.advance(500);
  scene.setProps({ interactive: false });
  assert.equal(scene.timerCount, 0);
  assert.equal(scene.speech, undefined);
  assert.equal(scene.tree.props['data-gesture'], 'idle');
  scene.setProps({ interactive: true });
  scene.hide(true);
  assert.equal(scene.timerCount, 0);
  scene.hide(false);
  scene.setProps({ motion: false });
  assert.equal(scene.timerCount, 0);
  assert.equal(scene.tree.props['data-gesture-enabled'], false);
});

test('tapping the mascot emits one jump and ignores duplicate hop activation', () => {
  const scene = mascot({ greeting: false });
  scene.click();
  assert.equal(scene.tree.props['data-gesture'], 'activation');
  assert.equal(scene.jumps, 1);
  assert.ok(scene.speech);
  scene.click();
  assert.equal(scene.jumps, 1);
  scene.advance(1300);
  scene.click();
  assert.equal(scene.jumps, 2);
});
