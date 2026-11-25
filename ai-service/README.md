# MediChain AI OCR service

This service runs OCR locally. It does not access MySQL, IPFS, blockchain wallets, or private keys.

## Requirements

- Python 3.10+
- Tesseract OCR installed and available on `PATH`
- Poppler installed and available on `PATH` for PDF conversion

Install Python packages and run from this folder:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:AI_SERVICE_TOKEN = "use-the-same-long-random-value-as-backend-env"
uvicorn main:app --host 127.0.0.1 --port 8001
```

Set the same `AI_SERVICE_TOKEN` and `AI_SERVICE_URL=http://127.0.0.1:8001` in `backend/.env`.
OCR output is only a draft. A verified doctor must review and correct every value before MediChain stores it.
