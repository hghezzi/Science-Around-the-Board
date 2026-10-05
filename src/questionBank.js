// src/questionBank.js
// Built-in wildcards, used only when a question file has no `mishap` rows.
// Subject-neutral on purpose; each comes with a learning-science tip.

export const DEFAULT_CHANCE_CARDS = [
  { msg: "Pop quiz went well! (+$100)", fact: "Tip: retrieval practice (testing yourself) strengthens memory more than re-reading." },
  { msg: "Study group pays off! (+$150)", fact: "Tip: explaining an idea to someone else quickly reveals the gaps in your own understanding." },
  { msg: "Found $50 in an old jacket! (+$50)", fact: "Tip: mixing different topics in one study session (interleaving) improves long-term learning." },
  { msg: "Forgot your notes at home. (-$50)", fact: "Tip: summarising a lecture from memory, then checking your notes, beats copying them out." },
  { msg: "Pulled an all-nighter and slept through class. (-$100)", fact: "Tip: sleep consolidates what you learned that day; cramming all night undoes much of it." },
  { msg: "Laptop crashed before you saved! (-$100)", fact: "Tip: save early, save often, and keep a backup in the cloud." },
  { msg: "Late assignment penalty. (-$75)", fact: "Tip: short study sessions spread over days (spaced practice) beat one long session the night before." },
  { msg: "Scholarship awarded! (+$200)", fact: "Tip: setting a specific goal for each study session makes it more effective." },
  { msg: "Group project partner went missing. (-$100)", fact: "Tip: agreeing on roles and deadlines at the first meeting prevents most group-work problems." },
  { msg: "Office hours cleared up a big misconception! (+$100)", fact: "Tip: asking questions early is one of the strongest predictors of success in a course." },
];
