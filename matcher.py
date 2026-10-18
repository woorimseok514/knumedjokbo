import re
import html
from typing import List, Dict, Any, Tuple
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# 한국어 및 영어 불용어 (전치사, 관사, 접속사 등)
STOPWORDS = set([
    '다음', '중', '옳은', '옳지', '않은', '틀린', '것은', '가장', '골라라', '고르면', '대한', 
    '설명으로', '설명', '것이다', '있다', '없다', '된다', '하며', '하고', '그리고', '그러나', 
    '또는', '등', '및', '위한', '대해', '모두', '경우', '통해', '관한', '어떤', '무엇인가',
    '어느', '위하여', '의하여', '때문', '따라', '의한', '모든', '각각', '해당하는', '문항',
    # 영어 일반 불용어 (in, of, the 등이 단어 내부나 잡음으로 매칭되는 것 원천 방지)
    'in', 'of', 'the', 'and', 'to', 'a', 'an', 'is', 'are', 'was', 'were', 'at', 'by',
    'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before',
    'after', 'above', 'below', 'from', 'up', 'down', 'on', 'off', 'over', 'under', 'again',
    'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any',
    'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
    'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should',
    'now', 'which', 'that', 'this', 'these', 'those'
])

# 한국어 조사 및 어미 단순 정제 패턴
JOSA_PATTERN = re.compile(r'(은|는|이|가|을|를|의|에|에서|로|으로|와|과|보다|까지|부터|에게|한테|이다|이며|이고|이나|처럼|마저|조차)$')

def extract_keywords(text: str) -> List[str]:
    """문장에서 실질적인 의미를 갖는 핵심 키워드를 추출합니다."""
    # 특수문자 제거 및 단어 분리
    words = re.findall(r'[a-zA-Z0-9가-힣]+', text)
    keywords = []
    
    for word in words:
        w_lower = word.lower()
        if w_lower in STOPWORDS:
            continue
        # 영문인 경우 2글자 이하의 일반 약어가 아닌 짧은 단어 제외 (단, pH, ER, O2 등 의미있는 2글자 대문자 용어는 허용)
        if re.match(r'^[a-zA-Z]{1,2}$', word) and not word.isupper():
            continue
        if len(word) < 2:
            continue
            
        # 어미/조사 단순 분리 (한글의 경우)
        if re.search(r'[가-힣]', word):
            trimmed = JOSA_PATTERN.sub('', word)
            if len(trimmed) >= 2 and trimmed not in STOPWORDS:
                keywords.append(trimmed)
            else:
                keywords.append(word)
        else:
            keywords.append(word)
            
    # 중복 제거하되 순서 보존
    seen = set()
    result = []
    for k in keywords:
        k_lower = k.lower()
        if k_lower not in seen and k_lower not in STOPWORDS:
            seen.add(k_lower)
            result.append(k)
    return result

def contains_word(keyword: str, text: str) -> bool:
    """
    텍스트 내에 키워드가 존재하는지 검사합니다.
    - 영문 키워드: 단어 단위(\\b 또는 영문자/숫자 경계)로 일치해야 참 (예: 'cell'이 'extracellular'에 오탐지되는 것 방지)
    - 한글 키워드: 한국어 어절 특성을 고려하여 기존 부분 문자열 일치 유지
    """
    if not keyword or not text:
        return False
    # 영문자가 포함된 키워드인 경우 독립 단어 경계 검사
    if re.search(r'[a-zA-Z]', keyword):
        pattern = rf'(?<![a-zA-Z0-9]){re.escape(keyword)}(?![a-zA-Z0-9])'
        return bool(re.search(pattern, text, re.IGNORECASE))
    # 한글 및 기타 키워드는 기존대로 포함 여부 확인
    return keyword.lower() in text.lower()

def highlight_text(snippet: str, keywords: List[str]) -> str:
    """스니펫 내에서 일치하는 키워드를 HTML 형광펜 태그로 감쌉니다."""
    if not snippet or not keywords:
        return html.escape(snippet)
        
    safe_text = html.escape(snippet)
    # 길이 긴 키워드부터 하이라이트 적용 (부분 문자열 꼬임 방지)
    sorted_kws = sorted([k for k in keywords if len(k) >= 2], key=lambda x: len(x), reverse=True)
    
    for kw in sorted_kws:
        escaped_kw = html.escape(kw)
        if re.search(r'[a-zA-Z]', kw):
            pattern = re.compile(rf'(?<![a-zA-Z0-9])({re.escape(escaped_kw)})(?![a-zA-Z0-9])', re.IGNORECASE)
        else:
            pattern = re.compile(f'({re.escape(escaped_kw)})', re.IGNORECASE)
        safe_text = pattern.sub(r'<mark class="match-mark">\1</mark>', safe_text)
        
    return safe_text

def find_best_snippet(slide_text: str, choice_text: str, keywords: List[str], max_len: int = 240) -> Tuple[str, List[str]]:
    """슬라이드 본문에서 선지 키워드가 가장 많이 포함된 문장 영역(스니펫)을 추출합니다."""
    if not slide_text.strip():
        return ("", [])
        
    # 문장 또는 줄 단위 분할
    sentences = re.split(r'[\.\n\?!]+', slide_text)
    sentences = [s.strip() for s in sentences if s.strip()]
    
    if not sentences:
        sentences = [slide_text.strip()]
        
    matched_kws_in_doc = [k for k in keywords if contains_word(k, slide_text)]
    
    best_sent = ""
    best_score = -1
    best_matched = []
    
    for i, sent in enumerate(sentences):
        sent_matched = [k for k in keywords if contains_word(k, sent)]
        score = len(sent_matched)
        
        # 앞뒤 문맥 결합 고려
        context = sent
        if i + 1 < len(sentences) and len(context) < 120:
            context += ". " + sentences[i + 1]
            for k in keywords:
                if contains_word(k, sentences[i + 1]) and k not in sent_matched:
                    sent_matched.append(k)
                    score += 0.8
                    
        if score > best_score:
            best_score = score
            best_sent = context
            best_matched = sent_matched
            
    # 매칭된 문장이 없거나 미약할 경우 슬라이드 앞부분 발췌
    if not best_sent:
        best_sent = slide_text[:max_len].strip()
        best_matched = matched_kws_in_doc
    else:
        if len(best_sent) > max_len:
            best_sent = best_sent[:max_len] + "..."
            
    return (best_sent, best_matched)

def expand_choice_with_bogi(choice_text: str, stem_text: str) -> str:
    """
    선지가 'ㄱ, ㄷ' 처럼 <보기> 기호를 가리키고 있을 경우,
    발문(stem)의 <보기> 내용에서 해당 기호의 실제 문맥을 찾아 결합합니다.
    """
    if not stem_text:
        return choice_text
        
    jamo_symbols = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ']
    matched_jamos = [j for j in jamo_symbols if j in choice_text]
    
    if not matched_jamos:
        return choice_text
        
    expanded_parts = [choice_text]
    for j in matched_jamos:
        pattern = re.compile(rf'(?:{j}\.|\({j}\)|{j}\))\s*([^\n\r]+)')
        m = pattern.search(stem_text)
        if m:
            bogi_sentence = m.group(1).strip()
            # 다른 보기 기호가 섞여있으면 자르기
            bogi_sentence = re.sub(r'(?:[ㄱ-ㅎ]\.|\([ㄱ-ㅎ]\)|[ㄱ-ㅎ]\)).*$', '', bogi_sentence).strip()
            if bogi_sentence:
                expanded_parts.append(bogi_sentence)
            
    return " ".join(expanded_parts)

class LectureExamMatcher:
    def __init__(self, lecture_units: List[Dict[str, Any]]):
        """
        lecture_units: List of {
            "doc_id": str,
            "doc_title": str,
            "unit_type": str ("슬라이드", "페이지", "단락"),
            "unit_number": int,
            "text": str
        }
        """
        self.units = lecture_units
        self.corpus = [u.get("text", "") for u in self.units]
        self.vectorizer = None
        self.tfidf_matrix = None
        
        # TF-IDF 모델 초기화 (글자 바이그램 및 단어 포함)
        if self.corpus and any(c.strip() for c in self.corpus):
            try:
                self.vectorizer = TfidfVectorizer(
                    ngram_range=(1, 2),
                    min_df=1,
                    token_pattern=r'(?u)\b[a-zA-Z0-9가-힣]+\b'
                )
                self.tfidf_matrix = self.vectorizer.fit_transform(self.corpus)
            except Exception as e:
                print(f"[TF-IDF 초기화 경고] {e}")

    def match_choice(self, choice_text: str, stem_text: str = "", top_k: int = 3) -> Dict[str, Any]:
        """하나의 선지에 대해 강의 자료 전체에서 가장 언급도가 높은 부분들을 찾습니다."""
        effective_choice_text = expand_choice_with_bogi(choice_text, stem_text)
        choice_kws = extract_keywords(effective_choice_text)
        stem_kws = extract_keywords(stem_text)
        
        if not self.units or not self.corpus:
            return {
                "status": "none",
                "status_label": "강의 자료 없음",
                "top_match": None,
                "candidates": []
            }

        unit_scores = []
        
        # TF-IDF 유사도 계산
        tfidf_sims = None
        if self.vectorizer and self.tfidf_matrix is not None:
            try:
                # 선지 텍스트와 발문 결합 쿼리
                query_text = choice_text + " " + choice_text + " " + stem_text
                query_vec = self.vectorizer.transform([query_text])
                sims = cosine_similarity(query_vec, self.tfidf_matrix)[0]
                tfidf_sims = sims
            except Exception:
                tfidf_sims = None

        for idx, unit in enumerate(self.units):
            doc_text = unit.get("text", "")
            doc_text_lower = doc_text.lower()
            
            # 1. 키워드 일치율 (Keyword Coverage)
            if choice_kws:
                matched_c_kws = [k for k in choice_kws if contains_word(k, doc_text)]
                kw_coverage = len(matched_c_kws) / len(choice_kws)
            else:
                matched_c_kws = []
                kw_coverage = 0.0
                
            # 2. 발문 키워드 보너스 (같은 주제 슬라이드인지 확인)
            if stem_kws:
                matched_stem_kws = [k for k in stem_kws if contains_word(k, doc_text)]
                stem_coverage = len(matched_stem_kws) / len(stem_kws)
            else:
                stem_coverage = 0.0

            # 3. TF-IDF 점수
            tfidf_score = float(tfidf_sims[idx]) if tfidf_sims is not None else 0.0
            
            # 4. 선지 전체 구문 또는 연속 2단어 구문 매칭 가산점
            phrase_bonus = 0.0
            if choice_text.strip() and len(choice_text.strip()) > 4:
                clean_c = re.sub(r'\s+', '', choice_text.lower())
                clean_d = re.sub(r'\s+', '', doc_text_lower)
                if clean_c in clean_d:
                    phrase_bonus += 0.45
                    
            # 종합 점수 (0.0 ~ 1.0)
            composite_score = (
                (kw_coverage * 0.40) +
                (tfidf_score * 0.35) +
                (stem_coverage * 0.10) +
                phrase_bonus
            )
            composite_score = min(composite_score, 1.0)
            
            unit_scores.append((idx, composite_score, kw_coverage, matched_c_kws))

        # 점수 내림차순 정렬
        unit_scores.sort(key=lambda x: x[1], reverse=True)
        
        candidates = []
        for idx, comp_score, kw_cov, matched_kws in unit_scores[:top_k]:
            unit = self.units[idx]
            snippet, snippet_matched = find_best_snippet(unit["text"], choice_text, choice_kws)
            highlighted = highlight_text(snippet, choice_kws)
            
            # 신뢰도 라벨 결정
            if comp_score >= 0.40 or kw_cov >= 0.65:
                item_status = "high"
                item_badge = "확실한 언급"
            elif comp_score >= 0.18 or kw_cov >= 0.30:
                item_status = "medium"
                item_badge = "관련 내용 있음"
            else:
                item_status = "low"
                item_badge = "직접 언급 없음"

            candidates.append({
                "doc_id": unit.get("doc_id"),
                "doc_title": unit.get("doc_title"),
                "unit_type": unit.get("unit_type", "슬라이드"),
                "unit_number": unit.get("unit_number", 1),
                "score": round(comp_score * 100, 1),
                "status": item_status,
                "badge": item_badge,
                "matched_keywords": matched_kws,
                "snippet": snippet,
                "highlighted_snippet": highlighted,
                "full_text": unit.get("text", "")
            })

        top_match = candidates[0] if candidates else None
        overall_status = top_match["status"] if top_match else "low"
        overall_badge = top_match["badge"] if top_match else "직접 언급 없음"

        return {
            "status": overall_status,
            "badge": overall_badge,
            "choice_keywords": choice_kws,
            "top_match": top_match,
            "candidates": candidates
        }

    def match_all_questions(self, questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """모든 족보 문항의 각 선지에 대해 강의자료 매칭을 수행합니다."""
        analyzed_questions = []
        
        for q in questions:
            stem = q.get("stem", "")
            q_num = q.get("q_number", q.get("index", 1))
            choices = q.get("choices", [])
            
            analyzed_choices = []
            for c in choices:
                c_label = c.get("label", "")
                c_text = c.get("text", "")
                
                match_result = self.match_choice(c_text, stem)
                analyzed_choices.append({
                    "label": c_label,
                    "text": c_text,
                    "analysis": match_result
                })
                
            analyzed_questions.append({
                "q_number": q_num,
                "stem": stem,
                "choices": analyzed_choices
            })
            
        return analyzed_questions
