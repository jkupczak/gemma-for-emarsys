const s = document.createElement('script');
s.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(s);
s.onload = () => s.remove();


window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data.type === "__CAMPAIGN_UPDATED__") {
      const campaign = event.data.campaign;
      console.log("CAMPAIGN (live update):", campaign);
  
      // You can send this to background or do anything you want
    }
  });
  