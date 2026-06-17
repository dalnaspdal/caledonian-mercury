import sys
import os
import time
import json
import traceback
import httpx
import re

# Add backend folder to path
sys.path.append(os.path.dirname(__file__))

import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore

from scraper import scrape_feeds, scrape_single_url
from nlp_processor import compute_nlp

KEY_PATH = os.path.join(os.path.dirname(__file__), "firebase-key.json")

class FirestoreRestClient:
    def __init__(self, api_key, project_id):
        self.api_key = api_key
        self.project_id = project_id
        self.token = None
        self.token_expiry = 0
        
    def authenticate(self):
        if self.token and time.time() < self.token_expiry - 60:
            return True
        url = f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={self.api_key}"
        try:
            resp = httpx.post(url, json={"returnSecureToken": True}, timeout=10.0)
            if resp.status_code == 200:
                data = resp.json()
                self.token = data.get("idToken")
                self.token_expiry = time.time() + int(data.get("expiresIn", 3600))
                return True
            else:
                print(f"REST Auth failed: {resp.text}")
        except Exception as e:
            print(f"REST Auth network exception: {e}")
        return False

    def collection(self, collection_name):
        return RestCollection(self, collection_name)

class RestCollection:
    def __init__(self, client, name):
        self.client = client
        self.name = name
        self._filters = []
        self._limit = None

    def where(self, field, op, value):
        op_mapping = {
            "==": "EQUAL",
            "<": "LESS_THAN",
            "<=": "LESS_THAN_OR_EQUAL",
            ">": "GREATER_THAN",
            ">=": "GREATER_THAN_OR_EQUAL"
        }
        self._filters.append({
            "fieldFilter": {
                "field": {"fieldPath": field},
                "op": op_mapping.get(op, "EQUAL"),
                "value": {"stringValue": str(value)}
            }
        })
        return self

    def limit(self, limit_num):
        self._limit = limit_num
        return self

    def get(self):
        if not self.client.authenticate():
            return []
            
        url = f"https://firestore.googleapis.com/v1/projects/{self.client.project_id}/databases/(default)/documents:runQuery"
        headers = {"Authorization": f"Bearer {self.client.token}"}
        
        query_payload = {
            "structuredQuery": {
                "from": [{"collectionId": self.name}]
            }
        }
        
        if self._filters:
            if len(self._filters) == 1:
                query_payload["structuredQuery"]["where"] = self._filters[0]
            else:
                query_payload["structuredQuery"]["where"] = {
                    "compositeFilter": {
                        "op": "AND",
                        "filters": self._filters
                    }
                }
                
        if self._limit:
            query_payload["structuredQuery"]["limit"] = self._limit
            
        try:
            resp = httpx.post(url, json=query_payload, headers=headers, timeout=10.0)
            if resp.status_code == 200:
                results = resp.json()
                docs = []
                for res in results:
                    if "document" in res:
                        docs.append(RestDocumentSnapshot(res["document"]))
                return docs
            else:
                print(f"REST Query failed: {resp.text}")
        except Exception as e:
            print(f"REST Query exception: {e}")
        return []

    def add(self, story_payload):
        if not self.client.authenticate():
            return None
            
        url = f"https://firestore.googleapis.com/v1/projects/{self.client.project_id}/databases/(default)/documents/{self.name}"
        headers = {"Authorization": f"Bearer {self.client.token}"}
        
        fields = {}
        for k, v in story_payload.items():
            if v is None:
                fields[k] = {"nullValue": None}
            elif isinstance(v, float):
                fields[k] = {"doubleValue": v}
            elif isinstance(v, int):
                fields[k] = {"integerValue": str(v)}
            elif isinstance(v, bool):
                fields[k] = {"booleanValue": v}
            elif isinstance(v, dict):
                map_fields = {}
                for mk, mv in v.items():
                    if isinstance(mv, float):
                        map_fields[mk] = {"doubleValue": mv}
                    else:
                        map_fields[mk] = {"stringValue": str(mv)}
                fields[k] = {"mapValue": {"fields": map_fields}}
            elif isinstance(v, list):
                list_values = []
                for item in v:
                    if isinstance(item, dict):
                        item_fields = {}
                        for ik, iv in item.items():
                            item_fields[ik] = {"stringValue": str(iv)}
                        list_values.append({"mapValue": {"fields": item_fields}})
                fields[k] = {"arrayValue": {"values": list_values}}
            elif k == 'created_at':
                import datetime
                fields[k] = {"timestampValue": datetime.datetime.utcnow().isoformat() + "Z"}
            else:
                fields[k] = {"stringValue": str(v)}
                
        doc_payload = {"fields": fields}
        try:
            resp = httpx.post(url, json=doc_payload, headers=headers, timeout=10.0)
            if resp.status_code == 200:
                return RestDocumentSnapshot(resp.json())
        except Exception as e:
            print(f"REST Add exception: {e}")
        return None

    def document(self, doc_id):
        return RestDocumentReference(self.client, self.name, doc_id)

class RestDocumentReference:
    def __init__(self, client, collection_name, doc_id):
        self.client = client
        self.collection_name = collection_name
        self.doc_id = doc_id

    def update(self, update_fields):
        if not self.client.authenticate():
            return False
            
        masks = []
        fields = {}
        for k, v in update_fields.items():
            masks.append(f"updateMask.fieldPaths={k}")
            if v is None:
                fields[k] = {"nullValue": None}
            elif isinstance(v, float):
                fields[k] = {"doubleValue": v}
            elif isinstance(v, int):
                fields[k] = {"integerValue": str(v)}
            elif isinstance(v, bool):
                fields[k] = {"booleanValue": v}
            elif isinstance(v, dict):
                map_fields = {}
                for mk, mv in v.items():
                    if mk == 'sentiment_score':
                        map_fields[mk] = {"doubleValue": mv}
                    elif mk == 'entities':
                        list_values = []
                        for ent in mv:
                            list_values.append({
                                "mapValue": {
                                    "fields": {
                                        "text": {"stringValue": ent["text"]},
                                        "label": {"stringValue": ent["label"]}
                                    }
                                }
                            })
                        map_fields[mk] = {"arrayValue": {"values": list_values}}
                    elif mk == 'jti_metrics':
                        jti_fields = {}
                        for jk, jv in mv.items():
                            jti_fields[jk] = {"doubleValue": float(jv)}
                        map_fields[mk] = {"mapValue": {"fields": jti_fields}}
                    elif mk == 'processed_at':
                        import datetime
                        map_fields[mk] = {"timestampValue": datetime.datetime.utcnow().isoformat() + "Z"}
                    else:
                        map_fields[mk] = {"stringValue": str(mv)}
                fields[k] = {"mapValue": {"fields": map_fields}}
            else:
                fields[k] = {"stringValue": str(v)}
                
        mask_str = "&".join(masks)
        url = f"https://firestore.googleapis.com/v1/projects/{self.client.project_id}/databases/(default)/documents/{self.collection_name}/{self.doc_id}?{mask_str}"
        headers = {"Authorization": f"Bearer {self.client.token}"}
        
        try:
            resp = httpx.patch(url, json={"fields": fields}, headers=headers, timeout=10.0)
            return resp.status_code == 200
        except Exception as e:
            print(f"REST Update exception: {e}")
        return False

class RestDocumentSnapshot:
    def __init__(self, raw_doc):
        self.raw_doc = raw_doc
        self.id = raw_doc["name"].split("/")[-1]
        
    def to_dict(self):
        result = {}
        fields = self.raw_doc.get("fields", {})
        for k, v in fields.items():
            if "stringValue" in v:
                result[k] = v["stringValue"]
            elif "doubleValue" in v:
                result[k] = float(v["doubleValue"])
            elif "integerValue" in v:
                result[k] = int(v["integerValue"])
            elif "booleanValue" in v:
                result[k] = v["booleanValue"]
            elif "timestampValue" in v:
                result[k] = v["timestampValue"]
            elif "mapValue" in v:
                map_result = {}
                map_fields = v["mapValue"].get("fields", {})
                for mk, mv in map_fields.items():
                    if "stringValue" in mv:
                        map_result[mk] = mv["stringValue"]
                    elif "doubleValue" in mv:
                        map_result[mk] = float(mv["doubleValue"])
                result[k] = map_result
        return result

def load_web_config():
    config_path = os.path.join(os.path.dirname(__file__), "..", "frontend", "firebase-config.js")
    if not os.path.exists(config_path):
        return None
    try:
        with open(config_path, "r") as f:
            content = f.read()
        api_key_match = re.search(r'apiKey:\s*["\']([^"\']+)["\']', content)
        project_id_match = re.search(r'projectId:\s*["\']([^"\']+)["\']', content)
        if api_key_match and project_id_match:
            return {
                "apiKey": api_key_match.group(1),
                "projectId": project_id_match.group(1)
            }
    except Exception:
        pass
    return None

def init_firebase():
    """Initialize Firebase Admin SDK with key or fallback to REST Client."""
    if firebase_admin._apps:
        return firestore.client()
        
    # Option 1: Local key file
    if os.path.exists(KEY_PATH):
        print(f"Initializing Firebase with service account key: {KEY_PATH}")
        cred = credentials.Certificate(KEY_PATH)
        firebase_admin.initialize_app(cred)
        return firestore.client()
        
    # Option 2: Environment Variable
    if os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
        print("Initializing Firebase using GOOGLE_APPLICATION_CREDENTIALS env var.")
        firebase_admin.initialize_app()
        return firestore.client()
        
    # Option 3: Emulator (for developer testing)
    if os.environ.get("FIRESTORE_EMULATOR_HOST"):
        print(f"Connecting to Firestore Emulator at {os.environ.get('FIRESTORE_EMULATOR_HOST')}")
        firebase_admin.initialize_app(options={'projectId': 'caledonian-mercury-app'})
        return firestore.client()
        
    # Option 4: Auto-fallback REST client using Web credentials
    web_config = load_web_config()
    if web_config:
        print(f"No Service Account JSON found. Initializing Firestore REST client for: {web_config['projectId']}")
        return FirestoreRestClient(web_config["apiKey"], web_config["projectId"])
        
    print("\n" + "="*80)
    print("⚠️  WARNING: Firebase Credentials Not Found!")
    print("Caledonian Mercury Sync Daemon cannot connect to Firestore.")
    print("="*80 + "\n")
    return None

def push_scraped_stories(db):
    """Run the local scraper and push new stories to Firestore."""
    if not db:
        print("Cannot push stories: Firestore connection not initialized.")
        return
        
    print("Scraping fresh feeds for Firestore upload...")
    stories = scrape_feeds()
    
    pushed_count = 0
    duplicate_count = 0
    
    for story in stories:
        # Generate a document ID from URL or let Firestore generate it.
        # Clean URLs are good for deduplication. We use a hashed URL or simple base64-like key, 
        # or we query Firestore for existence. Querying is simpler and robust.
        url = story.get('url')
        if not url:
            continue
            
        # Check if URL exists in Firestore
        docs = db.collection('stories').where('url', '==', url).limit(1).get()
        if len(docs) > 0:
            duplicate_count += 1
            continue
            
        # Prepare story payload
        story_payload = {
            'source': story.get('source'),
            'url': url,
            'title': story.get('title'),
            'author': story.get('author'),
            'published_date': story.get('published_date'),
            'lead_image_url': story.get('lead_image_url'),
            'content_text': story.get('content_text'),
            'category': story.get('category', 'General'),
            'status': 'staged',
            'created_at': firestore.SERVER_TIMESTAMP,
            'intelligence': None,
            'upvotes': 0,
            'downvotes': 0,
            'score': 0
        }
        
        # Write to Firestore
        db.collection('stories').add(story_payload)
        pushed_count += 1
        print(f"  Pushed to Firestore: {story['title'][:50]}... [{story['category']}]")
        
    print(f"Sync complete. Pushed {pushed_count} new stories to Firestore ({duplicate_count} duplicates skipped).")

def process_accepted_stories(db):
    """Query stories with status='accepted', compute NLP, and write back to Firestore."""
    if not db:
        return
        
    print("Checking for accepted stories in Firestore...")
    docs = db.collection('stories').where('status', '==', 'accepted').get()
    
    for doc in docs:
        story_id = doc.id
        story_data = doc.to_dict()
        title = story_data.get('title')
        content = story_data.get('content_text')
        author = story_data.get('author')
        date = story_data.get('published_date')
        source = story_data.get('source')
        
        print(f"Processing accepted story: {title[:50]}...")
        try:
            # Run local SpaCy NLP and TextBlob Sentiment
            nlp_data = compute_nlp(title, content, author, date, source)
            
            # Map JTI and Entities for Firestore compatibility
            intelligence = {
                'sentiment_score': float(nlp_data['sentiment_score']),
                'entities': nlp_data['entities'],
                'jti_metrics': nlp_data['jti_metrics'],
                'processed_at': firestore.SERVER_TIMESTAMP
            }
            
            # Update story in Firestore
            db.collection('stories').document(story_id).update({
                'status': 'processed',
                'intelligence': intelligence
            })
            print(f"  Successfully processed and updated: {title[:50]}...")
            
        except Exception as e:
            print(f"  Error processing story {story_id}: {e}")
            traceback.print_exc()

def process_user_submissions(db):
    """Query user-submitted links from submissions collection, scrape them, run NLP, and add to stories."""
    if not db:
        return
        
    # We poll submissions where status == "pending"
    docs = db.collection('submissions').where('status', '==', 'pending').get()
    if not docs:
        return
        
    print(f"Found {len(docs)} pending user submissions...")
    for doc in docs:
        sub_id = doc.id
        sub_data = doc.to_dict()
        url = sub_data.get('url')
        
        if not url:
            db.collection('submissions').document(sub_id).update({'status': 'invalid'})
            continue
            
        print(f"Processing user submission: {url}")
        # Mark as processing
        db.collection('submissions').document(sub_id).update({'status': 'processing'})
        
        try:
            # Check if URL already exists in stories to avoid duplicates
            existing = db.collection('stories').where('url', '==', url).limit(1).get()
            if len(existing) > 0:
                print(f"  Submission {url} already exists in database. Skipping.")
                db.collection('submissions').document(sub_id).update({'status': 'duplicate'})
                continue
                
            # Scrape content
            story = scrape_single_url(url)
            if story and story.get('content_text'):
                story_payload = {
                    'source': story.get('source'),
                    'url': url,
                    'title': story.get('title'),
                    'author': story.get('author'),
                    'published_date': story.get('published_date'),
                    'lead_image_url': story.get('lead_image_url'),
                    'content_text': story.get('content_text'),
                    'category': story.get('category', 'General'),
                    'status': 'staged',
                    'created_at': firestore.SERVER_TIMESTAMP,
                    'intelligence': None,
                    'upvotes': 0,
                    'downvotes': 0,
                    'score': 0
                }
                
                # Add to stories
                db.collection('stories').add(story_payload)
                db.collection('submissions').document(sub_id).update({'status': 'completed'})
                print(f"  Successfully ingested submitted story: {story['title'][:50]}")
            else:
                db.collection('submissions').document(sub_id).update({'status': 'failed'})
                print(f"  Failed to scrape submitted URL: {url}")
        except Exception as e:
            db.collection('submissions').document(sub_id).update({'status': 'error'})
            print(f"  Error processing submission {sub_id}: {e}")

def run_listener_loop(db):
    """Continuously poll/listen to Firestore for status updates."""
    if not db:
        print("Error: Cannot start listener. Firestore client is not active.")
        return
        
    print("\n" + "="*50)
    print("🚀 Caledonian Mercury Sync Daemon is Running!")
    print("Mode: Listening for 'accepted' stories & pending submissions...")
    print("Press Ctrl+C to stop.")
    print("="*50 + "\n")
    
    while True:
        try:
            # Poll accepted stories for NLP
            process_accepted_stories(db)
            # Poll user submissions for automated ingestion
            process_user_submissions(db)
        except Exception as e:
            print(f"Loop error: {e}")
        time.sleep(5)  # Poll every 5 seconds

if __name__ == "__main__":
    db = init_firebase()
    
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        if command == "push":
            push_scraped_stories(db)
        elif command == "listen":
            run_listener_loop(db)
        elif command == "submissions":
            process_user_submissions(db)
        elif command == "cron":
            print("Starting Caledonian Mercury Cron Task...")
            push_scraped_stories(db)
            process_user_submissions(db)
            process_accepted_stories(db)
            print("Cron Task Complete.")
        elif command == "sync":
            push_scraped_stories(db)
            run_listener_loop(db)
        else:
            print("Unknown command. Use: push, listen, submissions, cron, or sync")
    else:
        print("Caledonian Mercury Firebase Sync CLI")
        print("Usage:")
        print("  python3 backend/firebase_sync.py push         - Scrape RSS and upload new staged stories")
        print("  python3 backend/firebase_sync.py listen       - Start local NLP and submission daemon")
        print("  python3 backend/firebase_sync.py submissions  - Process pending user link submissions once")
        print("  python3 backend/firebase_sync.py cron         - Run all tasks once (push, submissions, nlp)")
        print("  python3 backend/firebase_sync.py sync         - Scrape first, then start listener daemon")
