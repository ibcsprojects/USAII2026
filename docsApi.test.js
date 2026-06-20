const assert = require('assert');
const docsApi = require('./docsApi.js');

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

// Shape matches the real Docs API documents.get response (StructuralElement[] of
// paragraphs, each with ParagraphElement textRuns) per Google's official docs.
const sampleDoc = {
  body: {
    content: [
      { startIndex: 1, endIndex: 1, sectionBreak: {} },
      {
        startIndex: 1,
        endIndex: 33,
        paragraph: {
          elements: [
            {
              startIndex: 1,
              endIndex: 33,
              textRun: {
                content: 'This sentence is too big to read.\n',
                textStyle: { fontSize: { magnitude: 14, unit: 'PT' } },
              },
            },
          ],
        },
      },
      {
        startIndex: 33,
        endIndex: 50,
        paragraph: {
          elements: [
            {
              startIndex: 33,
              endIndex: 50,
              textRun: {
                content: 'Highlighted text\n',
                textStyle: { backgroundColor: { color: { rgbColor: { red: 1, green: 1 } } } },
              },
            },
          ],
        },
      },
    ],
  },
};

run('parseSnapshot extracts text, startIndex, font size, and highlight flag', () => {
  const snapshot = docsApi.parseSnapshot(sampleDoc);
  assert.strictEqual(Object.keys(snapshot).length, 2);
  assert.strictEqual(snapshot['p-1'].text, 'This sentence is too big to read.\n');
  assert.strictEqual(snapshot['p-1'].maxFontSize, 14);
  assert.strictEqual(snapshot['p-1'].hasHighlight, false);
  assert.strictEqual(snapshot['p-33'].hasHighlight, true);
});

run('resolveAbsoluteRange passes through an already-absolute range untouched', () => {
  const range = docsApi.resolveAbsoluteRange({ startIndex: 5, endIndex: 9 });
  assert.deepStrictEqual(range, { startIndex: 5, endIndex: 9 });
});

run('resolveAbsoluteRange returns null without a snapshot for paragraph-relative offsets', () => {
  const range = docsApi.resolveAbsoluteRange({ paragraphId: 'p-1', startOffset: 5, endOffset: 9 });
  assert.strictEqual(range, null);
});

run('buildRequests produces a valid updateTextStyle batchUpdate for HIGHLIGHT_TO_ITALIC', () => {
  const requests = docsApi.buildRequests(
    { type: 'HIGHLIGHT_TO_ITALIC' },
    { startIndex: 33, endIndex: 50 }
  );
  assert.deepStrictEqual(requests, [{
    updateTextStyle: {
      range: { startIndex: 33, endIndex: 50 },
      textStyle: { backgroundColor: {}, italic: true },
      fields: 'backgroundColor,italic',
    },
  }]);
});

run('buildRequests produces delete+insert for REDUNDANT_TEXT', () => {
  const requests = docsApi.buildRequests(
    { type: 'REDUNDANT_TEXT', condensed: 'Short version.' },
    { startIndex: 1, endIndex: 35 }
  );
  assert.deepStrictEqual(requests, [
    { deleteContentRange: { range: { startIndex: 1, endIndex: 35 } } },
    { insertText: { location: { index: 1 }, text: 'Short version.' } },
  ]);
});

run('buildRequests returns null for suggestion-only flag types', () => {
  assert.strictEqual(docsApi.buildRequests({ type: 'IMAGE_RESIZE' }, { startIndex: 1, endIndex: 2 }), null);
});

console.log('docsApi.test.js: all assertions passed');
