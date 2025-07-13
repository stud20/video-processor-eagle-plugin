/**
 * VideoAnalyzer - 비디오 분석 및 컷 변화 감지 모듈 (리팩토링 버전)
 * FFmpeg를 사용하여 동영상의 장면 변화를 감지합니다.
 */

class VideoAnalyzer {
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
            enableCaching: true,
            useFrameAccuracy: true,
            ...options
        };

        // 임시 디렉토리는 동적으로 설정
        this.tempDir = null;
        this.initialized = false;
    }

    /**
     * 초기화 (비동기)
     */
    async initialize() {
        if (this.initialized) return;

        try {
            this.tempDir = this.eagleUtils ? 
                await this.eagleUtils.getCacheDirectory('temp') :
                this.getFallbackTempDir();

            console.log('VideoAnalyzer 초기화 완료, 임시 디렉토리:', this.tempDir);
            this.initialized = true;
        } catch (error) {
            console.error('VideoAnalyzer 초기화 실패:', error);
            this.tempDir = this.getFallbackTempDir();
            this.initialized = true;
        }
    }

    /**
     * 폴백 임시 디렉토리 생성
     * @returns {string} 폴백 디렉토리 경로
     */
    getFallbackTempDir() {
        const os = this.eagleUtils?.getNodeModule('os');
        const path = this.eagleUtils?.getNodeModule('path');
        
        if (os && path) {
            return path.join(os.tmpdir(), 'video-processor-temp');
        }
        return './temp';
    }

    /**
     * 임시 디렉토리 생성 확인
     */
    async ensureTempDirectory() {
        if (!this.initialized) {
            await this.initialize();
        }

        if (this.eagleUtils) {
            await this.eagleUtils.ensureDirectory(this.tempDir);
        } else {
            // 폴백: 직접 디렉토리 생성
            const fs = window.require ? window.require('fs') : null;
            if (fs && !fs.existsSync(this.tempDir)) {
                fs.mkdirSync(this.tempDir, { recursive: true });
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
     * 컷 변화 감지 메인 함수
     * @param {string} videoPath - 비디오 파일 경로
     * @param {number} sensitivity - 감지 민감도 (0.1 ~ 1.0)
     * @param {function} progressCallback - 진행률 콜백
     * @param {Object} ffmpegPaths - ffmpeg, ffprobe 경로 (선택사항)
     * @param {number} inHandle - In 포인트 핸들 (프레임 수)
     * @param {number} outHandle - Out 포인트 핸들 (프레임 수)
     * @returns {Promise<Array>} 컷 포인트 배열
     */
    async detectCutChanges(videoPath, sensitivity = 0.3, progressCallback = null, ffmpegPaths = null, inHandle = 3, outHandle = 3) {
        try {
            console.log('컷 변화 감지 시작:', videoPath);
            
            // FFmpeg 경로 설정
            if (ffmpegPaths) {
                this.setFFmpegPaths(ffmpegPaths);
            }
            
            if (!this.ffmpegPaths) {
                throw new Error('FFmpeg 경로가 설정되지 않았습니다.');
            }
            
            // 1단계: 비디오 정보 가져오기
            if (progressCallback) progressCallback(0.1);
            const videoInfo = await this.getVideoInfo(videoPath);
            
            // 2단계: 장면 변화 감지 (FFmpeg select filter 사용)
            if (progressCallback) progressCallback(0.3);
            const cutPoints = await this.detectSceneChanges(videoPath, sensitivity, progressCallback);
            
            // 3단계: 컷 포인트 정제 및 검증 (프레임 단위로)
            if (progressCallback) progressCallback(0.9);
            const refinedCutPoints = this.refineCutPointsFrameAccurate(cutPoints, videoInfo, inHandle, outHandle);
            
            console.log('컷 변화 감지 완료:', refinedCutPoints.length, '개의 컷 포인트');
            
            if (progressCallback) progressCallback(1.0);
            return refinedCutPoints;
            
        } catch (error) {
            console.error('컷 변화 감지 실패:', error);
            throw new Error('컷 변화 감지에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 비디오 메타데이터 가져오기 (main.js 호환성)
     * @param {string} videoPath - 비디오 파일 경로
     * @returns {Promise<Object>} 비디오 메타데이터 객체
     */
    async getVideoMetadata(videoPath) {
        return await this.getVideoInfo(videoPath);
    }

    /**
     * 비디오 정보 가져오기 (리팩토링 버전)
     * @param {string} videoPath - 비디오 파일 경로
     * @returns {Promise<Object>} 비디오 정보 객체
     */
    async getVideoInfo(videoPath) {
        return new Promise((resolve, reject) => {
            let ffprobe;
            try {
                ffprobe = this.eagleUtils ? 
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
            } catch (error) {
                reject(new Error(`FFprobe 프로세스 시작 실패: ${error.message}`));
                return;
            }

            let output = '';
            let error = '';

            ffprobe.stdout.on('data', (data) => {
                output += data.toString();
            });

            ffprobe.stderr.on('data', (data) => {
                error += data.toString();
            });

            ffprobe.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`FFprobe 실행 실패: ${error}`));
                    return;
                }

                try {
                    const info = JSON.parse(output);
                    const videoStream = info.streams.find(s => s.codec_type === 'video');
                    
                    // 프레임 레이트 계산
                    const fps = eval(videoStream.r_frame_rate); // "25/1" 형태를 숫자로 변환
                    const frameTime = 1 / fps; // 한 프레임의 시간
                    
                    resolve({
                        duration: parseFloat(info.format.duration),
                        width: videoStream.width,
                        height: videoStream.height,
                        fps: fps,
                        frameTime: frameTime,
                        totalFrames: Math.floor(parseFloat(info.format.duration) * fps),
                        codec: videoStream.codec_name,
                        bitrate: parseInt(info.format.bit_rate)
                    });
                } catch (parseError) {
                    reject(new Error('비디오 정보 파싱 실패: ' + parseError.message));
                }
            });
        });
    }

    /**
     * 장면 변화 감지 (FFmpeg select filter 사용)
     * @param {string} videoPath - 비디오 파일 경로
     * @param {number} sensitivity - 감지 민감도
     * @param {function} progressCallback - 진행률 콜백
     * @returns {Promise<Array>} 시간 기반 컷 포인트 배열
     */
    async detectSceneChanges(videoPath, sensitivity, progressCallback) {
        return new Promise((resolve, reject) => {
            console.log('FFmpeg 장면 변화 감지 시작:', {
                videoPath,
                sensitivity,
                ffmpegPath: this.ffmpegPaths.ffmpeg
            });
            
            // FFmpeg 명령어 구성 - 장면 변화 감지
            const args = [
                '-i', videoPath,
                '-filter:v', `select='gt(scene,${sensitivity})',showinfo`,
                '-f', 'null',
                '-'
            ];
            
            console.log('FFmpeg 명령어:', this.ffmpegPaths.ffmpeg, args.join(' '));

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
            let cutPoints = [];
            let totalFrames = 0;
            
            ffmpeg.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                
                // 디버깅: FFmpeg 출력 로그
                if (output.includes('pts_time') || output.includes('time=')) {
                    console.log('FFmpeg 출력:', output.trim());
                }
                
                // showinfo 필터의 출력에서 타임스탬프 추출
                const lines = output.split('\n');
                for (const line of lines) {
                    // pts_time 추출 (장면 변화 시점)
                    const ptsMatch = line.match(/pts_time:(\d+\.?\d*)/);  
                    if (ptsMatch) {
                        const time = parseFloat(ptsMatch[1]);
                        if (!isNaN(time) && time > 0) {
                            cutPoints.push(time);
                            console.log('장면 변화 감지:', time, '초');
                        }
                    }
                    
                    // 프레임 카운터 추출
                    const frameMatch = line.match(/n:(\d+)/);
                    if (frameMatch) {
                        totalFrames = parseInt(frameMatch[1]);
                    }
                    
                    // 진행률 업데이트
                    const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
                    if (timeMatch && progressCallback) {
                        const [, hours, minutes, seconds] = timeMatch;
                        const currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
                        // 대략적인 진행률 계산
                        const estimatedProgress = Math.min(currentTime / 120, 0.8); // 최대 80%
                        progressCallback(0.3 + estimatedProgress * 0.5);
                    }
                }
            });

            ffmpeg.on('close', (code) => {
                console.log('FFmpeg 장면 변화 감지 완료:', {
                    code,
                    totalFrames,
                    cutPointsFound: cutPoints.length,
                    stderr: stderr.slice(-500) // 마지막 500자만 로그
                });
                
                if (code !== 0 && cutPoints.length === 0) {
                    console.warn('FFmpeg 종료 코드:', code, '하지만 처리 계속');
                }
                
                // 중복 제거 및 정렬
                const uniqueCutPoints = [...new Set(cutPoints)].sort((a, b) => a - b);
                
                // 최소 간격 필터링 (1초 이상 차이나는 것만)
                const filteredCutPoints = [];
                let lastTime = -1;
                
                for (const time of uniqueCutPoints) {
                    if (time - lastTime >= 1.0) {
                        filteredCutPoints.push(time);
                        lastTime = time;
                    }
                }
                
                console.log('최종 필터링된 컷 포인트:', filteredCutPoints);
                resolve(filteredCutPoints);
            });

            ffmpeg.on('error', (error) => {
                console.error('FFmpeg 장면 변화 감지 프로세스 오류:', error);
                reject(new Error(`FFmpeg 프로세스 시작 실패: ${error.message}`));
            });
        });
    }

    /**
     * 컷 포인트 정제 및 구간 생성 (프레임 단위 정확도) - 수정됨
     * @param {Array} cutPoints - 원본 컷 포인트 배열 (초 단위) - 장면 변화 지점들
     * @param {Object} videoInfo - 비디오 정보 객체
     * @param {number} inHandle - In 포인트 핸들 (프레임 수)
     * @param {number} outHandle - Out 포인트 핸들 (프레임 수)
     * @returns {Array} 정제된 컷 포인트 구간 배열
     */
    refineCutPointsFrameAccurate(cutPoints, videoInfo, inHandle = 3, outHandle = 3) {
        console.log('컷 포인트 정제 시작 (올바른 인아웃 적용):', { 
            cutPoints, 
            fps: videoInfo.fps,
            frameTime: videoInfo.frameTime,
            totalDuration: videoInfo.duration,
            inHandle,
            outHandle
        });
        
        if (cutPoints.length === 0) {
            console.log('컷 포인트가 없어 기본 추출 사용');
            return this.generateDefaultCutPointsFrameAccurate(videoInfo, inHandle, outHandle);
        }

        const refined = [];
        const fps = videoInfo.fps;
        const frameTime = videoInfo.frameTime;
        
        // 컷 포인트를 프레임 번호로 변환 (장면 변화 지점들)
        const cutFrames = cutPoints.map(time => Math.round(time * fps));
        
        // 중복 제거 및 정렬
        const uniqueCutFrames = [...new Set(cutFrames)].sort((a, b) => a - b);
        
        console.log('장면 변화 프레임 번호:', uniqueCutFrames);
        
        // 🎯 올바른 로직: 각 컷 포인트를 아웃점으로 사용
        // 구간들: [0 ~ 첫컷], [첫컷 ~ 둘째컷], [둘째컷 ~ 셋째컷], ..., [마지막컷 ~ 끝]
        
        let previousCutFrame = 0; // 이전 컷 지점 (첫 번째는 비디오 시작)
        
        for (let i = 0; i < uniqueCutFrames.length; i++) {
            const currentCutFrame = uniqueCutFrames[i]; // 현재 컷 변화 지점
            
            // 🎯 수정된 로직:
            // 인점 = 이전 컷 지점 + inHandle
            // 아웃점 = 현재 컷 지점 - outHandle
            const inFrame = previousCutFrame + inHandle;
            const outFrame = Math.max(currentCutFrame - outHandle, inFrame + Math.round(fps)); // 최소 1초 보장
            
            // 프레임을 시간으로 변환
            const inTime = inFrame * frameTime;
            const outTime = outFrame * frameTime;
            const duration = outTime - inTime;
            
            // 최소 1초 이상의 구간만 포함
            if (duration >= 1.0 && outFrame > inFrame) {
                refined.push({
                    start: inTime,
                    end: outTime,
                    duration: duration,
                    inFrame: inFrame,
                    outFrame: outFrame,
                    frameCount: outFrame - inFrame,
                    index: refined.length,
                    // 이미지 추출용 중간 프레임 정보
                    middleFrame: Math.round((inFrame + outFrame) / 2),
                    middleTime: Math.round((inFrame + outFrame) / 2) * frameTime,
                    // 디버깅 정보
                    cutChangeFrame: currentCutFrame,
                    cutChangeTime: currentCutFrame * frameTime
                });
                
                console.log(`✅ 구간 ${refined.length}: 인점 프레임${inFrame}(${inTime.toFixed(3)}s) → 아웃점 프레임${outFrame}(${outTime.toFixed(3)}s) | 컷변화: 프레임${currentCutFrame} | 중간: 프레임${Math.round((inFrame + outFrame) / 2)}`);
            } else {
                console.log(`⚠️ 구간 스킵: 너무 짧음 - 인점 프레임${inFrame} → 아웃점 프레임${outFrame} (${duration.toFixed(2)}초)`);
            }
            
            // 다음 구간을 위해 이전 컷 지점 업데이트
            previousCutFrame = currentCutFrame;
        }
        
        // 마지막 구간: 마지막 컷부터 비디오 끝까지
        const totalFrames = Math.floor(videoInfo.duration * fps);
        const lastInFrame = previousCutFrame + inHandle;
        const lastOutFrame = totalFrames - outHandle;
        
        if (lastOutFrame > lastInFrame && (lastOutFrame - lastInFrame) >= fps) { // 최소 1초
            const lastInTime = lastInFrame * frameTime;
            const lastOutTime = lastOutFrame * frameTime;
            const lastDuration = lastOutTime - lastInTime;
            
            refined.push({
                start: lastInTime,
                end: lastOutTime,
                duration: lastDuration,
                inFrame: lastInFrame,
                outFrame: lastOutFrame,
                frameCount: lastOutFrame - lastInFrame,
                index: refined.length,
                // 이미지 추출용 중간 프레임 정보
                middleFrame: Math.round((lastInFrame + lastOutFrame) / 2),
                middleTime: Math.round((lastInFrame + lastOutFrame) / 2) * frameTime,
                // 마지막 구간 표시
                isLastSegment: true
            });
            
            console.log(`✅ 마지막 구간 ${refined.length}: 인점 프레임${lastInFrame}(${lastInTime.toFixed(3)}s) → 아웃점 프레임${lastOutFrame}(${lastOutTime.toFixed(3)}s) | 중간: 프레임${Math.round((lastInFrame + lastOutFrame) / 2)}`);
        }
        
        console.log(`🎬 정제 완료: ${refined.length}개 구간, 올바른 인아웃점 적용`);
        console.log('구간 요약:', refined.map(r => `[${r.inFrame}-${r.outFrame}]`).join(', '));
        
        // 여전히 비어있으면 기본 추출 사용
        if (refined.length === 0) {
            console.log('정제 후에도 비어있어 기본 추출 사용');
            return this.generateDefaultCutPointsFrameAccurate(videoInfo, inHandle, outHandle);
        }
        
        return refined;
    }
    
    /**
     * 프레임 단위 기본 컷 포인트 생성 (10초 간격)
     * @param {Object} videoInfo - 비디오 정보 객체
     * @param {number} inHandle - In 포인트 핸들 (프레임 수)
     * @param {number} outHandle - Out 포인트 핸들 (프레임 수)
     * @returns {Array} 기본 컷 포인트 구간 배열
     */
    generateDefaultCutPointsFrameAccurate(videoInfo, inHandle = 3, outHandle = 3) {
        console.log('기본 컷 포인트 생성 (프레임 단위):', videoInfo.duration, '초');
        
        const defaultPoints = [];
        const interval = 10; // 10초 간격
        const fps = videoInfo.fps;
        const frameTime = videoInfo.frameTime;
        const totalFrames = videoInfo.totalFrames;
        
        for (let i = 0; i < videoInfo.duration; i += interval) {
            const startFrame = Math.round(i * fps);
            let endFrame = Math.min(Math.round((i + interval) * fps) - 1, totalFrames - 1);
            
            // 마지막 구간이 아닌 경우 outHandle 프레임 적용
            if (i + interval < videoInfo.duration) {
                endFrame = Math.round((i + interval) * fps) - outHandle;
            }
            
            const start = startFrame * frameTime;
            const end = (endFrame + 1) * frameTime;
            const duration = end - start;
            
            if (endFrame - startFrame >= fps) { // 최소 1초 이상
                defaultPoints.push({
                    start: start,
                    end: end,
                    duration: duration,
                    inFrame: startFrame,
                    outFrame: endFrame,
                    frameCount: endFrame - startFrame + 1,
                    index: defaultPoints.length
                });
            }
        }
        
        console.log('생성된 기본 컷 포인트:', defaultPoints);
        return defaultPoints;
    }

    /**
     * 컷 포인트 정제 및 구간 생성 (기존 함수 - 호환성 유지)
     * @param {Array} cutPoints - 원본 컷 포인트 배열
     * @param {number} totalDuration - 전체 비디오 길이
     * @returns {Array} 정제된 컷 포인트 구간 배열
     */
    refineCutPoints(cutPoints, totalDuration) {
        console.log('컷 포인트 정제 시작:', { cutPoints, totalDuration });
        
        if (cutPoints.length === 0) {
            console.log('컷 포인트가 없어 기본 추출 사용');
            // 컷 포인트가 없으면 기본 추출 사용 (10초 간격)
            return this.generateDefaultCutPoints(totalDuration);
        }

        const refined = [];
        let previousEnd = 0;

        // 각 컷 포인트를 기준으로 구간 생성
        cutPoints.forEach((cutPoint, index) => {
            if (cutPoint > previousEnd + 0.5) { // 최소 0.5초 간격 보장
                refined.push({
                    start: previousEnd,
                    end: cutPoint,
                    duration: cutPoint - previousEnd,
                    index: index
                });
                previousEnd = cutPoint;
            }
        });

        // 마지막 구간 추가
        if (previousEnd < totalDuration - 0.5) {
            refined.push({
                start: previousEnd,
                end: totalDuration,
                duration: totalDuration - previousEnd,
                index: refined.length
            });
        }

        // 너무 짧은 구간 필터링 (1초 미만)
        const filtered = refined.filter(segment => segment.duration >= 1.0);
        
        console.log('정제된 컷 포인트 구간:', filtered);
        
        // 여전히 비어있으면 기본 추출 사용
        if (filtered.length === 0) {
            console.log('정제 후에도 비어있어 기본 추출 사용');
            return this.generateDefaultCutPoints(totalDuration);
        }
        
        return filtered;
    }
    
    /**
     * 기본 컷 포인트 생성 (10초 간격)
     * @param {number} totalDuration - 전체 비디오 길이
     * @returns {Array} 기본 컷 포인트 구간 배열
     */
    generateDefaultCutPoints(totalDuration) {
        console.log('기본 컷 포인트 생성:', totalDuration, '초');
        
        const defaultPoints = [];
        const interval = 10; // 10초 간격
        
        for (let i = 0; i < totalDuration; i += interval) {
            const start = i;
            const end = Math.min(i + interval, totalDuration);
            const duration = end - start;
            
            if (duration >= 1.0) { // 최소 1초 이상
                defaultPoints.push({
                    start: start,
                    end: end,
                    duration: duration,
                    index: defaultPoints.length
                });
            }
        }
        
        console.log('생성된 기본 컷 포인트:', defaultPoints);
        return defaultPoints;
    }

    /**
     * 임시 파일 정리
     */
    cleanup() {
        try {
            if (fs_va) {
                const files = fs_va.readdirSync(this.tempDir);
                files.forEach(file => {
                    const filePath = path_va.join(this.tempDir, file);
                    if (fs_va.statSync(filePath).isFile()) {
                        fs_va.unlinkSync(filePath);
                    }
                });
                console.log('임시 파일 정리 완료');
            }
        } catch (error) {
            console.error('임시 파일 정리 실패:', error);
        }
    }
}

// 브라우저 환경에서 전역 객체로 등록
window.VideoAnalyzer = VideoAnalyzer;