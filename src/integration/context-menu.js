/**
 * Eagle 컨텍스트 메뉴 통합
 */

// Eagle API가 사용 가능한지 확인
if (typeof eagle !== 'undefined') {
    
    // 컨텍스트 메뉴 아이템 추가
    eagle.contextMenu.add([
        {
            label: "🎬 Video Processor로 분석",
            // 비디오 파일에서만 표시
            visible: async (params) => {
                const selectedItems = await eagle.item.getSelected();
                return selectedItems.some(item => 
                    ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v']
                    .includes(item.ext.toLowerCase())
                );
            },
            click: async () => {
                console.log('Video Processor 컨텍스트 메뉴 실행');
                
                try {
                    // 선택된 비디오 파일 가져오기
                    const selectedItems = await eagle.item.getSelected();
                    const videoFiles = selectedItems.filter(item => 
                        ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v']
                        .includes(item.ext.toLowerCase())
                    );
                    
                    if (videoFiles.length === 0) {
                        eagle.notification.show({
                            title: 'Video Processor',
                            body: '비디오 파일을 선택해주세요.',
                            type: 'warning'
                        });
                        return;
                    }
                    
                    // 간단한 처리 다이얼로그 표시
                    const result = await eagle.dialog.showMessageBox({
                        type: 'question',
                        title: 'Video Processor',
                        message: `${videoFiles.length}개의 비디오를 처리하시겠습니까?`,
                        detail: videoFiles.map(f => f.name).join('\n'),
                        buttons: ['클립 추출', '프레임 추출', '모두 추출', '취소'],
                        defaultId: 0,
                        cancelId: 3
                    });
                    
                    if (result.response === 3) return; // 취소
                    
                    const mode = ['clips', 'frames', 'all'][result.response];
                    
                    // 메인 플러그인 창 열기 (또는 백그라운드 처리)
                    eagle.plugin.run('video-processor-eagle-plugin', {
                        action: 'process',
                        mode: mode,
                        files: videoFiles
                    });
                    
                } catch (error) {
                    console.error('컨텍스트 메뉴 처리 실패:', error);
                    eagle.notification.show({
                        title: 'Video Processor',
                        body: '처리 중 오류가 발생했습니다.',
                        type: 'error'
                    });
                }
            }
        },
        {
            type: 'separator'
        },
        {
            label: "⚡ 빠른 클립 추출",
            visible: async (params) => {
                const selectedItems = await eagle.item.getSelected();
                return selectedItems.length === 1 && 
                    ['mp4', 'mov', 'avi', 'mkv'].includes(
                        selectedItems[0].ext.toLowerCase()
                    );
            },
            click: async () => {
                const selectedItems = await eagle.item.getSelected();
                if (selectedItems.length === 1) {
                    // 빠른 처리 모드
                    eagle.plugin.run('video-processor-eagle-plugin', {
                        action: 'quick-process',
                        mode: 'clips',
                        files: selectedItems,
                        settings: {
                            sensitivity: 0.3,
                            quality: 5
                        }
                    });
                }
            }
        }
    ]);
    
    // 명령 팔레트에 명령 등록
    eagle.command.register([
        {
            id: 'video-processor:extract-clips',
            title: 'Video Processor: 선택한 비디오에서 클립 추출',
            shortcut: process.platform === 'darwin' ? 'Cmd+Shift+V' : 'Ctrl+Shift+V',
            action: async () => {
                const selectedItems = await eagle.item.getSelected();
                const videoFiles = selectedItems.filter(item => 
                    ['mp4', 'mov', 'avi', 'mkv'].includes(item.ext.toLowerCase())
                );
                
                if (videoFiles.length > 0) {
                    eagle.plugin.run('video-processor-eagle-plugin', {
                        action: 'process',
                        mode: 'clips',
                        files: videoFiles
                    });
                } else {
                    eagle.notification.show({
                        title: 'Video Processor',
                        body: '비디오 파일을 먼저 선택해주세요.',
                        type: 'warning'
                    });
                }
            }
        },
        {
            id: 'video-processor:extract-frames',
            title: 'Video Processor: 선택한 비디오에서 프레임 추출',
            action: async () => {
                const selectedItems = await eagle.item.getSelected();
                const videoFiles = selectedItems.filter(item => 
                    ['mp4', 'mov', 'avi', 'mkv'].includes(item.ext.toLowerCase())
                );
                
                if (videoFiles.length > 0) {
                    eagle.plugin.run('video-processor-eagle-plugin', {
                        action: 'process',
                        mode: 'frames',
                        files: videoFiles
                    });
                }
            }
        }
    ]);
    
    console.log('Video Processor 컨텍스트 메뉴 및 명령 등록 완료');
}

// 모듈 내보내기
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        init: () => {
            console.log('Context menu integration initialized');
        }
    };
}
