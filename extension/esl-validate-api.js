console.log('[Gem] esl-validate-api.js loaded');

(function () {
  'use strict';

  if (window.__gemEslValidateApiInstalled) return;
  window.__gemEslValidateApiInstalled = true;

  const INTEGRATION = 'personalization-editor';
  const VALIDATE_HOST = 'https://personalization-editor.gservice.emarsys.net';
  const TOKEN_EXPIRY_SKEW_SEC = 60;
  const PAGE_FETCH_TIMEOUT_MS = 20000;

  let cachedToken = '';
  let cachedTokenExp = 0;
  let cachedCustomerId = '';
  let pageCustomerIdPromise = null;

  function getSessionId() {
    try {
      return (new URL(window.location.href).searchParams.get('session_id') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function decodeJwtPayload(token) {
    const parts = String(token || '').trim().split('.');
    if (parts.length < 2) return null;
    try {
      let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const pad = payload.length % 4;
      if (pad) payload += '='.repeat(4 - pad);
      return JSON.parse(atob(payload));
    } catch (_) {
      return null;
    }
  }

  function getCustomerIdFromJwt(token) {
    const payload = decodeJwtPayload(token);
    if (!payload || payload.customerId == null) return '';
    return String(payload.customerId).trim();
  }

  function getTokenExpiry(token) {
    const payload = decodeJwtPayload(token);
    const exp = payload && Number(payload.exp);
    return Number.isFinite(exp) ? exp : 0;
  }

  function getCustomerIdFromIsolatedWorld() {
    try {
      if (window.e && window.e.config && window.e.config.customerId != null) {
        return String(window.e.config.customerId).trim();
      }
      if (window.e && window.e.utils && typeof window.e.utils.getCurrentConfig === 'function') {
        const cfg = window.e.utils.getCurrentConfig();
        if (cfg && cfg.customerId != null) {
          return String(cfg.customerId).trim();
        }
      }
      if (window.contentBlocks && window.contentBlocks.config && window.contentBlocks.config.customerId != null) {
        return String(window.contentBlocks.config.customerId).trim();
      }
    } catch (_) {}
    return '';
  }

  function getCustomerIdFromDom() {
    try {
      const scripts = document.querySelectorAll('script:not([src])');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (!text.includes('customerId') && !text.includes('/validate')) continue;

        const contentBlocksMatch = text.match(
          /contentBlocks\.config\s*=\s*\{[\s\S]*?customerId\s*:\s*['"]?(\d+)['"]?/
        );
        if (contentBlocksMatch) return contentBlocksMatch[1];

        const eConfigMatch = text.match(
          /window\.e\.config\s*=\s*\{[\s\S]*?"customerId"\s*:\s*(\d+)/
        );
        if (eConfigMatch) return eConfigMatch[1];

        const jwtUrlMatch = text.match(
          /personalization-editor\.gservice\.emarsys\.net[^"']*customer_id=(\d+)/
        );
        if (jwtUrlMatch) return jwtUrlMatch[1];

        const twigValidateMatch = text.match(
          /personalization-editor\.gservice\.emarsys\.net\/customer\/(\d+)\/validate/
        );
        if (twigValidateMatch) return twigValidateMatch[1];
      }
    } catch (_) {}
    return '';
  }

  function getCustomerIdFromPageWorld() {
    if (cachedCustomerId) return Promise.resolve(cachedCustomerId);
    if (pageCustomerIdPromise) return pageCustomerIdPromise;

    pageCustomerIdPromise = new Promise(function (resolve) {
      const requestId = 'gem-esl-cid-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      let settled = false;

      function finish(id) {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        const value = String(id || '').trim();
        if (value) cachedCustomerId = value;
        resolve(value);
      }

      function onMessage(event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== 'gem-esl-customer-id' || data.requestId !== requestId) return;
        finish(data.id);
      }

      window.addEventListener('message', onMessage);
      const timer = setTimeout(function () {
        finish('');
      }, 1500);

      const script = document.createElement('script');
      script.textContent =
        '(function(){var id="";try{id=String((window.customer&&window.customer.id)||(window.e&&window.e.config&&window.e.config.customerId)||(window.contentBlocks&&window.contentBlocks.config&&window.contentBlocks.config.customerId)||"");}catch(e){}window.postMessage({source:"gem-esl-customer-id",requestId:' +
        JSON.stringify(requestId) +
        ',id:id},"*");})();';
      (document.documentElement || document.head || document.body).appendChild(script);
      script.remove();
    }).finally(function () {
      pageCustomerIdPromise = null;
    });

    return pageCustomerIdPromise;
  }

  function tokenIsFresh(token) {
    if (!token) return false;
    const now = Date.now() / 1000;
    const exp = cachedToken === token ? cachedTokenExp : getTokenExpiry(token);
    if (!exp) return true;
    return exp - TOKEN_EXPIRY_SKEW_SEC > now;
  }

  function rememberToken(token) {
    const bare = String(token || '').trim().replace(/^Bearer\s+/i, '');
    cachedToken = bare;
    cachedTokenExp = getTokenExpiry(bare);
    const fromJwt = getCustomerIdFromJwt(bare);
    if (fromJwt) cachedCustomerId = fromJwt;
    return bare;
  }

  function clearTokenCache() {
    cachedToken = '';
    cachedTokenExp = 0;
  }

  function fetchToken(sessionId) {
    if (tokenIsFresh(cachedToken)) {
      return Promise.resolve(cachedToken);
    }
    if (typeof window.gemFetchGserviceToken !== 'function') {
      return Promise.resolve('');
    }
    return window.gemFetchGserviceToken(sessionId, INTEGRATION).then(function (token) {
      if (!token) return '';
      return rememberToken(token);
    });
  }

  function fetchFromPageContext(url, options) {
    return new Promise(function (resolve, reject) {
      const requestId = 'gem-esl-gfetch-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      let settled = false;
      const method = (options && options.method) || 'GET';
      const headers = (options && options.headers) || {};
      const body =
        options && options.body != null
          ? typeof options.body === 'string'
            ? options.body
            : JSON.stringify(options.body)
          : null;

      function finish(result, isError) {
        if (settled) return;
        settled = true;
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        if (isError) reject(result);
        else resolve(result);
      }

      function onMessage(event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== 'gem-esl-gservice-page-fetch' || data.requestId !== requestId) {
          return;
        }
        finish(data, false);
      }

      window.addEventListener('message', onMessage);
      const timer = setTimeout(function () {
        finish(new Error('page context fetch timeout'), true);
      }, PAGE_FETCH_TIMEOUT_MS);

      const script = document.createElement('script');
      script.textContent =
        '(function(){var u=' +
        JSON.stringify(url) +
        ';var h=' +
        JSON.stringify(headers) +
        ';var m=' +
        JSON.stringify(method) +
        ';var b=' +
        JSON.stringify(body) +
        ';var init={method:m,headers:h,credentials:"include"};if(b!=null)init.body=b;fetch(u,init)' +
        '.then(function(r){return r.text().then(function(t){var d=null;try{d=JSON.parse(t);}catch(e){}return{ok:r.ok,status:r.status,data:d};});})' +
        '.then(function(r){window.postMessage({source:"gem-esl-gservice-page-fetch",requestId:' +
        JSON.stringify(requestId) +
        ',ok:r.ok,status:r.status,data:r.data},"*");})' +
        '.catch(function(e){window.postMessage({source:"gem-esl-gservice-page-fetch",requestId:' +
        JSON.stringify(requestId) +
        ',ok:false,error:e&&e.message?e.message:String(e)},"*");});})();';
      (document.documentElement || document.head || document.body).appendChild(script);
      script.remove();
    });
  }

  function normalizeErrors(data) {
    const raw = data && Array.isArray(data.errors) ? data.errors : [];
    return raw
      .map(function (item) {
        if (!item || typeof item !== 'object') return null;
        const reasonText = String(item.reason_text || item.message || '').trim();
        if (!reasonText) return null;
        return {
          reason_text: reasonText,
          reason_code: String(item.reason_code || '').trim(),
          template_name: String(item.template_name || '').trim(),
        };
      })
      .filter(Boolean);
  }

  function unavailableResult(extra) {
    return Object.assign(
      {
        status: 'unavailable',
        errors: [],
        raw: null,
      },
      extra || {}
    );
  }

  function getValidatePayload(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
    if (Array.isArray(data.errors) || Array.isArray(data.results)) return data;
    if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
      if (Array.isArray(data.data.errors) || Array.isArray(data.data.results)) {
        return data.data;
      }
    }
    return data;
  }

  function parseValidateResponse(res, data) {
    const payload = getValidatePayload(data);
    const errors = normalizeErrors(payload);
    if (errors.length) {
      return {
        status: 'fail',
        errors: errors,
        raw: data,
      };
    }
    if (!res || !res.ok) {
      return unavailableResult({
        reason: 'api_error',
        httpStatus: res && res.status,
        raw: data,
      });
    }
    return {
      status: 'pass',
      errors: [],
      raw: data,
    };
  }

  function postValidate(customerId, token, templates, signal) {
    const url =
      VALIDATE_HOST +
      '/customer/' +
      encodeURIComponent(customerId) +
      '/validate';
    const headers = {
      accept: 'application/json, text/plain, */*',
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
    };
    const body = JSON.stringify({ templates: templates });

    console.log('[Gem][ESL] validate POST', url, '| templates:', templates.length);

    const fetchInit = {
      method: 'POST',
      headers: headers,
      body: body,
    };
    if (signal) fetchInit.signal = signal;

    return fetch(url, fetchInit)
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (data) {
            return { res: res, data: data };
          });
      })
      .then(function (result) {
        if (result.res && result.res.status === 401) {
          return { unauthorized: true, result: result };
        }
        return { unauthorized: false, parsed: parseValidateResponse(result.res, result.data) };
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') {
          return { aborted: true };
        }
        console.warn(
          '[Gem][ESL] content-script validate failed:',
          err && err.message ? err.message : String(err)
        );
        return fetchFromPageContext(url, { method: 'POST', headers: headers, body: body })
          .then(function (pageRes) {
            if (pageRes.error) {
              return { parsed: unavailableResult({ reason: 'fetch_error', error: pageRes.error }) };
            }
            if (pageRes.status === 401) {
              return { unauthorized: true, result: { res: pageRes, data: pageRes.data } };
            }
            return {
              parsed: parseValidateResponse(
                { ok: pageRes.ok, status: pageRes.status },
                pageRes.data
              ),
            };
          })
          .catch(function (pageErr) {
            return {
              parsed: unavailableResult({
                reason: 'fetch_error',
                error: pageErr && pageErr.message ? pageErr.message : String(pageErr),
              }),
            };
          });
      });
  }

  function resolveAuth(sessionId) {
    const sid = String(sessionId || getSessionId() || '').trim();
    if (!sid) {
      return Promise.resolve({ ok: false, reason: 'missing_session' });
    }

    return fetchToken(sid).then(function (token) {
      if (!token) {
        return { ok: false, reason: 'no_auth_token' };
      }

      const localId =
        cachedCustomerId || getCustomerIdFromIsolatedWorld() || getCustomerIdFromDom() || getCustomerIdFromJwt(token);

      const idPromise = localId
        ? Promise.resolve(localId)
        : getCustomerIdFromPageWorld().then(function (pageId) {
            return pageId || getCustomerIdFromJwt(token);
          });

      return idPromise.then(function (customerId) {
        if (!customerId) {
          return { ok: false, reason: 'missing_customer_id', token: token };
        }
        cachedCustomerId = customerId;
        return { ok: true, token: token, customerId: customerId, sessionId: sid };
      });
    });
  }

  function normalizeTemplates(templates) {
    const list = Array.isArray(templates) ? templates : [];
    return list
      .map(function (item, index) {
        const name = String((item && item.name) || 'template' + (index + 1)).trim() || 'template1';
        const text = String((item && item.text) || '');
        return { name: name, text: text };
      })
      .filter(function (item) {
        return item.text.trim().length > 0;
      });
  }

  function validateTemplates(templates, options) {
    const normalized = normalizeTemplates(templates);
    if (!normalized.length) {
      return Promise.resolve({
        status: 'empty',
        errors: [],
        raw: null,
      });
    }

    const signal = options && options.signal;
    const sessionId = options && options.sessionId;

    return resolveAuth(sessionId).then(function (auth) {
      if (!auth.ok) {
        return unavailableResult({ reason: auth.reason });
      }

      function send(token, isRetry) {
        return postValidate(auth.customerId, token, normalized, signal).then(function (outcome) {
          if (outcome.aborted) {
            return { status: 'aborted', errors: [], raw: null };
          }
          if (outcome.unauthorized && !isRetry) {
            clearTokenCache();
            return fetchToken(auth.sessionId).then(function (freshToken) {
              if (!freshToken) {
                return unavailableResult({ reason: 'no_auth_token', httpStatus: 401 });
              }
              return send(freshToken, true);
            });
          }
          if (outcome.unauthorized) {
            return unavailableResult({ reason: 'unauthorized', httpStatus: 401 });
          }
          return outcome.parsed || unavailableResult({ reason: 'unexpected_response' });
        });
      }

      return send(auth.token, false);
    });
  }

  window.gemValidateEsl = function gemValidateEsl(text, options) {
    const name = (options && options.name) || 'template1';
    return validateTemplates([{ name: name, text: text }], options);
  };

  window.gemValidateEslTemplates = validateTemplates;
})();
