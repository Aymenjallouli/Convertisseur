# Convertisseur de Fichiers

Une application web full-stack permettant de convertir différents types de fichiers (images, documents, etc.).

## Fonctionnalités

- Conversion de fichiers PDF
- Conversion d'images (PNG, JPG, JPEG, BMP)
- Conversion de documents (DOCX, TXT)
- Interface utilisateur intuitive avec glisser-déposer
- Prévisualisation des fichiers
- Gestion des erreurs
- Design responsive

## Technologies Utilisées

### Frontend
- React.js
- Material-UI
- Axios

### Backend
- Python
- FastAPI
- Pillow (PIL)
- python-docx
- img2pdf
- docx2pdf

## Installation

1. Cloner le repository :
```bash
git clone https://github.com/Aymenjallouli/Convertisseur.git
cd Convertisseur
```

2. Installer les dépendances du backend :
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

3. Installer les dépendances du frontend :
```bash
cd frontend
npm install
```

## Démarrage

1. Démarrer le backend :
```bash
cd backend
.\venv\Scripts\activate  # Windows
uvicorn main:app --reload
```

2. Démarrer le frontend :
```bash
cd frontend
npm start
```

L'application sera accessible à l'adresse http://localhost:3000

## Déploiement

L'application est déployée sur Fly.io.

## Licence

MIT License
