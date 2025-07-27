/**
 * Progress Manager
 * 진행률 관리 및 추상화 시스템
 */
class ProgressManager {
    constructor(uiController) {
        this.uiController = uiController;
        this.stages = new Map();
        this.currentStage = null;
        this.currentProgress = 0;
        this.totalProgress = 0;
        this.isActive = false;
        
        // 배치 처리 상태
        this.batchInfo = {
            current: 0,
            total: 0,
            isActive: false
        };
        
        // 진행률 이벤트 리스너
        this.progressListeners = [];
        
        console.log('📊 진행률 관리자 초기화 완료');
    }
    
    /**
     * 진행률 단계 정의
     */
    defineStage(name, startPercent, endPercent, description = '') {
        this.stages.set(name, {
            name,
            startPercent,
            endPercent,
            description,
            range: endPercent - startPercent
        });
        
        console.log(`📋 단계 정의: ${name} (${startPercent}% - ${endPercent}%)`);
        return this;
    }
    
    /**
     * 여러 단계 일괄 정의
     */
    defineStages(stageConfigs) {
        stageConfigs.forEach(config => {
            this.defineStage(config.name, config.startPercent, config.endPercent, config.description);
        });
        return this;
    }
    
    /**
     * 기본 비디오 처리 단계 설정
     */
    setupVideoProcessingStages() {
        return this.defineStages([
            { name: 'initialize', startPercent: 0, endPercent: 10, description: '초기화 중...' },
            { name: 'analyze', startPercent: 10, endPercent: 30, description: '컷 변화 분석 중...' },
            { name: 'extract', startPercent: 30, endPercent: 80, description: '콘텐츠 추출 중...' },
            { name: 'import', startPercent: 80, endPercent: 95, description: 'Eagle 임포트 중...' },
            { name: 'finalize', startPercent: 95, endPercent: 100, description: '마무리 중...' }
        ]);
    }
    
    /**
     * 진행률 시작
     */
    start(message = '처리 시작...') {
        this.isActive = true;
        this.currentProgress = 0;
        this.totalProgress = 0;
        this.currentStage = null;
        
        this.updateProgress(0, message);
        this.notifyListeners('start', { message });
        
        console.log('▶️ 진행률 추적 시작');
        return this;
    }
    
    /**
     * 단계 시작
     */
    startStage(stageName, stageProgress = 0, message = null) {
        const stage = this.stages.get(stageName);
        if (!stage) {
            console.warn(`⚠️ 정의되지 않은 단계: ${stageName}`);
            return this;
        }
        
        this.currentStage = stageName;
        const finalMessage = message || stage.description;
        
        this.updateStageProgress(stageName, stageProgress, finalMessage);
        this.notifyListeners('stage_start', { stage: stageName, message: finalMessage });
        
        console.log(`🎯 단계 시작: ${stageName} - ${finalMessage}`);
        return this;
    }
    
    /**
     * 단계 진행률 업데이트
     */
    updateStageProgress(stageName, stageProgress, message = null) {
        const stage = this.stages.get(stageName);
        if (!stage) {
            console.warn(`⚠️ 정의되지 않은 단계: ${stageName}`);
            return this;
        }
        
        // 0-1 범위로 정규화
        const normalizedProgress = Math.min(1, Math.max(0, stageProgress));
        
        // 전체 진행률 계산
        const actualProgress = stage.startPercent + (normalizedProgress * stage.range);
        this.currentProgress = normalizedProgress;
        this.totalProgress = actualProgress;
        
        const finalMessage = message || stage.description;
        this.updateProgress(actualProgress / 100, finalMessage);
        
        this.notifyListeners('stage_progress', {
            stage: stageName,
            stageProgress: normalizedProgress,
            totalProgress: actualProgress,
            message: finalMessage
        });
        
        return this;
    }
    
    /**
     * 단계 완료
     */
    completeStage(stageName, message = null) {
        const stage = this.stages.get(stageName);
        if (!stage) {
            console.warn(`⚠️ 정의되지 않은 단계: ${stageName}`);
            return this;
        }
        
        this.updateStageProgress(stageName, 1, message);
        this.notifyListeners('stage_complete', { stage: stageName, message });
        
        console.log(`✅ 단계 완료: ${stageName}`);
        return this;
    }
    
    /**
     * 진행률 완료
     */
    complete(message = '처리 완료') {
        this.updateProgress(1, message);
        this.isActive = false;
        this.currentStage = null;
        
        this.notifyListeners('complete', { message });
        console.log('🎉 진행률 추적 완료');
        return this;
    }
    
    /**
     * 진행률 취소
     */
    cancel(message = '처리 취소됨') {
        this.isActive = false;
        this.currentStage = null;
        
        this.notifyListeners('cancel', { message });
        console.log('🚫 진행률 추적 취소');
        return this;
    }
    
    /**
     * 배치 진행률 시작
     */
    startBatch(total, message = '배치 처리 시작...') {
        this.batchInfo = {
            current: 0,
            total,
            isActive: true
        };
        
        this.updateBatchProgress(0, total, message);
        this.notifyListeners('batch_start', { total, message });
        
        console.log(`📦 배치 진행률 시작: ${total}개 파일`);
        return this;
    }
    
    /**
     * 배치 진행률 업데이트
     */
    updateBatchProgress(current, total = null, message = '') {
        if (total !== null) {
            this.batchInfo.total = total;
        }
        
        this.batchInfo.current = current;
        
        if (this.uiController) {
            this.uiController.showBatchProgress(current, this.batchInfo.total, message);
        }
        
        this.notifyListeners('batch_progress', {
            current,
            total: this.batchInfo.total,
            message
        });
        
        return this;
    }
    
    /**
     * 배치 항목 완료
     */
    completeBatchItem(message = '') {
        this.batchInfo.current++;
        this.updateBatchProgress(this.batchInfo.current, null, message);
        
        console.log(`📋 배치 항목 완료: ${this.batchInfo.current}/${this.batchInfo.total}`);
        return this;
    }
    
    /**
     * 배치 진행률 완료
     */
    completeBatch(message = '배치 처리 완료') {
        this.batchInfo.isActive = false;
        this.updateBatchProgress(this.batchInfo.total, null, message);
        
        this.notifyListeners('batch_complete', { message });
        console.log('🎉 배치 진행률 완료');
        return this;
    }
    
    /**
     * 진행률 업데이트 (내부 메서드)
     */
    updateProgress(percent, message) {
        if (this.uiController) {
            this.uiController.showProgress(percent, message);
        }
        
        // 콘솔 로그는 상세한 진행률에서만 출력
        if (percent === 0 || percent === 1 || percent % 0.1 < 0.01) {
            console.log(`📊 진행률: ${(percent * 100).toFixed(1)}% - ${message}`);
        }
    }
    
    /**
     * 진행률 이벤트 리스너 등록
     */
    onProgress(listener) {
        this.progressListeners.push(listener);
        return this;
    }
    
    /**
     * 진행률 이벤트 알림
     */
    notifyListeners(event, data) {
        this.progressListeners.forEach(listener => {
            try {
                listener(event, data);
            } catch (error) {
                console.error('진행률 리스너 오류:', error);
            }
        });
    }
    
    /**
     * 현재 상태 조회
     */
    getStatus() {
        return {
            isActive: this.isActive,
            currentStage: this.currentStage,
            currentProgress: this.currentProgress,
            totalProgress: this.totalProgress,
            batchInfo: { ...this.batchInfo },
            stages: Array.from(this.stages.values())
        };
    }
    
    /**
     * 진행률 리셋
     */
    reset() {
        this.isActive = false;
        this.currentStage = null;
        this.currentProgress = 0;
        this.totalProgress = 0;
        this.batchInfo = {
            current: 0,
            total: 0,
            isActive: false
        };
        
        if (this.uiController) {
            this.uiController.resetUIState();
        }
        
        this.notifyListeners('reset', {});
        console.log('🔄 진행률 리셋 완료');
        return this;
    }
    
    /**
     * 단계 제거
     */
    removeStage(stageName) {
        this.stages.delete(stageName);
        console.log(`🗑️ 단계 제거: ${stageName}`);
        return this;
    }
    
    /**
     * 모든 단계 제거
     */
    clearStages() {
        this.stages.clear();
        console.log('🗑️ 모든 단계 제거');
        return this;
    }
    
    /**
     * 단계 목록 조회
     */
    getStages() {
        return Array.from(this.stages.values());
    }
    
    /**
     * 특정 단계 조회
     */
    getStage(stageName) {
        return this.stages.get(stageName);
    }
    
    /**
     * 진행률 요약 정보
     */
    getSummary() {
        const status = this.getStatus();
        return {
            active: status.isActive,
            stage: status.currentStage,
            progress: `${(status.totalProgress).toFixed(1)}%`,
            batch: status.batchInfo.isActive ? 
                `${status.batchInfo.current}/${status.batchInfo.total}` : 
                'inactive'
        };
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProgressManager;
} else {
    // 강제로 전역 스코프에 등록
    if (typeof window !== 'undefined') {
        window.ProgressManager = ProgressManager;
    }
    if (typeof global !== 'undefined') {
        global.ProgressManager = ProgressManager;
    }
}

// 로드 확인 로그
console.log('✅ ProgressManager 모듈 로드됨');
console.log('window.ProgressManager 등록됨:', typeof window.ProgressManager);

// 등록 재시도
setTimeout(() => {
    if (typeof window.ProgressManager === 'undefined') {
        console.log('🔄 ProgressManager 재등록 시도...');
        window.ProgressManager = ProgressManager;
        console.log('재등록 결과:', typeof window.ProgressManager);
    }
}, 100);