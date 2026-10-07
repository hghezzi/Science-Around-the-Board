# Writing good SAB questions

SAB is formative review: low stakes, immediate feedback, repeated retrieval. Questions should make students *retrieve and apply*, and the explanation should repair whatever misunderstanding a wrong answer revealed.

## Match the question to the tile

| tile | Bloom level | typical stem |
|---|---|---|
| property | remember / understand | "What does X do?", "Which best describes…", "Why is X needed before Y?" |
| core | apply (the cross-cutting skill) | "Which command…", "What does this output mean?" |
| milestone | apply / analyze / evaluate | scenarios: "A student sees result R after doing S. What is the most likely cause?", "Which change would fix…", "Which experimental design answers question Q?" |
| survey | the same LOs as the board, mixed levels | parallel items, not copies of board questions |

Milestones are the mastery gate (5 of 6). Make them reward understanding, not trivia: one concept per question, a realistic context, and one clearly best answer.

## Stems

- Ask one clear question; the stem alone should make sense before reading the options.
- Avoid negatives ("Which is NOT…"). If one is unavoidable, capitalise NOT.
- Include units and the context needed. Don't hide the difficulty in wording.
- Vary stems: definitions, cause and effect, prediction, troubleshooting, interpretation (images), comparison.

## Distractors (the most important part)

- Every distractor should be something a real student might believe: a common misconception, a confusion between two related terms, a step done in the wrong order, an off-by-one, the right idea in the wrong context.
- Don't use joke options, "all/none of the above", or options that overlap.
- Plausible doesn't mean tricky: there must be one defensible correct answer, as an expert would agree.

## Don't let the answer give itself away (cues)

Writers, human or AI, naturally make the correct answer the longest, most careful and most qualified option, because it is the one they thought hardest about. Students learn this quickly: in the original demo file, always picking the longest option scored **69%** where chance is 25%. A question that can be answered by its shape tests nothing, and in SAB it also hands out free money. The validator measures these cues, but write them out from the start:

| cue | what test-wise students do | rule |
|---|---|---|
| **length** | pick the longest (or, if you overcorrect, the shortest) option | Write the correct answer **first**, then write each distractor to the **same length (±20%) and the same level of detail**. Across a file the correct answer should be the longest option in only about 1 question in 4, and the shortest in about 1 in 4. |
| **qualifiers** | pick the option with "usually", "can", "e.g.", parentheses or a reason clause | If the correct answer needs a qualifier or a "because…", give the distractors one too. |
| **absolute words** | rule out options with "always", "never", "only", "all", "every" | Use these words in correct answers too (where true), or not at all. They must not appear only in distractors. |
| **word echo** | pick the option that repeats the question's key words | Echo the stem's key term in a distractor as well, or in none of the options. |
| **grammar** | rule out options that don't fit "…is an" or a plural stem | End stems with "?" and make every option fit the stem grammatically. |
| **convergence** | pick the option that shares the most parts with the others | Vary distractors along more than one dimension. |
| **option references** | "all of the above", "both A and B", "option 2" | Never: options are shuffled. Use the `multi` format instead. |

Example (from the 16S demo, before and after):

- Before: *What is the main goal of denoising?* (a) To cluster sequences into 97% OTUs based on a reference database; (b) To assign taxonomy to every read using a classifier; **(c) To trim reads and remove low-quality data to resolve exact Amplicon Sequence Variants (ASVs)**; (d) To align reads to a phylogenetic tree. The correct option is 92 characters; the others average 51. A student can answer without knowing anything.
- After: **(a) To correct or remove read errors and find exact ASVs** (52); (b) To cluster reads into 97% OTUs against a reference (50); (c) To assign a taxonomy to each read with a classifier (51); (d) To merge the samples into one combined read file (48).

Ways to fix a long correct answer, in order of preference: cut words that don't change the meaning ("in order to", "the process of"); move context into the stem; move the reason into the explanation, where it teaches; and only then lengthen the distractors with *real* misconceptions of the same specificity (never with padding).

Short, fixed-form options (numbers, commands, names such as `pwd` or "Carl Woese") are fine: when every option is short, length can't help much.

## Explanations

Shown immediately after every answer, this is where the learning happens.

- 1–3 sentences: why the correct answer is correct, then the specific misconception behind the most tempting distractor.
- Don't just restate the answer ("The answer is B"). Don't write "Incorrect"; the game already says so.
- A memorable hook or a link to practice helps ("…which is why you trim primers *before* denoising").

## Survey questions (pre/post)

- They measure learning, so they must cover the LOs evenly and match the board's difficulty.
- Write them **separately** from board questions: same concepts, different items. If students see the exact item during play, post-test gains measure memory of that item.
- Use mostly mcq so scores are comparable.

## Confidence statements

- 3 statements, one per major LO cluster: "I am confident I can [verb] [skill]."
- Use concrete verbs (explain, choose, interpret, troubleshoot), not "understand".

## Wildcards (`mishap` rows)

- Short, vivid events themed to the subject (or general study life), with explicit amounts: `(-$100)`, `(+$150)`.
- Use the `explanation` for a genuine fun fact or practical lesson tied to the course (a classic lab mistake, a historical anecdote, a best practice).
- Roughly 2/3 penalties and 1/3 rewards, mostly $50–$200.

## Quality pass before building

For each batch, run the **blind-student test** (mandatory): cover the stem and read only the options. Could you pick the answer because it is longest, most qualified, echoes the stem, or is the only one without "always"/"never"? If so, rewrite it. Then check:
- [ ] Is it factually correct? Is anything version-specific or contested flagged for the instructor?
- [ ] Is there exactly one correct answer (or the exact set, for multi)?
- [ ] Can it be answered without the options (good) and not by test-wiseness alone?
- [ ] Is it free of "all/none of the above" and of references to option positions?
- [ ] Does the explanation address the tempting distractor?
- [ ] Is it tied to an LO, and at the right difficulty for its tile?
- [ ] Are correct positions balanced, with no duplicate or near-duplicate items across board and survey?
- [ ] Is the correct option within about ±20% of the distractors' length, and is it the longest in no more than about a quarter of the batch?
- [ ] Do absolute words appear in correct answers as often as in distractors (or nowhere)?
- [ ] Does the explanation refer to options by their content, never by letter or position ("option C")? Options are shuffled.
- [ ] Would a spreadsheet mangle any cell? Text starting with `-`, `+`, `=` or `@` (e.g. `--p-sampling-depth`) becomes a formula (`#NAME?`) in Excel or Sheets; wrap commands in backticks.

## Survey items: parallel, not identical

The pre/post survey measures learning, so each survey item should target a board LO **with a different item**: a new scenario, numbers or direction (e.g. board: "Which metric uses the phylogeny?"; survey: "Two samples have the same 50 ASVs at similar abundances, but in one they all belong to one genus. Which alpha metric differs most?"). A survey item that is a paraphrase of a board item measures memory of that item. Transfer items also show whether students can *use* the idea.
