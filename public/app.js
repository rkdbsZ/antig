/**
 * 이미지 기반 퀴즈 생성기 - 프론트엔드 스크립트 (app.js)
 * 
 * 주요 기능:
 * 1. 이미지 드래그 앤 드롭 및 파일 탐색기 업로드 제어
 * 2. Express API(/api/generate-quiz)를 통한 비동기 퀴즈 데이터 수신
 * 3. 로딩 애니메이션 및 상태 표시 제어
 * 4. 4지선다 인터랙티브 퀴즈 카드 시스템 (이전/다음 네비게이션, 정오답 즉각 피드백)
 * 5. 최종 결과 대시보드 및 상세 리뷰(오답 노트) 제공
 */

// --- 1. 전역 상태 관리 변수 ---
let selectedFile = null;      // 사용자가 선택한 이미지 파일 객체
let quizzes = [];             // 서버(Gemini API)로부터 받아온 퀴즈 배열
let currentIndex = 0;         // 현재 풀고 있는 문제의 인덱스 (0부터 시작)
let userAnswers = [];         // 사용자가 선택한 정답들의 인덱스 기록 배열 (문제 순서와 매핑)
let fakeProgressInterval;     // 로딩 화면의 가짜 게이지 상승을 위한 인터벌 ID

// --- 2. DOM 엘리먼트 캐싱 ---
// 1단계: 업로드 관련
const uploadSection = document.getElementById('upload-section');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const selectBtn = document.getElementById('select-btn');
const previewContainer = document.getElementById('preview-container');
const imagePreview = document.getElementById('image-preview');
const removeBtn = document.getElementById('remove-btn');
const generateBtn = document.getElementById('generate-btn');

// 2단계: 로딩 관련
const loadingSection = document.getElementById('loading-section');
const progressFill = document.getElementById('progress-fill');
const step1 = document.getElementById('step-1');
const step2 = document.getElementById('step-2');
const step3 = document.getElementById('step-3');

// 3단계: 퀴즈 관련
const quizSection = document.getElementById('quiz-section');
const quizCard = document.getElementById('quiz-card');
const quizCounter = document.getElementById('quiz-counter');
const quizProgressBar = document.getElementById('quiz-progress-bar');
const questionNumber = document.getElementById('question-number');
const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const explanationBox = document.getElementById('explanation-box');
const explanationText = document.getElementById('explanation-text');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');

// 4단계: 결과 관련
const resultSection = document.getElementById('result-section');
const finalScoreEl = document.getElementById('final-score');
const totalQuestionsStat = document.getElementById('total-questions-stat');
const correctAnswersStat = document.getElementById('correct-answers-stat');
const wrongAnswersStat = document.getElementById('wrong-answers-stat');
const reviewList = document.getElementById('review-list');
const retryBtn = document.getElementById('retry-btn');
const newQuizBtn = document.getElementById('new-quiz-btn');


// --- 3. 이벤트 리스너 등록 ---

// 파일 선택 버튼 클릭 시 숨겨진 input 엘리먼트 클릭 트리거
selectBtn.addEventListener('click', () => fileInput.click());

// 파일 input 변경 시 파일 업로드 처리
fileInput.addEventListener('change', handleFileSelect);

// 드래그 앤 드롭 이벤트 처리 (시각적 스타일 전환 포함)
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    handleFile(e.dataTransfer.files[0]);
  }
});

// 이미지 삭제 버튼 클릭 시 업로드 상태 리셋
removeBtn.addEventListener('click', resetUploadState);

// 퀴즈 생성 시작 버튼 클릭
generateBtn.addEventListener('click', generateQuiz);

// 퀴즈 네비게이션 버튼
prevBtn.addEventListener('click', () => navigateQuiz(-1));
nextBtn.addEventListener('click', () => navigateQuiz(1));

// 결과 화면 리셋 버튼
retryBtn.addEventListener('click', startQuizAgain);
newQuizBtn.addEventListener('click', startNewImageQuiz);


// --- 4. 파일 처리 및 미리보기 기능 ---

/**
 * 파일 Input 요소를 통해 선택되었을 때 실행되는 핸들러
 */
function handleFileSelect(e) {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
}

/**
 * 선택되거나 드롭된 파일 객체를 분석하여 미리보기를 활성화하는 함수
 * @param {File} file 
 */
function handleFile(file) {
  // 이미지 파일 형식 검증
  if (!file.type.startsWith('image/')) {
    alert('이미지 파일(PNG, JPG, WebP 등)만 업로드할 수 있습니다.');
    return;
  }

  // 용량 제한 검증 (10MB)
  if (file.size > 10 * 1024 * 1024) {
    alert('파일 크기가 너무 큽니다. 10MB 이하의 이미지를 선택해 주세요.');
    return;
  }

  selectedFile = file;

  // FileReader를 사용해 파일을 Base64 DataURL로 변환하여 미리보기를 구현합니다.
  const reader = new FileReader();
  reader.onload = function(e) {
    imagePreview.src = e.target.result;
    dropZone.classList.add('d-none');
    previewContainer.classList.remove('d-none');
  };
  reader.readAsDataURL(file);
}

/**
 * 이미지 선택을 취소하고 드래그 앤 드롭 영역으로 복귀시키는 함수
 */
function resetUploadState() {
  selectedFile = null;
  fileInput.value = '';
  imagePreview.src = '';
  dropZone.classList.remove('d-none');
  previewContainer.classList.add('d-none');
}


// --- 5. 백엔드 API 연동 및 로딩 스피너 제어 ---

/**
 * 백엔드 서버에 이미지 분석 및 퀴즈 생성을 요청하는 비동기 함수
 */
async function generateQuiz() {
  if (!selectedFile) return;

  // 1. 화면 전환: 업로드 섹션 숨김 -> 로딩 섹션 노출
  uploadSection.classList.add('d-none');
  loadingSection.classList.remove('d-none');

  // 2. 가짜 프로그레스 바 실행 (API 요청은 네트워크 상황에 따라 달라지므로, 시각적 피드백 제공)
  startFakeProgressBar();

  // 3. API 요청을 위한 FormData 생성
  const formData = new FormData();
  formData.append('image', selectedFile);

  try {
    const response = await fetch('/api/generate-quiz', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '퀴즈 생성 요청이 실패하였습니다.');
    }

    // 퀴즈 데이터 유효성 검증
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('AI가 유효한 퀴즈 데이터를 생성하지 못했습니다. 다시 시도해 주세요.');
    }

    // 4. 로딩 완료 처리
    finishFakeProgressBar(() => {
      // 퀴즈 데이터 저장 및 퀴즈 풀이 시작
      quizzes = data;
      currentIndex = 0;
      userAnswers = new Array(quizzes.length).fill(null); // 문제 크기만큼 답변 배열 초기화
      
      loadingSection.classList.add('d-none');
      quizSection.classList.remove('d-none');
      renderQuiz(currentIndex);
    });

  } catch (error) {
    console.error(error);
    clearInterval(fakeProgressInterval);
    alert(error.message);
    
    // 에러 발생 시 업로드 화면으로 복귀
    loadingSection.classList.add('d-none');
    uploadSection.classList.remove('d-none');
  }
}

/**
 * 사용자의 지루함을 덜기 위한 로딩바 시각적 진척도 시뮬레이션
 */
function startFakeProgressBar() {
  let progress = 10;
  progressFill.style.width = `${progress}%`;
  
  // 로딩 단계 텍스트 초기화
  step1.className = 'status-step active';
  step2.className = 'status-step';
  step3.className = 'status-step';

  fakeProgressInterval = setInterval(() => {
    if (progress < 90) {
      progress += Math.floor(Math.random() * 5) + 2; // 불규칙하게 눈금 상승
      progressFill.style.width = `${progress}%`;

      // 게이지에 따른 단계 상태 표시 변경
      if (progress > 35 && progress <= 70) {
        step1.className = 'status-step completed';
        step2.className = 'status-step active';
      } else if (progress > 70) {
        step2.className = 'status-step completed';
        step3.className = 'status-step active';
      }
    }
  }, 400);
}

/**
 * API 요청이 완전히 끝났을 때 게이지를 100% 채우고 콜백을 호출
 */
function finishFakeProgressBar(callback) {
  clearInterval(fakeProgressInterval);
  progressFill.style.width = '100%';
  step1.className = 'status-step completed';
  step2.className = 'status-step completed';
  step3.className = 'status-step completed';
  
  // 100%가 다 찼다는 시각적 만족감을 주기 위해 0.6초 뒤에 다음 화면으로 전환
  setTimeout(callback, 600);
}


// --- 6. 인터랙티브 퀴즈 풀이 렌더링 로직 ---

/**
 * 인덱스에 해당하는 퀴즈 카드를 화면에 표시하고 선택지 및 상태 복구
 * @param {number} index - 현재 문제 번호 인덱스
 */
function renderQuiz(index) {
  const quiz = quizzes[index];
  const total = quizzes.length;

  // 헤더 정보 업데이트
  quizCounter.textContent = `문제 ${index + 1} / ${total}`;
  const progressPercent = ((index + 1) / total) * 100;
  quizProgressBar.style.width = `${progressPercent}%`;

  // 질문 영역 구성
  questionNumber.textContent = `Q${index + 1}.`;
  questionText.textContent = quiz.question;

  // 보기를 동적으로 렌더링
  optionsContainer.innerHTML = '';
  explanationBox.classList.add('d-none'); // 해설 박스는 일단 비활성화

  const alphabet = ['①', '②', '③', '④']; // 보기 번호 스타일링용

  quiz.options.forEach((option, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option-btn';
    
    btn.innerHTML = `
      <span class="option-index">${alphabet[idx]}</span>
      <span class="option-content">${option}</span>
    `;

    // 보기 버튼 클릭 이벤트 바인딩
    btn.addEventListener('click', () => handleOptionClick(idx));
    optionsContainer.appendChild(btn);
  });

  // 이미 이전에 풀었던 문제인 경우, 기록된 상태를 복원하여 보여줍니다.
  if (userAnswers[index] !== null) {
    restoreQuizState(index);
  } else {
    // 풀지 않은 문제인 경우 하단 네비게이션 버튼 초기화
    prevBtn.disabled = index === 0; // 첫 문제면 이전버튼 불가
    nextBtn.disabled = true;       // 답을 골라야 다음버튼 활성화
    nextBtn.innerHTML = index === total - 1 ? '결과 보기 <i class="fa-solid fa-square-poll-vertical"></i>' : '다음 문제 <i class="fa-solid fa-arrow-right"></i>';
  }
}

/**
 * 사용자가 특정 보기를 선택했을 때 실행되는 핸들러 (채점 및 해설 노출)
 * @param {number} selectedIdx - 클릭된 보기 인덱스 (0~3)
 */
function handleOptionClick(selectedIdx) {
  const quiz = quizzes[currentIndex];
  const correctIdx = quiz.answerIndex;
  
  // 현재 문제의 사용자 답변 기록
  userAnswers[currentIndex] = selectedIdx;

  const optionButtons = optionsContainer.querySelectorAll('.option-btn');

  // 즉각적인 시각적 피드백 제공 (정답/오답)
  optionButtons.forEach((btn, idx) => {
    btn.classList.add('disabled'); // 다중 클릭 방지를 위해 전체 비활성화
    
    if (idx === selectedIdx) {
      if (selectedIdx === correctIdx) {
        // 맞혔을 때: 초록색 하이라이트
        btn.classList.add('selected-correct');
      } else {
        // 틀렸을 때: 빨간색 하이라이트
        btn.classList.add('selected-wrong');
      }
    }

    // 틀렸든 맞혔든 실제 정답 보기에는 초록색 테두리 하이라이트를 주어 위치를 알림
    if (idx === correctIdx) {
      btn.classList.add('reveal-correct');
    }
  });

  // 상세 해설 박스 노출
  explanationText.textContent = quiz.explanation;
  explanationBox.classList.remove('d-none');

  // 이전/다음 버튼 제어
  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = false; // 정답을 체크했으므로 다음으로 진행 허용
}

/**
 * 사용자가 이미 풀었던 문제를 뒤돌아봤을 때, 당시 풀이 결과를 그대로 재현하는 함수
 */
function restoreQuizState(index) {
  const quiz = quizzes[index];
  const savedAnswer = userAnswers[index];
  const correctIdx = quiz.answerIndex;
  const optionButtons = optionsContainer.querySelectorAll('.option-btn');

  optionButtons.forEach((btn, idx) => {
    btn.classList.add('disabled');
    
    if (idx === savedAnswer) {
      if (savedAnswer === correctIdx) {
        btn.classList.add('selected-correct');
      } else {
        btn.classList.add('selected-wrong');
      }
    }

    if (idx === correctIdx) {
      btn.classList.add('reveal-correct');
    }
  });

  // 저장된 해설 및 퀴즈 액션 활성화
  explanationText.textContent = quiz.explanation;
  explanationBox.classList.remove('d-none');

  prevBtn.disabled = index === 0;
  nextBtn.disabled = false;
  nextBtn.innerHTML = index === quizzes.length - 1 ? '결과 보기 <i class="fa-solid fa-square-poll-vertical"></i>' : '다음 문제 <i class="fa-solid fa-arrow-right"></i>';
}

/**
 * 이전/다음 네비게이션 이동 함수
 * @param {number} direction - -1 (이전) 또는 1 (다음)
 */
function navigateQuiz(direction) {
  // 다음 문제 버튼 클릭 시, 마지막 문제였다면 결과 리포트 출력
  if (direction === 1 && currentIndex === quizzes.length - 1) {
    showResults();
    return;
  }

  // 인덱스 범위 체크 후 카드 업데이트
  const targetIndex = currentIndex + direction;
  if (targetIndex >= 0 && targetIndex < quizzes.length) {
    // 카드 슬라이딩 애니메이션 효과를 위해 애니메이션 클래스를 껐다 켭니다.
    quizCard.classList.remove('fade-in');
    void quizCard.offsetWidth; // 브라우저가 레이아웃을 다시 계산하도록 강제 (리플로우)
    quizCard.classList.add('fade-in');

    currentIndex = targetIndex;
    renderQuiz(currentIndex);
  }
}


// --- 7. 결과 대시보드 및 상세 분석 (오답 노트) ---

/**
 * 모든 문제를 푼 후 점수판과 상세한 오답 노트를 출력하는 함수
 */
function showResults() {
  quizSection.classList.add('d-none');
  resultSection.classList.remove('d-none');

  // 1. 점수 계산
  let correctCount = 0;
  quizzes.forEach((quiz, idx) => {
    if (userAnswers[idx] === quiz.answerIndex) {
      correctCount++;
    }
  });

  const totalCount = quizzes.length;
  const score = Math.round((correctCount / totalCount) * 100);

  // 2. 성적표 렌더링
  finalScoreEl.textContent = score;
  totalQuestionsStat.textContent = `${totalCount}개`;
  correctAnswersStat.textContent = `${correctCount}개`;
  wrongAnswersStat.textContent = `${totalCount - correctCount}개`;

  // 3. 상세 리뷰 리스트 작성 (전체 문항 분석 및 오답 노트)
  reviewList.innerHTML = '';
  const alphabet = ['①', '②', '③', '④'];

  quizzes.forEach((quiz, idx) => {
    const isCorrect = userAnswers[idx] === quiz.answerIndex;
    const userAnswerText = quiz.options[userAnswers[idx]];
    const correctAnswerText = quiz.options[quiz.answerIndex];

    const reviewItem = document.createElement('div');
    reviewItem.className = 'review-item';

    reviewItem.innerHTML = `
      <div class="review-item-header">
        <h4 class="review-question">Q${idx + 1}. ${quiz.question}</h4>
        <span class="result-badge ${isCorrect ? 'correct' : 'wrong'}">
          ${isCorrect ? '<i class="fa-solid fa-check"></i> 정답' : '<i class="fa-solid fa-xmark"></i> 오답'}
        </span>
      </div>
      <div class="review-user-answer">
        ${isCorrect 
          ? `선택한 답: <span class="text-success">${alphabet[userAnswers[idx]]} ${userAnswerText}</span>`
          : `선택한 답: <span class="text-danger">${alphabet[userAnswers[idx]]} ${userAnswerText}</span> / 정답: <span class="text-success">${alphabet[quiz.answerIndex]} ${correctAnswerText}</span>`
        }
      </div>
      <div class="review-explanation">
        <strong>💡 해설:</strong> ${quiz.explanation}
      </div>
    `;

    reviewList.appendChild(reviewItem);
  });
}


// --- 8. 재시작 및 상태 관리 초기화 ---

/**
 * 현재 받아온 문제 세트를 가지고 1번 문제부터 다시 푸는 함수 (API 호출 불필요)
 */
function startQuizAgain() {
  currentIndex = 0;
  userAnswers = new Array(quizzes.length).fill(null);
  resultSection.classList.add('d-none');
  quizSection.classList.remove('d-none');
  renderQuiz(currentIndex);
}

/**
 * 처음 업로드 화면으로 완전히 초기화하여 다른 이미지를 분석하는 함수
 */
function startNewImageQuiz() {
  quizzes = [];
  currentIndex = 0;
  userAnswers = [];
  resetUploadState();
  resultSection.classList.add('d-none');
  uploadSection.classList.remove('d-none');
}
