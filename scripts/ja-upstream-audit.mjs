import fs from 'node:fs';
import assert from 'node:assert/strict';

const severity = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

function findings(filename) {
  const audit = JSON.parse(fs.readFileSync(filename, 'utf8'));
  assert.ok(audit.metadata?.vulnerabilities && audit.vulnerabilities);
  const result = new Map();
  for (const [name, value] of Object.entries(audit.vulnerabilities)) {
    assert.ok(
      Object.hasOwn(severity, value.severity) && Array.isArray(value.via)
    );
    const direct = value.via
      .filter((entry) => typeof entry === 'object')
      .map((entry) => entry.url ?? entry.source)
      .sort();
    const references = value.via.filter((entry) => typeof entry === 'string');
    result.set(name, {
      severity: value.severity,
      direct,
      references,
      nodes: value.nodes ?? [],
    });
  }
  return result;
}

const baseline = findings(process.argv[2]);
const candidate = findings(process.argv[3]);
const baselineLock = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
const candidateLock = JSON.parse(fs.readFileSync(process.argv[5], 'utf8'));
assert.ok(baselineLock.packages && candidateLock.packages);

function unchangedNodes(value) {
  return (
    value.nodes.length > 0 &&
    value.nodes.every((node) => {
      const old = baselineLock.packages[node];
      const current = candidateLock.packages[node];
      return old && current && JSON.stringify(old) === JSON.stringify(current);
    })
  );
}

const introduced = [...candidate].filter(([name, value]) => {
  const previous = baseline.get(name);
  if (!previous) {
    return value.direct.length > 0 || !unchangedNodes(value);
  }
  return (
    severity[value.severity] > severity[previous.severity] ||
    value.direct.some((id) => !previous.direct.includes(id)) ||
    (value.references.some((name) => !previous.references.includes(name)) &&
      !unchangedNodes(value))
  );
});
console.log(
  `Audit comparison: ${baseline.size} baseline packages, ${candidate.size} candidate packages`
);
if (introduced.length) {
  console.log(
    `Audit changes requiring review: ${introduced.map(([name]) => name).join(', ')}`
  );
}
assert.equal(
  introduced.length,
  0,
  'Upstream introduces new or changed audit findings; review required'
);
console.log(
  `Audit comparison passed: ${candidate.size} inherited findings, no new findings`
);
