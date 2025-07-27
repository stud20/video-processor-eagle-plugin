/**
 * State Manager
 * 중앙 상태 관리 시스템
 */
class StateManager {
    constructor() {
        this.state = {
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
        
        // 상태 변경 콜백
        this.changeCallbacks = new Map();
        
        this.initializeElements();
    }
    
    /**
     * DOM 요소 초기화
     */
    initializeElements() {
        this.state.elements = {
            // 파일 선택
            selectedFile: document.getElementById('selectedFile'),
            selectFileBtn: document.getElementById('selectFileBtn'),
            addVideoBtn: document.getElementById('addVideoBtn'),
            batchInfo: document.getElementById('batchInfo'),
            batchCount: document.getElementById('batchCount'),
            batchList: document.getElementById('batchList'),
            
            // 설정 컨트롤
            sensitivitySlider: document.getElementById('sensitivitySlider'),
            sensitivityValue: document.getElementById('sensitivityValue'),
            qualitySlider: document.getElementById('qualitySlider'),
            qualityValue: document.getElementById('qualityValue'),
            formatSelect: document.getElementById('formatSelect'),
            inHandleSlider: document.getElementById('inHandleSlider'),
            inHandleValue: document.getElementById('inHandleValue'),
            outHandleSlider: document.getElementById('outHandleSlider'),
            outHandleValue: document.getElementById('outHandleValue'),
            
            // 처리 버튼
            processBtn: document.getElementById('processBtn'),
            extractFramesBtn: document.getElementById('extractFramesBtn'),
            extractClipsBtn: document.getElementById('extractClipsBtn'),
            concatVideosBtn: document.getElementById('concatVideosBtn'),
            
            // 진행률 표시
            progressSection: document.getElementById('progressSection'),
            progressBar: document.getElementById('progressBar'),
            progressFill: document.getElementById('progressFill'),
            progressText: document.getElementById('progressText'),
            
            // 배치 진행률
            batchProgress: document.getElementById('batchProgress'),
            batchProgressFill: document.getElementById('batchProgressFill'),
            batchProgressText: document.getElementById('batchProgressText'),
            
            // 결과 표시
            resultsSection: document.getElementById('resultsSection'),
            resultsContainer: document.getElementById('resultsContainer'),
            
            // 시스템 정보
            systemInfo: document.getElementById('systemInfo'),
            cacheStatus: document.getElementById('cacheStatus'),
            
            // 실시간 감지
            realtimeToggle: document.getElementById('realtimeToggle'),
            realtimeStatus: document.getElementById('realtimeStatus')
        };
    }
    
    /**
     * 상태 변경 콜백 등록
     */
    onChange(property, callback) {
        if (!this.changeCallbacks.has(property)) {
            this.changeCallbacks.set(property, []);
        }
        this.changeCallbacks.get(property).push(callback);
    }
    
    /**
     * 상태 변경 알림
     */
    notifyChange(property, oldValue, newValue) {
        if (this.changeCallbacks.has(property)) {
            this.changeCallbacks.get(property).forEach(callback => {
                try {
                    callback(newValue, oldValue);
                } catch (error) {
                    console.error(`상태 변경 콜백 오류 (${property}):`, error);
                }
            });
        }
    }
    
    // Eagle 관련 상태
    isEagleReady() {
        return this.state.isEagleReady;
    }
    
    setEagleReady(ready) {
        const oldValue = this.state.isEagleReady;
        this.state.isEagleReady = ready;
        this.notifyChange('isEagleReady', oldValue, ready);
    }
    
    // 모듈 로드 상태
    isModulesLoaded() {
        return this.state.modulesLoaded;
    }
    
    setModulesLoaded(loaded) {
        const oldValue = this.state.modulesLoaded;
        this.state.modulesLoaded = loaded;
        this.notifyChange('modulesLoaded', oldValue, loaded);
    }
    
    // 파일 선택 상태
    getSelectedFiles() {
        return this.state.selectedFiles;
    }
    
    setSelectedFiles(files) {
        const oldValue = this.state.selectedFiles;
        this.state.selectedFiles = files;
        this.notifyChange('selectedFiles', oldValue, files);
    }
    
    getCurrentVideoFile() {
        return this.state.currentVideoFile;
    }
    
    setCurrentVideoFile(file) {
        const oldValue = this.state.currentVideoFile;
        this.state.currentVideoFile = file;
        this.notifyChange('currentVideoFile', oldValue, file);
    }
    
    isBatchMode() {
        return this.state.isBatchMode;
    }
    
    setBatchMode(batchMode) {
        const oldValue = this.state.isBatchMode;
        this.state.isBatchMode = batchMode;
        this.notifyChange('isBatchMode', oldValue, batchMode);
    }
    
    // 처리 상태
    isProcessing() {
        return this.state.isProcessing;
    }
    
    setProcessing(processing) {
        const oldValue = this.state.isProcessing;
        this.state.isProcessing = processing;
        this.notifyChange('isProcessing', oldValue, processing);
    }
    
    isBatchCancelled() {
        return this.state.batchCancelled;
    }
    
    setBatchCancelled(cancelled) {
        const oldValue = this.state.batchCancelled;
        this.state.batchCancelled = cancelled;
        this.notifyChange('batchCancelled', oldValue, cancelled);
    }
    
    // 실시간 감지 상태
    getRealtimeDetection() {
        return this.state.realtimeDetection;
    }
    
    setRealtimeDetectionEnabled(enabled) {
        const oldValue = this.state.realtimeDetection.enabled;
        this.state.realtimeDetection.enabled = enabled;
        this.notifyChange('realtimeDetectionEnabled', oldValue, enabled);
    }
    
    setRealtimeDetectionInterval(interval) {
        this.state.realtimeDetection.pollingInterval = interval;
    }
    
    setLastSelectionIds(ids) {
        this.state.realtimeDetection.lastSelectionIds = ids;
    }
    
    // UI 요소 접근
    getElements() {
        return this.state.elements;
    }
    
    getElement(key) {
        return this.state.elements[key];
    }
    
    // 상태 초기화
    resetProcessingState() {
        this.setProcessing(false);
        this.setBatchCancelled(false);
        console.log('📊 처리 상태 초기화 완료');
    }
    
    resetFileSelection() {
        this.setSelectedFiles([]);
        this.setCurrentVideoFile(null);
        this.setBatchMode(false);
        console.log('📁 파일 선택 상태 초기화 완료');
    }

    /**
     * 비디오 파일을 기존 리스트에 추가
     * @param {Array} newFiles - 새로 추가할 파일들
     */
    addVideosToList(newFiles) {
        const currentFiles = this.getSelectedFiles();
        const allFiles = [...currentFiles];
        
        // 중복 제거 (경로 기준)
        newFiles.forEach(newFile => {
            const exists = allFiles.some(existing => existing.path === newFile.path);
            if (!exists) {
                allFiles.push(newFile);
            }
        });
        
        this.setSelectedFiles(allFiles);
        this.setCurrentVideoFile(allFiles[0]);
        this.setBatchMode(allFiles.length > 1);
        
        console.log(`📁 비디오 추가 완료: 기존 ${currentFiles.length}개 + 새로운 ${newFiles.length}개 = 총 ${allFiles.length}개`);
    }
    
    resetAll() {
        this.resetProcessingState();
        this.resetFileSelection();
        this.setEagleReady(false);
        this.setModulesLoaded(false);
        this.setRealtimeDetectionEnabled(false);
        console.log('🔄 전체 상태 초기화 완료');
    }
    
    // 상태 조회
    getState() {
        return { ...this.state };
    }
    
    // 디버깅용 상태 출력
    printState() {
        console.log('📊 현재 상태:', this.getState());
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StateManager;
} else {
    // 강제로 전역 스코프에 등록
    if (typeof window !== 'undefined') {
        window.StateManager = StateManager;
    }
    // Eagle 환경에서는 global 객체 사용 가능성
    if (typeof global !== 'undefined') {
        global.StateManager = StateManager;
    }
}

// 로드 확인 로그
console.log('✅ StateManager 모듈 로드됨:', typeof StateManager);
console.log('window.StateManager 등록됨:', typeof window.StateManager);

// 등록 재시도
setTimeout(() => {
    if (typeof window.StateManager === 'undefined') {
        console.log('🔄 StateManager 재등록 시도...');
        window.StateManager = StateManager;
        console.log('재등록 결과:', typeof window.StateManager);
    }
}, 100);