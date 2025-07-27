/**
 * Independence Test Script
 * 이 스크립트는 main.js 없이 플러그인이 독립적으로 실행되는지 테스트합니다.
 */

console.log('🧪 독립성 테스트 스크립트 시작...');

// 테스트 대기 시간 (모듈 로드 완료 대기)
const WAIT_TIME = 3000;

setTimeout(async () => {
    try {
        console.log('⏰ 모듈 로드 대기 완료, 테스트 시작...');
        
        // testIndependentOperation 함수가 존재하는지 확인
        if (typeof window.testIndependentOperation === 'function') {
            console.log('✅ testIndependentOperation 함수 발견');
            
            // 독립성 테스트 실행
            const results = await window.testIndependentOperation();
            
            console.log('\n📋 최종 테스트 결과:', results);
            
            if (results.overall) {
                console.log('🎉 전체 독립성 테스트 성공!');
            } else {
                console.log('⚠️ 일부 테스트 실패, 세부 사항 확인 필요');
            }
            
        } else {
            console.error('❌ testIndependentOperation 함수를 찾을 수 없습니다');
            console.log('현재 window 객체의 주요 속성들:');
            
            const windowProps = Object.keys(window).filter(key => 
                key.includes('test') || 
                key.includes('State') || 
                key.includes('Manager') || 
                key.includes('Controller')
            );
            
            console.log('관련 속성들:', windowProps);
        }
        
    } catch (error) {
        console.error('🚨 테스트 스크립트 실행 중 오류:', error);
    }
}, WAIT_TIME);

// 모듈 로드 상태 확인
setTimeout(() => {
    console.log('📦 현재 로드된 모듈들:');
    
    const modules = [
        'StateManager', 'UIController', 'ErrorHandler', 'ProgressManager',
        'PluginWatchdog', 'VideoProcessor', 'EagleIntegration',
        'FileService', 'SettingsManager', 'FFmpegManager'
    ];
    
    modules.forEach(module => {
        const status = typeof window[module] === 'function' ? '✅' : '❌';
        console.log(`  ${module}: ${status}`);
    });
    
    console.log('\n🔧 전역 함수들:');
    const globalFunctions = [
        'testIndependentOperation', 'getStateManager', 'getUIController',
        'showProgress', 'showNotification'
    ];
    
    globalFunctions.forEach(func => {
        const status = typeof window[func] === 'function' ? '✅' : '❌';
        console.log(`  ${func}: ${status}`);
    });
    
}, 1000);

console.log('⏳ 모듈 로드 대기 중... (3초 후 테스트 시작)');