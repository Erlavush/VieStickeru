import io
import os
import cv2
import numpy as np
import requests
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
HF_API_URL = "https://api-inference.huggingface.co/models/briaai/RMBG-1.4"
# We read the token from the environment. 
# User must create a .env file with HF_TOKEN=...
HF_TOKEN = os.getenv("HF_TOKEN")

@app.post("/api/remove-bg")
async def remove_bg(file: UploadFile = File(...)):
    try:
        # Read image bytes
        contents = await file.read()
        
        if not HF_TOKEN:
            return Response(content="Missing API Token", status_code=500)

        # 1. Send to Hugging Face API
        headers = {"Authorization": f"Bearer {HF_TOKEN}"}
        # Using RMBG-1.4 as it allows free access via Inference API
        response = requests.post(HF_API_URL, headers=headers, data=contents)
    
        if response.status_code != 200:
            print(f"API Error: {response.status_code} - {response.text}")
            raise Exception("API request failed.")

        # 2. Process Result - Just get the RGBA image
        # The API returns the image with the background REMOVED (RGBA)
        sticker_transparent = Image.open(io.BytesIO(response.content)).convert("RGBA")
        
        # Return
        img_byte_arr = io.BytesIO()
        sticker_transparent.save(img_byte_arr, format='PNG')
        img_byte_arr.seek(0)
        
        return Response(content=img_byte_arr.getvalue(), media_type="image/png")
        
    except Exception as e:
        print(f"Server Error: {e}")
        return Response(content="Internal Server Error", status_code=500)
