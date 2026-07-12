/**
 * 이미지 기반 퀴즈 생성기 - 백엔드 Express 서버 (server.js)
 * 
 * 이 서버는 다음과 같은 역할을 합니다:
 * 1. public 폴더의 HTML, CSS, JS 정적 파일 서빙
 * 2. 프론트엔드에서 전송한 이미지 파일을 Multer 미들웨어로 수신 (메모리 보관)
 * 3. 수신한 이미지를 Google Gemini API에 전달하여 퀴즈 데이터 생성 요청
 * 4. 생성된 퀴즈 JSON 데이터를 프론트엔드에 응답
 */

const express = require('express');
const multer = require('multer');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

// .env 파일의 환경 변수를 프로세스에 로드합니다.
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Multer 설정: 업로드된 파일을 디스크에 저장하지 않고 메모리(Buffer)에 임시로 올려서 처리합니다.
// 이 방식은 임시 파일이 서버 디스크를 차지하지 않아 깔끔하고 안전합니다.
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 이미지 파일 업로드 용량 제한: 최대 50MB (기존 10MB에서 상향)
  }
});

// public 폴더 내의 정적 파일(HTML, CSS, JS)을 루트 경로('/')에서 접근 가능하도록 서빙합니다.
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

/**
 * Gemini API에 이미지 데이터를 보낼 때 호환되는 포맷으로 변환하는 헬퍼 함수
 * @param {Buffer} buffer - 파일 바이너리 버퍼
 * @param {string} mimeType - 파일의 MIME 타입 (예: image/png, image/jpeg)
 * @returns {object} Gemini API가 인식할 수 있는 인라인 데이터 객체
 */
function fileToGenerativePart(buffer, mimeType) {
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType: mimeType
    },
  };
}

// 퀴즈 생성 API 엔드포인트
app.post('/api/generate-quiz', upload.single('image'), async (req, res) => {
  try {
    // 1. API 키 설정 여부 검증
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY_HERE') {
      return res.status(500).json({ 
        error: '서버의 Gemini API Key가 설정되지 않았습니다. .env 파일을 확인해 주세요.' 
      });
    }

    // 2. 업로드된 파일이 있는지 확인
    if (!req.file) {
      return res.status(400).json({ error: '업로드된 이미지 파일이 없습니다.' });
    }

    // 3. Gemini SDK 인스턴스 초기화
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // 멀티모달 분석을 지원하며 속도가 빠른 'gemini-1.5-flash' 모델을 사용합니다.
    // generationConfig를 통해 API의 응답 형식을 JSON으로 고정합니다. (구조화된 데이터 추출에 매우 유리)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json'
      }
    });

    // 4. 업로드된 이미지를 Gemini 포맷으로 변환
    const imagePart = fileToGenerativePart(req.file.buffer, req.file.mimetype);

    // 5. 문제를 생성하기 위한 구체적인 프롬프트 작성
    // 교육적인 문제를 출제하도록 제약 사항과 출력 스키마 형식을 세부적으로 지정합니다.
    const prompt = `
이 이미지의 텍스트와 시각 정보(그림, 표, 그래프 등)를 분석하고, 이를 바탕으로 학생들의 이해도를 측정할 수 있는 퀴즈를 생성해줘.

[퀴즈 출제 조건]:
1. 문제 개수는 이미지에 포함된 정보의 풍부함에 따라 최소 5개에서 최대 10개 사이로 자동 조정하여 출제해줘.
2. 모든 문제는 4지 선다형(객관식)으로 구성해줘.
3. 문제의 주제는 이미지 내용에만 충실해야 하며, 가상의 정보를 추가하지 마라.
4. 각 문제마다 학생의 학습에 도움을 줄 수 있는 아주 상세하고 친절한 한국어 해설(explanation)을 포함해줘.
5. 질문, 보기, 해설은 모두 한국어로 구성해줘.

[출력 JSON 스키마]:
반드시 아래의 구조를 가지는 JSON 배열 형식으로만 응답해야 해:
[
  {
    "question": "질문 내용 (예: 이미지에 나타난 A의 올바른 특징은 무엇인가요?)",
    "options": [
      "선택지 1",
      "선택지 2",
      "선택지 3",
      "선택지 4"
    ],
    "answerIndex": 0, // 0~3 사이의 정수 (정답인 options 배열의 인덱스)
    "explanation": "이 문제의 정답이 O번인 이유와 함께 이미지에서 알 수 있는 관련 정보를 상세히 서술하는 한국어 해설"
  }
]
`;

    // 6. Gemini 모델 호출 (텍스트 프롬프트와 이미지 바이너리를 동시 전달)
    const result = await model.generateContent([prompt, imagePart]);
    const responseText = result.response.text();

    // 7. 받은 텍스트 응답을 JSON으로 파싱하여 프론트엔드에 전달
    let quizData;
    try {
      quizData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Gemini 응답 JSON 파싱 실패:', responseText);
      return res.status(500).json({ 
        error: 'AI가 생성한 데이터 형식이 올바르지 않습니다. 다시 시도해 주세요.' 
      });
    }

    res.json(quizData);

  } catch (error) {
    console.error('퀴즈 생성 에러 발생:', error);
    res.status(500).json({ 
      error: '퀴즈를 생성하는 중에 오류가 발생했습니다: ' + error.message 
    });
  }
});

// 로컬 환경이거나 Vercel 환경이 아닐 경우에만 서버를 구동(listen)합니다.
// Vercel 배포 상태에서는 Vercel의 서버리스 런타임이 export된 app 인스턴스를 직접 실행합니다.
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(` 이미지 기반 퀴즈 생성기 서버가 작동을 시작했습니다.`);
    console.log(` 주소: http://localhost:${PORT}`);
    console.log(`==================================================`);
  });
}

// Vercel 배포를 위해 Express 애플리케이션 객체를 외부로 내보냅니다.
module.exports = app;
