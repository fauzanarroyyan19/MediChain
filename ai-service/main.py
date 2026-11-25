import io
import os
import re
from typing import Optional

import pytesseract
from fastapi import FastAPI, Header, HTTPException, Request
from pdf2image import convert_from_bytes
from PIL import Image, ImageOps, ImageEnhance

app = FastAPI(title="MediChain Local OCR", version="1.0.0")
MAX_BYTES = 15 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}
NUMBER = r"[<>≤≥]?\s*-?\d+(?:[.,]\d+)?"
RESULT_PATTERN = re.compile(
    rf"^(?P<name>.+?)\s+(?P<value>{NUMBER}(?:\s*[-–]\s*{NUMBER})?)\s*(?P<unit>[A-Za-zµμ/%³^0-9._-]+)?\s+(?P<reference>{NUMBER}\s*[-–]\s*{NUMBER})\s*$"
)
UNIT_PATTERN = re.compile(r"(?:g/dl|mg/dl|mmol/l|10\^?\d*/?l|/µl|/μl|/ul|%|bpm|mmhg|ng/ml|iu/l)", re.I)


def parse_rows(text: str):
    rows = []
    normalized = re.sub(r"\s+", " ", text).strip()
    # Tesseract often flattens table rows into one paragraph. Locate familiar CBC
    # parameter labels first, then parse each bounded text segment independently.
    parameters = [
        "Hemoglobin", "Hematokrit", "Eritrosit", "Leukosit", "Trombosit",
        "Ferritin", "Hematokrit", "Neutrofil", "Limfosit", "Monosit",
        "Eosinofil", "Basofil", "MCV", "MCHC", "MCH", "RDW", "MPV",
        "HCT", "RBC", "WBC", "PLT", "Hb", "HbA1c", "A1C",
        "Glukosa puasa", "Glukosa", "Gula darah", "Kreatinin", "Creatinine",
        "Ureum", "Urea", "Kolesterol total", "Kolesterol", "Cholesterol",
        "Trigliserida", "Triglycerides", "LDL", "HDL", "Asam urat", "Uric acid",
        "SGOT", "SGPT", "AST", "ALT", "Natrium", "Sodium", "Kalium",
        "Potassium", "Klorida", "Chloride", "Albumin", "Bilirubin", "TSH",
        "FT3", "FT4", "CRP", "LED", "ESR",
    ]
    labels = sorted(set(parameters), key=len, reverse=True)
    label_pattern = re.compile(r"(?<![\w])(" + "|".join(re.escape(x) for x in labels) + r")(?![\w])", re.I)
    matches = list(label_pattern.finditer(normalized))
    for index, label_match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else min(len(normalized), label_match.end() + 140)
        segment = normalized[label_match.end():end].strip(" :|\t")
        range_match = re.search(rf"(?P<value>{NUMBER})\s+(?P<unit>.*?)\s+(?P<reference>{NUMBER}\s*[-–]\s*{NUMBER})(?:\s|$)", segment, re.I)
        if not range_match:
            continue
        value = range_match.group("value").strip()
        unit = re.sub(r"\s+", " ", range_match.group("unit")).strip(" :|-")
        reference = re.sub(r"\s+", "", range_match.group("reference")).replace("–", "-")
        if not value or value.casefold() in {"tidak tersedia", "n/a", "na"}:
            continue
        rows.append({
            "testName": label_match.group(1),
            "resultValue": value,
            "unit": unit[:32],
            "referenceRange": reference[:64],
            "sourceLine": f"{label_match.group(1)} {segment}"[:240],
        })

    if rows:
        return rows[:100]

    # Fallback for documents where OCR preserves one result per line.
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip(" |\t")
        match = RESULT_PATTERN.match(line)
        if not match:
            continue
        name = match.group("name").strip(" :-|")
        if len(name) > 1 and not re.search(r"^(hasil|result|nilai|range|reference|pemeriksaan)$", name, re.I):
            unit = (match.group("unit") or "").strip()
            rows.append({"testName": name[:120], "resultValue": match.group("value").strip(), "unit": unit[:32], "referenceRange": match.group("reference").strip()[:64], "sourceLine": line[:240]})
    return rows[:100]


def preprocess(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("L")
    image = ImageOps.autocontrast(image)
    if image.width < 1400:
        scale = min(2.0, 1400 / max(image.width, 1))
        image = image.resize((int(image.width * scale), int(image.height * scale)))
    return ImageEnhance.Contrast(image).enhance(1.4)


@app.get("/health")
def health():
    return {"status": "ok", "engine": "tesseract"}


@app.post("/scan")
async def scan(request: Request, x_filename: Optional[str] = Header(default="document"), x_ai_service_token: Optional[str] = Header(default=None)):
    expected = os.getenv("AI_SERVICE_TOKEN", "")
    if not expected or x_ai_service_token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized AI service client")
    data = await request.body()
    if not data or len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File must be between 1 byte and 15 MB")
    filename = (x_filename or "document").replace("\\", "/").split("/")[-1]
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Supported files: PDF, PNG, JPG, TIFF, BMP, WEBP")
    try:
        tesseract_cmd = os.getenv("TESSERACT_CMD")
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
        if ext == ".pdf":
            poppler_path = os.getenv("POPPLER_PATH") or None
            pages = convert_from_bytes(data, dpi=220, first_page=1, last_page=12, poppler_path=poppler_path)
        else:
            pages = [Image.open(io.BytesIO(data))]
        if len(pages) > 12:
            raise HTTPException(status_code=413, detail="PDF is limited to 12 pages")
        available_languages = set(pytesseract.get_languages(config=""))
        language = "+".join(code for code in ("eng", "ind") if code in available_languages) or "eng"
        texts = [pytesseract.image_to_string(preprocess(page), lang=language, config="--psm 6") for page in pages]
        text = "\n".join(texts).strip()
        if not text:
            raise HTTPException(status_code=422, detail="No readable text found. Try a clearer scan or image.")
        return {"filename": filename, "pageCount": len(pages), "languages": language.split("+"), "rawText": text[:30000], "results": parse_rows(text), "reviewRequired": True}
    except HTTPException:
        raise
    except pytesseract.TesseractNotFoundError as exc:
        raise HTTPException(status_code=503, detail="Tesseract OCR is not installed on the AI service host") from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read this document: {str(exc)[:180]}") from exc
