import os
import sqlite3
import re
from pathlib import Path
from locality_intelligence.source_registry import SOURCES
from db.sqlite import get_db_path

def fix_seed_file():
    seed_path = Path("locality_intelligence/seed.py")
    content = seed_path.read_text("utf-8")
    
    # Replace URLs in seed.py with base URLs from SOURCES
    for src in SOURCES:
        if src.sourceName == "Hindustan Times — Mumbai":
            content = re.sub(r'"https://www\.hindustantimes\.com/cities/mumbai-news/[^"]+"', '"https://www.hindustantimes.com/cities/mumbai-news/"', content)
        elif src.sourceName == "Mid-Day — Mumbai":
            content = re.sub(r'"https://www\.mid-day\.com/[^"]+"', '"https://www.mid-day.com/mumbai/"', content)
        else:
            pattern = r'"' + re.escape(src.baseUrl) + r'[^"]+"'
            replacement = f'"{src.baseUrl}/"'
            content = re.sub(pattern, replacement, content)
            
    seed_path.write_text(content, "utf-8")
    print("Fixed seed.py")

def fix_db():
    db_path = get_db_path()
    print(f"Updating DB at {db_path}")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT event_id, source_name FROM locality_event_cache")
    rows = c.fetchall()
    
    source_map = {s.sourceName: s.baseUrl for s in SOURCES}
    
    for row in rows:
        event_id, source_name = row
        if source_name == "Hindustan Times — Mumbai":
            new_url = "https://www.hindustantimes.com/cities/mumbai-news/"
        elif source_name == "Mid-Day — Mumbai":
            new_url = "https://www.mid-day.com/mumbai/"
        else:
            new_url = source_map.get(source_name, "") + "/" if source_map.get(source_name) else None
            
        if new_url:
            c.execute("UPDATE locality_event_cache SET source_url = ? WHERE event_id = ?", (new_url, event_id))
            
    conn.commit()
    conn.close()
    print("Fixed database URLs")

if __name__ == "__main__":
    fix_seed_file()
    fix_db()
