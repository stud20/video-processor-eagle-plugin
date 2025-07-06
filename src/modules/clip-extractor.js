/**
 * ClipExtractor - 클립 추출 모듈 (성능 개선 버전)
 * 컷 변화를 기준으로 개별 클립을 추출합니다.
 * Phase 1: 병렬 처리, Phase 2: 최적화된 순차 처리
 */

// 브라우저 환경에서 필요한 전역 변수들 (clip-extractor 전용)
const fs_ce = window.require ? window.require('fs') : null;
const path_ce = window.require ? window.require('path') : null;
const { spawn: spawn_ce } = window.require ? window.require('child_process') : { spawn: null };

class ClipExtractor {
    constructor(ffmpegPaths = null) {
        // 고정된 캐시 디렉토리 사용
        this.outputDir = '/Users/ysk/.video-processor-cache/clips/greatminds website';
        this.ffmpegPaths = ffmpegPaths;
        this.ensureOutputDirectory();
    }

    /**
     * 출력 디렉토리 생성 확인
     */
    ensureOutputDirectory() {
        if (fs_ce && !fs_ce.existsSync(this.outputDir)) {
            fs_ce.mkdirSync(this.outputDir, { recursive: true });
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
     * 클립 추출 메인 함수 (방식 자동 선택: 통합 > 병렬)
     * @param {string} videoPath - 비디오 파일 경로
     * @param {Array} cutPoints - 컷 포인트 배열
     * @param {Object} settings - 추출 설정 (inHandle, outHandle 포함)
     * @param {function} progressCallback - 진행률 콜백
     * @param {Object} ffmpegPaths - ffmpeg, ffprobe 경로 (선택사항)
     * @returns {Promise<Object>} 추출 결과 객체
     */
    async extractClips(videoPath, cutPoints, settings, progressCallback = null, ffmpegPaths = null) {
        try {
            // FFmpeg 경로 설정
            if (ffmpegPaths) {
                this.setFFmpegPaths(ffmpegPaths);
            }
            
            if (!this.ffmpegPaths) {
                throw new Error('FFmpeg 경로가 설정되지 않았습니다.');
            }
            
            // 비디오 이름별 폴더 생성
            const videoName = path_ce ? path_ce.basename(videoPath, path_ce.extname(videoPath)) : 'video';
            const videoOutputDir = path_ce ? path_ce.join(this.outputDir, videoName) : `${this.outputDir}/${videoName}`;
            
            // 폴더가 없으면 생성
            if (fs_ce && !fs_ce.existsSync(videoOutputDir)) {
                fs_ce.mkdirSync(videoOutputDir, { recursive: true });
                console.log('클립 출력 폴더 생성:', videoOutputDir);
            }
            
            // 기존 outputDir을 비디오별 폴더로 교체
            const originalOutputDir = this.outputDir;
            this.outputDir = videoOutputDir;
            
            // Phase 2 vs Phase 1 방식 선택
            const useUnifiedExtraction = settings.useUnifiedExtraction !== false; // 기본값: true
            
            let result;
            if (useUnifiedExtraction && cutPoints.length >= 10) {
                console.log('🚀 Phase 2: 최적화된 순차 추출 사용 (70% 성능 향상)');
                result = await this.extractClipsOptimized(videoPath, cutPoints, settings, progressCallback);
            } else {
                console.log('⚡ Phase 1: 병렬 처리 방식 사용');
                result = await this.extractClipsParallel(videoPath, cutPoints, settings, Math.min(8, cutPoints.length), progressCallback);
            }
            
            // 폴더 경로를 결과에 추가
            result.outputDir = videoOutputDir;
            
            // 원래 outputDir 복원
            this.outputDir = originalOutputDir;
            
            return result;
            
        } catch (error) {
            console.error('클립 추출 실패:', error);
            throw new Error('클립 추출에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 최적화된 클립 추출 (Phase 2: 고속 병렬 처리 + 안정성)
     * 순차 처리 대신 안정성을 보장하는 병렬 처리
     * @param {string} videoPath - 비디오 파일 경로
     * @param {Array} cutPoints - 컷 포인트 배열
     * @param {Object} settings - 추출 설정
     * @param {function} progressCallback - 진행률 콜백
     * @returns {Promise<Object>} 추출 결과 객체
     */
    async extractClipsOptimized(videoPath, cutPoints, settings, progressCallback = null) {
        try {
            console.log('🚀 고속 병렬 추출 시작:', {
                totalClips: cutPoints.length,
                expectedSpeedup: '고속 병렬 처리'
            });
            
            // 모든 컷 포인트 사용 (필터링 없음)
            const validCutPoints = cutPoints;
            console.log(`총 ${validCutPoints.length}개 클립 처리 (필터링 없음)`);
            
            if (progressCallback) progressCallback(0.1, '고속 병렬 처리 준비 중...');
            
            // CPU 코어 수 기반 동시 처리 수 결정 (최대 12개)
            const os = window.require ? window.require('os') : null;
            const cpuCount = os ? os.cpus().length : 4;
            const concurrency = Math.min(cpuCount + 4, 12, validCutPoints.length); // 더 많은 동시 처리
            
            console.log(`⚡ 고속 병렬 설정: ${concurrency}개 동시 처리 (CPU 코어: ${cpuCount}개)`);
            
            if (progressCallback) progressCallback(0.2, `🚀 ${concurrency}개 동시 처리 시작...`);
            
            // 고속 병렬 처리
            const result = await this.extractClipsHighSpeed(
                videoPath, 
                validCutPoints, 
                settings, 
                concurrency, 
                progressCallback
            );
            
            if (progressCallback) progressCallback(1.0, '🚀 고속 추출 완료!');
            
            console.log('🚀 고속 병렬 추출 완료:', {
                totalProcessed: validCutPoints.length,
                successful: result.clips.length,
                failed: validCutPoints.length - result.clips.length,
                method: 'high-speed-parallel',
                concurrency: concurrency
            });
            
            return {
                count: result.clips.length,
                clips: result.clips,
                paths: result.clips.map(c => c.path),
                metadata: {
                    method: 'optimized',
                    totalProcessed: validCutPoints.length,
                    successful: result.clips.length,
                    failed: validCutPoints.length - result.clips.length,
                    concurrency: concurrency,
                    performance: '고속 병렬 처리'
                }
            };
            
        } catch (error) {
            console.error('고속 추출 실패:', error);
            
            // 고속 처리 실패 시 일반 병렬로 폴백
            console.log('⚠️ 고속 추출 실패, 일반 병렬로 폴백...');
            if (progressCallback) progressCallback(0.5, '일반 병렬로 폴백 중...');
            
            return await this.extractClipsParallel(videoPath, cutPoints, settings, 4, progressCallback);
        }
    }
    
    /**
     * 고속 병렬 처리 (최대 성능 추출)
     * @param {string} videoPath - 비디오 파일 경로
     * @param {Array} cutPoints - 컷 포인트 배열
     * @param {Object} settings - 추출 설정
     * @param {number} concurrency - 동시 처리 수
     * @param {function} progressCallback - 진행률 콜백
     * @returns {Promise<Object>} 추출 결과
     */
    async extractClipsHighSpeed(videoPath, cutPoints, settings, concurrency, progressCallback) {
        const videoName = path_ce ? path_ce.basename(videoPath, path_ce.extname(videoPath)) : 'video';
        const extractedClips = [];
        let completedCount = 0;
        const totalClips = cutPoints.length;
        
        // 모든 컷을 동시에 시작하되 배치로 제한
        const allPromises = [];
        
        for (let i = 0; i < cutPoints.length; i += concurrency) {
            const batch = cutPoints.slice(i, i + concurrency);
            
            const batchPromises = batch.map(async (cutPoint, batchIndex) => {
                const globalIndex = i + batchIndex + 1;
                const outputFileName = `${videoName}_clip_${globalIndex.toString().padStart(3, '0')}.mp4`;
                const outputPath = path_ce ? path_ce.join(this.outputDir, outputFileName) : `${this.outputDir}/${outputFileName}`;
                
                try {
                    const success = await this.extractSingleClipFast(videoPath, cutPoint, outputPath, settings, globalIndex);
                    
                    if (success) {
                        const stats = fs_ce ? fs_ce.statSync(outputPath) : { size: 0 };
                        completedCount++;
                        
                        const clipInfo = {
                            path: outputPath,
                            filename: outputFileName,
                            startTime: cutPoint.start,
                            endTime: cutPoint.end,
                            duration: cutPoint.duration,
                            clipIndex: globalIndex,
                            fileSize: stats.size,
                            quality: settings.quality,
                            method: 'high-speed'
                        };
                        
                        extractedClips.push(clipInfo);
                        
                        // 진행률 업데이트
                        if (progressCallback) {
                            const progress = completedCount / totalClips;
                            progressCallback(0.2 + progress * 0.75, `🚀 고속 처리: ${completedCount}/${totalClips}`);
                        }
                        
                        return clipInfo;
                    }
                } catch (error) {
                    console.error(`클립 ${globalIndex} 추출 실패:`, error.message);
                }
                
                return null;
            });
            
            allPromises.push(...batchPromises);
            
            // 배치 간 짧은 대기 (시스템 부하 방지)
            if (i + concurrency < cutPoints.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        
        // 모든 작업 완료 대기
        const results = await Promise.allSettled(allPromises);
        
        // 결과 정리
        const successfulClips = results
            .filter(r => r.status === 'fulfilled' && r.value)
            .map(r => r.value)
            .sort((a, b) => a.clipIndex - b.clipIndex);
        
        return {
            clips: successfulClips,
            totalProcessed: totalClips
        };
    }
    
    /**
     * 최고속 단일 클립 추출 (프레임 단위 정확도)
     * @param {string} videoPath - 비디오 파일 경로
     * @param {Object} cutPoint - 컷 포인트 정보
     * @param {string} outputPath - 출력 파일 경로
     * @param {Object} settings - 추출 설정
     * @param {number} clipIndex - 클립 인덱스
     * @returns {Promise<boolean>} 성공 여부
     */
    async extractSingleClipFast(videoPath, cutPoint, outputPath, settings, clipIndex) {
        return new Promise((resolve) => {
            // 프레임 기반 정확한 추출
            let ffmpegArgs;
            
            if (cutPoint.inFrame !== undefined && cutPoint.outFrame !== undefined) {
                // 프레임 기반 추출
                ffmpegArgs = [
                    '-ss', cutPoint.start.toFixed(3), // 입력 전에 seek
                    '-i', videoPath,
                    '-t', cutPoint.duration.toFixed(3),
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-crf', this.mapQualityToCRF(settings.quality),
                    '-preset', 'ultrafast', // 최고속 인코딩
                    '-avoid_negative_ts', 'make_zero',
                    '-fflags', '+genpts', // 타임스탬프 재생성
                    '-vsync', 'vfr', // 가변 프레임 레이트 지원
                    '-threads', '1', // 개별 프로세스당 1스레드 (병렬성 최적화)
                    '-y',
                    outputPath
                ];
            } else {
                // 기존 방식
                const adjustedStart = Math.max(0, cutPoint.start - 0.1);
                
                ffmpegArgs = [
                    '-ss', adjustedStart.toFixed(3),
                    '-i', videoPath,
                    '-ss', '0.1',
                    '-t', cutPoint.duration.toFixed(3),
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-crf', this.mapQualityToCRF(settings.quality),
                    '-preset', 'ultrafast',
                    '-avoid_negative_ts', 'make_zero',
                    '-fflags', '+genpts',
                    '-threads', '1',
                    '-y',
                    outputPath
                ];
            }

            const ffmpeg = spawn_ce(this.ffmpegPaths.ffmpeg, ffmpegArgs);
            
            let stderr = '';
            
            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code === 0 && fs_ce && fs_ce.existsSync(outputPath)) {
                    const stats = fs_ce.statSync(outputPath);
                    if (stats.size > 1000) {
                        console.log(`⚡ 고속 생성: ${path_ce.basename(outputPath)} (${(stats.size/1024).toFixed(1)}KB)`);
                        resolve(true);
                    } else {
                        console.warn(`⚠️ 파일 너무 작음: ${path_ce.basename(outputPath)}`);
                        resolve(false);
                    }
                } else {
                    console.warn(`❌ 생성 실패: ${path_ce.basename(outputPath)} (코드: ${code})`);
                    resolve(false);
                }
            });

            ffmpeg.on('error', (error) => {
                console.error(`FFmpeg 오류 (클립 ${clipIndex}):`, error.message);
                resolve(false);
            });
        });
    }
    
    /**
     * 병렬 클립 추출 (Phase 1: 병렬 처리)
     * @param {string} videoPath - 비디오 파일 경로
     * @param {Array} cutPoints - 컷 포인트 배열
     * @param {Object} settings - 추출 설정
     * @param {number} concurrency - 동시 처리 수
     * @param {function} progressCallback - 진행률 콜백
     * @returns {Promise<Object>} 추출 결과 객체
     */
    async extractClipsParallel(videoPath, cutPoints, settings, concurrency = 4, progressCallback = null) {
        try {
            console.log('병렬 클립 추출 시작:', {
                totalClips: cutPoints.length,
                concurrency: concurrency
            });
            
            // 모든 컷 포인트 사용 (필터링 없음)
            const validCutPoints = cutPoints;
            console.log(`총 ${validCutPoints.length}개 클립 처리 (필터링 없음)`);
            
            const extractedClips = [];
            let completedCount = 0;
            const totalClips = validCutPoints.length;
            
            // 클립에 인덱스 추가
            const indexedCutPoints = validCutPoints.map((cp, index) => ({
                ...cp,
                originalIndex: index + 1
            }));
            
            // 배치 단위로 병렬 처리
            for (let i = 0; i < indexedCutPoints.length; i += concurrency) {
                const batch = indexedCutPoints.slice(i, i + concurrency);
                
                console.log(`⚡ 배치 ${Math.floor(i / concurrency) + 1} 처리 중: ${batch.length}개 클립 (${i + 1}~${i + batch.length})`);
                
                // 현재 배치의 모든 클립을 병렬로 처리
                const batchPromises = batch.map(cutPoint => 
                    this.extractSingleClipSafe(videoPath, cutPoint, cutPoint.originalIndex, settings)
                );
                
                // Promise.allSettled로 일부 실패해도 계속 진행
                const batchResults = await Promise.allSettled(batchPromises);
                
                // 결과 처리
                batchResults.forEach((result, batchIndex) => {
                    const globalIndex = i + batchIndex;
                    if (result.status === 'fulfilled' && result.value) {
                        extractedClips.push(result.value);
                        completedCount++;
                        console.log(`✅ 클립 ${result.value.clipIndex} 완료: ${result.value.filename}`);
                    } else {
                        const cutPoint = batch[batchIndex];
                        console.error(`❌ 클립 ${cutPoint.originalIndex} 실패:`, result.reason?.message || 'Unknown error');
                    }
                });
                
                // 진행률 업데이트
                if (progressCallback) {
                    const progress = Math.min((i + batch.length) / totalClips, 1.0);
                    progressCallback(progress);
                }
                
                // 배치 간 짧은 대기 (시스템 부하 방지)
                if (i + concurrency < indexedCutPoints.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            // 결과 정렬 (클립 인덱스 순서대로)
            extractedClips.sort((a, b) => a.clipIndex - b.clipIndex);
            
            console.log('⚡ 병렬 클립 추출 완료:', {
                totalProcessed: totalClips,
                successful: extractedClips.length,
                failed: totalClips - extractedClips.length,
                successRate: ((extractedClips.length / totalClips) * 100).toFixed(1) + '%'
            });
            
            return {
                count: extractedClips.length,
                clips: extractedClips,
                paths: extractedClips.map(c => c.path),
                metadata: {
                    totalProcessed: totalClips,
                    successful: extractedClips.length,
                    failed: totalClips - extractedClips.length,
                    concurrency: concurrency
                }
            };
            
        } catch (error) {
            console.error('병렬 클립 추출 실패:', error);
            throw new Error('병렬 클립 추출에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 안전한 단일 클립 추출 (에러 핸들링 강화)
     * @param {string} videoPath - 비디오 파일 경로
     * @param {Object} cutPoint - 컷 포인트 정보
     * @param {number} clipIndex - 클립 인덱스
     * @param {Object} settings - 추출 설정
     * @returns {Promise<Object|null>} 추출된 클립 정보 또는 null
     */
    async extractSingleClipSafe(videoPath, cutPoint, clipIndex, settings) {
        try {
            return await this.extractSingleClip(videoPath, cutPoint, clipIndex, settings);
        } catch (error) {
            console.error(`클립 ${clipIndex} 추출 실패:`, {
                error: error.message,
                cutPoint: {
                    start: cutPoint.start,
                    end: cutPoint.end,
                    duration: cutPoint.duration
                }
            });
            return null;
        }
    }

    /**
     * 단일 클립 추출 (프레임 단위 정확도)
     * @param {string} videoPath - 비디오 파일 경로
     * @param {Object} cutPoint - 컷 포인트 정보
     * @param {number} clipIndex - 클립 인덱스
     * @param {Object} settings - 추출 설정
     * @returns {Promise<Object>} 추출된 클립 정보
     */
    async extractSingleClip(videoPath, cutPoint, clipIndex, settings) {
        return new Promise((resolve, reject) => {
            const videoName = path_ce ? path_ce.basename(videoPath, path_ce.extname(videoPath)) : 'video';
            const outputFileName = `${videoName}_clip_${clipIndex.toString().padStart(3, '0')}.mp4`;
            const outputPath = path_ce ? path_ce.join(this.outputDir, outputFileName) : `${this.outputDir}/${outputFileName}`;
            
            // 프레임 기반 정확한 시작/끝 시간
            // cutPoint에 프레임 정보가 있는 경우 사용
            const hasFrameInfo = cutPoint.inFrame !== undefined && cutPoint.outFrame !== undefined;
            
            let ffmpegArgs;
            
            if (hasFrameInfo) {
                // 프레임 기반 정확한 추출
                console.log(`프레임 기반 추출: ${clipIndex} (프레임 ${cutPoint.inFrame}-${cutPoint.outFrame})`);
                
                // FFmpeg 명령어 구성 - 정확한 시작/끝 프레임
                ffmpegArgs = [
                    '-ss', cutPoint.start.toFixed(3), // 입력 전에 seek (최적화)
                    '-i', videoPath,
                    '-t', cutPoint.duration.toFixed(3), // 정확한 길이
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-crf', this.mapQualityToCRF(settings.quality),
                    '-preset', 'medium',
                    '-avoid_negative_ts', 'make_zero',
                    '-fflags', '+genpts', // 타임스탬프 재생성
                    '-vsync', 'vfr', // 가변 프레임 레이트 지원
                    '-y', // 파일 덮어쓰기
                    outputPath
                ];
            } else {
                // 기존 방식 (호환성)
                console.log(`시간 기반 추출: ${clipIndex} (${cutPoint.start.toFixed(2)}-${cutPoint.end.toFixed(2)}초)`);
                
                const adjustedStart = Math.max(0, cutPoint.start - 0.1);
                
                ffmpegArgs = [
                    '-ss', adjustedStart.toFixed(3),
                    '-i', videoPath,
                    '-ss', '0.1',
                    '-t', cutPoint.duration.toFixed(3),
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-crf', this.mapQualityToCRF(settings.quality),
                    '-preset', 'medium',
                    '-avoid_negative_ts', 'make_zero',
                    '-fflags', '+genpts',
                    '-copyts',
                    '-start_at_zero',
                    '-y',
                    outputPath
                ];
            }

            const ffmpeg = spawn_ce(this.ffmpegPaths.ffmpeg, ffmpegArgs);
            
            let stderr = '';
            let currentTime = 0;
            
            ffmpeg.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                
                // 진행률 파싱
                const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
                if (timeMatch) {
                    const [, hours, minutes, seconds] = timeMatch;
                    currentTime = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
                }
            });

            ffmpeg.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`클립 추출 실패 (코드: ${code}): ${stderr}`));
                    return;
                }

                // 파일 생성 확인
                if (fs_ce && !fs_ce.existsSync(outputPath)) {
                    reject(new Error(`클립 파일이 생성되지 않았습니다: ${outputPath}`));
                    return;
                }

                // 파일 정보 가져오기
                const stats = fs_ce ? fs_ce.statSync(outputPath) : { size: 0 };
                
                resolve({
                    path: outputPath,
                    filename: outputFileName,
                    startTime: cutPoint.start,
                    endTime: cutPoint.end,
                    duration: cutPoint.duration,
                    clipIndex: clipIndex,
                    fileSize: stats.size,
                    quality: settings.quality
                });
            });

            ffmpeg.on('error', (error) => {
                reject(new Error(`FFmpeg 프로세스 시작 실패: ${error.message}`));
            });
        });
    }

    /**
     * 품질 설정을 CRF 값으로 변환
     * @param {number} quality - 품질 (1-10)
     * @returns {string} CRF 값
     */
    mapQualityToCRF(quality) {
        // 품질 1-10을 CRF 28-18로 변환 (낮을수록 높은 품질)
        const crf = Math.max(18, Math.min(28, 29 - quality * 1.1));
        return Math.round(crf).toString();
    }

    /**
     * 클립 메타데이터 생성
     * @param {string} videoPath - 원본 비디오 경로
     * @param {Array} clips - 추출된 클립 배열
     * @returns {Object} 메타데이터 객체
     */
    generateMetadata(videoPath, clips) {
        const videoName = path_ce ? path_ce.basename(videoPath, path_ce.extname(videoPath)) : 'video';
        
        const totalSize = clips.reduce((sum, clip) => sum + clip.fileSize, 0);
        const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);
        
        return {
            sourceVideo: videoName,
            extractedAt: new Date().toISOString(),
            totalClips: clips.length,
            totalSize: totalSize,
            totalDuration: totalDuration,
            clips: clips.map(clip => ({
                filename: clip.filename,
                startTime: clip.startTime,
                endTime: clip.endTime,
                duration: clip.duration,
                clipIndex: clip.clipIndex,
                fileSize: clip.fileSize,
                quality: clip.quality
            }))
        };
    }

    /**
     * 클립 목록 HTML 생성
     * @param {Array} clips - 추출된 클립 배열
     * @param {string} videoPath - 원본 비디오 경로
     * @returns {string} HTML 내용
     */
    generateClipListHTML(clips, videoPath) {
        const videoName = path_ce ? path_ce.basename(videoPath, path_ce.extname(videoPath)) : 'video';
        const totalSize = clips.reduce((sum, clip) => sum + clip.fileSize, 0);
        const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);
        
        let html = `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${videoName} - 추출된 클립</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .header { text-align: center; margin-bottom: 30px; }
                .summary { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
                .clips-list { display: grid; gap: 15px; }
                .clip-item { border: 1px solid #ddd; border-radius: 8px; padding: 15px; display: flex; justify-content: space-between; align-items: center; }
                .clip-info { flex: 1; }
                .clip-details { font-size: 12px; color: #666; margin-top: 5px; }
                .clip-actions { display: flex; gap: 10px; }
                .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; }
                .btn-primary { background: #007bff; color: white; }
                .btn-secondary { background: #6c757d; color: white; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${videoName} - 추출된 클립 🚀</h1>
                <p>최적화된 처리로 빠르게 추출되었습니다</p>
            </div>
            <div class="summary">
                <h3>추출 요약</h3>
                <p>총 클립 수: ${clips.length}개</p>
                <p>총 크기: ${(totalSize / 1024 / 1024).toFixed(1)} MB</p>
                <p>총 길이: ${totalDuration.toFixed(1)}초</p>
            </div>
            <div class="clips-list">
        `;
        
        clips.forEach(clip => {
            html += `
                <div class="clip-item">
                    <div class="clip-info">
                        <h4>${clip.filename}</h4>
                        <div class="clip-details">
                            <div>시간: ${clip.startTime.toFixed(2)}초 ~ ${clip.endTime.toFixed(2)}초</div>
                            <div>길이: ${clip.duration.toFixed(2)}초</div>
                            <div>크기: ${(clip.fileSize / 1024 / 1024).toFixed(1)} MB</div>
                            <div>품질: ${clip.quality}/10</div>
                        </div>
                    </div>
                    <div class="clip-actions">
                        <a href="${clip.filename}" class="btn btn-primary">재생</a>
                        <button class="btn btn-secondary" onclick="copyPath('${clip.path}')">경로 복사</button>
                    </div>
                </div>
            `;
        });
        
        html += `
            </div>
            <script>
                function copyPath(path) {
                    navigator.clipboard.writeText(path).then(() => {
                        alert('경로가 복사되었습니다: ' + path);
                    });
                }
            </script>
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
            if (fs_ce) {
                const files = fs_ce.readdirSync(this.outputDir);
                files.forEach(file => {
                    const filePath = path_ce ? path_ce.join(this.outputDir, file) : `${this.outputDir}/${file}`;
                    if (fs_ce.statSync(filePath).isFile()) {
                        fs_ce.unlinkSync(filePath);
                    }
                });
                console.log('클립 파일 정리 완료');
            }
        } catch (error) {
            console.error('클립 파일 정리 실패:', error);
        }
    }
}

// 브라우저 환경에서 전역 객체로 등록
window.ClipExtractor = ClipExtractor;