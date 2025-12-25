import io
import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from torchvision import transforms
from transformers import AutoModelForImageSegmentation

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # For dev simplicity
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
model = None
device = "cpu"

def load_rmbg_model():
    global model, device
    print("Loading RMBG-2.0 model...")
    try:
        model = AutoModelForImageSegmentation.from_pretrained("briaai/RMBG-2.0", trust_remote_code=True)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model.to(device)
        model.eval()
        print(f"RMBG-2.0 loaded on {device}!")
        return
    except Exception as e:
        print(f"Warning: Could not load RMBG-2.0 ({e}).")
        print("Trying fallback to RMBG-1.4 (non-gated)...")
    
    try:
        model = AutoModelForImageSegmentation.from_pretrained("briaai/RMBG-1.4", trust_remote_code=True)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model.to(device)
        model.eval()
        print(f"RMBG-1.4 loaded on {device}!")
    except Exception as e:
        print(f"Error loading fallback model: {e}")
        print("Please ensure internet access and Hugging Face access.")

@app.on_event("startup")
def startup_event():
    load_rmbg_model()

def transform_image(image):
    # Standard preprocessing for RMBG-2.0
    image_size = (1024, 1024)
    transform = transforms.Compose([
        transforms.Resize(image_size),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])
    return transform(image).unsqueeze(0).to(device)

def process_sticker_logic(image: Image.Image, border_size: int, border_color: tuple):
    # 1. Inference: Get Alpha Mask
    input_tensor = transform_image(image)
    
    with torch.no_grad():
        preds = model(input_tensor)[0][0]
        # preds is likely [1, H, W] or similar
        preds = torch.nn.functional.interpolate(preds.unsqueeze(0), size=image.size[::-1], mode='bilinear', align_corners=False)
        mask_tensor = torch.sigmoid(preds.squeeze())
    
    mask_np = mask_tensor.cpu().numpy() # 0.0 to 1.0 float
    
    # 2. Prepare for OpenCV
    # Convert original to RGBA numpy
    if image.mode != 'RGBA':
        image = image.convert('RGBA')
    img_np = np.array(image)
    
    # Convert mask to uint8
    mask_u8 = (mask_np * 255).astype(np.uint8)
    
    # 3. Dilate Mask (Create label area)
    # border_size roughly pixels.
    # Note: OpenCV kernel size must be odd
    k_size = (border_size * 2) + 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_size, k_size))
    
    # We dilate the mask to create the sticker backing shape
    dilated_mask = cv2.dilate(mask_u8, kernel, iterations=1)
    
    # 4. Smooth the Border
    # Gaussian Blur + Threshold to round corners
    # Blur sigma
    blur_k = border_size if border_size % 2 == 1 else border_size + 1
    # Ensure blur_k is at least 3
    blur_k = max(3, blur_k)
    
    blurred_mask = cv2.GaussianBlur(dilated_mask, (blur_k, blur_k), 0)
    
    # Threshold strictly to get a hard edge for the sticker outline
    _, sticker_shape_mask = cv2.threshold(blurred_mask, 127, 255, cv2.THRESH_BINARY)
    
    # 5. Composite
    # We want: 
    # Result Layer 0: Transparent
    # Result Layer 1: Sticker Color (e.g. White) where sticker_shape_mask is 255
    # Result Layer 2: Original Image where mask_u8 (original alpha) is high. 
    # Actually, we should just overlay the original image on top of the sticker shape.
    
    h, w = mask_u8.shape
    
    # Create the Sticker Background Layer
    # White (or border_color) filled shape
    sticker_bg = np.zeros((h, w, 4), dtype=np.uint8)
    
    # Fill color (R, G, B) and Alpha=255 where shape is present
    sticker_bg[sticker_shape_mask > 0] = [*border_color, 255]
    
    # Create PIL images
    sticker_bg_pil = Image.fromarray(sticker_bg)
    original_pil = Image.fromarray(img_np)
    
    # To properly composite, we mask the original image with the AI mask first?
    # Usually sticker makers cut out the object cleanly.
    # So we apply the 'mask_np' to the 'original_pil'.
    
    # Create a clean cutout of the object
    # Reset alpha of original image to the mask from AI
    cutout_np = img_np.copy()
    cutout_np[..., 3] = mask_u8 # Replace alpha channel with AI mask
    cutout_pil = Image.fromarray(cutout_np)
    
    # Composite: Place cutout OVER sticker_bg
    final_result = Image.alpha_composite(sticker_bg_pil, cutout_pil)
    
    return final_result

@app.post("/api/stickerize")
async def stickerize(
    file: UploadFile = File(...),
    border_size: int = Form(10),
    border_color_hex: str = Form("#FFFFFF")
):
    if model is None:
        return Response(content="Model not loaded", status_code=503)

    # Read image
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    
    # Parse color
    if border_color_hex.startswith("#"):
        border_color_hex = border_color_hex.lstrip("#")
    
    # robust hex parsing
    try:
        r = int(border_color_hex[0:2], 16)
        g = int(border_color_hex[2:4], 16)
        b = int(border_color_hex[4:6], 16)
        border_color = (r, g, b)
    except:
        border_color = (255, 255, 255) # Fallback White

    # Process
    final_image = process_sticker_logic(image, border_size, border_color)
    
    # Return as PNG
    img_byte_arr = io.BytesIO()
    final_image.save(img_byte_arr, format='PNG')
    img_byte_arr.seek(0)
    
    return Response(content=img_byte_arr.getvalue(), media_type="image/png")
