/**
 * Eagle 썸네일 헬퍼 - Eagle API를 활용한 썸네일 처리
 */

class EagleThumbnailHelper {
    constructor() {
        this.thumbnailCache = new Map();
    }

    /**
     * Eagle의 임시 디렉토리에 이미지 복사하고 URL 반환
     */
    async getEagleImageUrl(framePath) {
        try {
            if (!framePath || typeof eagle === 'undefined') {
                return null;
            }

            // 캐시 확인
            if (this.thumbnailCache.has(framePath)) {
                return this.thumbnailCache.get(framePath);
            }

            const fs = window.require('fs');
            const path = window.require('path');
            
            // Eagle 플러그인 디렉토리 가져오기
            const pluginPath = await eagle.plugin.getPath();
            const tempDir = path.join(pluginPath, 'temp', 'thumbnails');
            
            // 임시 디렉토리 생성
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            // 파일명 생성
            const fileName = path.basename(framePath);
            const tempFilePath = path.join(tempDir, fileName);
            
            // 파일 복사
            if (fs.existsSync(framePath)) {
                fs.copyFileSync(framePath, tempFilePath);
                
                // 상대 경로로 URL 생성
                const relativeUrl = `temp/thumbnails/${fileName}`;
                
                // 캐시에 저장
                this.thumbnailCache.set(framePath, relativeUrl);
                
                console.log('✅ Eagle 썸네일 URL 생성:', relativeUrl);
                return relativeUrl;
            }
            
            return null;
        } catch (error) {
            console.error('Eagle 썸네일 URL 생성 실패:', error);
            return null;
        }
    }

    /**
     * 모든 썸네일을 Eagle 임시 디렉토리로 복사
     */
    async processAllThumbnails(groups) {
        console.log('🦅 Eagle 썸네일 처리 시작');
        
        let processedCount = 0;
        
        for (const group of groups) {
            // 대표 프레임 처리
            if (group.representative && group.representative.framePath) {
                const url = await this.getEagleImageUrl(group.representative.framePath);
                if (url) {
                    group.representative.eagleUrl = url;
                    processedCount++;
                }
            }
            
            // 모든 멤버 프레임 처리
            for (const member of group.members) {
                if (member.framePath) {
                    const url = await this.getEagleImageUrl(member.framePath);
                    if (url) {
                        member.eagleUrl = url;
                        processedCount++;
                    }
                }
            }
        }
        
        console.log(`🦅 Eagle 썸네일 처리 완료: ${processedCount}개`);
        return processedCount;
    }

    /**
     * 캐시 정리
     */
    clearCache() {
        this.thumbnailCache.clear();
        
        try {
            const fs = window.require('fs');
            const path = window.require('path');
            
            eagle.plugin.getPath().then(pluginPath => {
                const tempDir = path.join(pluginPath, 'temp', 'thumbnails');
                
                if (fs.existsSync(tempDir)) {
                    const files = fs.readdirSync(tempDir);
                    files.forEach(file => {
                        fs.unlinkSync(path.join(tempDir, file));
                    });
                    console.log('🧹 Eagle 썸네일 캐시 정리 완료');
                }
            });
        } catch (error) {
            console.error('캐시 정리 실패:', error);
        }
    }
}

// 전역 인스턴스 생성
window.eagleThumbnailHelper = new EagleThumbnailHelper();

// 디버깅용 함수
window.testEagleThumbnails = async function() {
    console.log('=== Eagle 썸네일 테스트 시작 ===');
    
    if (!window.VideoProcessor || !window.VideoProcessor.smartGroups) {
        console.error('스마트 그룹 데이터가 없습니다');
        return;
    }
    
    const groups = window.VideoProcessor.smartGroups;
    const helper = window.eagleThumbnailHelper;
    
    // Eagle 임시 디렉토리로 썸네일 복사
    const count = await helper.processAllThumbnails(groups);
    console.log(`처리된 썸네일: ${count}개`);
    
    // UI 업데이트
    if (window.displayGroupGrid) {
        window.displayGroupGrid(groups);
    }
    
    console.log('=== 테스트 완료 ===');
};

console.log('Eagle 썸네일 헬퍼 로드됨. testEagleThumbnails() 함수로 테스트하세요.');
