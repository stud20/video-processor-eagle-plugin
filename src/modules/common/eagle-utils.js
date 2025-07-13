/**
 * EagleUtils - Eagle API 공통 유틸리티 모듈
 * Eagle 플러그인에서 공통으로 사용되는 기능들을 제공합니다.
 */

class EagleUtils {
    constructor() {
        this.eagle = typeof eagle !== 'undefined' ? eagle : null;
        this.isEagleAvailable = this.checkEagleAPI();
    }

    /**
     * Eagle API 사용 가능성 확인
     * @returns {boolean} Eagle API 사용 가능 여부
     */
    checkEagleAPI() {
        if (!this.eagle) {
            console.warn('Eagle API를 사용할 수 없습니다. 개발 환경에서 실행 중일 수 있습니다.');
            return false;
        }
        console.log('Eagle API 사용 가능');
        return true;
    }

    /**
     * 로컬 캐시 디렉토리 생성 (고정 경로 사용)
     * @param {string} type - 캐시 타입 ('clips' 또는 'frames')
     * @returns {Promise<string>} 캐시 디렉토리 경로
     */
    async getCacheDirectory(type = 'clips') {
        try {
            let cachePath;
            
            if (type === 'frames') {
                cachePath = '/Users/ysk/assets/temp/frame';
            } else {
                cachePath = '/Users/ysk/assets/temp/clips';
            }
            
            // 디렉토리 생성
            await this.ensureDirectory(cachePath);
            console.log('로컬 캐시 디렉토리:', cachePath);
            return cachePath;
        } catch (error) {
            console.error('캐시 디렉토리 생성 실패:', error);
            // 최종 폴백 - 임시 디렉토리
            const tempPath = this.joinPath(require('os').tmpdir(), 'video-processor-cache', type);
            await this.ensureDirectory(tempPath);
            return tempPath;
        }
    }

    /**
     * 모든 캐시 디렉토리 경로 가져오기
     * @returns {Array<string>} 캐시 디렉토리 경로 배열
     */
    getAllCacheDirectories() {
        return [
            '/Users/ysk/assets/temp/clips',
            '/Users/ysk/assets/temp/frame'
        ];
    }

    /**
     * 모든 캐시 파일 삭제
     * @returns {Promise<Object>} 삭제 결과
     */
    async clearAllCache() {
        const results = {
            success: true,
            deletedFiles: 0,
            errors: []
        };

        const cacheDirectories = this.getAllCacheDirectories();
        const fs = this.getFS();
        
        if (!fs) {
            results.success = false;
            results.errors.push('파일 시스템 모듈을 사용할 수 없습니다.');
            return results;
        }

        for (const dirPath of cacheDirectories) {
            try {
                if (fs.existsSync(dirPath)) {
                    const files = fs.readdirSync(dirPath);
                    
                    for (const file of files) {
                        const filePath = this.joinPath(dirPath, file);
                        const stats = fs.statSync(filePath);
                        
                        if (stats.isFile()) {
                            fs.unlinkSync(filePath);
                            results.deletedFiles++;
                            console.log('삭제된 캐시 파일:', filePath);
                        }
                    }
                }
            } catch (error) {
                console.error(`캐시 디렉토리 정리 실패: ${dirPath}`, error);
                results.errors.push(`${dirPath}: ${error.message}`);
                results.success = false;
            }
        }

        console.log(`캐시 정리 완료: ${results.deletedFiles}개 파일 삭제`);
        return results;
    }

    /**
     * 디렉토리 생성 확인 (Node.js fs 사용)
     * @param {string} dirPath - 생성할 디렉토리 경로
     */
    async ensureDirectory(dirPath) {
        const fs = this.getNodeModule('fs');
        if (fs && !fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    /**
     * 플랫폼에 맞는 경로 조인
     * @param {...string} paths - 조인할 경로들
     * @returns {string} 조인된 경로
     */
    joinPath(...paths) {
        const path = this.getNodeModule('path');
        return path ? path.join(...paths) : paths.join('/');
    }

    /**
     * 파일명에서 확장자를 제거한 기본 이름 추출
     * @param {string} filePath - 파일 경로
     * @returns {string} 기본 파일명
     */
    getBaseName(filePath) {
        const path = this.getNodeModule('path');
        return path ? path.basename(filePath, path.extname(filePath)) : 
               filePath.split('/').pop().split('.').slice(0, -1).join('.');
    }

    /**
     * Node.js 모듈 안전하게 가져오기
     * @param {string} moduleName - 모듈명
     * @returns {object|null} 모듈 객체 또는 null
     */
    getNodeModule(moduleName) {
        try {
            return window.require ? window.require(moduleName) : null;
        } catch (error) {
            console.warn(`Node.js 모듈 로드 실패: ${moduleName}`, error);
            return null;
        }
    }

    /**
     * 안전한 spawn 실행
     * @param {string} command - 실행할 명령어
     * @param {Array} args - 인수 배열
     * @param {Object} options - 옵션
     * @returns {ChildProcess|null} 자식 프로세스 또는 null
     */
    spawn(command, args = [], options = {}) {
        const { spawn } = this.getNodeModule('child_process') || { spawn: null };
        if (!spawn) {
            throw new Error('child_process 모듈을 사용할 수 없습니다.');
        }
        return spawn(command, args, options);
    }

    /**
     * Eagle에 파일 추가 (여러 형식 지원)
     * @param {string} filePath - 추가할 파일 경로
     * @param {Object} options - Eagle 임포트 옵션
     * @returns {Promise<string|null>} 추가된 아이템 ID 또는 null
     */
    async addFileToEagle(filePath, options = {}) {
        if (!this.isEagleAvailable) {
            console.log('Eagle API 미사용으로 파일 임포트 시뮬레이션:', filePath);
            return null;
        }

        try {
            const defaultOptions = {
                name: this.getBaseName(filePath),
                tags: [],
                folders: [],
                annotation: 'Video Processor에서 추출된 파일',
                ...options
            };

            const itemId = await this.eagle.item.addFromPath(filePath, defaultOptions);
            console.log('Eagle에 파일 추가 완료:', filePath, '-> ID:', itemId);
            return itemId;
        } catch (error) {
            console.error('Eagle 파일 추가 실패:', filePath, error);
            throw new Error(`Eagle 파일 추가 실패: ${error.message}`);
        }
    }

    /**
     * Eagle에서 현재 선택된 비디오 파일들 가져오기
     * @returns {Promise<Array>} 선택된 비디오 파일 배열
     */
    async getSelectedVideoFiles() {
        if (!this.isEagleAvailable) {
            console.log('Eagle API 미사용으로 빈 배열 반환');
            return [];
        }

        try {
            const selectedItems = await this.eagle.item.getSelected();
            const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'm4v'];
            
            // 비디오 파일만 필터링하고 실제 파일 경로 추가
            const videoFiles = selectedItems.filter(item => 
                videoExtensions.includes(item.ext.toLowerCase())
            );
            
            // 각 아이템에 실제 파일 경로 추가
            for (const item of videoFiles) {
                // Eagle 아이템의 실제 파일 경로 가져오기
                // filePath 또는 path 속성을 확인
                if (!item.filePath && !item.path) {
                    // 아이템 ID로 상세 정보 가져오기
                    try {
                        const detailedItem = await this.eagle.item.getById(item.id);
                        if (detailedItem && detailedItem.filePath) {
                            item.filePath = detailedItem.filePath;
                            item.path = detailedItem.filePath;
                        }
                    } catch (err) {
                        console.warn(`아이템 ${item.name}의 상세 정보를 가져올 수 없습니다:`, err);
                    }
                }
            }
            
            return videoFiles;
        } catch (error) {
            console.error('선택된 비디오 파일 가져오기 실패:', error);
            return [];
        }
    }

    /**
     * 파일이 비디오 파일인지 확인
     * @param {string} extension - 파일 확장자
     * @returns {boolean} 비디오 파일 여부
     */
    isVideoFile(extension) {
        const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'm4v'];
        return videoExtensions.includes(extension.toLowerCase().replace('.', ''));
    }

    /**
     * 진행률 정보를 포맷팅
     * @param {number} current - 현재 진행량
     * @param {number} total - 전체 작업량
     * @param {string} operation - 작업명
     * @returns {string} 포맷된 진행률 문자열
     */
    formatProgress(current, total, operation = '작업') {
        const percentage = ((current / total) * 100).toFixed(1);
        return `${operation} 진행: ${current}/${total} (${percentage}%)`;
    }

    /**
     * 파일 크기를 읽기 쉬운 형태로 변환
     * @param {number} bytes - 바이트 크기
     * @returns {string} 포맷된 파일 크기
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 에러를 사용자 친화적 메시지로 변환
     * @param {Error} error - 에러 객체
     * @returns {string} 사용자 친화적 에러 메시지
     */
    formatError(error) {
        if (error.message.includes('ENOENT')) {
            return '파일을 찾을 수 없습니다.';
        } else if (error.message.includes('EACCES')) {
            return '파일 접근 권한이 없습니다.';
        } else if (error.message.includes('FFmpeg')) {
            return 'FFmpeg 실행 중 오류가 발생했습니다.';
        }
        return error.message || '알 수 없는 오류가 발생했습니다.';
    }

    /**
     * 안전한 파일 시스템 접근
     * @returns {object|null} fs 모듈 또는 null
     */
    getFS() {
        return this.getNodeModule('fs');
    }

    /**
     * 안전한 경로 모듈 접근
     * @returns {object|null} path 모듈 또는 null
     */
    getPath() {
        return this.getNodeModule('path');
    }

    /**
     * 안전한 파일 존재 확인
     * @param {string} filePath - 확인할 파일 경로
     * @returns {boolean} 파일 존재 여부
     */
    fileExists(filePath) {
        const fs = this.getFS();
        return fs ? fs.existsSync(filePath) : false;
    }

    /**
     * 안전한 파일 통계 정보 가져오기
     * @param {string} filePath - 파일 경로
     * @returns {object|null} 파일 통계 정보 또는 null
     */
    getFileStats(filePath) {
        const fs = this.getFS();
        try {
            return fs ? fs.statSync(filePath) : null;
        } catch (error) {
            console.warn(`파일 통계 정보 가져오기 실패: ${filePath}`, error);
            return null;
        }
    }
}

// 싱글톤 인스턴스 생성 및 전역 등록
const eagleUtils = new EagleUtils();
window.EagleUtils = EagleUtils;
window.eagleUtils = eagleUtils;

// 모듈 내보내기 (CommonJS 스타일도 지원)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EagleUtils, eagleUtils };
}
