---
name: receptionist-faq
description: Library module for answering callers' questions about the business (hours, location, services, prices, policies, parking, insurance). Decides what goes in the prompt and what goes in a knowledge base, sets up the knowledge base from the client's website and the owner's answers, enforces never-invent and compliance rules, and gives the prompt block and test cases. Load it from build-receptionist or business-research for every receptionist that answers questions (nearly all).
---

# FAQ

## Owner facts needed
- **Prices the receptionist may quote.** Default: none; say "it depends, the team will give you an exact price".
- **Topics it must never answer.** Defaults come from the industry compliance list: medical, legal and financial advice; diagnosis; guarantees.
- **What isn't on the website.** Anything the website gets wrong or leaves out (parking, insurance accepted, languages spoken). Ask only if the website and reviews leave it unclear.

## Where facts live
- **In the prompt** (always available, fastest):
  - name, address with a landmark, hours (and holidays), phone
  - the top about 10 questions from the industry file's call reasons
  - prices the owner approved
  - the never-answer list
  - Keep this under about 1,500 words.
- **In a knowledge base** (searched each turn; adds about 100 ms or less):
  - long service menus, policies and detailed FAQs
  - anything on the website that changes
  - Retell setup:
    - Use `create-knowledge-base` with URL sources for the relevant website pages. Turn on auto-refresh (it re-fetches every 24 h) so website changes flow in.
    - Use text sources for the owner's answers.
    - Set `kb_config.top_k` 3 and `filter_score` 0.6.
    - Cost: +$0.005/min. The first 10 knowledge bases are free, then $8/month each.
    - Name it `<slug>-faq`, one per client.
- **Skip the knowledge base** if everything fits comfortably in the prompt (small businesses with a short service list).

## Prompt block
```
## Answering questions
- Answer only from the facts in this prompt and the knowledge base. If you don't have the answer, say so plainly and offer to take a message: "I don't have that information, but I can have the team call you back about it."
- Never guess hours, prices, availability of a service, or policies.
- Keep answers to one or two short sentences, then check: "Anything else I can help with?"
- Prices: only quote these: <approved prices>. For anything else: "<owner's wording or default>".
- Never give <industry never-answer list>. Instead: "<safe redirect, e.g. that's something the dentist will go over with you. Would you like to book a visit?>"
- Directions: give the address and the landmark, not turn-by-turn.
- If a question leads naturally to booking, offer it once.
```

## Post-call fields
`questions_asked` (string, short list), `unanswered_question` (string: what we couldn't answer, which feeds the next knowledge base update).

## Feedback loop
Questions logged as `unanswered_question` across calls are the next knowledge base additions. Mention in the report that the operator can forward these to the owner monthly.

## Test cases
1. Hours, including a holiday or weekend: correct, with no invented exceptions. (Must pass.)
2. A question answered only in the knowledge base (a detail from a website page): correct answer.
3. A question we don't have the answer to: doesn't invent; offers a message. (Must pass.)
4. Price not on the approved list: no number given; uses the redirect wording. (Must pass.)
5. Advice question (e.g. "is this tooth pain serious?"): declines advice, offers booking or escalation, follows the emergency rule if it fits. (Must pass.)
6. Caller asks three questions in one breath: answers each briefly, in order.
