/**
 * ConfigManager - 설정 관리 모듈
 * 플러그인의 모든 설정을 중앙에서 관리합니다.
 */

class ConfigManager {
    constructor() {
        this.defaultConfig = {
            // 처리 설정
            processing: {
                sensitivity: 0.3,           // 컷 변화 감지 민감도
                inHandle: 3,                // In 포인트 핸들 (프레임)
                outHandle: 3,               // Out 포인트 핸들 (프레임)
                extractionMethod: 'unified', // 'unified' | 'parallel'
                concurrency: 8,             // 동시 처리 수
                useFrameAccuracy: true      // 프레임 정확도 사용
            },

            // 출력 설정
            output: {
                imageFormat: 'jpg',         // 'jpg' | 'png'
                quality: 8,                 // 1-10
                videoFormat: 'mp4',         // 출력 비디오 포맷
                videoCodec: 'libx264',      // 비디오 코덱
                videoQuality: 'crf=23'      // 비디오 품질
            },

            // Eagle 통합 설정
            eagle: {
                autoImport: true,           // 자동 임포트
                createFolders: true,        // 폴더 자동 생성
                duplicateHandling: 'overwrite', // 'overwrite' | 'skip' | 'rename'
                skipDuplicateCheck: false,  // 중복 체크 건너뛰기 (성능)
                defaultTags: ['video-processor'], // 기본 태그
                addTimestampTag: true       // 타임스탬프 태그 추가
            },

            // 캐시 설정
            cache: {
                enabled: true,              // 캐시 사용
                cleanupAfterImport: false,  // 임포트 후 정리
                maxCacheSize: 1024,         // MB 단위 최대 캐시 크기
                cacheExpiration: 7          // 일 단위 캐시 만료
            },

            // 성능 설정
            performance: {
                maxConcurrency: 12,         // 최대 동시 처리
                memoryThreshold: 80,        // 메모리 사용률 임계값 (%)
                enableGPUAcceleration: false, // GPU 가속 사용
                ffmpegThreads: 0            // FFmpeg 스레드 (0 = 자동)
            },

            // UI 설정
            ui: {
                showProgressDetails: true,   // 세부 진행률 표시
                enableNotifications: true,   // 알림 활성화
                autoHideOnComplete: false,   // 완료 시 자동 숨김
                theme: 'auto'               // 'auto' | 'light' | 'dark'
            }
        };

        this.currentConfig = { ...this.defaultConfig };
        this.configKey = 'video-processor-config';
        this.loadConfig();
    }

    /**
     * 설정 로드
     */
    loadConfig() {
        try {
            const savedConfig = localStorage.getItem(this.configKey);
            if (savedConfig) {
                const parsed = JSON.parse(savedConfig);
                this.currentConfig = this.mergeConfig(this.defaultConfig, parsed);
                console.log('설정 로드 완료');
            }
        } catch (error) {
            console.error('설정 로드 실패:', error);
            this.currentConfig = { ...this.defaultConfig };
        }
    }

    /**
     * 설정 저장
     */
    saveConfig() {
        try {
            localStorage.setItem(this.configKey, JSON.stringify(this.currentConfig));
            console.log('설정 저장 완료');
        } catch (error) {
            console.error('설정 저장 실패:', error);
        }
    }

    /**
     * 설정 병합 (깊은 병합)
     * @param {Object} defaultConfig - 기본 설정
     * @param {Object} userConfig - 사용자 설정
     * @returns {Object} 병합된 설정
     */
    mergeConfig(defaultConfig, userConfig) {
        const merged = { ...defaultConfig };
        
        for (const key in userConfig) {
            if (userConfig.hasOwnProperty(key)) {
                if (typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
                    merged[key] = this.mergeConfig(merged[key] || {}, userConfig[key]);
                } else {
                    merged[key] = userConfig[key];
                }
            }
        }
        
        return merged;
    }

    /**
     * 특정 설정 값 가져오기
     * @param {string} path - 설정 경로 (예: 'processing.sensitivity')
     * @returns {any} 설정 값
     */
    get(path) {
        const keys = path.split('.');
        let value = this.currentConfig;
        
        for (const key of keys) {
            if (value && value.hasOwnProperty(key)) {
                value = value[key];
            } else {
                console.warn(`설정 경로를 찾을 수 없습니다: ${path}`);
                return undefined;
            }
        }
        
        return value;
    }

    /**
     * 특정 설정 값 설정
     * @param {string} path - 설정 경로
     * @param {any} value - 설정할 값
     */
    set(path, value) {
        const keys = path.split('.');
        let config = this.currentConfig;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!config[key] || typeof config[key] !== 'object') {
                config[key] = {};
            }
            config = config[key];
        }
        
        config[keys[keys.length - 1]] = value;
        this.saveConfig();
    }

    /**
     * 여러 설정 일괄 업데이트
     * @param {Object} updates - 업데이트할 설정들
     */
    update(updates) {
        this.currentConfig = this.mergeConfig(this.currentConfig, updates);
        this.saveConfig();
    }

    /**
     * 설정 초기화
     */
    reset() {
        this.currentConfig = { ...this.defaultConfig };
        this.saveConfig();
        console.log('설정이 초기화되었습니다.');
    }

    /**
     * 현재 설정 전체 가져오기
     * @returns {Object} 현재 설정
     */
    getAll() {
        return { ...this.currentConfig };
    }

    /**
     * 설정 유효성 검증
     * @param {string} category - 설정 카테고리
     * @returns {Array} 유효성 검증 오류 배열
     */
    validate(category = null) {
        const errors = [];
        const config = category ? this.get(category) : this.currentConfig;

        // 처리 설정 검증
        if (!category || category === 'processing') {
            const processing = this.get('processing');
            if (processing.sensitivity < 0.1 || processing.sensitivity > 1.0) {
                errors.push('민감도는 0.1에서 1.0 사이여야 합니다.');
            }
            if (processing.inHandle < 0 || processing.inHandle > 30) {
                errors.push('In 핸들은 0에서 30 사이여야 합니다.');
            }
            if (processing.outHandle < 0 || processing.outHandle > 30) {
                errors.push('Out 핸들은 0에서 30 사이여야 합니다.');
            }
        }

        // 출력 설정 검증
        if (!category || category === 'output') {
            const output = this.get('output');
            if (!['jpg', 'png'].includes(output.imageFormat)) {
                errors.push('이미지 포맷은 jpg 또는 png여야 합니다.');
            }
            if (output.quality < 1 || output.quality > 10) {
                errors.push('품질은 1에서 10 사이여야 합니다.');
            }
        }

        // 성능 설정 검증
        if (!category || category === 'performance') {
            const performance = this.get('performance');
            if (performance.maxConcurrency < 1 || performance.maxConcurrency > 32) {
                errors.push('최대 동시 처리는 1에서 32 사이여야 합니다.');
            }
        }

        return errors;
    }

    /**
     * FFmpeg 설정 생성
     * @returns {Object} FFmpeg 관련 설정
     */
    getFFmpegConfig() {
        return {
            quality: this.get('output.quality'),
            imageFormat: this.get('output.imageFormat'),
            videoFormat: this.get('output.videoFormat'),
            videoCodec: this.get('output.videoCodec'),
            videoQuality: this.get('output.videoQuality'),
            threads: this.get('performance.ffmpegThreads'),
            enableGPU: this.get('performance.enableGPUAcceleration')
        };
    }

    /**
     * Eagle 임포트 설정 생성
     * @param {Object} additionalOptions - 추가 옵션
     * @returns {Object} Eagle 임포트 옵션
     */
    getEagleImportOptions(additionalOptions = {}) {
        const baseOptions = {
            tags: [...this.get('eagle.defaultTags')],
            folders: [],
            annotation: 'Video Processor에서 추출됨',
            createFolder: this.get('eagle.createFolders'),
            allowDuplicates: this.get('eagle.duplicateHandling') === 'overwrite',
            skipDuplicateCheck: this.get('eagle.skipDuplicateCheck')
        };

        // 타임스탬프 태그 추가
        if (this.get('eagle.addTimestampTag')) {
            const timestamp = new Date().toISOString().split('T')[0];
            baseOptions.tags.push(`extracted-${timestamp}`);
        }

        return { ...baseOptions, ...additionalOptions };
    }

    /**
     * 성능 프로파일 가져오기
     * @param {string} profile - 'fast' | 'balanced' | 'quality'
     * @returns {Object} 성능 프로파일 설정
     */
    getPerformanceProfile(profile = 'balanced') {
        const profiles = {
            fast: {
                extractionMethod: 'unified',
                maxConcurrency: 12,
                imageFormat: 'jpg',
                quality: 6,
                enableGPUAcceleration: true,
                skipDuplicateCheck: true
            },
            balanced: {
                extractionMethod: 'unified',
                maxConcurrency: 8,
                imageFormat: 'jpg',
                quality: 8,
                enableGPUAcceleration: false,
                skipDuplicateCheck: false
            },
            quality: {
                extractionMethod: 'parallel',
                maxConcurrency: 4,
                imageFormat: 'png',
                quality: 10,
                enableGPUAcceleration: false,
                skipDuplicateCheck: false
            }
        };

        return profiles[profile] || profiles.balanced;
    }

    /**
     * 현재 설정을 JSON으로 내보내기
     * @returns {string} JSON 설정 문자열
     */
    exportConfig() {
        return JSON.stringify(this.currentConfig, null, 2);
    }

    /**
     * JSON에서 설정 가져오기
     * @param {string} jsonConfig - JSON 설정 문자열
     */
    importConfig(jsonConfig) {
        try {
            const imported = JSON.parse(jsonConfig);
            this.currentConfig = this.mergeConfig(this.defaultConfig, imported);
            this.saveConfig();
            console.log('설정 가져오기 완료');
        } catch (error) {
            console.error('설정 가져오기 실패:', error);
            throw new Error('잘못된 설정 형식입니다.');
        }
    }
}

// 싱글톤 인스턴스 생성 및 전역 등록
const configManager = new ConfigManager();
window.ConfigManager = ConfigManager;
window.configManager = configManager;

// 모듈 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ConfigManager, configManager };
}
