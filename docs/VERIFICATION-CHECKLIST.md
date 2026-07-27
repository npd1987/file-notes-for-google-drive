# Phase 2 — OAuth verification, step by step

Companion to [SHARING-PLAN.md](SHARING-PLAN.md), which covers *whether* to do
this. This covers *how*. Read the decision material there first; the
recommendation is still that you may never need this.

Verified against Google and App Defense Alliance documentation on
**27 Jul 2026**. This process changes; re-check anything that looks off.

---

## The two things that surprised us

**1. You do not initiate CASA. Google does.**

You cannot buy an assessment up front to get ahead of the queue. The sequence
is: you submit for verification, Google decides whether your app is in scope,
and *if it is*, you receive an email telling you a Tier 2 assessment is
required. Only then do you engage a lab.

That means the no-server argument in
[SHARING-PLAN.md:137](SHARING-PLAN.md) gets tested for free. You submit,
and either the CASA notification arrives or it doesn't.

The one exception is a **Self-Initiated Assessment**, which is validated only
at Tier 3, the expensive full-penetration-test tier. There is no reason to
choose that voluntarily.

**2. Self-scanning is deprecated.**

[SHARING-PLAN.md:129](SHARING-PLAN.md) already recorded this and it is still
true. The free do-it-yourself path is gone. If Tier 2 is triggered, an
authorized lab has to validate it.

---

## Prerequisites — do these before anything else

- [ ] **Get a domain and put a real homepage on it.** Google requires a
      homepage that is publicly accessible, not behind a login, clearly
      related to the app, and containing an app description plus a link to
      the privacy policy. **A Chrome Web Store listing does not satisfy
      this.**

- [ ] **Move the privacy policy onto that same domain.** The current policy is
      a published Google Doc (see [HANDOFF.md:25](HANDOFF.md)). Google
      requires the privacy policy be hosted **on the same domain as the
      homepage**, so the Doc will not pass as-is. Content can stay the same;
      it needs a new home.

  > This is the single biggest blocker. Everything else here is process; this
  > is work. Budget a cheap domain and a static page.

- [ ] **Confirm the privacy policy discloses Google user data handling
      specifically** — how the app accesses, uses, stores and shares it, and
      that use is limited to what the policy discloses.

---

## Phase A — Brand verification

Comes first and gates everything else. Roughly **2 to 3 business days**.

- [ ] Open the **Google Auth Platform** section of the Cloud Console for the
      Drive Notes project.
- [ ] Confirm the app name, support email, logo and the homepage URL from the
      prerequisites above.
- [ ] Submit for brand verification and wait for it to clear before moving on.

---

## Phase B — Record the demo video

Do this while brand verification is pending.

The video must be uploaded to **YouTube** with **Unlisted** visibility. It has
to be in **English**.

It must show, on camera, all of:

- [ ] The complete OAuth flow end to end, including sign-in and consent.
- [ ] The consent screen displaying **the correct app name**.
- [ ] **The browser address bar showing your OAuth client ID.** This is the
      one people miss. Zoom in or widen the window so the `client_id=` value
      in the URL is legible.
- [ ] A demonstration of **how each restricted scope is actually used**. For
      this app that means `drive.metadata`: show Alt + right-click on a Drive
      file, the note box opening with the existing description loaded, typing,
      saving, and the description then visible in Drive's own details panel.
- [ ] Ideally, follow it with a Drive search that finds the file by a word
      that exists only in the description. That demonstrates *why* the scope
      is needed, which is the question a reviewer is actually asking.

Keep it unedited and continuous if you can. Reviewers are checking that the
client ID on screen matches the app being reviewed.

---

## Phase C — Submit for data access verification

- [ ] Go to the **Verification Center** in the Cloud Console.
- [ ] Use **Add or remove scopes** and declare `.../auth/drive.metadata`.
      Declare nothing you do not use.
- [ ] Provide the demo video link.
- [ ] Provide up to **three links to feature documentation**. Use the Chrome
      Web Store listing, the new homepage, and the privacy policy.
- [ ] Answer the compliance questions.
- [ ] Submit.

**Expect several weeks.** Restricted scopes are reviewed closely.

### If they challenge the scope

The likeliest objection is "why not `drive.file`, which is narrower?" Google's
requirements page says you must request the narrowest scope that works.

You have a prepared rebuttal at the bottom of
[../store/LISTING.md](../store/LISTING.md), on Google's own authority: picking
a folder does not grant access to files inside it, so `drive.file` cannot
support right-click annotation of an arbitrary file. Cite it directly. See
also [SHARING-PLAN.md:179](SHARING-PLAN.md) for the full closed
investigation, so you do not re-derive it under time pressure.

---

## Phase D — Only if a CASA notification arrives

If Google determines the app is in scope, you get an email. If no email
arrives, the no-server argument won, and you are done.

- [ ] **Run the CASA Accelerator first.** You enter your app type, any
      security frameworks you use, and your application security testing (AST)
      tooling. It returns a shortened list of requirements and a set of CWEs
      to load into a scan policy. It exists to reduce how much you have to
      prove, so do not skip it.

- [ ] **Understand the bar.** CASA maps to **OWASP ASVS v4.0**, 134
      requirements total. Functional ones are evidenced by AST scans;
      non-functional ones by certifications and developer self-attestation.

- [ ] **Engage an authorized lab.** These are the only labs permitted to
      validate a CASA assessment:

  | Lab | Note |
  |---|---|
  | TAC Security | The one Google negotiated a discount with. Portal at `casa.tacsecurity.com`. Start here. |
  | Bishop Fox | |
  | KPMG | |
  | Leviathan Security | |
  | NCC Group | |
  | NetSentries Technologies | |
  | Orange Cyberdefense South Africa | |
  | Prescient Security LLC | |
  | DEKRA | |

  > None of them publish pricing. The ~$540 Tier 2 figure in
  > [SHARING-PLAN.md:125](SHARING-PLAN.md) came from earlier research, not
  > from a lab's public rate card. **Get quotes from three before committing.**

- [ ] Submit scan results and evidence to the lab.
- [ ] Receive the **Letter of Assessment (LOA)**.

- [ ] **Diarise the renewal.** Reverification and a fresh assessment are
      required **every 12 months from the LOA approval date**. This is the
      recurring cost, and missing it puts you back where you started.

---

## What you get for it

- The **"Google hasn't verified this app"** screen disappears.
- The **100-user cap** lifts. That cap is lifetime and non-resettable, so this
  is the only way past it.

## What it does not change

- Chrome Web Store review. Separate process, already passed.
- The scope itself. You still hold `drive.metadata` and still get scrutiny on
  every future submission.

---

## Sources

- [Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [CASA assurance levels](https://appdefensealliance.dev/casa/casa-tiering)
- [CASA Tier 2 getting started](https://appdefensealliance.dev/casa/tier-2/getting-started)
- [CASA authorized assessors](https://appdefensealliance.dev/casa/casa-assessors)
- [Security assessment (Cloud Console Help)](https://support.google.com/cloud/answer/13465431?hl=en)
