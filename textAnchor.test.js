const assert = require('assert');
const { locateText } = require('./textAnchor.js');

function run(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

run('finds a match within a single node', () => {
  const result = locateText(['hello world'], 'world');
  assert.deepStrictEqual(result, {
    start: { nodeIndex: 0, localOffset: 6 },
    end: { nodeIndex: 0, localOffset: 11 },
  });
});

run('finds a match spanning two nodes', () => {
  const result = locateText(['hello wor', 'ld today'], 'world');
  assert.deepStrictEqual(result, {
    start: { nodeIndex: 0, localOffset: 6 },
    end: { nodeIndex: 1, localOffset: 2 },
  });
});

run('respects occurrenceIndex for repeated text', () => {
  const result = locateText(['cat cat cat'], 'cat', 1);
  assert.strictEqual(result.start.localOffset, 4);
  assert.strictEqual(result.end.localOffset, 7);
});

run('returns null when no match exists', () => {
  assert.strictEqual(locateText(['hello world'], 'xyz'), null);
});

run('returns null for empty search text', () => {
  assert.strictEqual(locateText(['hello world'], ''), null);
});

run('handles a match spanning three nodes', () => {
  const result = locateText(['ab', 'cd', 'ef'], 'bcde');
  assert.deepStrictEqual(result, {
    start: { nodeIndex: 0, localOffset: 1 },
    end: { nodeIndex: 2, localOffset: 1 },
  });
});

console.log('textAnchor.test.js: all assertions passed');
