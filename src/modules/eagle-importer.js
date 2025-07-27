/**
 * EagleImporter - Eagle 라이브러리 연동 모듈 (리팩토링 버전)
 * 추출된 파일들을 Eagle 라이브러리에 자동 임포트합니다.
 */

class EagleImporter {
    constructor(options = {}) {
        // 의존성 주입
        this.eagleUtils = window.eagleUtils || null;
        this.configManager = window.configManager || null;
        
        if (!this.eagleUtils || !this.configManager) {
            console.warn('EagleUtils 또는 ConfigManager가 로드되지 않았습니다.');
        }

        // Eagle API 사용 (공통 유틸리티를 통해)
        this.eagle = this.eagleUtils?.eagle || null;
        this.isEagleAvailable = this.eagleUtils?.isEagleAvailable || false;
        
        // 설정 초기화
        this.options = {
            enableStreaming: true,
            maxConcurrency: 1,
            enableFolderCreation: true,
            ...options
        };

        this.checkEagleAPI();
    }

    /**
     * Eagle API 사용 가능성 확인
     */
    checkEagleAPI() {
        if (!this.isEagleAvailable) {
            console.warn('Eagle API를 사용할 수 없습니다. EagleUtils를 통해 확인하세요.');
        } else {
            console.log('Eagle API 사용 가능 (EagleUtils 연동)');
        }
    }

    /**
     * Eagle 라이브러리에 파일 임포트
     * @param {Array} filePaths - 임포트할 파일 경로 배열
     * @param {string} sourceVideoName - 원본 비디오 이름
     * @param {Object} options - 임포트 옵션
     * @returns {Promise<Object>} 임포트 결과
     */
    async importToEagle(filePaths, sourceVideoName, options = {}) {
        try {
            if (!this.eagle) {
                console.log('Eagle API를 사용할 수 없어 임포트를 시뮬레이션합니다.');
                return this.simulateImport(filePaths, sourceVideoName);
            }

            console.log('Eagle 라이브러리에 파일 임포트 시작:', filePaths.length, '개의 파일');
            
            const importResults = [];
            const importOptions = {
                tags: this.generateTags(sourceVideoName),
                annotation: this.generateAnnotation(sourceVideoName),
                ...options
            };

            // 폴더 생성 (선택사항)
            let folderId = null;
            if (options.createFolder !== false) {
                folderId = await this.createVideoFolder(sourceVideoName);
            }

            // 각 파일을 Eagle에 임포트
            for (const filePath of filePaths) {
                try {
                    const importResult = await this.importSingleFile(filePath, importOptions, folderId);
                    importResults.push(importResult);
                } catch (error) {
                    console.error('파일 임포트 실패:', filePath, error);
                    importResults.push({
                        path: filePath,
                        success: false,
                        error: error.message
                    });
                }
            }

            const successCount = importResults.filter(r => r.success).length;
            
            console.log('Eagle 임포트 완료:', successCount, '/', filePaths.length, '개의 파일');
            
            // 임포트 후 임시 파일 정리
            if (options.cleanupAfterImport !== false) {
                await this.cleanupTempFiles(filePaths, importResults);
            }
            
            return {
                success: true,
                totalFiles: filePaths.length,
                successCount: successCount,
                failCount: filePaths.length - successCount,
                results: importResults,
                folderId: folderId
            };

        } catch (error) {
            console.error('Eagle 임포트 실패:', error);
            throw new Error('Eagle 임포트에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 임포트 후 임시 파일 정리
     * @param {Array} filePaths - 원본 파일 경로 배열
     * @param {Array} importResults - 임포트 결과 배열
     * @returns {Promise<Object>} 정리 결과
     */
    async cleanupTempFiles(filePaths, importResults) {
        const cleanupResults = {
            success: true,
            deletedFiles: 0,
            errors: []
        };

        try {
            const fs = this.eagleUtils?.getFS();
            if (!fs) {
                console.warn('파일 시스템 모듈을 사용할 수 없어 임시 파일 정리를 건너뜁니다.');
                return cleanupResults;
            }

            console.log('🧹 임포트 성공 파일의 임시 파일 정리 시작...');

            // 성공적으로 임포트된 파일들만 삭제
            for (const result of importResults) {
                if (result.success && result.path) {
                    try {
                        if (fs.existsSync(result.path)) {
                            fs.unlinkSync(result.path);
                            cleanupResults.deletedFiles++;
                            console.log('✅ 임시 파일 삭제:', result.path);
                        }
                    } catch (error) {
                        console.error('임시 파일 삭제 실패:', result.path, error);
                        cleanupResults.errors.push(`${result.path}: ${error.message}`);
                        cleanupResults.success = false;
                    }
                }
            }

            // 빈 디렉토리 정리 (임시 폴더가 비어있다면)
            await this.cleanupEmptyDirectories(filePaths);

            console.log(`✅ 임시 파일 정리 완료: ${cleanupResults.deletedFiles}개 파일 삭제`);
            return cleanupResults;

        } catch (error) {
            console.error('임시 파일 정리 실패:', error);
            cleanupResults.success = false;
            cleanupResults.errors.push(error.message);
            return cleanupResults;
        }
    }

    /**
     * 빈 디렉토리 정리
     * @param {Array} filePaths - 파일 경로 배열
     */
    async cleanupEmptyDirectories(filePaths) {
        try {
            const fs = this.eagleUtils?.getFS();
            const path = this.eagleUtils?.getPath();
            
            if (!fs || !path) return;

            // 유니크한 디렉토리 경로 추출
            const directories = [...new Set(filePaths.map(filePath => path.dirname(filePath)))];

            for (const dir of directories) {
                try {
                    if (fs.existsSync(dir)) {
                        const files = fs.readdirSync(dir);
                        if (files.length === 0) {
                            fs.rmdirSync(dir);
                            console.log('✅ 빈 디렉토리 삭제:', dir);
                        }
                    }
                } catch (error) {
                    // 디렉토리 삭제 실패는 조용히 무시 (비어있지 않거나 근본 디렉토리일 수 있음)
                    console.debug('디렉토리 삭제 건너뛰기:', dir, error.message);
                }
            }
        } catch (error) {
            console.error('빈 디렉토리 정리 실패:', error);
        }
    }

    /**
     * 폴더 통째로 Eagle에 임포트 (Phase 6: 폴더 임포트)
     * @param {string} folderPath - 임포트할 폴더 경로
     * @param {string} sourceVideoName - 원본 비디오 이름
     * @param {Object} options - 임포트 옵션
     * @param {function} progressCallback - 진행률 콜백
     * @returns {Promise<Object>} 임포트 결과
     */
    async importFolderToEagle(folderPath, sourceVideoName, options = {}, progressCallback = null) {
        try {
            if (!this.eagle) {
                console.log('Eagle API를 사용할 수 없어 임포트를 시뮬레이션합니다.');
                return this.simulateFolderImport(folderPath, sourceVideoName);
            }

            console.log('📁 폴더 통째로 Eagle 임포트:', folderPath);
            
            if (progressCallback) progressCallback(0.1, '폴더 임포트 준비 중...');
            
            // 폴더 존재 확인
            const fs = this.eagleUtils.getFS();
            if (!fs) {
                throw new Error('파일 시스템 모듈을 사용할 수 없습니다.');
            }
            
            if (!fs.existsSync(folderPath)) {
                console.error('폴더가 존재하지 않음:', folderPath);
                throw new Error(`폴더가 존재하지 않습니다: ${folderPath}`);
            }
            
            // 폴더 생성
            let folderId = null;
            if (options.createFolder !== false) {
                folderId = await this.createVideoFolder(sourceVideoName);
            }
            
            if (progressCallback) progressCallback(0.2, '폴더 내 파일 검색 중...');
            
            // 폴더 내 모든 파일 가져오기
            const path = this.eagleUtils?.getNodeModule('path');
            const files = fs.readdirSync(folderPath);
            console.log(`📂 폴더 내 전체 파일 수: ${files.length}개`);
            
            // 비디오 및 이미지 파일 필터링
            const supportedFiles = files.filter(file => {
                const ext = path ? path.extname(file).toLowerCase() : ('.' + file.split('.').pop()).toLowerCase();
                // 비디오 파일
                const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv'];
                // 이미지 파일
                const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
                
                return [...videoExtensions, ...imageExtensions].includes(ext);
            });
            
            console.log(`📁 폴더에서 ${supportedFiles.length}개 파일 발견`);
            console.log('파일 목록:', supportedFiles.slice(0, 5), supportedFiles.length > 5 ? `... 총 ${supportedFiles.length}개` : '');
            
            if (supportedFiles.length === 0) {
                console.log('💭 임포트할 수 있는 파일이 없습니다.');
                return {
                    success: true,
                    totalFiles: 0,
                    successCount: 0,
                    failCount: 0,
                    results: [],
                    folderId: folderId,
                    metadata: {
                        method: 'folder-import-empty',
                        folderPath: folderPath
                    }
                };
            }
            
            // 모든 파일이 준비될 때까지 대기 (옵션)
            if (options.waitForAllFiles) {
                console.log('⏳ 모든 파일이 준비될 때까지 대기 중...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            if (progressCallback) progressCallback(0.3, `${supportedFiles.length}개 파일을 한 번에 임포트 시작...`);
            
            // 파일 경로 배열 생성
            const filePaths = supportedFiles.map(file => {
                return path ? path.join(folderPath, file) : `${folderPath}/${file}`;
            });
            
            // 한 번에 모든 파일 임포트
            const importOptions = {
                tags: this.generateTags(sourceVideoName),
                annotation: this.generateAnnotation(sourceVideoName),
                ...options
            };
            
            if (folderId) {
                importOptions.folders = [folderId];
            }
            
            console.log(`🚀 ${filePaths.length}개 파일을 한 번에 Eagle에 임포트`);
            
            // 배치 임포트 시도
            const results = [];
            const batchSize = options.batchSize || 20; // 기본값 20개
            
            console.log(`📦 전체 ${filePaths.length}개 파일을 ${batchSize}개씩 배치로 처리`);
            
            for (let i = 0; i < filePaths.length; i += batchSize) {
                const batch = filePaths.slice(i, i + batchSize);
                const batchProgress = (i / filePaths.length) * 0.6 + 0.3;
                
                if (progressCallback) {
                    progressCallback(batchProgress, `배치 ${Math.floor(i/batchSize) + 1}/${Math.ceil(filePaths.length/batchSize)} 처리 중...`);
                }
                
                console.log(`📦 배치 ${Math.floor(i/batchSize) + 1}: ${batch.length}개 파일`);
                
                // 각 파일을 빠르게 임포트 (병렬 처리)
                const batchPromises = batch.map(async (filePath, index) => {
                    try {
                        console.log(`🚀 [${Math.floor(i/batchSize) + 1}/${Math.ceil(filePaths.length/batchSize)}] 배치 내 ${index + 1}/${batch.length}: ${filePath.split('/').pop()}`);
                        const result = await this.importSingleFile(filePath, importOptions, folderId);
                        console.log(`✅ [${Math.floor(i/batchSize) + 1}/${Math.ceil(filePaths.length/batchSize)}] 완료 ${index + 1}/${batch.length}: ${result.fileName}`);
                        return result;
                    } catch (error) {
                        console.error('파일 임포트 실패:', filePath, error);
                        return {
                            path: filePath,
                            success: false,
                            error: error.message,
                            fileName: this.eagleUtils?.getBaseName(filePath) || filePath.split('/').pop()
                        };
                    }
                });
                
                // 현재 배치 완료 대기
                console.log(`⏳ 배치 ${Math.floor(i/batchSize) + 1} Promise.all 대기 시작...`);
                const batchResults = await Promise.all(batchPromises);
                console.log(`🎉 배치 ${Math.floor(i/batchSize) + 1} Promise.all 완료!`);
                results.push(...batchResults);
                
                console.log(`✅ 배치 ${Math.floor(i/batchSize) + 1} 완료: ${batchResults.length}개 파일 처리`);
                console.log(`📦 누적 처리 파일 수: ${results.length}/${filePaths.length}`);
                
                // 배치 간 짧은 대기 (Eagle API 부하 방지)
                if (i + batchSize < filePaths.length) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            
            const successCount = results.filter(r => r.success).length;
            
            if (progressCallback) progressCallback(1.0, `✅ ${successCount}개 파일 임포트 완료!`);
            
            console.log(`🎉 폴더 임포트 완료: ${successCount}/${filePaths.length}개`);
            
            return {
                success: true,
                totalFiles: filePaths.length,
                successCount: successCount,
                failCount: filePaths.length - successCount,
                results: results,
                folderId: folderId,
                metadata: {
                    method: 'batch-folder-import',
                    folderPath: folderPath,
                    batchSize: batchSize
                }
            };
            
        } catch (error) {
            console.error('폴더 임포트 실패:', error);
            throw new Error('폴더 임포트에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 단일 파일 임포트
     * @param {string} filePath - 파일 경로
     * @param {Object} importOptions - 임포트 옵션
     * @param {string} folderId - 폴더 ID (선택사항)
     * @returns {Promise<Object>} 임포트 결과
     */
    async importSingleFile(filePath, importOptions, folderId = null) {
        try {
            const path = this.eagleUtils?.getNodeModule('path');
            let fileName, fileExt;
            
            if (path) {
                fileName = path.basename(filePath);
                fileExt = path.extname(filePath);
            } else {
                // 폴백: 문자열 처리
                const lastSlash = filePath.lastIndexOf('/');
                fileName = filePath.substring(lastSlash + 1);
                const lastDot = fileName.lastIndexOf('.');
                fileExt = lastDot > -1 ? fileName.substring(lastDot) : '';
            }
            
            const fileStats = this.eagleUtils.getFileStats(filePath);
            
            // Eagle API 정확한 형식으로 옵션 구성
            const addOptions = {
                name: importOptions.name || fileName,
                tags: importOptions.tags || [],
                annotation: importOptions.annotation || '',
                website: importOptions.website || ''
            };
            
            // 폴더 ID가 있는 경우 folders 배열에 추가
            if (folderId) {
                addOptions.folders = [folderId];
            }
            
            console.log('Eagle API 호출:', {
                filePath: filePath,
                options: addOptions
            });

            // Eagle API 정확한 방식으로 아이템 추가
            const itemId = await this.eagle.item.addFromPath(filePath, addOptions);
            
            console.log('파일 임포트 완료:', fileName, '-> Eagle ID:', itemId);
            
            // 성공적으로 임포트된 후에는 원본 파일 경로를 반환하여 나중에 정리할 수 있도록 함
            
            return {
                path: filePath,
                success: true,
                eagleId: itemId,
                fileName: fileName,
                fileSize: fileStats.size
            };

        } catch (error) {
            console.error('단일 파일 임포트 실패:', filePath, error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack
            });
            
            return {
                path: filePath,
                success: false,
                error: error.message,
                fileName: this.eagleUtils?.getBaseName(filePath) || filePath.split('/').pop()
            };
        }
    }

    /**
     * 비디오 전용 폴더 생성
     * @param {string} videoName - 비디오 이름
     * @returns {Promise<string>} 생성된 폴더 ID
     */
    async createVideoFolder(videoName) {
        try {
            // AnalyzedClip 부모 폴더 확인/생성
            const parentFolderName = 'AnalyzedClip';
            let parentFolderId = null;
            
            // 부모 폴더 확인
            try {
                // 모든 폴더 가져오기
                const allFolders = await this.eagle.folder.get();
                
                // AnalyzedClips 폴더 찾기
                const parentFolder = allFolders.find(folder => folder.name === parentFolderName);
                
                if (parentFolder) {
                    parentFolderId = parentFolder.id;
                    console.log('AnalyzedClip 폴더 발견:', parentFolderId);
                } else {
                    // 부모 폴더 생성
                    const createdParent = await this.eagle.folder.create({
                        name: parentFolderName,
                        description: 'Video Processor로 분석된 모든 클립들'
                    });
                    parentFolderId = createdParent.id;
                    console.log('AnalyzedClip 폴더 생성:', parentFolderId);
                }
            } catch (error) {
                console.error('AnalyzedClip 폴더 처리 실패:', error);
                // 부모 폴더 없이 계속
            }
            
            // 하위 폴더 생성 (동영상 이름)
            const folderName = videoName;
            
            console.log('하위 폴더 생성 시도:', folderName, '부모 폴더:', parentFolderId);
            
            // 부모 폴더가 있는 경우에만 기존 폴더 확인
            if (parentFolderId) {
                try {
                    // 부모 폴더의 하위 폴더들 가져오기
                    const allFolders = await this.eagle.folder.get();
                    const subFolder = allFolders.find(folder => 
                        folder.name === folderName && folder.parent === parentFolderId
                    );
                    
                    if (subFolder) {
                        console.log('기존 하위 폴더 사용:', folderName, '-> ID:', subFolder.id);
                        return subFolder.id;
                    }
                } catch (searchError) {
                    console.log('기존 폴더 검색 실패, 새 폴더 생성 진행:', searchError.message);
                }
            }
            
            // Eagle API 정확한 형식으로 새 폴더 생성
            const folderOptions = {
                name: folderName,
                description: `Video Processor로 추출된 콘텐츠\n원본: ${videoName}\n처리일: ${new Date().toLocaleString('ko-KR')}`
            };
            
            // 부모 폴더가 있으면 parent 속성 추가
            if (parentFolderId) {
                folderOptions.parent = parentFolderId;
            }
            
            console.log('Eagle folder.create 호출:', folderOptions);
            
            // 폴더 생성
            const createdFolder = await this.eagle.folder.create(folderOptions);
            
            console.log('새 폴더 생성 성공:', {
                name: folderName,
                id: createdFolder.id,
                parent: parentFolderId
            });
            
            return createdFolder.id;

        } catch (error) {
            console.error('폴더 생성 실패:', {
                videoName: videoName,
                error: error.message,
                stack: error.stack
            });
            
            // 폴더 생성 실패 시에도 임포트는 계속 진행 (null 반환)
            console.log('폴더 없이 임포트 진행');
            return null;
        }
    }

    /**
     * 태그 생성
     * @param {string} videoName - 비디오 이름
     * @returns {Array} 태그 배열
     */
    generateTags(videoName, type = 'unknown') {
        const baseTags = [
            'video-processor',
            'extracted-content',
            'cut-detection'
        ];
        
        // 파일 타입별 태그
        if (type === 'frame') {
            baseTags.push('frame-extract', 'thumbnail', 'preview');
        } else if (type === 'clip') {
            baseTags.push('clip-extract', 'scene-cut', 'video-segment');
        }
        
        // 비디오 이름에서 추가 태그 생성
        const videoTags = [
            `source:${videoName}`,
            `processed:${new Date().toISOString().split('T')[0]}` // YYYY-MM-DD 형태
        ];
        
        return [...baseTags, ...videoTags];
    }

    /**
     * 주석 생성
     * @param {string} videoName - 비디오 이름
     * @returns {string} 주석 내용
     */
    generateAnnotation(videoName, type = 'unknown', metadata = {}) {
        const timestamp = new Date().toLocaleString('ko-KR');
        
        let description = '';
        if (type === 'frame') {
            description = '자동 자른 검출로 추출된 대표 프레임';
        } else if (type === 'clip') {
            description = '자동 자른 검출로 추출된 장면 클립';
        } else {
            description = 'Video Processor로 처리된 파일';
        }
        
        let annotation = `${description}\n원본 비디오: ${videoName}\n추출 일시: ${timestamp}`;
        
        // 추가 메타데이터
        if (metadata.duration) {
            annotation += `\n재생 시간: ${metadata.duration}초`;
        }
        if (metadata.sceneIndex !== undefined) {
            annotation += `\n장면 순서: ${metadata.sceneIndex + 1}번째`;
        }
        if (metadata.timestamp) {
            annotation += `\n비디오 시점: ${metadata.timestamp}`;
        }
        
        return annotation;
    }

    /**
     * 임포트 시뮬레이션 (개발 환경용)
     * @param {Array} filePaths - 파일 경로 배열
     * @param {string} sourceVideoName - 원본 비디오 이름
     * @returns {Object} 시뮬레이션 결과
     */
    simulateImport(filePaths, sourceVideoName) {
        console.log('Eagle 임포트 시뮬레이션 실행');
        
        const results = filePaths.map((filePath, index) => {
            const fileName = this.eagleUtils?.getBaseName(filePath) || filePath.split('/').pop();
            const fileStats = this.eagleUtils.fileExists(filePath) ? 
                this.eagleUtils.getFileStats(filePath) : { size: 0 };
            
            return {
                path: filePath,
                success: true,
                eagleId: `sim_${Date.now()}_${index}`,
                fileName: fileName,
                fileSize: fileStats.size
            };
        });
        
        return {
            success: true,
            totalFiles: filePaths.length,
            successCount: filePaths.length,
            failCount: 0,
            results: results,
            folderId: 'sim_folder_' + Date.now()
        };
    }

    /**
     * 폴더 임포트 시뮬레이션 (개발 환경용)
     * @param {string} folderPath - 폴더 경로
     * @param {string} sourceVideoName - 원본 비디오 이름
     * @returns {Object} 시뮬레이션 결과
     */
    simulateFolderImport(folderPath, sourceVideoName) {
        console.log('폴더 임포트 시뮬레이션 실행');
        
        const path = this.eagleUtils?.getNodeModule('path');
        const fs = this.eagleUtils.getFS();
        if (!fs) {
            return { success: false, error: 'File system module not available' };
        }
        
        const files = fs.readdirSync(folderPath);
        const supportedFiles = files.filter(file => {
            const ext = path ? path.extname(file).toLowerCase() : ('.' + file.split('.').pop()).toLowerCase();
            const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv'];
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
            return [...videoExtensions, ...imageExtensions].includes(ext);
        });
        
        const results = supportedFiles.map((file, index) => ({
            path: path ? path.join(folderPath, file) : `${folderPath}/${file}`,
            success: true,
            eagleId: `sim_${Date.now()}_${index}`,
            fileName: file
        }));
        
        return {
            success: true,
            totalFiles: supportedFiles.length,
            successCount: supportedFiles.length,
            failCount: 0,
            results: results,
            folderId: 'sim_folder_' + Date.now(),
            metadata: {
                method: 'folder-import-simulation',
                folderPath: folderPath
            }
        };
    }
}

// 브라우저 환경에서 전역 객체로 등록
window.EagleImporter = EagleImporter;