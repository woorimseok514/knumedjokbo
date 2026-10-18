import os
import re
from typing import List, Dict, Any, Tuple
from docx import Document
from pptx import Presentation

try:
    import pymupdf as fitz
    HAS_PYMUPDF = True
except ImportError:
    HAS_PYMUPDF = False

from pypdf import PdfReader

def clean_whitespace(text: str) -> str:
    """불필요한 공백과 특수제어문자를 정리합니다."""
    text = re.sub(r'[\r\t]', ' ', text)
    text = re.sub(r'[ \xa0\u200b]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def extract_text_from_pdf(file_path: str) -> List[Dict[str, Any]]:
    """
    PDF 파일에서 레이아웃을 인식하여 페이지별로 텍스트를 추출합니다.
    시험지의 2단(2-column) 레이아웃을 감지하여 좌측단 -> 우측단 순서로 올바르게 읽습니다.
    """
    results = []
    
    if HAS_PYMUPDF:
        try:
            doc = fitz.open(file_path)
            for page_idx, page in enumerate(doc):
                rect = page.rect
                page_w = rect.width
                page_h = rect.height
                
                header_y = page_h * 0.04
                footer_y = page_h * 0.96
                
                blocks = page.get_text("blocks")
                content_blocks = []
                
                for b in blocks:
                    if len(b) < 5:
                        continue
                    x0, y0, x1, y1, text = b[0], b[1], b[2], b[3], b[4]
                    if len(b) >= 7 and b[6] != 0:
                        continue
                    if y1 < header_y or y0 > footer_y:
                        continue
                    
                    c_text = text.strip()
                    if not c_text:
                        continue
                    content_blocks.append((x0, y0, x1, y1, c_text))

                if not content_blocks:
                    results.append({
                        "unit_type": "페이지",
                        "unit_number": page_idx + 1,
                        "text": ""
                    })
                    continue

                left_blocks = [b for b in content_blocks if b[0] < page_w * 0.48]
                right_blocks = [b for b in content_blocks if b[0] >= page_w * 0.48]
                
                if len(left_blocks) >= 2 and len(right_blocks) >= 2:
                    left_blocks.sort(key=lambda b: (b[1], b[0]))
                    right_blocks.sort(key=lambda b: (b[1], b[0]))
                    sorted_blocks = left_blocks + right_blocks
                else:
                    content_blocks.sort(key=lambda b: (b[1], b[0]))
                    sorted_blocks = content_blocks

                page_text = clean_whitespace("\n\n".join([b[4] for b in sorted_blocks]))
                results.append({
                    "unit_type": "페이지",
                    "unit_number": page_idx + 1,
                    "text": page_text
                })
                
            doc.close()
            return results
        except Exception as e:
            print(f"[PyMuPDF 오류] {e}")

    try:
        reader = PdfReader(file_path)
        for idx, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            results.append({
                "unit_type": "페이지",
                "unit_number": idx + 1,
                "text": clean_whitespace(text)
            })
    except Exception as e:
        print(f"[PDF 에러] {file_path}: {e}")
        
    return results

def extract_text_from_pptx(file_path: str) -> List[Dict[str, Any]]:
    """PPTX 파일에서 슬라이드별로 텍스트를 추출합니다."""
    results = []
    try:
        prs = Presentation(file_path)
        for idx, slide in enumerate(prs.slides):
            slide_texts = []
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for paragraph in shape.text_frame.paragraphs:
                        p_text = paragraph.text.strip()
                        if p_text:
                            slide_texts.append(p_text)
                if shape.has_table:
                    for row in shape.table.rows:
                        row_texts = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                        if row_texts:
                            slide_texts.append(" | ".join(row_texts))
            if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                notes = slide.notes_slide.notes_text_frame.text.strip()
                if notes:
                    slide_texts.append(f"[슬라이드 메모: {notes}]")
            full_text = clean_whitespace("\n".join(slide_texts))
            results.append({
                "unit_type": "슬라이드",
                "unit_number": idx + 1,
                "text": full_text
            })
    except Exception as e:
        print(f"[PPTX 에러] {file_path}: {e}")
    return results

def extract_text_from_docx(file_path: str) -> List[Dict[str, Any]]:
    """DOCX 파일에서 단락/페이지별로 텍스트를 추출합니다."""
    results = []
    try:
        doc = Document(file_path)
        chunks = []
        current_chunk = []
        for p in doc.paragraphs:
            text = p.text.strip()
            if not text:
                continue
            current_chunk.append(text)
            if sum(len(t) for t in current_chunk) > 600:
                chunks.append("\n".join(current_chunk))
                current_chunk = []
        for table in doc.tables:
            table_lines = []
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                if cells:
                    table_lines.append(" | ".join(cells))
            if table_lines:
                chunks.append("\n".join(table_lines))
        if current_chunk:
            chunks.append("\n".join(current_chunk))
        for idx, chunk in enumerate(chunks):
            results.append({
                "unit_type": "단락/섹션",
                "unit_number": idx + 1,
                "text": clean_whitespace(chunk)
            })
    except Exception as e:
        print(f"[DOCX 에러] {file_path}: {e}")
    return results

def extract_text_from_txt(file_path: str) -> List[Dict[str, Any]]:
    """TXT 파일에서 텍스트를 추출합니다."""
    results = []
    encodings = ["utf-8", "cp949", "euc-kr"]
    raw_content = ""
    for enc in encodings:
        try:
            with open(file_path, "r", encoding=enc) as f:
                raw_content = f.read()
            break
        except UnicodeDecodeError:
            continue
    if not raw_content:
        return results
    parts = [p.strip() for p in re.split(r'\n\s*\n\s*\n', raw_content) if p.strip()]
    if not parts:
        parts = [raw_content.strip()]
    for idx, part in enumerate(parts):
        results.append({
            "unit_type": "단락",
            "unit_number": idx + 1,
            "text": clean_whitespace(part)
        })
    return results

def parse_lecture_document(file_path: str) -> List[Dict[str, Any]]:
    """확장자에 따라 적절한 파서를 호출하여 강의 자료 텍스트 단위를 반환합니다."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    elif ext in [".pptx", ".ppt"]:
        return extract_text_from_pptx(file_path)
    elif ext in [".docx", ".doc"]:
        return extract_text_from_docx(file_path)
    elif ext in [".txt", ".md"]:
        return extract_text_from_txt(file_path)
    return []

# ----------------- 족보 문항 및 선지 통합 고도화 파서 -----------------

CIRCLE_MAP = {'1': '①', '2': '②', '3': '③', '4': '④', '5': '⑤', '6': '⑥', '7': '⑦', '8': '⑧', '9': '⑨'}
REVERSE_CIRCLE = {'①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5', '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9'}

# 노이즈 라인 패턴 (시험지 헤더/출제자 정보/페이지 번호 등)
_NOISE_PATTERNS = [
    re.compile(r'^출제자\s*:\s*[가-힣A-Za-z]+\s*$'),
    re.compile(r'^※\s*[가-힣A-Za-z]+\s*\([0-9\~\-]+\)\s*$'),
    re.compile(r'^(?:22[0-9]{4}|20[0-9]{2}학년도|시험일자|시험시간|학번|성명|과목명|담당교수)'),
    re.compile(r'^(?:※\s*OMR|※\s*주의|※\s*다음|※\s*아래)'),
    re.compile(r'^-\s*[0-9]+\s*-\s*$'),
    re.compile(r'^[0-9]+\s*/\s*[0-9]+\s*$'),
]

def _is_noise_line(line: str) -> bool:
    for p in _NOISE_PATTERNS:
        if p.search(line):
            return True
    return False

def _strip_inline_noise(line: str) -> str:
    """출제자 정보 등 인라인 노이즈를 제거합니다."""
    line = re.sub(r'\s*출제자\s*:\s*[가-힣A-Za-z]+', '', line)
    line = re.sub(r'\s*※\s*[가-힣A-Za-z]+\s*\([0-9\~\-]+\)', '', line)
    return line.strip()

def _extract_answer_table(text: str) -> Tuple[str, Dict[int, str]]:
    """
    시험지 말미에 위치한 정답표를 검출하고 (본문, 정답dict) 형태로 반환합니다.
    정답표 예시 (2024): '번호\n정답\n출제자\n1\n1\n최제용\n22\n-105 KJ\n권태환'
    """
    answers: Dict[int, str] = {}
    # 문서 뒤 4000자 안에서 정답표 헤더 탐색
    tail_start = max(0, len(text) - 5000)
    tail = text[tail_start:]

    header_m = re.search(
        r'(?:\n|\A)(?:[0-9]{4}[.\s][0-9].*?(?:정답|답안).*?\n|'
        r'정답표\b|번호\s*\n\s*정답\s*\n|'
        r'객관식.*?정답\s*번호|단답형.*?정답)',
        tail, re.IGNORECASE
    )
    if not header_m:
        return text, answers

    table_pos = tail_start + header_m.start()
    ans_section = text[table_pos:]

    # 패턴 1: 세 줄씩 (번호, 정답, 교수명)
    matches = re.findall(r'([0-9]{1,3})\s*\n\s*([^\n]+?)\s*\n\s*[가-힣]{2,4}', ans_section)
    # 패턴 2: 인라인 (번호 정답 교수명)
    if len(matches) < 5:
        matches = re.findall(
            r'(?:^|\s)([0-9]{1,3})\s+([①②③④⑤1-5]|[A-Za-z\-\+\/,\s]+?)\s+[가-힣]{2,4}(?=\s|$)',
            ans_section
        )

    if len(matches) >= 5:
        for q_str, a_str in matches:
            try:
                q_num = int(q_str)
                a_clean = a_str.strip()
                # 숫자 → 원문자 변환
                if a_clean in CIRCLE_MAP:
                    answers[q_num] = CIRCLE_MAP[a_clean]
                elif a_clean in REVERSE_CIRCLE:
                    answers[q_num] = a_clean
                else:
                    answers[q_num] = a_clean
            except Exception:
                continue
        clean_body = text[:table_pos].strip()
        return clean_body, answers

    return text, answers

def parse_exam_questions(raw_text: str) -> List[Dict[str, Any]]:
    """
    족보 PDF 텍스트에서 완전한 문제 단위를 추출합니다.

    개선 사항:
    - 정답표 자동 검출 및 분리
    - 출제자 정보·헤더 노이즈 제거
    - 선지 라벨 줄바꿈 사전 병합 (1)\\n텍스트 → 1) 텍스트)
    - 섹션 번호 리셋(서술형·단답형) 감지 및 처리
    - 연속 문제 번호 추적으로 1) 2) 3) 오인 방지
    - 정답표에서 추출한 정답 자동 매핑
    """
    if not raw_text:
        return []

    # ── 1. 정답표 분리 ──────────────────────────────────────
    body_text, answer_table = _extract_answer_table(raw_text)

    # ── 2. 선지 라벨 줄바꿈 사전 병합 ──────────────────────
    text = body_text
    # "1)\n내용" → "1) 내용" (단, 다음 줄이 다른 선지 번호, 문제 번호, 빈 줄이 아닌 경우에만 병합)
    text = re.sub(
        r'(?m)^([1-9]\))\s*\n(?!\s*(?:[1-9]\)|\([1-9]\)|[①②③④⑤⑥⑦⑧⑨]|[0-9]{1,3}\.|\Z))\s*(\S)',
        r'\1 \2',
        text
    )
    text = re.sub(
        r'(?m)^(\([1-9]\))\s*\n(?!\s*(?:[1-9]\)|\([1-9]\)|[①②③④⑤⑥⑦⑧⑨]|[0-9]{1,3}\.|\Z))\s*(\S)',
        r'\1 \2',
        text
    )
    text = re.sub(
        r'(?m)^([①②③④⑤⑥⑦⑧⑨])\s*\n(?!\s*(?:[1-9]\)|\([1-9]\)|[①②③④⑤⑥⑦⑧⑨]|[0-9]{1,3}\.|\Z))\s*(\S)',
        r'\1 \2',
        text
    )

    lines_raw = text.split('\n')

    SECTION_HDR = re.compile(r'^(?:\[?\s*(서술형|주관식|단답형|객관식)\s*\]?|※\s*([가-힣A-Za-z]+)\s*\(([0-9]+)[\~\-]([0-9]+)\))\s*$')

    # ── 3. 줄별 노이즈 제거 + 인라인 노이즈 제거 ────────────
    lines = []
    for l in lines_raw:
        l_strip = l.strip()
        if not l_strip:
            continue
        sm = SECTION_HDR.match(l_strip)
        if sm:
            lines.append(l_strip)
            continue
        l2 = _strip_inline_noise(l_strip)
        if not l2 or _is_noise_line(l2):
            continue
        lines.append(l2)

    # ── 4. 문제 블록 분할 ────────────────────────────────────
    # 패턴: "숫자." 또는 "[숫자]" 또는 "문제 숫자."
    Q_START = re.compile(
        r'^(?:'
        r'([0-9]{1,3})\.\s*(.*)'           # "1. 텍스트" 또는 "1."
        r'|'
        r'\[\s*(?:문제|문항|문|Q|Question)?\s*([0-9]{1,3})\s*\]\s*(.*)'  # "[1]" 또는 "[문제 1]"
        r'|'
        r'(?:문제|문항|문|Q|Question)\s*([0-9]{1,3})\s*[.\:\-]\s*(.*)'   # "문제 1."
        r')$',
        re.IGNORECASE
    )

    raw_questions = []
    current_q = None
    last_num = 0
    section_label = ''  # 서술형/단답형 등 섹션 레이블

    for line in lines:
        # 섹션 헤더 감지
        sm = SECTION_HDR.match(line)
        if sm:
            sec_type = sm.group(1)
            prof_name = sm.group(2)
            r_start = int(sm.group(3)) if sm.group(3) else None

            if sec_type:
                section_label = sec_type
                last_num = 0
            elif prof_name and r_start == 1:
                # 서술형 등에서 1번부터 다시 시작하는 교수 섹션
                section_label = f"서술형({prof_name})" if '서술' in section_label else prof_name
                last_num = 0
            continue

        m = Q_START.match(line)
        if m:
            # 번호 추출
            if m.group(1) is not None:
                num = int(m.group(1)); rest = m.group(2).strip()
            elif m.group(3) is not None:
                num = int(m.group(3)); rest = m.group(4).strip()
            else:
                num = int(m.group(5)); rest = m.group(6).strip()

            is_new_q = False

            if current_q is None:
                is_new_q = True
            else:
                # 1) 정상 순차 증가: last_num + 1 또는 누락 시 최대 +3 건너뜀
                if 1 <= num - last_num <= 3:
                    is_new_q = True
                # 2) 섹션 레이블이 명시적으로 주어졌고 번호가 1로 시작하는 경우
                elif section_label and num == 1 and last_num == 0:
                    is_new_q = True
                # 3) 앞선 문제가 40번 이상인데 갑자기 1이나 2가 나오는 경우 (명시적 섹션 헤더 없이)
                #    -> 이는 Q48처럼 문제 내부 본문/화학반응 번호이므로 새 문제로 보지 않음!
                else:
                    is_new_q = False

            if is_new_q:
                if current_q:
                    raw_questions.append(current_q)
                current_q = {
                    'q_number': num,
                    'section': section_label,
                    'raw_lines': [rest] if rest else [],
                }
                last_num = num
            else:
                if current_q:
                    current_q['raw_lines'].append(line)
        else:
            if current_q:
                current_q['raw_lines'].append(line)

    if current_q:
        raw_questions.append(current_q)

    # ── 5. 각 문제 블록 → 발문 + 선지 분리 ─────────────────
    final_questions = []
    for idx, raw_q in enumerate(raw_questions):
        parsed = _finalize_question(raw_q)
        parsed['id'] = idx + 1
        parsed['index'] = idx + 1
        # 정답표에서 추출한 정답 매핑 (객관식/단답형 본문에만 적용, 서술형 문항 제외)
        q_num = raw_q['q_number']
        is_sub = '서술' in str(raw_q.get('section', ''))
        if not is_sub and q_num in answer_table:
            a_val = answer_table[q_num]
            if a_val in CIRCLE_MAP:
                parsed['answer'] = CIRCLE_MAP[a_val]
            elif len(a_val) == 1 and a_val in REVERSE_CIRCLE:
                parsed['answer'] = a_val
            else:
                parsed['answer'] = a_val
        elif is_sub:
            parsed['answer'] = None
        final_questions.append(parsed)

    return final_questions


def _finalize_question(raw_q: Dict) -> Dict[str, Any]:
    """한 문제 블록에서 발문·보기·선지를 분리합니다."""
    q_num = raw_q['q_number']
    section = raw_q.get('section', '')
    raw_lines = raw_q['raw_lines']
    full_block = '\n'.join(raw_lines)

    stem_lines: List[str] = []
    choices: List[Dict] = []

    # ── 전략 A: 원문자(①②③...) 선지 분리 ──────────────
    if '①' in full_block and any(sym in full_block for sym in ['②', '③']):
        pos1 = full_block.find('①')
        stem_part = full_block[:pos1].strip()
        choices_part = full_block[pos1:]
        parts = re.split(r'([①②③④⑤⑥⑦⑧⑨])', choices_part)
        i = 1
        while i < len(parts):
            label = parts[i].strip()
            ch_text = (parts[i + 1] if i + 1 < len(parts) else '').strip()
            ch_text = _strip_inline_noise(re.sub(r'\s+', ' ', ch_text))
            if label:
                choices.append({'label': label, 'text': ch_text})
            i += 2
        stem_lines = [stem_part]

    # ── 전략 B: "1) 텍스트" / "(1) 텍스트" 선지 분리 ────
    else:
        CHOICE_RE = re.compile(r'^(?:([1-9])\)|(?:\(([1-9])\)))\s+(.*)$')
        in_choices = False
        for line in raw_lines:
            cm = CHOICE_RE.match(line)
            if cm:
                digit = cm.group(1) or cm.group(2)
                label = CIRCLE_MAP.get(digit, f'({digit})')
                ch_text = _strip_inline_noise(cm.group(3).strip())
                # 이미 선지가 있고 번호가 연속인지 확인 (오탐 방지)
                if choices:
                    expected = str(len(choices) + 1)
                    if digit != expected and int(digit) > len(choices) + 2:
                        # 번호 점프 → 선지 아님, 발문에 추가
                        if not in_choices:
                            stem_lines.append(line)
                        else:
                            choices[-1]['text'] += ' ' + line
                        continue
                in_choices = True
                choices.append({'label': label, 'text': ch_text})
            else:
                if not in_choices:
                    stem_lines.append(line)
                else:
                    # 선지 이후 이어지는 줄 → 마지막 선지에 이어 붙임
                    if choices:
                        choices[-1]['text'] += ' ' + _strip_inline_noise(line)

    # 선지가 1개뿐인 경우는 선지가 아니라 문제 본문(예: "(1) 탄수화물...")인 경우가 많음
    if len(choices) == 1:
        single_choice = choices[0]
        # 만약 원문자 선지였거나 label이 붙어있더라도 1개뿐이면 stem에 복원
        restored = f"{single_choice['label']} {single_choice['text']}".strip()
        if stem_lines:
            stem_lines.append(restored)
        else:
            stem_lines = [restored]
        choices = []

    # ── 발문 정리 ─────────────────────────────────────────
    full_stem = clean_whitespace(' '.join(stem_lines))
    # 발문 앞의 번호 기호 제거
    full_stem = re.sub(
        r'^(?:\[\s*(?:문제|문항|문|Q|Question)?\s*[0-9]{1,3}\s*\]'
        r'|(?:문제|문항|문|Q|Question)\s*[0-9]{1,3}\s*[.\:\-]?'
        r'|[0-9]{1,3}\s*[.\:\-]\s+)',
        '', full_stem
    ).strip()

    # ── 발문 끝에서 정답 힌트 검출 ────────────────────────
    detected_answer = None
    ans_m = re.search(r'[\?\s]([1-9])\s*$', full_stem)
    if ans_m:
        detected_answer = CIRCLE_MAP.get(ans_m.group(1))

    display_q_num = f"[{section}] {q_num}" if section else str(q_num)

    return {
        'q_number': q_num,
        'display_number': display_q_num,
        'section': section,
        'stem': full_stem,
        'choices': choices,
        'detected_answer': detected_answer,
        'answer': detected_answer,  # 정답표에서 덮어씌워질 예정
    }


