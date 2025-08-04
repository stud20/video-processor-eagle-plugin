// ===========================
// 워치독(Watchdog) 시스템
// ===========================

/**
 * 워치독 시스템 - 무응답 상태 감지 및 자동 초기화
 * 
 * NOTE: 이 클래스는 core/watchdog.js로 이동되었습니다.
 * 리팩토링된 시스템을 사용하세요.
 */

// DEPRECATED - 리팩토링된 모듈 사용 (core/watchdog.js)
// 전체 워치독 클래스가 core/watchdog.js로 이동됨

// 전역 워치독 인스턴스 (Legacy)
let pluginWatchdog = null;

// 전체 PluginWatchdog 클래스 정의를 제거했습니다.
// 새로운 모듈 시스템을 사용하세요: core/watchdog.js

// 기존 코드 호환성을 위해 pluginWatchdog 변수만 유지합니다.

// ===========================
// 스마트 프레임 선별 기능
// ===========================

/**
 * 스마트 프레임 선별 수행
 * @param {Object} videoFile - 비디오 파일 정보
 * @param {Array} framePaths - 추출된 프레임 경로 배열
 * @param {Object} settings - 설정
 */
async function performSmartFrameSelection(videoFile, framePaths, settings) {
    try {
        if (!window.SmartFrameSelector) {
            console.warn('스마트 프레임 선별 모듈이 로드되지 않았습니다.');
            return;
        }

        console.log(`🎯 스마트 프레임 선별 시작: ${framePaths.length}개 → ${settings.targetFrameCount}개`);
        
        const selector = new SmartFrameSelector({
            targetCount: settings.targetFrameCount,
            similarityThreshold: 0.85,
            enableHistogramAnalysis: true,
            enableColorAnalysis: true,
            enableTextureAnalysis: true
        });

        // 스마트 선별 수행
        const selectionResult = await selector.selectBestFrames(
            framePaths,
            { targetCount: settings.targetFrameCount },
            (progress, message) => {
                showProgress(0.7 + progress * 0.2, message || '스마트 프레임 선별 중...');
            }
        );

        if (selectionResult.success && selectionResult.selectedFrames.length > 0) {
            // 선별된 프레임들을 별도 폴더에 복사
            const smartOutputDir = await createSmartSelectionOutputDir(videoFile.name);
            const copiedFrames = await selector.copySelectedFrames(
                selectionResult.selectedFrames,
                smartOutputDir
            );

            // 선별 결과 HTML 생성
            const summaryHTML = selector.generateSelectionSummaryHTML(
                selectionResult.selectedFrames,
                selectionResult.metadata
            );

            // HTML 파일 저장
            const htmlPath = await saveSelectionSummary(videoFile.name, summaryHTML);

            // Eagle에 선별된 프레임들 임포트
            if (window.EagleImporter && copiedFrames.length > 0) {
                await importSmartSelectedFrames(videoFile.name, copiedFrames);
            }

            console.log(`✅ 스마트 그룹화 완료: ${selectionResult.selectedFrames.length}개 프레임 그룹화`);
            showNotification(`스마트 그룹화 완료: ${selectionResult.selectedFrames.length}개 대표 프레임 선별`, 'success');

        } else {
            console.warn('스마트 선별 결과가 비어있습니다.');
        }

    } catch (error) {
        console.error('스마트 프레임 선별 실패:', error);
        showNotification('스마트 프레임 선별에 실패했습니다.', 'error');
    }
}

/**
 * 스마트 선별 출력 디렉토리 생성
 * @param {string} videoName - 비디오 이름
 * @returns {Promise<string>} 출력 디렉토리 경로
 */
async function createSmartSelectionOutputDir(videoName) {
    const baseDir = await window.eagleUtils.getCacheDirectory('frames');
    const cleanVideoName = videoName.replace(/\.[^/.]+$/, ''); // 확장자 제거
    const groupedDir = window.eagleUtils.joinPath(baseDir, `${cleanVideoName}_Grouped`);
    
    await window.eagleUtils.ensureDirectory(groupedDir);
    console.log(`📁 스마트 선별 폴더 생성: ${groupedDir}`);
    return groupedDir;
}

/**
 * 선별 결과 요약 HTML 저장
 * @param {string} videoName - 비디오 이름
 * @param {string} htmlContent - HTML 내용
 * @returns {Promise<string>} 저장된 HTML 파일 경로
 */
async function saveSelectionSummary(videoName, htmlContent) {
    const fs = window.eagleUtils?.getFS();
    if (!fs) return null;

    // _Grouped 폴더 내에 HTML 요약 저장
    const baseDir = await window.eagleUtils.getCacheDirectory('frames');
    const cleanVideoName = videoName.replace(/\.[^/.]+$/, '');
    const groupedDir = window.eagleUtils.joinPath(baseDir, `${cleanVideoName}_Grouped`);
    const htmlPath = window.eagleUtils.joinPath(groupedDir, `smart_selection_summary.html`);

    try {
        fs.writeFileSync(htmlPath, htmlContent, 'utf8');
        console.log('선별 결과 요약 HTML 저장:', htmlPath);
        return htmlPath;
    } catch (error) {
        console.error('HTML 저장 실패:', error);
        return null;
    }
}

/**
 * Eagle에 스마트 선별된 프레임들 임포트
 * @param {string} videoName - 비디오 이름
 * @param {Array} copiedFrames - 복사된 프레임 정보
 */
async function importSmartSelectedFrames(videoName, copiedFrames) {
    try {
        const eagleImporter = new EagleImporter();
        const framePaths = copiedFrames.map(frame => frame.newPath);
        
        const importResult = await eagleImporter.importWithProgress(
            framePaths,
            `${videoName}_Grouped`,
            {
                createFolder: true,
                tags: ['smart-selected', 'ai-curated', 'representative-frames', 'grouped'],
                annotation: `AI 기반 스마트 선별된 대표 프레임들\n원본: ${videoName}\n선별일: ${new Date().toLocaleString('ko-KR')}\n그룹화 및 선별된 의미있는 프레임들`
            },
            (progress, message) => {
                showProgress(0.9 + progress * 0.05, message || 'Eagle 임포트 중...');
            }
        );

        if (importResult.success) {
            console.log(`📥 Eagle 임포트 완료: ${importResult.successCount}개 스마트 선별 프레임`);
        }

    } catch (error) {
        console.error('스마트 선별 프레임 Eagle 임포트 실패:', error);
    }
}

/**
 * Video Processor Eagle Plugin - 메인 모듈 (리팩토링 버전)
 * 동영상에서 컷 변화를 감지하여 이미지와 클립을 추출하는 Eagle 플러그인
 * 
 * @author 슷터드 (greatminds)
 * @version 1.3.0
 */

// ===========================
// 전역 상태 관리
// ===========================
const AppState = {
    // Eagle 통합 상태
    isEagleReady: false,
    
    // 모듈 로드 상태
    modulesLoaded: false,
    
    // 파일 선택 상태
    selectedFiles: [],
    currentVideoFile: null,
    isBatchMode: false,
    
    // 처리 상태
    isProcessing: false,
    batchCancelled: false,
    
    // 실시간 선택 감지 상태
    realtimeDetection: {
        enabled: false,
        pollingInterval: null,
        lastSelectionIds: [],
        checkInterval: 1000 // 1초
    },
    
    // UI 요소 참조
    elements: {}
};

// ===========================
// 모듈 초기화
// ===========================

/**
 * DOM 요소 초기화
 */
function initializeElements() {
    AppState.elements = {
        // 파일 선택
        selectedFile: document.getElementById('selectedFile'),
        selectFileBtn: document.getElementById('selectFileBtn'),
        batchInfo: document.getElementById('batchInfo'),
        batchCount: document.getElementById('batchCount'),
        batchList: document.getElementById('batchList'),
        
        // 설정 컨트롤
        sensitivitySlider: document.getElementById('sensitivitySlider'),
        sensitivityValue: document.getElementById('sensitivityValue'),
        formatSelect: document.getElementById('formatSelect'),
        qualitySlider: document.getElementById('qualitySlider'),
        qualityValue: document.getElementById('qualityValue'),
        inHandleSlider: document.getElementById('inHandleSlider'),
        inHandleValue: document.getElementById('inHandleValue'),
        outHandleSlider: document.getElementById('outHandleSlider'),
        outHandleValue: document.getElementById('outHandleValue'),
        extractionMethod: document.getElementById('extractionMethod'),
        duplicateHandling: document.getElementById('duplicateHandling'),
        analysisFrameNaming: document.getElementById('analysisFrameNaming'),
        
        // 스마트 프레임 선별
        smartFrameSelection: document.getElementById('smartFrameSelection'),
        smartSelectionOptions: document.getElementById('smartSelectionOptions'),
        targetFrameCount: document.getElementById('targetFrameCount'),
        targetFrameCountValue: document.getElementById('targetFrameCountValue'),
        
        // 실행 버튼
        extractFramesBtn: document.getElementById('extractFramesBtn'),
        extractClipsBtn: document.getElementById('extractClipsBtn'),
        processBtn: document.getElementById('processBtn'),
        
        // 진행 상황
        progressSection: document.getElementById('progressSection'),
        progressFill: document.getElementById('progressFill'),
        progressText: document.getElementById('progressText'),
        progressDetails: document.getElementById('progressDetails'),
        
        // 배치 진행
        batchProgress: document.getElementById('batchProgress'),
        batchProgressFill: document.getElementById('batchProgressFill'),
        batchCurrentFile: document.getElementById('batchCurrentFile'),
        batchTotalFiles: document.getElementById('batchTotalFiles'),
        batchCancelBtn: document.getElementById('batchCancelBtn'),
        
        // 결과
        resultsSection: document.getElementById('resultsSection'),
        resultSummary: document.getElementById('resultSummary'),
        batchResultsSection: document.getElementById('batchResultsSection'),
        batchResultsList: document.getElementById('batchResultsList'),
        openResultsBtn: document.getElementById('openResultsBtn'),
        
        // 캐시 관리
        clearCacheBtn: document.getElementById('clearCacheBtn'),
        checkCacheBtn: document.getElementById('checkCacheBtn'),
        cacheResult: document.getElementById('cacheResult'),
        cacheResultContent: document.getElementById('cacheResultContent')
    };
}

/**
 * 이벤트 리스너 설정
 */
function setupEventListeners() {
    const { elements } = AppState;
    
    // 파일 선택
    elements.selectFileBtn?.addEventListener('click', selectVideoFile);
    
    // 처리 버튼
    elements.extractFramesBtn?.addEventListener('click', () => processVideo('frames'));
    elements.extractClipsBtn?.addEventListener('click', () => processVideo('clips'));
    elements.processBtn?.addEventListener('click', () => processVideo('all'));
    
    // 설정 슬라이더
    elements.sensitivitySlider?.addEventListener('input', updateSensitivityValue);
    elements.qualitySlider?.addEventListener('input', updateQualityValue);
    elements.inHandleSlider?.addEventListener('input', updateInHandleValue);
    elements.outHandleSlider?.addEventListener('input', updateOutHandleValue);
    elements.targetFrameCount?.addEventListener('input', updateTargetFrameCountValue);
    
    // 스마트 선별 체크박스
    elements.smartFrameSelection?.addEventListener('change', toggleSmartSelectionOptions);
    
    // 캐시 관리
    elements.clearCacheBtn?.addEventListener('click', clearCache);
    elements.checkCacheBtn?.addEventListener('click', checkCacheStatus);
    elements.openResultsBtn?.addEventListener('click', openResultsFolder);
    
    // 배치 취소
    elements.batchCancelBtn?.addEventListener('click', cancelBatchProcessing);
}

// ===========================
// Eagle API 통합
// ===========================

/**
 * Eagle API 확인 및 초기화
 */
function checkEagleAPI() {
    // 원본 함수를 다른 이름으로도 저장 (refactored 버전과의 호환을 위해)
    window.checkEagleAPI_Original = checkEagleAPI;
    if (typeof eagle !== 'undefined') {
        AppState.isEagleReady = true;
        console.log('✅ Eagle API 사용 가능:', eagle.app?.version || 'unknown');
        
        // 실시간 선택 감지 시작
        startRealtimeDetection();
    } else {
        console.warn('⚠️ Eagle API를 사용할 수 없습니다.');
    }
}

/**
 * Eagle에서 선택된 파일 자동 감지
 */
async function autoDetectSelectedFile() {
    if (!AppState.isEagleReady || !window.eagleUtils) {
        console.log('자동 감지 스킨: Eagle API 또는 eagleUtils를 사용할 수 없음');
        return;
    }
    
    try {
        console.log('🔍 실시간 비디오 선택 감지 시도...');
        
        // Eagle에서 선택된 비디오 파일들 가져오기
        const videoFiles = await window.eagleUtils.getSelectedVideoFiles();
        
        console.log(`📹 Eagle에서 감지된 비디오 파일: ${videoFiles.length}개`);
        
        if (videoFiles.length > 0) {
            // 파일 경로가 있는 파일들만 필터링
            const validFiles = videoFiles.filter(file => file.path || file.filePath);
            const invalidFiles = videoFiles.filter(file => !file.path && !file.filePath);
            
            if (invalidFiles.length > 0) {
                console.warn(`⚠️ 파일 경로가 없는 파일 ${invalidFiles.length}개:`, 
                    invalidFiles.map(f => f.name));
            }
            
            if (validFiles.length > 0) {
                // 선택 변화 감지 및 업데이트
                const currentIds = validFiles.map(f => f.id).sort().join(',');
                const previousIds = AppState.realtimeDetection.lastSelectionIds.join(',');
                
                if (currentIds !== previousIds) {
                    console.log(`🔄 선택 변화 감지: ${AppState.selectedFiles.length} → ${validFiles.length}개`);
                    
                    // 시각적 피드백을 위한 애니메이션 효과
                    const selectedFileElement = AppState.elements.selectedFile;
                    if (selectedFileElement) {
                        selectedFileElement.style.transition = 'all 0.2s ease';
                        selectedFileElement.style.transform = 'scale(0.98)';
                        selectedFileElement.style.opacity = '0.7';
                        
                        setTimeout(() => {
                            selectedFileElement.style.transform = 'scale(1)';
                            selectedFileElement.style.opacity = '1';
                        }, 200);
                    }
                    
                    AppState.selectedFiles = validFiles;
                    AppState.currentVideoFile = validFiles[0];
                    AppState.isBatchMode = validFiles.length > 1;
                    AppState.realtimeDetection.lastSelectionIds = validFiles.map(f => f.id);
                    
                    updateUI();
                    
                    // 선택 유형에 따른 알림
                    if (validFiles.length === 1) {
                        showNotification(`✅ 실시간 감지: ${validFiles[0].name}`, 'success');
                        console.log(`🎬 단일 비디오 감지: ${validFiles[0].name}`);
                    } else {
                        showNotification(`📚 다중 선택 감지: ${validFiles.length}개 비디오 (배치 모드)`, 'info');
                        console.log(`📚 다중 비디오 감지: ${validFiles.length}개 파일`);
                    }
                    
                    // 경로 없는 파일 경고
                    if (invalidFiles.length > 0) {
                        console.warn(`⚠️ 주의: ${invalidFiles.length}개 파일의 경로를 찾을 수 없어 제외되었습니다.`);
                        showNotification(`⚠️ ${invalidFiles.length}개 파일의 경로를 찾을 수 없어 제외되었습니다`, 'warning');
                    }
                } else {
                    // 선택이 변하지 않음
                    console.log('🔄 선택 변화 없음 (동일한 선택 상태)');
                }
            } else {
                // 유효한 파일이 없음 (전부 경로 없음)
                console.warn('⚠️ 선택된 비디오 파일들의 경로를 모두 찾을 수 없음');
                if (AppState.selectedFiles.length > 0) {
                    showNotification('⚠️ 선택된 파일들의 경로를 찾을 수 없습니다', 'warning');
                    // 상태 리셋
                    AppState.selectedFiles = [];
                    AppState.currentVideoFile = null;
                    AppState.isBatchMode = false;
                    AppState.realtimeDetection.lastSelectionIds = [];
                    updateUI();
                }
            }
        } else {
            // 선택된 비디오 파일이 없음
            if (AppState.selectedFiles.length > 0) {
                console.log('🗑️ 비디오 선택 해제 감지');
                
                // 선택 해제 시각적 피드백
                const selectedFileElement = AppState.elements.selectedFile;
                if (selectedFileElement) {
                    selectedFileElement.style.transition = 'all 0.3s ease';
                    selectedFileElement.style.opacity = '0.6';
                    
                    setTimeout(() => {
                        AppState.selectedFiles = [];
                        AppState.currentVideoFile = null;
                        AppState.isBatchMode = false;
                        AppState.realtimeDetection.lastSelectionIds = [];
                        updateUI();
                        
                        selectedFileElement.style.opacity = '1';
                        selectedFileElement.style.transition = '';
                    }, 200);
                } else {
                    AppState.selectedFiles = [];
                    AppState.currentVideoFile = null;
                    AppState.isBatchMode = false;
                    AppState.realtimeDetection.lastSelectionIds = [];
                    updateUI();
                }
            } else {
                // 이미 비어있는 상태 - 업데이트 기록 없이 진행
                console.log('🔄 선택 없음 (이미 비어있는 상태)');
            }
        }
        
    } catch (error) {
        console.error('❌ 자동 파일 감지 실패:', error);
        
        // 에러 발생 시 상태 리셋을 하지 않고 기존 선택 유지
        // 대신 에러 로그만 출력하고 다음 감지 대기
        if (error.message.includes('fetch')) {
            console.warn('🔌 Eagle API 연결 문제로 보임. 다음 감지에서 재시도합니다.');
        } else {
            console.warn('🔌 일시적 감지 오류. 다음 감지에서 재시도합니다.');
        }
    }
}

// 원본 함수를 다른 이름으로도 저장 (refactored 버전과의 호환을 위해)
window.autoDetectSelectedFile_Original = autoDetectSelectedFile;

/**
 * 컨텍스트 메뉴 통합 설정
 */
function setupContextMenuIntegration() {
    if (!AppState.isEagleReady) return;
    
    // context-menu.js에서 처리
    console.log('컨텍스트 메뉴 통합 활성화');
}

// ===========================
// 실시간 선택 감지 기능
// ===========================

/**
 * 실시간 선택 감지 시작
 */
function startRealtimeDetection() {
    if (AppState.realtimeDetection.enabled) {
        console.log('🔄 실시간 감지가 이미 활성화되어 있습니다.');
        return;
    }
    
    console.log('📸 실시간 비디오 선택 감지 시작...');
    
    // UI 업데이트로 상태 표시
    updateUI();
    
    // 초기 감지 수행
    autoDetectSelectedFile();
    
    // 1초마다 폴링
    AppState.realtimeDetection.pollingInterval = setInterval(() => {
        if (AppState.isEagleReady && !AppState.isProcessing) {
            autoDetectSelectedFile();
        }
    }, AppState.realtimeDetection.checkInterval);
    
    AppState.realtimeDetection.enabled = true;
    console.log('✅ 실시간 선택 감지 활성화됨 (1초 간격)');
    
    // 사용자에게 활성화 알림
    showNotification('🔴 실시간 비디오 감지가 시작되었습니다!', 'success');
}

// 원본 함수를 다른 이름으로도 저장 (refactored 버전과의 호환을 위해)
window.startRealtimeDetection_Original = startRealtimeDetection;

/**
 * 실시간 선택 감지 중지
 */
function stopRealtimeDetection() {
    if (!AppState.realtimeDetection.enabled) {
        return;
    }
    
    if (AppState.realtimeDetection.pollingInterval) {
        clearInterval(AppState.realtimeDetection.pollingInterval);
        AppState.realtimeDetection.pollingInterval = null;
    }
    
    AppState.realtimeDetection.enabled = false;
    console.log('⏹️ 실시간 선택 감지 중지됨');
}

// 원본 함수를 다른 이름으로도 저장 (refactored 버전과의 호환을 위해)
window.stopRealtimeDetection_Original = stopRealtimeDetection;

/**
 * 실시간 감지 설정 업데이트
 * @param {Object} options - 옵션 객체
 * @param {number} options.interval - 감지 간격 (밀리초)
 * @param {boolean} options.enabled - 활성화 여부
 */
function updateRealtimeDetectionSettings(options = {}) {
    if (options.interval && options.interval >= 500) {
        AppState.realtimeDetection.checkInterval = options.interval;
        console.log(`🕰️ 감지 간격 변경: ${options.interval}ms`);
        
        // 다시 시작하여 새 간격 적용
        if (AppState.realtimeDetection.enabled) {
            stopRealtimeDetection();
            startRealtimeDetection();
        }
    }
    
    if (typeof options.enabled === 'boolean') {
        if (options.enabled && !AppState.realtimeDetection.enabled) {
            startRealtimeDetection();
        } else if (!options.enabled && AppState.realtimeDetection.enabled) {
            stopRealtimeDetection();
        }
    }
}

// ===========================
// 파일 선택 기능
// ===========================

/**
 * 비디오 파일 선택
 */
async function selectVideoFile() {
    if (AppState.isProcessing) {
        showNotification('처리 중에는 파일을 선택할 수 없습니다.', 'warning');
        return;
    }
    
    try {
        // Eagle 라이브러리에서 현재 선택된 파일 사용
        if (AppState.isEagleReady) {
            const selectedItems = await eagle.item.getSelected();
            const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'm4v'];
            const videoFiles = selectedItems.filter(item => 
                videoExtensions.includes(item.ext.toLowerCase())
            );
            
            if (videoFiles.length > 0) {
                // Eagle 아이템의 실제 파일 경로 가져오기
                const filesWithPaths = [];
                for (const item of videoFiles) {
                    console.log('선택된 아이템:', item); // 디버깅용
                    
                    // 먼저 아이템 자체에 경로가 있는지 확인
                    let filePath = item.filePath || item.path || item.url;
                    
                    // 경로가 없으면 API로 상세 정보 가져오기
                    if (!filePath) {
                        try {
                            const response = await fetch(`http://localhost:41595/api/item/info?id=${item.id}`);
                            const detailInfo = await response.json();
                            console.log('API 응답:', detailInfo); // 디버깅용
                            
                            if (detailInfo.status === 'success' && detailInfo.data) {
                                filePath = detailInfo.data.filePath || 
                                          detailInfo.data.path || 
                                          detailInfo.data.url ||
                                          detailInfo.data.src;
                            }
                        } catch (err) {
                            console.error(`아이템 ${item.name}의 상세 정보 가져오기 실패:`, err);
                        }
                    }
                    
                    if (filePath) {
                        filesWithPaths.push({
                            ...item,
                            path: filePath,
                            filePath: filePath,
                            name: item.name,
                            ext: item.ext
                        });
                        console.log(`✅ 선택된 파일: ${item.name} -> ${filePath}`);
                    } else {
                        console.warn(`❌ 파일 경로를 찾을 수 없음: ${item.name}`);
                    }
                }
                
                if (filesWithPaths.length > 0) {
                    AppState.selectedFiles = filesWithPaths;
                    AppState.currentVideoFile = filesWithPaths[0];
                    AppState.isBatchMode = filesWithPaths.length > 1;
                    
                    updateUI();
                    showNotification(`${filesWithPaths.length}개 파일 선택 완료`, 'success');
                } else {
                    showNotification('선택된 파일의 경로를 찾을 수 없습니다.', 'error');
                }
            } else {
                showNotification('Eagle 라이브러리에서 비디오 파일을 선택해주세요.', 'info');
                
                // Eagle에서 파일이 선택되지 않은 경우 안내
                if (confirm('Eagle 라이브러리에서 비디오 파일을 먼저 선택해야 합니다.\n\n지금 선택하시겠습니까?')) {
                    // Eagle의 검색 필터 설정 (비디오 파일만)
                    if (eagle.app && eagle.app.search) {
                        await eagle.app.search({
                            ext: videoExtensions
                        });
                    }
                }
            }
        } else {
            showNotification('Eagle API를 사용할 수 없습니다.', 'error');
        }
    } catch (error) {
        console.error('파일 선택 실패:', error);
        showNotification('파일 선택 중 오류가 발생했습니다.', 'error');
    }
}

// 원본 함수를 다른 이름으로도 저장 (refactored 버전과의 호환을 위해)
window.selectVideoFile_Original = selectVideoFile;

// ===========================
// Eagle API 기능
// ===========================

/**
 * 모든 인코딩된 파일을 Eagle에 폴더 단위로 임포트
 * @param {Object} videoFile - 비디오 파일 정보
 * @param {Object} extractionInfo - 추출 정보
 * @returns {Promise<void>}
 */
async function importAllFilesToEagle(videoFile, extractionInfo) {
    if (!AppState.isEagleReady || !window.EagleImporter) {
        console.log('Eagle API 또는 EagleImporter를 사용할 수 없습니다.');
        return;
    }
    
    try {
        console.log('📥 Eagle 자동 임포트 시작...');
        
        const eagleImporter = new EagleImporter();
        const videoName = videoFile.name.replace(/\.[^/.]+$/, ''); // 확장자 제거
        
        // 폴더 임포트 준비
        const importPromises = [];
        
        // 프레임 폴더 임포트 - 정확한 폴더명 찾기
        if (extractionInfo.extractedFrames > 0) {
            const framesBaseDir = await window.eagleUtils.getCacheDirectory('frames');
            const fs = window.eagleUtils?.getFS();
            
            if (fs) {
                // 베이스 디렉토리에서 비디오 이름과 일치하는 폴더 찾기
                const frameDirs = fs.readdirSync(framesBaseDir).filter(dir => {
                    const fullPath = window.eagleUtils.joinPath(framesBaseDir, dir);
                    return fs.statSync(fullPath).isDirectory() && 
                           (dir === videoName || dir.includes(videoName.replace(/\.[^/.]+$/, '')));
                });
                
                if (frameDirs.length > 0) {
                    const actualFramesDir = window.eagleUtils.joinPath(framesBaseDir, frameDirs[0]);
                    console.log('🖼️ 프레임 폴더 발견:', actualFramesDir);
                    
                    importPromises.push({
                        type: 'frames-folder',
                        folderPath: actualFramesDir
                    });
                } else {
                    console.log('🖼️ 프레임 폴더를 찾을 수 없음:', framesBaseDir);
                }
            }
        }
        
        // 클립 폴더 임포트 - 정확한 폴더명 찾기
        if (extractionInfo.extractedClips > 0) {
            const clipsBaseDir = await window.eagleUtils.getCacheDirectory('clips');
            const fs = window.eagleUtils?.getFS();
            
            if (fs) {
                // 베이스 디렉토리에서 비디오 이름과 일치하는 폴더 찾기
                const clipDirs = fs.readdirSync(clipsBaseDir).filter(dir => {
                    const fullPath = window.eagleUtils.joinPath(clipsBaseDir, dir);
                    return fs.statSync(fullPath).isDirectory() && 
                           (dir === videoName || dir.includes(videoName.replace(/\.[^/.]+$/, '')));
                });
                
                if (clipDirs.length > 0) {
                    const actualClipsDir = window.eagleUtils.joinPath(clipsBaseDir, clipDirs[0]);
                    console.log('🎬 클립 폴더 발견:', actualClipsDir);
                    
                    importPromises.push({
                        type: 'clips-folder',
                        folderPath: actualClipsDir
                    });
                } else {
                    console.log('🎬 클립 폴더를 찾을 수 없음:', clipsBaseDir);
                }
            }
        }
        
        console.log('📁 파일 임포트 상세 내역:');
        console.log('📝 전체 추출 파일 수: extractedFrames =', extractionInfo.extractedFrames, ', extractedClips =', extractionInfo.extractedClips);
        
        if (importPromises.length === 0) {
            console.log('💭 임포트할 파일이 없습니다.');
            return;
        }
        
        // Eagle에 폴더 생성 및 파일 임포트
        // AnalyzedClip/[비디오이름] 구조로 저장
        const importOptions = {
            createFolder: true,
            cleanupAfterImport: false,
            skipDuplicateCheck: true, // 빠른 임포트를 위해
            batchSize: 50 // 한번에 50개씩 임포트
        };
        
        let totalImported = 0;
        let totalFiles = 0;
        
        // 각 임포트 작업 수행
        for (const importTask of importPromises) {
            if (importTask.type === 'clips-folder') {
                    // 클립 폴더 통째로 임포트
                    console.log('📁 클립 폴더 임포트 시작:', importTask.folderPath);
                    
                    const result = await eagleImporter.importFolderToEagle(
                        importTask.folderPath,
                        videoName,
                        importOptions,
                        (progress, message) => {
                            showProgress(0.95 + progress * 0.04, message || 'Eagle 클립 임포트 중...');
                        }
                    );
                
                if (result.success) {
                    totalImported += result.successCount;
                    totalFiles += result.totalFiles;
                    console.log(`✅ 클립 폴더 임포트 완료: ${result.successCount}/${result.totalFiles}개`);
                }
            } else if (importTask.type === 'frames-folder') {
                // 프레임 폴더 통째로 임포트
                console.log('📁 프레임 폴더 임포트 시작:', importTask.folderPath);
                
                const result = await eagleImporter.importFolderToEagle(
                    importTask.folderPath,
                    videoName,
                    importOptions,
                    (progress, message) => {
                        showProgress(0.95 + progress * 0.02, message || 'Eagle 프레임 임포트 중...');
                    }
                );
                
                if (result.success) {
                    totalImported += result.successCount;
                    totalFiles += result.totalFiles;
                    console.log(`✅ 프레임 폴더 임포트 완료: ${result.successCount}/${result.totalFiles}개`);
                }
            }
        }
        
        if (totalImported > 0) {
            console.log(`🎉 Eagle 총 임포트 완료:`);
            console.log(`   • 총 임포트 파일 수: ${totalImported}개`);
            console.log(`   • 전체 처리 파일 수: ${totalFiles}개`);
            console.log(`   • 성공률: ${((totalImported/totalFiles)*100).toFixed(1)}%`);
            showNotification(`Eagle에 ${totalImported}개 파일이 임포트되었습니다.`, 'success');
        } else {
            console.log('⚠️ 임포트된 파일이 없습니다.');
        }
        
    } catch (error) {
        console.error('Eagle 자동 임포트 오류:', error);
        // 임포트 실패해도 전체 프로세스는 계속 진행
    }
}

/**
 * Eagle 라이브러리 새로고침
 */
async function refreshEagleLibrary() {
    if (!AppState.isEagleReady) {
        console.log('Eagle API를 사용할 수 없어 새로고침을 건너뜁니다.');
        return;
    }
    
    try {
        console.log('🔄 Eagle 라이브러리 새로고침 중...');
        
        // 방법 1: Eagle API의 refresh 기능 확인
        if (typeof eagle.app?.refresh === 'function') {
            await eagle.app.refresh();
            console.log('✅ Eagle 앱 새로고침 완료');
        }
        
        // 방법 2: 현재 폴더 다시 열기
        // 자동 가져오기 폴더가 설정되어 있으면 해당 폴더 새로고침
        if (typeof eagle.folder?.getSelected === 'function') {
            const selectedFolders = await eagle.folder.getSelected();
            if (selectedFolders.length > 0) {
                const currentFolder = selectedFolders[0];
                // 폴더 다시 열기로 새로고침 유도
                await eagle.folder.open(currentFolder.id);
                console.log(`✅ 폴더 '${currentFolder.name}' 새로고침 완료`);
            }
        }
        
        // 방법 3: 동적 캐시 디렉토리에 있는 파일들 스캔
        // Eagle이 Watch Folder를 통해 파일을 감지할 수 있도록 하기
        if (window.eagleUtils) {
            const cacheDirectories = await eagleUtils.getAllCacheDirectories();
            const currentLibPath = await eagleUtils.getLibraryPath();
            const cacheInfo = currentLibPath ? 'Eagle 라이브러리 기반' : '폴백 경로';
            console.log(`✅ 자동 가져오기 폴더 (${cacheInfo}):`, cacheDirectories);
            
            // 약간의 지연 후 Eagle이 파일을 감지하도록 함
            setTimeout(() => {
                console.log('✅ Eagle이 새 파일을 감지하도록 하였습니다.');
            }, 1000);
        }
        
    } catch (error) {
        console.error('Eagle 라이브러리 새로고침 실패:', error);
    }
}

// ===========================
// 비디오 처리 기능
// ===========================

/**
 * 비디오 처리 시작
 * @param {string} mode - 'frames' | 'clips' | 'all'
 */
async function processVideo(mode) {
    if (AppState.isProcessing) {
        showNotification('이미 처리가 진행 중입니다.', 'warning');
        return;
    }
    
    if (!AppState.currentVideoFile) {
        showNotification('처리할 비디오 파일을 선택해주세요.', 'warning');
        return;
    }
    
    if (!AppState.modulesLoaded) {
        showNotification('처리 모듈이 로드되지 않았습니다.', 'error');
        return;
    }
    
    AppState.isProcessing = true;
    AppState.batchCancelled = false;
    updateUI();
    
    try {
        // FFmpeg 의존성 확인
        const ffmpegReady = await checkFFmpegDependency();
        if (!ffmpegReady) {
            throw new Error('FFmpeg를 사용할 수 없습니다.');
        }
        
        // FFmpeg 경로 가져오기
        const ffmpegPaths = await getFFmpegPaths();
        
        // 설정 수집
        const settings = collectSettings();
    console.log('🎯 수집된 설정:', {
        smartFrameSelection: settings.smartFrameSelection,
        targetFrameCount: settings.targetFrameCount,
        ...settings
    });
        
        // 처리 시작
        if (AppState.isBatchMode) {
            await processBatch(mode, settings, ffmpegPaths);
        } else {
            await processSingle(AppState.currentVideoFile, mode, settings, ffmpegPaths);
        }
        
    } catch (error) {
        console.error('비디오 처리 실패:', error);
        showNotification(`처리 실패: ${error.message}`, 'error');
    } finally {
        AppState.isProcessing = false;
        updateUI();
    }
}

// 원본 함수를 다른 이름으로도 저장 (refactored 버전과의 호환을 위해)
window.processVideo_Original = processVideo;

/**
 * 단일 비디오 처리
 */
async function processSingle(videoFile, mode, settings, ffmpegPaths) {
    const startTime = Date.now();
    let videoMetadata = null; // 변수 스코프 확장
    let cutPoints = null; // cutPoints도 스코프 확장
    
    try {
        showProgress(0, '비디오 분석 중...');
        
        // 1. 비디오 분석 및 컷 감지
        console.log('VideoAnalyzer 생성 시작...');
        const analyzer = new VideoAnalyzer(ffmpegPaths);
        
        // 초기화 확인
        console.log('VideoAnalyzer 초기화 상태:', analyzer.initialized);
        if (!analyzer.initialized) {
            console.log('VideoAnalyzer 초기화 시작...');
            await analyzer.initialize();
            console.log('VideoAnalyzer 초기화 완료');
        }
        
        // 메서드 존재 확인
        if (typeof analyzer.getVideoMetadata !== 'function') {
            console.error('getVideoMetadata 메서드가 없습니다. 사용 가능한 메서드:', Object.getOwnPropertyNames(analyzer));
            throw new Error('VideoAnalyzer에 getVideoMetadata 메서드가 없습니다.');
        }
        
        // 비디오 메타데이터 가져오기 (총 길이 포함)
        videoMetadata = await analyzer.getVideoMetadata(videoFile.path);
        const totalDuration = videoMetadata.duration || 0;
        
        cutPoints = await analyzer.detectCutChanges(
            videoFile.path,
            settings.sensitivity,
            (progress) => showProgress(0.1 + progress * 0.2, '컷 변화 감지 중...'),
            ffmpegPaths,
            settings.inHandle,
            settings.outHandle
        );
        
        console.log(`🎯 ${cutPoints.length}개 컷 포인트 감지됨`);
        
        let extractedFrames = 0;
        let extractedClips = 0;
        
        // 2. 프레임 추출
        if (mode === 'frames' || mode === 'all') {
            showProgress(0.3, '프레임 추출 준비 중...');
            
            const frameExtractor = new FrameExtractor(ffmpegPaths);
            
            // 초기화 확인
            if (!frameExtractor.initialized) {
                await frameExtractor.initialize(videoFile.path);
            }
            
            showProgress(0.35, '프레임 추출 시작...');
            
            // 분석용 프레임 추출인 경우 총 길이 정보 포함
            const frameSettings = {
                ...settings,
                totalDuration: totalDuration
            };
            const frameResult = await frameExtractor.extractFrames(
                videoFile.path,
                cutPoints,
                frameSettings,
                (progress) => showProgress(0.35 + progress * 0.30, '프레임 추출 중...'),
                ffmpegPaths
            );
            
            extractedFrames = frameResult.count;
            console.log(`🖼️ ${extractedFrames}개 프레임 추출 완료`);
            
            // 스마트 프레임 선별 수행 (옵션)
            console.log('🤖 스마트 선별 체크:', {
                enabled: settings.smartFrameSelection,
                hasPaths: !!(frameResult.paths && frameResult.paths.length > 0),
                pathCount: frameResult.paths ? frameResult.paths.length : 0,
                hasModule: !!window.SmartFrameSelector
            });
            
            if (settings.smartFrameSelection && frameResult.paths && frameResult.paths.length > 0) {
                showProgress(0.65, '스마트 프레임 선별 중...');
                await performSmartFrameSelection(videoFile, frameResult.paths, settings);
            } else {
                console.log('🤖 스마트 선별 스킵:', 
                    !settings.smartFrameSelection ? '옵션 비활성화' : 
                    !frameResult.paths ? '프레임 경로 없음' :
                    frameResult.paths.length === 0 ? '프레임 0개' : '알 수 없는 이유'
                );
            }
        }
        
        // 3. 클립 추출
        if (mode === 'clips' || mode === 'all') {
            const clipProgress = mode === 'all' ? 0.65 : 0.3;
            showProgress(clipProgress, '클립 추출 준비 중...');
            
            // ClipExtractor 모듈 로드 확인
            if (!window.ClipExtractor) {
                console.error('🚨 ClipExtractor 모듈이 로드되지 않았습니다!');
                console.log('모듈 로드 상태 다시 확인 중...');
                
                // 모듈 로드 상태 다시 확인
                checkModulesLoaded();
                
                // 다시 한 번 확인
                if (!window.ClipExtractor) {
                    throw new Error('ClipExtractor 모듈을 로드할 수 없습니다. 페이지를 새로고침해주세요.');
                }
            }
            
            console.log('✅ ClipExtractor 모듈 로드 확인 완료');
            const clipExtractor = new ClipExtractor(ffmpegPaths);
            
            // 초기화 확인
            if (!clipExtractor.initialized) {
                await clipExtractor.initialize(videoFile.path);
            }
            
            showProgress(clipProgress + 0.05, '클립 추출 시작...');
            
            const clipResult = await clipExtractor.extractClips(
                videoFile.path,
                cutPoints,
                settings,
                (progress) => showProgress(clipProgress + 0.05 + progress * 0.30, '클립 추출 중...'),
                ffmpegPaths
            );
            
            extractedClips = clipResult.count;
            console.log(`🎬 ${extractedClips}개 클립 추출 완료`);
        }
        
        // 4. 결과 표시
        const processingTime = (Date.now() - startTime) / 1000;
        showResults({
            cutPoints: cutPoints.length,
            extractedFrames,
            extractedClips
        }, processingTime);
        
        // 5. Eagle에 자동 임포트 (모든 파일을 한번에)
        if (extractedFrames > 0 || extractedClips > 0) {
            showProgress(0.95, 'Eagle에 파일 임포트 중...');
            await importAllFilesToEagle(videoFile, {
                extractedFrames,
                extractedClips,
                mode
            });
        }
        
        // 6. Eagle 라이브러리 새로고침 (자동 새로고침이 안 되는 경우를 위한 백업)
        await refreshEagleLibrary();
        
        showNotification('✅ 처리가 완료되었습니다!', 'success');
        
    } catch (error) {
        console.error('단일 비디오 처리 실패:', {
            message: error.message,
            stack: error.stack,
            videoFile: videoFile?.name || 'unknown',
            mode: mode,
            hasVideoMetadata: !!videoMetadata, // 이제 올바르게 참조 가능
            cutPointsCount: cutPoints?.length || 0
        });
        throw error;
    }
}

/**
 * 배치 처리
 */
async function processBatch(mode, settings, ffmpegPaths) {
    const startTime = Date.now();
    const batchResults = [];
    
    // 배치 UI 표시
    AppState.elements.batchProgress.style.display = 'block';
    AppState.elements.batchCancelBtn.style.display = 'inline-block';
    AppState.elements.batchTotalFiles.textContent = AppState.selectedFiles.length;
    
    try {
        for (let i = 0; i < AppState.selectedFiles.length; i++) {
            if (AppState.batchCancelled) {
                console.log('⏹️ 배치 처리가 취소되었습니다.');
                break;
            }
            
            const file = AppState.selectedFiles[i];
            const fileStartTime = Date.now();
            
            // 배치 진행률 업데이트
            AppState.elements.batchCurrentFile.textContent = i + 1;
            AppState.elements.batchProgressFill.style.width = `${((i + 1) / AppState.selectedFiles.length) * 100}%`;
            
            try {
                await processSingle(file, mode, settings, ffmpegPaths);
                
                batchResults.push({
                    fileName: file.name,
                    success: true,
                    processingTime: (Date.now() - fileStartTime) / 1000
                });
                
            } catch (error) {
                console.error(`파일 처리 실패: ${file.name}`, error);
                
                batchResults.push({
                    fileName: file.name,
                    success: false,
                    error: error.message,
                    processingTime: (Date.now() - fileStartTime) / 1000
                });
            }
        }
        
        // 배치 결과 표시
        const totalTime = (Date.now() - startTime) / 1000;
        showBatchResults(batchResults, totalTime, AppState.batchCancelled);
        
        // 배치 처리 후에도 Eagle 새로고침
        await refreshEagleLibrary();
        
    } finally {
        // 배치 UI 숨기기
        AppState.elements.batchProgress.style.display = 'none';
        AppState.elements.batchCancelBtn.style.display = 'none';
    }
}

/**
 * 배치 처리 취소
 */
function cancelBatchProcessing() {
    AppState.batchCancelled = true;
    showNotification('배치 처리가 취소됩니다...', 'warning');
}

// ===========================
// 설정 관리
// ===========================

/**
 * 현재 설정 수집
 */
function collectSettings() {
    const { elements } = AppState;
    
    return {
        sensitivity: parseFloat(elements.sensitivitySlider?.value || 0.3),
        imageFormat: elements.formatSelect?.value || 'png', // 기본값 PNG로 변경
        quality: parseInt(elements.qualitySlider?.value || 8),
        inHandle: parseInt(elements.inHandleSlider?.value || 3),
        outHandle: parseInt(elements.outHandleSlider?.value || 3),
        extractionMethod: elements.extractionMethod?.value || 'unified',
        duplicateHandling: elements.duplicateHandling?.value || 'overwrite',
        useUnifiedExtraction: elements.extractionMethod?.value === 'unified',
        analysisFrameNaming: elements.analysisFrameNaming?.checked || false,
        
        // 스마트 프레임 선별 - 기본값 true로 변경
        smartFrameSelection: elements.smartFrameSelection?.checked !== false, // 기본 true
        targetFrameCount: parseInt(elements.targetFrameCount?.value || 10)
    };
}

/**
 * 설정 슬라이더 업데이트 함수들
 */
function updateSensitivityValue() {
    const { elements } = AppState;
    if (elements.sensitivityValue && elements.sensitivitySlider) {
        elements.sensitivityValue.textContent = elements.sensitivitySlider.value;
    }
}

function updateQualityValue() {
    const { elements } = AppState;
    if (elements.qualityValue && elements.qualitySlider) {
        elements.qualityValue.textContent = elements.qualitySlider.value;
    }
}

function updateInHandleValue() {
    const { elements } = AppState;
    if (elements.inHandleValue && elements.inHandleSlider) {
        elements.inHandleValue.textContent = `+${elements.inHandleSlider.value}`;
    }
}

function updateOutHandleValue() {
    const { elements } = AppState;
    if (elements.outHandleValue && elements.outHandleSlider) {
        elements.outHandleValue.textContent = `-${elements.outHandleSlider.value}`;
    }
}

function updateTargetFrameCountValue() {
    const { elements } = AppState;
    if (elements.targetFrameCountValue && elements.targetFrameCount) {
        elements.targetFrameCountValue.textContent = elements.targetFrameCount.value;
    }
}

function toggleSmartSelectionOptions() {
    const { elements } = AppState;
    if (elements.smartFrameSelection && elements.smartSelectionOptions) {
        const isEnabled = elements.smartFrameSelection.checked;
        elements.smartSelectionOptions.style.display = isEnabled ? 'block' : 'none';
    }
}

// ===========================
// UI 업데이트
// ===========================

/**
 * UI 상태 업데이트
 */
function updateUI() {
    const { elements, selectedFiles, currentVideoFile, isBatchMode, isProcessing } = AppState;
    
    // 파일 선택 정보 - 상세 메타데이터 포함
    if (elements.selectedFile) {
        if (currentVideoFile) {
            // 비디오 메타데이터 표시
            updateVideoFileInfo(currentVideoFile);
        } else {
            // 선택된 파일이 없을 때 실시간 감지 상태 표시
            const detectionStatus = AppState.realtimeDetection.enabled 
                ? '🔴 실시간 감지 중 - Eagle에서 동영상을 선택하세요' 
                : '⚪ Eagle에서 동영상을 선택하세요';
                
            elements.selectedFile.innerHTML = `<span class="placeholder">${detectionStatus}</span>`;
            elements.selectedFile.classList.remove('has-file');
        }
    }
    
    // 배치 정보
    if (elements.batchInfo) {
        elements.batchInfo.style.display = isBatchMode ? 'block' : 'none';
        if (elements.batchCount) {
            elements.batchCount.textContent = selectedFiles.length;
        }
        if (elements.batchList && isBatchMode) {
            elements.batchList.innerHTML = selectedFiles
                .map(f => `<div class="batch-file-item">📹 ${f.name}</div>`)
                .join('');
        }
    }
    
    // 버튼 상태
    const hasFile = !!currentVideoFile;
    if (elements.extractFramesBtn) elements.extractFramesBtn.disabled = !hasFile || isProcessing;
    if (elements.extractClipsBtn) elements.extractClipsBtn.disabled = !hasFile || isProcessing;
    if (elements.processBtn) elements.processBtn.disabled = !hasFile || isProcessing;
    if (elements.selectFileBtn) elements.selectFileBtn.disabled = isProcessing;
    
    // 설정 컨트롤 상태
    const settingControls = [
        elements.sensitivitySlider,
        elements.formatSelect,
        elements.qualitySlider,
        elements.inHandleSlider,
        elements.outHandleSlider,
        elements.extractionMethod,
        elements.duplicateHandling
    ];
    
    settingControls.forEach(control => {
        if (control) control.disabled = isProcessing;
    });
}

/**
 * 비디오 파일 상세 정보 업데이트
 * @param {Object} videoFile - 비디오 파일 객체
 */
async function updateVideoFileInfo(videoFile) {
    const { elements } = AppState;
    
    try {
        // 실시간 감지 표시를 위한 상태 표시
        const detectionStatus = AppState.realtimeDetection.enabled 
            ? '<span class="detection-status active">🔴 실시간 감지 중</span>' 
            : '<span class="detection-status inactive">⚪ 실시간 감지 꺼짐</span>';
        
        // 기본 파일 정보 표시
        const basicInfo = `
            <div class="video-file-info selected">
                <div class="video-file-header">
                    <div class="video-file-name" title="${videoFile.name}">
                        <strong>📹 ${videoFile.name}</strong>
                        ${detectionStatus}
                    </div>
                    <div class="video-file-badges">
                        <span class="file-ext-badge">${videoFile.ext?.toUpperCase() || 'VIDEO'}</span>
                        ${videoFile.size ? `<span class="file-size-badge">${formatFileSize(videoFile.size)}</span>` : ''}
                        ${AppState.isBatchMode ? `<span class="batch-mode-badge">BATCH</span>` : ''}
                    </div>
                </div>
                <div class="video-metadata" id="videoMetadata">
                    <div class="metadata-loading">
                        <span class="loading-spinner">⚪</span>
                        <span>비디오 정보 분석 중...</span>
                    </div>
                </div>
            </div>
        `;
        
        elements.selectedFile.innerHTML = basicInfo;
        
        // 선택된 파일이 있을 때 CSS 클래스 추가
        elements.selectedFile.classList.add('has-file');
        
        // 비디오 메타데이터 비동기 로드
        loadVideoMetadata(videoFile);
        
    } catch (error) {
        console.error('비디오 파일 정보 업데이트 실패:', error);
        elements.selectedFile.innerHTML = `
            <div class="video-file-info error">
                <div class="video-file-name">
                    <strong>⚠️ ${videoFile.name}</strong>
                </div>
                <div class="error-message">파일 정보를 읽을 수 없습니다</div>
            </div>
        `;
        elements.selectedFile.classList.add('has-file');
    }
}

/**
 * 비디오 메타데이터 비동기 로드
 * @param {Object} videoFile - 비디오 파일 객체
 */
async function loadVideoMetadata(videoFile) {
    const metadataElement = document.getElementById('videoMetadata');
    if (!metadataElement) return;
    
    try {
        // FFmpeg 의존성 확인
        const ffmpegReady = await checkFFmpegDependency();
        if (!ffmpegReady) {
            metadataElement.innerHTML = `
                <div class="metadata-error">
                    <span>⚠️ FFmpeg를 사용할 수 없어 상세 정보를 가져올 수 없습니다</span>
                </div>
            `;
            return;
        }
        
        // FFmpeg 경로 가져오기
        const ffmpegPaths = await getFFmpegPaths();
        
        // VideoAnalyzer 인스턴스 생성 및 메타데이터 추출
        if (!window.VideoAnalyzer) {
            throw new Error('VideoAnalyzer 모듈이 로드되지 않았습니다');
        }
        
        const analyzer = new VideoAnalyzer(ffmpegPaths);
        if (!analyzer.initialized) {
            await analyzer.initialize();
        }
        
        console.log('🔍 비디오 메타데이터 추출 시작:', videoFile.path);
        const metadata = await analyzer.getVideoMetadata(videoFile.path);
        
        console.log('📊 추출된 메타데이터:', metadata);
        
        // 메타데이터 표시
        displayVideoMetadata(metadata);
        
    } catch (error) {
        console.error('비디오 메타데이터 로드 실패:', error);
        metadataElement.innerHTML = `
            <div class="metadata-error">
                <span>⚠️ 비디오 정보 분석 실패: ${error.message}</span>
            </div>
        `;
    }
}

/**
 * 비디오 메타데이터 표시
 * @param {Object} metadata - 비디오 메타데이터
 */
function displayVideoMetadata(metadata) {
    const metadataElement = document.getElementById('videoMetadata');
    if (!metadataElement) return;
    
    const {
        duration = 0,
        width = 0,
        height = 0,
        fps = 0,
        codec = 'unknown',
        bitrate = 0,
        frameCount = 0
    } = metadata;
    
    const metadataHTML = `
        <div class="metadata-grid">
            <div class="metadata-item">
                <span class="metadata-label">⏱️ 길이</span>
                <span class="metadata-value">${formatDuration(duration)}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">📐 해상도</span>
                <span class="metadata-value">${width} × ${height}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">🎞️ 프레임레이트</span>
                <span class="metadata-value">${fps.toFixed(2)} fps</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">🔧 코덱</span>
                <span class="metadata-value">${codec}</span>
            </div>
            ${bitrate > 0 ? `
            <div class="metadata-item">
                <span class="metadata-label">📊 비트레이트</span>
                <span class="metadata-value">${formatBitrate(bitrate)}</span>
            </div>
            ` : ''}
            ${frameCount > 0 ? `
            <div class="metadata-item">
                <span class="metadata-label">🎬 총 프레임</span>
                <span class="metadata-value">${frameCount.toLocaleString()}개</span>
            </div>
            ` : ''}
        </div>
    `;
    
    metadataElement.innerHTML = metadataHTML;
}

/**
 * 파일 크기 포맷팅
 * @param {number} bytes - 바이트 크기
 * @returns {string} 포맷된 크기
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * 시간 포맷팅 (초를 시:분:초로)
 * @param {number} seconds - 초 단위 시간
 * @returns {string} 포맷된 시간
 */
function formatDuration(seconds) {
    if (seconds === 0) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

/**
 * 비트레이트 포맷팅
 * @param {number} bitrate - 비트레이트 (bps)
 * @returns {string} 포맷된 비트레이트
 */
function formatBitrate(bitrate) {
    if (bitrate === 0) return 'unknown';
    
    const kbps = bitrate / 1000;
    const mbps = kbps / 1000;
    
    if (mbps >= 1) {
        return `${mbps.toFixed(1)} Mbps`;
    } else {
        return `${kbps.toFixed(0)} kbps`;
    }
}

/**
 * 진행률 표시
 */
function showProgress(progress, message) {
    const { elements } = AppState;
    
    if (elements.progressSection) {
        elements.progressSection.style.display = 'block';
    }
    
    if (elements.progressFill) {
        elements.progressFill.style.width = `${progress * 100}%`;
    }
    
    if (elements.progressText) {
        elements.progressText.textContent = message;
    }
    
    console.log(`📊 진행률 ${(progress * 100).toFixed(1)}%: ${message}`);
}

/**
 * 알림 표시
 */
function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // Eagle 알림 사용
    if (AppState.isEagleReady && typeof eagle.notification !== 'undefined') {
        eagle.notification.show({
            title: 'Video Processor',
            body: message,
            type: type
        });
    }
}

/**
 * 처리 결과 표시
 */
function showResults(result, processingTime) {
    const { elements } = AppState;
    
    if (!elements.resultsSection) return;
    
    elements.resultsSection.style.display = 'block';
    
    const summary = [];
    if (result.cutPoints > 0) summary.push(`${result.cutPoints}개 컷 변화`);
    if (result.extractedFrames > 0) summary.push(`${result.extractedFrames}개 프레임`);
    if (result.extractedClips > 0) summary.push(`${result.extractedClips}개 클립`);
    
    if (elements.resultSummary) {
        elements.resultSummary.innerHTML = `
            <div class="result-item">
                <span class="result-label">처리 결과:</span>
                <span class="result-value">${summary.join(', ')}</span>
            </div>
            <div class="result-item">
                <span class="result-label">처리 시간:</span>
                <span class="result-value">${processingTime.toFixed(1)}초</span>
            </div>
            <div class="result-item">
                <span class="result-label">파일:</span>
                <span class="result-value">${AppState.currentVideoFile.name}</span>
            </div>
        `;
    }
}

/**
 * 배치 처리 결과 표시
 */
function showBatchResults(batchResults, totalTime, cancelled) {
    const { elements } = AppState;
    
    if (!elements.batchResultsSection) return;
    
    elements.batchResultsSection.style.display = 'block';
    
    const successCount = batchResults.filter(r => r.success).length;
    const failCount = batchResults.length - successCount;
    
    let html = `
        <div class="batch-summary">
            <h3>배치 처리 ${cancelled ? '(취소됨)' : '완료'}</h3>
            <div class="batch-stats">
                <span class="success">✅ 성공: ${successCount}개</span>
                <span class="fail">❌ 실패: ${failCount}개</span>
                <span class="time">⏱️ 총 시간: ${totalTime.toFixed(1)}초</span>
            </div>
        </div>
        <div class="batch-details">
    `;
    
    batchResults.forEach((result, index) => {
        const status = result.success ? '✅' : '❌';
        const error = result.error ? ` (${result.error})` : '';
        html += `
            <div class="batch-result-item ${result.success ? 'success' : 'error'}">
                <span class="batch-index">${index + 1}.</span>
                <span class="batch-status">${status}</span>
                <span class="batch-filename">${result.fileName}</span>
                <span class="batch-time">${result.processingTime.toFixed(1)}s</span>
                ${error ? `<span class="batch-error">${error}</span>` : ''}
            </div>
        `;
    });
    
    html += '</div>';
    
    if (elements.batchResultsList) {
        elements.batchResultsList.innerHTML = html;
    }
    
    // 전체 결과 알림
    const message = cancelled 
        ? `배치 처리 취소됨: ${successCount}/${batchResults.length}개 완료`
        : `배치 처리 완료: ${successCount}/${batchResults.length}개 성공`;
    
    showNotification(message, cancelled ? 'warning' : (failCount > 0 ? 'warning' : 'success'));
}

// ===========================
// FFmpeg 관련 함수
// ===========================

/**
 * FFmpeg 의존성 확인
 */
async function checkFFmpegDependency() {
    try {
        // Eagle FFmpeg API 사용하지 않음 (정보창 표시 방지)
        // 시스템 FFmpeg를 직접 사용
        console.log('시스템 FFmpeg 사용');
        return true;
    } catch (error) {
        console.error('FFmpeg 의존성 확인 실패:', error);
        return false;
    }
}

/**
 * FFmpeg 경로 가져오기
 */
async function getFFmpegPaths() {
    try {
        // Eagle FFmpeg 플러그인 사용하지 않고 시스템 경로 사용
        // (Eagle FFmpeg 플러그인 호출 시 정보창이 뜨는 문제 회피)
        
        // eagleUtils 사용 가능한 경우
        if (window.eagleUtils && typeof window.eagleUtils.getFFmpegPaths === 'function') {
            return await window.eagleUtils.getFFmpegPaths();
        }
        
        // 기본 시스템 경로 사용
        console.log('FFmpeg 기본 시스템 경로 사용');
        return {
            ffmpeg: 'ffmpeg',
            ffprobe: 'ffprobe'
        };
    } catch (error) {
        console.error('FFmpeg 경로 가져오기 실패:', error);
        // 오류 시에도 기본 경로 반환
        return {
            ffmpeg: 'ffmpeg',
            ffprobe: 'ffprobe'
        };
    }
}

// ===========================
// 캐시 관리
// ===========================

/**
 * 캐시 경로 표시 업데이트
 */
async function updateCachePathDisplay() {
    if (!window.eagleUtils) {
        console.warn('eagleUtils를 사용할 수 없어 캐시 경로 표시를 업데이트할 수 없습니다.');
        return;
    }
    
    try {
        // 동적 캐시 경로 가져오기
        const clipsPath = await eagleUtils.getCacheDirectory('clips');
        const framesPath = await eagleUtils.getCacheDirectory('frames');
        
        // UI 요소 업데이트
        const clipsPathElement = document.getElementById('clipsPath');
        const framesPathElement = document.getElementById('framesPath');
        
        if (clipsPathElement) {
            clipsPathElement.textContent = clipsPath || '현재 Eagle 라이브러리/video-processor-cache/clips';
        }
        
        if (framesPathElement) {
            framesPathElement.textContent = framesPath || '현재 Eagle 라이브러리/video-processor-cache/frames';
        }
        
        console.log('✅ 캐시 경로 표시 업데이트 완료:', {
            clips: clipsPath,
            frames: framesPath
        });
        
    } catch (error) {
        console.error('캐시 경로 표시 업데이트 실패:', error);
    }
}

/**
 * 캐시 상태 확인 (동적 Eagle 라이브러리 경로 지원)
 */
async function checkCacheStatus() {
    if (!window.eagleUtils) {
        console.error('eagleUtils를 사용할 수 없습니다.');
        return;
    }
    
    const fs = eagleUtils.getFS();
    if (!fs) return;
    
    let totalFiles = 0;
    let totalSize = 0;
    
    // 동적으로 Eagle 라이브러리 기반 캐시 디렉토리 가져오기
    const cacheDirectories = await eagleUtils.getAllCacheDirectories();
    
    for (const dirPath of cacheDirectories) {
        try {
            if (fs.existsSync(dirPath)) {
                const files = fs.readdirSync(dirPath);
                for (const file of files) {
                    const filePath = eagleUtils.joinPath(dirPath, file);
                    const stats = fs.statSync(filePath);
                    if (stats.isFile()) {
                        totalFiles++;
                        totalSize += stats.size;
                    }
                }
            }
        } catch (error) {
            console.error('캐시 확인 실패:', error);
        }
    }
    
    const { elements } = AppState;
    
    if (elements.cacheResult && elements.cacheResultContent) {
        elements.cacheResult.style.display = 'block';
        if (totalFiles === 0) {
            elements.cacheResult.className = 'cache-result success';
            elements.cacheResultContent.innerHTML = '✅ 캐시가 비어있습니다.';
        } else {
            elements.cacheResult.className = 'cache-result warning';
            // 현재 사용 중인 캐시 경로 표시
            const currentLibPath = await eagleUtils.getLibraryPath();
            const cacheInfo = currentLibPath ? 
                `Eagle 라이브러리 내 video-processor-cache` : 
                `폴백 경로 (/Users/ysk/assets/temp)`;
            
            elements.cacheResultContent.innerHTML = `📊 총 ${totalFiles}개 파일, ${eagleUtils.formatFileSize(totalSize)}<br><small>📁 ${cacheInfo}</small>`;
        }
    }
    
    // 캐시 경로 표시 업데이트
    await updateCachePathDisplay();
}

/**
 * 캐시 정리
 */
async function clearCache() {
    if (!confirm('모든 캐시 파일을 삭제하시겠습니까?')) return;
    
    if (!window.eagleUtils) {
        console.error('eagleUtils를 사용할 수 없습니다.');
        return;
    }
    
    const { elements } = AppState;
    
    if (elements.cacheResult && elements.cacheResultContent) {
        elements.cacheResult.style.display = 'block';
        elements.cacheResult.className = 'cache-result info';
        elements.cacheResultContent.innerHTML = '캐시를 삭제 중...';
    }
    
    try {
        const result = await eagleUtils.clearAllCache();
        if (elements.cacheResult && elements.cacheResultContent) {
            if (result.success) {
                elements.cacheResult.className = 'cache-result success';
                elements.cacheResultContent.innerHTML = `✅ ${result.deletedFiles}개 파일 삭제 완료`;
            } else {
                elements.cacheResult.className = 'cache-result error';
                elements.cacheResultContent.innerHTML = '❌ 일부 파일 삭제 실패';
            }
        }
    } catch (error) {
        if (elements.cacheResult && elements.cacheResultContent) {
            elements.cacheResult.className = 'cache-result error';
            elements.cacheResultContent.innerHTML = `❌ 삭제 실패: ${error.message}`;
        }
    }
}

/**
 * 결과 폴더 열기
 */
function openResultsFolder() {
    try {
        if (!window.eagleUtils) {
            console.error('eagleUtils를 사용할 수 없습니다.');
            alert('결과 폴더를 열 수 없습니다.');
            return;
        }
        
        const directories = await eagleUtils.getAllCacheDirectories();
        
        if (directories.length === 0) {
            alert('열 수 있는 결과 폴더가 없습니다.');
            return;
        }
        
        // 동적 Eagle 라이브러리 기반 첫 번째 캐시 디렉토리 사용
        const targetDir = directories[0];
        
        // Eagle Shell API 사용
        if (typeof eagle?.shell?.openPath !== 'undefined') {
            eagle.shell.openPath(targetDir);
        } else {
            console.warn('폴더 열기를 지원하지 않습니다.');
            alert(`결과 폴더 경로: ${targetDir}`);
        }
        
        console.log('결과 폴더 열기:', targetDir);
        
    } catch (error) {
        console.error('결과 폴더 열기 실패:', error);
        alert('결과 폴더를 열 수 없습니다.');
    }
}

// ===========================
// 플러그인 초기화
// ===========================

/**
 * 모듈 로드 확인
 */
function checkModulesLoaded() {
    const requiredModules = ['VideoAnalyzer', 'FrameExtractor', 'ClipExtractor', 'EagleImporter'];
    const optionalModules = ['SmartFrameSelector']; // 선택적 모듈
    const availableModules = requiredModules.filter(module => typeof window[module] === 'function');
    const availableOptionalModules = optionalModules.filter(module => typeof window[module] === 'function');
    
    console.log('확인된 모듈들:', availableModules);
    console.log('선택적 모듈들:', availableOptionalModules);
    console.log('전역 객체 상태:', {
        VideoAnalyzer: typeof window.VideoAnalyzer,
        FrameExtractor: typeof window.FrameExtractor,
        ClipExtractor: typeof window.ClipExtractor,
        EagleImporter: typeof window.EagleImporter,
        SmartFrameSelector: typeof window.SmartFrameSelector,
        eagleUtils: typeof window.eagleUtils,
        configManager: typeof window.configManager
    });
    
    // 모든 필수 모듈이 로드되었는지 확인
    if (availableModules.length === requiredModules.length) {
        console.log('✅ 모든 처리 모듈 로드 완료');
        AppState.modulesLoaded = true;
        
        // 로드 완료 알림
        if (typeof showNotification === 'function') {
            showNotification('모든 모듈 로드 완료!', 'success');
        }
        
        return true;
    }
    
    const missingModules = requiredModules.filter(module => typeof window[module] !== 'function');
    console.warn('⚠️ 일부 모듈이 로드되지 않았습니다:', missingModules);
    
    // 카운터가 없는 경우 초기화
    if (!window._moduleCheckCount) {
        window._moduleCheckCount = 0;
        window._moduleCheckStartTime = Date.now();
    }
    window._moduleCheckCount++;
    
    const elapsedTime = Date.now() - window._moduleCheckStartTime;
    
    // 30초 또는 20회 이상 재시도 시 포기
    if (window._moduleCheckCount > 20 || elapsedTime > 30000) {
        console.error('❌ 모듈 로드 재시도 한계 초과. 필수 모듈을 찾을 수 없습니다.');
        
        // 자세한 오류 정보 표시
        const errorDetails = {
            missingModules: missingModules,
            foundModules: availableModules,
            scriptElements: Array.from(document.querySelectorAll('script[src]')).map(s => s.src),
            windowKeys: Object.keys(window).filter(k => k.includes('Extractor') || k.includes('Analyzer')),
            attempts: window._moduleCheckCount,
            elapsedTimeMs: elapsedTime
        };
        
        console.error('모듈 로드 오류 상세 정보:', errorDetails);
        
        if (typeof showNotification === 'function') {
            showNotification(`모듈 로드 실패! 누락된 모듈: ${missingModules.join(', ')}`, 'error');
        }
        
        // 페이지 새로고침 제안
        if (confirm('모듈 로드에 실패했습니다. 페이지를 새로고침하시겠습니까?')) {
            window.location.reload();
        }
        
        return false;
    }
    
    // 1초 후 재시도
    setTimeout(() => {
        console.log(`다시 모듈 확인 시도... (${window._moduleCheckCount}/20, ${(elapsedTime/1000).toFixed(1)}s)`);
        checkModulesLoaded();
    }, 1000);
    
    return false;
}


/**
 * 플러그인 초기화
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Video Processor 플러그인 초기화 시작...');
    
    try {
        // DOM 요소 초기화
        initializeElements();
        
        // Eagle API 확인
        checkEagleAPI();
        
        // 모듈이 로드될 때까지 잠시 대기
        console.log('모듈 로드 대기 중...');
        setTimeout(() => {
            // 모듈 로드 확인
            const loadResult = checkModulesLoaded();
            console.log('모듈 로드 체크 결과:', loadResult);
            
            // 로드가 성공했을 때만 나머지 초기화 진행
            if (loadResult || AppState.modulesLoaded) {
                // 이벤트 리스너 설정
                setupEventListeners();
                
                // 컨텍스트 메뉴 통합
                setupContextMenuIntegration();
                
                // 초기 UI 상태 설정
                updateSensitivityValue();
                updateQualityValue();
                updateInHandleValue();
                updateOutHandleValue();
                updateTargetFrameCountValue();
                updateUI();
                
                // 캐시 경로 표시 초기화
                setTimeout(async () => {
                    await updateCachePathDisplay();
                }, 1000);
                
                // 워치독 시스템 시작
                pluginWatchdog = new PluginWatchdog();
                
                // 실시간 감지 즉시 시작
                if (AppState.isEagleReady) {
                    console.log('🚀 Eagle 준비 완료 - 실시간 감지 시작');
                    startRealtimeDetection();
                    
                    // 초기 감지 수행
                    setTimeout(() => {
                        console.log('🔍 초기 비디오 감지 시도...');
                        autoDetectSelectedFile();
                    }, 500);
                } else {
                    console.log('⚠️ Eagle API 미준비 - 실시간 감지 대기 중');
                }
                
                // 페이지 언로드 시 정리 작업 등록
                window.addEventListener('beforeunload', () => {
                    console.log('🧹 플러그인 정리 작업 시작...');
                    stopRealtimeDetection();
                    if (pluginWatchdog) {
                        pluginWatchdog.stop();
                    }
                    console.log('✅ 플러그인 정리 완료');
                });
                
                console.log('✅ Video Processor 플러그인 초기화 완료');
                
                // 사용자에게 준비 완료 알림
                showNotification('🚀 Video Processor 준비 완료! Eagle에서 비디오를 선택하세요.', 'success');
                
                // Eagle이 준비되어 있다면 자동 감지 
                if (AppState.isEagleReady && !AppState.realtimeDetection.enabled) {
                    // 모듈 로드되면 실시간 감지 시작
                    console.log('🔍 모듈 로드 완료 - 실시간 감지 시작');
                    startRealtimeDetection();
                    
                    setTimeout(() => {
                        console.log('🔍 초기 파일 감지 시작...');
                        autoDetectSelectedFile();
                    }, 1000);
                } else {
                    console.log('⚠️ Eagle API 미준비 또는 실시간 감지 이미 활성화됨');
                }
            } else {
                console.warn('⚠️ 모듈 로드가 완료되지 않았습니다. 재시도를 기다리는 중...');
                // 모듈 로드 재시도가 진행 중이므로 대기
            }
        }, 1000); // 1초 후에 모듈 로드 체크
        
    } catch (error) {
        console.error('❌ 플러그인 초기화 실패:', error);
        alert(`플러그인 초기화에 실패했습니다: ${error.message}`);
    }
});

// ===========================
// 전역 API 등록
// ===========================
window.VideoProcessor = {
    // 핵심 기능
    processVideo,
    selectVideoFile,
    
    // 캐시 관리
    clearCache,
    checkCacheStatus,
    openResultsFolder,
    
    // 실시간 감지 제어
    realtimeDetection: {
        start: startRealtimeDetection,
        stop: stopRealtimeDetection,
        updateSettings: updateRealtimeDetectionSettings,
        getStatus: () => ({
            enabled: AppState.realtimeDetection.enabled,
            interval: AppState.realtimeDetection.checkInterval,
            lastSelectionCount: AppState.realtimeDetection.lastSelectionIds.length,
            currentSelectionCount: AppState.selectedFiles.length
        })
    },
    
    // 상태 접근
    getState: () => AppState,
    
    // 워치독 제어
    watchdog: {
        getStatus: () => pluginWatchdog?.getStatus() || null,
        setEnabled: (enabled) => pluginWatchdog?.setEnabled(enabled),
        setTimeoutMinutes: (minutes) => pluginWatchdog?.setTimeoutMinutes(minutes),
        manualReset: () => pluginWatchdog?.performAutoReset(),
        recordActivity: () => pluginWatchdog?.recordActivity()
    },
    
    // 디버깅용
    version: '1.3.1' // 실시간 감지 추가로 버전 업
};