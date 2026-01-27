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

*\*Required for 'property' type questions.*

### Question Types (`type` column)
* **`property`**: Questions used when landing on standard board tiles.
* **`milestone`**: Harder questions for the 4 corner "Boss Tiles". (Need ~6-10 per theme).
* **`core`**: Questions for Utility tiles (e.g., Sequencing Core).
* **`mishap`**: Random events.
    * *Note:* For mishaps, `question` is the Event Text, `explanation` is the Fun Fact.
    * *Money:* Include `+` in the text to give money (e.g., `Grant +$200`). Otherwise, it deducts money.
* **`survey`**: General knowledge questions for Pre/Post test.
* **`confidence`**: Slider questions (1-10) for Pre/Post test.

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

## 5. Troubleshooting Common Issues

* **"File contains no valid rows"**: Check that your TSV headers are spelled *exactly* as listed above (case-sensitive).
* **Images not showing**:
    * Ensure the filename in the TSV (`graph.PNG`) matches the file (`graph.png`) exactly (case-sensitive).
    * Ensure the student clicked "Upload Images" *after* selecting the files.
* **Board looks wrong**: You might have more than 4 themes. The game only uses the first 4.