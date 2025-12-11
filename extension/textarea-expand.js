function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto'; // reset height
  textarea.style.height = (textarea.scrollHeight + 3) + 'px'; // fit content
}

// Apply to existing textareas
document.querySelectorAll('.e-input.e-input-textarea').forEach(textarea => {
  autoResizeTextarea(textarea);
  textarea.addEventListener('input', () => autoResizeTextarea(textarea));
});

// Observe the DOM for newly added textareas
const observer = new MutationObserver(mutations => {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.nodeType === 1) { // Element node
        // Direct match
        if (node.matches('.e-input.e-input-textarea')) {
          autoResizeTextarea(node);
          node.addEventListener('input', () => autoResizeTextarea(node));
        }
        // Nested match
        node.querySelectorAll('.e-input.e-input-textarea').forEach(textarea => {
          autoResizeTextarea(textarea);
          textarea.addEventListener('input', () => autoResizeTextarea(textarea));
        });
      }
    });
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});
