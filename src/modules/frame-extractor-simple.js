/**
 * FrameExtractor - 실제 프레임 추출 버전 (Worker Pool 적용)
 * 로드 문제 해결된 안정화 버전
 */

console.log('🔧 FrameExtractor 모듈 로드 시작...');

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
     */
    async processAllFrames(tasks, progressCallback = null) {
        return new Promise((resolve, reject) => {
            this.taskQueue = [...tasks];
            this.totalTasks = tasks.length;
            this.results = new Array(tasks.length);
            this.processedCount = 0;
            this.errors = [];
            this.onProgress = progressCallback;
            this.onComplete = (results) => {
                if (this.errors.length > 0) {
                    console.warn(`${this.errors.length}개 프레임 추출 실패`);
                }
                resolve(results.filter(Boolean));
            };
            
            console.log(`🚀 Worker Pool 시작: ${this.totalTasks}개 작업, 최대 ${this.maxConcurrency}개 동시 처리`);
            this.fillWorkerPool();
        });
    }

    fillWorkerPool() {
        while (this.activeWorkers < this.maxConcurrency && this.taskQueue.length > 0) {
            this.startWorker();
        }
        
        if (this.activeWorkers === 0 && this.taskQueue.length === 0) {
            this.onComplete?.(this.results);
        }
    }

    startWorker() {
        if (this.taskQueue.length === 0) return;
        
        const task = this.taskQueue.shift();
        this.activeWorkers++;
        
        console.log(`⚡ Worker 시작: 프레임 ${task.index + 1}/${this.totalTasks}`);
        
        this.extractFrameAsync(task)
            .then(result => {
                this.results[task.originalIndex] = result;
                this.processedCount++;
                
                console.log(`✅ Worker 완료: 프레임 ${task.index + 1}`);
                
                if (this.onProgress) {
                    this.onProgress(
                        this.processedCount / this.totalTasks,
                        `프레임 ${this.processedCount}/${this.totalTasks} 추출 완료`
                    );
                }
                
                this.activeWorkers--;
                this.fillWorkerPool();
            })
            .catch(error => {
                console.error(`❌ Worker 실패: 프레임 ${task.index + 1}:`, error.message);
                this.errors.push({ task, error });
                this.processedCount++;
                
                if (this.onProgress) {
                    this.onProgress(
                        this.processedCount / this.totalTasks,
                        `프레임 ${this.processedCount}/${this.totalTasks} 처리 (실패 포함)`
                    );
                }
                
                this.activeWorkers--;
                this.fillWorkerPool();
            });
    }

    async extractFrameAsync(task) {
        let extractTime = task.cutPoint.start + (task.cutPoint.duration / 2);
        let extractFrameNumber = null;
        
        if (task.cutPoint.inFrame !== undefined && task.cutPoint.outFrame !== undefined) {
            const middleFrame = Math.round((task.cutPoint.inFrame + task.cutPoint.outFrame) / 2);
            extractFrameNumber = middleFrame;
        }
        
        return await this.frameExtractor.extractSingleFrame(
            task.videoPath,
            extractTime,
            task.index + 1,
            task.settings,
            extractFrameNumber
        );
    }
}

class FrameExtractor {
    constructor(ffmpegPaths = null, options = {}) {
        console.log('🎬 FrameExtractor 생성자 호출됨');
        
        // 의존성 주입
        this.eagleUtils = window.eagleUtils || null;
        this.configManager = window.configManager || null;
        
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
        
        console.log('✅ FrameExtractor 초기화 완료');
    }

    /**
     * 초기화 (비동기)
     */
    async initialize(videoPath = null) {
        if (this.initialized) return;
        
        console.log('🔧 FrameExtractor 초기화 중...', videoPath);
        
        try {
            // 비디오 이름으로 하위 폴더 생성
            let baseDir;
            if (this.eagleUtils) {
                baseDir = await this.eagleUtils.getCacheDirectory('frames');
            } else {
                baseDir = this.getFallbackOutputDir();
            }
                
            // 비디오 파일이 지정된 경우 하위 폴더 생성
            if (videoPath && this.eagleUtils) {
                const videoName = this.eagleUtils.getBaseName(videoPath) || 'video';
                const path = this.eagleUtils.getNodeModule('path');
                
                if (path) {
                    this.outputDir = path.join(baseDir, videoName);
                } else {
                    this.outputDir = `${baseDir}/${videoName}`;
                }
            } else {
                this.outputDir = baseDir;
            }

            console.log('✅ FrameExtractor 초기화 완료, 출력 디렉토리:', this.outputDir);
            this.initialized = true;
        } catch (error) {
            console.error('❌ FrameExtractor 초기화 실패:', error);
            this.outputDir = this.getFallbackOutputDir();
            this.initialized = true;
        }
    }

    /**
     * 폴백 출력 디렉토리 생성
     */
    getFallbackOutputDir() {
        if (this.eagleUtils) {
            const os = this.eagleUtils.getNodeModule('os');
            const path = this.eagleUtils.getNodeModule('path');
            
            if (os && path) {
                return path.join(os.tmpdir(), 'video-processor-frames');
            }
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
     */
    setFFmpegPaths(ffmpegPaths) {
        this.ffmpegPaths = ffmpegPaths;
        console.log('🔧 FFmpeg 경로 설정됨:', ffmpegPaths);
    }

    /**
     * 실제 프레임 추출 메인 함수 (Worker Pool 적용)
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
            
            const totalFrames = cutPoints.length;
            
            // 진행률 콜백 헬퍼
            const updateProgress = (current, message = null) => {
                if (progressCallback) {
                    const progress = current / totalFrames;
                    const defaultMessage = `프레임 추출: ${Math.round(current)}/${totalFrames}`;
                    progressCallback(progress, message || defaultMessage);
                }
            };

            updateProgress(0, '프레임 추출 준비 중...');
            
            // CPU 코어 수에 따른 병렬 처리 수 결정
            const os = this.eagleUtils?.getNodeModule('os');
            const cpuCount = os ? os.cpus().length : 4;
            
            let maxConcurrency;
            if (cpuCount >= 12) {
                maxConcurrency = Math.min(Math.max(6, Math.floor(cpuCount * 0.9)), 16, cutPoints.length);
            } else if (cpuCount >= 8) {
                maxConcurrency = Math.min(Math.max(4, Math.floor(cpuCount * 0.8)), 10, cutPoints.length);
            } else {
                maxConcurrency = Math.min(Math.max(2, Math.floor(cpuCount * 0.6)), 6, cutPoints.length);
            }
            
            console.log(`🚀 Worker Pool 병렬 프레임 추출: 최대 ${maxConcurrency}개 동시 처리`);
            
            // 작업 목록 생성
            const tasks = cutPoints.map((cutPoint, index) => ({
                cutPoint,
                index,
                originalIndex: index,
                videoPath,
                settings: config
            }));
            
            // Worker Pool 생성 및 실행
            const workerPool = new FrameExtractionPool(maxConcurrency, this);
            
            // 스트리밍 병렬 처리 실행
            const extractedFrames = await workerPool.processAllFrames(
                tasks,
                (progress, message) => {
                    const processedCount = Math.round(progress * totalFrames);
                    updateProgress(processedCount, message);
                }
            );
            
            console.log(`🏁 Worker Pool 완료: ${extractedFrames.length}/${totalFrames}개 프레임 추출 성공`);
            
            updateProgress(totalFrames, 'Eagle 임포트 준비 중...');
            
            console.log('프레임 추출 완료:', extractedFrames.length, '개의 프레임');
            
            return {
                count: extractedFrames.length,
                frames: extractedFrames,
                paths: extractedFrames.map(f => f.path),
                outputDir: this.outputDir,
                eagleImport: null,
                metadata: this.generateMetadata(videoPath, extractedFrames)
            };
            
        } catch (error) {
            console.error('프레임 추출 실패:', error);
            const friendlyError = this.eagleUtils?.formatError(error) || error.message;
            throw new Error('프레임 추출에 실패했습니다: ' + friendlyError);
        }
    }

    /**
     * 단일 프레임 추출 (실제 FFmpeg 사용)
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
                const fs = this.eagleUtils?.getNodeModule('fs') || (window.require ? window.require('fs') : null);
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
                    frameNumber: frameNumber,
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
     * 프레임 메타데이터 생성
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
     * 효율적인 설정 가져오기
     */
    getEffectiveConfig() {
        if (this.configManager) {
            return {
                imageFormat: this.configManager.get('output.imageFormat') || 'png',
                quality: this.configManager.get('output.quality') || 8,
                useFrameAccuracy: this.configManager.get('processing.useFrameAccuracy') || true,
                maxConcurrency: this.configManager.get('processing.maxConcurrency') || 16
            };
        }
        
        // 폴백 설정
        return {
            imageFormat: 'png',
            quality: 8,
            useFrameAccuracy: true,
            maxConcurrency: 16
        };
    }
}

// 즉시 전역 객체에 등록
try {
    window.FrameExtractor = FrameExtractor;
    console.log('✅ FrameExtractor가 window 객체에 등록됨');
    console.log('🔍 등록 확인:', typeof window.FrameExtractor);
} catch (error) {
    console.error('❌ FrameExtractor 등록 실패:', error);
}

// 추가 확인
setTimeout(() => {
    console.log('⏰ 1초 후 재확인 - window.FrameExtractor:', typeof window.FrameExtractor);
    if (typeof window.FrameExtractor === 'function') {
        console.log('🎉 FrameExtractor 모듈 로드 완료!');
    } else {
        console.error('💥 FrameExtractor 여전히 로드되지 않음');
    }
}, 1000);
