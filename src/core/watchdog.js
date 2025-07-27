/**
 * Plugin Watchdog System
 * 무응답 상태 감지 및 자동 초기화
 */
class PluginWatchdog {
    constructor(stateManager, uiController) {
        this.stateManager = stateManager;
        this.uiController = uiController;
        
        this.lastActivity = Date.now();
        this.watchdogInterval = null;
        this.isEnabled = true;
        this.timeoutDuration = 3 * 60 * 1000; // 3분 (밀리초)
        this.checkInterval = 30 * 1000; // 30초마다 체크
        this.warningShown = false;
        
        // 활동 감지 대상 이벤트들
        this.activityEvents = [
            'click', 'keydown', 'mousemove', 'scroll',
            'touchstart', 'focus', 'input', 'change'
        ];
        
        this.init();
    }
    
    /**
     * 워치독 초기화
     */
    init() {
        // 활동 감지 이벤트 리스너 등록
        this.activityEvents.forEach(eventType => {
            document.addEventListener(eventType, () => this.recordActivity(), {
                passive: true,
                capture: true
            });
        });
        
        // 워치독 타이머 시작
        this.start();
        
        console.log('🐕 워치독 시스템 초기화 완료 (3분 무응답 시 자동 초기화)');
    }
    
    /**
     * 활동 기록
     */
    recordActivity() {
        this.lastActivity = Date.now();
        this.warningShown = false; // 경고 상태 리셋
        
        // 처리 중이 아닐 때만 활동으로 인정
        if (!this.stateManager.isProcessing()) {
            console.log('🐕 사용자 활동 감지:', new Date().toLocaleTimeString());
        }
    }
    
    /**
     * 워치독 시작
     */
    start() {
        if (this.watchdogInterval) {
            this.stop();
        }
        
        this.watchdogInterval = setInterval(() => {
            this.checkForInactivity();
        }, this.checkInterval);
        
        console.log('🐕 워치독 타이머 시작');
    }
    
    /**
     * 워치독 정지
     */
    stop() {
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
            console.log('🐕 워치독 타이머 정지');
        }
    }
    
    /**
     * 비활성 상태 체크
     */
    checkForInactivity() {
        if (!this.isEnabled) return;
        
        const now = Date.now();
        const timeSinceLastActivity = now - this.lastActivity;
        const remainingTime = this.timeoutDuration - timeSinceLastActivity;
        
        // 2분 30초 경과 시 경고 (30초 전)
        if (remainingTime <= 30000 && remainingTime > 0 && !this.warningShown && !this.stateManager.isProcessing()) {
            this.showInactivityWarning(Math.ceil(remainingTime / 1000));
            this.warningShown = true;
        }
        
        // 3분 경과 시 자동 초기화
        if (timeSinceLastActivity >= this.timeoutDuration) {
            console.warn('🐕 무응답 감지! 플러그인 자동 초기화 실행...');
            this.performAutoReset();
        }
    }
    
    /**
     * 비활성 경고 표시
     */
    showInactivityWarning(remainingSeconds) {
        console.warn(`⚠️ 무응답 경고: ${remainingSeconds}초 후 자동 초기화`);
        
        // Eagle 알림으로 경고 표시
        if (this.stateManager.isEagleReady() && typeof eagle.notification !== 'undefined') {
            eagle.notification.show({
                title: 'Video Processor 워치독',
                body: `${remainingSeconds}초 후 무응답으로 인한 자동 초기화가 실행됩니다.`,
                type: 'warning'
            });
        }
        
        // 콘솔에도 명확히 표시
        console.log(`🐕 워치독 경고: 마지막 활동으로부터 ${Math.floor((Date.now() - this.lastActivity) / 1000)}초 경과`);
    }
    
    /**
     * 자동 초기화 수행
     */
    async performAutoReset() {
        try {
            console.log('🔄 플러그인 자동 초기화 시작...');
            
            // 1. 현재 처리 중인 작업 중단
            if (this.stateManager.isProcessing()) {
                console.log('🛑 진행 중인 작업 중단...');
                this.stateManager.setProcessing(false);
                this.stateManager.setBatchCancelled(true);
            }
            
            // 2. UI 상태 초기화
            this.uiController.resetUIState();
            
            // 3. 앱 상태 초기화
            this.stateManager.resetProcessingState();
            
            // 4. 모듈 재초기화
            await this.reinitializeModules();
            
            // 5. Eagle API 재연결
            await this.reconnectEagleAPI();
            
            // 6. 활동 기록 리셋
            this.recordActivity();
            
            console.log('✅ 플러그인 자동 초기화 완료');
            
            // 사용자에게 초기화 완료 알림
            this.uiController.showNotification('무응답으로 인해 플러그인이 자동 초기화되었습니다.', 'info');
            
        } catch (error) {
            console.error('❌ 자동 초기화 실패:', error);
            
            // 초기화 실패 시 페이지 새로고침 제안
            if (confirm('플러그인 자동 초기화에 실패했습니다. 페이지를 새로고침하시겠습니까?')) {
                window.location.reload();
            }
        }
    }
    
    /**
     * 모듈 재초기화
     */
    async reinitializeModules() {
        try {
            // 모듈 로드 상태 다시 확인
            if (typeof window.checkModulesLoaded === 'function') {
                window.checkModulesLoaded();
            }
            
            // Eagle 유틸리티 재초기화
            if (window.eagleUtils && typeof window.eagleUtils.initialize === 'function') {
                await window.eagleUtils.initialize();
            }
            
            console.log('🔧 모듈 재초기화 완료');
        } catch (error) {
            console.error('모듈 재초기화 실패:', error);
        }
    }
    
    /**
     * Eagle API 재연결
     */
    async reconnectEagleAPI() {
        try {
            // Eagle API 상태 재확인
            if (typeof window.checkEagleAPI === 'function') {
                await window.checkEagleAPI();
            }
            
            // 선택된 파일 자동 감지 재시도
            if (this.stateManager.isEagleReady()) {
                setTimeout(() => {
                    if (typeof window.autoDetectSelectedFile === 'function') {
                        window.autoDetectSelectedFile();
                    }
                }, 1000);
            }
            
            console.log('🦅 Eagle API 재연결 완료');
        } catch (error) {
            console.error('Eagle API 재연결 실패:', error);
        }
    }
    
    /**
     * 워치독 활성화/비활성화
     */
    setEnabled(enabled) {
        this.isEnabled = enabled;
        console.log(`🐕 워치독 ${enabled ? '활성화' : '비활성화'}`);
    }
    
    /**
     * 타임아웃 시간 설정 (분 단위)
     */
    setTimeoutMinutes(minutes) {
        this.timeoutDuration = minutes * 60 * 1000;
        console.log(`🐕 워치독 타임아웃 설정: ${minutes}분`);
    }
    
    /**
     * 현재 상태 조회
     */
    getStatus() {
        const timeSinceLastActivity = Date.now() - this.lastActivity;
        const remainingTime = Math.max(0, this.timeoutDuration - timeSinceLastActivity);
        
        return {
            isEnabled: this.isEnabled,
            timeoutMinutes: this.timeoutDuration / (60 * 1000),
            timeSinceLastActivitySeconds: Math.floor(timeSinceLastActivity / 1000),
            remainingTimeSeconds: Math.floor(remainingTime / 1000),
            lastActivity: new Date(this.lastActivity).toLocaleString()
        };
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PluginWatchdog;
} else {
    // 강제로 전역 스코프에 등록
    if (typeof window !== 'undefined') {
        window.PluginWatchdog = PluginWatchdog;
    }
    if (typeof global !== 'undefined') {
        global.PluginWatchdog = PluginWatchdog;
    }
}

// 로드 확인 로그
console.log('✅ PluginWatchdog 모듈 로드됨');
console.log('window.PluginWatchdog 등록됨:', typeof window.PluginWatchdog);

// 등록 재시도
setTimeout(() => {
    if (typeof window.PluginWatchdog === 'undefined') {
        console.log('🔄 PluginWatchdog 재등록 시도...');
        window.PluginWatchdog = PluginWatchdog;
        console.log('재등록 결과:', typeof window.PluginWatchdog);
    }
}, 100);