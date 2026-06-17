import spacy
from textblob import TextBlob
import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "mercury.db")
nlp = spacy.load("en_core_web_sm")

def compute_nlp(title, content, author, date, source):
    text = f"{title}. {content or ''}"
    
    # 1. NER
    doc = nlp(text)
    entities = []
    for ent in doc.ents:
        if ent.label_ in ["PERSON", "ORG", "GPE", "LOC", "EVENT"]:
            entities.append({"text": ent.text, "label": ent.label_})
    
    # Remove duplicates
    entities = [dict(t) for t in {tuple(d.items()) for d in entities}]
    
    # 2. Sentiment
    blob = TextBlob(text)
    sentiment_score = blob.sentiment.polarity
    
    # 3. JTI Metrics (Simple heuristics)
    jti_metrics = {
        "author_transparency": 1.0 if author else 0.0,
        "date_transparency": 1.0 if date else 0.0,
        "content_depth": min(1.0, len((content or "").split()) / 500), # Norm to 500 words
        "source_trust": 1.0 # Default for our curated list
    }
    
    return {
        "entities": entities,
        "sentiment_score": sentiment_score,
        "jti_metrics": jti_metrics
    }

def process_story(story_id):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT title, author, published_date, content_text, source FROM stories WHERE id = ?", (story_id,))
    story = cursor.fetchone()
    
    if not story:
        conn.close()
        return
    
    title, author, date, content, source = story
    
    nlp_data = compute_nlp(title, content, author, date, source)
    
    # Save Intelligence
    cursor.execute('''
    INSERT INTO intelligence (story_id, entities, sentiment_score, jti_metrics)
    VALUES (?, ?, ?, ?)
    ''', (story_id, json.dumps(nlp_data["entities"]), nlp_data["sentiment_score"], json.dumps(nlp_data["jti_metrics"])))
    
    # Update Story Status
    cursor.execute("UPDATE stories SET status = 'processed' WHERE id = ?", (story_id,))
    
    conn.commit()
    conn.close()
    print(f"Processed story {story_id}: Found {len(nlp_data['entities'])} entities, Sentiment {nlp_data['sentiment_score']:.2f}")

if __name__ == "__main__":
    # Example: process all 'accepted' stories
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM stories WHERE status = 'accepted'")
    accepted = cursor.fetchall()
    conn.close()
    
    for (s_id,) in accepted:
        process_story(s_id)

