/**
 * Eagle Integration Module
 * Eagle API 연동 및 파일 관리 시스템
 */
class EagleIntegration {
    constructor(stateManager, uiController, errorHandler) {
        this.stateManager = stateManager;
        this.uiController = uiController;
        this.errorHandler = errorHandler;
        
        // Eagle API 상태
        this.isEagleReady = false;
        this.eagleUtils = null;
        this.eagleAPI = null;
        
        // 실시간 감지 설정
        this.realtimeDetection = {
            enabled: false,
            pollingInterval: null,
            checkInterval: 1000, // 1초
            lastSelectionIds: []
        };
        
        console.log('🦅 EagleIntegration 초기화 완료');
    }
    
    /**
     * Eagle API 초기화
     */
    async initialize() {
        try {
            console.log('🦅 Eagle API 연결 시도...');
            
            // Eagle API 존재 확인
            if (typeof eagle === 'undefined') {
                console.warn('⚠️ Eagle API가 존재하지 않습니다');
                return false;
            }
            
            // EagleUtils 모듈 확인
            if (typeof window.eagleUtils === 'undefined') {
                console.warn('⚠️ EagleUtils 모듈이 로드되지 않았습니다');
                return false;
            }
            
            this.eagleAPI = eagle;
            this.eagleUtils = window.eagleUtils;
            
            // Eagle API 버전 확인
            const version = this.eagleAPI.app?.version || 'unknown';
            console.log(`✅ Eagle API 연결 성공 (버전: ${version})`);
            
            this.isEagleReady = true;
            this.stateManager.setEagleReady(true);
            
            // 초기 파일 감지
            setTimeout(() => this.detectSelectedFiles(), 1000);
            
            return true;
            
        } catch (error) {
            console.error('❌ Eagle API 초기화 실패:', error);
            await this.errorHandler.handleError(error, 'eagle_connection', {
                level: 'warning',
                shouldNotify: true
            });
            return false;
        }
    }
    
    /**
     * Eagle에서 선택된 파일 감지
     */
    async detectSelectedFiles() {
        if (!this.isEagleReady) {
            console.log('Eagle API가 준비되지 않았습니다');
            return [];
        }
        
        try {
            console.log('🔍 Eagle에서 선택된 파일 감지 시도...');
            
            // Eagle에서 선택된 아이템 가져오기
            const selectedItems = await this.eagleAPI.item.getSelected();
            
            // 비디오 파일만 필터링
            const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'm4v'];
            const videoFiles = selectedItems.filter(item => 
                videoExtensions.includes(item.ext.toLowerCase())
            );
            
            console.log(`📹 Eagle에서 감지된 비디오 파일: ${videoFiles.length}개`);
            
            if (videoFiles.length > 0) {
                // 파일 경로 확인 및 보완
                const filesWithPaths = await this.getFilePaths(videoFiles);
                
                if (filesWithPaths.length > 0) {
                    // 선택 변화 감지
                    const currentIds = filesWithPaths.map(f => f.id).sort().join(',');
                    const previousIds = this.realtimeDetection.lastSelectionIds.join(',');
                    
                    if (currentIds !== previousIds) {
                        console.log(`🔄 선택 변화 감지: ${this.stateManager.getSelectedFiles().length} → ${filesWithPaths.length}개`);
                        
                        // 상태 업데이트
                        this.stateManager.setSelectedFiles(filesWithPaths);
                        this.stateManager.setCurrentVideoFile(filesWithPaths[0]);
                        this.stateManager.setBatchMode(filesWithPaths.length > 1);
                        
                        this.realtimeDetection.lastSelectionIds = filesWithPaths.map(f => f.id);
                        
                        // UI 업데이트 알림
                        this.updateSelectionUI(filesWithPaths);
                        
                        // 사용자 알림
                        if (filesWithPaths.length === 1) {
                            this.uiController.showNotification(`✅ 실시간 감지: ${filesWithPaths[0].name}`, 'success');
                        } else {
                            this.uiController.showNotification(`📚 다중 선택 감지: ${filesWithPaths.length}개 비디오 (배치 모드)`, 'info');
                        }
                    }
                    
                    return filesWithPaths;
                } else {
                    console.warn('⚠️ 선택된 비디오 파일들의 경로를 찾을 수 없음');
                    if (this.stateManager.getSelectedFiles().length > 0) {
                        this.clearSelection();
                    }
                }
            } else {
                // 선택된 비디오 파일이 없음
                if (this.stateManager.getSelectedFiles().length > 0) {
                    console.log('🗑️ 비디오 선택 해제 감지');
                    this.clearSelection();
                }
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ 파일 감지 실패:', error);
            return [];
        }
    }
    
    /**
     * 파일 경로 확인 및 보완
     */
    async getFilePaths(videoFiles) {
        const filesWithPaths = [];
        
        for (const item of videoFiles) {
            console.log('선택된 아이템:', item);
            
            // 먼저 아이템 자체에 경로가 있는지 확인
            let filePath = item.filePath || item.path || item.url;
            
            // 경로가 없으면 API로 상세 정보 가져오기
            if (!filePath) {
                try {
                    const response = await fetch(`http://localhost:41595/api/item/info?id=${item.id}`);
                    const detailInfo = await response.json();
                    
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
        
        return filesWithPaths;
    }
    
    /**
     * 선택 해제 처리
     */
    clearSelection() {
        this.stateManager.resetFileSelection();
        this.realtimeDetection.lastSelectionIds = [];
        
        // UI 업데이트
        this.updateSelectionUI([]);
    }
    
    /**
     * 선택 UI 업데이트
     */
    updateSelectionUI(files) {
        try {
            const elements = this.stateManager.getElements();
            
            if (elements.selectedFile) {
                if (files.length === 0) {
                    elements.selectedFile.innerHTML = '<span class="placeholder">Eagle에서 동영상을 선택하세요</span>';
                } else if (files.length === 1) {
                    elements.selectedFile.innerHTML = `
                        <div class="file-item">
                            <span class="file-name">${files[0].name}</span>
                            <span class="file-path">${files[0].path}</span>
                        </div>
                    `;
                } else {
                    elements.selectedFile.innerHTML = `
                        <div class="file-item">
                            <span class="file-name">배치 모드: ${files.length}개 파일</span>
                            <span class="file-path">${files[0].name} 외 ${files.length - 1}개</span>
                        </div>
                    `;
                }
                
                // 시각적 피드백
                if (files.length > 0) {
                    elements.selectedFile.style.transition = 'all 0.2s ease';
                    elements.selectedFile.style.transform = 'scale(0.98)';
                    elements.selectedFile.style.opacity = '0.7';
                    
                    setTimeout(() => {
                        elements.selectedFile.style.transform = 'scale(1)';
                        elements.selectedFile.style.opacity = '1';
                    }, 200);
                }
            }
            
            // 배치 정보 업데이트
            if (elements.batchInfo && elements.batchCount && elements.batchList) {
                if (files.length > 1) {
                    elements.batchInfo.style.display = 'block';
                    elements.batchCount.textContent = files.length;
                    
                    // 배치 리스트 업데이트
                    elements.batchList.innerHTML = files.map(file => `
                        <div class="batch-item">
                            <span class="batch-file-name">${file.name}</span>
                            <span class="batch-file-ext">.${file.ext}</span>
                        </div>
                    `).join('');
                } else {
                    elements.batchInfo.style.display = 'none';
                }
            }
            
        } catch (error) {
            console.error('UI 업데이트 실패:', error);
        }
    }
    
    /**
     * 실시간 감지 시작
     */
    startRealtimeDetection() {
        if (this.realtimeDetection.enabled) {
            console.log('🔄 실시간 감지가 이미 활성화되어 있습니다.');
            return;
        }
        
        if (!this.isEagleReady) {
            console.warn('⚠️ Eagle API가 준비되지 않아 실시간 감지를 시작할 수 없습니다');
            return;
        }
        
        console.log('📸 실시간 비디오 선택 감지 시작...');
        
        // 초기 감지 수행
        this.detectSelectedFiles();
        
        // 1초마다 폴링
        this.realtimeDetection.pollingInterval = setInterval(() => {
            if (this.isEagleReady && !this.stateManager.isProcessing()) {
                this.detectSelectedFiles();
            }
        }, this.realtimeDetection.checkInterval);
        
        this.realtimeDetection.enabled = true;
        console.log('✅ 실시간 선택 감지 활성화됨 (1초 간격)');
        
        // 사용자에게 활성화 알림
        this.uiController.showNotification('🔴 실시간 비디오 감지가 시작되었습니다!', 'success');
    }
    
    /**
     * 실시간 감지 중지
     */
    stopRealtimeDetection() {
        if (!this.realtimeDetection.enabled) {
            return;
        }
        
        if (this.realtimeDetection.pollingInterval) {
            clearInterval(this.realtimeDetection.pollingInterval);
            this.realtimeDetection.pollingInterval = null;
        }
        
        this.realtimeDetection.enabled = false;
        console.log('⏹️ 실시간 선택 감지 중지됨');
    }
    
    /**
     * Eagle 라이브러리 새로고침
     */
    async refreshLibrary() {
        if (!this.isEagleReady) {
            console.warn('Eagle API가 준비되지 않았습니다');
            return false;
        }
        
        try {
            if (this.eagleAPI.library && typeof this.eagleAPI.library.refresh === 'function') {
                await this.eagleAPI.library.refresh();
                console.log('🔄 Eagle 라이브러리 새로고침 완료');
                return true;
            } else {
                console.warn('Eagle 라이브러리 새로고침 API를 사용할 수 없습니다');
                return false;
            }
        } catch (error) {
            console.error('Eagle 라이브러리 새로고침 실패:', error);
            return false;
        }
    }
    
    /**
     * 파일 선택 다이얼로그 표시
     */
    async showFileSelector() {
        if (!this.isEagleReady) {
            this.uiController.showNotification('Eagle API를 사용할 수 없습니다.', 'error');
            return false;
        }
        
        try {
            // Eagle에서 파일이 선택되지 않은 경우 안내
            const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'm4v'];
            
            if (confirm('Eagle 라이브러리에서 비디오 파일을 먼저 선택해야 합니다.\n\n지금 선택하시겠습니까?')) {
                // Eagle의 검색 필터 설정 (비디오 파일만)
                if (this.eagleAPI.app && this.eagleAPI.app.search) {
                    await this.eagleAPI.app.search({
                        ext: videoExtensions
                    });
                    return true;
                }
            }
            
            return false;
            
        } catch (error) {
            console.error('파일 선택 다이얼로그 표시 실패:', error);
            await this.errorHandler.handleError(error, 'file_selection', {
                level: 'error',
                shouldNotify: true
            });
            return false;
        }
    }
    
    /**
     * 현재 상태 조회
     */
    getStatus() {
        return {
            isEagleReady: this.isEagleReady,
            realtimeDetection: { ...this.realtimeDetection },
            selectedFilesCount: this.stateManager.getSelectedFiles().length,
            currentFile: this.stateManager.getCurrentVideoFile()?.name || null
        };
    }
    
    /**
     * Eagle API 재연결
     */
    async reconnect() {
        console.log('🔄 Eagle API 재연결 시도...');
        
        this.isEagleReady = false;
        this.stateManager.setEagleReady(false);
        
        // 실시간 감지 중지
        this.stopRealtimeDetection();
        
        // 재초기화
        const success = await this.initialize();
        
        if (success) {
            console.log('✅ Eagle API 재연결 성공');
            // 실시간 감지 재시작 (이전에 활성화되어 있었다면)
            setTimeout(() => this.startRealtimeDetection(), 1000);
        } else {
            console.error('❌ Eagle API 재연결 실패');
        }
        
        return success;
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EagleIntegration;
} else {
    // 전역 스코프에 등록
    if (typeof window !== 'undefined') {
        window.EagleIntegration = EagleIntegration;
    }
    if (typeof global !== 'undefined') {
        global.EagleIntegration = EagleIntegration;
    }
}

// 로드 확인 로그
console.log('✅ EagleIntegration 모듈 로드됨');
console.log('window.EagleIntegration 등록됨:', typeof window.EagleIntegration);

// 등록 재시도
setTimeout(() => {
    if (typeof window.EagleIntegration === 'undefined') {
        console.log('🔄 EagleIntegration 재등록 시도...');
        window.EagleIntegration = EagleIntegration;
        console.log('재등록 결과:', typeof window.EagleIntegration);
    }
}, 100);