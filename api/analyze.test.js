const assert = require('assert');
const handlerModule = require('./analyze.js');
const { analyze, diffParagraphIds, validateFlags } = handlerModule;

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

async function runAsync(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

run('diffParagraphIds flags new and changed paragraphs only', () => {
  const prev = { 'p-1': { text: 'Hello' }, 'p-10': { text: 'Unchanged' } };
  const current = {
    'p-1': { text: 'Hello world' },
    'p-10': { text: 'Unchanged' },
    'p-20': { text: 'New paragraph' },
  };
  const changed = diffParagraphIds(prev, current).sort();
  assert.deepStrictEqual(changed, ['p-1', 'p-20']);
});

run('validateFlags drops unknown types and paragraphIds not in the snapshot', () => {
  const snapshot = { 'p-1': { text: 'x' } };
  const flags = validateFlags(
    [
      { type: 'HIGHLIGHT_TO_ITALIC', paragraphId: 'p-1', autoFixable: true },
      { type: 'NOT_A_REAL_TYPE', paragraphId: 'p-1', autoFixable: true },
      { type: 'FONT_SIZE', paragraphId: 'p-999', autoFixable: true },
    ],
    snapshot
  );
  assert.strictEqual(flags.length, 1);
  assert.strictEqual(flags[0].type, 'HIGHLIGHT_TO_ITALIC');
});

(async () => {
  await runAsync('analyze sends only changed paragraphs to Gemini and carries forward the rest', async () => {
    let receivedBody = null;
    const fetchImpl = async (_url, opts) => {
      receivedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          candidates: [{
            content: {
              parts: [{
                text: JSON.stringify({
                  flags: [{ type: 'FONT_SIZE', paragraphId: 'p-20', autoFixable: true, currentSize: 14, suggestedSize: 11 }],
                }),
              }],
            },
          }],
        }),
      };
    };

    const previousSnapshot = { 'p-1': { text: 'Hello', paragraphId: 'p-1' } };
    const currentSnapshot = {
      'p-1': { text: 'Hello', paragraphId: 'p-1' },
      'p-20': { text: 'BIG TEXT', paragraphId: 'p-20', maxFontSize: 14 },
    };
    const previousFlags = [{ type: 'HIGHLIGHT_TO_ITALIC', paragraphId: 'p-1', autoFixable: true }];

    const result = await analyze({ currentSnapshot, previousSnapshot, previousFlags }, 'fake-key', fetchImpl);

    const sentParagraphs = JSON.parse(receivedBody.contents[0].parts[0].text);
    assert.strictEqual(sentParagraphs.length, 1);
    assert.strictEqual(sentParagraphs[0].paragraphId, 'p-20');

    assert.strictEqual(result.flags.length, 2);
    assert.ok(result.flags.some((f) => f.paragraphId === 'p-1'));
    assert.ok(result.flags.some((f) => f.paragraphId === 'p-20'));
    assert.strictEqual(result.ecoScore, 100 - 2 * 8);
  });

  await runAsync('handler returns 500 when GEMINI_API_KEY is missing', async () => {
    delete process.env.GEMINI_API_KEY;
    let statusCode = null;
    let body = null;
    const req = { method: 'POST', body: { currentSnapshot: {} } };
    const res = {
      setHeader() {},
      status(code) { statusCode = code; return this; },
      json(payload) { body = payload; },
    };
    await handlerModule(req, res);
    assert.strictEqual(statusCode, 500);
    assert.ok(body.error.includes('GEMINI_API_KEY'));
  });

  await runAsync('handler rejects non-POST requests', async () => {
    process.env.GEMINI_API_KEY = 'fake-key-for-test';
    let statusCode = null;
    const req = { method: 'GET' };
    const res = {
      setHeader() {},
      status(code) { statusCode = code; return this; },
      json() {},
    };
    await handlerModule(req, res);
    assert.strictEqual(statusCode, 405);
  });

  await runAsync('handler answers CORS preflight with 204 and the right headers', async () => {
    let statusCode = null;
    let ended = false;
    const headers = {};
    const req = { method: 'OPTIONS' };
    const res = {
      setHeader(name, value) { headers[name] = value; },
      status(code) { statusCode = code; return this; },
      end() { ended = true; },
      json() {},
    };
    await handlerModule(req, res);
    assert.strictEqual(statusCode, 204);
    assert.strictEqual(ended, true);
    assert.strictEqual(headers['Access-Control-Allow-Origin'], '*');
  });

  console.log('analyze.test.js: all assertions passed');
})();
