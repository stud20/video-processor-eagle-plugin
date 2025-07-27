// ===========================
// Video Processor Eagle Plugin - Refactored Main
// ===========================

// 전역 인스턴스
let stateManager = null;
let uiController = null;
let errorHandler = null;
let progressManager = null;
let eagleIntegration = null;
let fileService = null;
let settingsManager = null;
let ffmpegManager = null;
// pluginWatchdog는 main.js에서 이미 선언됨

// 모듈 로드 상태
let modulesInitialized = false;

// ===========================
// 초기화 및 모듈 로드
// ===========================

/**
 * 플러그인 초기화
 */
async function initializePlugin() {
    try {
        console.log('🚀 플러그인 초기화 시작...');
        
        // 1. 의존성 확인
        if (!checkDependencies()) {
            throw new Error('필수 의존성이 누락되었습니다');
        }
        
        // 2. 코어 모듈 초기화
        await initializeCoreModules();
        
        // 3. UI 이벤트 리스너 등록
        setupEventListeners();
        
        // 4. Eagle API 연결
        await initializeEagleIntegration();
        
        // 5. 초기화 완료
        modulesInitialized = true;
        console.log('✅ 플러그인 초기화 완료');
        
        // 사용자에게 초기화 완료 알림
        if (uiController) {
            uiController.showNotification('플러그인이 준비되었습니다', 'success');
        }
        
    } catch (error) {
        console.error('❌ 플러그인 초기화 실패:', error);
        
        if (errorHandler) {
            await errorHandler.handleError(error, 'plugin_init', {
                level: 'error',
                shouldNotify: true
            });
        }
        
        // 초기화 실패 시 기본 에러 표시
        alert('플러그인 초기화에 실패했습니다. 페이지를 새로고침해주세요.');
    }
}

/**
 * 의존성 확인
 */
function checkDependencies() {
    const requiredModules = [
        'StateManager',
        'UIController', 
        'ErrorHandler',
        'ProgressManager',
        'PluginWatchdog'
    ];
    
    // 기본 모듈들 확인
    for (const moduleName of requiredModules) {
        if (typeof window[moduleName] !== 'function') {
            console.error(`❌ 필수 모듈 누락: ${moduleName}`);
            return false;
        }
    }
    
    // VideoProcessor 확인 (존재 여부만 확인)
    if (!window.VideoProcessor) {
        console.error(`❌ VideoProcessor 모듈 누락`);
        return false;
    }
    
    console.log('✅ 모든 의존성 확인 완료');
    return true;
}

/**
 * 코어 모듈 초기화
 */
async function initializeCoreModules() {
    try {
        // 1. StateManager 초기화
        stateManager = new StateManager();
        console.log('✅ StateManager 초기화 완료');
        
        // 2. UIController 초기화
        uiController = new UIController(stateManager);
        console.log('✅ UIController 초기화 완료');
        
        // 3. ErrorHandler 초기화
        errorHandler = new ErrorHandler(uiController);
        console.log('✅ ErrorHandler 초기화 완료');
        
        // 4. ProgressManager 초기화
        progressManager = new ProgressManager(uiController);
        progressManager.setupVideoProcessingStages();
        console.log('✅ ProgressManager 초기화 완료');
        
        // 5. EagleIntegration 초기화
        if (typeof window.EagleIntegration === 'function') {
            eagleIntegration = new EagleIntegration(stateManager, uiController, errorHandler);
            console.log('✅ EagleIntegration 초기화 완료');
        }
        
        // 6. FileService 초기화
        if (typeof window.FileService === 'function') {
            fileService = new FileService(stateManager, uiController, errorHandler, eagleIntegration);
            console.log('✅ FileService 초기화 완료');
        }
        
        // 7. SettingsManager 초기화
        if (typeof window.SettingsManager === 'function') {
            settingsManager = new SettingsManager(stateManager, uiController);
            console.log('✅ SettingsManager 초기화 완료');
        }
        
        // 8. FFmpegManager 초기화
        if (typeof window.FFmpegManager === 'function') {
            ffmpegManager = new FFmpegManager();
            await ffmpegManager.initialize();
            console.log('✅ FFmpegManager 초기화 완료');
        }
        
        // 9. PluginWatchdog 초기화 (마지막에 초기화)
        if (!window.pluginWatchdog) {
            window.pluginWatchdog = new PluginWatchdog(stateManager, uiController);
            console.log('✅ PluginWatchdog 초기화 완료');
        }
        
        // 10. 에러 핸들러 콜백 등록
        setupErrorHandlers();
        
        // 11. 호환성 함수들 설정
        setupCompatibilityFunctions();
        
    } catch (error) {
        console.error('코어 모듈 초기화 실패:', error);
        throw error;
    }
}

/**
 * 에러 핸들러 콜백 설정
 */
function setupErrorHandlers() {
    // 비디오 처리 에러 핸들러
    errorHandler.onError('video_processing', async (errorInfo) => {
        console.log('비디오 처리 에러 처리:', errorInfo);
        
        // 처리 중 상태 해제
        stateManager.setProcessing(false);
        
        // 진행률 취소
        if (progressManager) {
            progressManager.cancel('처리 중 오류 발생');
        }
    });
    
    // Eagle 연결 에러 핸들러
    errorHandler.onError('eagle_connection', async (errorInfo) => {
        console.log('Eagle 연결 에러 처리:', errorInfo);
        
        // Eagle 연결 상태 업데이트
        stateManager.setEagleReady(false);
        
        // 재연결 시도
        setTimeout(async () => {
            try {
                await initializeEagleIntegration();
            } catch (reconnectError) {
                console.error('Eagle 재연결 실패:', reconnectError);
            }
        }, 5000);
    });
    
    // 파일 시스템 에러 핸들러
    errorHandler.onError('file_system', async (errorInfo) => {
        console.log('파일 시스템 에러 처리:', errorInfo);
        
        // 파일 선택 상태 리셋
        stateManager.resetFileSelection();
    });
}

/**
 * 이벤트 리스너 설정
 */
function setupEventListeners() {
    // DOM 요소 확인
    const elements = stateManager.getElements();
    
    // 파일 선택 버튼
    if (elements.selectFileBtn) {
        elements.selectFileBtn.addEventListener('click', handleFileSelection);
    }
    
    // 비디오 추가 버튼
    if (elements.addVideoBtn) {
        elements.addVideoBtn.addEventListener('click', handleAddVideo);
    }
    
    // 처리 버튼들
    if (elements.processBtn) {
        elements.processBtn.addEventListener('click', () => handleProcessing('all'));
    }
    
    if (elements.extractFramesBtn) {
        elements.extractFramesBtn.addEventListener('click', () => handleProcessing('frames'));
    }
    
    if (elements.extractClipsBtn) {
        elements.extractClipsBtn.addEventListener('click', () => handleProcessing('clips'));
    }
    
    if (elements.concatVideosBtn) {
        elements.concatVideosBtn.addEventListener('click', () => handleProcessing('concat'));
    }
    
    // 설정 변경 리스너
    setupSettingsListeners();
    
    // 실시간 감지 토글
    if (elements.realtimeToggle) {
        elements.realtimeToggle.addEventListener('change', handleRealtimeToggle);
    }
    
    // 키보드 단축키
    setupKeyboardShortcuts();
    
    console.log('✅ 이벤트 리스너 설정 완료');
}

/**
 * 설정 변경 리스너 설정
 */
function setupSettingsListeners() {
    const elements = stateManager.getElements();
    
    // 민감도 슬라이더
    if (elements.sensitivitySlider) {
        elements.sensitivitySlider.addEventListener('input', updateSensitivityValue);
    }
    
    // 품질 슬라이더
    if (elements.qualitySlider) {
        elements.qualitySlider.addEventListener('input', updateQualityValue);
    }
    
    // 핸들 슬라이더들
    if (elements.inHandleSlider) {
        elements.inHandleSlider.addEventListener('input', updateInHandleValue);
    }
    
    if (elements.outHandleSlider) {
        elements.outHandleSlider.addEventListener('input', updateOutHandleValue);
    }
}

/**
 * 키보드 단축키 설정
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // Cmd/Ctrl + Shift + V: 빠른 클립 추출
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'V') {
            event.preventDefault();
            if (!stateManager.isProcessing()) {
                handleProcessing('clips');
            }
        }
        
        // Cmd/Ctrl + Shift + F: 빠른 프레임 추출
        if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'F') {
            event.preventDefault();
            if (!stateManager.isProcessing()) {
                handleProcessing('frames');
            }
        }
    });
}

/**
 * Eagle 통합 초기화
 */
async function initializeEagleIntegration() {
    try {
        console.log('🦅 Eagle 통합 초기화 시작...');
        
        if (eagleIntegration) {
            // 새로운 EagleIntegration 모듈 사용
            const eagleReady = await eagleIntegration.initialize();
            
            if (eagleReady) {
                console.log('✅ Eagle 통합 초기화 완료');
            } else {
                console.warn('⚠️ Eagle API 연결 실패');
            }
        } else {
            // 폴백: 기존 방식 사용
            const eagleReady = await checkEagleAPI();
            stateManager.setEagleReady(eagleReady);
            
            if (eagleReady) {
                // 자동 파일 감지 시작
                setTimeout(autoDetectSelectedFile, 1000);
                console.log('✅ Eagle 통합 초기화 완료 (폴백 모드)');
            } else {
                console.warn('⚠️ Eagle API 연결 실패');
            }
        }
        
    } catch (error) {
        console.error('Eagle 통합 초기화 실패:', error);
        
        if (errorHandler) {
            await errorHandler.handleError(error, 'eagle_connection', {
                level: 'warning',
                shouldNotify: true
            });
        }
    }
}

// ===========================
// 이벤트 핸들러
// ===========================

/**
 * 파일 선택 처리
 */
async function handleFileSelection() {
    try {
        console.log('📁 파일 선택 처리 시작...');
        console.log('🔍 현재 상태:', {
            fileService: !!fileService,
            eagleIntegration: !!eagleIntegration,
            isEagleReady: eagleIntegration?.isEagleReady,
            stateManagerEagleReady: stateManager?.isEagleReady(),
            selectedFiles: stateManager?.getSelectedFiles()?.length || 0
        });
        
        if (fileService) {
            // 새로운 FileService 모듈 사용
            console.log('📁 FileService로 파일 선택 시도...');
            const success = await fileService.selectFiles();
            
            if (success) {
                console.log('✅ 파일 선택 성공');
                const selectedFiles = stateManager.getSelectedFiles();
                console.log('📊 선택된 파일 확인:', selectedFiles.length, '개');
                
                if (selectedFiles.length > 0) {
                    console.log('✅ 파일 선택 상태 업데이트 완료');
                } else {
                    console.warn('⚠️ 파일 선택 성공했지만 상태 업데이트 실패');
                }
            } else {
                console.log('⚠️ 파일 선택 실패 또는 취소');
            }
        } else if (eagleIntegration && eagleIntegration.isEagleReady) {
            // 폴백: EagleIntegration 직접 사용
            console.log('📁 EagleIntegration으로 파일 선택 폴백...');
            const files = await eagleIntegration.detectSelectedFiles();
            
            if (files.length === 0) {
                await eagleIntegration.showFileSelector();
            }
        } else if (stateManager.isEagleReady()) {
            // 폴백: 기존 파일 선택 로직 호출
            console.log('📁 기존 selectVideoFile 폴백...');
            await selectVideoFile();
        } else {
            console.warn('📁 Eagle 연결 없음');
            uiController.showNotification('Eagle이 연결되지 않았습니다', 'warning');
            return;
        }
        
    } catch (error) {
        console.error('파일 선택 실패:', error);
        
        if (errorHandler) {
            await errorHandler.handleError(error, 'file_selection', {
                level: 'error',
                shouldNotify: true
            });
        }
    }
}

/**
 * 비디오 처리 처리
 */
async function handleProcessing(mode) {
    try {
        console.log(`🎬 ${mode} 처리 요청...`);
        
        if (stateManager.isProcessing()) {
            uiController.showNotification('이미 처리 중입니다', 'warning');
            return;
        }
        
        const files = stateManager.getSelectedFiles();
        console.log('🔍 파일 상태 확인:', {
            selectedFilesCount: files.length,
            files: files.map(f => ({ name: f.name, path: f.path }))
        });
        
        if (files.length === 0) {
            console.warn('⚠️ 선택된 파일이 없음 - 파일 선택 가이드 표시');
            uiController.showNotification('처리할 파일을 선택해주세요', 'warning');
            return;
        }
        
        // 병합 모드 특별 처리
        if (mode === 'concat') {
            if (files.length < 2) {
                console.warn('⚠️ 병합을 위해 2개 이상의 파일 필요');
                uiController.showNotification('병합을 위해 2개 이상의 비디오를 선택해주세요', 'warning');
                return;
            }
            
            // 다중 비디오 병합 처리
            await processMultipleVideos(files, mode);
            return;
        }
        
        console.log(`🎬 ${mode} 처리 시작...`);
        
        // 처리 상태 설정
        stateManager.setProcessing(true);
        
        // 진행률 시작
        progressManager.start(`${mode} 처리 시작...`);
        
        // 실제 처리 로직 호출
        const results = await processVideo(mode);
        
        // 결과 표시
        uiController.showResults(results);
        
        // 진행률 완료
        progressManager.complete('처리 완료');
        
        // 성공 알림
        uiController.showNotification('처리가 완료되었습니다', 'success');
        
    } catch (error) {
        console.error('비디오 처리 실패:', error);
        
        if (errorHandler) {
            await errorHandler.handleError(error, 'video_processing', {
                level: 'error',
                shouldNotify: true
            });
        }
    } finally {
        stateManager.setProcessing(false);
    }
}

/**
 * 실시간 감지 토글 처리
 */
function handleRealtimeToggle(event) {
    const enabled = event.target.checked;
    
    try {
        if (eagleIntegration) {
            // 새로운 EagleIntegration 모듈 사용
            if (enabled) {
                eagleIntegration.startRealtimeDetection();
            } else {
                eagleIntegration.stopRealtimeDetection();
            }
        } else {
            // 폴백: 기존 함수 사용
            if (enabled) {
                startRealtimeDetection();
            } else {
                stopRealtimeDetection();
            }
        }
        
        stateManager.setRealtimeDetectionEnabled(enabled);
        
    } catch (error) {
        console.error('실시간 감지 토글 실패:', error);
        
        if (errorHandler) {
            errorHandler.handleError(error, 'realtime_detection', {
                level: 'warning',
                shouldNotify: true
            });
        }
    }
}

// ===========================
// 설정 업데이트 함수들
// ===========================

function updateSensitivityValue() {
    if (settingsManager) {
        settingsManager.updateSensitivityValue();
    } else {
        // 폴백: 직접 업데이트
        const elements = stateManager.getElements();
        if (elements.sensitivitySlider && elements.sensitivityValue) {
            elements.sensitivityValue.textContent = elements.sensitivitySlider.value;
        }
    }
}

function updateQualityValue() {
    if (settingsManager) {
        settingsManager.updateQualityValue();
    } else {
        // 폴백: 직접 업데이트
        const elements = stateManager.getElements();
        if (elements.qualitySlider && elements.qualityValue) {
            elements.qualityValue.textContent = elements.qualitySlider.value;
        }
    }
}

function updateInHandleValue() {
    if (settingsManager) {
        settingsManager.updateInHandleValue();
    } else {
        // 폴백: 직접 업데이트
        const elements = stateManager.getElements();
        if (elements.inHandleSlider && elements.inHandleValue) {
            elements.inHandleValue.textContent = `+${elements.inHandleSlider.value}`;
        }
    }
}

function updateOutHandleValue() {
    if (settingsManager) {
        settingsManager.updateOutHandleValue();
    } else {
        // 폴백: 직접 업데이트
        const elements = stateManager.getElements();
        if (elements.outHandleSlider && elements.outHandleValue) {
            elements.outHandleValue.textContent = `-${elements.outHandleSlider.value}`;
        }
    }
}

// ===========================
// 기존 함수들 (임시 래퍼)
// ===========================

// 기존 함수들을 새로운 모듈 시스템과 연결하는 래퍼 함수들
// 실제 구현은 기존 main.js에서 가져와야 함

async function checkEagleAPI() {
    // 새로운 EagleIntegration 모듈을 통한 Eagle API 체크
    if (eagleIntegration) {
        try {
            // EagleIntegration의 현재 상태 확인
            if (eagleIntegration.isEagleReady) {
                console.log('✅ Eagle API 연결 확인됨 (EagleIntegration)');
                return true;
            }
            
            // 초기화되지 않은 경우 재초기화 시도
            console.log('🔄 Eagle API 재초기화 시도...');
            const result = await eagleIntegration.initialize();
            
            if (result) {
                console.log('✅ Eagle API 재초기화 성공');
                return true;
            } else {
                console.warn('⚠️ Eagle API 재초기화 실패');
                return false;
            }
            
        } catch (error) {
            console.error('Eagle API 체크 중 오류:', error);
            return false;
        }
    }
    
    // 폴백: 기존 함수 사용
    if (typeof window.checkEagleAPI_Original === 'function') {
        console.log('📁 폴백: 기존 checkEagleAPI 함수 사용');
        return await window.checkEagleAPI_Original();
    }
    
    // 최종 폴백: 직접 Eagle 객체 확인
    const isAvailable = typeof eagle !== 'undefined';
    console.log(`🦅 Eagle API 직접 체크: ${isAvailable ? '사용 가능' : '사용 불가'}`);
    return isAvailable;
}

async function selectVideoFile() {
    // 새로운 FileService 우선 사용
    if (fileService) {
        try {
            console.log('📁 새로운 FileService로 파일 선택...');
            return await fileService.selectFiles();
        } catch (error) {
            console.error('FileService 파일 선택 실패:', error);
            // 폴백으로 기존 함수 시도
        }
    }
    
    // 폴백: 기존 selectVideoFile 함수 호출 (main.js에서)
    if (typeof window.selectVideoFile_Original === 'function') {
        console.log('📁 폴백: 기존 selectVideoFile 함수 사용');
        return await window.selectVideoFile_Original();
    }
    
    // 최종 폴백: 간단한 구현
    try {
        if (stateManager && stateManager.isEagleReady()) {
            console.log('📁 최종 폴백: 간단한 파일 선택...');
            uiController.showNotification('Eagle 라이브러리에서 비디오 파일을 선택해주세요.', 'info');
        } else {
            uiController.showNotification('Eagle이 연결되지 않았습니다', 'warning');
        }
    } catch (error) {
        console.error('파일 선택 실패:', error);
    }
}

async function processVideo(mode) {
    // 새로운 VideoProcessor를 사용한 처리
    try {
        if (!window.videoProcessor) {
            // VideoProcessor 인스턴스 생성
            if (window.VideoProcessor) {
                // VideoProcessor가 클래스인 경우
                if (typeof window.VideoProcessor === 'function') {
                    console.log('📽️ VideoProcessor 클래스로 새 인스턴스 생성...');
                    window.videoProcessor = new window.VideoProcessor(
                        stateManager,
                        uiController,
                        errorHandler,
                        progressManager
                    );
                } 
                // VideoProcessor가 이미 인스턴스인 경우
                else if (typeof window.VideoProcessor === 'object') {
                    console.warn('VideoProcessor가 인스턴스로 등록되어 있습니다. 클래스를 재정의합니다.');
                    // VideoProcessor를 직접 사용 (이미 인스턴스일 수 있음)
                    if (window.VideoProcessor.processVideo && typeof window.VideoProcessor.processVideo === 'function') {
                        window.videoProcessor = window.VideoProcessor;
                        console.log('✅ 기존 VideoProcessor 인스턴스 사용');
                    } else {
                        // 클래스를 재로드하여 새 인스턴스 생성
                        console.warn('⚠️ VideoProcessor 인스턴스 생성 실패, 폴백 사용');
                        throw new Error('VideoProcessor 인스턴스 생성 실패');
                    }
                }
                
                // 초기화 (초기화 함수가 있는 경우에만)
                if (typeof window.videoProcessor.initialize === 'function') {
                    const initialized = await window.videoProcessor.initialize();
                    if (!initialized) {
                        throw new Error('VideoProcessor 초기화 실패');
                    }
                    console.log('✅ VideoProcessor 초기화 완료');
                } else {
                    console.log('✅ VideoProcessor 준비 완료 (초기화 불필요)');
                }
            } else {
                throw new Error('VideoProcessor 모듈을 찾을 수 없습니다');
            }
        }
        
        // 비디오 처리 실행
        return await window.videoProcessor.processVideo(mode);
        
    } catch (error) {
        console.error('VideoProcessor를 사용한 처리 실패:', error);
        
        // 폴백: 기존 processVideo 함수 호출
        if (typeof window.processVideo_Original === 'function') {
            console.log('폴백: 기존 processVideo 함수 사용');
            return await window.processVideo_Original(mode);
        }
        
        throw error;
    }
}

/**
 * 비디오 추가 처리
 */
async function handleAddVideo() {
    try {
        console.log('📝 비디오 추가 처리 시작...');
        
        if (fileService) {
            const success = await fileService.addVideoToList();
            
            if (success) {
                console.log('✅ 비디오 추가 성공');
                const selectedFiles = stateManager.getSelectedFiles();
                console.log('📊 현재 선택된 파일:', selectedFiles.length, '개');
            } else {
                console.log('⚠️ 비디오 추가 실패 또는 취소');
            }
        } else {
            console.warn('⚠️ FileService가 초기화되지 않았습니다');
            uiController.showNotification('FileService가 초기화되지 않았습니다', 'error');
        }
        
    } catch (error) {
        console.error('비디오 추가 실패:', error);
        
        if (errorHandler) {
            await errorHandler.handleError(error, 'add_video', {
                level: 'error',
                shouldNotify: true
            });
        }
    }
}

/**
 * 다중 비디오 처리 (병합)
 */
async function processMultipleVideos(files, mode) {
    try {
        console.log(`🎬 다중 비디오 처리 시작: ${files.length}개 파일 (모드: ${mode})`);
        
        // 처리 상태 설정
        stateManager.setProcessing(true);
        
        // 진행률 시작
        progressManager.start(`${files.length}개 비디오 ${mode} 처리 시작...`);
        
        let result;
        
        if (window.videoProcessor) {
            // 기존 VideoProcessor 인스턴스 사용
            result = await window.videoProcessor.processMultipleVideos(files, mode);
        } else if (window.VideoProcessor) {
            // 새로운 VideoProcessor 인스턴스 생성
            const processor = new VideoProcessor(stateManager, uiController, errorHandler, progressManager);
            await processor.initialize();
            result = await processor.processMultipleVideos(files, mode);
        } else {
            throw new Error('VideoProcessor를 사용할 수 없습니다');
        }
        
        // 성공 알림
        const message = mode === 'concat' ? 
            `${files.length}개 비디오 병합 완료` :
            `다중 비디오 처리 완료`;
            
        uiController.showNotification(message, 'success');
        
        console.log('✅ 다중 비디오 처리 완료:', result);
        
        // 처리 완료
        stateManager.setProcessing(false);
        
    } catch (error) {
        console.error('다중 비디오 처리 실패:', error);
        
        if (errorHandler) {
            await errorHandler.handleError(error, 'multi_video_processing', {
                level: 'error',
                shouldNotify: true
            });
        }
        
        uiController.showNotification('다중 비디오 처리에 실패했습니다', 'error');
        
        // 처리 상태 해제
        stateManager.setProcessing(false);
        progressManager.cancel('다중 비디오 처리 실패');
    }
}

async function autoDetectSelectedFile() {
    // 새로운 EagleIntegration 모듈을 통한 자동 파일 감지
    if (eagleIntegration && eagleIntegration.isEagleReady) {
        try {
            console.log('🔍 새로운 모듈로 파일 자동 감지 시작...');
            
            // EagleIntegration을 통해 선택된 파일 감지
            const detectedFiles = await eagleIntegration.detectSelectedFiles();
            
            if (detectedFiles.length > 0) {
                console.log(`✅ ${detectedFiles.length}개 파일 자동 감지됨`);
                
                // FileService를 통해 파일 검증 및 상태 업데이트
                if (fileService) {
                    const validatedFiles = await fileService.validateFiles(detectedFiles);
                    const filesWithPaths = await fileService.resolveFilePaths(validatedFiles);
                    
                    if (filesWithPaths.length > 0) {
                        fileService.updateFileSelection(filesWithPaths);
                        console.log(`🎯 ${filesWithPaths.length}개 유효한 파일로 상태 업데이트`);
                        return filesWithPaths;
                    }
                }
                
                return detectedFiles;
            } else {
                console.log('📭 감지된 파일 없음');
                return [];
            }
            
        } catch (error) {
            console.error('새로운 모듈 자동 감지 실패:', error);
            // 폴백으로 기존 함수 시도
        }
    }
    
    // 폴백: 기존 autoDetectSelectedFile 함수 호출
    if (typeof window.autoDetectSelectedFile_Original === 'function') {
        console.log('📁 폴백: 기존 autoDetectSelectedFile 함수 사용');
        return await window.autoDetectSelectedFile_Original();
    }
    
    // 최종 폴백: 간단한 구현
    try {
        if (stateManager && stateManager.isEagleReady()) {
            console.log('🔍 최종 폴백: 간단한 파일 감지...');
            // Eagle API 직접 호출 시도
            if (typeof eagle !== 'undefined' && eagle.item && eagle.item.getSelected) {
                const selectedItems = await eagle.item.getSelected();
                const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'm4v'];
                const videoFiles = selectedItems.filter(item => 
                    videoExtensions.includes(item.ext.toLowerCase())
                );
                
                if (videoFiles.length > 0) {
                    console.log(`📹 직접 감지: ${videoFiles.length}개 비디오 파일`);
                    return videoFiles;
                }
            }
        }
    } catch (error) {
        console.error('최종 폴백 자동 감지 실패:', error);
    }
    
    return [];
}

function startRealtimeDetection() {
    // 새로운 EagleIntegration 모듈을 통한 실시간 감지 시작
    if (eagleIntegration) {
        try {
            console.log('📸 새로운 모듈로 실시간 감지 시작...');
            eagleIntegration.startRealtimeDetection();
            
            // 상태 동기화
            if (stateManager) {
                stateManager.setRealtimeDetectionEnabled(true);
            }
            
            console.log('✅ 실시간 감지 시작 완료 (새 모듈)');
            return true;
            
        } catch (error) {
            console.error('새로운 모듈 실시간 감지 시작 실패:', error);
            // 폴백으로 기존 함수 시도
        }
    }
    
    // 폴백: 기존 startRealtimeDetection 함수 호출
    if (typeof window.startRealtimeDetection_Original === 'function') {
        console.log('📁 폴백: 기존 startRealtimeDetection 함수 사용');
        return window.startRealtimeDetection_Original();
    }
    
    // 최종 폴백: 간단한 구현
    console.warn('⚠️ 실시간 감지를 시작할 수 없습니다. 모듈이 준비되지 않았습니다.');
    return false;
}

function stopRealtimeDetection() {
    // 새로운 EagleIntegration 모듈을 통한 실시간 감지 중지
    if (eagleIntegration) {
        try {
            console.log('⏹️ 새로운 모듈로 실시간 감지 중지...');
            eagleIntegration.stopRealtimeDetection();
            
            // 상태 동기화
            if (stateManager) {
                stateManager.setRealtimeDetectionEnabled(false);
            }
            
            console.log('✅ 실시간 감지 중지 완료 (새 모듈)');
            return true;
            
        } catch (error) {
            console.error('새로운 모듈 실시간 감지 중지 실패:', error);
            // 폴백으로 기존 함수 시도
        }
    }
    
    // 폴백: 기존 stopRealtimeDetection 함수 호출
    if (typeof window.stopRealtimeDetection_Original === 'function') {
        console.log('📁 폴백: 기존 stopRealtimeDetection 함수 사용');
        return window.stopRealtimeDetection_Original();
    }
    
    // 최종 폴백: 간단한 구현
    console.warn('⚠️ 실시간 감지를 중지할 수 없습니다. 모듈이 준비되지 않았습니다.');
    return false;
}

// ===========================
// 호환성 함수들 설정
// ===========================

/**
 * main.js 호환성을 위한 전역 함수들 설정
 */
function setupCompatibilityFunctions() {
    try {
        console.log('🔧 호환성 함수들 설정 중...');
        
        // main.js에서 사용되던 전역 함수들을 새로운 모듈로 연결
        
        // FFmpeg 관련 함수들
        window.getFFmpegPaths = async () => {
            if (ffmpegManager) {
                return ffmpegManager.getFFmpegPaths();
            }
            return { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };
        };
        
        window.checkFFmpegDependency = async () => {
            if (ffmpegManager) {
                const result = await ffmpegManager.checkDependency();
                return result.isAvailable;
            }
            return true; // 낙관적 기본값
        };
        
        // 설정 관련 함수들
        window.collectSettings = () => {
            if (settingsManager) {
                return settingsManager.readFromUI();
            }
            return {}; // 빈 설정 객체
        };
        
        // UI 업데이트 함수들
        window.updateUI = () => {
            if (uiController) {
                // UI 상태 동기화
                const files = stateManager.getSelectedFiles();
                if (eagleIntegration && typeof eagleIntegration.updateSelectionUI === 'function') {
                    eagleIntegration.updateSelectionUI(files);
                }
            }
        };
        
        // 알림 함수들
        window.showNotification = (message, type = 'info') => {
            if (uiController) {
                uiController.showNotification(message, type);
            } else {
                console.log(`[${type.toUpperCase()}] ${message}`);
            }
        };
        
        window.showProgress = (percent, message) => {
            if (progressManager) {
                progressManager.updateProgress(percent, message);
            } else {
                console.log(`진행률: ${(percent * 100).toFixed(1)}% - ${message}`);
            }
        };
        
        // 결과 표시 함수
        window.showResults = (results) => {
            if (uiController) {
                uiController.showResults(results);
            } else {
                console.log('처리 결과:', results);
            }
        };
        
        // Eagle 관련 함수들
        window.refreshEagleLibrary = async () => {
            if (eagleIntegration) {
                return await eagleIntegration.refreshLibrary();
            }
            return false;
        };
        
        // 상태 관리 함수들
        window.resetProcessingState = () => {
            if (stateManager) {
                stateManager.resetProcessingState();
            }
        };
        
        // 모듈 상태 확인 함수들
        window.checkModulesLoaded = () => {
            return modulesInitialized;
        };
        
        // VideoProcessor 클래스를 보호하고 전역 함수들만 노출
        // VideoProcessor 클래스는 모듈에서 이미 정의되었으므로 덮어쓰지 않음
        
        console.log('✅ 호환성 함수들 설정 완료');
        
    } catch (error) {
        console.error('❌ 호환성 함수 설정 실패:', error);
    }
}

// ===========================
// 전역 접근자 함수들
// ===========================

// 다른 모듈에서 접근할 수 있도록 전역 함수로 노출
window.getStateManager = () => stateManager;
window.getUIController = () => uiController;
window.getErrorHandler = () => errorHandler;
window.getProgressManager = () => progressManager;
window.getPluginWatchdog = () => pluginWatchdog;
window.getEagleIntegration = () => eagleIntegration;
window.getFileService = () => fileService;
window.getSettingsManager = () => settingsManager;

// 호환성을 위한 전역 AppState 객체
window.AppState = {
    get isProcessing() { return stateManager?.isProcessing() || false; },
    get isEagleReady() { return stateManager?.isEagleReady() || false; },
    get selectedFiles() { return stateManager?.getSelectedFiles() || []; },
    get currentVideoFile() { return stateManager?.getCurrentVideoFile() || null; },
    get elements() { return stateManager?.getElements() || {}; }
};

// ===========================
// 독립성 테스트 함수
// ===========================

/**
 * main.js 없이 독립 실행 테스트
 */
window.testIndependentOperation = async function() {
    console.log('🧪 main.js 독립성 테스트 시작...');
    
    const testResults = {
        moduleLoading: false,
        coreModules: false,
        uiBinding: false,
        eagleConnection: false,
        fileSelection: false,
        videoProcessing: false,
        errorHandling: false,
        overall: false
    };
    
    try {
        // 1. 모듈 로딩 테스트
        console.log('🔍 1. 모듈 로딩 테스트...');
        const requiredModules = [
            'StateManager', 'UIController', 'ErrorHandler', 'ProgressManager',
            'PluginWatchdog', 'VideoProcessor', 'EagleIntegration', 
            'FileService', 'SettingsManager', 'FFmpegManager'
        ];
        
        const loadedModules = requiredModules.filter(module => typeof window[module] === 'function');
        testResults.moduleLoading = loadedModules.length === requiredModules.length;
        
        console.log(`📦 모듈 로딩: ${loadedModules.length}/${requiredModules.length} - ${testResults.moduleLoading ? '✅ 성공' : '❌ 실패'}`);
        if (!testResults.moduleLoading) {
            console.warn('누락된 모듈:', requiredModules.filter(m => typeof window[m] !== 'function'));
        }
        
        // 2. 코어 모듈 인스턴스 테스트
        console.log('🔍 2. 코어 모듈 인스턴스 테스트...');
        const coreInstances = {
            stateManager: !!stateManager,
            uiController: !!uiController,
            errorHandler: !!errorHandler,
            progressManager: !!progressManager,
            eagleIntegration: !!eagleIntegration,
            fileService: !!fileService,
            settingsManager: !!settingsManager,
            ffmpegManager: !!ffmpegManager
        };
        
        const activeInstances = Object.values(coreInstances).filter(Boolean).length;
        testResults.coreModules = activeInstances >= 7; // 최소 7개 모듈 필요
        
        console.log(`🏗️ 코어 모듈 인스턴스: ${activeInstances}/8 - ${testResults.coreModules ? '✅ 성공' : '❌ 실패'}`);
        console.log('인스턴스 상태:', coreInstances);
        
        // 3. UI 바인딩 테스트
        console.log('🔍 3. UI 바인딩 테스트...');
        const elements = stateManager?.getElements() || {};
        const requiredElements = [
            'selectFileBtn', 'processBtn', 'extractFramesBtn', 'extractClipsBtn',
            'sensitivitySlider', 'formatSelect', 'qualitySlider'
        ];
        
        const boundElements = requiredElements.filter(id => elements[id]).length;
        testResults.uiBinding = boundElements >= requiredElements.length * 0.8; // 80% 이상
        
        console.log(`🎨 UI 바인딩: ${boundElements}/${requiredElements.length} - ${testResults.uiBinding ? '✅ 성공' : '❌ 실패'}`);
        if (!testResults.uiBinding) {
            console.warn('누락된 요소:', requiredElements.filter(id => !elements[id]));
        }
        
        // 4. Eagle 연결 테스트
        console.log('🔍 4. Eagle API 연결 테스트...');
        try {
            if (eagleIntegration) {
                const eagleStatus = await eagleIntegration.checkEagleAPI();
                testResults.eagleConnection = eagleStatus;
                console.log(`🦅 Eagle 연결: ${eagleStatus ? '✅ 성공' : '❌ 실패'}`);
            } else {
                console.log('🦅 Eagle 연결: ❌ EagleIntegration 모듈 없음');
            }
        } catch (error) {
            console.log('🦅 Eagle 연결: ❌ 연결 테스트 실패', error.message);
        }
        
        // 5. 파일 선택 기능 테스트
        console.log('🔍 5. 파일 선택 기능 테스트...');
        try {
            if (fileService) {
                const selectionStatus = fileService.getStatus();
                testResults.fileSelection = typeof selectionStatus === 'object' && 
                                           selectionStatus.supportedExtensions?.length > 0;
                console.log(`📁 파일 선택: ${testResults.fileSelection ? '✅ 성공' : '❌ 실패'}`);
                console.log('지원 형식:', selectionStatus.supportedExtensions?.slice(0, 5));
            } else {
                console.log('📁 파일 선택: ❌ FileService 모듈 없음');
            }
        } catch (error) {
            console.log('📁 파일 선택: ❌ 테스트 실패', error.message);
        }
        
        // 6. 비디오 처리 모듈 테스트
        console.log('🔍 6. 비디오 처리 모듈 테스트...');
        try {
            const videoModules = [
                'VideoAnalyzer', 'FrameExtractor', 'ClipExtractor', 
                'EagleImporter', 'VideoProcessor'
            ];
            
            const availableVideoModules = videoModules.filter(module => 
                typeof window[module] === 'function' || typeof window[module] === 'object'
            );
            
            testResults.videoProcessing = availableVideoModules.length >= 4;
            console.log(`🎬 비디오 처리: ${availableVideoModules.length}/${videoModules.length} - ${testResults.videoProcessing ? '✅ 성공' : '❌ 실패'}`);
            console.log('사용 가능한 모듈:', availableVideoModules);
        } catch (error) {
            console.log('🎬 비디오 처리: ❌ 테스트 실패', error.message);
        }
        
        // 7. 에러 핸들링 테스트
        console.log('🔍 7. 에러 핸들링 테스트...');
        try {
            if (errorHandler) {
                // 테스트 에러 발생 및 처리
                const testError = new Error('독립성 테스트 에러');
                await errorHandler.handleError(testError, 'independence_test', {
                    level: 'info',
                    shouldNotify: false
                });
                testResults.errorHandling = true;
                console.log('❌ 에러 핸들링: ✅ 성공');
            } else {
                console.log('❌ 에러 핸들링: ❌ ErrorHandler 모듈 없음');
            }
        } catch (error) {
            console.log('❌ 에러 핸들링: ❌ 테스트 실패', error.message);
        }
        
        // 전체 결과 평가
        const passedTests = Object.values(testResults).filter(Boolean).length;
        const totalTests = Object.keys(testResults).length - 1; // overall 제외
        testResults.overall = passedTests >= totalTests * 0.8; // 80% 이상 통과
        
        console.log('\n📊 === 독립성 테스트 결과 ===');
        console.log(`전체: ${passedTests}/${totalTests} 테스트 통과`);
        console.log('세부 결과:');
        Object.entries(testResults).forEach(([test, passed]) => {
            if (test !== 'overall') {
                console.log(`  ${test}: ${passed ? '✅' : '❌'}`);
            }
        });
        
        if (testResults.overall) {
            console.log('\n🎉 main.js 독립성 테스트 통과! 모듈이 성공적으로 독립 실행됩니다.');
            
            // 사용자에게 알림
            if (uiController) {
                uiController.showNotification('독립성 테스트 통과! 모듈이 정상 작동합니다.', 'success');
            }
        } else {
            console.log('\n⚠️ 일부 테스트가 실패했습니다. 모듈 의존성을 확인해주세요.');
            
            if (uiController) {
                uiController.showNotification('일부 기능에 문제가 있습니다. 콘솔을 확인해주세요.', 'warning');
            }
        }
        
        return testResults;
        
    } catch (error) {
        console.error('🚨 독립성 테스트 중 치명적 오류:', error);
        return { ...testResults, overall: false };
    }
};

// 호환성을 위한 전역 함수들
window.showProgress = (percent, message) => {
    if (progressManager) {
        progressManager.updateProgress(percent, message);
    }
};

window.showNotification = (message, type) => {
    if (uiController) {
        uiController.showNotification(message, type);
    }
};

// ===========================
// 초기화 시작
// ===========================

// 모듈 로드 완료를 기다린 후 초기화
function waitForModulesAndInit() {
    if (typeof window.StateManager === 'function' && 
        typeof window.UIController === 'function' && 
        typeof window.ErrorHandler === 'function' && 
        typeof window.ProgressManager === 'function' && 
        typeof window.PluginWatchdog === 'function' &&
        window.VideoProcessor) {
        
        console.log('🎯 모든 모듈이 준비됨, 초기화 시작');
        initializePlugin();
    } else {
        console.log('⏳ 모듈 로드 대기 중...');
        // 모듈 로드 완료 이벤트 대기
        window.addEventListener('modulesLoaded', () => {
            console.log('📦 모듈 로드 이벤트 수신');
            initializePlugin();
        }, { once: true });
        
        // 타임아웃으로 재시도
        setTimeout(waitForModulesAndInit, 1000);
    }
}

// DOM 로드 완료 시 모듈 대기 시작
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForModulesAndInit);
} else {
    waitForModulesAndInit();
}

// 모듈 로드 확인 함수
window.checkModulesLoaded = () => {
    return modulesInitialized;
};

// 독립성 테스트 함수
window.testIndependentOperation = async () => {
    console.log('🧪 독립 동작 테스트 시작...');
    
    const testResults = {
        moduleInitialization: false,
        eagleConnection: false,
        fileSelection: false,
        settingsManagement: false,
        ffmpegAvailability: false,
        overallSuccess: false
    };
    
    try {
        // 1. 모듈 초기화 확인
        testResults.moduleInitialization = modulesInitialized && 
            !!stateManager && !!uiController && !!errorHandler && !!progressManager;
        console.log(`📋 모듈 초기화: ${testResults.moduleInitialization ? '✅' : '❌'}`);
        
        // 2. Eagle 연결 확인
        if (eagleIntegration) {
            testResults.eagleConnection = eagleIntegration.isEagleReady;
        }
        console.log(`🦅 Eagle 연결: ${testResults.eagleConnection ? '✅' : '❌'}`);
        
        // 3. 파일 선택 기능 확인
        if (fileService) {
            const status = fileService.getStatus();
            testResults.fileSelection = status.supportedExtensions.length > 0;
        }
        console.log(`📁 파일 선택: ${testResults.fileSelection ? '✅' : '❌'}`);
        
        // 4. 설정 관리 확인
        if (settingsManager) {
            const settings = settingsManager.getSettings();
            testResults.settingsManagement = Object.keys(settings).length > 0;
        }
        console.log(`⚙️ 설정 관리: ${testResults.settingsManagement ? '✅' : '❌'}`);
        
        // 5. FFmpeg 가용성 확인 (Eagle API 방식)
        try {
            if (typeof eagle !== 'undefined' && eagle.extraModule && eagle.extraModule.ffmpeg) {
                console.log('🦅 Eagle FFmpeg API 감지됨');
                const isInstalled = await eagle.extraModule.ffmpeg.isInstalled();
                testResults.ffmpegAvailability = isInstalled;
                console.log(`🎬 Eagle FFmpeg: ${isInstalled ? '✅ 설치됨' : '⚠️ 미설치 (자동 설치 가능)'}`);
            } else if (ffmpegManager) {
                // 폴백: 기존 방식
                const dependency = await ffmpegManager.checkDependency();
                testResults.ffmpegAvailability = dependency.isAvailable;
                console.log(`🎬 FFmpeg (시스템): ${dependency.isAvailable ? '✅' : '❌'}`);
            } else {
                console.log('🎬 FFmpeg: ❌ 관리자 없음');
            }
        } catch (error) {
            console.warn('🎬 FFmpeg 테스트 오류:', error.message);
        }
        
        // 전체 성공 여부 판단
        testResults.overallSuccess = testResults.moduleInitialization && 
            testResults.fileSelection && testResults.settingsManagement;
        
        console.log(`🎯 전체 테스트 결과: ${testResults.overallSuccess ? '✅ 성공' : '❌ 실패'}`);
        
        return testResults;
        
    } catch (error) {
        console.error('❌ 독립 동작 테스트 실패:', error);
        return { ...testResults, error: error.message };
    }
};

console.log('📦 Video Processor Eagle Plugin - Refactored Main 로드 완료');