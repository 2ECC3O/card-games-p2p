import assert from 'node:assert/strict';
import { TableNet } from './tableNet';

const browser = new EventTarget();
const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
let plays = 0;
let requests = 0;
browser.addEventListener('card-games:play', () => plays++);

// Exercise the shared public action path without opening PeerJS connections.
const net = Object.assign(Object.create(TableNet.prototype), {
  destroyed: false,
  me: { watch: false },
  rules: { validAction: (a: { type: string }) => a.type === 'hit' },
  request: () => requests++,
});
try {
  net.act({ type: 'hit' });
  assert.equal(requests, 1);
  assert.equal(plays, 1, 'a local gameplay action emits an anonymous signal');
  net.me.watch = true;
  net.act({ type: 'hit' });
  net.me.watch = false;
  net.destroyed = true;
  net.act({ type: 'hit' });
  net.destroyed = false;
  net.act({ type: 'invalid' });
  assert.equal(plays, 1, 'spectators, closed connections and malformed actions do not count');
} finally {
  if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
  else Reflect.deleteProperty(globalThis, 'window');
}
console.log('analytics action signal: all checks passed');
