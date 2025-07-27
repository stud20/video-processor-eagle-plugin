/**
 * Error Handler
 * 통합 에러 핸들링 시스템
 */
class ErrorHandler {
    constructor(uiController) {
        this.uiController = uiController;
        this.errorHistory = [];
        this.errorCallbacks = new Map();
        this.maxHistorySize = 100;
        
        // 에러 타입별 메시지 매핑
        this.errorMessages = {
            'ENOENT': '파일을 찾을 수 없습니다',
            'EACCES': '파일 접근 권한이 없습니다',
            'EPERM': '파일 권한이 없습니다',
            'ENOSPC': '디스크 공간이 부족합니다',
            'ENOMEM': '메모리가 부족합니다',
            'FFmpeg': 'FFmpeg 처리 중 오류가 발생했습니다',
            'Eagle': 'Eagle API 연결 오류가 발생했습니다',
            'Network': '네트워크 연결 오류가 발생했습니다',
            'Timeout': '처리 시간이 초과되었습니다',
            'Cancelled': '작업이 취소되었습니다'
        };
        
        // 전역 에러 핸들러 등록
        this.setupGlobalErrorHandlers();
    }
    
    /**
     * 전역 에러 핸들러 설정
     */
    setupGlobalErrorHandlers() {
        // 처리되지 않은 에러 캐치
        window.addEventListener('error', (event) => {
            this.handleError(event.error, 'global', {
                level: 'error',
                shouldNotify: true
            });
        });
        
        // Promise rejection 캐치
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError(event.reason, 'promise', {
                level: 'error',
                shouldNotify: true
            });
        });
        
        console.log('🛡️ 전역 에러 핸들러 설정 완료');
    }
    
    /**
     * 에러 처리
     */
    async handleError(error, context, options = {}) {
        const defaultOptions = {
            level: 'error',
            shouldNotify: true,
            shouldLog: true,
            shouldRetry: false,
            retryCount: 0,
            maxRetries: 3
        };
        
        const finalOptions = { ...defaultOptions, ...options };
        
        // 에러 정보 생성
        const errorInfo = this.createErrorInfo(error, context, finalOptions);
        
        // 에러 기록
        this.recordError(errorInfo);
        
        // 로그 출력
        if (finalOptions.shouldLog) {
            this.logError(errorInfo);
        }
        
        // 사용자 알림
        if (finalOptions.shouldNotify) {
            this.notifyUser(errorInfo);
        }
        
        // 컨텍스트별 콜백 실행
        await this.executeContextCallback(context, errorInfo);
        
        // 재시도 처리
        if (finalOptions.shouldRetry && finalOptions.retryCount < finalOptions.maxRetries) {
            return this.handleRetry(errorInfo, finalOptions);
        }
        
        return errorInfo;
    }
    
    /**
     * 에러 정보 생성
     */
    createErrorInfo(error, context, options) {
        const errorInfo = {
            id: this.generateErrorId(),
            timestamp: new Date().toISOString(),
            message: error?.message || String(error),
            stack: error?.stack,
            context,
            level: options.level,
            userMessage: this.getUserFriendlyMessage(error),
            shouldRetry: options.shouldRetry,
            retryCount: options.retryCount,
            maxRetries: options.maxRetries
        };
        
        // 에러 타입 분류
        errorInfo.type = this.classifyError(error);
        
        return errorInfo;
    }
    
    /**
     * 에러 기록
     */
    recordError(errorInfo) {
        this.errorHistory.push(errorInfo);
        
        // 히스토리 크기 제한
        if (this.errorHistory.length > this.maxHistorySize) {
            this.errorHistory.shift();
        }
    }
    
    /**
     * 에러 로그 출력
     */
    logError(errorInfo) {
        const logMethod = errorInfo.level === 'warning' ? 'warn' : 'error';
        
        console[logMethod](`[${errorInfo.level.toUpperCase()}] ${errorInfo.context}:`, {
            message: errorInfo.message,
            type: errorInfo.type,
            timestamp: errorInfo.timestamp,
            stack: errorInfo.stack
        });
    }
    
    /**
     * 사용자 알림
     */
    notifyUser(errorInfo) {
        if (this.uiController) {
            const notificationType = errorInfo.level === 'warning' ? 'warning' : 'error';
            this.uiController.showNotification(errorInfo.userMessage, notificationType);
        }
    }
    
    /**
     * 컨텍스트별 콜백 실행
     */
    async executeContextCallback(context, errorInfo) {
        const callback = this.errorCallbacks.get(context);
        if (callback) {
            try {
                await callback(errorInfo);
            } catch (callbackError) {
                console.error('에러 콜백 실행 실패:', callbackError);
            }
        }
    }
    
    /**
     * 재시도 처리
     */
    handleRetry(errorInfo, options) {
        const newOptions = {
            ...options,
            retryCount: options.retryCount + 1
        };
        
        console.log(`재시도 ${newOptions.retryCount}/${newOptions.maxRetries}: ${errorInfo.message}`);
        
        // 재시도 지연
        const delay = Math.min(1000 * Math.pow(2, newOptions.retryCount), 10000);
        
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(newOptions);
            }, delay);
        });
    }
    
    /**
     * 에러 타입 분류
     */
    classifyError(error) {
        if (!error) return 'unknown';
        
        const message = error.message || String(error);
        
        // 파일 시스템 에러
        if (message.includes('ENOENT')) return 'file_not_found';
        if (message.includes('EACCES') || message.includes('EPERM')) return 'permission_denied';
        if (message.includes('ENOSPC')) return 'disk_full';
        if (message.includes('ENOMEM')) return 'memory_error';
        
        // 애플리케이션 에러
        if (message.includes('FFmpeg')) return 'ffmpeg_error';
        if (message.includes('Eagle')) return 'eagle_error';
        if (message.includes('timeout')) return 'timeout_error';
        if (message.includes('cancelled')) return 'cancelled_error';
        
        // 네트워크 에러
        if (message.includes('fetch') || message.includes('network')) return 'network_error';
        
        return 'application_error';
    }
    
    /**
     * 사용자 친화적 메시지 생성
     */
    getUserFriendlyMessage(error) {
        if (!error) return '알 수 없는 오류가 발생했습니다';
        
        const message = error.message || String(error);
        
        // 메시지 매핑 확인
        for (const [key, userMessage] of Object.entries(this.errorMessages)) {
            if (message.includes(key)) {
                return userMessage;
            }
        }
        
        // 기본 메시지
        return '처리 중 오류가 발생했습니다';
    }
    
    /**
     * 에러 ID 생성
     */
    generateErrorId() {
        return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * 컨텍스트별 에러 콜백 등록
     */
    onError(context, callback) {
        this.errorCallbacks.set(context, callback);
    }
    
    /**
     * 에러 히스토리 조회
     */
    getErrorHistory(limit = 10) {
        return this.errorHistory.slice(-limit);
    }
    
    /**
     * 에러 히스토리 클리어
     */
    clearErrorHistory() {
        this.errorHistory = [];
        console.log('에러 히스토리 클리어됨');
    }
    
    /**
     * 에러 통계 조회
     */
    getErrorStats() {
        const stats = {
            total: this.errorHistory.length,
            byType: {},
            byContext: {},
            byLevel: {}
        };
        
        this.errorHistory.forEach(error => {
            // 타입별 통계
            stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
            
            // 컨텍스트별 통계
            stats.byContext[error.context] = (stats.byContext[error.context] || 0) + 1;
            
            // 레벨별 통계
            stats.byLevel[error.level] = (stats.byLevel[error.level] || 0) + 1;
        });
        
        return stats;
    }
    
    /**
     * 에러 보고서 생성
     */
    generateErrorReport() {
        const stats = this.getErrorStats();
        const recentErrors = this.getErrorHistory(5);
        
        return {
            timestamp: new Date().toISOString(),
            stats,
            recentErrors,
            systemInfo: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language
            }
        };
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
} else {
    // 강제로 전역 스코프에 등록
    if (typeof window !== 'undefined') {
        window.ErrorHandler = ErrorHandler;
    }
    if (typeof global !== 'undefined') {
        global.ErrorHandler = ErrorHandler;
    }
}

// 로드 확인 로그
console.log('✅ ErrorHandler 모듈 로드됨');
console.log('window.ErrorHandler 등록됨:', typeof window.ErrorHandler);

// 등록 재시도
setTimeout(() => {
    if (typeof window.ErrorHandler === 'undefined') {
        console.log('🔄 ErrorHandler 재등록 시도...');
        window.ErrorHandler = ErrorHandler;
        console.log('재등록 결과:', typeof window.ErrorHandler);
    }
}, 100);