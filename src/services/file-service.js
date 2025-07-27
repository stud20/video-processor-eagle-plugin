/**
 * File Service Module
 * 파일 선택, 검증, 경로 처리 통합 서비스
 */
class FileService {
    constructor(stateManager, uiController, errorHandler, eagleIntegration) {
        this.stateManager = stateManager;
        this.uiController = uiController;
        this.errorHandler = errorHandler;
        this.eagleIntegration = eagleIntegration;
        
        // 지원되는 비디오 확장자
        this.supportedVideoExtensions = [
            'mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'm4v',
            'asf', 'mpg', 'mpeg', 'vob', 'ogv', '3gp', 'f4v'
        ];
        
        // 파일 검증 설정
        this.validation = {
            maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB
            minFileSize: 1024, // 1KB
            maxBatchSize: 50 // 최대 배치 파일 수
        };
        
        console.log('📁 FileService 초기화 완료');
    }
    
    /**
     * 파일 선택 처리
     */
    async selectFiles() {
        try {
            console.log('📁 파일 선택 프로세스 시작...');
            
            if (this.stateManager.isProcessing()) {
                this.uiController.showNotification('처리 중에는 파일을 선택할 수 없습니다.', 'warning');
                return false;
            }
            
            // Eagle을 통한 파일 선택
            if (this.eagleIntegration && this.eagleIntegration.isEagleReady) {
                return await this.selectFromEagle();
            } else {
                this.uiController.showNotification('Eagle API를 사용할 수 없습니다.', 'error');
                return false;
            }
            
        } catch (error) {
            console.error('파일 선택 실패:', error);
            await this.errorHandler.handleError(error, 'file_selection', {
                level: 'error',
                shouldNotify: true
            });
            return false;
        }
    }
    
    /**
     * Eagle에서 파일 선택
     */
    async selectFromEagle() {
        try {
            // Eagle에서 현재 선택된 파일 가져오기
            const selectedFiles = await this.eagleIntegration.detectSelectedFiles();
            
            if (selectedFiles.length === 0) {
                // 선택된 파일이 없으면 파일 선택 가이드 표시
                return await this.showFileSelectionGuide();
            }
            
            // 파일 검증
            const validatedFiles = await this.validateFiles(selectedFiles);
            
            if (validatedFiles.length === 0) {
                this.uiController.showNotification('유효한 비디오 파일이 없습니다.', 'warning');
                return false;
            }
            
            // 파일 경로 보완
            const filesWithPaths = await this.resolveFilePaths(validatedFiles);
            
            if (filesWithPaths.length === 0) {
                this.uiController.showNotification('파일 경로를 찾을 수 없습니다.', 'error');
                return false;
            }
            
            // 상태 업데이트
            this.updateFileSelection(filesWithPaths);
            
            // 성공 알림
            const message = filesWithPaths.length === 1 
                ? `파일 선택 완료: ${filesWithPaths[0].name}`
                : `${filesWithPaths.length}개 파일 선택 완료 (배치 모드)`;
            
            this.uiController.showNotification(message, 'success');
            
            console.log(`✅ 파일 선택 완료: ${filesWithPaths.length}개`);
            return true;
            
        } catch (error) {
            console.error('Eagle 파일 선택 실패:', error);
            throw error;
        }
    }
    
    /**
     * 파일 선택 가이드 표시
     */
    async showFileSelectionGuide() {
        try {
            this.uiController.showNotification('Eagle 라이브러리에서 비디오 파일을 선택해주세요.', 'info');
            
            // Eagle에서 파일 선택 다이얼로그 표시
            if (this.eagleIntegration && typeof this.eagleIntegration.showFileSelector === 'function') {
                const result = await this.eagleIntegration.showFileSelector();
                
                if (result) {
                    // 파일 선택 후 다시 감지 시도
                    setTimeout(async () => {
                        const files = await this.eagleIntegration.detectSelectedFiles();
                        if (files.length > 0) {
                            await this.selectFromEagle();
                        }
                    }, 1000);
                }
                
                return result;
            }
            
            return false;
            
        } catch (error) {
            console.error('파일 선택 가이드 표시 실패:', error);
            return false;
        }
    }
    
    /**
     * 파일 검증
     */
    async validateFiles(files) {
        const validFiles = [];
        const invalidFiles = [];
        
        for (const file of files) {
            try {
                const validation = await this.validateSingleFile(file);
                
                if (validation.isValid) {
                    validFiles.push({
                        ...file,
                        validation
                    });
                } else {
                    invalidFiles.push({
                        file,
                        reason: validation.reason
                    });
                }
                
            } catch (error) {
                console.error(`파일 검증 실패: ${file.name}`, error);
                invalidFiles.push({
                    file,
                    reason: '검증 중 오류 발생'
                });
            }
        }
        
        // 유효하지 않은 파일 알림
        if (invalidFiles.length > 0) {
            console.warn(`⚠️ 유효하지 않은 파일 ${invalidFiles.length}개:`, 
                invalidFiles.map(item => `${item.file.name}: ${item.reason}`));
            
            const message = `${invalidFiles.length}개 파일이 유효하지 않아 제외되었습니다.`;
            this.uiController.showNotification(message, 'warning');
        }
        
        // 배치 크기 제한 확인
        if (validFiles.length > this.validation.maxBatchSize) {
            console.warn(`⚠️ 배치 크기 제한 초과: ${validFiles.length} > ${this.validation.maxBatchSize}`);
            
            const limitedFiles = validFiles.slice(0, this.validation.maxBatchSize);
            const message = `배치 크기 제한으로 처음 ${this.validation.maxBatchSize}개 파일만 선택됩니다.`;
            this.uiController.showNotification(message, 'warning');
            
            return limitedFiles;
        }
        
        return validFiles;
    }
    
    /**
     * 단일 파일 검증
     */
    async validateSingleFile(file) {
        // 확장자 검증
        const ext = (file.ext || '').toLowerCase();
        if (!this.supportedVideoExtensions.includes(ext)) {
            return {
                isValid: false,
                reason: `지원되지 않는 파일 형식: .${ext}`
            };
        }
        
        // 파일 크기 검증 (가능한 경우)
        if (file.size) {
            if (file.size < this.validation.minFileSize) {
                return {
                    isValid: false,
                    reason: '파일 크기가 너무 작습니다'
                };
            }
            
            if (file.size > this.validation.maxFileSize) {
                return {
                    isValid: false,
                    reason: '파일 크기가 너무 큽니다 (10GB 제한)'
                };
            }
        }
        
        // 파일명 검증
        if (!file.name || file.name.trim() === '') {
            return {
                isValid: false,
                reason: '파일명이 없습니다'
            };
        }
        
        return {
            isValid: true,
            reason: '유효한 파일'
        };
    }
    
    /**
     * 파일 경로 확인 및 보완
     */
    async resolveFilePaths(files) {
        const filesWithPaths = [];
        
        for (const file of files) {
            try {
                const resolvedPath = await this.resolveSingleFilePath(file);
                
                if (resolvedPath) {
                    filesWithPaths.push({
                        ...file,
                        path: resolvedPath,
                        filePath: resolvedPath
                    });
                } else {
                    console.warn(`❌ 파일 경로를 찾을 수 없음: ${file.name}`);
                }
                
            } catch (error) {
                console.error(`파일 경로 확인 실패: ${file.name}`, error);
            }
        }
        
        return filesWithPaths;
    }
    
    /**
     * 단일 파일 경로 확인
     */
    async resolveSingleFilePath(file) {
        // 이미 경로가 있는 경우
        let filePath = file.filePath || file.path || file.url;
        
        if (filePath) {
            console.log(`✅ 기존 경로 사용: ${file.name} -> ${filePath}`);
            return filePath;
        }
        
        // Eagle API를 통해 경로 가져오기
        if (file.id) {
            try {
                const response = await fetch(`http://localhost:41595/api/item/info?id=${file.id}`);
                const detailInfo = await response.json();
                
                if (detailInfo.status === 'success' && detailInfo.data) {
                    filePath = detailInfo.data.filePath || 
                              detailInfo.data.path || 
                              detailInfo.data.url ||
                              detailInfo.data.src;
                    
                    if (filePath) {
                        console.log(`✅ API에서 경로 가져옴: ${file.name} -> ${filePath}`);
                        return filePath;
                    }
                }
            } catch (error) {
                console.error(`API 경로 요청 실패: ${file.name}`, error);
            }
        }
        
        console.warn(`❌ 경로를 찾을 수 없음: ${file.name}`);
        return null;
    }
    
    /**
     * 파일 선택 상태 업데이트
     */
    updateFileSelection(files) {
        try {
            // StateManager 상태 업데이트
            this.stateManager.setSelectedFiles(files);
            this.stateManager.setCurrentVideoFile(files[0]);
            this.stateManager.setBatchMode(files.length > 1);
            
            // Eagle Integration에도 알림 (실시간 감지 동기화)
            if (this.eagleIntegration && typeof this.eagleIntegration.updateSelectionUI === 'function') {
                this.eagleIntegration.updateSelectionUI(files);
            }
            
            console.log(`📊 파일 선택 상태 업데이트: ${files.length}개 파일, 배치 모드: ${files.length > 1}`);
            
        } catch (error) {
            console.error('파일 선택 상태 업데이트 실패:', error);
        }
    }

    /**
     * 비디오 파일을 기존 리스트에 추가
     */
    async addVideoToList() {
        try {
            console.log('📝 리스트에 비디오 추가 시작...');
            
            if (this.stateManager.isProcessing()) {
                this.uiController.showNotification('처리 중에는 파일을 추가할 수 없습니다.', 'warning');
                return false;
            }
            
            // Eagle에서 현재 선택된 파일 가져오기
            if (this.eagleIntegration && this.eagleIntegration.isEagleReady) {
                const selectedFiles = await this.eagleIntegration.detectSelectedFiles();
                
                if (selectedFiles.length === 0) {
                    this.uiController.showNotification('Eagle에서 추가할 비디오를 선택해주세요.', 'warning');
                    return false;
                }
                
                // 파일 검증
                const validatedFiles = await this.validateFiles(selectedFiles);
                
                if (validatedFiles.length === 0) {
                    this.uiController.showNotification('유효한 비디오 파일이 없습니다.', 'warning');
                    return false;
                }
                
                // 파일 경로 보완
                const filesWithPaths = await this.resolveFilePaths(validatedFiles);
                
                if (filesWithPaths.length === 0) {
                    this.uiController.showNotification('파일 경로를 찾을 수 없습니다.', 'error');
                    return false;
                }
                
                // 기존 리스트에 추가
                this.stateManager.addVideosToList(filesWithPaths);
                
                // Eagle Integration에도 알림
                if (this.eagleIntegration && typeof this.eagleIntegration.updateSelectionUI === 'function') {
                    this.eagleIntegration.updateSelectionUI(this.stateManager.getSelectedFiles());
                }
                
                // 성공 알림
                const totalFiles = this.stateManager.getSelectedFiles().length;
                const message = `${filesWithPaths.length}개 비디오 추가 완료 (총 ${totalFiles}개)`;
                this.uiController.showNotification(message, 'success');
                
                console.log(`✅ 비디오 추가 완료: +${filesWithPaths.length}개 (총 ${totalFiles}개)`);
                return true;
                
            } else {
                this.uiController.showNotification('Eagle API를 사용할 수 없습니다.', 'error');
                return false;
            }
            
        } catch (error) {
            console.error('비디오 추가 실패:', error);
            await this.errorHandler.handleError(error, 'add_video_to_list', {
                level: 'error',
                shouldNotify: true
            });
            return false;
        }
    }
    
    /**
     * 파일 선택 초기화
     */
    clearSelection() {
        try {
            this.stateManager.resetFileSelection();
            
            // Eagle Integration에도 알림
            if (this.eagleIntegration && typeof this.eagleIntegration.clearSelection === 'function') {
                this.eagleIntegration.clearSelection();
            }
            
            this.uiController.showNotification('파일 선택이 해제되었습니다.', 'info');
            console.log('🗑️ 파일 선택 초기화 완료');
            
        } catch (error) {
            console.error('파일 선택 초기화 실패:', error);
        }
    }
    
    /**
     * 파일 정보 요약
     */
    getSelectionSummary() {
        const files = this.stateManager.getSelectedFiles();
        const currentFile = this.stateManager.getCurrentVideoFile();
        const isBatchMode = this.stateManager.isBatchMode();
        
        return {
            totalFiles: files.length,
            currentFile: currentFile?.name || null,
            isBatchMode,
            files: files.map(file => ({
                name: file.name,
                ext: file.ext,
                path: file.path,
                size: file.size
            }))
        };
    }
    
    /**
     * 파일 경로 검증
     */
    async validateFilePaths(files) {
        const validPaths = [];
        const invalidPaths = [];
        
        for (const file of files) {
            try {
                // 파일 시스템 접근이 가능한 경우에만 검증
                if (window.require && file.path) {
                    const fs = window.require('fs');
                    const exists = fs.existsSync(file.path);
                    
                    if (exists) {
                        validPaths.push(file);
                    } else {
                        invalidPaths.push({
                            file,
                            reason: '파일이 존재하지 않습니다'
                        });
                    }
                } else {
                    // 파일 시스템 접근 불가능한 경우 경로만 확인
                    if (file.path) {
                        validPaths.push(file);
                    } else {
                        invalidPaths.push({
                            file,
                            reason: '파일 경로가 없습니다'
                        });
                    }
                }
                
            } catch (error) {
                console.error(`파일 경로 검증 실패: ${file.name}`, error);
                invalidPaths.push({
                    file,
                    reason: '경로 검증 중 오류 발생'
                });
            }
        }
        
        if (invalidPaths.length > 0) {
            console.warn(`⚠️ 유효하지 않은 경로 ${invalidPaths.length}개:`, 
                invalidPaths.map(item => `${item.file.name}: ${item.reason}`));
        }
        
        return {
            valid: validPaths,
            invalid: invalidPaths
        };
    }
    
    /**
     * 지원되는 파일 형식 확인
     */
    isSupportedVideoFormat(filename) {
        const ext = filename.split('.').pop()?.toLowerCase();
        return this.supportedVideoExtensions.includes(ext);
    }
    
    /**
     * 파일 크기 포맷팅
     */
    formatFileSize(bytes) {
        if (!bytes) return 'Unknown';
        
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    /**
     * 현재 상태 조회
     */
    getStatus() {
        return {
            hasFiles: this.stateManager.getSelectedFiles().length > 0,
            fileCount: this.stateManager.getSelectedFiles().length,
            isBatchMode: this.stateManager.isBatchMode(),
            currentFile: this.stateManager.getCurrentVideoFile()?.name || null,
            supportedExtensions: this.supportedVideoExtensions,
            validation: this.validation
        };
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FileService;
} else {
    // 전역 스코프에 등록
    if (typeof window !== 'undefined') {
        window.FileService = FileService;
    }
    if (typeof global !== 'undefined') {
        global.FileService = FileService;
    }
}

// 로드 확인 로그
console.log('✅ FileService 모듈 로드됨');
console.log('window.FileService 등록됨:', typeof window.FileService);

// 등록 재시도
setTimeout(() => {
    if (typeof window.FileService === 'undefined') {
        console.log('🔄 FileService 재등록 시도...');
        window.FileService = FileService;
        console.log('재등록 결과:', typeof window.FileService);
    }
}, 100);