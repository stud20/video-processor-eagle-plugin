// 모듈 로드 디버깅 스크립트
// 브라우저 콘솔에서 실행하여 모듈 상태 확인

console.log('=== 모듈 로드 디버깅 ===');

// 1. 현재 window 객체에서 모듈 확인
const moduleNames = ['VideoAnalyzer', 'FrameExtractor', 'ClipExtractor', 'EagleImporter', 'SmartFrameSelector'];
const moduleStatus = {};

moduleNames.forEach(name => {
    moduleStatus[name] = {
        exists: typeof window[name] !== 'undefined',
        type: typeof window[name],
        isFunction: typeof window[name] === 'function',
        isClass: typeof window[name] === 'function' && window[name].prototype && window[name].prototype.constructor === window[name]
    };
});

console.log('모듈 상태:', moduleStatus);

// 2. 스크립트 태그 확인
const scriptTags = Array.from(document.querySelectorAll('script[src]'));
const moduleScripts = scriptTags.filter(script => script.src.includes('modules/'));

console.log('모듈 스크립트 태그들:');
moduleScripts.forEach(script => {
    console.log(`- ${script.src}`, {
        loaded: script.readyState === 'complete' || script.readyState === 'loaded',
        hasError: script.onerror !== null
    });
});

// 3. window 객체에서 Extractor/Analyzer 관련 키 찾기
const windowKeys = Object.keys(window);
const relevantKeys = windowKeys.filter(key => 
    key.includes('Extractor') || 
    key.includes('Analyzer') || 
    key.includes('Importer') || 
    key.includes('Selector')
);

console.log('관련 window 키들:', relevantKeys);

// 4. 에러 확인
if (window.console && window.console.error) {
    console.log('최근 콘솔 에러가 있다면 확인해보세요.');
}

// 5. 수동 모듈 재로딩 테스트
function reloadModule(moduleName) {
    const script = document.createElement('script');
    script.src = `modules/${moduleName.toLowerCase().replace(/([A-Z])/g, '-$1').substring(1)}.js`;
    script.onload = () => console.log(`${moduleName} 재로딩 성공`);
    script.onerror = () => console.error(`${moduleName} 재로딩 실패`);
    document.head.appendChild(script);
}

// 누락된 모듈 재로딩
const missingModules = moduleNames.filter(name => typeof window[name] !== 'function');
if (missingModules.length > 0) {
    console.log('누락된 모듈들을 재로딩 시도:', missingModules);
    
    // 특별히 FrameExtractor 재로딩
    if (missingModules.includes('FrameExtractor')) {
        console.log('FrameExtractor 수동 재로딩 시도...');
        reloadModule('FrameExtractor');
    }
}

console.log('=== 디버깅 완료 ===');
