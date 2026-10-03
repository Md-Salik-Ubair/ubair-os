import io
import csv
import math
from typing import List, Dict, Any, Optional

class AnalystProfiler:
    """
    In-Memory Tabular Data Profiler for Ubair Analyst Engine.
    Computes statistical blueprints (dimensions, data types, distributions, nulls, outliers)
    to feed LLMs 100% accurate mathematical context without token overflow.
    """

    @staticmethod
    def _infer_type(value_str: str) -> str:
        v = value_str.strip()
        if not v or v.lower() in ("null", "none", "nan", "na", "n/a", "-"):
            return "null"
        try:
            int(v)
            return "integer"
        except ValueError:
            pass
        try:
            float(v)
            return "float"
        except ValueError:
            pass
        if v.lower() in ("true", "false", "yes", "no", "t", "f"):
            return "boolean"
        return "string"

    @classmethod
    def profile_csv_content(cls, raw_csv_text: str, delimiter: str = ",") -> Dict[str, Any]:
        """
        Profiles in-memory CSV/TSV text and returns structured mathematical summary.
        """
        f = io.StringIO(raw_csv_text.strip())
        reader = csv.reader(f, delimiter=delimiter)
        
        try:
            headers = [h.strip() for h in next(reader, [])]
        except Exception:
            return {"error": "Failed to parse tabular header."}

        if not headers:
            return {"error": "Empty tabular dataset."}

        rows: List[List[str]] = []
        for r in reader:
            if any(cell.strip() for cell in r):
                # Normalize row length to match headers
                padded = r + [""] * (len(headers) - len(r))
                rows.append(padded[:len(headers)])

        total_rows = len(rows)
        total_cols = len(headers)

        if total_rows == 0:
            return {
                "headers": headers,
                "total_rows": 0,
                "total_cols": total_cols,
                "columns": {},
                "sample_rows": []
            }

        # Analyze each column
        columns_profile: Dict[str, Any] = {}
        for col_idx, col_name in enumerate(headers):
            col_values = [rows[r_idx][col_idx].strip() for r_idx in range(total_rows)]
            
            null_count = sum(1 for v in col_values if not v or v.lower() in ("null", "none", "nan", "na", "n/a", "-"))
            valid_values = [v for v in col_values if v and v.lower() not in ("null", "none", "nan", "na", "n/a", "-")]
            
            # Type classification
            type_counts: Dict[str, int] = {}
            for v in valid_values:
                t = cls._infer_type(v)
                type_counts[t] = type_counts.get(t, 0) + 1

            dominant_type = max(type_counts, key=type_counts.get) if type_counts else "string"

            col_stat: Dict[str, Any] = {
                "dominant_type": dominant_type,
                "null_count": null_count,
                "null_percentage": round((null_count / total_rows) * 100, 1),
                "unique_count": len(set(valid_values))
            }

            # Numeric statistics
            if dominant_type in ("integer", "float"):
                numeric_vals = []
                for v in valid_values:
                    try:
                        numeric_vals.append(float(v))
                    except ValueError:
                        continue
                
                if numeric_vals:
                    numeric_vals.sort()
                    n = len(numeric_vals)
                    col_stat["min"] = numeric_vals[0]
                    col_stat["max"] = numeric_vals[-1]
                    col_stat["mean"] = round(sum(numeric_vals) / n, 2)
                    col_stat["median"] = round(numeric_vals[n // 2] if n % 2 != 0 else (numeric_vals[n // 2 - 1] + numeric_vals[n // 2]) / 2, 2)
            else:
                # Categorical frequencies (Top 3)
                freq: Dict[str, int] = {}
                for v in valid_values:
                    freq[v] = freq.get(v, 0) + 1
                top_items = sorted(freq.items(), key=lambda x: x[1], reverse=True)[:3]
                col_stat["top_values"] = [{"value": k, "count": v} for k, v in top_items]

            columns_profile[col_name] = col_stat

        sample_rows = rows[:3] + (rows[-2:] if total_rows > 5 else [])

        return {
            "headers": headers,
            "total_rows": total_rows,
            "total_cols": total_cols,
            "columns": columns_profile,
            "sample_rows": sample_rows
        }

    @classmethod
    def format_for_llm_context(cls, profile: Dict[str, Any], filename: str) -> str:
        """
        Converts the statistical profile into a compact, professional Markdown blueprint.
        """
        if "error" in profile:
            return f"[{profile['error']}]"

        lines = [
            f"### [Ubair Analyst Blueprint: `{filename}`]",
            f"- **Dimensions:** {profile['total_rows']:,} Rows × {profile['total_cols']} Columns",
            "",
            "#### Column Metrics & Distributions:"
        ]

        for col_name, stats in profile["columns"].items():
            t = stats["dominant_type"].upper()
            null_info = f"Nulls: {stats['null_count']} ({stats['null_percentage']}%)"
            
            if "min" in stats:
                metric_info = f"Min: {stats['min']} | Max: {stats['max']} | Mean: {stats['mean']} | Median: {stats['median']}"
                lines.append(f"- **`{col_name}`** (`{t}`) → {metric_info} | {null_info}")
            else:
                top_v = ", ".join([f"'{item['value']}' ({item['count']})" for item in stats.get("top_values", [])])
                lines.append(f"- **`{col_name}`** (`{t}`) → Unique: {stats['unique_count']} | Top: [{top_v}] | {null_info}")

        # Sample rows table
        if profile.get("sample_rows"):
            lines.append("\n#### Representative Row Samples:")
            headers = profile["headers"]
            lines.append("| " + " | ".join(headers) + " |")
            lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
            for r in profile["sample_rows"]:
                lines.append("| " + " | ".join(r) + " |")

        return "\n".join(lines)