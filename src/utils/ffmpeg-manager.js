/**
 * FFmpeg Manager Module
 * FFmpeg 경로 관리 및 의존성 확인
 */
class FFmpegManager {
    constructor() {
        this.ffmpegPaths = null;
        this.isInitialized = false;
        
        // 기본 FFmpeg 경로들 (시스템별)
        this.defaultPaths = {
            darwin: {
                ffmpeg: '/opt/homebrew/bin/ffmpeg',
                ffprobe: '/opt/homebrew/bin/ffprobe',
                // 폴백 경로들
                fallbackPaths: [
                    '/usr/local/bin/ffmpeg',
                    '/usr/bin/ffmpeg',
                    'ffmpeg'
                ]
            },
            win32: {
                ffmpeg: 'ffmpeg.exe',
                ffprobe: 'ffprobe.exe'
            },
            linux: {
                ffmpeg: '/usr/bin/ffmpeg',
                ffprobe: '/usr/bin/ffprobe'
            }
        };
        
        console.log('🎬 FFmpegManager 초기화 완료');
    }
    
    /**
     * FFmpeg 초기화 (Eagle API 방식)
     */
    async initialize() {
        try {
            console.log('🔍 Eagle FFmpeg 플러그인 확인 시작...');
            
            // 1. Eagle FFmpeg 플러그인 사용 시도
            if (typeof eagle !== 'undefined' && eagle.extraModule && eagle.extraModule.ffmpeg) {
                return await this.initializeWithEagleAPI();
            }
            
            // 2. eagleUtils 폴백
            if (window.eagleUtils && typeof window.eagleUtils.getFFmpegPaths === 'function') {
                this.ffmpegPaths = await window.eagleUtils.getFFmpegPaths();
                console.log('✅ EagleUtils에서 FFmpeg 경로 가져옴:', this.ffmpegPaths);
            } else {
                // 3. 시스템 기본 경로 폴백
                this.ffmpegPaths = this.getSystemDefaultPaths();
                console.log('⚠️ 시스템 기본 FFmpeg 경로 사용:', this.ffmpegPaths);
            }
            
            // FFmpeg 가용성 확인
            const isAvailable = await this.checkFFmpegAvailability();
            
            if (isAvailable) {
                this.isInitialized = true;
                console.log('✅ FFmpeg 초기화 완료');
                return true;
            } else {
                console.warn('⚠️ FFmpeg를 사용할 수 없습니다');
                return false;
            }
            
        } catch (error) {
            console.error('❌ FFmpeg 초기화 실패:', error);
            
            // 폴백: 기본 경로 사용
            this.ffmpegPaths = this.getSystemDefaultPaths();
            this.isInitialized = true;
            return true;
        }
    }
    
    /**
     * Eagle API를 통한 FFmpeg 초기화
     */
    async initializeWithEagleAPI() {
        try {
            console.log('🦅 Eagle FFmpeg API 사용 중...');
            
            // FFmpeg 설치 상태 확인
            const isInstalled = await eagle.extraModule.ffmpeg.isInstalled();
            console.log(`📦 FFmpeg 설치 상태: ${isInstalled ? '설치됨' : '미설치'}`);
            
            if (!isInstalled) {
                console.log('📥 FFmpeg 자동 설치 시도...');
                await eagle.extraModule.ffmpeg.install();
                
                // 설치 완료 대기
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // 재확인
                const recheck = await eagle.extraModule.ffmpeg.isInstalled();
                if (!recheck) {
                    throw new Error('FFmpeg 자동 설치에 실패했습니다');
                }
                console.log('✅ FFmpeg 자동 설치 완료');
            }
            
            // FFmpeg 경로 가져오기
            this.ffmpegPaths = await eagle.extraModule.ffmpeg.getPaths();
            console.log('✅ Eagle API에서 FFmpeg 경로 가져옴:', this.ffmpegPaths);
            
            // Eagle API 방식에서는 별도 가용성 확인 불필요
            this.isInitialized = true;
            console.log('✅ Eagle FFmpeg API 초기화 완료');
            return true;
            
        } catch (error) {
            console.error('❌ Eagle FFmpeg API 초기화 실패:', error);
            throw error; // 상위에서 폴백 처리
        }
    }
    
    /**
     * 시스템 기본 FFmpeg 경로 가져오기
     */
    getSystemDefaultPaths() {
        const platform = this.getPlatform();
        const defaultForPlatform = this.defaultPaths[platform] || this.defaultPaths.linux;
        
        console.log(`🖥️ 감지된 플랫폼: ${platform}`);
        return { ...defaultForPlatform };
    }
    
    /**
     * 현재 플랫폼 감지
     */
    getPlatform() {
        if (typeof navigator !== 'undefined') {
            const userAgent = navigator.userAgent.toLowerCase();
            if (userAgent.includes('mac')) return 'darwin';
            if (userAgent.includes('win')) return 'win32';
            return 'linux';
        }
        
        // Node.js 환경에서는 process.platform 사용
        if (typeof process !== 'undefined' && process.platform) {
            return process.platform;
        }
        
        return 'linux'; // 기본값
    }
    
    /**
     * FFmpeg 가용성 확인
     */
    async checkFFmpegAvailability() {
        if (!this.ffmpegPaths) {
            return false;
        }
        
        try {
            // EagleUtils를 통한 FFmpeg 테스트
            if (window.eagleUtils && typeof window.eagleUtils.testFFmpeg === 'function') {
                const result = await window.eagleUtils.testFFmpeg(this.ffmpegPaths);
                console.log('🧪 EagleUtils FFmpeg 테스트 결과:', result);
                return result;
            }
            
            // 직접 테스트 (가능한 경우)
            if (window.require) {
                return await this.directFFmpegTest();
            }
            
            // 테스트할 수 없는 경우 true 반환 (낙관적)
            console.log('⚠️ FFmpeg 테스트를 수행할 수 없음, 가용한 것으로 가정');
            return true;
            
        } catch (error) {
            console.error('FFmpeg 가용성 확인 실패:', error);
            return false;
        }
    }
    
    /**
     * 직접 FFmpeg 테스트
     */
    async directFFmpegTest() {
        try {
            const { spawn } = window.require('child_process');
            
            return new Promise((resolve) => {
                const ffmpeg = spawn(this.ffmpegPaths.ffmpeg, ['-version'], {
                    stdio: ['ignore', 'pipe', 'pipe']
                });
                
                let output = '';
                ffmpeg.stdout.on('data', (data) => {
                    output += data.toString();
                });
                
                ffmpeg.on('close', (code) => {
                    const isAvailable = code === 0 && output.includes('ffmpeg version');
                    console.log(`🧪 FFmpeg 직접 테스트: ${isAvailable ? '성공' : '실패'} (코드: ${code})`);
                    resolve(isAvailable);
                });
                
                ffmpeg.on('error', (error) => {
                    console.error('FFmpeg 실행 오류:', error);
                    resolve(false);
                });
                
                // 5초 타임아웃
                setTimeout(() => {
                    ffmpeg.kill();
                    resolve(false);
                }, 5000);
            });
            
        } catch (error) {
            console.error('직접 FFmpeg 테스트 실패:', error);
            return false;
        }
    }
    
    /**
     * FFmpeg 경로 가져오기
     */
    getFFmpegPaths() {
        if (!this.isInitialized) {
            console.warn('⚠️ FFmpegManager가 초기화되지 않았습니다');
            return this.getSystemDefaultPaths();
        }
        
        return { ...this.ffmpegPaths };
    }
    
    /**
     * FFmpeg 경로 설정
     */
    setFFmpegPaths(paths) {
        this.ffmpegPaths = { ...this.ffmpegPaths, ...paths };
        console.log('⚙️ FFmpeg 경로 업데이트:', this.ffmpegPaths);
    }
    
    /**
     * FFmpeg 의존성 확인
     */
    async checkDependency() {
        if (!this.isInitialized) {
            const initResult = await this.initialize();
            if (!initResult) {
                return {
                    isAvailable: false,
                    message: 'FFmpeg 초기화에 실패했습니다',
                    paths: null
                };
            }
        }
        
        const isAvailable = await this.checkFFmpegAvailability();
        
        return {
            isAvailable,
            message: isAvailable ? 'FFmpeg 사용 가능' : 'FFmpeg를 사용할 수 없습니다',
            paths: this.ffmpegPaths
        };
    }
    
    /**
     * FFmpeg 버전 정보 가져오기
     */
    async getVersionInfo() {
        if (!this.ffmpegPaths) {
            return null;
        }
        
        try {
            if (window.eagleUtils && typeof window.eagleUtils.getFFmpegVersion === 'function') {
                return await window.eagleUtils.getFFmpegVersion(this.ffmpegPaths);
            }
            
            // 직접 버전 확인
            if (window.require) {
                return await this.getVersionInfoDirect();
            }
            
            return null;
            
        } catch (error) {
            console.error('FFmpeg 버전 정보 가져오기 실패:', error);
            return null;
        }
    }
    
    /**
     * 직접 FFmpeg 버전 확인
     */
    async getVersionInfoDirect() {
        try {
            const { spawn } = window.require('child_process');
            
            return new Promise((resolve) => {
                const ffmpeg = spawn(this.ffmpegPaths.ffmpeg, ['-version'], {
                    stdio: ['ignore', 'pipe', 'pipe']
                });
                
                let output = '';
                ffmpeg.stdout.on('data', (data) => {
                    output += data.toString();
                });
                
                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
                        const version = versionMatch ? versionMatch[1] : 'unknown';
                        resolve({ version, fullOutput: output });
                    } else {
                        resolve(null);
                    }
                });
                
                ffmpeg.on('error', () => {
                    resolve(null);
                });
                
                setTimeout(() => {
                    ffmpeg.kill();
                    resolve(null);
                }, 3000);
            });
            
        } catch (error) {
            console.error('직접 FFmpeg 버전 확인 실패:', error);
            return null;
        }
    }
    
    /**
     * 현재 상태 조회
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            ffmpegPaths: this.ffmpegPaths,
            platform: this.getPlatform()
        };
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FFmpegManager;
} else {
    // 전역 스코프에 등록
    if (typeof window !== 'undefined') {
        window.FFmpegManager = FFmpegManager;
    }
    if (typeof global !== 'undefined') {
        global.FFmpegManager = FFmpegManager;
    }
}

// 로드 확인 로그
console.log('✅ FFmpegManager 모듈 로드됨');
console.log('window.FFmpegManager 등록됨:', typeof window.FFmpegManager);

// 등록 재시도
setTimeout(() => {
    if (typeof window.FFmpegManager === 'undefined') {
        console.log('🔄 FFmpegManager 재등록 시도...');
        window.FFmpegManager = FFmpegManager;
        console.log('재등록 결과:', typeof window.FFmpegManager);
    }
}, 100);