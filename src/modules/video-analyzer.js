/**
 * VideoAnalyzer - 비디오 분석 및 컷 변화 감지 모듈
 * FFmpeg를 사용하여 동영상의 장면 변화를 감지합니다.
 */

// 브라우저 환경에서 필요한 전역 변수들 (video-analyzer 전용)
const fs_va = window.require ? window.require('fs') : null;
const path_va = window.require ? window.require('path') : null;
const { spawn: spawn_va } = window.require ? window.require('child_process') : { spawn: null };

class VideoAnalyzer {
    constructor(ffmpegPaths = null) {
        this.tempDir = path_va ? path_va.join(__dirname, '../../assets/temp') : '/tmp/eagle-video-temp';
        this.ffmpegPaths = ffmpegPaths;
        this.ensureTempDirectory();
    }

    /**
     * 임시 디렉토리 생성 확인
     */
    ensureTempDirectory() {
        if (fs_va && !fs_va.existsSync(this.tempDir)) {
            fs_va.mkdirSync(this.tempDir, { recursive: true });
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
     * 비디오 정보 가져오기
     * @param {string} videoPath - 비디오 파일 경로
     * @returns {Promise<Object>} 비디오 정보 객체
     */
    async getVideoInfo(videoPath) {
        return new Promise((resolve, reject) => {
            const ffprobe = spawn_va(this.ffmpegPaths.ffprobe, [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                videoPath
            ]);

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

            const ffmpeg = spawn_va(this.ffmpegPaths.ffmpeg, args);
            
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
     * 컷 포인트 정제 및 구간 생성 (프레임 단위 정확도)
     * @param {Array} cutPoints - 원본 컷 포인트 배열 (초 단위)
     * @param {Object} videoInfo - 비디오 정보 객체
     * @param {number} inHandle - In 포인트 핸들 (프레임 수)
     * @param {number} outHandle - Out 포인트 핸들 (프레임 수)
     * @returns {Array} 정제된 컷 포인트 구간 배열
     */
    refineCutPointsFrameAccurate(cutPoints, videoInfo, inHandle = 3, outHandle = 3) {
        console.log('컷 포인트 정제 시작 (프레임 단위):', { 
            cutPoints, 
            fps: videoInfo.fps,
            frameTime: videoInfo.frameTime,
            totalDuration: videoInfo.duration 
        });
        
        if (cutPoints.length === 0) {
            console.log('컷 포인트가 없어 기본 추출 사용');
            return this.generateDefaultCutPointsFrameAccurate(videoInfo, inHandle, outHandle);
        }

        const refined = [];
        const fps = videoInfo.fps;
        const frameTime = videoInfo.frameTime;
        
        // 컷 포인트를 프레임 번호로 변환
        const cutFrames = cutPoints.map(time => Math.round(time * fps));
        
        // 중복 제거 및 정렬
        const uniqueCutFrames = [...new Set(cutFrames)].sort((a, b) => a - b);
        
        console.log('컷 변화 프레임 번호:', uniqueCutFrames);
        
        // 각 컷 구간 생성
        for (let i = 0; i < uniqueCutFrames.length; i++) {
            const currentCutFrame = uniqueCutFrames[i];
            const nextCutFrame = i < uniqueCutFrames.length - 1 ? uniqueCutFrames[i + 1] : Math.floor(videoInfo.duration * fps);
            
            // 컷이 바뀐 프레임에서 inHandle만큼 더한 프레임이 in점, 다음 컷에서 outHandle만큼 뺀 프레임이 out점
            const inFrame = currentCutFrame + inHandle;
            const outFrame = nextCutFrame - outHandle;
            
            // 프레임을 시간으로 변환
            const inTime = inFrame * frameTime;
            const outTime = (outFrame + 1) * frameTime; // out 프레임 포함
            
            const duration = outTime - inTime;
            
            // 최소 10프레임 이상의 구간만 포함
            if (outFrame - inFrame >= 10) {
                refined.push({
                    start: inTime,
                    end: outTime,
                    duration: duration,
                    inFrame: inFrame,
                    outFrame: outFrame,
                    frameCount: outFrame - inFrame + 1,
                    index: refined.length
                });
                
                console.log(`구간 ${refined.length}: 프레임 ${inFrame}-${outFrame} (시간: ${inTime.toFixed(3)}-${outTime.toFixed(3)}초)`);
            }
        }
        
        // 첫 번째 컷 이전 구간 추가 (비디오 시작부터 첫 컷에서 outHandle만큼 뺀 프레임까지)
        if (uniqueCutFrames.length > 0 && uniqueCutFrames[0] > (inHandle + outHandle + 10)) { // 최소 핸들 + 10프레임 이상
            const firstCutFrame = uniqueCutFrames[0];
            refined.unshift({
                start: 0,
                end: (firstCutFrame - outHandle) * frameTime,
                duration: (firstCutFrame - outHandle) * frameTime,
                inFrame: 0,
                outFrame: firstCutFrame - outHandle,
                frameCount: firstCutFrame - outHandle,
                index: 0
            });
            
            // 인덱스 재조정
            for (let i = 1; i < refined.length; i++) {
                refined[i].index = i;
            }
        }
        
        console.log(`정제된 컷 포인트 구간: ${refined.length}개`);
        
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