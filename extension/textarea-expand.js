function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto'; // reset height
  textarea.style.height = (textarea.scrollHeight + 30) + 'px'; // fit content
}

// Apply to existing textareas
document.querySelectorAll('.e-input.e-input-textarea').forEach(textarea => {
  autoResizeTextarea(textarea);
  textarea.addEventListener('input', () => autoResizeTextarea(textarea));
});

// Observe the DOM for newly added textareas
window.gemDomWatchSubscribe(function (mutations) {
  mutations.forEach(function (mutation) {
    mutation.addedNodes.forEach(function (node) {
      if (node.nodeType === 1) {
        if (node.matches('.e-input.e-input-textarea')) {
          autoResizeTextarea(node);
          node.addEventListener('input', function () { autoResizeTextarea(node); });
        }
        node.querySelectorAll('.e-input.e-input-textarea').forEach(function (textarea) {
          autoResizeTextarea(textarea);
          textarea.addEventListener('input', function () { autoResizeTextarea(textarea); });
        });
      }
    });
  });
});
