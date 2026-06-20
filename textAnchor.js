(function (root) {
  function findOffsetsInCombinedText(combined, searchText, occurrenceIndex) {
    if (!searchText) return null;
    let fromIndex = 0;
    let matchIndex = -1;
    for (let i = 0; i <= occurrenceIndex; i++) {
      matchIndex = combined.indexOf(searchText, fromIndex);
      if (matchIndex === -1) return null;
      fromIndex = matchIndex + 1;
    }
    return { start: matchIndex, end: matchIndex + searchText.length };
  }

  function buildBoundaries(lengths) {
    let pos = 0;
    return lengths.map((len) => {
      const b = { start: pos, end: pos + len };
      pos += len;
      return b;
    });
  }

  function mapOffsetToNode(boundaries, offset) {
    for (let i = 0; i < boundaries.length; i++) {
      const b = boundaries[i];
      if (offset >= b.start && offset <= b.end) {
        return { nodeIndex: i, localOffset: offset - b.start };
      }
    }
    return null;
  }

  // nodeTexts: array of strings, one per DOM text node in document order.
  // Returns { start: {nodeIndex, localOffset}, end: {nodeIndex, localOffset} }
  // describing where searchText begins/ends across those nodes, or null.
  function locateText(nodeTexts, searchText, occurrenceIndex) {
    const combined = nodeTexts.join('');
    const match = findOffsetsInCombinedText(combined, searchText, occurrenceIndex || 0);
    if (!match) return null;
    const boundaries = buildBoundaries(nodeTexts.map((t) => t.length));
    const start = mapOffsetToNode(boundaries, match.start);
    const end = mapOffsetToNode(boundaries, match.end);
    if (!start || !end) return null;
    return { start, end };
  }

  const api = { findOffsetsInCombinedText, buildBoundaries, mapOffsetToNode, locateText };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GreenPagesTextAnchor = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
