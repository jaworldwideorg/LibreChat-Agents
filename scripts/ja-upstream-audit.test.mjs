import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(
  new URL('./ja-upstream-audit.mjs', import.meta.url)
);

function compare(
  before,
  after,
  baselineLock = { packages: {} },
  candidateLock = baselineLock
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-audit-contract-'));
  try {
    const names = [
      'baseline.json',
      'candidate.json',
      'baseline-lock.json',
      'candidate-lock.json',
    ].map((name) => path.join(root, name));
    [before, after, baselineLock, candidateLock].forEach((value, index) =>
      fs.writeFileSync(names[index], JSON.stringify(value))
    );
    return spawnSync(process.execPath, [script, ...names], { encoding: 'utf8' })
      .status;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const audit = (severity, ids) => ({
  metadata: { vulnerabilities: { total: ids.length } },
  vulnerabilities: {
    fixture: { severity, via: ids.map((source) => ({ source })) },
  },
});

test('unchanged findings and reductions pass', () => {
  assert.equal(compare(audit('high', [1, 2]), audit('high', [1, 2])), 0);
  assert.equal(compare(audit('high', [1, 2]), audit('moderate', [1])), 0);
});

test('new advisories and worsening severity fail', () => {
  assert.notEqual(compare(audit('high', [1]), audit('high', [1, 2])), 0);
  assert.notEqual(compare(audit('moderate', [1]), audit('high', [1])), 0);
});

test('invalid responses fail closed', () => {
  assert.notEqual(compare(audit('high', [1]), {}), 0);
});

test('report-only transitive differences require unchanged locked nodes', () => {
  const before = { metadata: { vulnerabilities: {} }, vulnerabilities: {} };
  const after = {
    metadata: { vulnerabilities: {} },
    vulnerabilities: {
      parent: {
        severity: 'moderate',
        via: ['child'],
        nodes: ['node_modules/parent'],
      },
    },
  };
  const locked = {
    packages: {
      'node_modules/parent': {
        version: '1.0.0',
        dependencies: { child: '1.0.0' },
      },
    },
  };
  assert.equal(compare(before, after, locked, locked), 0);
  assert.notEqual(compare(before, after, { packages: {} }, locked), 0);
  assert.notEqual(
    compare(before, after, locked, {
      packages: { 'node_modules/parent': { version: '2.0.0' } },
    }),
    0
  );
});
