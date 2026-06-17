# Product Definition: Caledonian Mercury (Reboot)

## Vision
A high-integrity news intelligence platform for the Scottish landscape. Mercury automates the collection of Scottish-interest stories, provides a human-in-the-loop review process, and enriches accepted content with deep NLP analysis and trust metrics.

## Core Features
1. **Scottish Source Scraper**: Targeted collection from BBC Scotland, The Scotsman, The Herald, and local Scottish outlets.
2. **Curation Cockpit (GUI)**: A well-structured interface for reviewing collected stories, inspecting metadata (author, date, images), and making "Accept/Reject" decisions.
3. **Intelligence Pipeline**: Post-acceptance processing including:
    - Named Entity Recognition (NER)
    - Sentiment Analysis
    - JTI (Journalism Trust Initiative) Compliance Check (Author attribution, date transparency, source clarity).

## Tech Stack
- **Backend**: Python 3.x
- **Scraping**: `httpx`, `BeautifulSoup4`, `trafilatura` (for clean text extraction).
- **GUI**: PyQt6 (consistent with other workspace tools like HuskyTV and Alba-Assist).
- **NLP**: `spacy` or `transformers`.
- **Database**: SQLite (for story staging and accepted archive).
