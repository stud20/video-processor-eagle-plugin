/**
 * UI Controller
 * 사용자 인터페이스 관리 및 업데이트
 */
class UIController {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.notificationTimeout = null;
        
        // 상태 변경 이벤트 리스너 등록
        this.setupStateListeners();
    }
    
    /**
     * 상태 변경 이벤트 리스너 설정
     */
    setupStateListeners() {
        this.stateManager.onChange('isProcessing', (processing) => {
            this.updateProcessingState(processing);
        });
        
        this.stateManager.onChange('selectedFiles', (files) => {
            this.updateFileSelection(files);
        });
        
        this.stateManager.onChange('currentVideoFile', (file) => {
            this.updateCurrentVideoFile(file);
        });
        
        this.stateManager.onChange('isBatchMode', (batchMode) => {
            this.updateBatchMode(batchMode);
        });
        
        this.stateManager.onChange('isEagleReady', (ready) => {
            this.updateEagleStatus(ready);
        });
    }
    
    /**
     * 처리 상태 UI 업데이트
     */
    updateProcessingState(isProcessing) {
        const elements = this.stateManager.getElements();
        
        // 처리 버튼 상태
        if (elements.processBtn) {
            elements.processBtn.disabled = isProcessing;
            elements.processBtn.textContent = isProcessing ? '처리 중...' : '📋 모든 처리';
        }
        
        if (elements.extractFramesBtn) {
            elements.extractFramesBtn.disabled = isProcessing;
            elements.extractFramesBtn.textContent = isProcessing ? '처리 중...' : '🖼️ 이미지 추출';
        }
        
        if (elements.extractClipsBtn) {
            elements.extractClipsBtn.disabled = isProcessing;
            elements.extractClipsBtn.textContent = isProcessing ? '처리 중...' : '🎬 클립 추출';
        }
        
        // 설정 컨트롤 비활성화
        const settingsControls = [
            'sensitivitySlider', 'qualitySlider', 'formatSelect',
            'inHandleSlider', 'outHandleSlider'
        ];
        
        settingsControls.forEach(controlId => {
            const control = elements[controlId];
            if (control) {
                control.disabled = isProcessing;
            }
        });
        
        // 파일 선택 비활성화
        if (elements.selectFileBtn) {
            elements.selectFileBtn.disabled = isProcessing;
        }
    }
    
    /**
     * 파일 선택 UI 업데이트
     */
    updateFileSelection(files) {
        const elements = this.stateManager.getElements();
        
        if (elements.selectedFile) {
            if (files.length === 0) {
                elements.selectedFile.textContent = '파일을 선택해주세요';
                elements.selectedFile.style.color = '#666';
            } else if (files.length === 1) {
                elements.selectedFile.textContent = files[0].name;
                elements.selectedFile.style.color = '#333';
            } else {
                elements.selectedFile.textContent = `${files.length}개 파일 선택됨`;
                elements.selectedFile.style.color = '#333';
            }
        }
        
        // 처리 버튼 활성화/비활성화
        const hasFiles = files.length > 0;
        [elements.processBtn, elements.extractFramesBtn, elements.extractClipsBtn].forEach(btn => {
            if (btn) {
                btn.disabled = !hasFiles || this.stateManager.isProcessing();
            }
        });
    }
    
    /**
     * 현재 비디오 파일 UI 업데이트
     */
    updateCurrentVideoFile(file) {
        if (file) {
            this.updateVideoFileInfo(file);
        }
    }
    
    /**
     * 배치 모드 UI 업데이트
     */
    updateBatchMode(batchMode) {
        const elements = this.stateManager.getElements();
        
        if (elements.batchInfo) {
            elements.batchInfo.style.display = batchMode ? 'block' : 'none';
        }
        
        if (batchMode) {
            this.updateBatchInfo();
        }
    }
    
    /**
     * Eagle 상태 UI 업데이트
     */
    updateEagleStatus(ready) {
        const elements = this.stateManager.getElements();
        
        if (elements.systemInfo) {
            const statusText = ready ? '✅ Eagle 연결됨' : '❌ Eagle 연결 안됨';
            elements.systemInfo.textContent = statusText;
            elements.systemInfo.style.color = ready ? '#28a745' : '#dc3545';
        }
        
        // Eagle이 준비되지 않았을 때 파일 선택 버튼 비활성화
        if (elements.selectFileBtn) {
            elements.selectFileBtn.disabled = !ready || this.stateManager.isProcessing();
        }
    }
    
    /**
     * 비디오 파일 정보 업데이트
     */
    updateVideoFileInfo(videoFile) {
        if (!videoFile) return;
        
        const elements = this.stateManager.getElements();
        
        // 파일 이름 표시
        if (elements.selectedFile) {
            elements.selectedFile.textContent = videoFile.name;
            elements.selectedFile.style.color = '#333';
        }
        
        // 비디오 메타데이터 로드 및 표시
        this.loadVideoMetadata(videoFile);
    }
    
    /**
     * 비디오 메타데이터 로드
     */
    async loadVideoMetadata(videoFile) {
        try {
            // 메타데이터 로드 로직은 기존 코드에서 가져와야 함
            // 여기서는 기본 구조만 제공
            console.log('메타데이터 로드:', videoFile.name);
        } catch (error) {
            console.error('메타데이터 로드 실패:', error);
        }
    }
    
    /**
     * 배치 정보 업데이트
     */
    updateBatchInfo() {
        const elements = this.stateManager.getElements();
        const files = this.stateManager.getSelectedFiles();
        
        if (elements.batchCount) {
            elements.batchCount.textContent = files.length;
        }
        
        if (elements.batchList) {
            elements.batchList.innerHTML = '';
            files.forEach((file, index) => {
                const fileItem = document.createElement('div');
                fileItem.className = 'batch-file-item';
                fileItem.innerHTML = `
                    <span class="file-index">${index + 1}</span>
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">${this.formatFileSize(file.size)}</span>
                `;
                elements.batchList.appendChild(fileItem);
            });
        }
    }
    
    /**
     * 진행률 표시
     */
    showProgress(percent, message = '') {
        const elements = this.stateManager.getElements();
        
        if (elements.progressSection) {
            elements.progressSection.style.display = 'block';
        }
        
        if (elements.progressFill) {
            elements.progressFill.style.width = `${Math.min(100, Math.max(0, percent * 100))}%`;
        }
        
        if (elements.progressText) {
            elements.progressText.textContent = message;
        }
        
        console.log(`진행률: ${(percent * 100).toFixed(1)}% - ${message}`);
    }
    
    /**
     * 배치 진행률 표시
     */
    showBatchProgress(current, total, message = '') {
        const elements = this.stateManager.getElements();
        const percent = total > 0 ? current / total : 0;
        
        if (elements.batchProgress) {
            elements.batchProgress.style.display = 'block';
        }
        
        if (elements.batchProgressFill) {
            elements.batchProgressFill.style.width = `${Math.min(100, Math.max(0, percent * 100))}%`;
        }
        
        if (elements.batchProgressText) {
            elements.batchProgressText.textContent = `${current}/${total} - ${message}`;
        }
        
        console.log(`배치 진행률: ${current}/${total} (${(percent * 100).toFixed(1)}%) - ${message}`);
    }
    
    /**
     * 알림 표시
     */
    showNotification(message, type = 'info', duration = 3000) {
        // 기존 알림 제거
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }
        
        // 알림 요소 생성 또는 업데이트
        let notification = document.getElementById('notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 4px;
                color: white;
                font-weight: bold;
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.3s;
                max-width: 300px;
                word-wrap: break-word;
            `;
            document.body.appendChild(notification);
        }
        
        // 타입별 스타일 설정
        const typeStyles = {
            info: '#17a2b8',
            success: '#28a745',
            warning: '#ffc107',
            error: '#dc3545'
        };
        
        notification.style.backgroundColor = typeStyles[type] || typeStyles.info;
        notification.textContent = message;
        notification.style.opacity = '1';
        
        // 자동 숨김
        this.notificationTimeout = setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
        
        console.log(`알림 (${type}): ${message}`);
    }
    
    /**
     * 결과 표시
     */
    showResults(results) {
        const elements = this.stateManager.getElements();
        
        if (elements.resultsSection) {
            elements.resultsSection.style.display = 'block';
        }
        
        if (elements.resultsContainer) {
            elements.resultsContainer.innerHTML = this.generateResultsHTML(results);
        }
        
        console.log('결과 표시:', results);
    }
    
    /**
     * UI 상태 초기화
     */
    resetUIState() {
        const elements = this.stateManager.getElements();
        
        // 진행률 숨기기
        if (elements.progressSection) {
            elements.progressSection.style.display = 'none';
        }
        
        if (elements.batchProgress) {
            elements.batchProgress.style.display = 'none';
        }
        
        // 진행률 리셋
        if (elements.progressFill) {
            elements.progressFill.style.width = '0%';
        }
        
        if (elements.batchProgressFill) {
            elements.batchProgressFill.style.width = '0%';
        }
        
        // 텍스트 리셋
        if (elements.progressText) {
            elements.progressText.textContent = '';
        }
        
        if (elements.batchProgressText) {
            elements.batchProgressText.textContent = '';
        }
        
        // 결과 숨기기
        if (elements.resultsSection) {
            elements.resultsSection.style.display = 'none';
        }
        
        console.log('🎨 UI 상태 초기화 완료');
    }
    
    /**
     * 파일 크기 포맷팅
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * 결과 HTML 생성
     */
    generateResultsHTML(results) {
        // 기본 결과 HTML 생성 로직
        // 실제 구현은 기존 코드에서 가져와야 함
        return `
            <div class="results-summary">
                <h3>처리 완료</h3>
                <p>총 ${results.totalCount || 0}개의 파일이 처리되었습니다.</p>
            </div>
        `;
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIController;
} else {
    // 강제로 전역 스코프에 등록
    if (typeof window !== 'undefined') {
        window.UIController = UIController;
    }
    if (typeof global !== 'undefined') {
        global.UIController = UIController;
    }
}

// 로드 확인 로그
console.log('✅ UIController 모듈 로드됨');
console.log('window.UIController 등록됨:', typeof window.UIController);

// 등록 재시도
setTimeout(() => {
    if (typeof window.UIController === 'undefined') {
        console.log('🔄 UIController 재등록 시도...');
        window.UIController = UIController;
        console.log('재등록 결과:', typeof window.UIController);
    }
}, 100);