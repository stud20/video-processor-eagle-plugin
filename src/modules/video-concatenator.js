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
            enableGPUAcceleration: false, // GPU 가속 활성화 여부
            gpuType: 'auto', // 'auto', 'nvidia', 'intel', 'amd'
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
     * @param {Array} videoFiles - 병합할 비디오 파일들 (사용하지 않음, 서브폴더 생성 안함)
     */
    async initialize(videoFiles = null) {
        try {
            // concatenated 폴더에 직접 저장 (서브폴더 없이)
            this.outputDir = this.eagleUtils ? 
                await this.eagleUtils.getCacheDirectory('concatenated') :
                this.getFallbackOutputDir();
            
            // 임시 파일 디렉토리
            this.tempDir = this.eagleUtils ? 
                await this.eagleUtils.getCacheDirectory('temp') :
                this.getFallbackTempDir();

            console.log('📁 VideoConcatenator 디렉토리 설정 (서브폴더 없이):', {
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

            // 2. 파일 크기 예측
            const totalDuration = videoInfos.reduce((sum, v) => sum + v.info.duration, 0);
            const sizeEstimate = this.estimateFileSize(totalDuration, concatOptions.quality);
            console.log('📊 예상 병합 파일 크기:', {
                duration: `${Math.round(totalDuration)}초`,
                quality: sizeEstimate.quality,
                bitrate: `${sizeEstimate.bitrateMbps}Mbps`,
                size: sizeEstimate.formattedSize
            });

            // 3. 병합 방식 결정 - 블랙프레임 방지를 위해 항상 재인코딩 사용
            const needsReencoding = true; // 블랙프레임 방지를 위해 항상 재인코딩
            console.log('🔍 블랙프레임 방지를 위해 재인코딩 모드 사용');

            let result;
            // 항상 재인코딩 병합 사용 (블랙프레임 방지)
            result = await this.concatenateWithReencoding(
                videoFiles, 
                videoInfos, 
                concatOptions, 
                progressCallback
            );

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
     * 간단한 concat 방식 병합
     */
    async concatenateSimple(videoFiles, videoInfos, options, progressCallback, outputPath) {
        try {
            // concat 파일 리스트 생성
            const listFilePath = this.eagleUtils?.joinPath(this.tempDir, 'concat_list.txt') || 
                                `${this.tempDir}/concat_list.txt`;
            
            const listContent = videoFiles.map(file => `file '${file.path}'`).join('\n');
            
            const fs = this.eagleUtils?.getFS() || window.require('fs');
            fs.writeFileSync(listFilePath, listContent);

            // 간단한 FFmpeg 명령 - concat demuxer 사용
            const ffmpegArgs = [
                '-f', 'concat',
                '-safe', '0',
                '-i', listFilePath,
                '-c:v', 'libx264',
                '-b:v', this.mapQualityToBitrate(options.quality),
                '-maxrate', this.mapQualityToBitrate(options.quality),
                '-bufsize', this.mapQualityToBufferSize(options.quality),
                '-preset', 'medium',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',           // 오디오를 AAC로 재인코딩
                '-b:a', '192k',          // 오디오 비트레이트
                '-ar', '48000',          // 샘플레이트 통일
                '-ac', '2',              // 스테레오로 통일
                '-y'
            ];

            console.log('🔧 간단한 concat 명령:', ffmpegArgs.join(' '));

            return await this.executeConcatenation(
                ffmpegArgs,
                outputPath,
                videoInfos,
                options,
                progressCallback,
                'simple_concat'
            );
        } catch (error) {
            console.error('간단한 concat 실패, 복잡한 방식으로 재시도:', error);
            throw error;
        }
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

        const outputFileName = await this.generateOutputFileName(videoFiles);
        const outputPath = this.eagleUtils?.joinPath(this.outputDir, outputFileName) || 
                          `${this.outputDir}/${outputFileName}`;

        // 스트림 복사에서도 블랙프레임 방지를 위해 재인코딩 사용
        // 단순 스트림 복사는 타임스탬프 문제로 블랙프레임 발생 가능
        const ffmpegArgs = [
            '-f', 'concat',
            '-safe', '0',
            '-i', listFilePath,
            '-c:v', 'libx264',
            '-b:v', this.mapQualityToBitrate(options.quality),
            '-maxrate', this.mapQualityToBitrate(options.quality),
            '-bufsize', this.mapQualityToBufferSize(options.quality),
            '-preset', 'veryfast',    // 빠른 처리를 위해
            '-profile:v', 'high',
            '-pix_fmt', 'yuv420p',
            '-bf', '0',               // B-frame 비활성화
            '-g', '30',               // GOP 크기 고정
            '-keyint_min', '30',
            '-sc_threshold', '0',
            '-fflags', '+genpts',     // PTS 재생성
            '-flags', '+cgop',        // Closed GOP
            '-movflags', '+faststart',
            '-c:a', 'copy',           // 오디오는 스트림 복사
            '-y'
        ];

        return await this.executeConcatenation(
            ffmpegArgs,
            outputPath,
            videoInfos,
            options,
            progressCallback,
            'stream_copy_enhanced'
        );
    }

    /**
     * 입력 파일 인자 빌드 (블랙프레임 방지)
     */
    buildInputArgs(originalInputArgs) {
        const newArgs = [];
        
        // 각 입력 파일에 대해 PTS 재생성 플래그 추가
        for (let i = 0; i < originalInputArgs.length; i += 2) {
            if (originalInputArgs[i] === '-i') {
                // 각 입력 파일 전에 플래그 추가
                newArgs.push('-fflags', '+genpts+igndts');
                newArgs.push('-i', originalInputArgs[i + 1]);
            }
        }
        
        return newArgs;
    }

    /**
     * 재인코딩 방식 병합 (호환성 보장)
     */
    async concatenateWithReencoding(videoFiles, videoInfos, options, progressCallback = null) {
        const outputFileName = await this.generateOutputFileName(videoFiles);
        const outputPath = this.eagleUtils?.joinPath(this.outputDir, outputFileName) || 
                          `${this.outputDir}/${outputFileName}`;

        // 모든 비디오에 오디오가 있는지 확인
        const allHaveAudio = videoInfos.every(v => v.info.hasAudio);
        
        // 간단한 concat 리스트 파일 방식으로 시도
        if (allHaveAudio && videoInfos.every(v => v.info.videoCodec === 'h264')) {
            console.log('🔄 간단한 concat 방식으로 시도합니다...');
            return await this.concatenateSimple(videoFiles, videoInfos, options, progressCallback, outputPath);
        }

        // 필터 복합 사용 - 모든 비디오를 동일한 포맷으로 변환 후 병합
        const filterComplex = this.buildFilterComplex(videoInfos, options);
        
        const inputArgs = [];
        videoFiles.forEach(file => {
            inputArgs.push('-i', file.path);
        });

        // 비디오 코덱 및 GPU 옵션 결정
        const videoCodec = this.getVideoCodec(options);
        const gpuOptions = options.enableGPUAcceleration ? 
            this.getGPUEncodingOptions(videoCodec, options.quality) : [];

        // 오디오 스트림 여부 확인 (filter_complex 출력 기준)
        const hasAudioOutput = filterComplex.includes('[outa]');
        
        const ffmpegArgs = [
            // 입력 플래그를 먼저 설정 (각 입력 파일에 대해)
            ...this.buildInputArgs(inputArgs),
            '-filter_complex', filterComplex,
            '-map', '[outv]',        // 비디오 출력 매핑
            ...(hasAudioOutput ? ['-map', '[outa]'] : []), // 오디오 출력이 있는 경우에만 매핑
            '-c:v', videoCodec,
            '-b:v', this.mapQualityToBitrate(options.quality),
            '-maxrate', this.mapQualityToBitrate(options.quality),
            '-bufsize', this.mapQualityToBufferSize(options.quality),
            ...gpuOptions,
            ...(videoCodec === 'libx264' ? ['-preset', this.mapQualityToPreset(options.quality)] : []),
            ...(videoCodec === 'libx264' ? ['-profile:v', 'high'] : []),
            '-pix_fmt', 'yuv420p',
            '-bf', '0',              // B-frame 완전 비활성화
            '-g', '30',              // GOP 크기 고정 (1초당 30프레임 기준)
            '-keyint_min', '30',     // 최소 키프레임 간격
            '-sc_threshold', '0',    // 씬 변경 감지 비활성화
            '-fflags', '+genpts',    // PTS 재생성
            '-flags', '+cgop',       // Closed GOP 사용
            '-movflags', '+faststart',
            ...(hasAudioOutput ? ['-c:a', 'copy'] : ['-an']), // 오디오 출력이 있으면 복사, 없으면 비활성화
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

        console.log('🎬 필터 복합 빌드:', {
            videoCount: videoInfos.length,
            targetResolution: `${targetWidth}x${targetHeight}`,
            targetFPS: targetFPS,
            audioInfo: videoInfos.map((v, i) => ({
                index: i,
                hasAudio: v.info.hasAudio,
                audioCodec: v.info.audioCodec
            }))
        });

        let filterParts = [];

        // 각 입력을 표준화 (블랙프레임 방지를 위한 추가 필터 포함)
        videoInfos.forEach((videoInfo, index) => {
            const needsScale = videoInfo.info.width !== targetWidth || 
                             videoInfo.info.height !== targetHeight;
            const needsFPS = Math.abs(videoInfo.info.fps - targetFPS) > 0.1;

            let filter = `[${index}:v]`;
            
            // settb로 타임베이스 정규화
            filter += 'settb=AVTB,setpts=PTS-STARTPTS';
            
            if (needsScale) {
                filter += `,scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2`;
            }
            
            if (needsFPS) {
                filter += ',' + `fps=${targetFPS}`;
            }
            
            // 항상 필터 체인 적용
            filter += `[v${index}];`;
            filterParts.push(filter);
        });

        // 비디오 병합
        const videoInputs = videoInfos.map((_, index) => `[v${index}]`).join('');
        filterParts.push(`${videoInputs}concat=n=${videoInfos.length}:v=1:a=0[outv];`);

        // 오디오 병합 (모든 비디오에 오디오가 있는 경우에만)
        const videosWithAudio = videoInfos.filter(v => v.info.hasAudio);
        const allHaveAudio = videosWithAudio.length === videoInfos.length;
        
        if (allHaveAudio) {
            // 모든 비디오에 오디오가 있는 경우
            const audioInputs = videoInfos.map((_, index) => `[${index}:a]`).join('');
            filterParts.push(`${audioInputs}concat=n=${videoInfos.length}:v=0:a=1[outa]`);
        } else if (videosWithAudio.length > 0) {
            // 일부만 오디오가 있는 경우 - 무음 추가
            const audioFilters = [];
            videoInfos.forEach((videoInfo, index) => {
                if (videoInfo.info.hasAudio) {
                    audioFilters.push(`[${index}:a]adelay=0|0[a${index}]`);
                } else {
                    // 무음 생성 (해당 비디오의 길이만큼)
                    const duration = videoInfo.info.duration;
                    audioFilters.push(`anullsrc=channel_layout=stereo:sample_rate=48000:duration=${duration}[a${index}]`);
                }
            });
            
            // 모든 오디오 스트림 병합
            const audioInputs = videoInfos.map((_, index) => `[a${index}]`).join('');
            filterParts.push(audioFilters.join(';') + ';' + `${audioInputs}concat=n=${videoInfos.length}:v=0:a=1[outa]`);
        }

        const filterComplex = filterParts.join('');
        console.log('📝 생성된 필터 복합:', filterComplex);
        return filterComplex;
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
                                
                                const result = {
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
                                };

                                // Eagle 자동 임포트 시도
                                (async () => {
                                    try {
                                        console.log('🦅 Eagle 자동 임포트 시작...');
                                        await this.importToEagle(outputPath, result);
                                        console.log('✅ Eagle 자동 임포트 성공!');
                                    } catch (importError) {
                                        console.error('❌ Eagle 임포트 실패:', importError);
                                        console.error('상세 오류:', {
                                            message: importError.message,
                                            stack: importError.stack,
                                            outputPath: outputPath,
                                            fileName: result.filename
                                        });
                                        // 임포트 실패해도 병합은 성공으로 처리
                                    }
                                    
                                    // 임포트 성공/실패와 관계없이 결과 반환
                                    resolve(result);
                                })();
                            } else {
                                console.warn('출력 파일 없음 또는 크기 0:', outputPath);
                                reject(new Error('병합된 파일이 생성되지 않았습니다'));
                            }
                        } else {
                            console.warn(`❌ 병합 실패: 코드=${code} (${method})`);
                            if (stderr) {
                                // 전체 stderr 출력하여 정확한 오류 확인
                                console.warn('FFmpeg 전체 오류 메시지:', stderr);
                                
                                // 주요 오류 메시지 추출
                                const errorLines = stderr.split('\n').filter(line => 
                                    line.includes('Error') || 
                                    line.includes('error') || 
                                    line.includes('Invalid') ||
                                    line.includes('No such') ||
                                    line.includes('Stream specifier')
                                );
                                
                                if (errorLines.length > 0) {
                                    console.error('FFmpeg 주요 오류:', errorLines.join('\n'));
                                }
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
     * 출력 파일명 생성 (첫 번째 파일 기반 + conc_시퀀스)
     */
    async generateOutputFileName(videoFiles) {
        if (videoFiles.length === 0) {
            return 'concat_0001.mp4';
        }
        
        // 첫 번째 비디오 파일명에서 시퀀스 번호 제거
        const firstName = this.getBaseName(videoFiles[0].name);
        const baseNameWithoutSequence = this.removeSequenceNumber(firstName);
        
        // 기존 병합 파일 확인하여 시퀀스 번호 결정
        const sequenceNumber = await this.getNextSequenceNumber(baseNameWithoutSequence);
        
        return `${baseNameWithoutSequence}_conc_${sequenceNumber.toString().padStart(4, '0')}.mp4`;
    }

    /**
     * 파일명에서 시퀀스 번호 제거
     */
    removeSequenceNumber(fileName) {
        // 다양한 시퀀스 패턴 제거
        const patterns = [
            /_\d{3,4}$/,        // _001, _0001 등
            /_seq\d{2,4}$/i,    // _seq01, _seq001 등  
            /_\d{2,4}_/,        // _01_, _001_ 등 (중간에 있는 경우)
            /\(\d+\)$/,         // (1), (01) 등
            /-\d{3,4}$/,        // -001, -0001 등
            /\s\d{3,4}$/,       // 공백 001, 공백 0001 등
            /_v\d+$/i,          // _v1, _v01 등
            /_ver\d+$/i,        // _ver1, _ver01 등
            /_final\d*$/i,      // _final, _final1 등
            /_edit\d*$/i        // _edit, _edit1 등
        ];
        
        let cleanName = fileName;
        
        // 모든 패턴에 대해 제거 시도
        for (const pattern of patterns) {
            cleanName = cleanName.replace(pattern, '');
        }
        
        // 끝에 남아있는 언더스코어나 하이픈 제거
        cleanName = cleanName.replace(/[-_]+$/, '');
        
        console.log('📝 파일명 시퀀스 제거:', {
            original: fileName,
            cleaned: cleanName
        });
        
        return cleanName || 'video'; // 빈 문자열 방지
    }

    /**
     * 다음 시퀀스 번호 결정
     */
    async getNextSequenceNumber(baseName) {
        try {
            const fs = this.eagleUtils?.getFS() || (window.require ? window.require('fs') : null);
            if (!fs) {
                console.warn('파일 시스템 접근 불가, 기본 시퀀스 1 사용');
                return 1;
            }
            
            // concatenated 디렉토리에서 기존 파일 확인
            let concatenatedDir = this.outputDir;
            if (this.eagleUtils) {
                concatenatedDir = await this.eagleUtils.getCacheDirectory('concatenated');
            }
            
            if (!fs.existsSync(concatenatedDir)) {
                return 1; // 디렉토리가 없으면 첫 번째
            }
            
            const files = fs.readdirSync(concatenatedDir);
            const pattern = new RegExp(`^${this.escapeRegExp(baseName)}_conc_(\\d{4})\\.mp4$`, 'i');
            
            let maxSequence = 0;
            
            files.forEach(file => {
                const match = file.match(pattern);
                if (match) {
                    const sequence = parseInt(match[1], 10);
                    if (sequence > maxSequence) {
                        maxSequence = sequence;
                    }
                }
            });
            
            const nextSequence = maxSequence + 1;
            
            console.log('🔢 시퀀스 번호 결정:', {
                baseName: baseName,
                existingFiles: files.filter(f => pattern.test(f)),
                maxSequence: maxSequence,
                nextSequence: nextSequence
            });
            
            return nextSequence;
            
        } catch (error) {
            console.error('시퀀스 번호 결정 실패:', error);
            return 1; // 오류 시 기본값
        }
    }

    /**
     * 정규식 특수문자 이스케이프
     */
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
            'high': 'medium'  // 5Mbps 타겟에서는 medium이 적합
        };
        return presetMap[quality] || 'medium';
    }

    /**
     * 품질을 비트레이트로 변환 (5Mbps 타겟 설정)
     */
    mapQualityToBitrate(quality) {
        const bitrateMap = {
            'fast': '3M',    // 빠른 처리용 3Mbps
            'medium': '5M',  // 표준 5Mbps
            'high': '8M'     // 고품질 8Mbps
        };
        return bitrateMap[quality] || '5M';
    }

    /**
     * 품질을 버퍼 크기로 변환 (비트레이트의 2배)
     */
    mapQualityToBufferSize(quality) {
        const bufferMap = {
            'fast': '6M',    // 3M * 2
            'medium': '10M', // 5M * 2
            'high': '16M'    // 8M * 2
        };
        return bufferMap[quality] || '10M';
    }

    /**
     * GPU 가속 코덱 선택
     */
    getVideoCodec(options) {
        if (!options.enableGPUAcceleration) {
            return 'libx264'; // CPU 인코딩
        }
        
        // GPU 타입에 따른 코덱 선택
        switch (options.gpuType) {
            case 'nvidia':
                return 'h264_nvenc';
            case 'intel':
                return 'h264_qsv';
            case 'amd':
                return 'h264_amf';
            case 'auto':
            default:
                // 자동 감지 시도 (실제로는 사용 가능한 첫 번째 옵션 사용)
                return this.detectBestGPUCodec();
        }
    }

    /**
     * 최적 GPU 코덱 자동 감지
     */
    detectBestGPUCodec() {
        // 실제 구현에서는 FFmpeg의 -encoders 출력을 파싱하여 사용 가능한 코덱 확인
        // 여기서는 일반적인 우선순위로 폴백
        const gpuCodecs = ['h264_nvenc', 'h264_qsv', 'h264_amf'];
        
        // 현재는 NVIDIA 우선으로 반환 (실제로는 시스템 검사 필요)
        console.log('🔍 GPU 코덱 자동 감지: NVIDIA 우선 선택');
        return 'h264_nvenc';
    }

    /**
     * GPU별 추가 인코딩 옵션
     */
    getGPUEncodingOptions(codec, quality) {
        const options = [];
        
        switch (codec) {
            case 'h264_nvenc':
                options.push('-preset', 'p4'); // NVIDIA preset (fast)
                options.push('-profile:v', 'high');
                options.push('-rc', 'vbr'); // Variable bitrate
                break;
                
            case 'h264_qsv':
                options.push('-preset', 'medium');
                options.push('-profile:v', 'high');
                break;
                
            case 'h264_amf':
                options.push('-rc', 'vbr');
                options.push('-quality', 'balanced');
                break;
        }
        
        return options;
    }

    /**
     * 파일 크기 예측 (5Mbps 타겟 기준)
     * @param {number} durationSeconds - 비디오 길이 (초)
     * @param {string} quality - 품질 설정
     * @returns {Object} 예상 파일 크기 정보
     */
    estimateFileSize(durationSeconds, quality = 'medium') {
        // 비트레이트 매핑 (Mbps)
        const bitrateMap = {
            'fast': 3,
            'medium': 5,
            'high': 8
        };
        
        const bitrateMbps = bitrateMap[quality] || 5;
        
        // 파일 크기 계산: (비트레이트 * 시간) / 8 = MB
        const estimatedSizeMB = (bitrateMbps * durationSeconds) / 8;
        
        return {
            quality: quality,
            bitrateMbps: bitrateMbps,
            durationSeconds: durationSeconds,
            estimatedSizeMB: Math.round(estimatedSizeMB * 100) / 100,
            estimatedSizeGB: Math.round(estimatedSizeMB / 1024 * 100) / 100,
            formattedSize: this.formatEstimatedSize(estimatedSizeMB)
        };
    }

    /**
     * 예상 파일 크기 포맷팅
     */
    formatEstimatedSize(sizeMB) {
        if (sizeMB < 1024) {
            return `${Math.round(sizeMB * 100) / 100}MB`;
        } else {
            return `${Math.round(sizeMB / 1024 * 100) / 100}GB`;
        }
    }

    /**
     * 품질별 파일 크기 비교 정보
     */
    getQualityComparison(durationSeconds) {
        const qualities = ['fast', 'medium', 'high'];
        const comparison = {};
        
        qualities.forEach(quality => {
            comparison[quality] = this.estimateFileSize(durationSeconds, quality);
        });
        
        return comparison;
    }

    /**
     * Eagle 라이브러리 자동 임포트
     */
    async importToEagle(filePath, resultInfo) {
        try {
            // Eagle API 사용 가능 여부 확인
            if (typeof eagle === 'undefined') {
                throw new Error('Eagle API를 사용할 수 없습니다');
            }

            console.log('🦅 Eagle 자동 임포트 시작:', filePath);

            // 파일 정보 준비
            const path = this.eagleUtils?.getNodeModule('path');
            const fileName = path ? path.basename(filePath) : filePath.split('/').pop();
            const fileStats = this.eagleUtils?.getFileStats(filePath) || 
                             window.require('fs').statSync(filePath);
            
            // 파일 크기 포매팅
            const fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(1);
            
            // 메타데이터 생성
            const metadata = {
                type: 'video',
                source: 'Video Processor Plugin',
                method: resultInfo.method,
                inputCount: resultInfo.inputCount,
                totalDuration: `${Math.round(resultInfo.totalDuration)}초`,
                quality: resultInfo.quality,
                bitrate: '5Mbps',
                fileSize: `${fileSizeMB}MB`,
                inputFiles: resultInfo.metadata.inputFiles.join(', '),
                processingDate: new Date().toISOString(),
                tags: ['병합', '비디오', '5Mbps', resultInfo.method]
            };

            // Eagle 폴더 확인/생성
            const targetFolderName = 'Hero Video';
            let targetFolderId = null;
            
            try {
                // 폴더 검색
                console.log('📁 Hero Video 폴더 검색 중...');
                const folders = await eagle.folder.getAll();
                
                if (folders && Array.isArray(folders)) {
                    const targetFolder = folders.find(f => f.name === targetFolderName);
                    
                    if (targetFolder) {
                        targetFolderId = targetFolder.id;
                        console.log(`✅ 기존 폴더 발견: ${targetFolderName} (ID: ${targetFolderId})`);
                    } else {
                        // 폴더 생성
                        console.log(`📁 새 폴더 생성: ${targetFolderName}`);
                        const newFolder = await eagle.folder.create(targetFolderName);
                        
                        if (newFolder && newFolder.id) {
                            targetFolderId = newFolder.id;
                            console.log(`✅ 폴더 생성 완료: ${targetFolderName} (ID: ${targetFolderId})`);
                        } else {
                            console.warn('⚠️ 폴더 생성 실패, 루트에 임포트합니다');
                        }
                    }
                } else {
                    console.warn('⚠️ 폴더 목록을 가져올 수 없습니다, 루트에 임포트합니다');
                }
            } catch (folderError) {
                console.warn('⚠️ 폴더 처리 중 오류:', folderError.message);
                console.log('📁 루트에 임포트합니다');
            }

            // 파일 존재 확인
            const fs = this.eagleUtils?.getFS() || window.require('fs');
            if (!fs.existsSync(filePath)) {
                throw new Error(`파일이 존재하지 않습니다: ${filePath}`);
            }

            // Eagle에 파일 임포트
            const importOptions = {
                path: filePath,
                name: fileName.replace('.mp4', ''), // 확장자 제거
                annotation: `병합된 비디오 (${resultInfo.inputCount}개 파일)\n` +
                           `처리 시간: ${Math.round(resultInfo.totalDuration)}초\n` +
                           `품질: ${resultInfo.quality} (5Mbps)\n` +
                           `방식: ${resultInfo.method}`,
                tags: metadata.tags
            };
            
            // 폴더 ID가 있으면 설정
            if (targetFolderId) {
                importOptions.folders = [targetFolderId];
                console.log(`📂 Hero Video 폴더에 임포트합니다 (ID: ${targetFolderId})`);
            } else {
                console.log('📂 루트 폴더에 임포트합니다');
            }

            console.log('📤 Eagle 임포트 옵션:', importOptions);

            // Eagle API 호출 - 올바른 형식으로 호출
            let importResult;
            try {
                console.log('🔄 Eagle 임포트 시도...');
                
                // Eagle API v2 형식 - 올바른 객체 형식으로 전달
                importResult = await eagle.item.addFromPath(
                    filePath,
                    {
                        name: fileName.replace('.mp4', ''),
                        annotation: importOptions.annotation,
                        tags: importOptions.tags,
                        folders: importOptions.folders
                    }
                );
                
                console.log('📥 Eagle API 응답:', importResult);
                
                // false 응답 처리
                if (importResult === false) {
                    throw new Error('Eagle API가 false를 반환했습니다. 파일이 이미 존재하거나 권한 문제일 수 있습니다.');
                }
                
            } catch (apiError) {
                console.error('⚠️ Eagle 임포트 오류:', apiError);
                
                // 대체 방법: 단순 파일 경로만으로 시도
                try {
                    console.log('🔄 대체 방법 시도: 단순 경로로 임포트...');
                    
                    // 가장 간단한 형태로 시도
                    importResult = await eagle.item.addFromPath(filePath);
                    console.log('📥 Eagle API (단순) 응답:', importResult);
                    
                    // 성공한 경우 태그, 주석, 폴더 업데이트 시도
                    if (importResult && typeof importResult === 'string') {
                        try {
                            // 태그 추가
                            if (importOptions.tags && importOptions.tags.length > 0) {
                                await eagle.item.update(importResult, {
                                    tags: importOptions.tags
                                });
                            }
                            // 주석 추가
                            if (importOptions.annotation) {
                                await eagle.item.update(importResult, {
                                    annotation: importOptions.annotation
                                });
                            }
                            // 폴더 이동
                            if (targetFolderId) {
                                console.log(`📂 Hero Video 폴더로 이동 중... (ID: ${targetFolderId})`);
                                await eagle.item.update(importResult, {
                                    folders: [targetFolderId]
                                });
                                console.log('✅ 폴더 이동 완료');
                            }
                        } catch (updateError) {
                            console.warn('태그/주석/폴더 업데이트 실패:', updateError);
                        }
                    }
                    
                } catch (apiError2) {
                    console.error('❌ 모든 Eagle API 호출 실패:', apiError2);
                    throw new Error(`Eagle API 호출 실패: ${apiError2.message}`);
                }
            }
            
            // 성공 판단 (다양한 응답 형식 처리)
            if (importResult) {
                // Eagle API가 문자열 ID를 반환하는 경우도 성공으로 처리
                if (typeof importResult === 'string' && importResult.length > 0) {
                    console.log('✅ Eagle 자동 임포트 완료! ID:', importResult);
                    return { id: importResult, status: 'success' };
                }
                
                if (importResult === true || 
                    (importResult.status === 'success') ||
                    (Array.isArray(importResult) && importResult.length > 0) ||
                    (importResult.data && importResult.data.id) ||
                    (importResult.id)) {
                    
                    console.log('✅ Eagle 자동 임포트 완료!');
                    console.log('임포트 결과:', importResult);
                    return importResult;
                    
                } else if (importResult === false) {
                    console.warn('⚠️ Eagle 임포트 실패: 파일이 이미 존재하거나 권한 문제');
                    throw new Error('파일이 이미 Eagle에 존재하거나 권한 문제가 있습니다');
                }
            }
            
            const errorMsg = importResult?.message || 
                           JSON.stringify(importResult) || 
                           'Unknown error';
            throw new Error(`임포트 실패: ${errorMsg}`);

        } catch (error) {
            console.error('❌ Eagle 자동 임포트 실패:', error);
            throw error;
        }
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