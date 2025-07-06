/**
 * 컨텍스트 메뉴 통합 설정
 * Eagle API는 contextMenu.add를 지원하지 않고 contextMenu.open만 지원함
 * 대신 우클릭 이벤트를 감지하여 동적으로 메뉴를 생성하는 방식 사용
 */
function setupContextMenuIntegration() {
    if (typeof eagle === 'undefined') return;
    
    try {
        console.log('컨텍스트 메뉴 통합 설정 시작...');
        
        // Eagle의 contextMenu.open API 사용 가능 여부 확인
        if (eagle.contextMenu && typeof eagle.contextMenu.open === 'function') {
            console.log('Eagle contextMenu.open API 사용 가능');
            
            // 우클릭 이벤트 리스너 추가
            document.addEventListener('contextmenu', async (e) => {
                // 기본 컨텍스트 메뉴 방지
                e.preventDefault();
                
                try {
                    // 현재 선택된 아이템 확인
                    const selectedItems = await eagle.item.getSelected();
                    const videoFiles = selectedItems.filter(item => isVideoFile(item.ext));
                    
                    // 비디오 파일이 선택된 경우에만 메뉴 표시
                    if (videoFiles.length > 0) {
                        // Eagle의 contextMenu.open 사용
                        eagle.contextMenu.open([
                            {
                                id: "process-video",
                                label: "🎬 Video Processor로 분석",
                                click: async () => {
                                    try {
                                        // 선택된 비디오 파일 처리
                                        selectedVideoFiles = videoFiles;
                                        currentVideoFile = videoFiles[0];
                                        isBatchMode = videoFiles.length > 1;
                                        updateSelectedFileDisplay();
                                        
                                        // 창이 숨겨져 있으면 표시
                                        if (eagle.window && eagle.window.show) {
                                            eagle.window.show();
                                        }
                                        
                                        showNotification(`${videoFiles.length}개의 비디오 파일이 선택되었습니다.`, 'success');
                                    } catch (error) {
                                        console.error('컨텍스트 메뉴 처리 오류:', error);
                                        showNotification('비디오 처리 중 오류가 발생했습니다.', 'error');
                                    }
                                }
                            },
                            {
                                id: "process-video-clips",
                                label: "🎬 클립만 추출",
                                click: async () => {
                                    selectedVideoFiles = videoFiles;
                                    currentVideoFile = videoFiles[0];
                                    isBatchMode = videoFiles.length > 1;
                                    updateSelectedFileDisplay();
                                    await processVideo('clips');
                                }
                            },
                            {
                                id: "process-video-frames",
                                label: "🖼️ 프레임만 추출",
                                click: async () => {
                                    selectedVideoFiles = videoFiles;
                                    currentVideoFile = videoFiles[0];
                                    isBatchMode = videoFiles.length > 1;
                                    updateSelectedFileDisplay();
                                    await processVideo('frames');
                                }
                            }
                        ]);
                    }
                } catch (error) {
                    console.error('컨텍스트 메뉴 생성 오류:', error);
                }
            });
            
            console.log('컨텍스트 메뉴 이벤트 리스너 등록 완료');
            
        } else {
            console.log('Eagle contextMenu.open API를 사용할 수 없습니다.');
            
            // 대체 방법: 선택 변경 이벤트 감지
            if (eagle.item && typeof eagle.item.onSelectionChanged === 'function') {
                eagle.item.onSelectionChanged((items) => {
                    const videoFiles = items.filter(item => isVideoFile(item.ext));
                    if (videoFiles.length > 0) {
                        console.log('비디오 파일 선택됨:', videoFiles.length, '개');
                        // UI 업데이트만 수행
                        selectedVideoFiles = videoFiles;
                        currentVideoFile = videoFiles[0];
                        isBatchMode = videoFiles.length > 1;
                        updateSelectedFileDisplay();
                    }
                });
                console.log('선택 변경 이벤트 리스너 등록 완료');
            }
        }
        
    } catch (error) {
        console.error('컨텍스트 메뉴 설정 실패:', error);
    }
}

/**
 * 외부 파라미터 처리 (command palette, context menu 등에서 호출 시)
 */
function handleExternalParameters() {
    try {
        // URL 파라미터 확인
        const urlParams = new URLSearchParams(window.location.search);
        const action = urlParams.get('action');
        const mode = urlParams.get('mode');
        
        // 또는 window 객체에 전달된 파라미터 확인
        const params = window.eaglePluginParams || {};
        
        if (action === 'process' || params.action === 'process') {
            const processMode = mode || params.mode || 'clips';
            const files = params.files;
            
            if (files && files.length > 0) {
                selectedVideoFiles = files;
                currentVideoFile = files[0];
                isBatchMode = files.length > 1;
                updateSelectedFileDisplay();
                
                // 자동으로 처리 시작
                setTimeout(() => {
                    processVideo(processMode);
                }, 500);
            }
        }
    } catch (error) {
        console.error('외부 파라미터 처리 오류:', error);
    }
}

/**
 * Video Processor for Eagle - 메인 로직 (성능 개선 버전)
 * 동영상 컷 변화 감지 및 프레임/클립 추출 플러그인
 * Phase 1: 병렬 처리, Phase 5: 점진적 처리 적용
 */

// 전역 변수
let currentVideoFile = null;
let selectedVideoFiles = [];
let isProcessing = false;
let isEagleReady = false;
let isBatchMode = false;

// 배치 처리 관련 변수
let batchResults = [];
let batchCancelled = false;

// 모듈 인스턴스 (전역으로 관리)
let videoAnalyzer = null;
let frameExtractor = null;
let clipExtractor = null;

// 모듈 로딩 완료 플래그
let modulesLoaded = false;

// DOM 요소 참조
const elements = {
    selectedFile: document.getElementById('selectedFile'),
    selectFileBtn: document.getElementById('selectFileBtn'),
    
    // 설정 요소
    sensitivity: document.getElementById('sensitivity'),
    sensitivityValue: document.getElementById('sensitivityValue'),
    imageFormat: document.getElementById('imageFormat'),
    quality: document.getElementById('quality'),
    qualityValue: document.getElementById('qualityValue'),
    inHandle: document.getElementById('inHandle'),
    inHandleValue: document.getElementById('inHandleValue'),
    outHandle: document.getElementById('outHandle'),
    outHandleValue: document.getElementById('outHandleValue'),

    extractionMethod: document.getElementById('extractionMethod'),
    duplicateHandling: document.getElementById('duplicateHandling'),
    
    // 액션 버튼
    extractFramesBtn: document.getElementById('extractFramesBtn'),
    extractClipsBtn: document.getElementById('extractClipsBtn'),
    processAllBtn: document.getElementById('processAllBtn'),
    
    // 진행 상황
    progressSection: document.getElementById('progressSection'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    progressDetails: document.getElementById('progressDetails'),
    
    // 결과
    resultsSection: document.getElementById('resultsSection'),
    resultSummary: document.getElementById('resultSummary'),
    openResultsBtn: document.getElementById('openResultsBtn'),
    
    // 배치 모드
    batchInfo: document.getElementById('batchInfo'),
    batchCount: document.getElementById('batchCount'),
    batchList: document.getElementById('batchList'),
    batchProgress: document.getElementById('batchProgress'),
    batchCurrentFile: document.getElementById('batchCurrentFile'),
    batchTotalFiles: document.getElementById('batchTotalFiles'),
    batchProgressFill: document.getElementById('batchProgressFill'),
    batchCancelBtn: document.getElementById('batchCancelBtn'),
    batchResultsSection: document.getElementById('batchResultsSection'),
    batchResultsList: document.getElementById('batchResultsList')
};

/**
 * 모듈 로딩 대기
 */
async function waitForModulesLoaded() {
    return new Promise((resolve) => {
        if (modulesLoaded) {
            resolve();
            return;
        }
        
        console.log('모듈 로딩 대기 중...');
        
        const maxWaitTime = 10000;
        const checkInterval = 100;
        let elapsedTime = 0;
        
        const checkModules = setInterval(() => {
            elapsedTime += checkInterval;
            
            if (modulesLoaded) {
                clearInterval(checkModules);
                console.log('모듈 로딩 완료 확인');
                resolve();
            } else if (elapsedTime >= maxWaitTime) {
                clearInterval(checkModules);
                console.error('모듈 로딩 대기 시간 초과');
                resolve();
            }
        }, checkInterval);
    });
}

/**
 * 비디오 길이 가져오기 (Eagle FFmpeg 사용)
 */
async function getVideoDuration(videoPath, ffmpegPaths) {
    try {
        const child_process = window.require ? window.require('child_process') : null;
        if (!child_process) {
            console.warn('child_process not available');
            return 60; // 기본값 반환
        }
        const { spawn } = child_process;
        
        console.log('비디오 길이 분석 시작:', {
            videoPath: videoPath,
            ffprobePath: ffmpegPaths.ffprobe
        });
        
        return new Promise((resolve, reject) => {
            const args = [
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                videoPath
            ];
            
            const ffprobe = spawn(ffmpegPaths.ffprobe, args);
            
            let output = '';
            let error = '';
            
            ffprobe.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            ffprobe.stderr.on('data', (data) => {
                error += data.toString();
            });
            
            ffprobe.on('close', (code) => {
                if (code !== 0) {
                    console.error('ffprobe 에러 출력:', error);
                    reject(new Error(`ffprobe 실패 (코드: ${code}): ${error}`));
                    return;
                }
                
                try {
                    const info = JSON.parse(output);
                    
                    let duration = null;
                    if (info.format && info.format.duration) {
                        duration = parseFloat(info.format.duration);
                    }
                    
                    if (!duration && info.streams) {
                        const videoStream = info.streams.find(s => s.codec_type === 'video');
                        if (videoStream && videoStream.duration) {
                            duration = parseFloat(videoStream.duration);
                        }
                    }
                    
                    if (duration && duration > 0) {
                        console.log('비디오 길이 확인:', duration, '초');
                        resolve(duration);
                    } else {
                        console.warn('비디오 길이를 찾을 수 없음, 기본값 사용');
                        resolve(60);
                    }
                    
                } catch (parseError) {
                    console.error('JSON 파싱 에러:', parseError);
                    reject(new Error('비디오 정보 파싱 실패: ' + parseError.message));
                }
            });
            
            ffprobe.on('error', (err) => {
                console.error('ffprobe 프로세스 에러:', err);
                reject(new Error(`ffprobe 프로세스 실패: ${err.message}`));
            });
            
            setTimeout(() => {
                ffprobe.kill('SIGKILL');
                reject(new Error('ffprobe 타임아웃 (30초)'));
            }, 30000);
        });
        
    } catch (error) {
        console.error('비디오 길이 가져오기 실패:', error);
        return 60;
    }
}

/**
 * 임시 파일 정리 함수 (캐시 관리)
 * @param {Array} filePaths - 정리할 파일 경로 배열
 * @param {Object} importResult - 임포트 결과
 */
async function cleanupTempFiles(filePaths, importResult) {
    try {
        console.log('🧹 임시 파일 정리 시작:', filePaths.length, '개의 파일');
        
        const fs = window.require ? window.require('fs') : null;
        const path = window.require ? window.require('path') : null;
        
        let cleanedCount = 0;
        let skippedCount = 0;
        
        // Eagle 임포트가 성공한 파일들만 삭제
        const successfulImports = importResult?.results?.filter(r => r.success) || [];
        const successfulPaths = successfulImports.map(r => r.path);
        
        for (const filePath of filePaths) {
            try {
                // Eagle 임포트가 성공한 파일만 삭제
                if (successfulPaths.includes(filePath) && fs && fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    cleanedCount++;
                    const fileName = path ? path.basename(filePath) : filePath.split('/').pop();
                    console.log(`✅ 삭제 완료: ${fileName}`);
                } else {
                    skippedCount++;
                    const fileName = path ? path.basename(filePath) : filePath.split('/').pop();
                    console.log(`ℹ️ 삭제 스킵: ${fileName} (임포트 실패 또는 파일 없음)`);
                }
            } catch (error) {
                console.error('파일 삭제 실패:', filePath, error);
                skippedCount++;
            }
        }
        
        // 빈 디렉토리 정리
        try {
            const dirPath = path ? path.dirname(filePaths[0]) : filePaths[0].substring(0, filePaths[0].lastIndexOf('/'));
            const tempDirs = [dirPath];
            
            for (const tempDir of tempDirs) {
                if (fs.existsSync(tempDir)) {
                    const files = fs.readdirSync(tempDir);
                    if (files.length === 0) {
                        fs.rmdirSync(tempDir);
                        const dirName = path ? path.basename(tempDir) : tempDir.split('/').pop();
                        console.log(`📁 빈 디렉토리 삭제: ${dirName}`);
                    } else {
                        const dirName = path ? path.basename(tempDir) : tempDir.split('/').pop();
                        console.log(`📁 디렉토리 유지: ${dirName} (${files.length}개 파일 남음)`);
                    }
                }
            }
        } catch (dirError) {
            console.warn('디렉토리 정리 실패:', dirError);
        }
        
        console.log(`🧹 임시 파일 정리 완료: ${cleanedCount}개 삭제, ${skippedCount}개 스킵`);
        
        if (cleanedCount > 0) {
            showNotification(`🧹 캐시 정리 완료: ${cleanedCount}개 파일 삭제`, 'info');
        }
        
    } catch (error) {
        console.error('임시 파일 정리 실패:', error);
    }
}

/**
 * 애플리케이션 초기화
 */
async function initializeApp() {
    console.log('🚀 Video Processor for Eagle 초기화 시작 (성능 개선 버전)');
    
    await loadModules();
    setupEventListeners();
    setupContextMenuIntegration(); // 컨텍스트 메뉴 통합 추가
    updateUI();
    checkEagleAPI();
    
    // 외부에서 전달된 파라미터 처리
    handleExternalParameters();
    
    console.log('Video Processor for Eagle 초기화 완료');
}

/**
 * 모듈 로드
 */
async function loadModules() {
    if (modulesLoaded) {
        console.log('모듈이 이미 로드되었습니다.');
        return;
    }
    
    try {
        console.log('모듈 로드 시작...');
        
        const loadScript = (src) => {
            return new Promise((resolve, reject) => {
                console.log(`스크립트 로드 시작: ${src}`);
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => {
                    console.log(`스크립트 로드 완료: ${src}`);
                    resolve();
                };
                script.onerror = () => {
                    console.error(`스크립트 로드 실패: ${src}`);
                    reject(new Error(`Failed to load ${src}`));
                };
                document.head.appendChild(script);
            });
        };
        
        await loadScript('modules/video-analyzer.js');
        await loadScript('modules/frame-extractor.js');
        await loadScript('modules/clip-extractor.js');
        
        console.log('모듈 스크립트 로딩 완료, 전역 객체 확인 중...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const requiredModules = ['VideoAnalyzer', 'FrameExtractor', 'ClipExtractor'];
        const missingModules = requiredModules.filter(module => !window[module]);
        
        if (missingModules.length > 0) {
            throw new Error(`다음 모듈을 찾을 수 없습니다: ${missingModules.join(', ')}`);
        }
        
        console.log('모든 모듈 전역 객체 확인 완료');
        
        videoAnalyzer = null;
        frameExtractor = null;
        clipExtractor = null;
        
        modulesLoaded = true;
        console.log('⚡ 모듈 로드 완료! (성능 개선 기능 포함)');
        
        showNotification('모듈 로드가 완료되었습니다. (병렬 처리 지원)', 'success');
        
    } catch (error) {
        console.error('모듈 로드 실패:', error);
        showNotification('모듈 로드에 실패했습니다: ' + error.message, 'error');
        modulesLoaded = false;
    }
}

/**
 * 이벤트 리스너 설정
 */
function setupEventListeners() {
    elements.selectFileBtn.addEventListener('click', selectVideoFile);
    elements.sensitivity.addEventListener('input', updateSensitivityValue);
    elements.quality.addEventListener('input', updateQualityValue);
    elements.inHandle.addEventListener('input', updateInHandleValue);
    elements.outHandle.addEventListener('input', updateOutHandleValue);
    elements.extractFramesBtn.addEventListener('click', () => processVideo('frames'));
    elements.extractClipsBtn.addEventListener('click', () => processVideo('clips'));
    elements.processAllBtn.addEventListener('click', () => processVideo('all'));
    elements.openResultsBtn.addEventListener('click', openResultsFolder);
}

/**
 * Eagle API 사용 가능성 확인 및 이벤트 설정
 */
function checkEagleAPI() {
    if (typeof eagle !== 'undefined') {
        console.log('Eagle API 사용 가능');
        console.log('Eagle 버전:', eagle.app.version);
        console.log('플랫폼:', eagle.app.platform);
        
        // 명령 팔레트 등록
        registerCommands();
        
        if (typeof eagle.onPluginCreate === 'function') {
            eagle.onPluginCreate(async (plugin) => {
                console.log('Eagle onPluginCreate 이벤트 수신');
                isEagleReady = true;
                
                await checkFFmpegDependency();
                await autoDetectSelectedFile();
            });
        } else {
            isEagleReady = true;
            checkFFmpegDependency();
            autoDetectSelectedFile();
        }
    } else {
        console.warn('Eagle API를 사용할 수 없습니다. 개발 환경에서 실행 중입니다.');
        showNotification('Eagle API를 사용할 수 없습니다. Eagle 내에서 실행해주세요.', 'warning');
    }
}

/**
 * 명령 팔레트 등록
 */
function registerCommands() {
    if (!eagle || !eagle.command || typeof eagle.command.register !== 'function') {
        console.log('Eagle command API를 사용할 수 없습니다.');
        return;
    }
    
    try {
        // 클립 추출 명령
        eagle.command.register({
            id: 'video-processor:extract-clips',
            title: 'Video Processor: 클립 추출',
            shortcut: process.platform === 'darwin' ? 'Cmd+Shift+V' : 'Ctrl+Shift+V',
            action: async () => {
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
            }
        });
        
        // 프레임 추출 명령
        eagle.command.register({
            id: 'video-processor:extract-frames',
            title: 'Video Processor: 프레임 추출',
            action: async () => {
                const selectedItems = await eagle.item.getSelected();
                const videoFiles = selectedItems.filter(item => isVideoFile(item.ext));
                
                if (videoFiles.length > 0) {
                    selectedVideoFiles = videoFiles;
                    currentVideoFile = videoFiles[0];
                    isBatchMode = videoFiles.length > 1;
                    updateSelectedFileDisplay();
                    await processVideo('frames');
                }
            }
        });
        
        console.log('명령 팔레트 등록 완료');
        
    } catch (error) {
        console.error('명령 등록 실패:', error);
    }
}

/**
 * 현재 선택된 파일 자동 감지
 */
async function autoDetectSelectedFile() {
    if (!isEagleReady) {
        console.log('Eagle이 아직 준비되지 않았습니다.');
        return;
    }
    
    try {
        const selectedItems = await eagle.item.getSelected();
        
        console.log('선택된 항목:', selectedItems);
        
        if (selectedItems && selectedItems.length > 0) {
            // 비디오 파일만 필터링
            const videoFiles = selectedItems.filter(item => isVideoFile(item.ext));
            
            if (videoFiles.length > 0) {
                if (videoFiles.length === 1) {
                    // 단일 파일 모드
                    currentVideoFile = videoFiles[0];
                    selectedVideoFiles = [videoFiles[0]];
                    isBatchMode = false;
                } else {
                    // 배치 모드
                    currentVideoFile = videoFiles[0];
                    selectedVideoFiles = videoFiles;
                    isBatchMode = true;
                }
                updateSelectedFileDisplay();
                showNotification(`${videoFiles.length}개의 비디오 파일이 자동으로 선택되었습니다.`, 'success');
                console.log(`비디오 파일 선택 완료: ${videoFiles.length}개`);
            } else {
                console.log('선택된 항목 중 비디오 파일이 없습니다.');
            }
        } else {
            console.log('선택된 항목이 없습니다.');
        }
    } catch (error) {
        console.error('선택된 파일 자동 감지 실패:', error);
    }
}

/**
 * 비디오 파일인지 확인
 */
function isVideoFile(extension) {
    const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm', 'm4v'];
    const lowerExt = extension.toLowerCase();
    return videoExtensions.includes(lowerExt);
}

/**
 * 비디오 파일 선택
 */
async function selectVideoFile() {
    try {
        if (typeof eagle === 'undefined') {
            showNotification('Eagle API를 사용할 수 없습니다.', 'error');
            return;
        }
        
        if (!isEagleReady) {
            showNotification('Eagle이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.', 'warning');
            return;
        }
        
        const selectedItems = await eagle.item.getSelected();
        
        if (!selectedItems || selectedItems.length === 0) {
            showNotification('Eagle에서 비디오 파일을 선택해주세요.', 'warning');
            return;
        }
        
        // 비디오 파일만 필터링
        const videoFiles = selectedItems.filter(item => isVideoFile(item.ext));
        
        if (videoFiles.length === 0) {
            showNotification(`선택된 항목 중 비디오 파일이 없습니다.\n지원되는 형식: MP4, MOV, AVI, MKV, WMV, FLV, WebM, M4V`, 'warning');
            return;
        }
        
        if (videoFiles.length === 1) {
            // 단일 파일 모드
            currentVideoFile = videoFiles[0];
            selectedVideoFiles = [videoFiles[0]];
            isBatchMode = false;
        } else {
            // 배치 모드
            currentVideoFile = videoFiles[0];
            selectedVideoFiles = videoFiles;
            isBatchMode = true;
        }
        
        updateSelectedFileDisplay();
        showNotification(`${videoFiles.length}개의 비디오 파일이 선택되었습니다.`, 'success');
        
        console.log(`선택된 비디오 파일: ${videoFiles.length}개`, videoFiles);
        
    } catch (error) {
        console.error('파일 선택 실패:', error);
        showNotification('파일 선택에 실패했습니다: ' + error.message, 'error');
    }
}

/**
 * 선택된 파일 표시 업데이트
 */
function updateSelectedFileDisplay() {
    if (selectedVideoFiles.length > 0) {
        if (isBatchMode) {
            // 배치 모드
            elements.selectedFile.innerHTML = `
                <span class="file-name">📚 배치 모드: ${selectedVideoFiles.length}개 파일 선택</span>
            `;
            elements.selectedFile.classList.add('has-file');
            
            // 배치 정보 표시
            elements.batchInfo.style.display = 'block';
            elements.batchCount.textContent = selectedVideoFiles.length;
            
            // 파일 리스트 표시
            let listHTML = '';
            selectedVideoFiles.forEach((file, index) => {
                const fileSize = file.size ? `(${formatFileSize(file.size)})` : '';
                listHTML += `
                    <div class="batch-item">
                        <span class="batch-item-icon">🎥</span>
                        <span class="batch-item-name">${file.name}</span>
                        <span class="batch-item-size">${fileSize}</span>
                    </div>
                `;
            });
            elements.batchList.innerHTML = listHTML;
            
        } else {
            // 단일 파일 모드
            elements.selectedFile.innerHTML = `
                <span class="file-name">${currentVideoFile.name}</span>
            `;
            elements.selectedFile.classList.add('has-file');
            elements.batchInfo.style.display = 'none';
        }
    } else {
        elements.selectedFile.innerHTML = '<span class="placeholder">Eagle에서 동영상을 선택하세요</span>';
        elements.selectedFile.classList.remove('has-file');
        elements.batchInfo.style.display = 'none';
    }
    
    updateUI();
}

/**
 * 파일 크기 포맷팅
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * 설정 값 업데이트
 */
function updateSensitivityValue() {
    elements.sensitivityValue.textContent = elements.sensitivity.value;
}

function updateQualityValue() {
    elements.qualityValue.textContent = elements.quality.value;
}

function updateInHandleValue() {
    elements.inHandleValue.textContent = `+${elements.inHandle.value}`;
}

function updateOutHandleValue() {
    elements.outHandleValue.textContent = `-${elements.outHandle.value}`;
}

/**
 * UI 상태 업데이트
 */
function updateUI() {
    const hasFile = selectedVideoFiles && selectedVideoFiles.length > 0;
    
    elements.extractFramesBtn.disabled = !hasFile || isProcessing;
    elements.extractClipsBtn.disabled = !hasFile || isProcessing;
    elements.processAllBtn.disabled = !hasFile || isProcessing;
    
    elements.progressSection.style.display = isProcessing ? 'block' : 'none';
    
    // 배치 모드일 때 버튼 텍스트 변경
    if (isBatchMode && selectedVideoFiles.length > 1) {
        elements.extractFramesBtn.innerHTML = `🖼️ 이미지 추출 (${selectedVideoFiles.length}개)`;
        elements.extractClipsBtn.innerHTML = `🎬 클립 추출 (${selectedVideoFiles.length}개)`;
        elements.processAllBtn.innerHTML = `📋 모든 처리 (${selectedVideoFiles.length}개)`;
    } else {
        elements.extractFramesBtn.innerHTML = '🖼️ 이미지 추출';
        elements.extractClipsBtn.innerHTML = '🎬 클립 추출';
        elements.processAllBtn.innerHTML = '📋 모든 처리';
    }
}

/**
 * 배치 비디오 처리 (개선된 버전)
 */
async function processBatchVideos(mode) {
    if (isProcessing) {
        showNotification('이미 처리가 진행 중입니다.', 'warning');
        return;
    }
    
    isProcessing = true;
    batchCancelled = false;
    batchResults = [];
    updateUI();
    
    const totalFiles = selectedVideoFiles.length;
    const startTime = Date.now();
    
    try {
        // 배치 진행률 표시
        elements.batchProgress.style.display = 'block';
        elements.batchTotalFiles.textContent = totalFiles;
        
        // 취소 버튼 표시
        if (elements.batchCancelBtn) {
            elements.batchCancelBtn.style.display = 'inline-block';
            elements.batchCancelBtn.onclick = () => {
                batchCancelled = true;
                showNotification('배치 처리를 취소하고 있습니다...', 'info');
            };
        }
        
        showNotification(`📚 배치 처리 시작: ${totalFiles}개 파일`, 'info');
        
        const settings = {
            sensitivity: parseFloat(elements.sensitivity.value),
            imageFormat: elements.imageFormat.value,
            quality: parseInt(elements.quality.value),
            inHandle: parseInt(elements.inHandle.value),
            outHandle: parseInt(elements.outHandle.value),
            useUnifiedExtraction: elements.extractionMethod.value === 'unified'
        };
        
        const ffmpegAvailable = await checkFFmpegDependency();
        if (!ffmpegAvailable) {
            throw new Error('Eagle FFmpeg 의존성을 사용할 수 없습니다.');
        }
        
        const ffmpegPaths = await getFFmpegPaths();
        
        // 각 파일을 순차적으로 처리
        for (let i = 0; i < selectedVideoFiles.length; i++) {
            // 취소 확인
            if (batchCancelled) {
                console.log('배치 처리가 사용자에 의해 취소되었습니다.');
                break;
            }
            
            const videoFile = selectedVideoFiles[i];
            currentVideoFile = videoFile;
            
            // 배치 진행률 업데이트
            elements.batchCurrentFile.textContent = i + 1;
            const batchProgress = i / totalFiles;
            elements.batchProgressFill.style.width = `${batchProgress * 100}%`;
            
            console.log(`\n📚 배치 처리 [${i + 1}/${totalFiles}]: ${videoFile.name}`);
            showProgress(0, `[${i + 1}/${totalFiles}] ${videoFile.name} 처리 시작...`);
            
            const fileStartTime = Date.now();
            const result = {
                fileName: videoFile.name,
                fileSize: videoFile.size,
                success: false,
                error: null,
                cutPoints: 0,
                extractedFrames: 0,
                extractedClips: 0,
                processingTime: 0
            };
            
            try {
                const processResult = await processVideoWithFFmpeg(mode, settings, ffmpegPaths, fileStartTime);
                result.success = true;
                result.cutPoints = processResult.cutPoints || 0;
                result.extractedFrames = processResult.extractedFrames || 0;
                result.extractedClips = processResult.extractedClips || 0;
                result.processingTime = (Date.now() - fileStartTime) / 1000;
                console.log(`✅ 완료: ${videoFile.name}`);
            } catch (error) {
                result.error = error.message;
                result.processingTime = (Date.now() - fileStartTime) / 1000;
                console.error(`❌ 실패: ${videoFile.name}`, error);
                showNotification(`${videoFile.name} 처리 실패: ${error.message}`, 'error');
            }
            
            batchResults.push(result);
        }
        
        // 배치 처리 완료
        elements.batchProgressFill.style.width = '100%';
        const totalTime = (Date.now() - startTime) / 1000;
        
        // 배치 결과 표시
        showBatchResults(batchResults, totalTime, batchCancelled);
        
    } catch (error) {
        console.error('배치 처리 실패:', error);
        showNotification('배치 처리에 실패했습니다: ' + error.message, 'error');
    } finally {
        isProcessing = false;
        batchCancelled = false;
        elements.batchProgress.style.display = 'none';
        if (elements.batchCancelBtn) {
            elements.batchCancelBtn.style.display = 'none';
        }
        updateUI();
    }
}

/**
 * 비디오 처리 실행 (성능 개선 버전)
 */
async function processVideo(mode) {
    if (!selectedVideoFiles || selectedVideoFiles.length === 0) {
        showNotification('비디오 파일을 먼저 선택해주세요.', 'warning');
        return;
    }
    
    // 배치 모드인 경우
    if (isBatchMode) {
        await processBatchVideos(mode);
        return;
    }
    
    if (isProcessing) {
        showNotification('이미 처리가 진행 중입니다.', 'warning');
        return;
    }
    
    if (!modulesLoaded) {
        showNotification('모듈을 로드 중입니다. 잠시만 기다려주세요...', 'info');
        await waitForModulesLoaded();
        
        if (!modulesLoaded) {
            showNotification('모듈 로드에 실패했습니다. 플러그인을 다시 시작해주세요.', 'error');
            return;
        }
    }
    
    isProcessing = true;
    updateUI();
    
    const startTime = Date.now(); // 성능 측정용
    
    try {
        const settings = {
            sensitivity: parseFloat(elements.sensitivity.value),
            imageFormat: elements.imageFormat.value,
            quality: parseInt(elements.quality.value),
            inHandle: parseInt(elements.inHandle.value),
            outHandle: parseInt(elements.outHandle.value),
            useUnifiedExtraction: elements.extractionMethod.value === 'unified'
        };
        
        console.log('🚀 성능 개선된 비디오 처리 시작:', { mode, settings });
        console.log('처리할 비디오 파일:', currentVideoFile);
        
        showProgress(0, '비디오 분석 시작 중...');
        
        const ffmpegAvailable = await checkFFmpegDependency();
        if (!ffmpegAvailable) {
            throw new Error('Eagle FFmpeg 의존성을 사용할 수 없습니다.');
        }
        
        const ffmpegPaths = await getFFmpegPaths();
        console.log('사용할 FFmpeg 경로:', ffmpegPaths);
        
        showProgress(0.1, '비디오 파일 정보 확인 중...');
        const videoDuration = await getVideoDuration(currentVideoFile.filePath, ffmpegPaths);
        console.log('비디오 길이:', videoDuration, '초');
        
        await processVideoWithFFmpeg(mode, settings, ffmpegPaths, startTime);
        
    } catch (error) {
        console.error('비디오 처리 실패:', error);
        showNotification('비디오 처리에 실패했습니다: ' + error.message, 'error');
    } finally {
        isProcessing = false;
        updateUI();
    }
}

/**
 * Eagle FFmpeg 의존성 확인
 */
async function checkFFmpegDependency() {
    try {
        if (typeof eagle.extraModule === 'undefined' || typeof eagle.extraModule.ffmpeg === 'undefined') {
            console.warn('Eagle extraModule.ffmpeg를 사용할 수 없습니다.');
            return false;
        }
        
        const isInstalled = await eagle.extraModule.ffmpeg.isInstalled();
        
        if (!isInstalled) {
            console.log('FFmpeg 의존성이 설치되지 않았습니다. 설치를 시도합니다.');
            showNotification('FFmpeg 의존성을 설치하고 있습니다...', 'info');
            
            try {
                await eagle.extraModule.ffmpeg.install();
                showNotification('FFmpeg 의존성 설치가 완료되었습니다.', 'success');
                return true;
            } catch (installError) {
                console.error('FFmpeg 의존성 설치 실패:', installError);
                showNotification('FFmpeg 의존성 설치에 실패했습니다.', 'error');
                return false;
            }
        } else {
            console.log('FFmpeg 의존성이 이미 설치되어 있습니다.');
            return true;
        }
    } catch (error) {
        console.error('FFmpeg 의존성 확인 실패:', error);
        return false;
    }
}

/**
 * Eagle FFmpeg 바이너리 경로 가져오기
 */
async function getFFmpegPaths() {
    try {
        if (typeof eagle.extraModule === 'undefined' || typeof eagle.extraModule.ffmpeg === 'undefined') {
            throw new Error('Eagle extraModule.ffmpeg를 사용할 수 없습니다.');
        }
        
        const paths = await eagle.extraModule.ffmpeg.getPaths();
        console.log('FFmpeg 바이너리 경로:', paths);
        
        return {
            ffmpeg: paths.ffmpeg,
            ffprobe: paths.ffprobe
        };
    } catch (error) {
        console.error('FFmpeg 경로 가져오기 실패:', error);
        throw error;
    }
}

/**
 * 배치 처리 결과 표시
 */
function showBatchResults(results, totalTime, wasCancelled) {
    if (!results || results.length === 0) return;
    
    // 통계 계산
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const totalFrames = results.reduce((sum, r) => sum + r.extractedFrames, 0);
    const totalClips = results.reduce((sum, r) => sum + r.extractedClips, 0);
    const totalCutPoints = results.reduce((sum, r) => sum + r.cutPoints, 0);
    
    const timeStr = totalTime < 60 ? `${totalTime.toFixed(1)}초` : `${(totalTime/60).toFixed(1)}분`;
    
    // 결과 메시지
    const statusEmoji = wasCancelled ? '⏸️' : (failCount === 0 ? '🎉' : '⚠️');
    const statusText = wasCancelled ? '배치 처리가 취소되었습니다' : '배치 처리 완료!';
    
    showNotification(`${statusEmoji} ${statusText} 성공: ${successCount}/${results.length}개 (처리시간: ${timeStr})`, 
                    failCount === 0 ? 'success' : 'warning');
    
    // 상세 결과 HTML 생성
    let resultsHTML = `
        <div class="batch-results-summary">
            <h3>${statusEmoji} ${statusText}</h3>
            <div class="batch-stats-grid">
                <div class="batch-stat">
                    <span class="batch-stat-value">${successCount}/${results.length}</span>
                    <span class="batch-stat-label">성공</span>
                </div>
                <div class="batch-stat">
                    <span class="batch-stat-value">${totalCutPoints}</span>
                    <span class="batch-stat-label">총 컷포인트</span>
                </div>
                <div class="batch-stat">
                    <span class="batch-stat-value">${totalFrames}</span>
                    <span class="batch-stat-label">총 프레임</span>
                </div>
                <div class="batch-stat">
                    <span class="batch-stat-value">${totalClips}</span>
                    <span class="batch-stat-label">총 클립</span>
                </div>
                <div class="batch-stat">
                    <span class="batch-stat-value">${timeStr}</span>
                    <span class="batch-stat-label">총 시간</span>
                </div>
            </div>
        </div>
        
        <div class="batch-results-detail">
            <h4>파일별 처리 결과</h4>
            <div class="batch-results-list">
    `;
    
    // 각 파일의 결과
    results.forEach((result, index) => {
        const statusIcon = result.success ? '✅' : '❌';
        const timeStr = result.processingTime < 60 ? 
            `${result.processingTime.toFixed(1)}초` : 
            `${(result.processingTime/60).toFixed(1)}분`;
        
        resultsHTML += `
            <div class="batch-result-item ${result.success ? 'success' : 'failed'}">
                <div class="batch-result-header">
                    <span class="batch-result-icon">${statusIcon}</span>
                    <span class="batch-result-name">${result.fileName}</span>
                    <span class="batch-result-time">${timeStr}</span>
                </div>
                ${result.success ? `
                    <div class="batch-result-details">
                        <span>컷: ${result.cutPoints}개</span>
                        <span>프레임: ${result.extractedFrames}개</span>
                        <span>클립: ${result.extractedClips}개</span>
                    </div>
                ` : `
                    <div class="batch-result-error">
                        ${result.error || '알 수 없는 오류'}
                    </div>
                `}
            </div>
        `;
    });
    
    resultsHTML += `
            </div>
        </div>
    `;
    
    // 결과 섹션 표시
    if (elements.batchResultsSection) {
        elements.batchResultsSection.style.display = 'block';
        elements.batchResultsList.innerHTML = resultsHTML;
    } else {
        // 대체 결과 표시
        elements.resultsSection.style.display = 'block';
        elements.resultSummary.innerHTML = resultsHTML;
    }
    
    console.log('=== 배치 처리 요약 ===');
    console.log(`성공: ${successCount}/${results.length}`);
    console.log(`실패: ${failCount}`);
    console.log(`총 컷포인트: ${totalCutPoints}`);
    console.log(`총 프레임: ${totalFrames}`);
    console.log(`총 클립: ${totalClips}`);
    console.log(`총 시간: ${timeStr}`);
    console.log('========================');
}

/**
 * FFmpeg를 사용한 실제 비디오 처리 (성능 개선 버전)
 */
async function processVideoWithFFmpeg(mode, settings, ffmpegPaths, startTime) {
    try {
        const videoPath = currentVideoFile.filePath;
        const videoName = currentVideoFile.name.replace(/\.[^/.]+$/, "");
        
        const timestamp = Date.now();
        const os = window.require ? window.require('os') : null;
        const homeDir = os ? os.homedir() : '/tmp';
        const tempDir = `${homeDir}/.video-processor-cache/session-${timestamp}`; // 통합된 캐시 디렉토리
        const fs = window.require ? window.require('fs') : null;
        const path = window.require ? window.require('path') : null;
        
        try {
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            console.log('임시 디렉토리 생성 성공:', tempDir);
        } catch (dirError) {
            console.error('임시 디렉토리 생성 실패:', dirError);
            throw new Error('임시 디렉토리 생성에 실패했습니다.');
        }
        
        // 모듈 인스턴스 초기화
        if (!videoAnalyzer) {
            console.log('VideoAnalyzer 인스턴스 생성...');
            videoAnalyzer = new window.VideoAnalyzer(ffmpegPaths);
        }
        if (!frameExtractor) {
            console.log('FrameExtractor 인스턴스 생성...');
            frameExtractor = new window.FrameExtractor(ffmpegPaths);
        }
        if (!clipExtractor) {
            console.log('ClipExtractor 인스턴스 생성...');
            clipExtractor = new window.ClipExtractor(ffmpegPaths);
        }
        
        showProgress(0.2, '컷 변화 감지 준비 중...');
        
        const cutPoints = await videoAnalyzer.detectCutChanges(videoPath, settings.sensitivity, (progress) => {
            const currentProgress = 0.2 + progress * 0.3;
            showProgress(currentProgress, `컷 변화 감지 중... ${Math.round(progress * 100)}%`);
        }, ffmpegPaths, settings.inHandle, settings.outHandle);
        
        console.log('컷 변화 감지 결과:', cutPoints);
        
        if (cutPoints.length === 0) {
            console.warn('컷 변화가 감지되지 않았습니다.');
            showNotification('컷 변화가 감지되지 않았습니다.', 'warning');
            throw new Error('컷 포인트가 감지되지 않았습니다.');
        } else {
            console.log('컷 변화 감지 성공:', cutPoints.length, '개의 구간');
            showNotification(`${cutPoints.length}개의 컷 구간이 감지되었습니다. (병렬 처리로 빠르게 진행됩니다)`, 'success');
        }
        
        let extractedFrames = 0;
        let extractedClips = 0;
        let clipOutputDir = null; // 클립 출력 폴더 경로 저장
        const outputPaths = [];
        let clipResult = null;
        
        if (mode === 'frames' || mode === 'all') {
            showProgress(0.5, '프레임 추출 중...');
            
            const frameResult = await frameExtractor.extractFrames(videoPath, cutPoints, settings, (progress) => {
                showProgress(0.5 + progress * 0.2, `프레임 추출 중... ${Math.round(progress * 100)}%`);
            });
            
            extractedFrames = frameResult.count;
            outputPaths.push(...frameResult.paths);
        }
        
        // 클립 추출 처리
        if (mode === 'clips' || mode === 'all') {
            const startProgress = mode === 'all' ? 0.7 : 0.5;
            showProgress(startProgress, '⚡ 병렬 클립 추출 중...');
            
            clipResult = await clipExtractor.extractClips(videoPath, cutPoints, settings, (progress) => {
                showProgress(startProgress + progress * 0.2, `⚡ 병렬 클립 추출 중... ${Math.round(progress * 100)}%`);
            });
            
            console.log('병렬 클립 추출 결과:', clipResult);
            
            extractedClips = clipResult.count;
            clipOutputDir = clipResult.outputDir; // 폴더 경로 저장
            
            // 클립 파일 검증
            showProgress(startProgress + 0.22, '클립 파일 검증 중...');
            console.log('클립 파일 검증 시작...');
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const verifiedPaths = [];
            for (const clipPath of clipResult.paths) {
                if (fs && fs.existsSync(clipPath)) {
                    const stats = fs.statSync(clipPath);
                    if (stats.size > 1000) {
                        verifiedPaths.push(clipPath);
                        const fileName = path ? path.basename(clipPath) : clipPath.split('/').pop();
                        console.log(`✅ 클립 파일 확인: ${fileName} (${(stats.size/1024/1024).toFixed(1)}MB)`);
                    } else {
                        const fileName = path ? path.basename(clipPath) : clipPath.split('/').pop();
                        console.warn(`⚠️ 파일 크기가 너무 작음: ${fileName}`);
                    }
                } else {
                    console.error(`❌ 파일이 존재하지 않음: ${clipPath}`);
                }
            }
            
            console.log(`클립 파일 검증 완료: ${verifiedPaths.length}/${clipResult.paths.length}개`);
            
            outputPaths.push(...verifiedPaths);
        }
        
        // 파일 저장 완료 메시지
        showProgress(0.95, '🎉 파일 저장 완료!');
        
        const saveLocation = clipOutputDir || '/Users/ysk/.video-processor-cache/clips/greatminds website';
        console.log(`📁 파일이 ${saveLocation}에 저장되었습니다.`);
        
        // 간단한 완료 메시지만 표시
        const completionMessage = `🎉 ${outputPaths.length}개 파일이 성공적으로 저장되었습니다!`;
        showNotification(completionMessage, 'success');
        
        // 성능 통계 계산
        const totalTime = (Date.now() - startTime) / 1000;
        const processingSpeed = outputPaths.length / totalTime;
        
        console.log('=== 성능 개선 결과 ===');
        console.log('- 총 처리 시간:', totalTime.toFixed(1), '초');
        console.log('- 초당 처리 수:', processingSpeed.toFixed(1), '개/초');
        console.log('- 총 파일 수:', outputPaths.length);
        console.log('- 저장 위치:', saveLocation);
        console.log('========================');
        
        showProgress(1.0, '처리 완료!');
        
        // 결과 표시 (성능 정보 포함)
        showResults({
            cutPoints: cutPoints,
            extractedFrames: extractedFrames,
            extractedClips: extractedClips,
            outputPaths: outputPaths,
            outputDirectory: saveLocation,
            performanceStats: {
                totalTime: totalTime,
                processingSpeed: processingSpeed,
                method: settings.useUnifiedExtraction ? 'optimized' : 'parallel',
                improvement: settings.useUnifiedExtraction ? '고속 병렬 처리' : '안정성 우선'
            }
        });
        
        // 성과 메시지
        const timeStr = totalTime < 60 ? `${totalTime.toFixed(1)}초` : `${(totalTime/60).toFixed(1)}분`;
        showNotification(`⚡ 처리 완료! ${outputPaths.length}개 파일이 생성되었습니다. (처리시간: ${timeStr})`, 'success');
        
        // 배치 처리를 위한 결과 반환
        return {
            cutPoints: cutPoints.length,
            extractedFrames: extractedFrames,
            extractedClips: extractedClips,
            outputPaths: outputPaths,
            outputDirectory: clipOutputDir || tempDir
        };
        
    } catch (error) {
        console.error('FFmpeg 처리 실패:', error);
        throw error;
    }
}

/**
 * 진행 상황 표시
 */
function showProgress(progress, message) {
    elements.progressFill.style.width = `${progress * 100}%`;
    elements.progressText.textContent = message;
    
    const timestamp = new Date().toLocaleTimeString();
    elements.progressDetails.innerHTML += `<div>[${timestamp}] ${message}</div>`;
    elements.progressDetails.scrollTop = elements.progressDetails.scrollHeight;
}

/**
 * 결과 표시 (성능 통계 포함)
 */
function showResults(results) {
    elements.resultsSection.style.display = 'block';
    
    const { cutPoints, extractedFrames, extractedClips, outputPaths, outputDirectory, performanceStats } = results;
    
    const cutSegments = convertCutPointsToSegments(cutPoints);
    
    const summary = `
        <div class="result-stats">
            <div class="stat-item">
                <span class="stat-number">${cutSegments.length}</span>
                <span class="stat-label">감지된 컷 구간</span>
            </div>
            <div class="stat-item">
                <span class="stat-number">${extractedFrames}</span>
                <span class="stat-label">추출된 프레임</span>
            </div>
            <div class="stat-item">
                <span class="stat-number">${extractedClips}</span>
                <span class="stat-label">추출된 클립</span>
            </div>
            <div class="stat-item">
                <span class="stat-number">${outputPaths.length}</span>
                <span class="stat-label">생성된 파일</span>
            </div>
        </div>
        
        ${performanceStats ? `
            <div class="performance-stats">
                <h4>${performanceStats.method === 'optimized' ? '🚀 Phase 2: 최적화된 추출' : '⚡ Phase 1: 병렬 처리'} 결과</h4>
                <div class="perf-grid">
                    <div class="perf-item">
                        <span class="perf-label">처리 시간:</span>
                        <span class="perf-value">${performanceStats.totalTime < 60 
                            ? performanceStats.totalTime.toFixed(1) + '초' 
                            : (performanceStats.totalTime/60).toFixed(1) + '분'}</span>
                    </div>
                    <div class="perf-item">
                        <span class="perf-label">처리 속도:</span>
                        <span class="perf-value">${performanceStats.processingSpeed.toFixed(1)}개/초</span>
                    </div>
                    <div class="perf-item">
                        <span class="perf-label">방식:</span>
                        <span class="perf-value">${performanceStats.improvement}</span>
                    </div>
                </div>
            </div>
        ` : ''}
        
        <div class="output-location">
            <h4>📁 파일 저장 위치</h4>
            <p>추출된 파일이 다음 위치에 저장되었습니다:</p>
            <code>${outputDirectory}</code>
        </div>
        
        <div class="cut-segments">
            <h4>감지된 컷 구간</h4>
            <div class="segments-list">
                ${cutSegments.map((segment, index) => `
                    <div class="segment-item">
                        <span class="segment-number">#${index + 1}</span>
                        <span class="segment-time">${formatTime(segment.start)} ~ ${formatTime(segment.end)}</span>
                        <span class="segment-duration">(${segment.duration.toFixed(1)}초)</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    elements.resultSummary.innerHTML = summary;
}

/**
 * 컷 포인트를 시간 구간으로 변환
 */
function convertCutPointsToSegments(cutPoints) {
    if (!cutPoints || cutPoints.length === 0) return [];
    
    if (cutPoints[0].hasOwnProperty('start') && cutPoints[0].hasOwnProperty('end')) {
        return cutPoints;
    }
    
    const segments = [];
    let previousTime = 0;
    
    for (let i = 0; i < cutPoints.length; i++) {
        const currentTime = cutPoints[i];
        
        if (currentTime > previousTime) {
            segments.push({
                start: previousTime,
                end: currentTime,
                duration: currentTime - previousTime,
                index: i
            });
        }
        
        previousTime = currentTime;
    }
    
    return segments;
}

/**
 * 시간 포맷 함수
 */
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toFixed(1).padStart(4, '0')}`;
}

/**
 * 결과 폴더 열기
 */
function openResultsFolder() {
    try {
        if (typeof eagle !== 'undefined' && eagle.library) {
            const libraryPath = eagle.library.path;
            console.log('라이브러리 경로:', libraryPath);
            
            if (libraryPath) {
                eagle.shell.openExternal(libraryPath);
            } else {
                showNotification('라이브러리 경로를 찾을 수 없습니다.', 'error');
            }
        } else {
            showNotification('Eagle API를 사용할 수 없습니다.', 'error');
        }
    } catch (error) {
        console.error('결과 폴더 열기 실패:', error);
        showNotification('결과 폴더를 열 수 없습니다.', 'error');
    }
}

/**
 * 알림 표시
 */
function showNotification(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    if (typeof eagle === 'undefined') {
        alert(message);
    } else {
        try {
            eagle.notification.show({
                title: 'Video Processor ⚡',
                body: message,
                type: type
            });
        } catch (error) {
            console.error('알림 표시 실패:', error);
            console.log('알림:', message);
        }
    }
}

/**
 * 페이지 로드 시 초기화
 */
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
    
    setTimeout(() => {
        if (typeof eagle !== 'undefined' && !isEagleReady) {
            console.log('Eagle API 재확인 중...');
            isEagleReady = true;
            autoDetectSelectedFile();
        }
    }, 1000);
});

// 전역 객체로 내보내기 (성능 개선 기능 포함)
window.VideoProcessor = {
    currentVideoFile,
    isProcessing,
    isEagleReady,
    modulesLoaded,
    processVideo,
    selectVideoFile,
    showNotification,
    waitForModulesLoaded,
    loadModules,
    // 성능 테스트 함수
    testPerformance: async (videoPath, sensitivity = 0.3) => {
        console.log('🚀 성능 테스트 시작...');
        const startTime = Date.now();
        
        try {
            const ffmpegPaths = await getFFmpegPaths();
            const analyzer = new window.VideoAnalyzer(ffmpegPaths);
            const extractor = new window.ClipExtractor(ffmpegPaths);
            
            const cutPoints = await analyzer.detectCutChanges(videoPath, sensitivity);
            console.log('감지된 컷 수:', cutPoints.length);
            
            if (cutPoints.length > 0) {
                const settings = { quality: 5 };
                const result = await extractor.extractClips(videoPath, cutPoints, settings);
                
                const totalTime = (Date.now() - startTime) / 1000;
                const speed = result.count / totalTime;
                
                console.log('=== 성능 테스트 결과 ===');
                console.log('- 처리 시간:', totalTime.toFixed(1), '초');
                console.log('- 생성된 클립:', result.count, '개');
                console.log('- 처리 속도:', speed.toFixed(1), '개/초');
                console.log('- 병렬 처리:', result.metadata?.concurrency || 'N/A');
                
                return { totalTime, count: result.count, speed, concurrency: result.metadata?.concurrency };
            }
        } catch (error) {
            console.error('성능 테스트 실패:', error);
        }
    },
    // 디버깅 함수들
    debugEagleAPI: () => {
        console.log('Eagle API 디버깅 정보:');
        console.log('- eagle 객체:', typeof eagle);
        console.log('- eagle.app:', eagle?.app);
        console.log('- eagle.item:', eagle?.item);
        console.log('- isEagleReady:', isEagleReady);
    },
    debugModules: () => {
        console.log('모듈 디버깅 정보:');
        console.log('- modulesLoaded:', modulesLoaded);
        console.log('- VideoAnalyzer:', typeof window.VideoAnalyzer);
        console.log('- FrameExtractor:', typeof window.FrameExtractor);
        console.log('- ClipExtractor:', typeof window.ClipExtractor);
    }
};
