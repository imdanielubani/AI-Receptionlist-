---
name: business-research
description: Research a business type and the specific client before building their AI receptionist. Covers what calls to this kind of business sound like, what callers ask for, what booking needs, and what gets transferred or escalated. Then drafts the call flow, the prompt, and the functions the receptionist needs, and ends with at most six plain-language questions for the business owner. Use at the start of every client build, right after intake, and whenever a client changes what their business does. Reuses docs/industries/ when that business type was already researched.
---

# Business research

This runs before every build. It produces two things:
- **Reusable industry knowledge** in `docs/industries/`, learned once per business type.
- **Client-specific drafts** in `clients/<slug>/`, built on that knowledge.

It ends with up to six owner questions, then stops and waits.

## Inputs

- `clients/<slug>/brief.md`: what the operator said (business, type, location, website).
- `docs/platforms/<platform>.md` plus `<platform>/capabilities.md` and `custom-functions.md` for the platform we deploy on. They show which functions are native, integrations, or custom. If they're missing or stale, run `platform-research` first.

## Step 1: Industry knowledge (`docs/industries/<business-type>.md`)

Use a lowercase, hyphenated, specific name: `dental-clinic`, `hvac`, `personal-injury-law`, `hair-salon`.

- **Fresh** (Last verified ≤ 90 days ago, and it covers this client's country): use it as-is and skip to step 2.
- **Close but not exact** (e.g. orthodontics when we have `dental-clinic`): use it as the base, research only the differences, and add them as a `## Variant: <name>` section.
- **Missing, stale, or wrong country:** research it now.

### What to research

Run several searches in parallel. Use `extended` mode for compliance and for anything country-specific. Good sources:
- front-desk and receptionist training guides, and phone scripts for this industry
- answering-service and call-tracking vendors' industry pages (call mix, peak times, missed-call stats)
- industry associations
- regulators, for compliance
- forums and Reddit threads where owners and staff describe real calls
- reviews of similar businesses that mention the phone experience

Cite a source for every number and every compliance claim.

Cover all of the following.

**1. What the calls sound like**
- Who calls: new customers, existing customers, urgent cases, vendors, job seekers, spam and sales pitches.
- Caller mood: anxious, in pain, angry, rushed, price-shopping.
- How callers phrase things, and the words they use for services. These are often not the industry's own terms ("my tooth is killing me", not "acute pulpitis").
- Typical opening lines, and when calls peak (day, season, after-hours share).

**2. What callers ask for**
- The main reasons people call, roughly by frequency (high / medium / low): booking, rescheduling, prices, hours and location, "do you do X", insurance or payment, status of a job or case, emergencies.
- For each reason, list what a good receptionist answers directly and what it hands off.

**3. What booking needs**
- The fields needed to book: name, phone, reason, new or existing, insurance, address for on-site work, preferred time.
- Appointment types and their usual lengths, lead times, deposits, cancellation policy norms.
- The scheduling or practice-management software common in this industry (e.g. Dentrix or Open Dental for dental, ServiceTitan or Jobber for HVAC, Clio for law, Vagaro or Fresha for salons), and whether it has a usable API. This decides whether booking is native, an integration, or a custom function.

**4. What gets transferred or escalated**
- **Emergencies:** for each, the trigger words, what to do right now (tell the caller to dial the emergency number, transfer, alert the on-call person), and what to say.
- Must-reach-a-human cases: angry customers, billing disputes, complex questions, existing cases or jobs.
- Calls that should just become a message.
- After-hours norms.

**5. What a receptionist must never say or do**
- Compliance limits. Examples:
  - No medical or legal advice.
  - No diagnosis.
  - No price quotes beyond what the owner approves.
  - Privacy laws (HIPAA, GDPR, NDPR and the like) that limit what can be discussed or stored.
  - Identity checks before discussing an existing account.
  - Call-recording consent and disclosure rules for the client's country or state.
  - Rules about saying it's an AI.
- Phrasing that loses customers.

**6. Phrasing that works**
- Short example lines for: greeting, confirming details, de-escalating, emergency redirect, "I can't answer that, but...", and closing.

### Write the file

Use this structure:

```
# <Business type>
Last verified: YYYY-MM-DD · Countries covered: <list>

## Who calls and how it sounds
## Call reasons (by frequency)
## Booking requirements
## Common software and integrations
## Transfers, escalation and emergencies
## Never say / compliance
## Phrasing that works
## Default call flow for this business type
## Owner question bank
## Variant: <name>        (only when needed)
## Lessons from builds    (appended after each client goes live)
## Sources
```

**Owner question bank:** the unknowns that matter most for this business type, ranked, each with the usual answer. Every client in this industry starts from this list.

## Step 2: Research the specific client

Before asking the owner anything, find everything that's public:
- **Website:** services, prices shown, hours, locations, staff and practitioner names, booking link and the software it reveals, policies, FAQ, emergency info.
- **Google Business profile and maps:** hours, phone number, address, categories.
- **Reviews:** complaints about the phone ("never answers", "rude on the phone") and the questions people ask. These show what the receptionist must get right.
- **Social pages and directory listings:** check them for conflicts with the website (different hours, for example).

Record the facts with their source in the `## Research notes` section of `brief.md`. If two sources disagree, note that. It may be worth a question.

## Step 3: Draft the receptionist

Write three drafts in `clients/<slug>/receptionist/`. Each starts with `Status: DRAFT, pending owner answers`.

Wherever only the owner can fill in a gap, mark it `[[OWNER: <what's missing>]]` and also put in the default you'd use: `[[OWNER: emergency transfer number | default: take a message and text the owner]]`.

### `call-flow.md`

The full call path:
- greeting, then working out what the caller wants
- a branch for each call reason from step 1 that applies to this client, plus emergency, after-hours, spam or sales, angry caller, and "wants a human"
- closing

For each branch, give:
- what the receptionist collects
- which function fires (if any)
- what it says if that function fails
- how the call ends

Include a mermaid flowchart at the top.

### `prompt.md`

The system prompt, ready for the platform's chosen format. Check `docs/platforms/<platform>.md` for that format; on Retell it's a single prompt, or conversation flow when the call has clearly separate phases. Sections:

1. **Identity:** name, business, role, the fact that it's an AI if asked (follow the disclosure rules from step 1).
2. **Voice style** (spoken, not written):
   - short sentences, one question at a time
   - no lists or markdown
   - read numbers, dates and prices out naturally
   - repeat phone numbers and names back to confirm
   - match the caller's pace
3. **Business facts:** hours, address, services, prices it may quote, staff, policies. Use dynamic variables for anything that changes.
4. **What to do for each call reason:** mirror the call-flow branches.
5. **Escalation and emergencies:** exact triggers and actions.
6. **Never say / never do:** from the industry compliance list plus the client's own rules.
7. **Closing:** recap what happens next, then end the call.

Write it in the language and register the callers use, which can differ by country.

### `functions.md`

One row per action the receptionist takes:

`Function | When it fires | Inputs | Output used | Platform status (Native / Integration / Custom) | Notes`

- Take the status from the platform's `capabilities.md`.
- For each custom function, link the matching entry in `docs/platforms/<platform>/custom-functions.md`. If no entry exists, add one there, since it's reusable knowledge.
- Flag any integration that needs a one-time dashboard connection by the operator.

## Step 4: Ask the owner (six questions max)

1. **Collect the gaps.** Gather every `[[OWNER: ...]]` marker from the drafts, plus the industry question bank. Add the "Owner facts needed" list from each library skill the call flow uses (`receptionist-booking`, `-cancel-reschedule`, `-faq`, `-lead-capture`, `-transfer`, `-after-hours`).
2. **Remove what doesn't belong:**
   - anything step 2 already answered
   - anything technical (platform, voice, model, tools and similar are ours to decide; CLAUDE.md forbids asking them)
   - anything a safe default covers with low risk
3. **Rank** what's left by harm-if-wrong × how often it comes up. Emergency handling, who gets transfers, what prices may be quoted, and booking rules usually rank top.
4. **Merge** related gaps into one question where it reads naturally (e.g. "Who should urgent calls go to, and what number?").
5. **Keep the top six.** Each one is:
   - plain words, no jargon
   - answerable in one line
   - written with a suggested answer, so the owner can just reply "yes"
6. **Save** the questions in `brief.md` under `## Owner questions`. Present them to the operator in chat, formatted to forward as-is:

```
Questions for <owner/business> (reply "yes" to accept a suggestion):

1. <question>
   Suggested: <default>
...
```

Then list, in a single line, what you found yourself, so the operator can see what wasn't asked.

**Then stop and wait for the answers.** Don't build or deploy before they come back.

## Step 5: When the answers come back

1. **Record the answers** in `brief.md` next to each question.
2. **Update the drafts.** Replace every `[[OWNER: ...]]` with:
   - the owner's answer, or
   - for anything still unanswered, its default. List it under `## Assumptions` in `brief.md`, for the report's "Assumed" section.
3. **Remove the drafts' `DRAFT` status line.** The drafts are now ready for workflow step 4 (Build).
4. **Learn from the answers.** If an answer shows something general about the business type (a common policy, a better default, a question that turned out not to matter), update the industry file's question bank or defaults.
