import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const lifecycleSource = await readFile(
  new URL('../src/serviceWorkerLifecycle.ts', import.meta.url),
  'utf8',
);
const mainSource = await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8');
const handlers = new Map();
const deleted = [];
let claimed = 0;
let skipped = 0;

const shellCache = {
  add: async () => undefined,
  keys: async () => [],
};
const caches = {
  open: async () => shellCache,
  keys: async () => ['splat04-v1', 'splat04-v1-assets', 'other-app-cache'],
  delete: async (key) => {
    deleted.push(key);
    return true;
  },
  match: async () => undefined,
};
const self = {
  location: { origin: 'https://splat04.test' },
  clients: {
    claim: async () => {
      claimed += 1;
    },
  },
  addEventListener: (name, handler) => handlers.set(name, handler),
  skipWaiting: () => {
    skipped += 1;
  },
};

vm.runInNewContext(source, {
  self,
  caches,
  URL,
  Promise,
  console,
  fetch: async () => {
    throw new Error('not used');
  },
});

let activation;
handlers.get('activate')({
  waitUntil: (promise) => {
    activation = promise;
  },
});
await activation;

assert.deepEqual(deleted.sort(), ['splat04-v1', 'splat04-v1-assets']);
assert.equal(claimed, 1, 'v3 must control the next reload after explicit activation');
assert.equal(skipped, 0, 'install/activate must not skip the intermission-safe approval gate');

handlers.get('message')({ data: 'splat04:activate-update' });
assert.equal(skipped, 1, 'the explicit intermission message activates the waiting worker');

assert.match(
  lifecycleSource,
  /waiting\.postMessage\('splat04:activate-update'\)/,
  'page lifecycle must send the worker activation message',
);
assert.match(
  lifecycleSource,
  /addEventListener\('controllerchange'/,
  'page lifecycle must observe worker controller handoff',
);
assert.match(
  mainSource,
  /serviceWorkerLifecycle\.register\(\)/,
  'production entrypoint must register through the safe lifecycle',
);

console.log(
  'service-worker upgrade: caches swept, v3 claimed, safe sender and controller handoff wired',
);
