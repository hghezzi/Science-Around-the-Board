---
sidebar_position: 1
title: Pedagogical Guide
---

# Pedagogy & Assessment Strategy

**Science Around the Board** is an active learning platform designed to replace or supplement traditional review sessions. Unlike a passive lecture or a low-stakes multiple-choice quiz, this engine uses **game theory** to drive engagement and **metacognition** to measure confidence.

## 1. The Assessment Loop

The game is engineered around a "Data Sandwich": a gameplay intervention bracketed by measurement tools.

### Phase 1: The Pre-Assessment (Baseline)
Before the game board loads, students complete a mandatory survey.
* **Confidence Sliders (Metacognition):** Students rate their confidence (1-10) on specific learning objectives (e.g., *"How confident are you in 16S rRNA pipeline design?"*). This identifies the **Dunning-Kruger effect** (where novices overestimate competence) or **Imposter Syndrome** (where experts underestimate competence).
* **Knowledge Check:** A set of 10 randomized questions per player to establish a baseline score.

### Phase 2: The Intervention (Gameplay)
The game uses **Active Recall** and **Spaced Repetition**:
* **Rent Defense (Formative):** When landing on a rival tile, students are forced to answer a question. This is high-frequency, low-stakes testing. Getting it wrong costs in-game money, creating an emotional anchor for the memory.
* **Milestone Exams (Summative):** To capture a corner Milestone, students must pass a 6-question "Exam" with 83% accuracy (5/6). This prevents students from "lucking" their way to victory; they must demonstrate mastery.

### Phase 3: The Post-Assessment (Growth)
After the game, the survey repeats.
* **Retention:** Comparing Pre- vs. Post-quiz scores measures immediate learning gains.
* **Confidence Delta:** We often see confidence *drop* initially as students realize the complexity of the topic (the "Valley of Despair"), followed by a rise as they master it.

### Phase 4: The Data Log (Submission)
The game generates a `microbiopoly_data.csv` file. This is your "Lab Notebook." It contains every click, answer, and transaction.
* **Grading:** You can grade based on *Participation* (file submitted) or *Performance* (final score).
* **Analytics:** You can open this file in Excel to see exactly which questions were missed most often by the class, allowing you to target your next lecture.

---

## 2. Bloom's Taxonomy Alignment

The game engine targets multiple levels of cognitive learning:

| Game Mechanic | Cognitive Level | Description |
| :--- | :--- | :--- |
| **Rent Defense** | *Remember / Understand* | Quick recall of facts to avoid penalties. |
| **Upgrades** | *Analyze* | Deciding when to invest in infrastructure vs. saving liquid cash requires analyzing risk. |
| **Chaos Token** | *Evaluate* | Students must evaluate if they know a topic well enough to challenge a rival. |
| **Image Questions** | *Apply* | Interpreting a plot or debugging code snippet (via the Image feature) requires application of knowledge. |

---

## 3. Universal Scalability

While the default metaphor is a "Research Lab," the engine is **subject-agnostic**.

### How to Adapt for Other Disciplines
* **History:**
    * *Currency:* "Prestige" or "Gold"
    * *Properties:* Historical Eras (e.g., "The Bronze Age")
    * *Mishaps:* "Library of Alexandria Burns! (-100)"
* **Computer Science:**
    * *Currency:* "Processing Power"
    * *Properties:* Algorithms or Languages (e.g., "Python", "Rust")
    * *Milestones:* Systems (e.g., "The Kernel")
    * *Chaos:* "Hack the Mainframe"

---

## 4. Suggested Lesson Plan (60-90 Mins)

| Time | Phase | Activity |
| :--- | :--- | :--- |
| **0-10** | **Setup** | Students form teams (2-4 per laptop). Load the game URL and upload the `questions.tsv` file. |
| **10-15** | **Pre-Survey** | **Critical:** Ensure students take this seriously. This sets their baseline. |
| **15-50** | **Gameplay** | The Instructor acts as "Game Master," walking around to clarify rules. Encourage teams to read explanations out loud. |
| **50-55** | **The End** | Give a 5-minute warning. Students click "End Game." |
| **55-60** | **Post-Survey** | Students complete the final check. |
| **60+** | **Debrief** | **Homework:** Students upload their `.csv` file to the LMS. Instructor reviews the "Chaos" moments and hardest questions. |