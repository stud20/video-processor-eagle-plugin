// JavaScript 구문 검사 스크립트
const fs = require('fs');
const vm = require('vm');

console.log('🔍 FrameExtractor 구문 검사 시작...');

try {
    // 파일 읽기
    const frameExtractorCode = fs.readFileSync('/Users/ysk/git/video-processor-eagle-plugin/src/modules/frame-extractor.js', 'utf8');
    
    console.log('📄 파일 크기:', frameExtractorCode.length, '바이트');
    
    // 구문 검사 (실행하지 않고 파싱만)
    try {
        new vm.Script(frameExtractorCode);
        console.log('✅ FrameExtractor 구문 검사 통과!');
        
        // 클래스 정의 확인
        const classMatch = frameExtractorCode.match(/class\s+FrameExtractor/);
        const exportMatch = frameExtractorCode.match(/window\.FrameExtractor\s*=\s*FrameExtractor/);
        
        console.log('📋 구문 분석 결과:');
        console.log('  - FrameExtractor 클래스 정의:', classMatch ? '✅ 발견' : '❌ 없음');
        console.log('  - window 객체 등록:', exportMatch ? '✅ 발견' : '❌ 없음');
        
        // 의존성 확인
        const dependencies = [
            { name: 'eagleUtils', pattern: /window\.eagleUtils/ },
            { name: 'configManager', pattern: /window\.configManager/ }
        ];
        
        dependencies.forEach(dep => {
            const found = dep.pattern.test(frameExtractorCode);
            console.log(`  - ${dep.name} 의존성:`, found ? '✅ 발견' : '⚠️ 없음');
        });
        
    } catch (syntaxError) {
        console.error('❌ FrameExtractor 구문 오류 발견:');
        console.error('  메시지:', syntaxError.message);
        console.error('  위치:', syntaxError.stack);
        
        // 오류 라인 찾기
        const lines = frameExtractorCode.split('\n');
        const errorLine = syntaxError.lineNumber || 1;
        console.error('  오류 라인 (추정):', errorLine);
        console.error('  해당 라인:', lines[errorLine - 1]);
    }
    
} catch (fileError) {
    console.error('❌ 파일 읽기 오류:', fileError.message);
}

console.log('🔍 구문 검사 완료');
