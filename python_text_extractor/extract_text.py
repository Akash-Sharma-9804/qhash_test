# import sys
# import json
# import pytesseract
# from PIL import Image
# from io import BytesIO
# from pdfminer.high_level import extract_text as extract_pdf_text
# from docx import Document
# import pandas as pd
# import base64
# import tempfile
# import fitz  # PyMuPDF

# def extract_docx_text(content):
#     with BytesIO(content) as f:
#         doc = Document(f)
#         return "\n".join([para.text for para in doc.paragraphs if para.text.strip()])

# def extract_txt_text(content):
#     return content.decode('utf-8').strip()

# def extract_image_text(content):
#     with BytesIO(content) as f:
#         img = Image.open(f)
#         text = pytesseract.image_to_string(img)
#         return text.strip()

# def extract_excel_text(content):
#     with BytesIO(content) as f:
#         xls = pd.read_excel(f, sheet_name=None)
#         output = ""
#         for sheet_name, df in xls.items():
#             output += f"\n--- Sheet: {sheet_name} ---\n"
#             output += df.to_string(index=False)
#         return output.strip()

# def extract_pdf_with_fallback(content):
#     # Step 1: Try extracting with pdfminer.six
#     try:
#         with BytesIO(content) as f:
#             extracted = extract_pdf_text(f)
#             if extracted.strip() and len(extracted.strip()) > 100:
#                 return extracted.strip()
#     except Exception as e:
#         print("⚠️ pdfminer failed, trying OCR fallback...")

#     # Step 2: Fallback to OCR using PyMuPDF + Tesseract
#     text_by_page = []
#     try:
#         with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
#             tmp.write(content)
#             tmp.flush()

#             doc = fitz.open(tmp.name)
#             for i, page in enumerate(doc, 1):
#                 text = page.get_text()
#                 if text.strip():
#                     text_by_page.append(f"\n--- Page {i} ---\n{text.strip()}")
#                 else:
#                     pix = page.get_pixmap(dpi=300)
#                     img = Image.open(BytesIO(pix.tobytes("png")))
#                     ocr_text = pytesseract.image_to_string(img)
#                     text_by_page.append(f"\n--- OCR Page {i} ---\n{ocr_text.strip() or '[No text found]'}")

#     except Exception as e:
#         return f"[OCR fallback failed: {str(e)}]"

#     return "\n".join(text_by_page).strip()

# def main():
#     try:
#         input_data = json.loads(sys.stdin.read())
#         file_content = base64.b64decode(input_data["buffer"])
#         mime_type = input_data["mimeType"]

#         if mime_type == "application/pdf":
#             result = extract_pdf_with_fallback(file_content)
#         elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
#             result = extract_docx_text(file_content)
#         elif mime_type.startswith("image"):
#             result = extract_image_text(file_content)
#         elif mime_type == "text/plain":
#             result = extract_txt_text(file_content)
#         elif "spreadsheet" in mime_type or "excel" in mime_type:
#             result = extract_excel_text(file_content)
#         else:
#             result = "[Unsupported file type]"

#         print(json.dumps({"text": result}))

#     except Exception as e:
#         print(json.dumps({"error": str(e)}))

# if __name__ == "__main__":
#     main()


# import sys
# import json
# import pytesseract
# from PIL import Image
# from io import BytesIO
# from pdfminer.high_level import extract_text as extract_pdf_text
# from docx import Document
# import pandas as pd
# import base64
# import tempfile
# import fitz  # PyMuPDF


# def extract_docx_text(content):
#     with BytesIO(content) as f:
#         doc = Document(f)
#         return "\n".join([para.text for para in doc.paragraphs if para.text.strip()])


# def extract_txt_text(content):
#     return content.decode("utf-8").strip()


# def extract_image_text(content):
#     with BytesIO(content) as f:
#         img = Image.open(f).convert("RGB")
#         text = pytesseract.image_to_string(img)
#         return text.strip()


# def extract_excel_text(content):
#     with BytesIO(content) as f:
#         xls = pd.read_excel(f, sheet_name=None)
#         output = ""
#         for sheet_name, df in xls.items():
#             output += f"\n--- Sheet: {sheet_name} ---\n"
#             output += df.to_string(index=False)
#         return output.strip()


# def extract_pdf_with_fallback(content):
#     text_by_page = []

#     try:
#         # Try native text extraction first
#         with BytesIO(content) as f:
#             raw_text = extract_pdf_text(f)
#             if raw_text.strip() and len(raw_text.strip()) > 100:
#                 # Still break it into pages for reference
#                 lines = raw_text.split("\n")
#                 approx_lines_per_page = max(1, len(lines) // 10)
#                 for i in range(0, len(lines), approx_lines_per_page):
#                     page_num = i // approx_lines_per_page + 1
#                     chunk = lines[i:i + approx_lines_per_page]
#                     text_by_page.append(f"\n--- Page {page_num} ---\n" + "\n".join(chunk))
#                 return "\n".join(text_by_page).strip()
#     except Exception:
#         print("⚠️ pdfminer failed, trying OCR fallback...")

#     try:
#         with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
#             tmp.write(content)
#             tmp.flush()

#             doc = fitz.open(tmp.name)
#             for i, page in enumerate(doc, start=1):
#                 text = page.get_text()
#                 if text.strip():
#                     text_by_page.append(f"\n--- Page {i} ---\n{text.strip()}")
#                 else:
#                     pix = page.get_pixmap(dpi=300)
#                     img = Image.open(BytesIO(pix.tobytes("png"))).convert("RGB")
#                     ocr_text = pytesseract.image_to_string(img)
#                     text_by_page.append(f"\n--- OCR Page {i} ---\n{ocr_text.strip() or '[No text found]'}")

#     except Exception as e:
#         return f"[OCR fallback failed: {str(e)}]"

#     return "\n".join(text_by_page).strip()


# def main():
#     try:
#         input_data = json.loads(sys.stdin.read())
#         file_content = base64.b64decode(input_data["buffer"])
#         mime_type = input_data["mimeType"]

#         if mime_type == "application/pdf":
#             result = extract_pdf_with_fallback(file_content)
#         elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
#             result = extract_docx_text(file_content)
#         elif mime_type.startswith("image"):
#             result = extract_image_text(file_content)
#         elif mime_type == "text/plain":
#             result = extract_txt_text(file_content)
#         elif "spreadsheet" in mime_type or "excel" in mime_type:
#             result = extract_excel_text(file_content)
#         else:
#             result = "[Unsupported file type]"

#         print(json.dumps({"text": result}))
#     except Exception as e:
#         print(json.dumps({"error": str(e)}))


# if __name__ == "__main__":
#     main()




# import sys
# import json
# import pytesseract
# from PIL import Image
# from io import BytesIO
# from pdfminer.high_level import extract_pages
# from pdfminer.layout import LTTextContainer
# from docx import Document
# import pandas as pd
# import base64
# import tempfile
# import fitz  # PyMuPDF

# def extract_docx_text(content):
#     with BytesIO(content) as f:
#         doc = Document(f)
#         return "\n".join([para.text for para in doc.paragraphs if para.text.strip()])

# def extract_txt_text(content):
#     return content.decode('utf-8').strip()

# def extract_image_text(content):
#     with BytesIO(content) as f:
#         img = Image.open(f).convert("RGB")
#         return pytesseract.image_to_string(img).strip()

# def extract_excel_text(content):
#     with BytesIO(content) as f:
#         xls = pd.read_excel(f, sheet_name=None)
#         output = ""
#         for sheet_name, df in xls.items():
#             output += f"\n--- Sheet: {sheet_name} ---\n"
#             output += df.to_string(index=False)
#         return output.strip()

# def extract_pdf_with_pagewise_fallback(content):
#     text_by_page = []

#     try:
#         with BytesIO(content) as f:
#             for i, page_layout in enumerate(extract_pages(f), start=1):
#                 page_text = ""
#                 for element in page_layout:
#                     if isinstance(element, LTTextContainer):
#                         page_text += element.get_text()
#                 if page_text.strip():
#                     text_by_page.append(f"\n--- Page {i} ---\n{page_text.strip()}")
#     except Exception as e:
#         print(f"⚠️ pdfminer failed: {str(e)}")

#     if not text_by_page or sum(len(p) for p in text_by_page) < 200:
#         text_by_page = []
#         try:
#             with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
#                 tmp.write(content)
#                 tmp.flush()
#                 doc = fitz.open(tmp.name)
#                 for i, page in enumerate(doc, start=1):
#                     text = page.get_text()
#                     if text.strip():
#                         text_by_page.append(f"\n--- Page {i} ---\n{text.strip()}")
#                     else:
#                         pix = page.get_pixmap(dpi=300)
#                         img = Image.open(BytesIO(pix.tobytes("png"))).convert("RGB")
#                         ocr_text = pytesseract.image_to_string(img)
#                         text_by_page.append(f"\n--- OCR Page {i} ---\n{ocr_text.strip() or '[No text found]'}")
#         except Exception as e:
#             return f"[OCR fallback failed: {str(e)}]"

#     return "\n".join(text_by_page).strip()

# def main():
#     try:
#         input_data = json.loads(sys.stdin.read())
#         file_content = base64.b64decode(input_data["buffer"])
#         mime_type = input_data["mimeType"]

#         if mime_type == "application/pdf":
#             result = extract_pdf_with_pagewise_fallback(file_content)
#         elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
#             result = extract_docx_text(file_content)
#         elif mime_type.startswith("image"):
#             result = extract_image_text(file_content)
#         elif mime_type == "text/plain":
#             result = extract_txt_text(file_content)
#         elif "spreadsheet" in mime_type or "excel" in mime_type:
#             result = extract_excel_text(file_content)
#         else:
#             result = "[Unsupported file type]"

#         print(json.dumps({"text": result}))
#     except Exception as e:
#         print(json.dumps({"error": str(e)}))

# if __name__ == "__main__":
#     main()


import sys
import json
import pytesseract
from PIL import Image
from io import BytesIO
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextContainer
from docx import Document
import pandas as pd
import base64
import tempfile
import fitz  # PyMuPDF


def extract_docx_text(content):
    with BytesIO(content) as f:
        doc = Document(f)
        return "\n".join([para.text for para in doc.paragraphs if para.text.strip()])


def extract_txt_text(content):
    return content.decode('utf-8').strip()


def extract_image_text(content):
    with BytesIO(content) as f:
        img = Image.open(f).convert("RGB")
        text = pytesseract.image_to_string(img)
        return text.strip()


def extract_excel_text(content):
    with BytesIO(content) as f:
        xls = pd.read_excel(f, sheet_name=None)
        output = ""
        for sheet_name, df in xls.items():
            output += f"\n--- Sheet: {sheet_name} ---\n"
            output += df.to_string(index=False)
        return output.strip()


def extract_pdf_pagewise(content):
    text_by_page = []

    # Step 1: Try with pdfminer.six
    try:
        with BytesIO(content) as f:
            for i, page_layout in enumerate(extract_pages(f), start=1):
                page_text = ""
                for element in page_layout:
                    if isinstance(element, LTTextContainer):
                        page_text += element.get_text()
                text_by_page.append(f"\n--- Page {i} ---\n{page_text.strip() or '[No text found]'}")
    except Exception as e:
        print(f"⚠️ pdfminer failed: {str(e)}")

    # Step 2: Fallback if total extracted text is low
    total_text_length = sum(len(p) for p in text_by_page)
    if not text_by_page or total_text_length < 500:
        print("⚠️ Falling back to OCR (pdf was too short or mostly empty)")
        text_by_page = []
        try:
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                tmp.write(content)
                tmp.flush()
                doc = fitz.open(tmp.name)
                for i, page in enumerate(doc, 1):
                    text = page.get_text()
                    if text.strip():
                        text_by_page.append(f"\n--- Page {i} ---\n{text.strip()}")
                    else:
                        pix = page.get_pixmap(dpi=300)
                        img = Image.open(BytesIO(pix.tobytes("png"))).convert("RGB")
                        ocr_text = pytesseract.image_to_string(img)
                        text_by_page.append(f"\n--- OCR Page {i} ---\n{ocr_text.strip() or '[No text found]'}")
        except Exception as e:
            return f"[OCR fallback failed: {str(e)}]"

    print(f"✅ Extracted {len(text_by_page)} pages.")
    return "\n".join(text_by_page).strip()


def main():
    try:
        input_data = json.loads(sys.stdin.read())
        file_content = base64.b64decode(input_data["buffer"])
        mime_type = input_data["mimeType"]

        if mime_type == "application/pdf":
            result = extract_pdf_pagewise(file_content)
        elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            result = extract_docx_text(file_content)
        elif mime_type.startswith("image"):
            result = extract_image_text(file_content)
        elif mime_type == "text/plain":
            result = extract_txt_text(file_content)
        elif "spreadsheet" in mime_type or "excel" in mime_type:
            result = extract_excel_text(file_content)
        else:
            result = "[Unsupported file type]"

        print(json.dumps({"text": result}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))


if __name__ == "__main__":
    main()

