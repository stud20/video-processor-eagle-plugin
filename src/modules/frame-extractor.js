/**
 * FrameExtractor - 프레임 추출 모듈 (Worker Pool 최적화 버전)
 * 컷 변화 지점의 중간 프레임을 스트리밍 병렬 처리로 추출하고 Eagle에 자동 임포트합니다.
 */

/**
 * FrameExtractionPool - 스트리밍 병렬 처리를 위한 워커 풀
 */
class FrameExtractionPool {
    constructor(maxConcurrency, frameExtractor) {
        this.maxConcurrency = maxConcurrency;
        this.frameExtractor = frameExtractor;
        this.activeWorkers = 0;
        this.taskQueue = [];
        this.results = [];
        this.processedCount = 0;
        this.totalTasks = 0;
        this.onComplete = null;
        this.onProgress = null;
        this.errors = [];
    }

    /**
     * 모든 프레임 처리 (스트리밍 방식)
     * @param {Array} tasks - 작업 목록
     * @param {function} progressCallback - 진행률 콜백
     * @returns {Promise<Array>} 처리 결과
     */
    async processAllFrames(tasks, progressCallback = null) {
        return new Promise((resolve, reject) => {
            this.taskQueue = [...tasks];
            this.totalTasks = tasks.length;
            this.results = new Array(tasks.length); // 순서 보장을 위한 인덱스 배열
            this.processedCount = 0;
            this.errors = [];
            this.onProgress = progressCallback;
            this.onComplete = (results) => {
                if (this.errors.length > 0) {
                    console.warn(`${this.errors.length}개 프레임 추출 실패`);
                }
                resolve(results.filter(Boolean)); // null 제거
            };
            
            console.log(`🚀 Worker Pool 시작: ${this.totalTasks}개 작업, 최대 ${this.maxConcurrency}개 동시 처리`);
            
            // 초기 워커 풀 채우기
            this.fillWorkerPool();
        });
    }

    /**
     * 워커 풀 채우기 (가용한 슬롯만큼 워커 시작)
     */
    fillWorkerPool() {
        while (this.activeWorkers < this.maxConcurrency && this.taskQueue.length > 0) {
            this.startWorker();
        }
        
        // 모든 작업 완료 체크
        if (this.activeWorkers === 0 && this.taskQueue.length === 0) {
            this.onComplete?.(this.results);
        }
    }

    /**
     * 개별 워커 시작
     */
    startWorker() {
        if (this.taskQueue.length === 0) return;
        
        const task = this.taskQueue.shift();
        this.activeWorkers++;
        
        console.log(`⚡ Worker 시작: 프레임 ${task.index + 1}/${this.totalTasks} (활성 워커: ${this.activeWorkers}/${this.maxConcurrency})`);
        
        // 비동기 프레임 추출 실행
        this.extractFrameAsync(task)
            .then(result => {
                // 결과 저장 (순서 보장)
                this.results[task.originalIndex] = result;
                this.processedCount++;
                
                console.log(`✅ Worker 완료: 프레임 ${task.index + 1} (완료: ${this.processedCount}/${this.totalTasks})`);
                
                // 진행률 업데이트
                if (this.onProgress) {
                    this.onProgress(
                        this.processedCount / this.totalTasks,
                        `프레임 ${this.processedCount}/${this.totalTasks} 추출 완료 (활성: ${this.activeWorkers})`
                    );
                }
                
                this.activeWorkers--;
                
                // 즉시 다음 작업 시작 (핵심!)
                this.fillWorkerPool();
            })
            .catch(error => {
                console.error(`❌ Worker 실패: 프레임 ${task.index + 1}:`, error.message);
                this.errors.push({ task, error });
                this.processedCount++;
                
                // 실패해도 진행률 업데이트
                if (this.onProgress) {
                    this.onProgress(
                        this.processedCount / this.totalTasks,
                        `프레임 ${this.processedCount}/${this.totalTasks} 처리 (실패 포함)`
                    );
                }
                
                this.activeWorkers--;
                
                // 실패해도 다음 작업 계속 진행
                this.fillWorkerPool();
            });
    }

    /**
     * 비동기 프레임 추출
     * @param {Object} task - 추출 작업
     * @returns {Promise<Object>} 추출 결과
     */
    async extractFrameAsync(task) {
        let extractTime;
        let extractFrameNumber;
        
        // 프레임 정보가 있는 경우
        if (task.cutPoint.inFrame !== undefined && task.cutPoint.outFrame !== undefined) {
            // 중간 프레임 계산
            const middleFrame = Math.round((task.cutPoint.inFrame + task.cutPoint.outFrame) / 2);
            extractFrameNumber = middleFrame;
            extractTime = task.cutPoint.start + (task.cutPoint.duration / 2);
        } else {
            // 기존 방식: 시간 기반
            extractTime = task.cutPoint.start + (task.cutPoint.duration / 2);
        }
        
        return await this.frameExtractor.extractSingleFrame(
            task.videoPath,
            extractTime,
            task.index + 1,
            task.settings,
            extractFrameNumber
        );
    }

    /**
     * 풀 상태 조회 (디버깅용)
     */
    getStatus() {
        return {
            activeWorkers: this.activeWorkers,
            queuedTasks: this.taskQueue.length,
            processedCount: this.processedCount,
            totalTasks: this.totalTasks,
            completionRate: this.totalTasks > 0 ? (this.processedCount / this.totalTasks * 100).toFixed(1) + '%' : '0%'
        };
    }
}

class FrameExtractor {
    constructor(ffmpegPaths = null, options = {}) {
        // 의존성 주입
        this.eagleUtils = window.eagleUtils || null;
        this.configManager = window.configManager || null;
        
        if (!this.eagleUtils || !this.configManager) {
            console.warn('EagleUtils 또는 ConfigManager가 로드되지 않았습니다.');
        }

        // 설정 초기화
        this.ffmpegPaths = ffmpegPaths;
        this.options = {
            autoImportToEagle: true,
            createVideoFolder: true,
            cleanupAfterImport: false,
            ...options
        };

        // 캐시 디렉토리는 동적으로 설정
        this.outputDir = null;
        this.initialized = false;
    }

    /**
     * 초기화 (비동기)
     * @param {string} videoPath - 처리할 비디오 경로
     */
    async initialize(videoPath = null) {
        if (this.initialized) return;

        try {
            // 비디오 이름으로 하위 폴더 생성
            let baseDir = this.eagleUtils ? 
                await this.eagleUtils.getCacheDirectory('frames') :
                this.getFallbackOutputDir();
                
            // 비디오 파일이 지정된 경우 하위 폴더 생성
            if (videoPath) {
                const videoName = this.eagleUtils?.getBaseName(videoPath) || 'video';
                const path = this.eagleUtils?.getNodeModule('path');
                
                if (path) {
                    this.outputDir = path.join(baseDir, videoName);
                } else {
                    this.outputDir = `${baseDir}/${videoName}`;
                }
            } else {
                this.outputDir = baseDir;
            }

            console.log('FrameExtractor 초기화 완료, 출력 디렉토리:', this.outputDir);
            this.initialized = true;
        } catch (error) {
            console.error('FrameExtractor 초기화 실패:', error);
            this.outputDir = this.getFallbackOutputDir();
            this.initialized = true;
        }
    }

    /**
     * 폴백 출력 디렉토리 생성
     * @returns {string} 폴백 디렉토리 경로
     */
    getFallbackOutputDir() {
        const os = this.eagleUtils?.getNodeModule('os');
        const path = this.eagleUtils?.getNodeModule('path');
        
        if (os && path) {
            return path.join(os.tmpdir(), 'video-processor-frames');
        }
        return './temp/frames';
    }

    /**
     * 출력 디렉토리 생성 확인
     */
    async ensureOutputDirectory() {
        if (!this.initialized) {
            await this.initialize();
        }

        if (this.eagleUtils) {
            await this.eagleUtils.ensureDirectory(this.outputDir);
        } else {
            // 폴백: 직접 디렉토리 생성
            const fs = window.require ? window.require('fs') : null;
            if (fs && !fs.existsSync(this.outputDir)) {
                fs.mkdirSync(this.outputDir, { recursive: true });
            }
        }
    }

    /**
     * FFmpeg 경로 설정
     * @param {Object} ffmpegPaths - ffmpeg, ffprobe 경로 객체
     */
    setFFmpegPaths(ffmpegPaths) {
        this.ffmpegPaths = ffmpegPaths;
    }
    
    /**
     * 프레임 추출 메인 함수 (리팩토링 버전)
     * @param {string} videoPath - 비디오 파일 경로
     * @param {Array} cutPoints - 컷 포인트 배열
     * @param {Object} settings - 추출 설정 (선택사항, ConfigManager에서 가져옴)
     * @param {function} progressCallback - 진행률 콜백
     * @param {Object} ffmpegPaths - ffmpeg, ffprobe 경로 (선택사항)
     * @returns {Promise<Object>} 추출 결과 객체 (Eagle 임포트 결과 포함)
     */
    async extractFrames(videoPath, cutPoints, settings = null, progressCallback = null, ffmpegPaths = null) {
        try {
            // 초기화
            await this.initialize(videoPath);
            
            // 설정 가져오기
            const config = settings || this.getEffectiveConfig();
            
            console.log('프레임 추출 시작:', {
                cutPoints: cutPoints.length,
                outputDir: this.outputDir,
                settings: config
            });
            
            // FFmpeg 경로 설정
            if (ffmpegPaths) {
                this.setFFmpegPaths(ffmpegPaths);
            }
            
            if (!this.ffmpegPaths) {
                throw new Error('FFmpeg 경로가 설정되지 않았습니다.');
            }
            
            await this.ensureOutputDirectory();
            
            const extractedFrames = [];
            const totalFrames = cutPoints.length;
            let processedCount = 0;
            
            // 진행률 콜백 헬퍼
            const updateProgress = (current, message = null) => {
                if (progressCallback) {
                    const progress = current / totalFrames;
                    const defaultMessage = this.eagleUtils?.formatProgress(current, totalFrames, '프레임 추출') || 
                                         `프레임 추출: ${current}/${totalFrames}`;
                    progressCallback(progress, message || defaultMessage);
                }
            };

            updateProgress(0, '프레임 추출 준비 중...');
            
            // 병렬 처리를 위한 준비 (M4 MAX 최적화)
            const os = this.eagleUtils?.getNodeModule('os');
            const cpuCount = os ? os.cpus().length : 4;
            
            // 이미지 추출은 클립 추출보다 가벼우므로 더 많은 병렬 처리 가능
            let maxConcurrency;
            if (cpuCount >= 12) {
                // M4 MAX/Pro 급 (12코어 이상): 최대 성능 활용
                maxConcurrency = Math.min(Math.max(6, Math.floor(cpuCount * 0.9)), 16, cutPoints.length);
            } else if (cpuCount >= 8) {
                // M3/M2 Pro 급 (8-11코어): 적극적 활용
                maxConcurrency = Math.min(Math.max(4, Math.floor(cpuCount * 0.8)), 10, cutPoints.length);
            } else {
                // 일반 CPU (8코어 미만): 안전한 활용
                maxConcurrency = Math.min(Math.max(2, Math.floor(cpuCount * 0.6)), 6, cutPoints.length);
            }
            
            console.log(`🚀 Worker Pool 병렬 프레임 추출: 최대 ${maxConcurrency}개 동시 처리`);
            
            // 작업 목록 생성 (Worker Pool용)
            const tasks = cutPoints.map((cutPoint, index) => ({
                cutPoint,
                index,
                originalIndex: index, // 결과 순서 보장용
                videoPath,
                settings: config
            }));
            
            // Worker Pool 생성 및 실행
            const workerPool = new FrameExtractionPool(maxConcurrency, this);
            
            // 스트리밍 병렬 처리 실행
            const extractedFrames = await workerPool.processAllFrames(
                tasks,
                (progress, message) => {
                    processedCount = Math.round(progress * totalFrames);
                    updateProgress(processedCount, message);
                }
            );
            
            console.log(`🏁 Worker Pool 완료: ${extractedFrames.length}/${totalFrames}개 프레임 추출 성공`);
            
            updateProgress(totalFrames, 'Eagle 임포트 준비 중...');
            
            console.log('프레임 추출 완료:', extractedFrames.length, '개의 프레임');
            
            // Eagle 임포트 (선택사항)
            let eagleImportResult = null;
            if (this.options.autoImportToEagle && this.eagleUtils?.isEagleAvailable) {
                try {
                    eagleImportResult = await this.importToEagle(extractedFrames, videoPath);
                    updateProgress(totalFrames, 'Eagle 임포트 완료!');
                } catch (importError) {
                    console.error('Eagle 임포트 실패:', importError);
                    // 임포트 실패해도 추출은 성공으로 처리
                }
            }
            
            return {
                count: extractedFrames.length,
                frames: extractedFrames,
                paths: extractedFrames.map(f => f.path),
                outputDir: this.outputDir,
                eagleImport: eagleImportResult,
                metadata: this.generateMetadata(videoPath, extractedFrames)
            };
            
        } catch (error) {
            console.error('프레임 추출 실패:', error);
            const friendlyError = this.eagleUtils?.formatError(error) || error.message;
            throw new Error('프레임 추출에 실패했습니다: ' + friendlyError);
        }
    }

    /**
     * 단일 프레임 추출 (개선 버전)
     * @param {string} videoPath - 비디오 파일 경로
     * @param {number} timeSeconds - 추출할 시간 (초)
     * @param {number} frameIndex - 프레임 인덱스
     * @param {Object} settings - 추출 설정
     * @param {number} frameNumber - 실제 프레임 번호 (옵션)
     * @returns {Promise<Object>} 추출된 프레임 정보
     */
    async extractSingleFrame(videoPath, timeSeconds, frameIndex, settings, frameNumber = null) {
        return new Promise((resolve, reject) => {
            const videoName = this.eagleUtils?.getBaseName(videoPath) || 'video';
            let outputFileName;
            
            // 분석용 프레임 추출 파일명
            if (settings.analysisFrameNaming && settings.totalDuration > 0) {
                const timeRatio = (timeSeconds / settings.totalDuration).toFixed(4);
                outputFileName = `${videoName}_${frameIndex.toString().padStart(3, '0')}_${timeRatio}.${settings.imageFormat}`;
            } else {
                // 기본 파일명
                outputFileName = `${videoName}_frame_${frameIndex.toString().padStart(3, '0')}.${settings.imageFormat}`;
            }
            
            const outputPath = this.eagleUtils ? 
                this.eagleUtils.joinPath(this.outputDir, outputFileName) : 
                `${this.outputDir}/${outputFileName}`;
            
            // FFmpeg 명령어 구성
            const args = [
                '-i', videoPath,
                '-ss', timeSeconds.toString(),
                '-frames:v', '1',
                '-q:v', this.mapQualityToFFmpeg(settings.quality, settings.imageFormat),
                '-y', // 파일 덮어쓰기
                outputPath
            ];

            // GPU 가속 설정 추가 (설정에 따라)
            if (this.configManager?.get('performance.enableGPUAcceleration')) {
                args.splice(1, 0, '-hwaccel', 'auto');
            }

            let ffmpeg;
            try {
                ffmpeg = this.eagleUtils ? 
                    this.eagleUtils.spawn(this.ffmpegPaths.ffmpeg, args) :
                    window.require('child_process').spawn(this.ffmpegPaths.ffmpeg, args);
            } catch (error) {
                reject(new Error(`FFmpeg 프로세스 시작 실패: ${error.message}`));
                return;
            }
            
            let stderr = '';
            
            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`프레임 추출 실패 (코드: ${code}): ${stderr}`));
                    return;
                }

                // 파일 생성 확인
                const fs = this.eagleUtils?.getNodeModule('fs') || window.require('fs');
                if (fs && !fs.existsSync(outputPath)) {
                    reject(new Error(`프레임 파일이 생성되지 않았습니다: ${outputPath}`));
                    return;
                }

                // 파일 정보 가져오기
                const stats = fs ? fs.statSync(outputPath) : { size: 0 };
                
                resolve({
                    path: outputPath,
                    filename: outputFileName,
                    timeSeconds: timeSeconds,
                    frameIndex: frameIndex,
                    frameNumber: frameNumber, // 실제 프레임 번호 추가
                    fileSize: stats.size,
                    format: settings.imageFormat,
                    quality: settings.quality,
                    formattedSize: this.eagleUtils?.formatFileSize(stats.size) || `${stats.size} bytes`
                });
            });

            ffmpeg.on('error', (error) => {
                reject(new Error(`FFmpeg 프로세스 시작 실패: ${error.message}`));
            });
        });
    }

    /**
     * 품질 설정을 FFmpeg 매개변수로 변환
     * @param {number} quality - 품질 (1-10)
     * @param {string} format - 이미지 포맷 (jpg/png)
     * @returns {string} FFmpeg 품질 매개변수
     */
    mapQualityToFFmpeg(quality, format) {
        if (format === 'png') {
            // PNG는 무손실이므로 압축 레벨 사용 (0-9, 낮을수록 빠름)
            return Math.max(1, 10 - quality).toString();
        } else {
            // JPG는 품질 사용 (1-31, 낮을수록 높은 품질)
            return Math.max(1, Math.ceil((11 - quality) * 3)).toString();
        }
    }

    /**
     * 프레임 메타데이터 생성 (개선 버전)
     * @param {string} videoPath - 원본 비디오 경로
     * @param {Array} frames - 추출된 프레임 배열
     * @returns {Object} 메타데이터 객체
     */
    generateMetadata(videoPath, frames) {
        const videoName = this.eagleUtils?.getBaseName(videoPath) || 'video';
        const totalSize = frames.reduce((sum, frame) => sum + frame.fileSize, 0);
        
        return {
            sourceVideo: videoName,
            videoPath: videoPath,
            extractedAt: new Date().toISOString(),
            totalFrames: frames.length,
            totalSize: totalSize,
            formattedTotalSize: this.eagleUtils?.formatFileSize(totalSize) || `${totalSize} bytes`,
            outputDirectory: this.outputDir,
            settings: this.getEffectiveConfig(),
            frames: frames.map(frame => ({
                filename: frame.filename,
                timeSeconds: frame.timeSeconds,
                frameIndex: frame.frameIndex,
                frameNumber: frame.frameNumber,
                fileSize: frame.fileSize,
                formattedSize: frame.formattedSize || `${frame.fileSize} bytes`
            }))
        };
    }

    /**
     * 메타데이터 파일 저장 (개선 버전)
     * @param {Object} metadata - 메타데이터 객체
     * @param {string} videoPath - 원본 비디오 경로
     */
    async saveMetadata(metadata, videoPath) {
        const videoName = this.eagleUtils?.getBaseName(videoPath) || 'video';
        const metadataPath = this.eagleUtils ? 
            this.eagleUtils.joinPath(this.outputDir, `${videoName}_frames_metadata.json`) :
            `${this.outputDir}/${videoName}_frames_metadata.json`;
        
        try {
            const fs = this.eagleUtils?.getNodeModule('fs') || window.require('fs');
            if (fs) {
                fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                console.log('메타데이터 저장 완료:', metadataPath);
                return metadataPath;
            }
        } catch (error) {
            console.error('메타데이터 저장 실패:', error);
            throw new Error('메타데이터 저장에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 추출된 프레임 미리보기 HTML 생성
     * @param {Array} frames - 추출된 프레임 배열
     * @param {string} videoPath - 원본 비디오 경로
     * @returns {string} HTML 내용
     */
    generatePreviewHTML(frames, videoPath) {
        const videoName = path_fe ? path_fe.basename(videoPath, path_fe.extname(videoPath)) : 'video';
        
        let html = `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${videoName} - 추출된 프레임</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .frames-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
                .frame-item { border: 1px solid #ddd; border-radius: 8px; padding: 15px; text-align: center; }
                .frame-item img { max-width: 100%; height: auto; border-radius: 4px; }
                .frame-info { margin-top: 10px; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${videoName} - 추출된 프레임</h1>
                <p>총 ${frames.length}개의 프레임이 추출되었습니다.</p>
            </div>
            <div class="frames-grid">
        `;
        
        frames.forEach(frame => {
            html += `
                <div class="frame-item">
                    <img src="${frame.filename}" alt="Frame ${frame.frameIndex}">
                    <div class="frame-info">
                        <div>프레임 #${frame.frameIndex}</div>
                        <div>시간: ${frame.timeSeconds.toFixed(2)}초</div>
                        <div>파일: ${frame.filename}</div>
                        <div>크기: ${(frame.fileSize / 1024).toFixed(1)} KB</div>
                    </div>
                </div>
            `;
        });
        
        html += `
            </div>
        </body>
        </html>
        `;
        
        return html;
    }

    /**
     * 임시 파일 정리
     */
    cleanup() {
        try {
            if (fs_fe) {
                const files = fs_fe.readdirSync(this.outputDir);
                files.forEach(file => {
                    const filePath = path_fe ? path_fe.join(this.outputDir, file) : `${this.outputDir}/${file}`;
                    if (fs_fe.statSync(filePath).isFile()) {
                        fs_fe.unlinkSync(filePath);
                    }
                });
                console.log('프레임 파일 정리 완료');
            }
        } catch (error) {
            console.error('프레임 파일 정리 실패:', error);
        }
    }

    /**
     * 효율적인 설정 가져오기 (ConfigManager 우선)
     * @returns {Object} 효율적인 설정 객체
     */
    getEffectiveConfig() {
        if (this.configManager) {
            return {
                imageFormat: this.configManager.get('output.imageFormat') || 'png', // 기본값 PNG로 변경
                quality: this.configManager.get('output.quality') || 8,
                useFrameAccuracy: this.configManager.get('processing.useFrameAccuracy') || true,
                maxConcurrency: this.configManager.get('processing.maxConcurrency') || 16 // M4 MAX 최적화
            };
        }
        
        // 폴백 설정
        return {
            imageFormat: 'png', // 기본값 PNG로 변경
            quality: 8,
            useFrameAccuracy: true,
            maxConcurrency: 16 // M4 MAX 최적화
        };
    }

    /**
     * Eagle에 프레임들 임포트
     * @param {Array} frames - 추출된 프레임 배열
     * @param {string} videoPath - 원본 비디오 경로
     * @returns {Promise<Object>} 임포트 결과
     */
    async importToEagle(frames, videoPath) {
        if (!this.eagleUtils?.isEagleAvailable) {
            console.log('Eagle API를 사용할 수 없어 임포트를 건너뜁니다.');
            return { success: false, reason: 'Eagle API unavailable' };
        }

        try {
            const videoName = this.eagleUtils.getBaseName(videoPath);
            const importOptions = this.configManager?.getEagleImportOptions({
                name: `${videoName} 프레임`,
                tags: ['frame', 'video-processor', videoName],
                annotation: `${videoName}에서 추출된 프레임 이미지`
            }) || {};

            const importResults = [];
            
            for (const frame of frames) {
                try {
                    const itemId = await this.eagleUtils.addFileToEagle(frame.path, {
                        ...importOptions,
                        name: frame.filename.replace(/\.[^/.]+$/, ""), // 확장자 제거
                        annotation: `${frame.timeSeconds.toFixed(2)}초 지점의 프레임`
                    });
                    
                    importResults.push({
                        framePath: frame.path,
                        eagleId: itemId,
                        success: true
                    });
                } catch (error) {
                    console.error('개별 프레임 임포트 실패:', frame.path, error);
                    importResults.push({
                        framePath: frame.path,
                        eagleId: null,
                        success: false,
                        error: error.message
                    });
                }
            }

            const successCount = importResults.filter(r => r.success).length;
            console.log(`Eagle 임포트 완료: ${successCount}/${frames.length}개 성공`);

            return {
                success: true,
                totalFiles: frames.length,
                successCount: successCount,
                failCount: frames.length - successCount,
                results: importResults
            };

        } catch (error) {
            console.error('Eagle 임포트 실패:', error);
            return {
                success: false,
                error: error.message,
                results: []
            };
        }
    }
}

// 브라우저 환경에서 전역 객체로 등록
window.FrameExtractor = FrameExtractor;