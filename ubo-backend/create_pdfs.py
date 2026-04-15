from fpdf import FPDF

documents = {
    "Mossack_Fonseca_Registry.pdf": [
        "REPUBLIC OF PANAMA - REGISTRY OF CORPORATIONS",
        "ANNUAL DISCLOSURE STATEMENT - 2024",
        "",
        "Pursuant to the Corporate Transparency Act of the Republic of Panama, it is hereby recorded that Mossack Fonseca Holdings SA is a registered entity operating under the laws of Panama.",
        "",
        "As of the most recent shareholder meeting held on March 14, 2024, Mossack Fonseca Holdings SA holds a 100% equity stake in Seychelles Shell Co Ltd.",
        "",
        "Furthermore, Nominee Director A has been formally appointed as the sole executive director of Mossack Fonseca Holdings SA, retaining full signatory rights over all corporate accounts."
    ],
    "BVI_Corporate_Filing.pdf": [
        "BRITISH VIRGIN ISLANDS - FINANCIAL SERVICES COMMISSION",
        "NOTICE OF BENEFICIAL OWNERSHIP",
        "",
        "This document serves as the official structural declaration for BVI Holdings Ltd, registered at Craigmuir Chambers, Road Town, Tortola.",
        "",
        "The board formally acknowledges that Seychelles Shell Co Ltd maintains a controlling interest, specifically owning 67% of the issued share capital of BVI Holdings Ltd.",
        "",
        "Let it be noted for the official registry that Nominee Director A acts as the primary regional director for BVI Holdings Ltd."
    ],
    "Luxembourg_SPV_Docs.pdf": [
        "GRAND DUCHY OF LUXEMBOURG - TRADE AND COMPANIES REGISTER",
        "SPECIAL PURPOSE VEHICLE DECLARATION",
        "",
        "Luxembourg SPV SA is formally established as a special purpose investment vehicle.",
        "",
        "The capital structure of this vehicle is entirely backed by foreign investment. The corporate ledger confirms that BVI Holdings Ltd retains 100% ownership of Luxembourg SPV SA.",
        "",
        "Under the current asset management agreement, Luxembourg SPV SA manages foreign strategic assets, which includes holding a 40% equity stake in Mossack Fonseca Holdings SA."
    ]
}

def create_pdfs():
    for filename, lines in documents.items():
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Times", size=12)
        
        # Add a title-like structure
        pdf.set_font("Times", style='B', size=14)
        pdf.cell(w=190, h=10, text=lines[0], new_x="LMARGIN", new_y="NEXT", align='C')
        pdf.cell(w=190, h=10, text=lines[1], new_x="LMARGIN", new_y="NEXT", align='C')
        
        pdf.set_font("Times", size=12)
        for line in lines[2:]:
            pdf.multi_cell(w=190, h=10, text=line)
            
        pdf.output(filename)
        print(f"Generated {filename}")

if __name__ == "__main__":
    create_pdfs()
