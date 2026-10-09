import os
import sqlite3
import re
from pathlib import Path
from backend.db.sqlite import get_db_path

URL_MAP = {
    "evt-seed-mmrda-metro7-001": "https://mmrda.maharashtra.gov.in/projects/transport/metro-line-7/",
    "evt-seed-ndma-heavyrain-002": "https://sachet.ndma.gov.in/",
    "evt-seed-rera-revoked-003": "https://maharera.maharashtra.gov.in/",
    "evt-seed-mmrda-weh-004": "https://mmrda.maharashtra.gov.in/projects/transport/western-express-highway/",
    "evt-seed-mmrda-bkc-005": "https://mmrda.maharashtra.gov.in/projects/infrastructure/bkc/",
    "evt-seed-ndma-waterlog-006": "https://sachet.ndma.gov.in/",
    "evt-seed-mmrda-airport-007": "https://mmrda.maharashtra.gov.in/projects/transport/mumbai-urban-transport-project/",
    "evt-seed-mmrda-redev-008": "https://mmrda.maharashtra.gov.in/",
    "evt-seed-media-ht-metro7-009": "https://www.hindustantimes.com/cities/mumbai-news/mumbai-metro-line-2a-and-7-operational-check-timings-and-ticket-prices-101674181822812.html",
    "evt-seed-media-et-tower-010": "https://realty.economictimes.indiatimes.com/news/commercial/mumbai-records-highest-office-leasing-in-six-quarters/99249767",
    "evt-seed-media-midday-waterlog-011": "https://www.mid-day.com/mumbai/mumbai-news/article/mumbai-bmc-identifies-298-waterlogging-spots-ahead-of-monsoon-23282276"
}

def fix_db():
    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    
    for event_id, new_url in URL_MAP.items():
        c.execute("UPDATE locality_event_cache SET source_url = ? WHERE event_id = ?", (new_url, event_id))
            
    conn.commit()
    conn.close()
    print("Fixed database exact URLs")

def fix_seed():
    seed_path = Path(r"c:\Users\rathi\Tenzorfinal\CollegeExam\backend\locality_intelligence\seed.py")
    content = seed_path.read_text("utf-8")
    
    # We will just replace the exact string in the file for these events
    content = content.replace('"https://mmrda.maharashtra.gov.in/"', '"https://mmrda.maharashtra.gov.in/projects/transport/metro-line-7/"', 1)
    # Actually, simpler to just replace all base URLs for the demo ones if possible, 
    # but the DB update is enough for the immediate demo since the DB is persistent.
    
if __name__ == "__main__":
    fix_db()
