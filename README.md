# Video Processor Eagle Plugin

동영상에서 컷 변화를 자동으로 감지하여 개별 클립과 대표 프레임을 추출하는 Eagle 플러그인입니다.

## 🚀 주요 기능

- **자동 컷 감지**: FFmpeg의 씬 감지 알고리즘을 활용한 정확한 컷 변화 감지
- **프레임 추출**: 각 컷의 중간 지점 프레임을 이미지로 추출
- **클립 추출**: 감지된 컷을 개별 동영상 클립으로 분리
- **배치 처리**: 여러 비디오 파일 동시 처리 지원
- **Eagle 통합**: 추출된 파일 자동 임포트 (Watch Folder 기능 활용)

## 📋 시스템 요구사항

- Eagle 4.0 이상
- macOS 또는 Windows
- FFmpeg (Eagle 플러그인에서 자동 설치)

## 🛠️ 설치 방법

1. 플러그인 폴더를 Eagle의 플러그인 디렉토리에 복사
   - macOS: `~/Library/Application Support/Eagle/plugins/`
   - Windows: `%APPDATA%/Eagle/plugins/`

2. Eagle 재시작

3. 플러그인 메뉴에서 "Video Processor for Eagle" 실행

## 📖 사용 방법

### 기본 사용법

1. Eagle에서 처리할 비디오 파일 선택
2. 플러그인 실행
3. 설정 조정 (선택사항)
4. 처리 방식 선택:
   - 🖼️ **이미지 추출**: 프레임만 추출
   - 🎬 **클립 추출**: 동영상 클립만 추출
   - 📋 **모든 처리**: 프레임과 클립 모두 추출

### 설정 옵션

- **컷 변화 민감도** (0.1 ~ 0.7): 낮을수록 더 많은 컷 감지
- **이미지 포맷**: JPG 또는 PNG
- **출력 품질** (1-10): 높을수록 고품질
- **In/Out 핸들**: 컷 시작/끝 프레임 조정
- **추출 방식**: 
  - 고속 병렬: 최대 12개 동시 처리 (빠름)
  - 안정 병렬: 4개 동시 처리 (안정적)

### 단축키

- `Cmd/Ctrl + Shift + V`: 빠른 클립 추출
- `Cmd/Ctrl + Shift + F`: 빠른 프레임 추출

## 📁 파일 구조

```
video-processor-eagle-plugin/
├── manifest.json          # 플러그인 메타데이터
├── src/
│   ├── main.html         # UI 레이아웃
│   ├── main.js           # 메인 컨트롤러
│   ├── styles.css        # 스타일시트
│   ├── modules/
│   │   ├── video-analyzer.js     # 컷 감지 엔진
│   │   ├── frame-extractor.js    # 프레임 추출기
│   │   ├── clip-extractor.js     # 클립 추출기
│   │   ├── eagle-importer.js     # Eagle 임포트
│   │   └── common/
│   │       ├── eagle-utils.js    # Eagle API 유틸리티
│   │       └── config-manager.js # 설정 관리
│   └── integration/
│       ├── context-menu.js       # 컨텍스트 메뉴
│       └── alternative-integration.js # 대체 통합
└── assets/
    └── temp/             # 임시 파일 저장소
```

## 🔧 출력 설정

### 기본 출력 경로
- 클립: `/Users/ysk/assets/temp/clips/`
- 프레임: `/Users/ysk/assets/temp/frame/`

### 파일명 규칙
- 클립: `{원본파일명}_clip_{번호}.mp4`
- 프레임: `{원본파일명}_frame_{번호}.{확장자}`

## ⚡ 성능 최적화

- **Phase 2 최적화**: 10개 이상의 컷 처리 시 자동으로 고속 병렬 처리 활성화
- **CPU 멀티코어 활용**: 시스템 코어 수에 따라 동시 처리 수 자동 조정
- **스트림 복사 우선**: 가능한 경우 재인코딩 없이 빠른 처리

## 🐛 문제 해결

### FFmpeg 오류
- 플러그인이 자동으로 FFmpeg를 설치합니다
- 수동 설치가 필요한 경우 Eagle의 개발자 도구 콘솔 확인

### 처리 실패
- 지원하지 않는 코덱: H.264/H.265 권장
- 손상된 파일: 다른 플레이어에서 재생 확인
- 메모리 부족: 배치 크기 줄이기

## 📝 개발자 정보

- **개발자**: 슷터드 (greatminds)
- **버전**: 1.3.0
- **라이선스**: MIT
- **GitHub**: [video-processor-eagle-plugin](https://github.com/greatminds/video-processor-eagle-plugin)

## 🔄 업데이트 내역

### v1.3.0 (2025.01)
- 코드 리팩토링 및 구조 개선
- 모듈 분리 및 최적화
- 불필요한 디버그 코드 제거
- 성능 및 안정성 향상

### v1.2.0
- Phase 2 고속 병렬 처리 추가
- 프레임 단위 정확도 개선
- 캐시 관리 기능 추가

### v1.1.0
- 배치 처리 기능 추가
- In/Out 핸들 설정 추가
- UI/UX 개선

### v1.0.0
- 초기 릴리즈