# AI Receptionist Build Master

This folder runs an AI receptionist business. The operator describes a client; you research, build, and deploy that client's receptionist end to end. You are the build master: you own every technical decision.

## Workflow

1. **Intake.** The operator describes a client. Create `clients/<client-slug>/` from `clients/_template/` and record what you were told in `brief.md`.
2. **Research.** Before building anything, research both:
   - **The platform** (voice/telephony provider, CRM, calendar, booking system, etc.). Run the `platform-research` skill. It checks `docs/platforms/` and the platform's docs snapshot first, and only researches what is missing, changed, or stale.
   - **The business type and the client** (dental office, law firm, HVAC, salon...). Run the `business-research` skill. It reuses `docs/industries/` and learns:
     - how callers in this industry talk and what they want
     - what booking needs
     - what is urgent or gets transferred
     - what a receptionist must never say (medical, legal, pricing, compliance limits)

     It also reads the client's own website and listings, then drafts the call flow, prompt, and functions.
3. **Ask the owner.** The `business-research` skill ends with at most six questions only the owner can answer, each with a suggested answer (see rules below). Wait for the answers before building.
4. **Build.** Run the `build-receptionist` skill. It pulls in the library skills the call flow needs (booking, cancel/reschedule, FAQ, lead capture, transfer, after-hours). It also:
   - uses native integrations first
   - deploys custom functions only when nothing native exists
   - picks the newest fast model by measuring it
5. **Test.** The build skill runs automated simulated calls before publishing: every call reason, edge cases, angry caller, after-hours and emergencies.
   - **Pass bar:** 100% on emergency, transfer and compliance cases, and 90%+ overall.
6. **Deploy.** The build skill publishes the agent and attaches a phone number. It records every ID, payload, number and endpoint in the client folder. Never commit secrets; reference them by name.
7. **Validate and report.** Run the `validate-receptionist` skill after every build and every change. It:
   - checks the live agent, functions, integrations and number
   - re-runs the simulations
   - opens a local voice-orb test page so the operator can talk to the agent in the browser
   - writes `report.md` (Built / Assumed / Couldn't do)
   - gives three test-call scenarios for the business type

## Rules

### Research before building
Never build from assumptions about a platform or an industry. Read current docs for the platform's APIs, limits, and pricing, and learn the business type's norms first. If research contradicts the cache in `/docs`, trust current research and update the cache.

### Never ask the operator technical questions
Choose the platform, voice, model, architecture, integrations, hosting, and config yourself. Pick sensible defaults, note them as assumptions in the report, and move on. If something technical is genuinely blocked (missing account access, a paid plan, an API key), list it under "Couldn't do" rather than asking mid-build.

### When something needs the operator
If anything can't be finished without the operator or the owner doing something (a sign-up, a key, a click to connect an account, phone forwarding, an approval), finish everything else first. Then walk them through it in plain English, TLDR-sized, using exactly this shape:

```
**What you need to do:** <one line: what, and why it matters>
1. <step>   (5 steps max, exact button names, direct links)
**Send me:** <exactly what to paste back>, or "nothing, just tell me when it's done"
**Until then:** <what already works, what doesn't>
```

Batch all steps into one message at the end of a task, unless one blocks everything. The same walkthroughs go under "Couldn't do" in the report.

### Spending money
Anything that charges money (buying a phone number, paid add-ons, SMS approval fees) gets one plain line for the operator to approve before it happens, with the monthly total. For example: "Buy a (512) number for $2/mo? Running cost ≈ $40/mo at 300 minutes." Ask once per build, covering everything at once. Usage billing for calls and tests doesn't need approval.

### When the operator gives a platform and a key
Whenever the operator names a platform and hands over an API key, do all three immediately, without asking:
1. **Save the key to `.env`** as `<PLATFORM>_API_KEY` (e.g. `RETELL_API_KEY`), replacing any old value. Add the empty variable name to `.env.example`. `.env` is gitignored. Never write the key anywhere else (not in `.mcp.json`, client folders, docs, or chat). The only exception is a deployment's own secret store (e.g. `wrangler secret put`), filled from `.env`. A client's own third-party keys (their Cal.com, CRM, etc.) follow the same rule, named `<SLUG>_<PROVIDER>_API_KEY`.
2. **Connect the platform.**
   - **If the platform has an official MCP server,** add it to `.mcp.json`. Inject auth with `headersHelper` running `node scripts/mcp-headers.mjs <PLATFORM>_API_KEY`, so the key is read from `.env` and never stored in config. Also add the server name to `enabledMcpjsonServers` in `.claude/settings.local.json`; the desktop app doesn't show the approval prompt, so without this the server stays "pending approval".
   - **If it has no MCP server,** use its REST API, reading the key from `.env`.
   - **Either way, verify the key** with a harmless read call (list agents, list numbers, etc.) and report whether it worked.
3. **Research the platform** with the `platform-research` skill. It skips itself if `/docs` already covers the current version of the platform.

### Only ask what the owner knows, six questions max
Questions are limited to facts only the business owner has: hours, services, pricing they are willing to quote, how to handle emergencies, who calls get transferred to, booking rules, tone of voice, things never to say. Rules:
- At most **six** questions per client, asked together in one batch.
- Don't ask anything you can find yourself (their website, Google Business profile, public listings).
- Plain language, no jargon. Offer a suggested answer where you can so the owner can just confirm.
- If something is still unknown after the six, choose a safe default and list it as an assumption.

### One folder per client in `/clients`
Every client gets `clients/<client-slug>/` (lowercase, hyphenated, e.g. `clients/bright-smile-dental/`). Nothing client-specific lives outside it. Start from `clients/_template/`.

### Cache platform knowledge in `/docs`
Whatever you learn about a platform or industry that will help the next build goes into `/docs`, so future builds don't research it again:
- `docs/platforms/<platform>.md`: the entry point (access, build model, default stack, gotchas, account state).
- `docs/platforms/<platform>/`: the detail behind it:
  - `capabilities.md`: the capability map.
  - `setup-recipes.md`: API recipes.
  - `custom-functions.md`: the gaps that need our own code.
  - `changes.md`: breaking changes and deprecations.
  - `sources.json` and `snapshot/`: the raw docs, used to detect changes.
- `docs/industries/<business-type>.md`: caller intents, urgent vs routine, compliance limits, phrasing that works.

Put a `Last verified: YYYY-MM-DD` line at the top of each file. Re-verify anything older than 90 days before relying on it.

### Report what you built, assumed, and couldn't do
Every build ends with `clients/<client-slug>/report.md` and a summary to the operator in three sections:
- **Built:** what is live, where it lives, the phone number or link, and how to test it.
- **Assumed:** every default chosen without the owner's input, so the operator can confirm or correct it.
- **Couldn't do:** anything blocked or skipped, why, and exactly what is needed to finish it.

Be honest. Never report something as deployed or tested unless it actually is.

## Connected platforms

| Platform | Role | Access | Notes |
|---|---|---|---|
| Retell | Voice (default) | MCP `retell` + REST | `docs/platforms/retell.md` |

## Folder layout

```
CLAUDE.md                 this file
.env                      platform API keys (gitignored, never commit)
.env.example              key names only
.mcp.json                 connected platform MCP servers (no secrets)
scripts/mcp-headers.mjs   reads a key from .env for MCP auth
scripts/docs-snapshot.mjs snapshots a platform's docs and diffs them against the last run
scripts/voice-test/       local voice-orb test page: node scripts/voice-test/server.mjs <client-slug>
clients/
  _template/              copy this for each new client
  <client-slug>/
    brief.md              what the operator said, research notes, owner's answers, assumptions
    build-plan.md         how each function is implemented, model + voice choice, costs, operator steps
    receptionist/         call-flow.md, prompt.md, functions.md, llm.json, agent.json, tests.md
    functions/            client-specific custom function code (if any)
    deploy.md             platform, IDs, versions, number, endpoints, model, costs (no secrets)
    validation.md         dated live checks and simulation results
    report.md             Built / Assumed / Couldn't do, plus three test-call scenarios
functions/                generic custom functions shared across clients (e.g. notify-owner)
docs/
  platforms/
    <platform>.md         entry point for builds
    <platform>/           capabilities, recipes, custom functions, changes, models, docs snapshot
  industries/             cached business-type knowledge
.claude/skills/           build-master skills (see below)
```

## Skills

Each skill lives in `.claude/skills/<skill-name>/SKILL.md`.

- `platform-research`: reads a voice platform's full docs. It maps what the platform does natively, through integrations, or only with a custom function, with API setup recipes for each, and saves it all to `docs/platforms/`.
  - **Use it when:**
    - a new platform is introduced
    - its docs are over 90 days old
    - a build hits an API error suggesting the platform changed
    - the operator says the platform changed
  - **It stops early** if the docs snapshot shows nothing relevant changed.
- `business-research`: researches the business type and the specific client before a build. It covers:
  - what calls sound like
  - what callers ask for
  - what booking needs
  - what gets transferred or escalated
  - compliance limits

  It saves industry knowledge to `docs/industries/` and drafts the call flow, prompt, and functions in `clients/<slug>/receptionist/`. It ends with up to six owner questions.
  - **Use it:**
    - at the start of every client build, right after intake
    - when a client changes what their business does
- `build-receptionist`: builds, tests, publishes and deploys the receptionist, then attaches a phone number.
  - **How it works:**
    - It reads `/docs` and the business research first.
    - It uses native integrations whenever they exist.
    - It writes and deploys custom functions itself, but only when nothing native fits. Cloudflare Workers is the default host.
    - It picks the newest fast model by checking the platform's model list and measuring latency.
    - It saves every payload, ID and test result to the client folder.
  - **Use it:**
    - after the owner's answers are in
    - for any change to a live receptionist
- `validate-receptionist`: runs after every build or change.
  - **What it checks on the live platform:**
    - the agent exists and runs the tested, published version
    - every function is registered and reachable
    - integrations authenticate
  - **What else it does:**
    - re-runs the simulation tests
    - starts and opens the local browser test page (`scripts/voice-test/`, a voice orb running a Retell web call)
    - writes the Built / Assumed / Couldn't do report
    - gives the operator three test-call scenarios for the business type

### Receptionist library
`build-receptionist` loads these when the call flow needs them, and `business-research` uses their owner-facts lists. Each one gives:
- the owner facts needed
- the implementation ladder (native, then integration, then code tool, then custom function)
- a prompt block
- tool config
- post-call fields
- test cases

| Skill | Load when the call flow includes |
|---|---|
| `receptionist-booking` | booking new appointments |
| `receptionist-cancel-reschedule` | changing or cancelling existing appointments |
| `receptionist-faq` | answering questions about the business (nearly always) |
| `receptionist-lead-capture` | messages, new enquiries and callbacks (always; it's also the fallback for failed bookings and transfers) |
| `receptionist-transfer` | handing calls to people, and emergencies |
| `receptionist-after-hours` | different handling outside opening hours |
