from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os
import shutil
from pathlib import Path
import uuid
from typing import List
from services.converter import FileConverter
import aiofiles

class ConvertRequest(BaseModel):
    file_id: str
    target_format: str
    original_name: str

app = FastAPI(title="File Converter API", version="1.0.0")

# Configuration CORS pour permettre les requêtes depuis le frontend React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # URL du frontend React
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dossiers pour les fichiers
UPLOAD_FOLDER = Path("../uploads")
CONVERTED_FOLDER = Path("../converted")

# Créer les dossiers s'ils n'existent pas
UPLOAD_FOLDER.mkdir(exist_ok=True)
CONVERTED_FOLDER.mkdir(exist_ok=True)

converter = FileConverter()

@app.get("/")
async def root():
    return {"message": "File Converter API is running"}

@app.get("/supported-formats")
async def get_supported_formats():
    """Retourne les formats de fichiers supportés"""
    return {
        "input_formats": [
            "docx", "pdf", "xlsx", "csv", "txt", "pptx", "jpg", "jpeg", "png", "bmp"
        ],
        "output_formats": [
            "pdf", "docx", "txt", "csv", "xlsx", "png", "jpg"
        ]
    }

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload un fichier et retourne les informations"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Aucun fichier sélectionné")
    
    # Générer un nom unique pour le fichier
    file_id = str(uuid.uuid4())
    file_extension = Path(file.filename).suffix
    unique_filename = f"{file_id}{file_extension}"
    file_path = UPLOAD_FOLDER / unique_filename
    
    try:
        # Sauvegarder le fichier
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
        
        return {
            "file_id": file_id,
            "original_name": file.filename,
            "file_path": str(file_path),
            "file_size": len(content),
            "file_type": file_extension[1:] if file_extension else "unknown"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors du téléchargement: {str(e)}")

@app.post("/convert")
async def convert_file(request: ConvertRequest):
    """Convertit un fichier vers le format cible"""
    try:
        # Validation des paramètres
        if not all([request.file_id, request.target_format, request.original_name]):
            raise HTTPException(
                status_code=422,
                detail="Tous les champs sont requis: file_id, target_format, et original_name"
            )
            
        # Trouver le fichier source
        source_files = list(UPLOAD_FOLDER.glob(f"{request.file_id}.*"))
        if not source_files:
            raise HTTPException(status_code=404, detail="Fichier non trouvé")
        
        source_path = source_files[0]
        
        # Générer le nom du fichier converti
        base_name = Path(request.original_name).stem
        converted_filename = f"{base_name}_converted.{request.target_format}"
        converted_path = CONVERTED_FOLDER / f"{request.file_id}_{converted_filename}"
        
        # Effectuer la conversion
        success = await converter.convert_file(
            source_path, 
            converted_path, 
            request.target_format
        )
        
        if success:
            return {
                "success": True,
                "converted_file_id": request.file_id,
                "converted_filename": converted_filename,
                "download_url": f"/download/{request.file_id}_{converted_filename}"
            }
        else:
            raise HTTPException(status_code=500, detail="Échec de la conversion")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur lors de la conversion: {str(e)}")

@app.get("/download/{filename}")
async def download_file(filename: str):
    """Télécharge un fichier converti"""
    file_path = CONVERTED_FOLDER / filename
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier non trouvé")
    
    # Mapping des extensions vers les types MIME
    mime_types = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.csv': 'text/csv',
        '.txt': 'text/plain',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.bmp': 'image/bmp'
    }
    
    # Déterminer le type MIME en fonction de l'extension
    file_extension = Path(filename).suffix.lower()
    media_type = mime_types.get(file_extension, 'application/octet-stream')
    
    # Vérifier la taille du fichier
    file_size = file_path.stat().st_size
    if file_size > 100 * 1024 * 1024:  # Si plus grand que 100MB
        raise HTTPException(
            status_code=413,
            detail="Le fichier est trop volumineux pour être téléchargé"
        )
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=media_type,
        headers={
            'Content-Disposition': f'attachment; filename="{filename}"',
            'Content-Length': str(file_size)
        }
    )

@app.delete("/cleanup/{file_id}")
async def cleanup_files(file_id: str):
    """Nettoie les fichiers temporaires"""
    try:
        # Supprimer les fichiers source et convertis
        for folder in [UPLOAD_FOLDER, CONVERTED_FOLDER]:
            for file_path in folder.glob(f"{file_id}*"):
                file_path.unlink()
        
        return {"success": True, "message": "Fichiers nettoyés"}
    except Exception as e:
        return {"success": False, "message": f"Erreur lors du nettoyage: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
