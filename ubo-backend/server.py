from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import tempfile
import shutil
import os
from fastapi.staticfiles import StaticFiles

from analyze_ubo import run_pipeline

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict to frontend URL
    allow_methods=["*"],
    allow_headers=["*"]
)

os.makedirs("uploads", exist_ok=True)
app.mount("/docs", StaticFiles(directory="uploads"), name="docs")

@app.post("/analyze")
async def analyze(files: list[UploadFile] = File(...)):
    saved_paths = []
    
    # Save uploaded files to the static uploads directory
    for file in files:
        path = os.path.join("uploads", file.filename)
        with open(path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        saved_paths.append(path)
    
    # Send all files together to the pipeline
    result = run_pipeline(saved_paths)
    
    return JSONResponse(result)

@app.get("/health")
def health():
    return {"status": "ok", "message": "UBO Backend Server Running"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
