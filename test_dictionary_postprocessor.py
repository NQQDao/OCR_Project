# ============================================================
# test_dictionary_postprocessor.py
# Kiểm thử module hậu xử lý từ điển cho kết quả OCR.
# ============================================================

import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dictionary_postprocessor import DictionaryPostProcessor


def run_tests():
    print("=" * 65)
    print("KIỂM THỬ DICTIONARY POST-PROCESSOR")
    print("=" * 65)

    # Dữ liệu từ điển mẫu
    items = [
        {
            "id": "dn_cua_ngamy",
            "category": "de_nham",
            "short": "cửa nga my",
            "full": "Cửa Nga My [CỘT CÔNG TRÌNH]",
            "description": "Cửa Nga My là tên CÔNG TRÌNH",
            "synonyms": ["cửa nga my (đ)", "cửa nga my (t)", "cửa nga my (tả)"]
        },
        {
            "id": "dn_chua_dau",
            "category": "de_nham",
            "short": "chùa dâu",
            "full": "Chùa Dâu [CỘT CÔNG TRÌNH]",
            "description": "Chùa Dâu là tên CÔNG TRÌNH",
            "synonyms": ["chùa dâu (SL)", "chùa dâu (ch)", "chùa dâu (NK)"]
        },
        {
            "id": "dn_bui_xa",
            "category": "de_nham",
            "short": "bùi xá",
            "full": "Bùi Xá [CỘT CÔNG TRÌNH]",
            "description": "Tên CÔNG TRÌNH",
            "synonyms": ["bùi xá (tả)", "bùi xá (hữu)", "bui xa"]
        },
        {
            "id": "ct_uc_ly",
            "category": "cong_trinh",
            "short": "ức lý",
            "full": "Ức Lý",
            "description": "Tên công trình",
            "synonyms": ["ức lý (đôi)", "uc ly"]
        },
        {
            "id": "ck_thuong_luong",
            "category": "cau_kien",
            "short": "thg lương",
            "full": "Thượng Lương",
            "description": "Đòn nóc",
            "synonyms": ["thg lg", "TL", "thượng lương"]
        },
        {
            "id": "ck_con_chong",
            "category": "cau_kien",
            "short": "con chồng",
            "full": "Con Chồng",
            "description": "Thanh gối ngàm trong vì nóc",
            "synonyms": ["con chg", "con chông"]
        },
        {
            "id": "ck_qua_giang",
            "category": "cau_kien",
            "short": "quá giang",
            "full": "Quá Giang",
            "description": "Xà ngang",
            "synonyms": ["khoá giang", "khoa giang"]
        },
        {
            "id": "ck_tau_dua",
            "category": "cau_kien",
            "short": "tàu dừa",
            "full": "Tàu Dừa",
            "description": "Thanh hoành đỡ diềm ngói",
            "synonyms": ["tau dua"]
        },
        {
            "id": "ck_bay_mai",
            "category": "cau_kien",
            "short": "bẩy mái",
            "full": "Bẩy Mái",
            "description": "Thanh đỡ mái",
            "synonyms": ["bay mai", "bảy mái"]
        }
    ]

    processor = DictionaryPostProcessor(items)

    # ---- Test 1: Exact match (case-insensitive) ----
    print("\n[Test 1] Exact match (case-insensitive)...")
    result, mtype, conf = processor.match_term("cửa nga my", ["de_nham", "cong_trinh"])
    assert result == "Cửa Nga My", f"Expected 'Cửa Nga My', got '{result}'"
    assert mtype == "exact", f"Expected 'exact', got '{mtype}'"
    assert conf == 1.0
    print(f"  ✅ 'cửa nga my' → '{result}' ({mtype}, confidence={conf})")

    # ---- Test 2: Exact match uppercase ----
    print("\n[Test 2] Exact match (uppercase input)...")
    result, mtype, conf = processor.match_term("THG LƯƠNG", ["cau_kien"])
    assert result == "Thượng Lương", f"Expected 'Thượng Lương', got '{result}'"
    assert mtype == "exact"
    print(f"  ✅ 'THG LƯƠNG' → '{result}' ({mtype})")

    # ---- Test 3: Synonym match ----
    print("\n[Test 3] Synonym match...")
    result, mtype, conf = processor.match_term("thg lg", ["cau_kien"])
    assert result == "Thượng Lương", f"Expected 'Thượng Lương', got '{result}'"
    assert mtype == "synonym"
    assert conf == 0.9
    print(f"  ✅ 'thg lg' → '{result}' ({mtype}, confidence={conf})")

    # ---- Test 4: Synonym match with variant ----
    print("\n[Test 4] Synonym match (variant cong_trinh)...")
    result, mtype, conf = processor.match_term("chùa dâu (SL)", ["de_nham", "cong_trinh"])
    assert result == "Chùa Dâu", f"Expected 'Chùa Dâu', got '{result}'"
    assert mtype == "synonym"
    print(f"  ✅ 'chùa dâu (SL)' → '{result}' ({mtype})")

    # ---- Test 5: Synonym match - bui xa (no diacritics) ----
    print("\n[Test 5] Synonym match (no diacritics)...")
    result, mtype, conf = processor.match_term("bui xa", ["de_nham", "cong_trinh"])
    assert result == "Bùi Xá", f"Expected 'Bùi Xá', got '{result}'"
    assert mtype == "synonym"
    print(f"  ✅ 'bui xa' → '{result}' ({mtype})")

    # ---- Test 6: Fuzzy match (1 ký tự sai) ----
    print("\n[Test 6] Fuzzy match (1 char difference)...")
    result, mtype, conf = processor.match_term("con chòng", ["cau_kien"])
    assert result == "Con Chồng", f"Expected 'Con Chồng', got '{result}'"
    assert mtype == "fuzzy"
    print(f"  ✅ 'con chòng' → '{result}' ({mtype}, confidence={conf})")

    # ---- Test 7: No match ----
    print("\n[Test 7] No match (unknown term)...")
    result, mtype, conf = processor.match_term("abc xyz zzz", None)
    assert result is None, f"Expected None, got '{result}'"
    assert mtype == "none"
    assert conf == 0.0
    print(f"  ✅ 'abc xyz zzz' → None ({mtype})")

    # ---- Test 8: Empty string ----
    print("\n[Test 8] Empty string...")
    result, mtype, conf = processor.match_term("", None)
    assert result is None
    assert mtype == "none"
    print(f"  ✅ '' → None ({mtype})")

    # ---- Test 9: Category filtering ----
    print("\n[Test 9] Category filtering (cau_kien only)...")
    result, mtype, conf = processor.match_term("cửa nga my", ["cau_kien"])
    assert result is None, f"Expected None (wrong category), got '{result}'"
    print(f"  ✅ 'cửa nga my' with [cau_kien] → None (filtered out correctly)")

    # ---- Test 10: [CỘT CÔNG TRÌNH] annotation removed ----
    print("\n[Test 10] Annotation [CỘT CÔNG TRÌNH] removed from output...")
    result, mtype, conf = processor.match_term("bùi xá", ["de_nham"])
    assert "[" not in result, f"Annotation not removed: '{result}'"
    assert result == "Bùi Xá"
    print(f"  ✅ Output clean: '{result}' (no brackets)")

    # ---- Test 11: Full OCR document processing ----
    print("\n[Test 11] Full OCR document processing...")
    ocr_doc = {
        "header": {"so_xe": "107"},
        "items": [
            {
                "dong": 1,
                "cong_trinh": "cửa nga my",
                "ten_cau_kien": "thg lương",
                "khoi_luong": "0.486"
            },
            {
                "dong": 2,
                "cong_trinh": "Bùi Xá",
                "ten_cau_kien": "con chg",
                "khoi_luong": "0.324"
            },
            {
                "dong": 3,
                "cong_trinh": "Ức Lý",
                "ten_cau_kien": "quá giang",
                "khoi_luong": "0.155"
            },
            {
                "dong": 4,
                "cong_trinh": "unknown project",
                "ten_cau_kien": "unknown part",
                "khoi_luong": "0.100"
            }
        ],
        "validation": {}
    }

    result_doc = processor.process_ocr_result(ocr_doc)

    # Kiểm tra kết quả
    assert result_doc["items"][0]["cong_trinh"] == "Cửa Nga My", \
        f"Dong 1 cong_trinh: '{result_doc['items'][0]['cong_trinh']}'"
    assert result_doc["items"][0]["ten_cau_kien"] == "Thượng Lương", \
        f"Dong 1 ten_cau_kien: '{result_doc['items'][0]['ten_cau_kien']}'"
    assert result_doc["items"][1]["ten_cau_kien"] == "Con Chồng", \
        f"Dong 2 ten_cau_kien: '{result_doc['items'][1]['ten_cau_kien']}'"
    # Dong 3: "Ức Lý" exact match cong_trinh, "quá giang" exact match cau_kien
    assert result_doc["items"][2]["ten_cau_kien"] == "Quá Giang", \
        f"Dong 3 ten_cau_kien: '{result_doc['items'][2]['ten_cau_kien']}'"
    # Dong 4: không khớp → giữ nguyên
    assert result_doc["items"][3]["cong_trinh"] == "unknown project"
    assert result_doc["items"][3]["ten_cau_kien"] == "unknown part"

    # Kiểm tra corrections log
    corrections = result_doc.get("validation", {}).get("dictionary_corrections", [])
    assert len(corrections) >= 3, f"Expected ≥3 corrections, got {len(corrections)}"
    print(f"  ✅ Processed 4 items, {len(corrections)} corrections logged:")
    for c in corrections:
        print(f"     Dòng {c['dong']}: {c['field']} '{c['original']}' → '{c['corrected']}' ({c['match_type']})")

    # ---- Test 12: Levenshtein distance ----
    print("\n[Test 12] Levenshtein distance calculations...")
    assert DictionaryPostProcessor.levenshtein_distance("abc", "abc") == 0
    assert DictionaryPostProcessor.levenshtein_distance("abc", "abd") == 1
    assert DictionaryPostProcessor.levenshtein_distance("abc", "abcd") == 1
    assert DictionaryPostProcessor.levenshtein_distance("", "abc") == 3
    assert DictionaryPostProcessor.levenshtein_distance("kitten", "sitting") == 3
    print(f"  ✅ All distance calculations correct")

    # ---- Kết luận ----
    print("\n" + "=" * 65)
    print("KẾT QUẢ: TẤT CẢ 12 TEST ĐỀU THÀNH CÔNG (PASSED 100%)!")
    print("=" * 65)


if __name__ == "__main__":
    run_tests()

