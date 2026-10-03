import io
import csv
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import UploadFile
import pypdf
import docx

from core.analyst_profiler import AnalystProfiler


class FileParser:
    # Strict registry of supported extensions
    SUPPORTED_EXTENSIONS = {
        # Documents
        ".pdf", ".docx", ".txt", ".md", ".rtf",
        # Code & Scripts
        ".py", ".js", ".ts", ".tsx", ".jsx", ".html", ".css", ".sql", 
        ".sh", ".bash", ".cpp", ".c", ".h", ".java", ".rs", ".go", ".php",
        # Structured Data & Configs
        ".json", ".csv", ".tsv", ".yaml", ".yml", ".xml", ".env", ".toml", ".ini"
    }

    @classmethod
    def is_supported(cls, filename: str) -> bool:
        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        return ext in cls.SUPPORTED_EXTENSIONS

    @staticmethod
    def _csv_to_markdown(decoded_text: str, delimiter: str = ",") -> str:
        """Converts raw CSV/TSV strings into standard structured Markdown tables."""
        try:
            reader = csv.reader(io.StringIO(decoded_text), delimiter=delimiter)
            rows = list(reader)
            if not rows:
                return decoded_text

            header = rows[0]
            separator = ["---"] * len(header)
            md_lines = [
                "| " + " | ".join(header) + " |",
                "| " + " | ".join(separator) + " |"
            ]

            for row in rows[1:]:
                padded_row = row + [""] * (len(header) - len(row))
                md_lines.append("| " + " | ".join(padded_row[:len(header)]) + " |")

            return "\n".join(md_lines)
        except Exception:
            return decoded_text

    @staticmethod
    def _format_json(decoded_text: str) -> str:
        """Prettifies JSON to maintain hierarchical readability."""
        try:
            parsed = json.loads(decoded_text)
            return json.dumps(parsed, indent=2)
        except Exception:
            return decoded_text

    @classmethod
    async def parse_single_file(cls, file: UploadFile) -> Dict[str, Any]:
        """
        Parses an incoming file buffer in memory and formats it with layout awareness.
        Destroys all byte streams immediately upon completion.
        """
        filename = file.filename or "unnamed_file"
        content_type = file.content_type or "application/octet-stream"
        raw_bytes = await file.read()
        
        extracted_content = ""
        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        extracted_at = datetime.now(timezone.utc).isoformat()

        try:
            # 1. PDF Documents (Multi-page text extraction with indexing)
            if ext == ".pdf" or content_type == "application/pdf":
                pdf_stream = io.BytesIO(raw_bytes)
                reader = pypdf.PdfReader(pdf_stream)
                pages_data = []
                for idx, page in enumerate(reader.pages, start=1):
                    page_text = page.extract_text() or ""
                    if page_text.strip():
                        pages_data.append(f"--- [Page {idx}] ---\n{page_text.strip()}")
                extracted_content = "\n\n".join(pages_data) if pages_data else "[Empty or Scanned PDF Document]"
                pdf_stream.close()
                del pdf_stream

            # 2. Microsoft Word Documents (.docx) with Table Extraction
            elif ext == ".docx" or "wordprocessingml" in content_type:
                doc_stream = io.BytesIO(raw_bytes)
                doc = docx.Document(doc_stream)
                doc_paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
                
                # Extract tables
                for table in doc.tables:
                    for row in table.rows:
                        row_text = " | ".join([cell.text.strip() for cell in row.cells if cell.text.strip()])
                        if row_text:
                            doc_paragraphs.append(row_text)

                extracted_content = "\n\n".join(doc_paragraphs) if doc_paragraphs else "[Empty Word Document]"
                doc_stream.close()
                del doc_stream

            # 3. Tabular Data (.csv, .tsv) via Ubair Analyst Profiler
            elif ext in (".csv", ".tsv"):
                decoded = raw_bytes.decode("utf-8", errors="replace")
                delimiter = "\t" if ext == ".tsv" else ","
                # Generate mathematical statistical blueprint
                profile = AnalystProfiler.profile_csv_content(decoded, delimiter=delimiter)
                extracted_content = AnalystProfiler.format_for_llm_context(profile, filename)

            # 4. JSON Configurations & Structured Data
            elif ext == ".json":
                decoded = raw_bytes.decode("utf-8", errors="replace")
                extracted_content = cls._format_json(decoded)

            # 5. Code, Scripts, Markup & Plain Text (.py, .ts, .js, .sql, .md, .env, etc.)
            else:
                extracted_content = raw_bytes.decode("utf-8", errors="replace")

        except Exception as e:
            extracted_content = f"[Extraction Error for '{filename}': {str(e)}]"
        finally:
            # Enforce immediate memory buffer destruction
            del raw_bytes

        return {
            "filename": filename,
            "extension": ext,
            "content_type": content_type,
            "timestamp": extracted_at,
            "content": extracted_content.strip()
        }

    @classmethod
    async def parse_multiple_files(cls, files: List[UploadFile], max_files: int = 10) -> List[Dict[str, Any]]:
        """Parses valid files sequentially with strict isolation up to max_files."""
        results = []
        valid_files = [f for f in files if cls.is_supported(f.filename or "")][:max_files]

        for f in valid_files:
            parsed_item = await cls.parse_single_file(f)
            results.append(parsed_item)

        return results

    @staticmethod
    def format_context_for_prompt(parsed_files: List[Dict[str, Any]]) -> str:
        """
        Wraps each file's extracted content in strict isolation tags with timestamp metadata.
        """
        if not parsed_files:
            return ""

        blocks = []
        for idx, pf in enumerate(parsed_files, start=1):
            block = (
                f"<<<ATTACHMENT #{idx}: {pf['filename']} | "
                f"TYPE: {pf['extension']} | "
                f"TIMESTAMP: {pf['timestamp']}>>>\n"
                f"{pf['content']}\n"
                f"<<<END ATTACHMENT #{idx}: {pf['filename']}>>>"
            )
            blocks.append(block)

        return "\n\n".join(blocks)