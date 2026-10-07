# Security policy

Science Around the Board is a static web app with no server and no accounts. It runs in the browser from GitHub Pages. Its security mostly comes down to three things: handling question files and share links safely, keeping student data on the students' computers, and the optional Google Apps Script results collector.

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Use GitHub's private reporting instead: on the repository page, go to **Security → Report a vulnerability**. Include the steps to reproduce, the affected page or file, and what an attacker could do with it.

You should get a reply within a week. Fixes are deployed to the live site as soon as they are ready. The app updates itself on each player's next visit, and an open page shows a "new version" notice.

## Supported versions

Only the live site (https://hghezzi.github.io/Science-Around-the-Board/) and the current `main` branch are supported. Instructors who copied the results collector (`public/tools/sab-results-collector.gs`) into their own Sheet should paste in the latest version when an advisory says so.

## What's in scope

- Script injection from question-file content, images or share links (`?deck=`, `?images=`).
- Leaks of student data (answers, names, survey responses) to anyone other than the instructor's chosen destination.
- Analytics loading without consent.
- Formula injection in exported CSV files or in the results Sheet.
- Abuse of the results collector (oversized or malformed submissions).
- The `.lock` encryption (`src/lockFile.js`) not working as documented.

## Known limits (by design)

- **`.lock` files hide the answer key from casual viewing only.** They use PBKDF2-SHA256 (600,000 rounds) and AES-256-GCM, but every student who has the class password can decrypt the file, and the game reveals each answer after it is played. Older `.lock` files (made before October 2026) use CryptoJS's weaker key derivation. Re-encrypting them with the current encryptor makes password guessing much slower.
- **Anyone with a collector URL can send data to that Sheet.** The URL is in the question file. The collector accepts only well-formed game submissions within size and rate limits, and only the Sheet's owner can read the Sheet.
- **A question file is trusted content from the instructor.** Its `results_url` decides where "Send results" posts, so students should only open game links from their instructor.
- GitHub Pages can't send security headers, so the Content-Security-Policy is a `<meta>` tag. Clickjacking protection (`frame-ancestors`) isn't available this way.
