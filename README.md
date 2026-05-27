# 🎸 AI Guitar Tab Generator (v2.0)

AI 오디오 분리 기술(Demucs)을 활용하여 음악 파일에서 악기별 소리를 추출하고, 이를 분석하여 기타 및 베이스 TAB 악보로 자동 변환해 주는 데스크톱 애플리케이션입니다.

## ✨ 주요 기능

* 🎛️ **AI 6-Stem 오디오 분리**: 최첨단 AI 모델(Demucs)을 통해 하나의 오디오 파일을 **보컬, 기타, 베이스, 피아노, 드럼, 기타 악기** 총 6개의 트랙으로 분리합니다.
* 🎚️ **스템 믹서 (Stem Mixer)**: 분리된 트랙을 개별적으로 미리 들어보고 원하는 악기 파트만 선택할 수 있습니다.
* 📑 **다중 악보 생성**: 선택한 파트별로 분석이 진행되며, [기타], [베이스], [보컬 멜로디], [피아노→기타 변환] 탭으로 나누어 악보를 제공합니다.
* 🎼 **가상 플레이어 및 지판 시각화**: 생성된 악보를 내장된 미디 신디사이저로 즉시 재생하고, 가상 지판(Fretboard) 애니메이션을 통해 운지법을 시각적으로 확인할 수 있습니다.
* 💾 **다운로드 및 복사**: 생성된 텍스트 기반의 TAB 악보를 클립보드에 복사하거나 `.txt` 파일로 다운로드할 수 있습니다.

---

## 🛠 시스템 요구 사항 (Prerequisites)

이 앱은 프론트엔드(Electron)와 AI 백엔드(Python)로 구성되어 있습니다. 실행을 위해 아래의 도구들이 컴퓨터에 설치되어 있어야 합니다.

1. **Node.js** (v14 이상) - [다운로드](https://nodejs.org/)
2. **Python 3.10 이상** - [다운로드](https://www.python.org/)
3. **FFmpeg** (오디오 처리용)
   * Mac: `brew install ffmpeg`
   * Windows: [FFmpeg 다운로드](https://ffmpeg.org/download.html) 후 환경변수 등록

---

## 🚀 설치 및 실행 방법 (Installation & Usage)

### 1. 저장소 클론 및 폴더 이동
```bash
git clone https://github.com/BeI0211/guitar-tab-generator.git
cd guitar-tab-generator
```

### 2. Node.js 패키지 설치
```bash
npm install
```

### 3. Python 가상 환경 설정 및 백엔드 패키지 설치
이 앱은 내장된 `server.py`를 통해 AI 서버를 구동합니다. 독립된 Python 환경을 구축해야 합니다.

**Mac / Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn demucs soundfile numpy python-multipart torch
```

**Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\activate
pip install fastapi uvicorn demucs soundfile numpy python-multipart torch
```

### 4. 앱 실행
설치가 모두 끝났다면 아래 명령어로 애플리케이션을 실행합니다. 
*(앱이 켜지면서 자동으로 내부의 Python 백엔드 서버도 함께 실행됩니다.)*

```bash
npm start
```

---

## 💡 사용 방법

1. 앱이 실행되면 화면 중앙에 분석할 오디오 파일(`.mp3`, `.wav` 등)을 드래그 앤 드롭하거나 클릭하여 업로드합니다.
2. 하단의 **[🎸 악보 생성하기]** 버튼을 클릭합니다.
3. 최초 실행 시 AI 모델(~50MB)을 다운로드하며, 이후 음원 분리에 약 1~3분이 소요됩니다.
4. **스템 믹서** 화면이 나타나면 원하는 트랙(예: 기타, 베이스)을 켜고(ON) 생성 버튼을 누릅니다.
5. 탭을 전환해가며 각 악기별 악보를 확인하고 **[▶ 연주 시작]** 버튼을 눌러 소리와 운지법을 확인하세요!

---

## 💻 기술 스택 (Tech Stack)
* **Frontend**: HTML5, Vanilla JavaScript, CSS3
* **Desktop Framework**: Electron
* **Audio Analysis**: TensorFlow.js (웹 워커 기반 병렬 피치 분석), Web Audio API
* **AI Backend**: Python, FastAPI, PyTorch, Demucs (Source Separation)
