import os
import sys
import shutil
import tempfile
import subprocess
import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SEPARATED_DIR = os.path.join(os.getcwd(), "separated")
os.makedirs(SEPARATED_DIR, exist_ok=True)
app.mount("/separated", StaticFiles(directory=SEPARATED_DIR), name="separated")

# Lazy-load demucs model
_model = None
_model_name = None

def get_demucs_model(name="htdemucs"):
    global _model, _model_name
    if _model is not None and _model_name == name:
        return _model
    from demucs.pretrained import get_model
    print(f"Loading Demucs model '{name}'...")
    _model = get_model(name)
    _model_name = name
    _model.eval()
    print(f"Model '{name}' loaded. Sources: {_model.sources}")
    return _model

def load_audio(path, target_sr=44100):
    """Load audio using ffmpeg->wav->soundfile (no torchaudio needed)."""
    tmpwav = path + ".tmp.wav"
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", path,
            "-ar", str(target_sr), "-ac", "2", "-f", "wav", tmpwav
        ], check=True, capture_output=True, text=True)
        data, sr = sf.read(tmpwav, dtype="float32")
    except Exception:
        # Fallback: try soundfile directly
        data, sr = sf.read(path, dtype="float32")
    finally:
        if os.path.exists(tmpwav):
            os.remove(tmpwav)
    
    # data shape: (samples, channels) -> tensor (channels, samples)
    if data.ndim == 1:
        tensor = torch.from_numpy(data).unsqueeze(0).repeat(2, 1)
    else:
        tensor = torch.from_numpy(data.T)
    
    # Ensure stereo
    if tensor.shape[0] == 1:
        tensor = tensor.repeat(2, 1)
    elif tensor.shape[0] > 2:
        tensor = tensor[:2]
    
    return tensor, target_sr

def save_audio(path, tensor, sr):
    """Save tensor to WAV using soundfile."""
    # tensor: (channels, samples)
    data = tensor.cpu().numpy().T  # -> (samples, channels)
    sf.write(path, data, sr)

@app.post("/separate")
async def separate_audio(file: UploadFile = File(...)):
    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, file.filename)
        with open(input_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        models_to_try = ["htdemucs_6s", "htdemucs"]
        
        for model_name in models_to_try:
            try:
                print(f"=== Trying '{model_name}' for {file.filename} ===")
                model = get_demucs_model(model_name)

                wav, sr = load_audio(input_path, model.samplerate)
                print(f"Audio: shape={wav.shape}, sr={sr}")

                # Normalize
                ref = wav.mean(0)
                wav_norm = (wav - ref.mean()) / (ref.std() + 1e-8)

                # Separate
                from demucs.apply import apply_model
                print("Running AI separation...")
                with torch.no_grad():
                    sources = apply_model(model, wav_norm[None], progress=True)[0]

                # De-normalize
                sources = sources * (ref.std() + 1e-8) + ref.mean()
                print(f"Done! {len(model.sources)} stems: {model.sources}")

                # Save stems
                base_name = os.path.splitext(file.filename)[0]
                result_paths = {}
                for i, src_name in enumerate(model.sources):
                    fname = f"{base_name}_{src_name}.wav"
                    fpath = os.path.join(SEPARATED_DIR, fname)
                    save_audio(fpath, sources[i], model.samplerate)
                    result_paths[src_name] = f"http://127.0.0.1:8000/separated/{fname}"
                    print(f"  ✓ {src_name} -> {fname}")

                return {"status": "success", "model": model_name, "stems": result_paths}

            except Exception as e:
                import traceback
                print(f"'{model_name}' failed: {e}")
                traceback.print_exc()
                continue

        return JSONResponse(status_code=500, content={
            "error": "Separation failed",
            "details": "All models failed. Check server logs."
        })

if __name__ == "__main__":
    print(f"Python: {sys.executable}")
    print(f"PyTorch: {torch.__version__}")
    print(f"Output: {SEPARATED_DIR}")
    uvicorn.run(app, host="127.0.0.1", port=8000)
