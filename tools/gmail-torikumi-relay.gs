/**
 * BEFN Gmail → GitHub relay for next-day sumo torikumi (Google Apps Script).
 *
 * Runs inside the owner's own Google account on a time trigger (every 10 minutes), so it
 * needs no Google Cloud app, no OAuth client and no computer switched on. It looks only at
 * emails SENT FROM THE OWNER'S OWN ADDRESS with a subject like "BEFN torikumi 202611 day 12"
 * (the scheduled ChatGPT task sends these), copies the plain-text body into the repository's
 * data/sumo/email-inbox/ folder on the Sumo preview branch, then labels the thread so it is
 * never sent twice. The repository decides whether the email is valid; this script does not.
 *
 * Nothing else leaves the mailbox: no addresses, headers or other messages are copied.
 *
 * Setup (once):
 *  1. script.google.com → New project → paste this file → Save.
 *  2. Project Settings → Script properties → add GITHUB_TOKEN = a fine-grained GitHub token
 *     limited to the Black-Eye-Fight-News repository with "Contents: Read and write" only.
 *  3. Run relayTorikumi once from the editor and approve Google's permission screen.
 *  4. Triggers → Add trigger → relayTorikumi, time-driven, minutes timer, every 10 minutes.
 */
const REPO = 'lukejelkins-beep/Black-Eye-Fight-News';
const BRANCH = 'feat/sumo-section-test-20261114';
const LABEL = 'befn-torikumi-relayed';
const SUBJECT = /^BEFN torikumi (20\d{4}) day (\d{1,2})$/i;

function relayTorikumi() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Set the GITHUB_TOKEN script property first');
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const threads = GmailApp.search('from:me subject:"BEFN torikumi" newer_than:3d -label:' + LABEL, 0, 20);
  for (const thread of threads) {
    let ok = true;
    for (const msg of thread.getMessages()) {
      const subject = String(msg.getSubject() || '').replace(/\s+/g, ' ').trim();
      const m = SUBJECT.exec(subject);
      if (!m) continue;
      const day = ('0' + m[2]).slice(-2);
      const path = 'data/sumo/email-inbox/' + m[1] + '-day' + day + '-' + msg.getDate().getTime() + '.txt';
      const text = 'Subject: ' + subject + '\n\n' + msg.getPlainBody().replace(/\r/g, '') + '\n';
      const res = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/contents/' + path, {
        method: 'put',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
        payload: JSON.stringify({
          message: 'Relay torikumi email: ' + subject,
          content: Utilities.base64Encode(text, Utilities.Charset.UTF_8),
          branch: BRANCH
        }),
        muteHttpExceptions: true
      });
      const code = res.getResponseCode();
      // 201 = created. 422 = this exact file already exists (relayed before): also done.
      if (code !== 201 && code !== 422) { ok = false; console.warn('GitHub ' + code + ' for ' + path); }
    }
    if (ok) thread.addLabel(label);
  }
}
