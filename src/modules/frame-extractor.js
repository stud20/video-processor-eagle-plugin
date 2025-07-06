/**
 * FrameExtractor - 프레임 추출 모듈
 * 컷 변화 지점의 중간 프레임을 추출합니다.
 */

// 브라우저 환경에서 필요한 전역 변수들 (frame-extractor 전용)
const fs_fe = window.require ? window.require('fs') : null;
const path_fe = window.require ? window.require('path') : null;
const { spawn: spawn_fe } = window.require ? window.require('child_process') : { spawn: null };

class FrameExtractor {
    constructor(ffmpegPaths = null) {
        // 고정된 캐시 디렉토리 사용
        this.outputDir = '/Users/ysk/.video-processor-cache/frames/greatminds website';
        this.ffmpegPaths = ffmpegPaths;
        this.ensureOutputDirectory();
    }

    /**
     * 출력 디렉토리 생성 확인
     */
    ensureOutputDirectory() {
        if (fs_fe && !fs_fe.existsSync(this.outputDir)) {
            fs_fe.mkdirSync(this.outputDir, { recursive: true });
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
     * 프레임 추출 메인 함수
     * @param {string} videoPath - 비디오 파일 경로
     * @param {Array} cutPoints - 컷 포인트 배열
     * @param {Object} settings - 추출 설정
     * @param {function} progressCallback - 진행률 콜백
     * @param {Object} ffmpegPaths - ffmpeg, ffprobe 경로 (선택사항)
     * @returns {Promise<Object>} 추출 결과 객체
     */
    async extractFrames(videoPath, cutPoints, settings, progressCallback = null, ffmpegPaths = null) {
        try {
            console.log('프레임 추출 시작:', cutPoints.length, '개의 컷 포인트');
            
            // FFmpeg 경로 설정
            if (ffmpegPaths) {
                this.setFFmpegPaths(ffmpegPaths);
            }
            
            if (!this.ffmpegPaths) {
                throw new Error('FFmpeg 경로가 설정되지 않았습니다.');
            }
            
            const extractedFrames = [];
            const totalFrames = cutPoints.length;
            
            // 각 컷 포인트에서 프레임 추출
            for (let i = 0; i < cutPoints.length; i++) {
                const cutPoint = cutPoints[i];
                let extractTime;
                let extractFrameNumber;
                
                // 프레임 정보가 있는 경우
                if (cutPoint.inFrame !== undefined && cutPoint.outFrame !== undefined) {
                    // 중간 프레임 계산
                    const middleFrame = Math.round((cutPoint.inFrame + cutPoint.outFrame) / 2);
                    extractFrameNumber = middleFrame;
                    extractTime = cutPoint.start + (cutPoint.duration / 2);
                    console.log(`프레임 추출 중: ${i + 1}/${totalFrames} - 프레임 #${middleFrame} (시간: ${extractTime.toFixed(2)}초)`);
                } else {
                    // 기존 방식: 시간 기반
                    extractTime = cutPoint.start + (cutPoint.duration / 2);
                    console.log(`프레임 추출 중: ${i + 1}/${totalFrames} - 시간: ${extractTime.toFixed(2)}초`);
                }
                
                const frameInfo = await this.extractSingleFrame(
                    videoPath,
                    extractTime,
                    i + 1,
                    settings,
                    extractFrameNumber
                );
                
                extractedFrames.push(frameInfo);
                
                // 진행률 업데이트
                if (progressCallback) {
                    progressCallback((i + 1) / totalFrames);
                }
            }
            
            console.log('프레임 추출 완료:', extractedFrames.length, '개의 프레임');
            
            return {
                count: extractedFrames.length,
                frames: extractedFrames,
                paths: extractedFrames.map(f => f.path)
            };
            
        } catch (error) {
            console.error('프레임 추출 실패:', error);
            throw new Error('프레임 추출에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 단일 프레임 추출
     * @param {string} videoPath - 비디오 파일 경로
     * @param {number} timeSeconds - 추출할 시간 (초)
     * @param {number} frameIndex - 프레임 인덱스
     * @param {Object} settings - 추출 설정
     * @param {number} frameNumber - 실제 프레임 번호 (옵션)
     * @returns {Promise<Object>} 추출된 프레임 정보
     */
    async extractSingleFrame(videoPath, timeSeconds, frameIndex, settings, frameNumber = null) {
        return new Promise((resolve, reject) => {
            const videoName = path_fe ? path_fe.basename(videoPath, path_fe.extname(videoPath)) : 'video';
            const outputFileName = `${videoName}_frame_${frameIndex.toString().padStart(3, '0')}.${settings.imageFormat}`;
            const outputPath = path_fe ? path_fe.join(this.outputDir, outputFileName) : `${this.outputDir}/${outputFileName}`;
            
            // FFmpeg 명령어 구성
            const args = [
                '-i', videoPath,
                '-ss', timeSeconds.toString(),
                '-frames:v', '1',
                '-q:v', this.mapQualityToFFmpeg(settings.quality, settings.imageFormat),
                '-y', // 파일 덮어쓰기
                outputPath
            ];

            const ffmpeg = spawn_fe(this.ffmpegPaths.ffmpeg, args);
            
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
                if (fs_fe && !fs_fe.existsSync(outputPath)) {
                    reject(new Error(`프레임 파일이 생성되지 않았습니다: ${outputPath}`));
                    return;
                }

                // 파일 정보 가져오기
                const stats = fs_fe ? fs_fe.statSync(outputPath) : { size: 0 };
                
                resolve({
                    path: outputPath,
                    filename: outputFileName,
                    timeSeconds: timeSeconds,
                    frameIndex: frameIndex,
                    frameNumber: frameNumber, // 실제 프레임 번호 추가
                    fileSize: stats.size,
                    format: settings.imageFormat,
                    quality: settings.quality
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
     * 프레임 메타데이터 생성
     * @param {string} videoPath - 원본 비디오 경로
     * @param {Array} frames - 추출된 프레임 배열
     * @returns {Object} 메타데이터 객체
     */
    generateMetadata(videoPath, frames) {
        const videoName = path_fe ? path_fe.basename(videoPath, path_fe.extname(videoPath)) : 'video';
        
        return {
            sourceVideo: videoName,
            extractedAt: new Date().toISOString(),
            totalFrames: frames.length,
            frames: frames.map(frame => ({
                filename: frame.filename,
                timeSeconds: frame.timeSeconds,
                frameIndex: frame.frameIndex,
                fileSize: frame.fileSize
            }))
        };
    }

    /**
     * 메타데이터 파일 저장
     * @param {Object} metadata - 메타데이터 객체
     * @param {string} videoPath - 원본 비디오 경로
     */
    saveMetadata(metadata, videoPath) {
        const videoName = path_fe ? path_fe.basename(videoPath, path_fe.extname(videoPath)) : 'video';
        const metadataPath = path_fe ? path_fe.join(this.outputDir, `${videoName}_frames_metadata.json`) : `${this.outputDir}/${videoName}_frames_metadata.json`;
        
        try {
            if (fs_fe) {
                fs_fe.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                console.log('메타데이터 저장 완료:', metadataPath);
            }
        } catch (error) {
            console.error('메타데이터 저장 실패:', error);
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
}

// 브라우저 환경에서 전역 객체로 등록
window.FrameExtractor = FrameExtractor;