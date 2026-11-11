/**
 * BEFN / Meta App Review: threads_profile_discovery permission-specific test.
 *
 * Performs only read-only requests against Meta's documented profile endpoints.
 * Logs HTTP/status/error codes, never tokens, account IDs, body contents or posts.
 * Without advanced access, official Meta profile @threads is a valid standard-access
 * test target; unrelated public profiles remain inaccessible until App Review.
 *
 * This is a manual-only workflow: no scheduled API spend or surprise failure emails.
 */
const TOKEN = (process.env.THREADS_ACCESS_TOKEN || '').trim();
const HOST = 'https://graph.threads.net/v1.0';
if (!TOKEN) {
  console.error('THREADS_PROFILE_TEST: NOT_CONFIGURED — GitHub Actions secret THREADS_ACCESS_TOKEN is missing.');
  process.exitCode = 1;
} else {
  async function request(label, path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(HOST + path, {
        headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' },
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      const ok = response.ok && !body.error;
      const errorCode = Number.isInteger(body?.error?.code) ? ' meta_code=' + body.error.code : '';
      const errorSubcode = Number.isInteger(body?.error?.error_subcode) ? ' meta_subcode=' + body.error.error_subcode : '';
      console.log('THREADS_' + label + ': ' + (ok ? 'OK' : 'FAILED') +
        ' HTTP=' + response.status + errorCode + errorSubcode);
      return { ok, body: ok ? body : null };
    } catch {
      console.log('THREADS_' + label + ': FAILED HTTP=0 (network or timeout)');
      return { ok: false, body: null };
    } finally {
      clearTimeout(timeout);
    }
  }
  const basic = await request('BASIC_PROFILE', '/me?fields=id');
  if (!basic.ok) {
    console.error('THREADS_PROFILE_TEST: NOT_COMPLETED — token or threads_basic access unavailable.');
    process.exitCode = 1;
  } else {
    // Official Meta account is documented to work with standard access.
    // This is deliberately not a fighter profile; advanced access is required
    // to retrieve ordinary third-party fighters' public profiles and posts.
    const profile = await request('DISCOVERY_PROFILE', '/profile_lookup?username=threads');
    const posts = await request('DISCOVERY_POSTS', '/profile_posts?username=threads&fields=id,username,permalink,timestamp&limit=3');
    if (profile.ok && posts.ok) {
      console.log('THREADS_PROFILE_TEST: BOTH_ENDPOINTS_OK — profile lookup and public profile posts accepted.');
      console.log('META_REVIEW: Check Meta App Dashboard > Testing for the 1/1 permission-specific API call (Meta says it may take up to 24 hours).');
      console.log('META_REVIEW: This verifies API calls only, not third-party advanced access, OAuth UI, screencast or app approval.');
    } else if (profile.ok) {
      console.log('THREADS_PROFILE_TEST: PROFILE_LOOKUP_OK — qualifying permission-specific request succeeded; public-post lookup was unavailable.');
      console.log('META_REVIEW: Check Meta App Dashboard > Testing for the 1/1 counter (may take up to 24 hours).');
    } else {
      console.error('THREADS_PROFILE_TEST: NOT_COMPLETED — verify token scopes, app ID, role, access level and Meta API restrictions.');
      process.exitCode = 1;
    }
  }
}
