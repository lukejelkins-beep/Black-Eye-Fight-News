/**
 * Credential-safe Threads Graph API diagnostic.
 * No access token, account identifiers, post text or author handles are logged.
 * A successful keyword request may only search the owner's posts until Meta grants advanced access.
 */
const token = (process.env.THREADS_ACCESS_TOKEN || '').trim();
if (!token) {
  console.log('THREADS_TOKEN: NOT_CONFIGURED');
  process.exitCode = 1;
} else {
  const probe = async (name, url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, {
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        signal: controller.signal,
      });
      const body = await res.json().catch(() => ({}));
      const ok = res.ok && !body.error;
      console.log('THREADS_PROBE ' + name + ' ' + (ok ? 'OK' : 'UNAVAILABLE') +
        ' HTTP=' + res.status +
        (Number.isInteger(body?.error?.code) ? ' code=' + body.error.code : '') +
        (Number.isInteger(body?.error?.error_subcode) ? ' subcode=' + body.error.error_subcode : ''));
      return ok;
    } catch {
      console.log('THREADS_PROBE ' + name + ' UNAVAILABLE HTTP=0');
      return false;
    } finally {
      clearTimeout(timeout);
    }
  };
  const me = await probe('own-profile', 'https://graph.threads.net/v1.0/me?fields=id,username');
  if (!me) {
    console.log('THREADS_RESULT: TOKEN_NOT_ACCEPTED_OR_LACKS_BASIC_ACCESS');
    process.exitCode = 1;
  } else {
    console.log('THREADS_RESULT: BASIC_ACCOUNT_CONNECTION_OK');
    const params = new URLSearchParams({q: 'boxing', search_type: 'RECENT', search_mode: 'KEYWORD', fields: 'id,username,timestamp,permalink,text', limit: '5'});
    const search = await probe('keyword-search', 'https://graph.threads.net/v1.0/keyword_search?' + params);
    console.log(search
      ? 'THREADS_PUBLIC_DISCOVERY: KEYWORD_ENDPOINT_ACCEPTED; THIRD_PARTY_SEARCH_STILL_REQUIRES_ADVANCED_APP_REVIEW'
      : 'THREADS_PUBLIC_DISCOVERY: KEYWORD_SEARCH_UNAVAILABLE; CHECK_PERMISSION_AND_APP_REVIEW');
  }
}
