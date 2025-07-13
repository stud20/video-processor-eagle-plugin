/**
 * 디버깅 헬퍼 - Eagle 콘솔에서 실행할 수 있는 함수들
 */

// 현재 스마트 그룹 상태 확인
function debugSmartGroups() {
    if (!window.VideoProcessor || !window.VideoProcessor.smartGroups) {
        console.error('스마트 그룹 데이터가 없습니다');
        return;
    }
    
    const groups = window.VideoProcessor.smartGroups;
    console.log('=== 스마트 그룹 디버깅 ===');
    console.log(`총 그룹 수: ${groups.length}`);
    
    groups.forEach((group, index) => {
        console.log(`\n그룹 #${group.id}:`);
        console.log(`- 멤버 수: ${group.members.length}`);
        console.log(`- 유사도: ${(group.avgSimilarity * 100).toFixed(1)}%`);
        
        group.members.forEach((member, mIdx) => {
            console.log(`  멤버 ${mIdx}:`);
            console.log(`  - 컷 인덱스: ${member.cutIndex}`);
            console.log(`  - 썸네일 있음: ${member.thumbnail ? 'YES' : 'NO'}`);
            console.log(`  - 프레임 경로: ${member.framePath}`);
            if (member.thumbnail) {
                console.log(`  - 썸네일 크기: ${member.thumbnail.length} bytes`);
            }
        });
    });
}

// 수동으로 썸네일 로드 시도
async function manualLoadThumbnails() {
    console.log('=== 수동 썸네일 로드 시작 ===');
    
    if (!window.VideoProcessor || !window.VideoProcessor.smartGroups) {
        console.error('스마트 그룹 데이터가 없습니다');
        return;
    }
    
    const fs = window.require ? window.require('fs') : null;
    if (!fs) {
        console.error('파일 시스템 접근 불가');
        return;
    }
    
    const groups = window.VideoProcessor.smartGroups;
    let loadedCount = 0;
    let failedCount = 0;
    
    for (const group of groups) {
        for (const member of group.members) {
            if (!member.thumbnail && member.framePath) {
                try {
                    if (fs.existsSync(member.framePath)) {
                        const buffer = fs.readFileSync(member.framePath);
                        member.thumbnail = `data:image/jpeg;base64,${buffer.toString('base64')}`;
                        loadedCount++;
                        console.log(`✅ 로드 성공: ${member.framePath}`);
                    } else {
                        failedCount++;
                        console.error(`❌ 파일 없음: ${member.framePath}`);
                    }
                } catch (error) {
                    failedCount++;
                    console.error(`❌ 로드 실패: ${member.framePath}`, error);
                }
            }
        }
    }
    
    console.log(`=== 로드 완료: 성공 ${loadedCount}, 실패 ${failedCount} ===`);
    
    // UI 갱신
    if (window.displayGroupGrid && loadedCount > 0) {
        console.log('UI 갱신 중...');
        window.displayGroupGrid(groups);
    }
}

// Eagle 캐시 디렉토리 사용 시도
async function useEagleCacheDirectory() {
    console.log('=== Eagle 캐시 디렉토리 사용 시도 ===');
    
    if (typeof eagle === 'undefined') {
        console.error('Eagle API를 사용할 수 없습니다');
        return;
    }
    
    try {
        // Eagle 라이브러리 경로 가져오기
        const libraryPath = eagle.library.path;
        console.log('Eagle 라이브러리 경로:', libraryPath);
        
        // Eagle 플러그인 캐시 경로
        const pluginId = 'video-processor-eagle-plugin';
        const cachePath = `${libraryPath}/plugins/${pluginId}/cache`;
        console.log('플러그인 캐시 경로:', cachePath);
        
        // 캐시 디렉토리 생성
        const fs = window.require('fs');
        const path = window.require('path');
        
        if (!fs.existsSync(cachePath)) {
            fs.mkdirSync(cachePath, { recursive: true });
            console.log('캐시 디렉토리 생성됨');
        }
        
        // 이미지를 Eagle 캐시로 복사
        if (window.VideoProcessor && window.VideoProcessor.smartGroups) {
            const groups = window.VideoProcessor.smartGroups;
            
            for (const group of groups) {
                for (const member of group.members) {
                    if (member.framePath && fs.existsSync(member.framePath)) {
                        const fileName = path.basename(member.framePath);
                        const newPath = path.join(cachePath, fileName);
                        
                        // 파일 복사
                        fs.copyFileSync(member.framePath, newPath);
                        console.log(`📁 복사됨: ${fileName}`);
                        
                        // Eagle 상대 경로로 변경
                        member.eagleCachePath = `plugins/${pluginId}/cache/${fileName}`;
                    }
                }
            }
            
            // UI 갱신
            window.displayGroupGrid(groups);
        }
        
    } catch (error) {
        console.error('Eagle 캐시 사용 실패:', error);
    }
}

// 모든 디버깅 함수 실행
async function debugAll() {
    console.clear();
    console.log('🔍 전체 디버깅 시작...\n');
    
    debugSmartGroups();
    console.log('\n');
    
    await manualLoadThumbnails();
    console.log('\n');
    
    // 개발자 도구에서 이미지 요소 확인
    const images = document.querySelectorAll('.thumbnail-image');
    console.log(`\n=== DOM 이미지 요소 확인 ===`);
    console.log(`총 이미지 요소: ${images.length}개`);
    
    images.forEach((img, index) => {
        console.log(`이미지 ${index + 1}:`);
        console.log(`- src 길이: ${img.src.length}`);
        console.log(`- complete: ${img.complete}`);
        console.log(`- naturalWidth: ${img.naturalWidth}`);
        console.log(`- naturalHeight: ${img.naturalHeight}`);
        console.log(`- 표시 상태: ${img.style.display}`);
    });
}

// 전역으로 내보내기
window.debugHelpers = {
    debugSmartGroups,
    manualLoadThumbnails,
    useEagleCacheDirectory,
    debugAll
};

console.log('디버깅 헬퍼 로드됨. 다음 명령어를 사용하세요:');
console.log('- debugHelpers.debugAll() : 전체 디버깅');
console.log('- debugHelpers.manualLoadThumbnails() : 수동 썸네일 로드');
console.log('- debugHelpers.useEagleCacheDirectory() : Eagle 캐시 사용');
