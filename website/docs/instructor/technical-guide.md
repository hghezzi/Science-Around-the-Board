---
sidebar_position: 2
title: Technical Manual
---

# Technical Guide: Creating Custom Games

This guide explains how to build a fully functional "Cartridge" (TSV file) for the Science Around the Board engine.

## 1. The Question File (TSV)

The game requires a **Tab-Separated Values** file. We recommend using Excel or Google Sheets, then exporting as `.tsv` (or `.txt` with tab delimiters).

### The Columns (Must be exact)

| Column Header | Required? | Description | Valid Values / Example |
| :--- | :--- | :--- | :--- |
| `id` | Yes | Unique ID for the row. | `bio_01`, `q105` |
| `question` | Yes | The text prompt. | `What is the start codon?` |
| `option1` | Yes | Answer Choice A. | `AUG` |
| `option2` | Yes | Answer Choice B. | `UAA` |
| `option3` | Yes | Answer Choice C. | `GGC` |
| `option4` | Yes | Answer Choice D. | `AAA` |
| `correctIndex` | Yes | The numeric position of the correct answer. | `1` (for Option 1), `2`, `3`, `4`. |
| `explanation` | Yes | Feedback shown after answering. | `AUG codes for Methionine.` |
| `type` | Yes | Controls game logic (see below). | `property`, `milestone`, `mishap`... |
| `theme` | Yes* | Defines the Board Side (Color Group). | `Genetics`, `Ecology` |
| `subtheme` | Yes* | Defines the specific tile name. | `Translation`, `Transcription` |
| `bigTopic` | No | Used for Menu Filtering. | `Biology` |
| `module` | No | Used for Sub-Menu Filtering. | `Week 1` |
| `imageFile` | No | Filename for images. | `diagram_a.png` |
| `format` | No | Answer format (blank = multiple choice). | `multi`, `numeric`, `order`, `text` |
| `answer` | For `numeric`/`text` | The number, or accepted text answers separated by `\|`. | `1500`, `beta\|beta diversity` |
| `tolerance` | No (`numeric`) | Allowed error: absolute or percentage. Blank = exact. | `0.5`, `5%` |

*\*Required for 'property' type questions.*

### Question Types (`type` column)
* **`property`**: Questions used when landing on standard board tiles.
* **`milestone`**: Harder questions for the 4 corner "Boss Tiles". (Need ~6-10 per theme).
* **`core`**: Questions for Utility tiles (e.g., Sequencing Core).
* **`mishap`**: Random events.
    * *Note:* For mishaps, `question` is the Event Text, `explanation` is the Fun Fact.
    * *Money:* Write the amount in the text, e.g. `Freezer failure! (-$100)` or `Grant renewed! (+$200)`. The game charges or pays exactly that amount. Without an amount, rewards (text containing `+`) pay $50 and penalties cost $100.
* **`survey`**: General knowledge questions for Pre/Post test.
* **`confidence`**: Slider questions (1-10) for Pre/Post test.

### Answer Formats (`format` column)
Every format is marked simply right or wrong, so the game rules are the same for all of them. Options are shuffled each time a question appears.

| `format` | Fill in | Students see | Correct when |
| :--- | :--- | :--- | :--- |
| *(blank)* or `mcq` | `option1`–`option4`, `correctIndex` | buttons | the right option is clicked |
| true/false | `option1` = True, `option2` = False, `correctIndex` | two buttons | as above |
| `multi` | options, `correctIndex` like `1,3` | checkboxes + Submit | the selection matches exactly |
| `numeric` | `answer`, optional `tolerance` | number box | within tolerance |
| `order` | options **in the correct order** | shuffled list with ↑/↓ | the order matches exactly |
| `text` | `answer` with alternatives separated by `\|` | text box | it matches an alternative (ignores case, punctuation and one typo in longer answers) |

---

## 2. Board Generation Logic

The game engine builds the board procedurally based on your TSV file:
1.  It scans the file for unique **`theme`** names.
2.  The **first 4 themes** it finds become the 4 Sides of the board (Bottom, Left, Top, Right).
3.  Inside each theme, it looks for unique **`subtheme`** names to create the properties.
    * *Constraint:* Each side supports exactly **2 Subthemes**. Additional subthemes will be ignored.

:::tip Design Strategy
To ensure your board looks correct, sort your TSV file by `theme` before saving. Ensure you have exactly 4 distinct themes for a standard game.
:::

---

## 3. Using Images

The game supports "Offline" image loading. This avoids copyright issues by never uploading images to a server.

### Setup
1.  In your TSV `imageFile` column, write the exact filename: `fig1.jpg`.
2.  Create a folder on your computer named `GameImages` (or similar).
3.  Put `fig1.jpg` inside that folder.

Images are always optional. The game looks for an image in this order: a file the students uploaded, a full `https://` link written in `imageFile`, then a file hosted with the game. If none is found, the question is shown without the image.

### Student Instructions
1.  Students open the game.
2.  They click **"Upload Images"**.
3.  They browse to the folder and select **ALL** files (Ctrl+A).
4.  The game creates a local `blob` URL for each file and maps it to the question ID.

---

## 4. Encryption (Optional)

To prevent "cheating" (students reading the TSV answer key), you can encrypt the file.

1.  Open your final `.tsv` file in a text editor (Notepad).
2.  Select All -> Copy.
3.  Go to the [Password Encryptor Tool](https://hghezzi.github.io/Science-Around-the-Board/encryptor.html).
4.  Paste the text. Enter a password (e.g., `DNA2026`). Click Encrypt.
5.  Copy the ciphertext (the random characters).
6.  Save this as a new file: `game_secure.lock`.
7.  Distribute the `.lock` file to students. They will need the password to open it.

---

## 5. Checking Your File

When a file is loaded, the game lists any problems it finds before you start: missing or misspelled columns, `correctIndex` values that don't match an option, fewer than 4 themes, themes without milestone questions, invalid numeric or multi-select answers, mishaps without an amount, and images that haven't been uploaded. Fix the red items before class; the yellow notes are suggestions.

## 6. Generating Questions with Claude

The `sab-question-writer` skill interviews you about your course and learning objectives, researches the topic, proposes a board layout for your approval, and writes a complete, validated question file (optionally with figures). Download it from the [project README](https://github.com/hghezzi/Science-Around-the-Board#readme) and upload it to Claude, then ask, for example: *"Make a Science Around the Board game reviewing enzyme kinetics for second-year biochemistry."* Always review generated questions before using them in class.

## 7. Troubleshooting Common Issues

* **"File contains no valid rows"**: Check that your TSV headers are spelled *exactly* as listed above (case-sensitive).
* **Images not showing**:
    * Ensure the filename in the TSV (`graph.PNG`) matches the file (`graph.png`) exactly (case-sensitive).
    * Ensure the student clicked "Upload Images" *after* selecting the files.
* **Board looks wrong**: You might have more than 4 themes. The game only uses the first 4.