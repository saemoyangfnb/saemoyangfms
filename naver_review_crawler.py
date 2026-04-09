import pandas as pd
import time
import os
import sys
import random
import re
import hashlib
from datetime import datetime, timedelta
from collections import Counter
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.action_chains import ActionChains
from webdriver_manager.chrome import ChromeDriverManager
from github import Github, Auth
from dotenv import load_dotenv

load_dotenv()

try:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    os.chdir(BASE_DIR)
except:
    pass

# ==========================================
# ⚙️ 1. 시스템 세팅
# ==========================================
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
NAVER_NID_AUT = os.getenv("NAVER_NID_AUT")
NAVER_NID_SES = os.getenv("NAVER_NID_SES")
GITHUB_REPO_NAME = "Joyj9331/dalbitgo-review"
CSV_FILENAME = "가맹점_리뷰수집결과_누적.csv"
KEYWORD_RESULT_CSV = "가맹점_리뷰키워드_분석결과.csv"
SUCCESS_LOG_FILENAME = "crawling_success_log.txt"


# ==========================================
# 🔑 2. 고유 ID 생성
# ==========================================
def generate_review_id(store_name, date, content):
    return hashlib.md5(f"{store_name}_{date}_{content}".encode()).hexdigest()

def generate_dedup_key(store_name, date, content):
    return f"{store_name}_{date}_{str(content)[:50]}"


# ==========================================
# 🧠 3. 감정 분석
# ==========================================
def analyze_sentiment(text):
    positive_words = ['맛있', '친절', '좋', '최고', '추천', '깔끔', '넓', '가성비', '신선', '빠르', '단골']
    negative_words = ['불친절', '맛없', '별로', '비싸', '느리', '더럽', '실망', '최악', '짜다', '비리다', '뻣뻣', '뻑뻑', '다신', '다시는', '비추', '싱겁', '갈바에', '갈바엔', '돈아깝', '냄새', '불쾌', '불만', '눈치', '엉망', '안익']
    critical_words = ['불친절', '최악', '다신', '다시는', '비추', '갈바에', '갈바엔', '실망', '더럽', '뻣뻣', '뻑뻑', '싱겁', '맛없', '돈아깝', '벌레', '머리카락', '이물질', '싸가지', '기분 나빴', '기분상', '서비스 엉망']
    text = str(text)
    for w in critical_words:
        if w in text:
            return '부정'
    pos = sum(1 for w in positive_words if w in text)
    neg = sum(1 for w in negative_words if w in text)
    if neg > 0 and neg >= pos:
        return '부정'
    elif pos > 0:
        return '긍정'
    return '중립'


# ==========================================
# 📅 4. 날짜 파싱
# ==========================================
def parse_naver_date(date_str):
    date_str = str(date_str).strip()
    now = datetime.now()

    if '전' in date_str:
        if '일 전' in date_str:
            try:
                days = int(re.search(r'(\d+)일', date_str).group(1))
                return (now - timedelta(days=days)).strftime('%Y-%m-%d')
            except: pass
        elif '시간 전' in date_str:
            try:
                hours = int(re.search(r'(\d+)시간', date_str).group(1))
                return (now - timedelta(hours=hours)).strftime('%Y-%m-%d')
            except: pass
        elif '분 전' in date_str:
            try:
                minutes = int(re.search(r'(\d+)분', date_str).group(1))
                return (now - timedelta(minutes=minutes)).strftime('%Y-%m-%d')
            except: pass
        return now.strftime('%Y-%m-%d')

    if '어제' in date_str:
        return (now - timedelta(days=1)).strftime('%Y-%m-%d')

    # "2026년 3월 29일"
    m = re.search(r'(\d{4})[년\.]\s*(\d{1,2})[월\.]\s*(\d{1,2})[일\.]?', date_str)
    if m:
        return f"{int(m.group(1))}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"

    # "25.3.29."
    m = re.match(r'^(\d{2})\.(\d{1,2})\.(\d{1,2})', date_str)
    if m:
        return f"{2000+int(m.group(1))}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"

    # "3.29.일" (월.일.요일) - 네이버 플레이스 최신 형식
    m = re.match(r'^(\d{1,2})\.(\d{1,2})\.(월|화|수|목|금|토|일)', date_str)
    if m:
        month, day, year = int(m.group(1)), int(m.group(2)), now.year
        try:
            if datetime(year, month, day) > now:
                year -= 1
        except: pass
        return f"{year}-{month:02d}-{day:02d}"

    # "3.29."
    m = re.match(r'^(\d{1,2})\.(\d{1,2})\.$', date_str)
    if m:
        month, day, year = int(m.group(1)), int(m.group(2)), now.year
        try:
            if datetime(year, month, day) > now:
                year -= 1
        except: pass
        return f"{year}-{month:02d}-{day:02d}"

    return now.strftime('%Y-%m-%d')


# ==========================================
# 📊 5. 키워드 추출
# ==========================================
STOPWORDS = {
    '이', '가', '을', '를', '은', '는', '의', '에', '에서', '도', '로', '으로',
    '와', '과', '이고', '이며', '하고', '한', '하는', '있는', '없는', '것', '수',
    '있어', '없어', '같아', '같은', '같이', '정도', '너무', '진짜', '정말', '매우',
    '그냥', '조금', '약간', '항상', '자주', '또', '다시', '그리고', '하지만',
    '근데', '그런데', '그래서', '그렇게', '이렇게', '저렇게', '여기',
    '이번', '오늘', '어제', '내일', '처음', '마지막', '다른', '이런', '저런',
    '더', '덜', '많이', '적게', '잘', '못', '안', '안해', '입니다',
    '습니다', '합니다', '했어요', '해요', '어요', '아요', '네요', '군요',
    '거예요', '거에요', '이에요', '예요', '같아요', '인데요', '이라서', '라서',
    '고등어', '달빛', '구운', '가게', '식당', '집', '곳', '데', '때', '분들',
    '직원', '사장', '손님', '우리', '저', '나', '제', '그',
}

def extract_keywords_from_reviews(reviews_text_list, top_n=10):
    word_counter = Counter()
    for text in reviews_text_list:
        if not text or len(str(text)) < 5:
            continue
        for word in re.findall(r'[가-힣]{2,}', str(text)):
            if word not in STOPWORDS:
                word_counter[word] += 1
    return word_counter.most_common(top_n)

def analyze_and_save_keywords(df):
    if df.empty:
        return
    print("\n[키워드 분석] 시작...")
    today_str = datetime.now().strftime('%Y-%m-%d')
    results = []
    for store_name in df['매장명'].unique().tolist():
        sdf = df[df['매장명'] == store_name]
        pos = sdf[sdf['감정분석'] == '긍정']['리뷰내용'].tolist()
        neg = sdf[sdf['감정분석'] == '부정']['리뷰내용'].tolist()
        all_r = sdf['리뷰내용'].tolist()
        results.append({
            '분석일자': today_str, '매장명': store_name,
            '총리뷰수': len(sdf), '긍정리뷰수': len(pos), '부정리뷰수': len(neg),
            '긍정_핵심키워드': ', '.join([f"{k}({c})" for k, c in extract_keywords_from_reviews(pos)]) or '-',
            '부정_핵심키워드': ', '.join([f"{k}({c})" for k, c in extract_keywords_from_reviews(neg)]) or '-',
            '전체_핵심키워드': ', '.join([f"{k}({c})" for k, c in extract_keywords_from_reviews(all_r)]) or '-',
        })
    result_df = pd.DataFrame(results)
    result_df.to_csv(KEYWORD_RESULT_CSV, index=False, encoding='utf-8-sig')
    print(f"  CSV 저장 완료 ({len(results)}개 매장)")
    try:
        from firestore_client import get_db, Collections
        db = get_db()
        for _, row in result_df.iterrows():
            db.collection(Collections.KEYWORDS).document(f"{row['매장명']}_{today_str}").set(
                {k: str(v) for k, v in row.items()}, merge=True)
        print(f"  Firestore 저장 완료")
    except Exception as e:
        print(f"  Firestore 저장 실패: {e}")


# ==========================================
# 💾 6. Firestore 저장
# ==========================================
def save_reviews_to_firestore(new_reviews_df):
    try:
        from firestore_client import get_db, Collections
        db = get_db()
        protected_ids = set()
        for state_type in ['resolved', 'overridden']:
            try:
                doc = db.collection(Collections.REVIEW_STATES).document(state_type).get()
                if doc.exists:
                    protected_ids.update(doc.to_dict().get('ids', []))
            except: pass
        saved = skipped = errors = 0
        for _, row in new_reviews_df.iterrows():
            try:
                doc_id = generate_review_id(str(row['매장명']), str(row['작성일']), str(row['리뷰내용']))
                if doc_id in protected_ids:
                    data = {k: str(v) for k, v in row.items() if k != '감정분석'}
                    skipped += 1
                else:
                    data = {k: str(v) for k, v in row.items()}
                db.collection(Collections.REVIEWS).document(doc_id).set(data, merge=True)
                saved += 1
            except Exception as e:
                errors += 1
        print(f"  -> Firestore: {saved}건 저장 (보호: {skipped}건, 오류: {errors}건)")
    except Exception as e:
        print(f"  -> Firestore 연결 실패: {e}")


# ==========================================
# 🍪 7. 네이버 쿠키 주입
# ==========================================
def inject_naver_cookies(driver):
    if not NAVER_NID_AUT or not NAVER_NID_SES:
        print("  [쿠키] 비로그인 모드")
        return False
    try:
        driver.get("https://www.naver.com")
        time.sleep(random.uniform(1.5, 2.5))
        for cookie in [
            {'name': 'NID_AUT', 'value': NAVER_NID_AUT, 'domain': '.naver.com', 'path': '/', 'secure': True},
            {'name': 'NID_SES', 'value': NAVER_NID_SES, 'domain': '.naver.com', 'path': '/', 'secure': True},
        ]:
            driver.add_cookie(cookie)
        driver.refresh()
        time.sleep(random.uniform(1.5, 2.0))
        print("  [쿠키] 주입 완료")
        return True
    except Exception as e:
        print(f"  [쿠키] 오류: {e}")
        return False


# ==========================================
# 📊 7. 공식 키워드 통계 수집
# ==========================================
def crawl_keyword_stats(driver, store_name):
    """네이버 플레이스 상단의 '이런 점이 좋아요' 통계 수집"""
    print(f"  - [{store_name}] 공식 키워드 통계 수집 중...")
    today_str = datetime.now().strftime('%Y-%m-%d')
    stats = {"매장명": store_name, "수집일자": today_str}
    try:
        # 키워드 아이템 탐색 (확인된 클래스 pui__T9Bff)
        items = driver.find_elements(By.CSS_SELECTOR, ".place_section_content li.pui__T9Bff")
        if not items:
            # 대체 셀렉터
            items = driver.find_elements(By.CSS_SELECTOR, ".pui__T9Bff")
        
        for item in items:
            try:
                keyword = item.find_element(By.CSS_SELECTOR, ".pui__HGR6W").text.strip()
                count_str = item.find_element(By.CSS_SELECTOR, ".pui__n1GFH").text.strip()
                # "123" 또는 "1,234" 형태에서 숫자만 추출
                count = int(re.sub(r'[^0-9]', '', count_str))
                stats[keyword] = count
            except:
                continue
    except Exception as e:
        print(f"    [경고] 키워드 통계 추출 중 오류: {e}")
    
    return stats if len(stats) > 2 else None

def save_keyword_stats_to_firestore(stats):
    if not stats: return
    try:
        from firestore_client import get_db
        db = get_db()
        doc_id = f"{stats['매장명']}_{stats['수집일자']}"
        db.collection('keyword_stats').document(doc_id).set(stats)
    except:
        pass

# ==========================================
# 🖱️ 8. 인간 행동 모사 (Anti-Bot)
# ==========================================
def simulate_human_behavior(driver):
    """마우스 이동 및 부드러운 스크롤 모사"""
    try:
        # 1. 랜덤 마우스 이동
        action = ActionChains(driver)
        viewport_width = driver.execute_script("return window.innerWidth;")
        viewport_height = driver.execute_script("return window.innerHeight;")
        for _ in range(random.randint(2, 4)):
            x = random.randint(10, viewport_width - 10)
            y = random.randint(10, viewport_height - 10)
            action.move_by_offset(x // 10, y // 10).perform()
            time.sleep(random.uniform(0.1, 0.3))
        
        # 2. 부드러운 스크롤
        total_scroll = random.randint(200, 500)
        current_scroll = 0
        while current_scroll < total_scroll:
            step = random.randint(30, 70)
            driver.execute_script(f"window.scrollBy(0, {step});")
            current_scroll += step
            time.sleep(random.uniform(0.1, 0.2))
    except:
        pass

# ==========================================
# 🚀 9. 크롤링 엔진 (실제 사용자 동작 순서 반영)
# ==========================================
def crawl_naver_reviews(url, store_name, existing_keys, mode="normal", last_date=None):
    target_count = 500 if mode == "intensive" else 20
    print(f"\n[{store_name}] 크롤링 시작... ({'3개월 집중' if mode == 'intensive' else f'최신 20건 (기준일: {last_date or "전체"})'})") 

    options = webdriver.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('window-size=1920x1080')
    options.add_argument('--disable-gpu')
    options.add_argument('--blink-settings=imagesEnabled=false')
    options.add_argument('--disable-extensions')
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)

    try:
        driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
        # AI 탐지 우회: navigator 속성 보정 (webdriver false, languages, platform 등)
        driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
            'source': '''
                Object.defineProperty(navigator, "webdriver", {get: () => undefined});
                Object.defineProperty(navigator, "plugins", {get: () => [1, 2, 3, 4, 5]});
                Object.defineProperty(navigator, "languages", {get: () => ["ko-KR", "ko"]});
            '''
        })
    except:
        return "NETWORK_ERROR"

    reviews_data = []
    three_months_ago = datetime.now() - timedelta(days=90)
    duplicate_count = 0

    try:
        # 쿠키 주입
        inject_naver_cookies(driver)

        driver.get(url)
        time.sleep(random.uniform(3.0, 4.5))
        
        # 인간 행동 모사 시작
        simulate_human_behavior(driver)

        try:
            driver.switch_to.frame("entryIframe")
        except:
            pass

        # =============================================
        # STEP 1. 가장 위로 스크롤
        # =============================================
        driver.execute_script("window.scrollTo(0, 0);")
        time.sleep(random.uniform(1.5, 2.0))

        # =============================================
        # STEP 2. "방문자리뷰" 버튼 클릭
        # 확인된 구조: role=button, 텍스트에 "방문자 리뷰" 포함
        # =============================================
        visit_clicked = False
        for attempt in range(5):
            try:
                # "방문자 리뷰 663" 형태의 버튼
                btns = driver.find_elements(By.XPATH, "//a[contains(text(),'방문자') and contains(text(),'리뷰')]")
                if not btns:
                    btns = driver.find_elements(By.XPATH, "//a[@role='button' and contains(text(),'방문자')]")
                for btn in btns:
                    if btn.is_displayed():
                        driver.execute_script("arguments[0].click();", btn)
                        visit_clicked = True
                        print(f"  - [방문자리뷰] 클릭: {btn.text[:30]}")
                        break
            except:
                pass
            if visit_clicked:
                time.sleep(random.uniform(2.5, 3.5))
                break
            driver.execute_script("window.scrollBy(0, 150);")
            time.sleep(1.0)

        if not visit_clicked:
            print("  - [경고] 방문자리뷰 버튼 클릭 실패")
        else:
            # 🆕 STEP 2.5 공식 키워드 통계 수집
            k_stats = crawl_keyword_stats(driver, store_name)
            if k_stats:
                save_keyword_stats_to_firestore(k_stats)
                print(f"    -> 공식 키워드 {len(k_stats)-2}개 수집 완료")

        # =============================================
        # STEP 3. 아래로 스크롤하며 "최신순" 버튼 탐색 후 클릭
        # =============================================
        sort_clicked = False
        for attempt in range(10):
            driver.execute_script("window.scrollBy(0, 200);")
            time.sleep(0.8)

            # 확인된 구조: class=place_btn_option, role=option, 텍스트=최신순
            btns = driver.find_elements(By.XPATH, "//a[contains(@class,'place_btn_option') and @role='option']")
            if not btns:
                btns = driver.find_elements(By.XPATH, "//a[contains(text(),'최신순')]")

            for btn in btns:
                if btn.is_displayed():
                    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", btn)
                    time.sleep(0.5)
                    driver.execute_script("arguments[0].click();", btn)
                    sort_clicked = True
                    break

            if sort_clicked:
                print("  - [최신순] 클릭 완료")
                time.sleep(random.uniform(4.0, 5.0))
                break

        if not sort_clicked:
            print("  - [경고] 최신순 버튼 클릭 실패")

        # =============================================
        # STEP 4. 천천히 스크롤하며 리뷰 수집
        # =============================================
        print(f"  - 리뷰 본문 및 태그 수집 시작 (목표: {target_count}건)")
        
        # 수집 전 한번 더 행동 모사
        simulate_human_behavior(driver)
        
        processed_ids = set()
        stop_crawling = False
        stagnant_count = 0
        prev_count = 0
        scroll_attempts = 0
        max_scrolls = 200 if mode == "intensive" else 25  # 경량화: 일반 모드는 25회로 제한

        while scroll_attempts < max_scrolls:
            if stop_crawling or len(reviews_data) >= target_count:
                break

            # 현재 화면에 있는 리뷰 수집
            review_elements = driver.find_elements(By.XPATH, "//li[.//time]")
            current_count = len(review_elements)

            if current_count == prev_count:
                stagnant_count += 1
            else:
                stagnant_count = 0
            prev_count = current_count

            for el in review_elements:
                if stop_crawling or len(reviews_data) >= target_count:
                    break
                try:
                    el_id = el.id
                    if el_id in processed_ids:
                        continue
                    processed_ids.add(el_id)

                    # 날짜 추출
                    parsed_date = None
                    try:
                        raw_date = el.find_element(By.TAG_NAME, "time").text
                        parsed_date = parse_naver_date(raw_date)
                    except:
                        pass

                    # time 태그 실패시 텍스트에서 날짜 탐색
                    if not parsed_date:
                        m = re.search(r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일', el.text)
                        if m:
                            parsed_date = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
                        else:
                            parsed_date = datetime.now().strftime('%Y-%m-%d')

                    # 🆕 증분 수집: 이미 수집된 최신 날짜보다 오래된 리뷰 만나면 즉시 종료
                    if mode == "normal" and last_date and parsed_date:
                        try:
                            if parsed_date < last_date:
                                print(f"  - [증분] '{parsed_date}' ≤ 기준일 '{last_date}' → 수집 중단")
                                stop_crawling = True
                                break
                        except:
                            pass

                    # 집중 모드: 3개월 이전 리뷰는 스킵
                    if mode == "intensive":
                        try:
                            if datetime.strptime(parsed_date, '%Y-%m-%d') < three_months_ago:
                                stop_crawling = True
                                break
                        except:
                            pass

                    # ✅ 1. 더보기 버튼 클릭 (상세 텍스트 노출을 위해 먼저 수행)
                    try:
                        # pui__jhpEyP 또는 .rvS6Y 내부의 더보기 버튼 탐색
                        more_btns = el.find_elements(By.CSS_SELECTOR, 'a[role="button"], .rvS6Y, .zPfVt .rvS6Y')
                        for m_btn in more_btns:
                            m_txt = m_btn.text.strip()
                            if m_btn.is_displayed() and ("더보기" in m_txt or "펼치기" in m_txt):
                                driver.execute_script("arguments[0].click();", m_btn)
                                time.sleep(0.4)
                                break
                    except: pass

                    # ✅ 2. 본문 추출 (상세 문장 위주)
                    content = ""
                    # 1순위: 현대적인 PUI 클래스 중 본문 영역
                    for selector in [".pui__jhpEyP", ".pui__V8F9nN", ".pui__xvAbDR"]: 
                        try:
                            # 해당 요소 내의 모든 텍스트를 가져오되, 너무 짧거나 키워드 패턴인 경우 제외 시도
                            e_list = el.find_elements(By.CSS_SELECTOR, selector)
                            for e in e_list:
                                txt = e.text.strip()
                                # 단순 키워드 태그("+1", "+2" 포함)는 제외
                                if re.search(r'\+\d+$', txt) or len(txt) < 5:
                                    continue
                                if len(txt) > len(content):
                                    content = txt
                        except: pass
                    
                    # 2순위: 전통적인 클래스 및 폴백
                    if len(content) < 10:
                        for selector in [".zPfVt", ".vgS6Y", "span.zPfVt"]:
                            try:
                                e = el.find_element(By.CSS_SELECTOR, selector)
                                txt = e.text.strip()
                                if txt and len(txt) > len(content):
                                    content = txt
                            except: pass

                    # ✅ 3. 노이즈 제거 (키워드 태그 등)
                    if content:
                        # '+숫자' 패턴 (예: '+3', '+15') 제거
                        content = re.sub(r'\+\d+', '', content).strip()
                        # 이모지로 시작하는 태그 패턴 제거 (필요시)
                        content = re.sub(r'^[\u2700-\u27BF]|[\u2600-\u26FF]\s*', '', content).strip()
                        # 중복 공백 제거
                        content = re.sub(r'\s+', ' ', content)

                    if not content or len(content) < 4:
                        continue
                        
                    # 단순 만족 키워드 덩어리이거나 너무 짧은 경우 최종 필터링
                    if content.strip() in ['영수증', '예약', '사진'] or (len(content) < 12 and any(kw in content for kw in ['맛있어요', '친절해요', '좋아요'])):
                        continue

                    # ✅ 태그 추출 - 확인된 클래스 pui__V8F9nN
                    tag_list = []
                    try:
                        for t in el.find_elements(By.CSS_SELECTOR, ".pui__V8F9nN"):
                            txt = t.text.strip()
                            if txt and len(txt) <= 20:
                                tag_list.append(txt)
                    except:
                        pass

                    # 중복 체크
                    dedup_key = generate_dedup_key(store_name, parsed_date, content)
                    if dedup_key in existing_keys:
                        duplicate_count += 1
                        continue

                    reviews_data.append({
                        "매장명": store_name,
                        "작성일": parsed_date,
                        "리뷰내용": content,
                        "고객_선택_태그": ", ".join(tag_list) if tag_list else "태그 없음",
                        "감정분석": analyze_sentiment(content)
                    })

                    time.sleep(random.uniform(0.2, 0.5))

                except:
                    continue

            # 3회 이상 새 리뷰 없으면 펼쳐서 더보기 시도
            if stagnant_count >= 3:
                try:
                    more_btn = driver.find_element(By.XPATH, "//a[contains(@class,'fvwqf') and contains(text(),'더보기')]")
                    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", more_btn)
                    time.sleep(1.0)
                    driver.execute_script("arguments[0].click();", more_btn)
                    print(f"  - [펼쳐서 더보기] 클릭 (현재: {len(reviews_data)}건)")
                    time.sleep(random.uniform(3.0, 4.0))
                    stagnant_count = 0
                    prev_count = 0
                except:
                    # 더보기 버튼 없으면 종료
                    print("  - 더 이상 리뷰 없음. 수집 종료.")
                    break

            # 천천히 스크롤
            driver.execute_script("window.scrollBy(0, 400);")
            time.sleep(random.uniform(1.2, 2.0))
            scroll_attempts += 1

    except Exception as e:
        print(f"  - [{store_name}] 오류: {e}")
        return "NETWORK_ERROR"
    finally:
        try:
            driver.close()
            driver.quit()
        except:
            pass

    print(f"  - 수집 완료: {len(reviews_data)}건 (중복 스킵: {duplicate_count}건)")
    return reviews_data


# ==========================================
# 💾 9. 깃허브 동기화
# ==========================================
def push_to_github(df):
    print("\n[GitHub] 업로드 시작...")
    if not GITHUB_TOKEN:
        print("  GITHUB_TOKEN 없음")
        return
    try:
        g = Github(auth=Auth.Token(GITHUB_TOKEN))
        repo = g.get_repo(GITHUB_REPO_NAME)
        csv_content = df.to_csv(index=False, encoding='utf-8-sig')
        try:
            f = repo.get_contents(CSV_FILENAME)
            repo.update_file(f.path, "봇: 리뷰 데이터 업데이트", csv_content, f.sha)
        except:
            repo.create_file(CSV_FILENAME, "봇: 리뷰 데이터 최초 업로드", csv_content)
        print("  리뷰 CSV 완료")
        if os.path.exists(KEYWORD_RESULT_CSV):
            with open(KEYWORD_RESULT_CSV, 'r', encoding='utf-8-sig') as f:
                kw = f.read()
            try:
                kf = repo.get_contents(KEYWORD_RESULT_CSV)
                repo.update_file(kf.path, "봇: 키워드 업데이트", kw, kf.sha)
            except:
                repo.create_file(KEYWORD_RESULT_CSV, "봇: 키워드 최초 업로드", kw)
            print("  키워드 CSV 완료")
    except Exception as e:
        print(f"  GitHub 실패: {e}")


# ==========================================
# 🐟 10. 메인 실행
# ==========================================
if __name__ == "__main__":
    print("\n==========================================")
    print("달빛에구운고등어 리뷰 수집 봇 v6")
    print("실제 사용자 동작 순서 완전 반영")
    print("==========================================")

    print("\n[사전 점검] Firestore 연결 테스트...")
    try:
        from firestore_client import get_db, Collections
        db = get_db()
        db.collection(Collections.REVIEWS).limit(1).get()
        print("  Firestore 연결 정상")
    except Exception as e:
        print(f"  [오류] Firestore 연결 실패: {e}")
        sys.exit()

    print(f"  네이버 쿠키: {'확인 완료' if NAVER_NID_AUT and NAVER_NID_SES else '없음'}")

    if len(sys.argv) > 1 and sys.argv[1] == "--auto":
        choice = "1"
    else:
        print("\n1. 전체 매장 일일 수집 (최신 20건 · 증분)")
        print("2. 특정 매장 수집 (20건)")
        print("3. 특정 매장 3개월 집중 (500건)")
        print("4. 전체 매장 3개월 집중 (500건)")
        print("==========================================")
        choice = input("▶ 번호 입력: ").strip()

    # 엑셀 파일 로드 (Downloads 폴더 우선, 없으면 같은 폴더 폴백)
    STORE_EXCEL_CANDIDATES = [
        os.getenv("STORE_EXCEL_PATH", ""),
        r"C:\Users\yjjo\Downloads\6_리뷰 크롤러 이동_260327\가맹점_리뷰링크.xlsx",
        os.path.join(BASE_DIR, "가맹점_리뷰링크.xlsx"),
    ]
    store_df = None
    for xlsx_path in STORE_EXCEL_CANDIDATES:
        if xlsx_path and os.path.exists(xlsx_path):
            try:
                store_df = pd.read_excel(xlsx_path)
                print(f"  엑셀 로드: {xlsx_path}")
                break
            except Exception as e:
                print(f"  [엑셀 실패] {xlsx_path}: {e}")
    if store_df is None:
        print("[엑셀 없음] 가맹점_리뷰링크.xlsx를 다음 위치 중 하나에 놓아주세요:\n  1. " + r"C:\Users\yjjo\Downloads\6_리뷰 크롤러 이동_260327" + "\n  2. " + BASE_DIR)
        exit()

    url_col = '리뷰링크'
    for fallback in ['리뷰링크', '링크', 'URL', 'url', '네이버링크', '주소']:
        if fallback in store_df.columns:
            url_col = fallback
            break

    target_stores = []
    crawl_mode = "normal"
    use_resume = False

    if choice == "1":
        target_stores = store_df.to_dict('records')
        use_resume = True
        print(f"\n전체 {len(target_stores)}개 매장 수집 시작")
    elif choice == "2":
        kw = input("\n▶ 매장명 입력: ").strip()
        matched = store_df[store_df['매장명'].str.contains(kw, na=False)]
        if matched.empty:
            print(f"'{kw}' 매장 없음")
            exit()
        target_stores = matched.to_dict('records')
        print(f"대상: {[s['매장명'] for s in target_stores]}")
    elif choice == "3":
        crawl_mode = "intensive"
        kw = input("\n▶ 매장명 입력: ").strip()
        matched = store_df[store_df['매장명'].str.contains(kw, na=False)]
        if matched.empty:
            print(f"'{kw}' 매장 없음")
            exit()
        target_stores = matched.to_dict('records')
        print(f"대상: {[s['매장명'] for s in target_stores]}")
    elif choice == "4":
        target_stores = store_df.to_dict('records')
        crawl_mode = "intensive"
        use_resume = True
        print(f"\n전체 {len(target_stores)}개 매장 3개월 집중 수집 시작")
    else:
        print("잘못된 번호")
        exit()

    # 오늘 완료된 매장 로드
    completed_today = set()
    today_str = datetime.now().strftime('%Y-%m-%d')
    if use_resume and os.path.exists(SUCCESS_LOG_FILENAME):
        with open(SUCCESS_LOG_FILENAME, 'r', encoding='utf-8') as f:
            for line in f:
                if line.startswith(today_str):
                    completed_today.add(line.split('|')[1].strip())

    # 기존 데이터 로드
    existing_keys = set()
    old_df = None
    if os.path.exists(CSV_FILENAME):
        old_df = pd.read_csv(CSV_FILENAME)
        if '고객_선택_태그' not in old_df.columns:
            old_df['고객_선택_태그'] = "태그 없음"
        old_df.drop_duplicates(subset=['매장명', '리뷰내용'], keep='first', inplace=True)
        for _, row in old_df.iterrows():
            existing_keys.add(generate_dedup_key(
                str(row['매장명']), str(row.get('작성일', '')), str(row['리뷰내용'])))
    else:
        old_df = pd.DataFrame(columns=["매장명", "작성일", "리뷰내용", "고객_선택_태그", "감정분석"])

    total_new = 0

    for row in target_stores:
        store_name = row['매장명']
        url = row[url_col]
        if pd.isna(url):
            continue
        if use_resume and store_name in completed_today:
            print(f"\n[이어달리기] '{store_name}' 오늘 완료. 건너뜁니다.")
            continue

        retry_count = 0
        store_reviews = []
        # 증분 수집을 위한 해당 매장의 기존 최신 날짜 계산
        last_date = None
        if crawl_mode == "normal" and old_df is not None and not old_df.empty:
            store_existing = old_df[old_df['매장명'] == store_name]
            if not store_existing.empty:
                last_date = store_existing['작성일'].max()
                print(f"  - 기존 최신 날짜: {last_date}")
        while retry_count < 3:
            store_reviews = crawl_naver_reviews(url, store_name, existing_keys, mode=crawl_mode, last_date=last_date)
            if store_reviews == "NETWORK_ERROR":
                retry_count += 1
                print(f"  30초 대기 후 재시도 ({retry_count}/3)")
                time.sleep(30)
            else:
                break

        if retry_count == 3:
            print(f"  [{store_name}] 3회 실패. 건너뜁니다.")
            continue

        if store_reviews and isinstance(store_reviews, list):
            new_df = pd.DataFrame(store_reviews)
            old_df = pd.concat([old_df, new_df], ignore_index=True)
            old_df.drop_duplicates(subset=['매장명', '리뷰내용'], keep='first', inplace=True)
            old_df.to_csv(CSV_FILENAME, index=False, encoding='utf-8-sig')
            total_new += len(store_reviews)
            print(f"  -> CSV 저장: '{store_name}' (누적: {total_new}건)")
            save_reviews_to_firestore(new_df)
            for _, r in new_df.iterrows():
                existing_keys.add(generate_dedup_key(str(r['매장명']), str(r['작성일']), str(r['리뷰내용'])))

        wait_sec = random.uniform(15, 30)
        print(f"  - 다음 매장까지 {wait_sec:.0f}초 대기...")
        time.sleep(wait_sec)

        with open(SUCCESS_LOG_FILENAME, 'a', encoding='utf-8') as f:
            f.write(f"{today_str}|{store_name}\n")

    if total_new > 0:
        print(f"\n수집 완료! 신규: {total_new}건 / 누적: {len(old_df)}건")
        analyze_and_save_keywords(old_df)
        push_to_github(old_df)
        print("모든 작업 완료!")
    else:
        print("\n새 리뷰 0건.")
        if not os.path.exists(KEYWORD_RESULT_CSV) and old_df is not None and not old_df.empty:
            analyze_and_save_keywords(old_df)