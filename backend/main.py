import io
import os
import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from dotenv import load_dotenv

# Local Inference Imports
import torch
from transformers import pipeline

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

# --- Load Model Locally ---
print("Loading Model... (This might download ~1GB on first run)")
device = 0 if torch.cuda.is_available() else -1
print(f"Using Device: {'GPU (CUDA)' if device == 0 else 'CPU'}")

# Initialize the pipeline
rmbg_pipe = pipeline("image-segmentation", model="briaai/RMBG-1.4", trust_remote_code=True, device=device)

@app.post("/api/remove-bg")
async def remove_bg(file: UploadFile = File(...)):
    try:
        # Read image bytes
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")

        # Process with Local Model
        # The pipeline returns the mask or the final image depending on config.
        # For briaai/RMBG-1.4 pipeline, it typically handles the whole segmentation.
        result = rmbg_pipe(image)
        
        # 'result' usually is the segmented image (PIL Image) directly or a list.
        # Let's handle the output. Transformers image-segmentation usually returns a mask or marked image.
        # Bria's model card says: "returns an image with the background removed"
        
        sticker_transparent = result
        
        # Ensure it is RGBA
        if sticker_transparent.mode != 'RGBA':
            sticker_transparent = sticker_transparent.convert("RGBA")
        
        # Return
        img_byte_arr = io.BytesIO()
        sticker_transparent.save(img_byte_arr, format='PNG')
        img_byte_arr.seek(0)
        
        return Response(content=img_byte_arr.getvalue(), media_type="image/png")
        
    except Exception as e:
        print(f"Server Error: {e}")
        return Response(content=f"Server Error: {str(e)}", status_code=500)

