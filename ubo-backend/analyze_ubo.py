import os
import json
import sqlite3
import fitz  # PyMuPDF
from google import genai
from dotenv import load_dotenv

load_dotenv()
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

# -------------------------------------------------------------------
# RISK SCORING ENGINE
# -------------------------------------------------------------------
HIGH_RISK_JURISDICTIONS = [
    'British Virgin Islands', 'Panama', 'Cayman Islands', 'Seychelles',
    'Luxembourg', 'Marshall Islands', 'Liechtenstein', 'Vanuatu', 'Belize'
]

def calculate_node_risk(node_data, is_in_loop=False, is_puppet=False):
    score = 1.0
    flags = []

    # Jurisdiction Risk (+4 points)
    jurisdiction = node_data.get('jurisdiction', '')
    for haven in HIGH_RISK_JURISDICTIONS:
        if haven.lower() in jurisdiction.lower():
            score += 4.0
            flags.append(f"Offshore Jurisdiction ({haven})")
            break

    # Circular Loop Risk (+5 points)
    if is_in_loop:
        score += 5.0
        flags.append("Circular Ownership Loop")

    # Puppet Director Risk (+3 points)
    if is_puppet:
        score += 3.0
        flags.append("Nominee/Puppet Director Anomaly")

    final_score = min(score, 10.0)

    if final_score >= 8.0:
        level = "critical"
    elif final_score >= 5.0:
        level = "high"
    elif final_score >= 3.0:
        level = "medium"
    else:
        level = "low"

    return round(final_score, 1), level, flags


# -------------------------------------------------------------------
# PDF TEXT EXTRACTION (PyMuPDF - Handles Scans & Pages Better)
# -------------------------------------------------------------------
def extract_text_from_pdf(pdf_path):
    text = ""
    try:
        doc = fitz.open(pdf_path)
        for page_num, page in enumerate(doc):
             text += f"\n[PAGE {page_num + 1}]\n"
             text += page.get_text()
    except Exception as e:
        print(f"Error reading PDF {pdf_path}: {e}")
    return text


# -------------------------------------------------------------------
# OFAC SANCTIONS LOOKUP
# -------------------------------------------------------------------
def check_sanctions(name):
    if not name:
        return []
    conn = sqlite3.connect('sanctions.db')
    c = conn.cursor()
    c.execute(
        "SELECT uid, first_name, last_name, entity_type FROM blocked_entities "
        "WHERE last_name LIKE ? OR first_name LIKE ? OR (first_name || ' ' || last_name) LIKE ?",
        ('%' + name + '%', '%' + name + '%', '%' + name + '%')
    )
    results = c.fetchall()
    conn.close()
    return results


# -------------------------------------------------------------------
# MAIN ANALYSIS PIPELINE
# -------------------------------------------------------------------
def run_pipeline(pdf_paths: list) -> dict:
    all_relationships = []
    
    for pdf_path in pdf_paths:
        print(f"\n=======================================================")
        print(f"STARTING UBO ANALYSIS ON: {pdf_path}")
        print(f"=======================================================")

        print("1. Extracting text from PDF...")
        text = extract_text_from_pdf(pdf_path)
        
        if not text.strip():
            print("No text found in PDF, skipping.")
            continue

        filename = os.path.basename(pdf_path)
        prompt = f"""
        You are a financial forensics AI. Read the following legal document named '{filename}' and extract ALL ownership 
        and directorship relationships, plus any jurisdiction/country information for each entity.
        
        Return ONLY valid JSON in this exact structure:
        {{
          "relationships": [
            {{
              "source": "Entity/Person Name",
              "target": "Entity Name",
              "type": "owns" or "directs",
              "percentage": numerical value or null,
              "jurisdiction": "Country where the SOURCE entity is registered or located, or null",
              "source_text": "the EXACT sentence from the text that proves this relationship including the [PAGE X] tag",
              "source_document": "{filename}",
              "page_number": integer (extract the page number from the [PAGE X] tag as a number)
            }}
          ]
        }}
        
        Text to analyze:
        {text}
        """

        print("2. Sending text to Gemini AI for Forensic Extraction...")
        response = None
        for attempt in range(5):
            try:
                response = client.models.generate_content(
                    model="gemini-2.5-flash-lite",
                    contents=prompt,
                )
                break  # success
            except Exception as e:
                err_str = str(e)
                if '503' in err_str or '429' in err_str:
                    wait = (attempt + 1) * 10
                    print(f"  [Retry {attempt+1}/5] API overloaded, waiting {wait}s...")
                    time.sleep(wait)
                else:
                    raise  # non-retryable error
        if response is None:
            print("  FAILED: Gemini API unavailable after 5 retries, skipping file.")
            continue

        try:
            clean_json = response.text.replace('```json', '').replace('```', '').strip()
            parsed_data = json.loads(clean_json)
            if "relationships" in parsed_data:
                all_relationships.extend(parsed_data["relationships"])
        except json.JSONDecodeError:
            print("FAILED: Gemini did not return valid JSON.")
            print("Raw output:", response.text)

    print("3. Running Sanctions Check + Risk Scoring on combined data...")
    print("-------------------------------------------------------")
    
    # Track puppet directors: entities appearing as source in multiple 'directs' relationships
    director_counts = {}
    for rel in all_relationships:
        if rel["type"] == "directs":
            src = rel["source"]
            director_counts[src] = director_counts.get(src, 0) + 1

    for rel in all_relationships:
        source = rel["source"]
        target = rel["target"]
        jurisdiction = rel.get("jurisdiction") or ""

        # Sanctions checks
        rel["source_sanctioned"] = bool(check_sanctions(source))
        rel["target_sanctioned"] = bool(check_sanctions(target))

        if rel["source_sanctioned"]:
            print(f"  [ALERT] '{source}' is on the OFAC Sanctions list!")
        else:
            print(f"  [SAFE]  '{source}' is clean.")

        if rel["target_sanctioned"]:
            print(f"  [ALERT] '{target}' is on the OFAC Sanctions list!")
        else:
            print(f"  [SAFE]  '{target}' is clean.")

        # Risk scoring
        is_puppet = director_counts.get(source, 0) > 1
        risk_score, risk_level, flags = calculate_node_risk(
            {"jurisdiction": jurisdiction},
            is_in_loop=False,   # Needs graph cycle detection, simplified here
            is_puppet=is_puppet
        )
        rel["risk_score"] = risk_score
        rel["risk_level"] = risk_level
        rel["risk_flags"] = flags

    final_payload = {"relationships": all_relationships}
    
    print("-------------------------------------------------------")
    print("\nFINAL GRAPH PAYLOAD READY:")
    print(json.dumps(final_payload, indent=2))
    
    return final_payload


if __name__ == "__main__":
    pdfs = [
        "Mossack_Fonseca_Registry.pdf",
        "BVI_Corporate_Filing.pdf",
        "Luxembourg_SPV_Docs.pdf",
    ]
    # Local terminal testing
    existing_pdfs = [p for p in pdfs if os.path.exists(p)]
    if existing_pdfs:
       run_pipeline(existing_pdfs)
