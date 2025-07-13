/**
 * ClipExtractionPool - 스트리밍 병렬 처리를 위한 워커 풀
 * 클립 추출 작업을 메모리 효율적으로 병렬 처리합니다.
 */
class ClipExtractionPool {
    constructor(maxConcurrency, clipExtractor) {
        this.maxConcurrency = maxConcurrency;
        this.clipExtractor = clipExtractor;
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
     * 모든 클립 처리 (스트리밍 방식)
     * @param {Array} tasks - 작업 목록
     * @param {function} progressCallback - 진행률 콜백
     * @returns {Promise<Array>} 처리 결과
     */
    async processAllClips(tasks, progressCallback = null) {
        return new Promise((resolve, reject) => {
            this.taskQueue = [...tasks];
            this.totalTasks = tasks.length;
            this.results = new Array(tasks.length); // 순서 보장을 위한 인덱스 배열
            this.processedCount = 0;
            this.errors = [];
            this.onProgress = progressCallback;
            this.onComplete = (results) => {
                if (this.errors.length > 0) {
                    console.warn(`${this.errors.length}개 클립 추출 실패`);
                }
                resolve(results.filter(Boolean)); // null 제거
            };
            
            console.log(`🚀 Clip Worker Pool 시작: ${this.totalTasks}개 작업, 최대 ${this.maxConcurrency}개 동시 처리`);
            
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
        
        console.log(`⚡ Clip Worker 시작: 클립 ${task.clipIndex}/${this.totalTasks} (활성 워커: ${this.activeWorkers}/${this.maxConcurrency})`);
        
        // 비동기 클립 추출 실행
        this.extractClipAsync(task)
            .then(result => {
                // 결과 저장 (순서 보장)
                this.results[task.originalIndex] = result;
                this.processedCount++;
                
                if (result) {
                    const fileSizeKB = (result.fileSize / 1024).toFixed(1);
                    console.log(`✅ Clip Worker 완료: 클립 ${task.clipIndex} - ${result.filename} (${fileSizeKB}KB)`);
                } else {
                    console.warn(`⚠️ Clip Worker 실패: 클립 ${task.clipIndex}`);
                }
                
                // 진행률 업데이트
                if (this.onProgress) {
                    this.onProgress(
                        this.processedCount / this.totalTasks,
                        `M4 MAX ${this.maxConcurrency}x 병렬: ${this.processedCount}/${this.totalTasks} 완료 (활성: ${this.activeWorkers})`
                    );
                }
                
                this.activeWorkers--;
                
                // 즉시 다음 작업 시작 (핵심!)
                this.fillWorkerPool();
            })
            .catch(error => {
                console.error(`❌ Clip Worker 실패: 클립 ${task.clipIndex}:`, error.message);
                this.errors.push({ task, error });
                this.processedCount++;
                
                // 실패해도 진행률 업데이트
                if (this.onProgress) {
                    this.onProgress(
                        this.processedCount / this.totalTasks,
                        `클립 ${this.processedCount}/${this.totalTasks} 처리 (실패 포함)`
                    );
                }
                
                this.activeWorkers--;
                
                // 실패해도 다음 작업 계속 진행
                this.fillWorkerPool();
            });
    }

    /**
     * 비동기 클립 추출
     * @param {Object} task - 추출 작업
     * @returns {Promise<Object>} 추출 결과
     */
    async extractClipAsync(task) {
        return await this.clipExtractor.extractSingleClipOptimized(
            task.videoPath,
            task.cutPoint,
            task.clipIndex,
            task.settings
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

/**
 * ClipExtractor - 클립 추출 모듈 (Worker Pool 최적화 버전)
 * 컷 변화를 기준으로 개별 클립을 추출합니다.
 */
class ClipExtractor {
    constructor(ffmpegPaths = null, options = {}) {
        console.log('🎬 ClipExtractor 생성자 호출됨');
        
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
        
        console.log('✅ ClipExtractor 초기화 완료');
    }

    /**
     * 초기화 (비동기)
     */
    async initialize(videoPath = null) {
        if (this.initialized) return;

        try {
            // 비디오 이름으로 하위 폴더 생성
            let baseDir = this.eagleUtils ? 
                await this.eagleUtils.getCacheDirectory('clips') :
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

            console.log('ClipExtractor 초기화 완료, 출력 디렉토리:', this.outputDir);
            this.initialized = true;
        } catch (error) {
            console.error('ClipExtractor 초기화 실패:', error);
            this.outputDir = this.getFallbackOutputDir();
            this.initialized = true;
        }
    }

    /**
     * 폴백 출력 디렉토리 생성
     */
    getFallbackOutputDir() {
        const os = this.eagleUtils?.getNodeModule('os');
        const path = this.eagleUtils?.getNodeModule('path');
        
        if (os && path) {
            return path.join(os.tmpdir(), 'video-processor-clips');
        }
        return './temp/clips';
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
    }
    
    /**
     * 클립 추출 메인 함수
     */
    async extractClips(videoPath, cutPoints, settings, progressCallback = null, ffmpegPaths = null) {
        try {
            console.log('🎬 클립 추출 시작:', {
                videoPath,
                cutPointsCount: cutPoints.length,
                settings
            });

            // FFmpeg 경로 설정
            if (ffmpegPaths) {
                this.setFFmpegPaths(ffmpegPaths);
            }
            
            if (!this.ffmpegPaths) {
                throw new Error('FFmpeg 경로가 설정되지 않았습니다.');
            }
            
            // 출력 디렉토리 확인 및 생성
            await this.ensureOutputDirectory();
            
            // M4 MAX 최적화: 최대 12개 동시 처리로 성능 극대화
            const result = await this.extractClipsParallel(
                videoPath, 
                cutPoints, 
                settings, 
                Math.min(12, cutPoints.length), // M4 MAX 최적화
                progressCallback
            );
            
            console.log('🎬 클립 추출 완료:', result);
            return result;
            
        } catch (error) {
            console.error('클립 추출 실패:', error);
            throw new Error('클립 추출에 실패했습니다: ' + error.message);
        }
    }

    /**
     * Worker Pool 방식 클립 추출 (M4 MAX 최적화)
     */
    async extractClipsParallel(videoPath, cutPoints, settings, concurrency = 2, progressCallback = null) {
        try {
            // M4 MAX에 맞는 동시 처리 수 결정
            const os = window.require ? window.require('os') : null;
            const cpuCount = os ? os.cpus().length : 4;
            
            // M4 MAX 특별 최적화: 14코어 → 최대 12개 동시 처리
            let optimizedConcurrency;
            if (cpuCount >= 12) {
                // M4 MAX/Pro 급 (12코어 이상): 최대 성능 활용
                optimizedConcurrency = Math.min(Math.max(8, Math.floor(cpuCount * 0.85)), 12, cutPoints.length);
            } else if (cpuCount >= 8) {
                // M3/M2 Pro 급 (8-11코어): 적극적 활용
                optimizedConcurrency = Math.min(Math.max(6, Math.floor(cpuCount * 0.75)), 8, cutPoints.length);
            } else {
                // 일반 CPU (8코어 미만): 안전한 활용
                optimizedConcurrency = Math.min(Math.max(3, Math.floor(cpuCount * 0.6)), 4, cutPoints.length);
            }
            
            console.log(`🚀 Worker Pool 클립 추출 시작:`, {
                totalClips: cutPoints.length,
                cpuCores: cpuCount,
                requestedConcurrency: concurrency,
                optimizedConcurrency: optimizedConcurrency,
                method: 'Worker Pool 스트리밍 병렬'
            });
            
            // 작업 목록 생성 (Worker Pool용)
            const tasks = cutPoints.map((cutPoint, index) => ({
                cutPoint,
                clipIndex: index + 1,
                originalIndex: index, // 결과 순서 보장용
                videoPath,
                settings
            }));
            
            // Worker Pool 생성 및 실행
            const workerPool = new ClipExtractionPool(optimizedConcurrency, this);
            
            // 스트리밍 병렬 처리 실행
            const extractedClips = await workerPool.processAllClips(
                tasks,
                progressCallback
            );
            
            console.log(`🏁 Worker Pool 완료: ${extractedClips.length}/${cutPoints.length}개 클립 추출 성공`);
            
            const successRate = ((extractedClips.length / cutPoints.length) * 100).toFixed(1);
            
            return {
                count: extractedClips.length,
                clips: extractedClips,
                paths: extractedClips.map(c => c.path),
                metadata: {
                    totalProcessed: cutPoints.length,
                    successful: extractedClips.length,
                    failed: cutPoints.length - extractedClips.length,
                    concurrency: optimizedConcurrency,
                    successRate: `${successRate}%`,
                    method: 'Worker Pool 스트리밍 병렬'
                }
            };
            
        } catch (error) {
            console.error('Worker Pool 클립 추출 실패:', error);
            throw new Error('Worker Pool 클립 추출에 실패했습니다: ' + error.message);
        }
    }

    /**
     * Worker Pool용 단일 클립 추출 (최적화)
     */
    async extractSingleClipOptimized(videoPath, cutPoint, clipIndex, settings) {
        const maxRetries = 2;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const success = await this.attemptClipExtractionOptimized(videoPath, cutPoint, clipIndex, settings, attempt);
                if (success) return success;
                
                // 실패 시 잠시 대기 후 재시도 (Worker Pool은 빠른 재시도)
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 25 * attempt)); // 25ms, 50ms
                }
            } catch (error) {
                console.warn(`Worker Pool 클립 ${clipIndex} 추출 시도 ${attempt}/${maxRetries} 실패:`, error.message);
                if (attempt === maxRetries) {
                    console.error(`Worker Pool 클립 ${clipIndex} 모든 재시도 실패`);
                }
            }
        }
        
        return null;
    }
    
    /**
     * Worker Pool 최적화 클립 추출 시도
     */
    async attemptClipExtractionOptimized(videoPath, cutPoint, clipIndex, settings, attempt) {
        return new Promise((resolve) => {
            try {
                const videoName = this.eagleUtils.getBaseName(videoPath);
                const outputFileName = `${videoName}_clip_${clipIndex.toString().padStart(3, '0')}.mp4`;
                const outputPath = this.eagleUtils.joinPath(this.outputDir, outputFileName);
                
                // 클립 길이 검증 및 보정
                let adjustedCutPoint = { ...cutPoint };
                
                if (cutPoint.duration < 0.5) {
                    adjustedCutPoint.duration = 0.5;
                    adjustedCutPoint.end = adjustedCutPoint.start + 0.5;
                }
                
                if (cutPoint.duration > 30) {
                    adjustedCutPoint.duration = 30;
                    adjustedCutPoint.end = adjustedCutPoint.start + 30;
                }
                
                // M4 MAX 최적화: 첫 번째 시도는 재인코딩, 두 번째는 스트림 복사
                let ffmpegArgs;
                
                if (attempt === 1) {
                    // Worker Pool 최적화: 하드웨어 가속 활용 재인코딩
                    ffmpegArgs = [
                        '-i', videoPath,
                        '-ss', adjustedCutPoint.start.toFixed(3),
                        '-t', adjustedCutPoint.duration.toFixed(3),
                        '-c:v', 'libx264',
                        '-c:a', 'aac',
                        '-crf', this.mapQualityToCRF(settings.quality || 6),
                        '-preset', 'veryfast', // Worker Pool에서 빠른 처리
                        '-pix_fmt', 'yuv420p',
                        '-avoid_negative_ts', 'make_zero',
                        '-movflags', '+faststart',
                        '-threads', '0', // 모든 사용 가능한 코어 활용
                        '-y',
                        outputPath
                    ];
                } else {
                    // 폴백: 스트림 복사 (고속)
                    ffmpegArgs = [
                        '-ss', adjustedCutPoint.start.toFixed(3),
                        '-i', videoPath,
                        '-t', adjustedCutPoint.duration.toFixed(3),
                        '-c', 'copy',
                        '-avoid_negative_ts', 'make_zero',
                        '-fflags', '+genpts',
                        '-reset_timestamps', '1',
                        '-y',
                        outputPath
                    ];
                }

                const ffmpeg = this.eagleUtils ? 
                    this.eagleUtils.spawn(this.ffmpegPaths.ffmpeg, ffmpegArgs) :
                    window.require('child_process').spawn(this.ffmpegPaths.ffmpeg, ffmpegArgs);
                
                let stderr = '';
                let hasCompleted = false;
                
                ffmpeg.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                ffmpeg.on('close', (code) => {
                    if (hasCompleted) return;
                    hasCompleted = true;
                    clearTimeout(timeoutHandle);
                    
                    if (code === 0 && this.eagleUtils.fileExists(outputPath)) {
                        const stats = this.eagleUtils.getFileStats(outputPath);
                        if (stats && stats.size > 0) {
                            const method = attempt === 1 ? 'worker-pool-optimized' : 'stream-copy';
                            
                            resolve({
                                path: outputPath,
                                filename: outputFileName,
                                startTime: cutPoint.start,
                                endTime: cutPoint.end,
                                duration: cutPoint.duration,
                                clipIndex: clipIndex,
                                fileSize: stats.size,
                                quality: settings.quality,
                                method: method
                            });
                        } else {
                            resolve(null);
                        }
                    } else {
                        const method = attempt === 1 ? 'worker-pool-optimized' : 'stream-copy';
                        console.warn(`❌ Worker Pool 클립 ${clipIndex} 실패: 코드=${code} (${method})`);
                        resolve(null);
                    }
                });

                ffmpeg.on('error', (error) => {
                    if (hasCompleted) return;
                    hasCompleted = true;
                    clearTimeout(timeoutHandle);
                    console.error(`Worker Pool 클립 ${clipIndex} FFmpeg 오류:`, error.message);
                    resolve(null);
                });
                
                // Worker Pool 최적화: 더 짧은 타임아웃 (빠른 처리 기대)
                const timeoutDuration = cutPoint.duration > 10 ? 60000 : 30000; // 30초/60초
                const timeoutHandle = setTimeout(() => {
                    if (!hasCompleted) {
                        hasCompleted = true;
                        ffmpeg.kill('SIGTERM');
                        console.warn(`⏰ Worker Pool 클립 ${clipIndex} 타임아웃 (${timeoutDuration/1000}초)`);
                        resolve(null);
                    }
                }, timeoutDuration);
                
            } catch (error) {
                resolve(null);
            }
        });
    }

    /**
     * 품질 설정을 CRF 값으로 변환
     */
    mapQualityToCRF(quality) {
        // 품질 1-10을 CRF 28-18로 변환 (낮을수록 높은 품질)
        const crf = Math.max(18, Math.min(28, 29 - quality * 1.1));
        return Math.round(crf).toString();
    }

    /**
     * 임시 파일 정리
     */
    cleanup() {
        try {
            const fs = this.eagleUtils.getFS();
            if (!fs) {
                console.warn('파일 시스템 모듈을 사용할 수 없어 정리를 건너뜁니다.');
                return;
            }
            
            const files = fs.readdirSync(this.outputDir);
            files.forEach(file => {
                const filePath = this.eagleUtils.joinPath(this.outputDir, file);
                if (fs.statSync(filePath).isFile()) {
                    fs.unlinkSync(filePath);
                }
            });
            console.log('클립 파일 정리 완료');
        } catch (error) {
            console.error('클립 파일 정리 실패:', error);
        }
    }
}

// 브라우저 환경에서 전역 객체로 등록
console.log('🔧 ClipExtractor 클래스 정의 완료, 전역 객체에 등록 중...');
window.ClipExtractor = ClipExtractor;
console.log('✅ ClipExtractor가 window 객체에 등록됨:', typeof window.ClipExtractor);
