import xml.etree.ElementTree as ET
import sqlite3
import os
import urllib.request

def download_ofac_xml(xml_file):
    url = "https://www.treasury.gov/ofac/downloads/sdn.xml"
    print(f"Downloading OFAC XML from {url}...")
    try:
        urllib.request.urlretrieve(url, xml_file)
        print("Download complete.")
    except Exception as e:
        print(f"Failed to download: {e}")
        print("Please download manually from https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists and save as 'sdn.xml'.")

def load_ofac_to_sqlite():
    xml_file = 'sdn.xml'
    db_file = 'sanctions.db'
    
    if not os.path.exists(xml_file):
        download_ofac_xml(xml_file)
        if not os.path.exists(xml_file):
            return

    print("Connecting to local SQLite database...")
    conn = sqlite3.connect(db_file)
    c = conn.cursor()
    
    # Create a simple, fast table
    c.execute('''
        CREATE TABLE IF NOT EXISTS blocked_entities (
            uid TEXT PRIMARY KEY,
            first_name TEXT,
            last_name TEXT,
            entity_type TEXT
        )
    ''')
    # Clear old data if you run it twice
    c.execute('DELETE FROM blocked_entities')

    print("Parsing OFAC XML (this might take a few seconds)...")
    try:
        tree = ET.parse(xml_file)
        root = tree.getroot()
        
        namespace = {'ns': 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/XML'}
        
        count = 0
        for entry in root.findall('ns:sdnEntry', namespace):
            uid_elem = entry.find('ns:uid', namespace)
            uid = uid_elem.text if uid_elem is not None else "Unknown"
            
            ln_elem = entry.find('ns:lastName', namespace)
            last_name = ln_elem.text if ln_elem is not None else ""
            
            fn_elem = entry.find('ns:firstName', namespace)
            first_name = fn_elem.text if fn_elem is not None else ""
            
            type_elem = entry.find('ns:sdnType', namespace)
            sdn_type = type_elem.text if type_elem is not None else "Unknown"
            
            c.execute("INSERT INTO blocked_entities (uid, first_name, last_name, entity_type) VALUES (?, ?, ?, ?)",
                      (uid, first_name, last_name, sdn_type))
            count += 1

        conn.commit()
        print(f"SUCCESS: Loaded {count} sanctioned entities into local offline database.")
    except Exception as e:
        print(f"Error parsing XML: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    load_ofac_to_sqlite()
