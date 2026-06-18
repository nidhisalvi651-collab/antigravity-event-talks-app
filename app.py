from flask import Flask, render_template, jsonify, request
import requests
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup
import time
import re

app = Flask(__name__)

# Simple in-memory cache to avoid hitting Google's feed URL on every page load
CACHE_DURATION = 1800  # 30 minutes
cache = {
    "data": None,
    "last_fetched": 0
}

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def clean_html_content(soup):
    """Clean and transform release note HTML content for safe, responsive display."""
    # Ensure all links open in a new tab
    for a in soup.find_all('a'):
        a['target'] = '_blank'
        a['rel'] = 'noopener noreferrer'
    return str(soup)

def fetch_and_parse_feed():
    """Fetches the Google BigQuery release notes Atom feed and parses it into structured JSON."""
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    response = requests.get(FEED_URL, headers=headers)
    response.raise_for_status()
    xml_data = response.content
    
    root = ET.fromstring(xml_data)
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    entries = root.findall('atom:entry', ns)
    parsed_entries = []
    
    for entry in entries:
        # Get entry details
        title_elem = entry.find('atom:title', ns)
        date_str = title_elem.text.strip() if title_elem is not None else "Unknown Date"
        
        updated_elem = entry.find('atom:updated', ns)
        updated_val = updated_elem.text.strip() if updated_elem is not None else ""
        
        link_elem = entry.find('atom:link[@rel="alternate"]', ns)
        link_href = link_elem.attrib['href'] if link_elem is not None else ""
        
        content_elem = entry.find('atom:content', ns)
        content_html = content_elem.text if content_elem is not None else ""
        
        # Parse HTML content with BeautifulSoup
        soup = BeautifulSoup(content_html, 'html.parser')
        headers_tags = soup.find_all(['h3', 'h4'])
        
        sections = []
        if not headers_tags:
            # No headings, parse the whole thing as a single general update
            clean_content = clean_html_content(soup)
            text_content = soup.get_text().strip()
            sections.append({
                "id": f"{date_str.lower().replace(' ', '_')}_gen",
                "type": "General",
                "html": clean_content,
                "text": text_content
            })
        else:
            for idx, header in enumerate(headers_tags):
                section_type = header.get_text().strip()
                
                # Retrieve siblings until the next h3 or h4 header
                sibling = header.next_sibling
                section_elems = []
                while sibling and sibling.name not in ['h3', 'h4']:
                    if sibling.name:
                        section_elems.append(str(sibling))
                    elif str(sibling).strip():
                        section_elems.append(str(sibling))
                    sibling = sibling.next_sibling
                
                section_html_raw = "".join(section_elems).strip()
                section_soup = BeautifulSoup(section_html_raw, 'html.parser')
                section_html_clean = clean_html_content(section_soup)
                section_text = section_soup.get_text().strip()
                
                # Format a unique, web-safe ID for targeting
                safe_type = re.sub(r'[^a-zA-Z0-9]', '', section_type.lower())
                sec_id = f"{date_str.lower().replace(' ', '_')}_{safe_type}_{idx}"
                
                sections.append({
                    "id": sec_id,
                    "type": section_type,
                    "html": section_html_clean,
                    "text": section_text
                })
                
        parsed_entries.append({
            "date": date_str,
            "updated": updated_val,
            "link": link_href,
            "sections": sections
        })
        
    return parsed_entries

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    current_time = time.time()
    
    if force_refresh or not cache["data"] or (current_time - cache["last_fetched"] > CACHE_DURATION):
        try:
            cache["data"] = fetch_and_parse_feed()
            cache["last_fetched"] = current_time
        except Exception as e:
            # If fetch fails but we have cached data, fall back to cache
            if cache["data"]:
                return jsonify({
                    "releases": cache["data"],
                    "cached": True,
                    "warning": f"Failed to refresh feed: {str(e)}. Using cached data.",
                    "last_fetched": cache["last_fetched"]
                })
            return jsonify({"error": str(e)}), 500
            
    return jsonify({
        "releases": cache["data"],
        "cached": not force_refresh,
        "last_fetched": cache["last_fetched"]
    })

@app.route('/api/tweet/simulate', methods=['POST'])
def simulate_tweet():
    data = request.json or {}
    text = data.get('text', '')
    if not text:
        return jsonify({"error": "Tweet text is empty"}), 400
        
    # Simulate API network delay
    time.sleep(1.0)
    return jsonify({
        "status": "success",
        "message": "Tweet successfully posted (Simulation Mode)",
        "tweet": text
    })

if __name__ == '__main__':
    # Using 127.0.0.1:5000 as requested
    app.run(debug=True, host='127.0.0.1', port=5000)
