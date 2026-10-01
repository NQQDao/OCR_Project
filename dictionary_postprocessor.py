# ============================================================
# dictionary_postprocessor.py
# Module xu ly hau ky tu dien cho ket qua OCR.
# Thay the cach tiep can nhung tu dien vao prompt AI.
# 3 tang matching: Exact -> Synonym -> Fuzzy (Levenshtein).
# ============================================================

from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple


class DictionaryPostProcessor:
    """
    Xu ly hau ky ket qua OCR bang tu dien viet tat.
    Hoat dong hoan toan deterministic.

    3 tang matching:
      1. Exact match (short -> full, case-insensitive)
      2. Synonym match (synonyms -> full, case-insensitive)
      3. Fuzzy match (Levenshtein distance <= threshold)
    """

    def __init__(self, items: List[Dict[str, Any]]):
        self.items = items
        self._build_lookup_tables()

    def _build_lookup_tables(self) -> None:
        """Xay dung bang tra cuu nhanh cho 3 tang matching."""
        self.exact_map: Dict[str, Dict] = {}
        self.synonym_map: Dict[str, Dict] = {}
        self.fuzzy_candidates: Dict[str, List[Dict]] = {}

        for item in self.items:
            short_lower = self.normalize_unicode(
                item.get("short", "")
            ).lower()
            if short_lower:
                self.exact_map[short_lower] = item

            synonyms = item.get("synonyms", [])
            if isinstance(synonyms, str):
                try:
                    import json
                    synonyms = json.loads(synonyms)
                except (ValueError, TypeError):
                    synonyms = [s.strip() for s in synonyms.split(",") if s.strip()]

            for syn in synonyms:
                syn_lower = self.normalize_unicode(syn).lower()
                if syn_lower:
                    self.synonym_map[syn_lower] = item

            cat = item.get("category", "khac")
            self.fuzzy_candidates.setdefault(cat, []).append(item)

    @staticmethod
    def normalize_unicode(text: str) -> str:
        """Chuan hoa Unicode NFC cho tieng Viet."""
        if not text:
            return ""
        return unicodedata.normalize("NFC", text.strip())

    @staticmethod
    def levenshtein_distance(s1: str, s2: str) -> int:
        """Tinh khoang cach Levenshtein giua 2 chuoi."""
        if len(s1) < len(s2):
            return DictionaryPostProcessor.levenshtein_distance(s2, s1)
        if len(s2) == 0:
            return len(s1)

        prev_row = list(range(len(s2) + 1))
        for i, c1 in enumerate(s1):
            curr_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = prev_row[j + 1] + 1
                deletions = curr_row[j] + 1
                substitutions = prev_row[j] + (c1 != c2)
                curr_row.append(min(insertions, deletions, substitutions))
            prev_row = curr_row
        return prev_row[-1]

    @staticmethod
    def _clean_full_text(full: str) -> str:
        """Bo phan annotation [COT CONG TRINH] neu co trong full text."""
        if not full:
            return ""
        return re.sub(r'\s*\[.*?\]\s*$', '', full).strip()

    def _category_match(
        self, item: Dict, target_categories: Optional[List[str]]
    ) -> bool:
        """Kiem tra item co thuoc categories muc tieu khong."""
        if not target_categories:
            return True
        return item.get("category", "") in target_categories

    def match_term(
        self,
        text: str,
        target_categories: Optional[List[str]] = None,
        fuzzy_threshold: int = 2
    ) -> Tuple[Optional[str], str, float]:
        """
        Tra cuu 3 tang: Exact -> Synonym -> Fuzzy.

        Args:
            text: Chuoi can tra cuu
            target_categories: Danh sach categories cho phep (None = tat ca)
            fuzzy_threshold: Nguong Levenshtein toi da cho fuzzy match

        Returns:
            (full_text, match_type, confidence)
            - full_text: Ten day du neu tim thay, None neu khong
            - match_type: "exact" | "synonym" | "fuzzy" | "none"
            - confidence: 1.0 (exact), 0.9 (synonym), 0.5-0.8 (fuzzy)
        """
        if not text or not text.strip():
            return None, "none", 0.0

        clean = self.normalize_unicode(text).lower()

        # Tang 1: Exact match
        exact_hit = self.exact_map.get(clean)
        if exact_hit and self._category_match(exact_hit, target_categories):
            full = self._clean_full_text(exact_hit.get("full", ""))
            return full, "exact", 1.0

        # Tang 2: Synonym match
        syn_hit = self.synonym_map.get(clean)
        if syn_hit and self._category_match(syn_hit, target_categories):
            full = self._clean_full_text(syn_hit.get("full", ""))
            return full, "synonym", 0.9

        # Tang 3: Fuzzy match (chi khi text du dai de tranh false positive)
        if len(clean) >= 3:
            best_match = None
            best_distance = fuzzy_threshold + 1

            candidates = []
            if target_categories:
                for cat in target_categories:
                    candidates.extend(self.fuzzy_candidates.get(cat, []))
            else:
                for cat_list in self.fuzzy_candidates.values():
                    candidates.extend(cat_list)

            for item in candidates:
                short = self.normalize_unicode(
                    item.get("short", "")
                ).lower()
                if not short:
                    continue
                dist = self.levenshtein_distance(clean, short)
                if dist <= fuzzy_threshold and dist < best_distance:
                    best_distance = dist
                    best_match = item

            if best_match:
                full = self._clean_full_text(best_match.get("full", ""))
                confidence = max(0.5, 1.0 - (best_distance / max(len(clean), 1)))
                return full, "fuzzy", round(confidence, 2)

        return None, "none", 0.0

    def process_ocr_result(self, ocr_doc: Dict[str, Any]) -> Dict[str, Any]:
        """
        Ap dung tu dien len toan bo ket qua OCR.

        Xu ly cac truong:
        - items[].cong_trinh  (categories: de_nham, cong_trinh)
        - items[].ten_cau_kien (categories: cau_kien, de_nham)

        Returns:
            OCR document da chuan hoa, kem log corrections trong validation.
        """
        items = ocr_doc.get("items", [])
        corrections_log: List[Dict[str, Any]] = []

        for item in items:
            dong = item.get("dong", "?")

            # --- Chuan hoa cong_trinh ---
            cong_trinh = item.get("cong_trinh", "")
            if cong_trinh and cong_trinh.strip():
                new_val, match_type, conf = self.match_term(
                    cong_trinh,
                    target_categories=["de_nham", "cong_trinh"]
                )
                if new_val and new_val != cong_trinh.strip():
                    corrections_log.append({
                        "dong": dong,
                        "field": "cong_trinh",
                        "original": cong_trinh,
                        "corrected": new_val,
                        "match_type": match_type,
                        "confidence": conf
                    })
                    item["cong_trinh"] = new_val

            # --- Chuan hoa ten_cau_kien ---
            ten_ck = item.get("ten_cau_kien", "")
            if ten_ck and ten_ck.strip():
                new_val, match_type, conf = self.match_term(
                    ten_ck,
                    target_categories=["cau_kien", "de_nham"]
                )
                if new_val and new_val != ten_ck.strip():
                    corrections_log.append({
                        "dong": dong,
                        "field": "ten_cau_kien",
                        "original": ten_ck,
                        "corrected": new_val,
                        "match_type": match_type,
                        "confidence": conf
                    })
                    item["ten_cau_kien"] = new_val

        # Gan log chinh sua vao ket qua (de debug/audit)
        if corrections_log:
            if "validation" not in ocr_doc:
                ocr_doc["validation"] = {}
            ocr_doc["validation"]["dictionary_corrections"] = corrections_log

        return ocr_doc

