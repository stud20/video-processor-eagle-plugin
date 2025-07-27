/**
 * Settings Manager Module
 * 플러그인 설정 관리 및 UI 동기화
 */
class SettingsManager {
    constructor(stateManager, uiController) {
        this.stateManager = stateManager;
        this.uiController = uiController;
        
        // 기본 설정값
        this.defaultSettings = {
            // 비디오 분석 설정
            sensitivity: 0.3,
            inHandle: 3,
            outHandle: 3,
            
            // 출력 설정
            format: 'png',
            quality: 8,
            
            // 추출 방식 설정
            extractionMethod: 'unified',
            duplicateHandling: 'overwrite',
            
            // 프레임 설정
            analysisFrameNaming: false,
            smartFrameSelection: true,
            targetFrameCount: 10,
            
            // 실시간 감지 설정
            realtimeDetection: false,
            checkInterval: 1000
        };
        
        // 현재 설정
        this.currentSettings = { ...this.defaultSettings };
        
        console.log('⚙️ SettingsManager 초기화 완료');
    }
    
    /**
     * UI에서 설정 읽어오기
     */
    readFromUI() {
        try {
            const elements = this.stateManager.getElements();
            const settings = {};
            
            // 민감도 슬라이더
            if (elements.sensitivitySlider) {
                settings.sensitivity = parseFloat(elements.sensitivitySlider.value) || this.defaultSettings.sensitivity;
            }
            
            // 포맷 선택
            if (elements.formatSelect) {
                settings.format = elements.formatSelect.value || this.defaultSettings.format;
            }
            
            // 품질 슬라이더
            if (elements.qualitySlider) {
                settings.quality = parseInt(elements.qualitySlider.value) || this.defaultSettings.quality;
            }
            
            // 핸들 슬라이더들
            if (elements.inHandleSlider) {
                settings.inHandle = parseInt(elements.inHandleSlider.value) || this.defaultSettings.inHandle;
            }
            
            if (elements.outHandleSlider) {
                settings.outHandle = parseInt(elements.outHandleSlider.value) || this.defaultSettings.outHandle;
            }
            
            // 추출 방식
            if (elements.extractionMethod) {
                settings.extractionMethod = elements.extractionMethod.value || this.defaultSettings.extractionMethod;
            }
            
            // 중복 파일 처리
            if (elements.duplicateHandling) {
                settings.duplicateHandling = elements.duplicateHandling.value || this.defaultSettings.duplicateHandling;
            }
            
            // 체크박스 설정들
            if (elements.analysisFrameNaming) {
                settings.analysisFrameNaming = elements.analysisFrameNaming.checked;
            }
            
            if (elements.smartFrameSelection) {
                settings.smartFrameSelection = elements.smartFrameSelection.checked;
            }
            
            // 대상 프레임 수
            if (elements.targetFrameCount) {
                settings.targetFrameCount = parseInt(elements.targetFrameCount.value) || this.defaultSettings.targetFrameCount;
            }
            
            // 실시간 감지 토글
            if (elements.realtimeToggle) {
                settings.realtimeDetection = elements.realtimeToggle.checked;
            }
            
            // 현재 설정 업데이트
            this.currentSettings = { ...this.currentSettings, ...settings };
            
            console.log('📖 UI에서 설정 읽어옴:', this.currentSettings);
            return this.currentSettings;
            
        } catch (error) {
            console.error('UI 설정 읽기 실패:', error);
            return this.currentSettings;
        }
    }
    
    /**
     * UI에 설정 적용
     */
    applyToUI(settings = null) {
        try {
            const targetSettings = settings || this.currentSettings;
            const elements = this.stateManager.getElements();
            
            // 민감도 슬라이더
            if (elements.sensitivitySlider && targetSettings.sensitivity !== undefined) {
                elements.sensitivitySlider.value = targetSettings.sensitivity;
                this.updateSensitivityValue();
            }
            
            // 포맷 선택
            if (elements.formatSelect && targetSettings.format) {
                elements.formatSelect.value = targetSettings.format;
            }
            
            // 품질 슬라이더
            if (elements.qualitySlider && targetSettings.quality !== undefined) {
                elements.qualitySlider.value = targetSettings.quality;
                this.updateQualityValue();
            }
            
            // 핸들 슬라이더들
            if (elements.inHandleSlider && targetSettings.inHandle !== undefined) {
                elements.inHandleSlider.value = targetSettings.inHandle;
                this.updateInHandleValue();
            }
            
            if (elements.outHandleSlider && targetSettings.outHandle !== undefined) {
                elements.outHandleSlider.value = targetSettings.outHandle;
                this.updateOutHandleValue();
            }
            
            // 추출 방식
            if (elements.extractionMethod && targetSettings.extractionMethod) {
                elements.extractionMethod.value = targetSettings.extractionMethod;
            }
            
            // 중복 파일 처리
            if (elements.duplicateHandling && targetSettings.duplicateHandling) {
                elements.duplicateHandling.value = targetSettings.duplicateHandling;
            }
            
            // 체크박스 설정들
            if (elements.analysisFrameNaming && targetSettings.analysisFrameNaming !== undefined) {
                elements.analysisFrameNaming.checked = targetSettings.analysisFrameNaming;
            }
            
            if (elements.smartFrameSelection && targetSettings.smartFrameSelection !== undefined) {
                elements.smartFrameSelection.checked = targetSettings.smartFrameSelection;
                this.toggleSmartSelectionOptions(targetSettings.smartFrameSelection);
            }
            
            // 대상 프레임 수
            if (elements.targetFrameCount && targetSettings.targetFrameCount !== undefined) {
                elements.targetFrameCount.value = targetSettings.targetFrameCount;
                this.updateTargetFrameCountValue();
            }
            
            // 실시간 감지 토글
            if (elements.realtimeToggle && targetSettings.realtimeDetection !== undefined) {
                elements.realtimeToggle.checked = targetSettings.realtimeDetection;
            }
            
            console.log('📝 UI에 설정 적용 완료:', targetSettings);
            
        } catch (error) {
            console.error('UI 설정 적용 실패:', error);
        }
    }
    
    /**
     * 설정값 가져오기
     */
    getSettings() {
        return { ...this.currentSettings };
    }
    
    /**
     * 설정값 업데이트
     */
    updateSettings(newSettings) {
        this.currentSettings = { ...this.currentSettings, ...newSettings };
        console.log('⚙️ 설정 업데이트됨:', this.currentSettings);
        
        // UI에도 반영
        this.applyToUI();
    }
    
    /**
     * 기본값으로 리셋
     */
    resetToDefaults() {
        this.currentSettings = { ...this.defaultSettings };
        this.applyToUI();
        
        console.log('🔄 설정이 기본값으로 리셋됨');
        
        if (this.uiController) {
            this.uiController.showNotification('설정이 기본값으로 리셋되었습니다.', 'info');
        }
    }
    
    /**
     * 설정 검증
     */
    validateSettings(settings) {
        const validated = {};
        
        // 민감도 (0.1 ~ 0.7)
        if (settings.sensitivity !== undefined) {
            validated.sensitivity = Math.max(0.1, Math.min(0.7, parseFloat(settings.sensitivity) || 0.3));
        }
        
        // 품질 (1 ~ 10)
        if (settings.quality !== undefined) {
            validated.quality = Math.max(1, Math.min(10, parseInt(settings.quality) || 8));
        }
        
        // 핸들 값들 (0 ~ 10)
        if (settings.inHandle !== undefined) {
            validated.inHandle = Math.max(0, Math.min(10, parseInt(settings.inHandle) || 3));
        }
        
        if (settings.outHandle !== undefined) {
            validated.outHandle = Math.max(0, Math.min(10, parseInt(settings.outHandle) || 3));
        }
        
        // 대상 프레임 수 (5 ~ 20)
        if (settings.targetFrameCount !== undefined) {
            validated.targetFrameCount = Math.max(5, Math.min(20, parseInt(settings.targetFrameCount) || 10));
        }
        
        // 문자열 설정들
        const validFormats = ['jpg', 'png'];
        if (settings.format && validFormats.includes(settings.format)) {
            validated.format = settings.format;
        }
        
        const validExtractionMethods = ['unified', 'parallel'];
        if (settings.extractionMethod && validExtractionMethods.includes(settings.extractionMethod)) {
            validated.extractionMethod = settings.extractionMethod;
        }
        
        const validDuplicateHandling = ['overwrite', 'skip'];
        if (settings.duplicateHandling && validDuplicateHandling.includes(settings.duplicateHandling)) {
            validated.duplicateHandling = settings.duplicateHandling;
        }
        
        // 불린 설정들
        if (settings.analysisFrameNaming !== undefined) {
            validated.analysisFrameNaming = Boolean(settings.analysisFrameNaming);
        }
        
        if (settings.smartFrameSelection !== undefined) {
            validated.smartFrameSelection = Boolean(settings.smartFrameSelection);
        }
        
        if (settings.realtimeDetection !== undefined) {
            validated.realtimeDetection = Boolean(settings.realtimeDetection);
        }
        
        return validated;
    }
    
    /**
     * 개별 설정값 업데이트 함수들
     */
    updateSensitivityValue() {
        const elements = this.stateManager.getElements();
        if (elements.sensitivitySlider && elements.sensitivityValue) {
            elements.sensitivityValue.textContent = elements.sensitivitySlider.value;
        }
    }
    
    updateQualityValue() {
        const elements = this.stateManager.getElements();
        if (elements.qualitySlider && elements.qualityValue) {
            elements.qualityValue.textContent = elements.qualitySlider.value;
        }
    }
    
    updateInHandleValue() {
        const elements = this.stateManager.getElements();
        if (elements.inHandleSlider && elements.inHandleValue) {
            elements.inHandleValue.textContent = `+${elements.inHandleSlider.value}`;
        }
    }
    
    updateOutHandleValue() {
        const elements = this.stateManager.getElements();
        if (elements.outHandleSlider && elements.outHandleValue) {
            elements.outHandleValue.textContent = `-${elements.outHandleSlider.value}`;
        }
    }
    
    updateTargetFrameCountValue() {
        const elements = this.stateManager.getElements();
        if (elements.targetFrameCount && elements.targetFrameCountValue) {
            elements.targetFrameCountValue.textContent = elements.targetFrameCount.value;
        }
    }
    
    /**
     * 스마트 선별 옵션 토글
     */
    toggleSmartSelectionOptions(enabled) {
        const elements = this.stateManager.getElements();
        if (elements.smartSelectionOptions) {
            elements.smartSelectionOptions.style.display = enabled ? 'block' : 'none';
        }
    }
    
    /**
     * 설정 내보내기 (JSON)
     */
    exportSettings() {
        const settings = this.getSettings();
        const exportData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            settings
        };
        
        return JSON.stringify(exportData, null, 2);
    }
    
    /**
     * 설정 가져오기 (JSON)
     */
    importSettings(jsonString) {
        try {
            const importData = JSON.parse(jsonString);
            
            if (importData.settings) {
                const validatedSettings = this.validateSettings(importData.settings);
                this.updateSettings(validatedSettings);
                
                console.log('📥 설정 가져오기 완료:', validatedSettings);
                
                if (this.uiController) {
                    this.uiController.showNotification('설정을 성공적으로 가져왔습니다.', 'success');
                }
                
                return true;
            } else {
                throw new Error('유효하지 않은 설정 파일 형식');
            }
            
        } catch (error) {
            console.error('설정 가져오기 실패:', error);
            
            if (this.uiController) {
                this.uiController.showNotification('설정 가져오기에 실패했습니다.', 'error');
            }
            
            return false;
        }
    }
    
    /**
     * 현재 상태 조회
     */
    getStatus() {
        return {
            currentSettings: this.getSettings(),
            defaultSettings: this.defaultSettings,
            hasChanges: JSON.stringify(this.currentSettings) !== JSON.stringify(this.defaultSettings)
        };
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SettingsManager;
} else {
    // 전역 스코프에 등록
    if (typeof window !== 'undefined') {
        window.SettingsManager = SettingsManager;
    }
    if (typeof global !== 'undefined') {
        global.SettingsManager = SettingsManager;
    }
}

// 로드 확인 로그
console.log('✅ SettingsManager 모듈 로드됨');
console.log('window.SettingsManager 등록됨:', typeof window.SettingsManager);

// 등록 재시도
setTimeout(() => {
    if (typeof window.SettingsManager === 'undefined') {
        console.log('🔄 SettingsManager 재등록 시도...');
        window.SettingsManager = SettingsManager;
        console.log('재등록 결과:', typeof window.SettingsManager);
    }
}, 100);