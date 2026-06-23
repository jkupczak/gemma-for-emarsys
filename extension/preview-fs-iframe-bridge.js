(function () {
  'use strict';

  var MESSAGE_SOURCE = 'gem-preview-fs-iframe';
  var TEMPLATING_ALERT = 'Error in templating';

  function getCampId() {
    try {
      return new URL(window.location.href).searchParams.get('camp_id') || '';
    } catch (_) {
      return '';
    }
  }

  function notifyParent(reason) {
    var campId = getCampId();
    if (!campId) return;
    try {
      window.parent.postMessage(
        {
          source: MESSAGE_SOURCE,
          campId: campId,
          reason: reason || 'templating',
        },
        window.location.origin
      );
    } catch (_) {}
  }

  var origAlert = window.alert;
  window.alert = function (msg) {
    if (String(msg || '') === TEMPLATING_ALERT) {
      notifyParent('templating');
      return;
    }
    return origAlert.apply(this, arguments);
  };
})();
