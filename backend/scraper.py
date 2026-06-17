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

def clean_content(text):
    if not text:
        return ""
        
    trash_patterns = [
        r"(?i)cookie policy",
        r"(?i)privacy policy",
        r"(?i)all rights reserved",
        r"(?i)subscribe to our newsletter",
        r"(?i)follow us on (twitter|facebook|instagram)",
        r"(?i)read more (here|on our website)",
        r"(?i)sign up to (our|the) newsletter",
        r"(?i)this article was originally published",
        r"(?i)click here to read",
        r"(?i)ad blocker detected",
        r"(?i)advertisement",
        r"(?i)sponsored content",
        r"(?i)share this article",
        r"(?i)terms of use",
        r"(?i)terms and conditions",
    ]
    
    cleaned_lines = []
    for line in text.split("\n"):
        line_strip = line.strip()
        if not line_strip:
            continue
            
        import re
        is_trash = False
        for pattern in trash_patterns:
            if re.search(pattern, line_strip):
                is_trash = True
                break
                
        if not is_trash:
            cleaned_lines.append(line_strip)
            
    return "\n\n".join(cleaned_lines)

def extract_soup_metadata(html_content):
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html_content, 'html.parser')
        
        def get_meta(property_name=None, name_name=None):
            if property_name:
                tag = soup.find('meta', property=property_name)
                if tag: return tag.get('content')
            if name_name:
                tag = soup.find('meta', attrs={'name': name_name})
                if tag: return tag.get('content')
            return None

        title = get_meta(property_name="og:title") or get_meta(name_name="twitter:title")
        image = get_meta(property_name="og:image") or get_meta(name_name="twitter:image")
        author = get_meta(name_name="author") or get_meta(property_name="article:author")
        date = get_meta(property_name="article:published_time") or get_meta(name_name="pubdate")
        
        return {
            "title": title,
            "image": image,
            "author": author,
            "date": date
        }
    except Exception as e:
        print(f"Error in extract_soup_metadata: {e}")
        return {}

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
                            soup_meta = extract_soup_metadata(downloaded)
                            
                            raw_text = data.get('text')
                            cleaned = clean_content(raw_text)
                            
                            # Merge BeautifulSoup metadata with Trafilatura extraction
                            meta_title = soup_meta.get('title') or data.get('title') or title
                            meta_image = soup_meta.get('image') or data.get('image')
                            meta_author = soup_meta.get('author') or data.get('author')
                            meta_date = soup_meta.get('date') or data.get('date') or entry.get('published')
                            
                            category = classify_story(meta_title, cleaned)
                            story_data = {
                                'source': source_name,
                                'url': url,
                                'title': meta_title,
                                'author': meta_author,
                                'published_date': meta_date,
                                'lead_image_url': meta_image,
                                'content_text': cleaned,
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
                soup_meta = extract_soup_metadata(downloaded)
                
                # Determine source name from domain
                from urllib.parse import urlparse
                domain = urlparse(url).netloc
                source_name = domain.replace("www.", "")
                
                raw_text = data.get('text')
                cleaned = clean_content(raw_text)
                
                meta_title = soup_meta.get('title') or data.get('title') or "User Submitted Story"
                meta_image = soup_meta.get('image') or data.get('image')
                meta_author = soup_meta.get('author') or data.get('author')
                meta_date = soup_meta.get('date') or data.get('date')
                
                category = classify_story(meta_title, cleaned)
                
                return {
                    'source': source_name,
                    'url': url,
                    'title': meta_title,
                    'author': meta_author,
                    'published_date': meta_date,
                    'lead_image_url': meta_image,
                    'content_text': cleaned,
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
