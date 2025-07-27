/**
 * Video Processor Module
 * 통합 비디오 처리 시스템 - VideoAnalyzer, FrameExtractor, ClipExtractor 통합 관리
 */
class VideoProcessor {
    constructor(stateManager, uiController, errorHandler, progressManager) {
        this.stateManager = stateManager;
        this.uiController = uiController;
        this.errorHandler = errorHandler;
        this.progressManager = progressManager;
        
        // 비디오 처리 모듈들
        this.analyzer = null;
        this.frameExtractor = null;
        this.clipExtractor = null;
        this.videoConcatenator = null;
        this.eagleImporter = null;
        
        // 처리 설정
        this.settings = {
            sensitivity: 0.3,
            format: 'png',
            quality: 8,
            inHandle: 3,
            outHandle: 3,
            extractionMethod: 'unified',
            duplicateHandling: 'overwrite',
            analysisFrameNaming: false,
            smartFrameSelection: true,
            targetFrameCount: 10
        };
        
        // FFmpeg 경로
        this.ffmpegPaths = null;
        
        console.log('📽️ VideoProcessor 초기화 완료');
    }
    
    /**
     * 초기화
     */
    async initialize() {
        try {
            // FFmpeg 경로 가져오기
            this.ffmpegPaths = await this.getFFmpegPaths();
            
            // 비디오 처리 모듈들 초기화
            await this.initializeModules();
            
            console.log('✅ VideoProcessor 모듈 초기화 완료');
            return true;
        } catch (error) {
            console.error('❌ VideoProcessor 초기화 실패:', error);
            await this.errorHandler.handleError(error, 'video_processor_init', {
                level: 'error',
                shouldNotify: true
            });
            return false;
        }
    }
    
    /**
     * 비디오 처리 모듈들 초기화
     */
    async initializeModules() {
        // VideoAnalyzer 초기화
        if (typeof window.VideoAnalyzer === 'function') {
            this.analyzer = new VideoAnalyzer(this.ffmpegPaths);
            if (!this.analyzer.initialized) {
                await this.analyzer.initialize();
            }
            console.log('✅ VideoAnalyzer 초기화 완료');
        } else {
            console.error('❌ VideoAnalyzer 모듈 상태:', typeof window.VideoAnalyzer, window.VideoAnalyzer);
            console.error('사용 가능한 모듈들:', Object.keys(window).filter(key => key.includes('Analyzer')));
            throw new Error('VideoAnalyzer 모듈을 찾을 수 없습니다');
        }
        
        // FrameExtractor 초기화
        if (typeof window.FrameExtractor === 'function') {
            this.frameExtractor = new FrameExtractor(this.ffmpegPaths);
            if (!this.frameExtractor.initialized) {
                await this.frameExtractor.initialize();
            }
            console.log('✅ FrameExtractor 초기화 완료');
        } else {
            console.error('❌ FrameExtractor 모듈 상태:', typeof window.FrameExtractor, window.FrameExtractor);
            console.error('사용 가능한 모듈들:', Object.keys(window).filter(key => key.includes('Extractor')));
            throw new Error('FrameExtractor 모듈을 찾을 수 없습니다');
        }
        
        // ClipExtractor 초기화
        if (typeof window.ClipExtractor === 'function') {
            this.clipExtractor = new ClipExtractor(this.ffmpegPaths);
            if (!this.clipExtractor.initialized) {
                await this.clipExtractor.initialize();
            }
            console.log('✅ ClipExtractor 초기화 완료');
        } else {
            throw new Error('ClipExtractor 모듈을 찾을 수 없습니다');
        }
        
        // VideoConcatenator 초기화 (기본 생성만, 실제 초기화는 처리 시점에서)
        if (typeof window.VideoConcatenator === 'function') {
            this.videoConcatenator = new VideoConcatenator(this.ffmpegPaths);
            console.log('✅ VideoConcatenator 생성 완료 (초기화는 처리 시점에서 수행)');
        } else {
            console.warn('⚠️ VideoConcatenator 모듈을 찾을 수 없습니다 (병합 기능 비활성화)');
        }
        
        // EagleImporter 초기화
        if (typeof window.EagleImporter === 'function') {
            this.eagleImporter = new EagleImporter();
            console.log('✅ EagleImporter 초기화 완료');
        } else {
            throw new Error('EagleImporter 모듈을 찾을 수 없습니다');
        }
    }
    
    /**
     * FFmpeg 경로 가져오기
     */
    async getFFmpegPaths() {
        try {
            if (window.eagleUtils && typeof window.eagleUtils.getFFmpegPaths === 'function') {
                return await window.eagleUtils.getFFmpegPaths();
            } else {
                // 폴백: 기본 경로 사용
                return {
                    ffmpeg: 'ffmpeg',
                    ffprobe: 'ffprobe'
                };
            }
        } catch (error) {
            console.warn('FFmpeg 경로 가져오기 실패, 기본값 사용:', error);
            return {
                ffmpeg: 'ffmpeg',
                ffprobe: 'ffprobe'
            };
        }
    }
    
    /**
     * 설정 업데이트
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        console.log('⚙️ VideoProcessor 설정 업데이트:', this.settings);
    }
    
    /**
     * UI에서 설정 읽어오기
     */
    readSettingsFromUI() {
        const elements = this.stateManager.getElements();
        
        if (elements.sensitivitySlider) {
            this.settings.sensitivity = parseFloat(elements.sensitivitySlider.value);
        }
        if (elements.formatSelect) {
            this.settings.format = elements.formatSelect.value;
        }
        if (elements.qualitySlider) {
            this.settings.quality = parseInt(elements.qualitySlider.value);
        }
        if (elements.inHandleSlider) {
            this.settings.inHandle = parseInt(elements.inHandleSlider.value);
        }
        if (elements.outHandleSlider) {
            this.settings.outHandle = parseInt(elements.outHandleSlider.value);
        }
        if (elements.extractionMethod) {
            this.settings.extractionMethod = elements.extractionMethod.value;
        }
        if (elements.duplicateHandling) {
            this.settings.duplicateHandling = elements.duplicateHandling.value;
        }
        if (elements.analysisFrameNaming) {
            this.settings.analysisFrameNaming = elements.analysisFrameNaming.checked;
        }
        if (elements.smartFrameSelection) {
            this.settings.smartFrameSelection = elements.smartFrameSelection.checked;
        }
        if (elements.targetFrameCount) {
            this.settings.targetFrameCount = parseInt(elements.targetFrameCount.value);
        }
        
        console.log('📖 UI에서 설정 읽어옴:', this.settings);
    }
    
    /**
     * 메인 비디오 처리 함수
     */
    async processVideo(mode = 'all') {
        try {
            // 현재 설정 읽기
            this.readSettingsFromUI();
            
            // 선택된 파일들 가져오기
            const selectedFiles = this.stateManager.getSelectedFiles();
            if (selectedFiles.length === 0) {
                throw new Error('처리할 파일이 선택되지 않았습니다');
            }
            
            // 배치 모드 확인
            const isBatchMode = selectedFiles.length > 1;
            
            if (isBatchMode) {
                return await this.processBatch(selectedFiles, mode);
            } else {
                return await this.processSingleFile(selectedFiles[0], mode);
            }
            
        } catch (error) {
            console.error('❌ 비디오 처리 실패:', error);
            await this.errorHandler.handleError(error, 'video_processing', {
                level: 'error',
                shouldNotify: true
            });
            throw error;
        }
    }
    
    /**
     * 단일 파일 처리
     */
    async processSingleFile(videoFile, mode) {
        try {
            console.log(`🎬 단일 파일 처리 시작: ${videoFile.name} (모드: ${mode})`);
            
            // 진행률 초기화
            this.progressManager.start(`${videoFile.name} 처리 시작...`);
            
            // 1단계: 비디오 분석
            this.progressManager.startStage('analyze', 0, '비디오 분석 중...');
            
            // analyzer 상태 확인
            if (!this.analyzer) {
                throw new Error('VideoAnalyzer가 초기화되지 않았습니다');
            }
            
            const videoMetadata = await this.analyzer.getVideoMetadata(videoFile.path);
            const cutPoints = await this.analyzer.detectCutChanges(
                videoFile.path,
                this.settings.sensitivity,
                (progress) => this.progressManager.updateStageProgress('analyze', progress),
                this.ffmpegPaths,
                this.settings.inHandle,
                this.settings.outHandle
            );
            
            this.progressManager.completeStage('analyze', `${cutPoints.length}개 컷 포인트 감지 완료`);
            
            let results = {
                videoFile,
                videoMetadata,
                cutPoints,
                extractedFrames: [],
                extractedClips: [],
                importResults: []
            };
            
            // 2단계: 처리 모드에 따른 추출
            if (mode === 'all' || mode === 'frames') {
                results.extractedFrames = await this.extractFrames(videoFile, cutPoints);
            }
            
            if (mode === 'all' || mode === 'clips') {
                results.extractedClips = await this.extractClips(videoFile, cutPoints);
            }
            
            if (mode === 'concat') {
                results.concatenatedVideo = await this.concatenateVideos([videoFile]);
            }
            
            // 3단계: Eagle 임포트
            if (results.extractedFrames.length > 0 || results.extractedClips.length > 0) {
                results.importResults = await this.importToEagle(results);
            }
            
            // 완료
            this.progressManager.complete('처리 완료');
            
            console.log('✅ 단일 파일 처리 완료:', results);
            return results;
            
        } catch (error) {
            this.progressManager.cancel('처리 실패');
            throw error;
        }
    }
    
    /**
     * 배치 처리
     */
    async processBatch(videoFiles, mode) {
        try {
            console.log(`📚 배치 처리 시작: ${videoFiles.length}개 파일 (모드: ${mode})`);
            
            // 배치 진행률 시작
            this.progressManager.startBatch(videoFiles.length, '배치 처리 시작...');
            
            const batchResults = [];
            
            for (let i = 0; i < videoFiles.length; i++) {
                const videoFile = videoFiles[i];
                
                // 취소 확인
                if (this.stateManager.isBatchCancelled()) {
                    console.log('🚫 배치 처리 취소됨');
                    break;
                }
                
                try {
                    console.log(`📁 파일 ${i + 1}/${videoFiles.length} 처리: ${videoFile.name}`);
                    
                    // 배치 진행률 업데이트
                    this.progressManager.updateBatchProgress(i, videoFiles.length, `${videoFile.name} 처리 중...`);
                    
                    // 개별 파일 처리
                    const result = await this.processSingleFile(videoFile, mode);
                    batchResults.push(result);
                    
                    // 배치 항목 완료
                    this.progressManager.completeBatchItem(`${videoFile.name} 완료`);
                    
                } catch (error) {
                    console.error(`❌ 파일 처리 실패: ${videoFile.name}`, error);
                    
                    // 에러를 결과에 포함
                    batchResults.push({
                        videoFile,
                        error: error.message,
                        success: false
                    });
                    
                    // 배치 항목 완료 (에러 포함)
                    this.progressManager.completeBatchItem(`${videoFile.name} 실패`);
                }
            }
            
            // 배치 완료
            this.progressManager.completeBatch('배치 처리 완료');
            
            console.log('✅ 배치 처리 완료:', batchResults);
            return batchResults;
            
        } catch (error) {
            this.progressManager.cancel('배치 처리 실패');
            throw error;
        }
    }
    
    /**
     * 프레임 추출
     */
    async extractFrames(videoFile, cutPoints) {
        try {
            this.progressManager.startStage('extract', 0, '프레임 추출 중...');
            
            // FrameExtractor에 전달할 설정 객체 생성
            const extractSettings = {
                imageFormat: this.settings.format,  // FrameExtractor는 'imageFormat' 키를 사용
                quality: this.settings.quality,
                extractionMethod: this.settings.extractionMethod,
                analysisFrameNaming: this.settings.analysisFrameNaming
            };
            
            const extractedFrames = await this.frameExtractor.extractFrames(
                videoFile.path,
                cutPoints,
                extractSettings,
                (progress) => this.progressManager.updateStageProgress('extract', progress * 0.8), // 80%까지만 사용
                this.ffmpegPaths
            );
            
            // 스마트 프레임 선별
            console.log('🎯 스마트 프레임 선별 조건 확인:', {
                smartFrameSelection: this.settings.smartFrameSelection,
                extractedFramesCount: extractedFrames.frames?.length || 0,
                targetFrameCount: this.settings.targetFrameCount,
                conditionMet: this.settings.smartFrameSelection && extractedFrames.frames?.length > this.settings.targetFrameCount
            });
            
            if (this.settings.smartFrameSelection && extractedFrames.frames?.length > this.settings.targetFrameCount) {
                this.progressManager.updateStageProgress('extract', 0.8, '스마트 프레임 선별 중...');
                
                if (typeof window.SmartFrameSelector === 'function') {
                    const selector = new SmartFrameSelector();
                    
                    // 프레임 경로 배열 생성
                    const framePaths = extractedFrames.frames.map(frame => frame.path);
                    
                    // 스마트 선별 실행
                    const selectionResult = await selector.selectBestFrames(
                        framePaths,
                        { targetCount: this.settings.targetFrameCount },
                        (progress) => this.progressManager.updateStageProgress('extract', 0.8 + progress * 0.15, '스마트 프레임 선별 중...')
                    );
                    
                    // grouped 폴더에 복사
                    console.log('🔍 선별 결과 확인:', {
                        success: selectionResult.success,
                        selectedFramesCount: selectionResult.selectedFrames?.length || 0,
                        selectionResult: selectionResult
                    });
                    
                    if (selectionResult.success && selectionResult.selectedFrames && selectionResult.selectedFrames.length > 0) {
                        const baseDir = this.frameExtractor.outputDir;
                        const path = window.eagleUtils?.getNodeModule('path');
                        const groupedDir = path ? path.join(baseDir, 'grouped') : `${baseDir}/grouped`;
                        
                        console.log('📁 grouped 폴더 생성:', groupedDir);
                        console.log('📝 선별된 프레임 경로들:', selectionResult.selectedFrames);
                        
                        try {
                            const copiedFrames = await selector.copySelectedFrames(selectionResult.selectedFrames, groupedDir);
                            console.log('✅ 프레임 복사 완료:', copiedFrames.length, '개');
                            
                            this.progressManager.completeStage('extract', `${copiedFrames.length}개 프레임 선별 완료`);
                            return copiedFrames;
                        } catch (copyError) {
                            console.error('❌ 프레임 복사 실패:', copyError);
                            // 복사 실패해도 원본 프레임은 반환
                        }
                    } else {
                        console.warn('⚠️ 스마트 선별 조건 불만족 또는 실패');
                    }
                }
            }
            
            this.progressManager.completeStage('extract', `${extractedFrames.frames?.length || 0}개 프레임 추출 완료`);
            return extractedFrames.frames || [];
            
        } catch (error) {
            console.error('프레임 추출 실패:', error);
            throw error;
        }
    }
    
    /**
     * 클립 추출
     */
    async extractClips(videoFile, cutPoints) {
        try {
            this.progressManager.startStage('extract', 0, '클립 추출 중...');
            
            const extractedClips = await this.clipExtractor.extractClips(
                videoFile.path,
                cutPoints,
                this.settings,
                (progress) => this.progressManager.updateStageProgress('extract', progress),
                this.ffmpegPaths
            );
            
            this.progressManager.completeStage('extract', `${extractedClips.length}개 클립 추출 완료`);
            return extractedClips;
            
        } catch (error) {
            console.error('클립 추출 실패:', error);
            throw error;
        }
    }
    
    /**
     * Eagle 임포트
     */
    async importToEagle(results) {
        try {
            this.progressManager.startStage('import', 0, 'Eagle 임포트 중...');
            
            const importResults = [];
            const videoName = results.videoFile.name || 'video';
            
            // 프레임 임포트
            if (results.extractedFrames.length > 0) {
                const framePaths = results.extractedFrames.map(frame => frame.path);
                const frameImportResult = await this.eagleImporter.importToEagle(
                    framePaths,
                    videoName,
                    {
                        duplicateHandling: this.settings.duplicateHandling,
                        createFolder: true,
                        type: 'frame'
                    }
                );
                this.progressManager.updateStageProgress('import', 0.5);
                importResults.push(frameImportResult);
            }
            
            // 클립 임포트
            if (results.extractedClips.length > 0) {
                const clipPaths = results.extractedClips.map(clip => clip.path);
                const clipImportResult = await this.eagleImporter.importToEagle(
                    clipPaths,
                    videoName,
                    {
                        duplicateHandling: this.settings.duplicateHandling,
                        createFolder: true,
                        type: 'clip'
                    }
                );
                this.progressManager.updateStageProgress('import', 1.0);
                importResults.push(clipImportResult);
            }
            
            this.progressManager.completeStage('import', `${importResults.length}개 파일 그룹 임포트 완료`);
            return importResults;
            
        } catch (error) {
            console.error('Eagle 임포트 실패:', error);
            throw error;
        }
    }
    
    /**
     * 다중 비디오 병합
     */
    async concatenateVideos(videoFiles, options = {}) {
        try {
            if (!this.videoConcatenator) {
                throw new Error('VideoConcatenator 모듈이 초기화되지 않았습니다');
            }

            if (videoFiles.length === 0) {
                throw new Error('병합할 비디오 파일이 없습니다');
            }

            if (videoFiles.length === 1) {
                console.log('⚠️ 단일 파일 병합 - 복사 모드로 처리');
            }

            // VideoConcatenator 초기화 (비디오 파일들 기반으로 폴더명 생성)
            if (!this.videoConcatenator.initialized) {
                await this.videoConcatenator.initialize(videoFiles);
            }

            this.progressManager.startStage('concat', 0, '비디오 병합 중...');

            const concatOptions = {
                quality: this.settings.quality >= 8 ? 'high' : 
                        this.settings.quality >= 5 ? 'medium' : 'fast',
                audioSync: true,
                ...options
            };

            const result = await this.videoConcatenator.concatenateVideos(
                videoFiles,
                concatOptions,
                (progress, message) => this.progressManager.updateStageProgress('concat', progress, message),
                this.ffmpegPaths
            );

            this.progressManager.completeStage('concat', `병합 완료: ${result.filename}`);
            return result;

        } catch (error) {
            console.error('비디오 병합 실패:', error);
            throw error;
        }
    }

    /**
     * 다중 비디오 병합 처리 (메인 진입점)
     */
    async processMultipleVideos(videoFiles, mode = 'concat') {
        try {
            console.log(`🎬 다중 비디오 처리 시작: ${videoFiles.length}개 파일 (모드: ${mode})`);
            
            // 진행률 초기화
            this.progressManager.start(`${videoFiles.length}개 비디오 병합 시작...`);
            
            // UI 설정 읽기
            this.readSettingsFromUI();
            
            let results = {
                videoFiles,
                concatenatedVideo: null,
                importResults: []
            };

            if (mode === 'concat') {
                results.concatenatedVideo = await this.concatenateVideos(videoFiles);
            }

            // Eagle 임포트
            if (results.concatenatedVideo) {
                this.progressManager.startStage('import', 0, 'Eagle 임포트 중...');
                
                const importResult = await this.eagleImporter.importToEagle(
                    [results.concatenatedVideo.path],
                    results.concatenatedVideo.filename,
                    {
                        duplicateHandling: this.settings.duplicateHandling,
                        createFolder: true,
                        type: 'concatenated'
                    }
                );
                
                results.importResults.push(importResult);
                this.progressManager.completeStage('import', 'Eagle 임포트 완료');
            }

            // 완료
            this.progressManager.complete('다중 비디오 처리 완료');
            
            console.log('✅ 다중 비디오 처리 완료:', results);
            return results;

        } catch (error) {
            this.progressManager.cancel('다중 비디오 처리 실패');
            throw error;
        }
    }

    /**
     * 현재 처리 상태 조회
     */
    getProcessingStatus() {
        return {
            isProcessing: this.stateManager.isProcessing(),
            progressStatus: this.progressManager.getStatus(),
            currentSettings: this.settings
        };
    }
    
    /**
     * 처리 취소
     */
    cancelProcessing() {
        this.stateManager.setBatchCancelled(true);
        this.progressManager.cancel('사용자가 처리를 취소했습니다');
        console.log('🚫 비디오 처리 취소됨');
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VideoProcessor;
} else {
    // 전역 스코프에 등록 - 강제로 클래스만 등록
    if (typeof window !== 'undefined') {
        // 기존에 인스턴스가 등록되어 있다면 제거하고 클래스만 등록
        delete window.VideoProcessor;
        window.VideoProcessor = VideoProcessor;
    }
    if (typeof global !== 'undefined') {
        delete global.VideoProcessor;
        global.VideoProcessor = VideoProcessor;
    }
}

// 로드 확인 로그
console.log('✅ VideoProcessor 모듈 로드됨');
console.log('window.VideoProcessor 등록됨:', typeof window.VideoProcessor);

// 등록 재시도
setTimeout(() => {
    if (typeof window.VideoProcessor === 'undefined') {
        console.log('🔄 VideoProcessor 재등록 시도...');
        window.VideoProcessor = VideoProcessor;
        console.log('재등록 결과:', typeof window.VideoProcessor);
    }
}, 100);