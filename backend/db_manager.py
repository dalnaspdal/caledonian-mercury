import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "mercury.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Staging table for raw scrapes
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS stories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT,
        url TEXT UNIQUE,
        title TEXT,
        author TEXT,
        published_date TEXT,
        lead_image_url TEXT,
        raw_html TEXT,
        content_text TEXT,
        status TEXT DEFAULT 'staged', -- staged, accepted, rejected, processed
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # Table for processed intelligence (Entities, Sentiment, JTI)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS intelligence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        story_id INTEGER,
        entities JSON,
        sentiment_score REAL,
        jti_metrics JSON,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (story_id) REFERENCES stories(id)
    )
    ''')
    
    conn.commit()
    conn.close()

def save_story(story_data):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute('''
        INSERT OR IGNORE INTO stories (source, url, title, author, published_date, lead_image_url, content_text)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            story_data.get('source'),
            story_data.get('url'),
            story_data.get('title'),
            story_data.get('author'),
            story_data.get('published_date'),
            story_data.get('lead_image_url'),
            story_data.get('content_text')
        ))
        conn.commit()
    except Exception as e:
        print(f"Error saving story: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    init_db()
    print(f"Database initialized at {DB_PATH}")
