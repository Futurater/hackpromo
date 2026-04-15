import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configure the API
genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))


def test_extraction():
    model = genai.GenerativeModel('gemini-2.5-flash')

    test_text = """
    Pursuant to the board meeting held on 14th March 2023, it is hereby declared that 
    Alpha Holdings Ltd, a registered entity in the British Virgin Islands, maintains a 
    100% equity stake in Beta Corp. Furthermore, Mr. John Smith acts as the sole nominee 
    director for Beta Corp and holds 45% of Gamma LLC on behalf of the trust.
    """

    prompt = f"""
    You are a financial forensics AI. Read the following text and extract the ownership 
    and directorship relationships. 
    
    Return ONLY valid JSON in this exact structure:
    {{
      "relationships": [
        {{
          "source": "Entity/Person Name",
          "target": "Entity Name",
          "type": "owns" or "directs",
          "percentage": numerical value or null,
          "evidence": "the exact sentence from the text proving this"
        }}
      ]
    }}
    
    Text to analyze:
    {test_text}
    """

    print("Sending text to Gemini...")
    response = model.generate_content(prompt)

    print("\n--- EXTRACTION RESULT ---")
    try:
        clean_json = response.text.replace('```json', '').replace('```', '').strip()
        parsed_data = json.loads(clean_json)
        print(json.dumps(parsed_data, indent=2))
        print("\nSUCCESS: Valid JSON extracted.")
    except json.JSONDecodeError:
        print("FAILED: Gemini did not return valid JSON.")
        print("Raw output:", getattr(response, 'text', str(response)))


if __name__ == "__main__":
    test_extraction()
