# Media access and photo-permission requests

Drafted 25 Nov 2026 for the owner to send. Nothing here has been sent. Fill the `[square brackets]` first.

**What we are asking for.** A media credential gets a reporter into an event. What BEFN needs is mainly the right to publish promotional images, including full-body studio shots, with credit. Every email below asks for two things:
1. access to the promoter's media or press-image portal (or the press list that sends image galleries);
2. written permission to publish those images on BEFN with the promoter credited.

Keep every reply. A written "yes" is the attestation the photo runner records (`--attest "owner, YYYY-MM-DD: <who> confirmed by email that …"`).

## Before sending: checklist

- [ ] **About page live** at `/about.html`, drafted alongside this file. Fill its contact line first.
- [ ] **A contact email on a domain you control.** A free webmail address reads as less credible to PR teams.
- [ ] **Audience figures** you can stand behind (monthly visitors, social followers). Send only real numbers, or leave the line out.
- [ ] **Two or three links** to your best BEFN pages: a fight card, a results page, the Analysis page.
- [ ] **Your name and role** (for example Editor), and where you're based (BEFN's footer says Melbourne, Australia).

## Facts used in every email

- Black Eye Fight News (BEFN) is an independent, non-commercial combat sports site covering boxing, MMA and sumo, based in Melbourne, Australia.
- It is not affiliated with any promoter, sanctioning body or broadcaster.
- Every fighter photo is credited and listed with its source on a public credits page (`/boxing-photo-credits.html`, `/mma-photo-credits.html`, `/sumo-photo-credits.html`).
- BEFN publishes only results and records it can tie to a source, and corrects or removes content on request.

---

## 1. UFC (TKO): media relations

**To:** UFC media relations / communications (use the press contact listed on ufc.com; if none is listed, ask TKO corporate communications for the right address)
**Subject:** Media and photo access request: Black Eye Fight News (Australia)

> Hello UFC media team,
>
> My name is [YOUR NAME], [ROLE] of Black Eye Fight News (BEFN), an independent, non-commercial combat sports site based in Melbourne, Australia: [SITE URL]
>
> BEFN covers UFC cards, results, champions and fighter profiles, with every fact tied to a source and every image credited on a public credits page. We'd like to apply for:
>
> 1. **Access to UFC's media portal / press image library**, so our fighter profiles and champions pages can use official UFC athlete photography, including the full-body studio portraits.
> 2. **Written permission to publish those images on BEFN**, credited to UFC, for editorial use on fighter and event pages.
> 3. If you accredit online outlets, **media credentials** for future events, and inclusion on your press release list.
>
> About BEFN: [ONE LINE OF AUDIENCE FIGURES, OR DELETE]. Examples of our coverage: [LINK 1], [LINK 2]. About us and our editorial policy: [SITE URL]/about.html
>
> We're happy to agree to UFC's usage terms and credit format. If photo use is handled through Getty Images instead, could you point us to the right contact?
>
> Thank you,
> [YOUR NAME]
> [ROLE], Black Eye Fight News
> [EMAIL] · [SITE URL]

## 2. Getty Images: UFC photo licensing (fallback)

**To:** Getty Images editorial licensing / sales (via the "Contact us" form on gettyimages.com)
**Subject:** Editorial licensing quote: UFC athlete portraits for a small independent site

> Hello,
>
> I run Black Eye Fight News, a small independent, non-commercial combat sports site in Australia ([SITE URL]). We'd like a quote for editorial web use of official UFC athlete portraits (full-body studio shots) for about [NUMBER] fighters, shown on fighter profile and champions pages with credit.
>
> Could you tell me what licence options exist for a site of our size: per image, or a subscription/pack?
>
> Thanks,
> [YOUR NAME] · [EMAIL]

## 3. Boxing promoters: one template, sent to each

Send one per promoter. Change the **bold** parts.

| Promoter | Who to email | Notes |
| --- | --- | --- |
| Matchroom Boxing | Media / press contact on matchroomboxing.com; accreditation is announced per event | We already use Matchroom event-page photos under your 22 Nov attestation; ask for a written confirmation plus portal access |
| Top Rank | Top Rank PR / communications | You attested Top Rank on 24 Nov; ask for written confirmation plus portal access |
| Premier Boxing Champions (PBC) | PBC PR / media relations | Their site refuses automated access (HTTP 403), so written permission is the only route |
| Most Valuable Promotions (MVP) | MVP PR / media relations | Their robots.txt bars AI crawlers; written permission is the only route |
| Queensberry Promotions | Queensberry PR / media | No public roster site; ask for their press-image folder |
| BOXXER | BOXXER PR / media | We use one BOXXER photo already |
| Golden Boy Promotions | Golden Boy PR / media | Optional |

**Subject:** Press-image access request: Black Eye Fight News (Australia)

> Hello **[PROMOTER]** media team,
>
> My name is [YOUR NAME], [ROLE] of Black Eye Fight News (BEFN), an independent, non-commercial boxing and MMA site based in Melbourne, Australia: [SITE URL]
>
> We cover **[PROMOTER]** cards, results and champions, and we'd like to:
>
> 1. **Join your press list and get access to your press-image library**, including fighter portraits (full-body studio shots where you have them);
> 2. **Have written permission to publish those images on BEFN, credited to [PROMOTER]**, on fighter profiles, fight cards and our champions page.
>
> Every image we publish is credited and listed with its source on our public credits page ([SITE URL]/boxing-photo-credits.html), and we remove anything on request.
>
> **[Matchroom / Top Rank only: We already show a few photos from your public event pages, credited to you. We'd appreciate a written OK for that too.]**
>
> About us and our editorial policy: [SITE URL]/about.html · Examples: [LINK 1], [LINK 2]
>
> Thank you,
> [YOUR NAME]
> [ROLE], Black Eye Fight News
> [EMAIL] · [SITE URL]

## 4. MMA promoters you've attested: written confirmation

You attested PFL, ONE Championship, KSW, RIZIN and Cage Warriors press and media photos on 24 Nov 2026. A short confirming email from each one firms that up. Ask Cage Warriors for image access too, because their site refuses automated requests.

**Subject:** Confirming photo use: Black Eye Fight News (Australia)

> Hello **[PROMOTER]** media team,
>
> I'm [YOUR NAME] of Black Eye Fight News, an independent, non-commercial combat sports site in Melbourne, Australia ([SITE URL]).
>
> We show **[PROMOTER]** fighter portraits from your official athlete pages on our fighter and fight-card pages, always credited to **[PROMOTER]** and listed on our credits page: [SITE URL]/mma-photo-credits.html
>
> Could you confirm in writing that this editorial use is OK? If you have a media portal with higher-resolution or full-body portraits, we'd be glad to use those instead. **[Cage Warriors only: your website doesn't allow automated access, so a press-image folder or portal would be the only way for us to show your fighters.]**
>
> Happy to change the credit format or remove anything you'd prefer we didn't use.
>
> Thanks,
> [YOUR NAME] · [ROLE], Black Eye Fight News · [EMAIL]

---

## After a reply

- **Yes:**
  - save the email;
  - drop the images into a folder named by fighter;
  - run `python3 scripts/photo-runner.py drop <folder> --sport <sport> --credit "<Promoter>" --attest "owner, <date>: <who> confirmed by email that …"` (add `--kind fullbody` for full-body shots);
  - approve from the contact sheet.
- **No, or no reply after two weeks:** note it in `docs/design/IMAGE-GUIDE.md` so the source isn't chased again, and stay on the current photos.
