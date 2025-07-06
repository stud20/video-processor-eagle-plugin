/**
 * Eagle API 대안 통합 방법
 * 
 * Eagle 플러그인은 현재 제한적인 API를 제공합니다.
 * 컨텍스트 메뉴와 명령 팔레트가 지원되지 않는 경우의 대안입니다.
 */

// Eagle API 기능 확인
function checkEagleAPIFeatures() {
    if (typeof eagle === 'undefined') {
        console.log('Eagle API 사용 불가');
        return;
    }
    
    console.log('=== Eagle API 기능 확인 ===');
    console.log('eagle.app:', typeof eagle.app !== 'undefined');
    console.log('eagle.item:', typeof eagle.item !== 'undefined');
    console.log('eagle.folder:', typeof eagle.folder !== 'undefined');
    console.log('eagle.library:', typeof eagle.library !== 'undefined');
    console.log('eagle.notification:', typeof eagle.notification !== 'undefined');
    console.log('eagle.shell:', typeof eagle.shell !== 'undefined');
    console.log('eagle.window:', typeof eagle.window !== 'undefined');
    console.log('eagle.plugin:', typeof eagle.plugin !== 'undefined');
    console.log('eagle.dialog:', typeof eagle.dialog !== 'undefined');
    
    // 지원되지 않는 API들
    console.log('\n=== 고급 API 지원 여부 ===');
    console.log('eagle.contextMenu:', typeof eagle.contextMenu !== 'undefined');
    console.log('eagle.command:', typeof eagle.command !== 'undefined');
    console.log('eagle.toolbar:', typeof eagle.toolbar !== 'undefined');
    console.log('eagle.menu:', typeof eagle.menu !== 'undefined');
    console.log('==========================\n');
}

// 대안 1: 단축키 바인딩
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', async (e) => {
        // Cmd+Shift+V 또는 Ctrl+Shift+V
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'V') {
            e.preventDefault();
            console.log('단축키 감지: 클립 추출');
            
            // 선택된 파일 확인 및 처리
            if (isEagleReady) {
                try {
                    const selectedItems = await eagle.item.getSelected();
                    const videoFiles = selectedItems.filter(item => isVideoFile(item.ext));
                    
                    if (videoFiles.length > 0) {
                        selectedVideoFiles = videoFiles;
                        currentVideoFile = videoFiles[0];
                        isBatchMode = videoFiles.length > 1;
                        updateSelectedFileDisplay();
                        await processVideo('clips');
                    } else {
                        showNotification('비디오 파일을 먼저 선택해주세요.', 'warning');
                    }
                } catch (error) {
                    console.error('단축키 처리 오류:', error);
                }
            }
        }
        
        // Cmd+Shift+F 또는 Ctrl+Shift+F (프레임 추출)
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'F') {
            e.preventDefault();
            console.log('단축키 감지: 프레임 추출');
            
            if (isEagleReady) {
                try {
                    const selectedItems = await eagle.item.getSelected();
                    const videoFiles = selectedItems.filter(item => isVideoFile(item.ext));
                    
                    if (videoFiles.length > 0) {
                        selectedVideoFiles = videoFiles;
                        currentVideoFile = videoFiles[0];
                        isBatchMode = videoFiles.length > 1;
                        updateSelectedFileDisplay();
                        await processVideo('frames');
                    }
                } catch (error) {
                    console.error('단축키 처리 오류:', error);
                }
            }
        }
    });
    
    console.log('키보드 단축키 설정 완료 (Cmd/Ctrl+Shift+V: 클립, Cmd/Ctrl+Shift+F: 프레임)');
}

// 대안 2: 파일 감시 (선택 변경 감지)
function setupFileWatcher() {
    if (!isEagleReady) return;
    
    // 선택된 파일 주기적으로 확인
    setInterval(async () => {
        try {
            const selectedItems = await eagle.item.getSelected();
            const videoFiles = selectedItems.filter(item => isVideoFile(item.ext));
            
            // 선택이 변경되었는지 확인
            const currentIds = videoFiles.map(f => f.id).sort().join(',');
            const previousIds = selectedVideoFiles.map(f => f.id).sort().join(',');
            
            if (currentIds !== previousIds && videoFiles.length > 0) {
                console.log('비디오 파일 선택 변경 감지');
                selectedVideoFiles = videoFiles;
                currentVideoFile = videoFiles[0];
                isBatchMode = videoFiles.length > 1;
                updateSelectedFileDisplay();
                
                // 자동으로 UI 업데이트만, 처리는 사용자가 버튼 클릭 시
            }
        } catch (error) {
            // 조용히 실패 (로그 스팸 방지)
        }
    }, 2000); // 2초마다 확인
}

// 대안 3: 빠른 실행 버튼 추가
function addQuickActionButtons() {
    // 헤더에 빠른 실행 버튼 추가
    const headerElement = document.querySelector('.header');
    if (headerElement) {
        const quickActions = document.createElement('div');
        quickActions.className = 'quick-actions';
        quickActions.innerHTML = `
            <button class="btn btn-sm btn-primary" id="quickClipBtn" title="Cmd/Ctrl+Shift+V">
                ⚡ 빠른 클립 추출
            </button>
            <button class="btn btn-sm btn-secondary" id="quickFrameBtn" title="Cmd/Ctrl+Shift+F">
                📸 빠른 프레임 추출
            </button>
        `;
        headerElement.appendChild(quickActions);
        
        // 스타일 추가
        const style = document.createElement('style');
        style.textContent = `
            .quick-actions {
                margin-top: 10px;
                display: flex;
                gap: 10px;
                justify-content: center;
            }
            .quick-actions .btn {
                font-size: 0.8em;
                padding: 4px 12px;
            }
        `;
        document.head.appendChild(style);
        
        // 이벤트 리스너
        document.getElementById('quickClipBtn').addEventListener('click', () => {
            if (selectedVideoFiles.length > 0) {
                processVideo('clips');
            } else {
                showNotification('비디오 파일을 먼저 선택해주세요.', 'warning');
            }
        });
        
        document.getElementById('quickFrameBtn').addEventListener('click', () => {
            if (selectedVideoFiles.length > 0) {
                processVideo('frames');
            } else {
                showNotification('비디오 파일을 먼저 선택해주세요.', 'warning');
            }
        });
    }
}

// 통합 초기화
function initializeAlternativeIntegration() {
    console.log('Eagle API 대안 통합 초기화');
    
    // API 기능 확인
    checkEagleAPIFeatures();
    
    // 키보드 단축키 설정
    setupKeyboardShortcuts();
    
    // 파일 감시 설정
    if (isEagleReady) {
        setupFileWatcher();
    }
    
    // 빠른 실행 버튼 추가
    setTimeout(() => {
        addQuickActionButtons();
    }, 100);
}

// 모듈 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeAlternativeIntegration,
        checkEagleAPIFeatures
    };
}
