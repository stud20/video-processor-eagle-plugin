/**
 * VideoConcatenator - 다중 비디오 병합 모듈
 * 선택된 여러 비디오를 순서대로 하나로 합치는 기능
 */

class VideoConcatenator {
    constructor(ffmpegPaths = null, options = {}) {
        console.log('🎬 VideoConcatenator 생성자 호출됨');
        
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
            createConcatFolder: true,
            cleanupTempFiles: true,
            outputQuality: 'high', // 'high', 'medium', 'fast'
            enableAudioSync: true,
            ...options
        };

        // 출력 디렉토리
        this.outputDir = null;
        this.tempDir = null;
        this.initialized = false;
        
        console.log('✅ VideoConcatenator 초기화 완료');
    }

    /**
     * 초기화 (비동기)
     * @param {Array} videoFiles - 병합할 비디오 파일들 (폴더명 생성용)
     */
    async initialize(videoFiles = null) {
        try {
            // 기본 출력 디렉토리 설정
            let baseDir = this.eagleUtils ? 
                await this.eagleUtils.getCacheDirectory('concatenated') :
                this.getFallbackOutputDir();
            
            // 비디오 파일들이 제공된 경우 폴더명 생성
            if (videoFiles && videoFiles.length > 0) {
                const folderName = this.generateFolderName(videoFiles);
                const path = this.eagleUtils?.getNodeModule('path');
                
                if (path) {
                    this.outputDir = path.join(baseDir, folderName);
                } else {
                    this.outputDir = `${baseDir}/${folderName}`;
                }
                
                console.log('📁 병합 출력 디렉토리 설정:', {
                    baseDir: baseDir,
                    folderName: folderName,
                    outputDir: this.outputDir
                });
            } else {
                this.outputDir = baseDir;
            }
            
            // 임시 파일 디렉토리
            this.tempDir = this.eagleUtils ? 
                await this.eagleUtils.getCacheDirectory('temp') :
                this.getFallbackTempDir();

            console.log('📁 VideoConcatenator 디렉토리 설정:', {
                outputDir: this.outputDir,
                tempDir: this.tempDir
            });

            this.initialized = true;
        } catch (error) {
            console.error('VideoConcatenator 초기화 실패:', error);
            this.outputDir = this.getFallbackOutputDir();
            this.tempDir = this.getFallbackTempDir();
            this.initialized = true;
        }
    }

    /**
     * 병합 폴더명 생성
     * @param {Array} videoFiles - 비디오 파일 배열
     * @returns {string} 생성된 폴더명
     */
    generateFolderName(videoFiles) {
        if (videoFiles.length === 1) {
            // 단일 파일인 경우 파일명 사용
            return this.getBaseName(videoFiles[0].name);
        } else if (videoFiles.length === 2) {
            // 2개 파일인 경우 "파일1_파일2_merged" 형태
            const name1 = this.getBaseName(videoFiles[0].name);
            const name2 = this.getBaseName(videoFiles[1].name);
            return `${name1}_${name2}_merged`;
        } else {
            // 3개 이상인 경우 "첫번째_외N개_merged" 형태
            const firstName = this.getBaseName(videoFiles[0].name);
            const count = videoFiles.length - 1;
            return `${firstName}_외${count}개_merged`;
        }
    }

    /**
     * 폴백 출력 디렉토리 생성
     */
    getFallbackOutputDir() {
        const os = this.eagleUtils?.getNodeModule('os');
        const path = this.eagleUtils?.getNodeModule('path');
        
        if (os && path) {
            return path.join(os.tmpdir(), 'video-processor-concatenated');
        }
        return './temp/concatenated';
    }

    /**
     * 폴백 임시 디렉토리 생성
     */
    getFallbackTempDir() {
        const os = this.eagleUtils?.getNodeModule('os');
        const path = this.eagleUtils?.getNodeModule('path');
        
        if (os && path) {
            return path.join(os.tmpdir(), 'video-processor-temp');
        }
        return './temp/temp';
    }

    /**
     * 출력 디렉토리 생성 확인
     */
    async ensureDirectories() {
        if (this.eagleUtils) {
            await this.eagleUtils.ensureDirectory(this.outputDir);
            await this.eagleUtils.ensureDirectory(this.tempDir);
            console.log('✅ 디렉토리 생성 확인:', { 
                output: this.outputDir, 
                temp: this.tempDir 
            });
        } else {
            // 폴백: 직접 디렉토리 생성
            const fs = window.require ? window.require('fs') : null;
            if (fs) {
                if (!fs.existsSync(this.outputDir)) {
                    fs.mkdirSync(this.outputDir, { recursive: true });
                }
                if (!fs.existsSync(this.tempDir)) {
                    fs.mkdirSync(this.tempDir, { recursive: true });
                }
                console.log('✅ 폴백 디렉토리 생성:', this.outputDir, this.tempDir);
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
     * 비디오 병합 메인 함수
     * @param {Array} videoFiles - 병합할 비디오 파일 배열 (순서대로)
     * @param {Object} options - 병합 옵션
     * @param {function} progressCallback - 진행률 콜백
     * @param {Object} ffmpegPaths - FFmpeg 경로
     * @returns {Promise<Object>} 병합 결과
     */
    async concatenateVideos(videoFiles, options = {}, progressCallback = null, ffmpegPaths = null) {
        try {
            console.log('🎬 비디오 병합 시작:', {
                videoCount: videoFiles.length,
                files: videoFiles.map(f => f.name)
            });

            // FFmpeg 경로 설정
            if (ffmpegPaths) {
                this.setFFmpegPaths(ffmpegPaths);
            }
            
            if (!this.ffmpegPaths) {
                throw new Error('FFmpeg 경로가 설정되지 않았습니다.');
            }

            // 초기화 (비디오 파일들을 전달하여 폴더명 생성)
            if (!this.initialized) {
                await this.initialize(videoFiles);
            }
            
            // 디렉토리 확인 및 생성
            await this.ensureDirectories();

            // 설정 병합
            const concatOptions = {
                quality: 'high',
                audioSync: true,
                fadeTransition: false,
                outputFormat: 'mp4',
                ...this.options,
                ...options
            };

            if (progressCallback) progressCallback(0.1, '비디오 정보 분석 중...');

            // 1. 비디오 정보 분석
            const videoInfos = await this.analyzeVideoFiles(videoFiles, progressCallback);

            if (progressCallback) progressCallback(0.3, '병합 준비 중...');

            // 2. 병합 방식 결정
            const needsReencoding = this.checkReencodingNeed(videoInfos);
            console.log('🔍 재인코딩 필요 여부:', needsReencoding);

            let result;
            if (needsReencoding) {
                // 재인코딩 병합 (호환성 보장)
                result = await this.concatenateWithReencoding(
                    videoFiles, 
                    videoInfos, 
                    concatOptions, 
                    progressCallback
                );
            } else {
                // 스트림 복사 병합 (고속)
                result = await this.concatenateWithStreamCopy(
                    videoFiles, 
                    videoInfos, 
                    concatOptions, 
                    progressCallback
                );
            }

            if (progressCallback) progressCallback(1.0, '병합 완료!');

            console.log('✅ 비디오 병합 완료:', result);
            return result;

        } catch (error) {
            console.error('비디오 병합 실패:', error);
            throw new Error('비디오 병합에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 비디오 파일들 정보 분석
     */
    async analyzeVideoFiles(videoFiles, progressCallback = null) {
        const videoInfos = [];
        
        for (let i = 0; i < videoFiles.length; i++) {
            const videoFile = videoFiles[i];
            
            if (progressCallback) {
                const progress = 0.1 + (i / videoFiles.length) * 0.2;
                progressCallback(progress, `비디오 분석: ${videoFile.name}`);
            }

            try {
                const info = await this.getVideoInfo(videoFile.path);
                videoInfos.push({
                    file: videoFile,
                    info: info,
                    index: i
                });
                
                console.log(`📊 비디오 ${i + 1} 정보:`, {
                    name: videoFile.name,
                    duration: info.duration,
                    resolution: `${info.width}x${info.height}`,
                    fps: info.fps,
                    codec: info.videoCodec
                });
                
            } catch (error) {
                console.error(`비디오 ${i + 1} 분석 실패:`, error);
                throw new Error(`비디오 분석 실패: ${videoFile.name}`);
            }
        }

        return videoInfos;
    }

    /**
     * 개별 비디오 정보 가져오기
     */
    async getVideoInfo(videoPath) {
        return new Promise((resolve, reject) => {
            const ffprobe = this.eagleUtils ? 
                this.eagleUtils.spawn(this.ffmpegPaths.ffprobe, [
                    '-v', 'quiet',
                    '-print_format', 'json',
                    '-show_format',
                    '-show_streams',
                    videoPath
                ]) :
                window.require('child_process').spawn(this.ffmpegPaths.ffprobe, [
                    '-v', 'quiet',
                    '-print_format', 'json',
                    '-show_format',
                    '-show_streams',
                    videoPath
                ]);

            let stdout = '';
            let stderr = '';

            ffprobe.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            ffprobe.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffprobe.on('close', (code) => {
                if (code === 0 && stdout.trim()) {
                    try {
                        const data = JSON.parse(stdout);
                        const videoStream = data.streams.find(s => s.codec_type === 'video');
                        const audioStream = data.streams.find(s => s.codec_type === 'audio');
                        
                        if (!videoStream) {
                            reject(new Error('비디오 스트림을 찾을 수 없습니다'));
                            return;
                        }

                        resolve({
                            duration: parseFloat(data.format.duration),
                            width: videoStream.width,
                            height: videoStream.height,
                            fps: eval(videoStream.r_frame_rate), // "30000/1001" -> 29.97
                            videoCodec: videoStream.codec_name,
                            audioCodec: audioStream?.codec_name || null,
                            bitrate: parseInt(data.format.bit_rate) || null,
                            hasAudio: !!audioStream
                        });
                    } catch (parseError) {
                        reject(new Error('비디오 정보 파싱 실패: ' + parseError.message));
                    }
                } else {
                    reject(new Error('FFprobe 실행 실패: ' + stderr));
                }
            });

            ffprobe.on('error', (error) => {
                reject(new Error('FFprobe 오류: ' + error.message));
            });
        });
    }

    /**
     * 재인코딩 필요성 확인
     */
    checkReencodingNeed(videoInfos) {
        if (videoInfos.length === 0) return false;

        const first = videoInfos[0].info;
        
        // 해상도, 프레임율, 코덱이 모두 동일한지 확인
        for (let i = 1; i < videoInfos.length; i++) {
            const current = videoInfos[i].info;
            
            if (current.width !== first.width ||
                current.height !== first.height ||
                Math.abs(current.fps - first.fps) > 0.1 ||
                current.videoCodec !== first.videoCodec ||
                current.audioCodec !== first.audioCodec) {
                return true;
            }
        }

        return false;
    }

    /**
     * 스트림 복사 방식 병합 (고속)
     */
    async concatenateWithStreamCopy(videoFiles, videoInfos, options, progressCallback = null) {
        const listFilePath = this.eagleUtils?.joinPath(this.tempDir, 'concat_list.txt') || 
                            `${this.tempDir}/concat_list.txt`;
        
        // concat 파일 리스트 생성
        const listContent = videoFiles.map(file => `file '${file.path}'`).join('\n');
        
        const fs = this.eagleUtils?.getFS() || window.require('fs');
        fs.writeFileSync(listFilePath, listContent);

        const outputFileName = this.generateOutputFileName(videoFiles);
        const outputPath = this.eagleUtils?.joinPath(this.outputDir, outputFileName) || 
                          `${this.outputDir}/${outputFileName}`;

        return await this.executeConcatenation(
            ['-f', 'concat', '-safe', '0', '-i', listFilePath, '-c', 'copy'],
            outputPath,
            videoInfos,
            options,
            progressCallback,
            'stream_copy'
        );
    }

    /**
     * 재인코딩 방식 병합 (호환성 보장)
     */
    async concatenateWithReencoding(videoFiles, videoInfos, options, progressCallback = null) {
        const outputFileName = this.generateOutputFileName(videoFiles);
        const outputPath = this.eagleUtils?.joinPath(this.outputDir, outputFileName) || 
                          `${this.outputDir}/${outputFileName}`;

        // 필터 복합 사용 - 모든 비디오를 동일한 포맷으로 변환 후 병합
        const filterComplex = this.buildFilterComplex(videoInfos, options);
        
        const inputArgs = [];
        videoFiles.forEach(file => {
            inputArgs.push('-i', file.path);
        });

        const ffmpegArgs = [
            ...inputArgs,
            '-filter_complex', filterComplex,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-crf', this.mapQualityToCRF(options.quality),
            '-preset', this.mapQualityToPreset(options.quality),
            '-movflags', '+faststart',
            '-y'
        ];

        return await this.executeConcatenation(
            ffmpegArgs,
            outputPath,
            videoInfos,
            options,
            progressCallback,
            'reencode'
        );
    }

    /**
     * 필터 복합 빌드
     */
    buildFilterComplex(videoInfos, options) {
        const targetWidth = Math.max(...videoInfos.map(v => v.info.width));
        const targetHeight = Math.max(...videoInfos.map(v => v.info.height));
        const targetFPS = Math.max(...videoInfos.map(v => v.info.fps));

        let filterParts = [];

        // 각 입력을 표준화
        videoInfos.forEach((videoInfo, index) => {
            const needsScale = videoInfo.info.width !== targetWidth || 
                             videoInfo.info.height !== targetHeight;
            const needsFPS = Math.abs(videoInfo.info.fps - targetFPS) > 0.1;

            let filter = `[${index}:v]`;
            
            if (needsScale) {
                filter += `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2`;
            }
            
            if (needsFPS) {
                filter += (needsScale ? ',' : '') + `fps=${targetFPS}`;
            }
            
            if (needsScale || needsFPS) {
                filter += `[v${index}];`;
                filterParts.push(filter);
            } else {
                filterParts.push(`[${index}:v]null[v${index}];`);
            }
        });

        // 비디오 병합
        const videoInputs = videoInfos.map((_, index) => `[v${index}]`).join('');
        filterParts.push(`${videoInputs}concat=n=${videoInfos.length}:v=1:a=0[outv];`);

        // 오디오 병합 (있는 경우)
        const hasAudio = videoInfos.some(v => v.info.hasAudio);
        if (hasAudio) {
            const audioInputs = videoInfos.map((_, index) => `[${index}:a]`).join('');
            filterParts.push(`${audioInputs}concat=n=${videoInfos.length}:v=0:a=1[outa]`);
        }

        return filterParts.join('');
    }

    /**
     * FFmpeg 실행
     */
    async executeConcatenation(ffmpegArgs, outputPath, videoInfos, options, progressCallback, method) {
        return new Promise((resolve, reject) => {
            try {
                const args = [...ffmpegArgs, outputPath];
                console.log('🔧 FFmpeg 실행:', args.join(' '));

                const ffmpeg = this.eagleUtils ? 
                    this.eagleUtils.spawn(this.ffmpegPaths.ffmpeg, args) :
                    window.require('child_process').spawn(this.ffmpegPaths.ffmpeg, args);
                
                let stderr = '';
                let hasCompleted = false;
                const totalDuration = videoInfos.reduce((sum, v) => sum + v.info.duration, 0);

                ffmpeg.stderr.on('data', (data) => {
                    stderr += data.toString();
                    
                    // 진행률 파싱
                    if (progressCallback) {
                        const timeMatch = stderr.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                        if (timeMatch) {
                            const hours = parseInt(timeMatch[1]);
                            const minutes = parseInt(timeMatch[2]);
                            const seconds = parseFloat(timeMatch[3]);
                            const currentTime = hours * 3600 + minutes * 60 + seconds;
                            
                            const progress = Math.min(0.3 + (currentTime / totalDuration) * 0.7, 1.0);
                            progressCallback(progress, `병합 중... (${method})`);
                        }
                    }
                });

                ffmpeg.on('close', (code) => {
                    if (hasCompleted) return;
                    hasCompleted = true;
                    clearTimeout(timeoutHandle);
                    
                    try {
                        if (code === 0) {
                            // 파일 존재 확인
                            let fileExists = false;
                            let stats = null;
                            
                            try {
                                fileExists = this.eagleUtils?.fileExists(outputPath) || 
                                           window.require('fs').existsSync(outputPath);
                                if (fileExists) {
                                    stats = this.eagleUtils?.getFileStats(outputPath) || 
                                           window.require('fs').statSync(outputPath);
                                }
                            } catch (fileError) {
                                console.warn('출력 파일 확인 중 오류:', fileError.message);
                                reject(new Error('출력 파일 확인 실패'));
                                return;
                            }
                            
                            if (fileExists && stats && stats.size > 0) {
                                const fileSizeMB = (stats.size / 1024 / 1024).toFixed(1);
                                
                                console.log(`✅ 병합 완료: ${outputPath} (${fileSizeMB}MB, ${method})`);
                                
                                resolve({
                                    path: outputPath,
                                    filename: this.getBaseName(outputPath),
                                    fileSize: stats.size,
                                    method: method,
                                    inputCount: videoInfos.length,
                                    totalDuration: totalDuration,
                                    quality: options.quality,
                                    metadata: {
                                        inputFiles: videoInfos.map(v => v.file.name),
                                        method: method,
                                        processingTime: Date.now()
                                    }
                                });
                            } else {
                                console.warn('출력 파일 없음 또는 크기 0:', outputPath);
                                reject(new Error('병합된 파일이 생성되지 않았습니다'));
                            }
                        } else {
                            console.warn(`❌ 병합 실패: 코드=${code} (${method})`);
                            if (stderr) {
                                console.warn('FFmpeg stderr:', stderr.substring(0, 200));
                            }
                            reject(new Error(`비디오 병합 실패 (종료 코드: ${code})`));
                        }
                    } catch (error) {
                        console.error('병합 완료 처리 중 오류:', error.message);
                        reject(error);
                    }
                });

                ffmpeg.on('error', (error) => {
                    if (hasCompleted) return;
                    hasCompleted = true;
                    clearTimeout(timeoutHandle);
                    console.error('FFmpeg 실행 오류:', error.message);
                    reject(new Error('FFmpeg 실행 오류: ' + error.message));
                });
                
                // 타임아웃 설정
                const timeoutDuration = Math.max(totalDuration * 2000, 300000); // 최소 5분
                const timeoutHandle = setTimeout(() => {
                    if (!hasCompleted) {
                        hasCompleted = true;
                        ffmpeg.kill('SIGTERM');
                        console.warn(`⏰ 병합 타임아웃 (${timeoutDuration/1000}초)`);
                        reject(new Error(`병합 처리 시간 초과`));
                    }
                }, timeoutDuration);
                
            } catch (error) {
                console.error('FFmpeg 실행 준비 오류:', error.message);
                reject(error);
            }
        });
    }

    /**
     * 출력 파일명 생성
     */
    generateOutputFileName(videoFiles) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const baseName = videoFiles.length > 1 ? 
            `merged_${videoFiles.length}videos_${timestamp}` :
            `${this.getBaseName(videoFiles[0].name)}_processed_${timestamp}`;
        
        return `${baseName}.mp4`;
    }

    /**
     * 파일 기본 이름 추출
     */
    getBaseName(filePath) {
        const path = this.eagleUtils?.getNodeModule('path');
        if (path) {
            return path.parse(filePath).name;
        }
        return filePath.split('/').pop().split('.')[0];
    }

    /**
     * 품질을 CRF 값으로 변환
     */
    mapQualityToCRF(quality) {
        const qualityMap = {
            'fast': '28',
            'medium': '23',
            'high': '18'
        };
        return qualityMap[quality] || '23';
    }

    /**
     * 품질을 preset으로 변환
     */
    mapQualityToPreset(quality) {
        const presetMap = {
            'fast': 'veryfast',
            'medium': 'medium',
            'high': 'slow'
        };
        return presetMap[quality] || 'medium';
    }

    /**
     * 임시 파일 정리
     */
    async cleanup() {
        try {
            const fs = this.eagleUtils?.getFS() || window.require('fs');
            if (!fs) return;
            
            const files = fs.readdirSync(this.tempDir);
            files.forEach(file => {
                if (file.startsWith('concat_list')) {
                    const filePath = this.eagleUtils?.joinPath(this.tempDir, file) || 
                                   `${this.tempDir}/${file}`;
                    fs.unlinkSync(filePath);
                }
            });
            console.log('🧹 임시 파일 정리 완료');
        } catch (error) {
            console.error('임시 파일 정리 실패:', error);
        }
    }
}

// 브라우저 환경에서 전역 객체로 등록
console.log('🔧 VideoConcatenator 클래스 정의 완료, 전역 객체에 등록 중...');
window.VideoConcatenator = VideoConcatenator;
console.log('✅ VideoConcatenator가 window 객체에 등록됨:', typeof window.VideoConcatenator);