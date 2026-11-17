// stopProcess: SIGTERM, wait for exit, SIGKILL fallback. Uses processes spawned here only.
const Module = require('module');
const origLoad = Module._load;
Module._load = function (req, ...a) {
  if (req === 'vscode') return { workspace: { getConfiguration: () => ({ get: (_k, d) => d }) } };
  return origLoad.call(this, req, ...a);
};
const assert = require('assert');
const cp = require('child_process');
const { stopProcess } = require('../lib/session-registry');

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

(async () => {
  const a = cp.spawn('sleep', ['300'], { stdio: 'ignore' });
  a.on('exit', () => {}); // reaped by node, so the pid vanishes once it exits
  assert.strictEqual(await stopProcess(a.pid, 3000), 'exited');
  assert.ok(!alive(a.pid));

  const b = cp.spawn('bash', ['-c', "trap '' TERM; while :; do sleep 1; done"], { stdio: 'ignore' });
  b.on('exit', () => {});
  await new Promise((r) => setTimeout(r, 300));
  assert.strictEqual(await stopProcess(b.pid, 1000), 'killed');
  assert.ok(!alive(b.pid));

  assert.strictEqual(await stopProcess(a.pid, 500), 'exited'); // already gone
  console.log('ok stopProcess');
})().catch((e) => { console.error(e); process.exit(1); });
