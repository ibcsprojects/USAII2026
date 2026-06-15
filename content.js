function createSuggestionBar() {
  const bar = document.createElement('div');
  bar.id = 'custom-suggestion-bar';
  bar.innerHTML = `
    <span>We found a suggestion for your text: "<strong>Example Suggestion</strong>"</span>
    <div class="suggestion-actions">
      <button class="btn-accept">Accept</button>
      <button class="btn-reject">Reject</button>
    </div>
  `;

  document.body.prepend(bar);

  bar.querySelector('.btn-accept').addEventListener('click', () => {
    applySuggestion();
    bar.remove();
  });

  bar.querySelector('.btn-reject').addEventListener('click', () => {
    bar.remove();
  });
}

function applySuggestion() {
  const editor = document.querySelector('.docs-kix-editor');
  if (editor) {

  }
}

createSuggestionBar();