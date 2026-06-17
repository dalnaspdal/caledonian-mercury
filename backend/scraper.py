import feedparser
import trafilatura
import json
import httpx
from db_manager import save_story, init_db

SOURCES = {
    "BBC Scotland": "http://feeds.bbci.co.uk/news/scotland/rss.xml",
    "The Scotsman": "https://www.scotsman.com/news/rss",
    "The Herald": "https://www.heraldscotland.com/news/rss/"
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

def classify_story(title, content):
    title_lower = title.lower() if title else ""
    content_lower = content.lower() if content else ""
    text = f"{title_lower} {content_lower}"
    
    politics_keywords = [
        "holyrood", "sturgeon", "swinney", "msp", "yousaf", "tory", "labour", "snp", "government", 
        "parliament", "vote", "election", "politician", "policy", "minister", "brexit", "independence",
        "scotland act", "devolution", "alba", "green party", "westminster", "councillor"
    ]
    business_keywords = [
        "business", "economy", "growth", "finance", "bank", "market", "revenue", "profit", "employment", 
        "jobs", "inflation", "investment", "trade", "company", "export", "industry", "funding", "startup", 
        "retail", "energy", "oil", "whisky", "tourism", "north sea"
    ]
    culture_keywords = [
        "fringe", "festival", "art", "music", "theatre", "museum", "gallery", "culture", "heritage", 
        "gaelic", "history", "exhibition", "film", "cinema", "poet", "author", "book", "piper", "highland games",
        "traditional", "ceilidh", "castle"
    ]
    
    pol_count = sum(1 for kw in politics_keywords if kw in text)
    bus_count = sum(1 for kw in business_keywords if kw in text)
    cul_count = sum(1 for kw in culture_keywords if kw in text)
    
    if pol_count == 0 and bus_count == 0 and cul_count == 0:
        return "General"
        
    max_val = max(pol_count, bus_count, cul_count)
    if max_val == pol_count:
        return "Politics"
    elif max_val == bus_count:
        return "Business"
    else:
        return "Culture"

def scrape_feeds():
    print("Starting scrape...")
    init_db()
    scraped_stories = []
    
    for source_name, feed_url in SOURCES.items():
        print(f"Fetching {source_name}...")
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries[:10]:  # Limit to 10 latest for now
                url = entry.link
                title = entry.title
                
                # Fetch full content
                print(f"  Extracting: {title[:50]}...")
                try:
                    response = httpx.get(url, headers=HEADERS, timeout=10.0)
                    if response.status_code == 200:
                        downloaded = response.text
                        # Trafilatura for clean extraction
                        result = trafilatura.extract(downloaded, output_format='json', include_comments=False)
                        
                        if result:
                            data = json.loads(result)
                            
                            category = classify_story(data.get('title') or title, data.get('text'))
                            story_data = {
                                'source': source_name,
                                'url': url,
                                'title': data.get('title') or title,
                                'author': data.get('author'),
                                'published_date': data.get('date') or entry.get('published'),
                                'lead_image_url': data.get('image'),
                                'content_text': data.get('text'),
                                'category': category
                            }
                            
                            save_story(story_data)
                            scraped_stories.append(story_data)
                        else:
                            print(f"    Failed to extract text for {url}")
                except Exception as e:
                    print(f"    Error fetching {url}: {e}")
                    
        except Exception as e:
            print(f"Error parsing feed {source_name}: {e}")
            
    return scraped_stories

def scrape_single_url(url):
    """Fetch and extract a single article by its URL."""
    print(f"Scraping single URL: {url}...")
    try:
        response = httpx.get(url, headers=HEADERS, timeout=10.0)
        if response.status_code == 200:
            downloaded = response.text
            result = trafilatura.extract(downloaded, output_format='json', include_comments=False)
            if result:
                data = json.loads(result)
                # Determine source name from domain
                from urllib.parse import urlparse
                domain = urlparse(url).netloc
                source_name = domain.replace("www.", "")
                
                category = classify_story(data.get('title') or "", data.get('text') or "")
                
                return {
                    'source': source_name,
                    'url': url,
                    'title': data.get('title') or "User Submitted Story",
                    'author': data.get('author'),
                    'published_date': data.get('date'),
                    'lead_image_url': data.get('image'),
                    'content_text': data.get('text'),
                    'category': category
                }
            else:
                print(f"Failed trafilatura extraction on {url}")
        else:
            print(f"HTTP error {response.status_code} fetching {url}")
    except Exception as e:
        print(f"Error scraping single URL {url}: {e}")
    return None

if __name__ == "__main__":
    stories = scrape_feeds()
    print(f"Scrape complete. Scraped {len(stories)} stories.")
