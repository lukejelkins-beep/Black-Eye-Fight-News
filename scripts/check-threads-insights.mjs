/**
 * One-time, credential-safe Meta App Review diagnostics for threads_manage_insights.
 * Run only for an account that has explicitly authorised this app.
 * Does not publish profile IDs, usernames, tokens, post content or metric values.
 * A green GitHub workflow is NOT evidence that Meta counted an API call:
 * inspect the explicit THREADS_INSIGHTS_ACCOUNT result below.
 */
const token = (process.env.THREADS_ACCESS_TOKEN || '').trim();
if (!token) {
  console.log('THREADS_INSIGHTS_ACCOUNT: NOT_CONFIGURED (set the GitHub Actions secret THREADS_ACCESS_TOKEN)');
  process.exit(0);
}
const base = 'https://graph.threads.net/v1.0/';
async function probe(name, path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(base + path, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    const ok = res.ok && !json.error && (json.data !== undefined || json.id !== undefined);
    const code = Number.isInteger(json?.error?.code) ? ' code=' + json.error.code : '';
    console.log('THREADS_' + name + ': ' + (ok ? 'OK' : 'UNAVAILABLE') + ' HTTP=' + res.status + code);
    return { ok, json: ok ? json : null };
  } catch {
    console.log('THREADS_' + name + ': UNAVAILABLE (network/timeout)');
    return { ok: false, json: null };
  } finally {
    clearTimeout(timeout);
  }
}
const profile = await probe('BASIC_PROFILE', 'me?fields=id');
if (!profile.ok) {
  console.log('THREADS_INSIGHTS_ACCOUNT: NOT_COMPLETED (basic Threads authorisation unavailable)');
  process.exitCode = 1;
} else {
  // Profile-level metrics: reading this edge is the permission-specific test.
  const insights = await probe('INSIGHTS_ACCOUNT', 'me/threads_insights?metric=views');
  if (insights.ok) {
    console.log('META_REVIEW_INSIGHTS_TEST: SUCCESSFUL profile-insights endpoint call; check Meta Testing page for 1/1 (may take up to 24 hours).');
  } else {
    console.log('META_REVIEW_INSIGHTS_TEST: NOT_COMPLETED (check threads_manage_insights scope, token expiry, authorised user role and response code).');
    process.exitCode = 1;
  }
  // Optional second check: read post insights for a post owned by the authorised account.
  const ownPosts = await probe('OWN_POSTS', 'me/threads?fields=id&limit=5');
  const firstId = ownPosts.ok && Array.isArray(ownPosts.json?.data)
    ? ownPosts.json.data.find(p => typeof p.id === 'string' && /^[0-9]+$/.test(p.id))?.id
    : null;
  if (firstId) {
    const post = await probe('INSIGHTS_POST', encodeURIComponent(firstId) + '/insights?metric=likes,replies');
    console.log('THREADS_INSIGHTS_POST_STATUS: ' + (post.ok ? 'SUCCESSFUL' : 'NOT_COMPLETED'));
  } else {
    console.log('THREADS_INSIGHTS_POST_STATUS: SKIPPED (no accessible authored post)');
  }
}
