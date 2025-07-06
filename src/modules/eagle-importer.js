/**
 * EagleImporter - Eagle 라이브러리 연동 모듈 (성능 개선 버전)
 * 추출된 파일들을 Eagle 라이브러리에 자동 임포트합니다.
 * Phase 5: 점진적 처리 (스트리밍 임포트) 지원
 */

// 브라우저 환경에서 필요한 전역 변수들 (eagle-importer 전용)
const fs_ei = window.require ? window.require('fs') : null;
const path_ei = window.require ? window.require('path') : null;

class EagleImporter {
    constructor() {
        this.eagle = typeof eagle !== 'undefined' ? eagle : null;
        this.checkEagleAPI();
    }

    /**
     * Eagle API 사용 가능성 확인
     */
    checkEagleAPI() {
        if (!this.eagle) {
            console.warn('Eagle API를 사용할 수 없습니다. 개발 환경에서 실행 중일 수 있습니다.');
        } else {
            console.log('Eagle API 사용 가능 - 버전:', this.eagle.app.version);
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
     * 스트리밍 임포트 (Phase 5: 점진적 처리)
     * 완성되는 대로 즉시 Eagle에 임포트
     * @param {Array} filePaths - 파일 경로 배열
     * @param {string} sourceVideoName - 원본 비디오 이름
     * @param {Object} options - 임포트 옵션
     * @param {function} progressCallback - 진행률 콜백
     * @param {function} itemCallback - 개별 아이템 완료 콜백
     * @returns {Promise<Object>} 임포트 결과
     */
    async importWithStreaming(filePaths, sourceVideoName, options = {}, progressCallback = null, itemCallback = null) {
        try {
            if (!this.eagle) {
                if (progressCallback) progressCallback(1.0, '시뮬레이션 완료');
                return this.simulateImport(filePaths, sourceVideoName);
            }

            console.log('🔄 스트리밍 임포트 시작:', filePaths.length, '개의 파일');
            
            const importResults = [];
            const importOptions = {
                tags: this.generateTags(sourceVideoName),
                annotation: this.generateAnnotation(sourceVideoName),
                ...options
            };

            // 폴더 생성
            let folderId = null;
            if (options.createFolder !== false) {
                folderId = await this.createVideoFolder(sourceVideoName);
            }

            // 동시 임포트 수 제한 (너무 많으면 Eagle 부하)
            const maxConcurrency = 1; // 3에서 1로 줄임 (하나씩 순차 처리)
            const batches = [];
            
            for (let i = 0; i < filePaths.length; i += maxConcurrency) {
                batches.push(filePaths.slice(i, i + maxConcurrency));
            }
            
            let processedCount = 0;
            
            // 각 배치를 순차적으로 처리, 배치 내에서는 병렬 처리
            for (const batch of batches) {
                const batchPromises = batch.map(async (filePath) => {
                    try {
                        // 파일 존재 확인
                        if (!fs_ei || !fs_ei.existsSync(filePath)) {
                            console.error('파일이 존재하지 않음:', filePath);
                            return {
                                path: filePath,
                                success: false,
                                error: 'File does not exist',
                                fileName: path_ei ? path_ei.basename(filePath) : filePath.split('/').pop()
                            };
                        }
                        
                        // 파일 크기 확인
                        const stats = fs_ei.statSync(filePath);
                        if (stats.size < 1000) { // 1KB 미만
                            console.error('파일 크기가 너무 작음:', filePath, stats.size, 'bytes');
                            return {
                                path: filePath,
                                success: false,
                                error: `File too small: ${stats.size} bytes`,
                                fileName: path_ei ? path_ei.basename(filePath) : filePath.split('/').pop()
                            };
                        }
                        
                        // 파일 타입별 태그 추가
                        const fileSpecificTags = this.addFileTypeSpecificTags(filePath, importOptions.tags);
                        const fileImportOptions = {
                            ...importOptions,
                            tags: fileSpecificTags
                        };
                        
                        // 중복 체크 스킵 옵션 확인
                        if (options.skipDuplicateCheck) {
                            console.log('🚀 중복 체크 스킵 - 빠른 임포트 진행');
                        } else if (!options.allowDuplicates) {
                            const isDuplicate = await this.checkDuplicateFile(filePath);
                            if (isDuplicate) {
                                console.log('중복 파일 스킵:', path.basename(filePath));
                                return {
                                    path: filePath,
                                    success: false,
                                    error: 'Duplicate file skipped',
                                    fileName: path_ei ? path_ei.basename(filePath) : filePath.split('/').pop()
                                };
                            }
                        }
                        
                        const result = await this.importSingleFile(filePath, fileImportOptions, folderId);
                        
                        // 개별 아이템 완료 콜백 호출
                        if (itemCallback && result.success) {
                            itemCallback(result);
                        }
                        
                        return result;
                        
                    } catch (error) {
                        console.error('파일 임포트 실패:', filePath, error);
                        return {
                            path: filePath,
                            success: false,
                            error: error.message,
                            fileName: path.basename(filePath)
                        };
                    }
                });
                
                // 현재 배치 완료 대기
                const batchResults = await Promise.allSettled(batchPromises);
                
                // 결과 수집
                batchResults.forEach((result) => {
                    if (result.status === 'fulfilled') {
                        importResults.push(result.value);
                    } else {
                        importResults.push({
                            path: 'unknown',
                            success: false,
                            error: result.reason?.message || 'Unknown error',
                            fileName: 'unknown'
                        });
                    }
                    
                    processedCount++;
                    
                    // 진행률 업데이트
                    if (progressCallback) {
                        const progress = processedCount / filePaths.length;
                        const fileName = result.status === 'fulfilled' && result.value 
                            ? result.value.fileName 
                            : '알 수 없음';
                        progressCallback(progress, `${fileName} 완료 (${processedCount}/${filePaths.length})`);
                    }
                });
                
                // 배치 간 충분한 대기 (Eagle이 처리할 시간 확보)
                if (batches.indexOf(batch) < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 200ms에서 1000ms로 증가
                }
            }

            const successCount = importResults.filter(r => r.success).length;
            
            console.log('🔄 스트리밍 임포트 완료:', successCount, '/', filePaths.length, '개의 파일');
            
            return {
                success: true,
                totalFiles: filePaths.length,
                successCount: successCount,
                failCount: filePaths.length - successCount,
                results: importResults,
                folderId: folderId,
                metadata: {
                    concurrency: maxConcurrency
                }
            };

        } catch (error) {
            console.error('스트리밍 임포트 실패:', error);
            throw new Error('스트리밍 임포트에 실패했습니다: ' + error.message);
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
            const fileName = path_ei ? path_ei.basename(filePath) : filePath.split('/').pop();
            const fileExt = path_ei ? path_ei.extname(filePath) : '.' + filePath.split('.').pop();
            const fileStats = fs_ei ? fs_ei.statSync(filePath) : { size: 0 };
            
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
                fileName: path_ei ? path_ei.basename(filePath) : filePath.split('/').pop()
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
            // AnalyzedClips 부모 폴더 확인/생성
            const parentFolderName = 'AnalyzedClips';
            let parentFolderId = null;
            
            // 부모 폴더 확인
            try {
                // 모든 폴더 가져오기
                const allFolders = await this.eagle.folder.get();
                
                // AnalyzedClips 폴더 찾기
                const parentFolder = allFolders.find(folder => folder.name === parentFolderName);
                
                if (parentFolder) {
                    parentFolderId = parentFolder.id;
                    console.log('AnalyzedClips 폴더 발견:', parentFolderId);
                } else {
                    // 부모 폴더 생성
                    const createdParent = await this.eagle.folder.create({
                        name: parentFolderName,
                        description: 'Video Processor로 분석된 모든 클립들'
                    });
                    parentFolderId = createdParent.id;
                    console.log('AnalyzedClips 폴더 생성:', parentFolderId);
                }
            } catch (error) {
                console.error('AnalyzedClips 폴더 처리 실패:', error);
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
    generateTags(videoName) {
        const baseTags = [
            'video-processor',
            'extracted-content',
            'cut-detection'
        ];
        
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
    generateAnnotation(videoName) {
        const timestamp = new Date().toLocaleString('ko-KR');
        return `Video Processor for Eagle로 추출됨\n원본 비디오: ${videoName}\n추출 일시: ${timestamp}`;
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
            const fileName = path_ei ? path_ei.basename(filePath) : filePath.split('/').pop();
            const fileStats = fs_ei && fs_ei.existsSync(filePath) ? fs_ei.statSync(filePath) : { size: 0 };
            
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
     * 배치 임포트 (여러 파일을 한 번에 처리)
     * @param {Array} filePaths - 파일 경로 배열
     * @param {string} sourceVideoName - 원본 비디오 이름
     * @param {Object} options - 임포트 옵션
     * @param {number} batchSize - 배치 크기
     * @returns {Promise<Object>} 임포트 결과
     */
    async batchImport(filePaths, sourceVideoName, options = {}, batchSize = 10) {
        try {
            if (!this.eagle) {
                return this.simulateImport(filePaths, sourceVideoName);
            }

            console.log('배치 임포트 시작:', filePaths.length, '개의 파일, 배치 크기:', batchSize);
            
            const allResults = [];
            const importOptions = {
                tags: this.generateTags(sourceVideoName),
                annotation: this.generateAnnotation(sourceVideoName),
                ...options
            };

            // 폴더 생성
            let folderId = null;
            if (options.createFolder !== false) {
                folderId = await this.createVideoFolder(sourceVideoName);
            }

            // 배치 단위로 처리
            for (let i = 0; i < filePaths.length; i += batchSize) {
                const batch = filePaths.slice(i, i + batchSize);
                console.log(`배치 ${Math.floor(i / batchSize) + 1} 처리 중: ${batch.length}개 파일`);
                
                const batchPromises = batch.map(filePath => 
                    this.importSingleFile(filePath, importOptions, folderId)
                        .catch(error => ({
                            path: filePath,
                            success: false,
                            error: error.message
                        }))
                );
                
                const batchResults = await Promise.all(batchPromises);
                allResults.push(...batchResults);
                
                // 배치 간 짧은 대기 (API 부하 방지)
                if (i + batchSize < filePaths.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            const successCount = allResults.filter(r => r.success).length;
            
            console.log('배치 임포트 완료:', successCount, '/', filePaths.length, '개의 파일');
            
            return {
                success: true,
                totalFiles: filePaths.length,
                successCount: successCount,
                failCount: filePaths.length - successCount,
                results: allResults,
                folderId: folderId
            };

        } catch (error) {
            console.error('배치 임포트 실패:', error);
            throw new Error('배치 임포트에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 파일 타입별 태그 추가
     * @param {string} filePath - 파일 경로
     * @param {Array} baseTags - 기본 태그 배열
     * @returns {Array} 확장된 태그 배열
     */
    addFileTypeSpecificTags(filePath, baseTags) {
        const ext = path_ei ? path_ei.extname(filePath).toLowerCase() : ('.' + filePath.split('.').pop()).toLowerCase();
        const fileName = path_ei ? path_ei.basename(filePath, ext) : filePath.split('/').pop().replace(ext, '');
        
        const additionalTags = [...baseTags];
        
        // 파일 타입별 태그 추가
        if (['.jpg', '.jpeg', '.png'].includes(ext)) {
            additionalTags.push('extracted-frame', 'image');
            
            // 프레임 번호 추출
            const frameMatch = fileName.match(/frame_(\d+)/);
            if (frameMatch) {
                additionalTags.push(`frame-${frameMatch[1]}`);
            }
        } else if (['.mp4', '.mov', '.avi'].includes(ext)) {
            additionalTags.push('extracted-clip', 'video');
            
            // 클립 번호 추출
            const clipMatch = fileName.match(/clip_(\d+)/);
            if (clipMatch) {
                additionalTags.push(`clip-${clipMatch[1]}`);
            }
        }
        
        return additionalTags;
    }

    /**
     * 중복 파일 확인
     * @param {string} filePath - 파일 경로
     * @returns {Promise<boolean>} 중복 여부
     */
    async checkDuplicateFile(filePath) {
        try {
            if (!this.eagle) {
                return false;
            }
            
            const fileName = path_ei ? path_ei.basename(filePath) : filePath.split('/').pop();
            console.log('중복 파일 확인:', fileName);
            
            // Eagle API를 사용하여 같은 이름의 파일 검색
            const existingItems = await this.eagle.item.get({
                keywords: [fileName] // 파일명으로 검색
            });
            
            if (existingItems && existingItems.length > 0) {
                // 정확한 파일명 매치 확인
                const exactMatch = existingItems.find(item => item.name === fileName);
                if (exactMatch) {
                    console.log('중복 파일 발견:', fileName);
                    return true;
                }
            }
            
            return false;
            
        } catch (error) {
            console.error('중복 파일 확인 실패:', error);
            // 에러 시 false 반환 (임포트 계속 진행)
            return false;
        }
    }

    /**
     * 임포트 진행률 추적
     * @param {Array} filePaths - 파일 경로 배열
     * @param {string} sourceVideoName - 원본 비디오 이름
     * @param {Object} options - 임포트 옵션
     * @param {function} progressCallback - 진행률 콜백
     * @returns {Promise<Object>} 임포트 결과
     */
    async importWithProgress(filePaths, sourceVideoName, options = {}, progressCallback = null) {
        try {
            if (!this.eagle) {
                if (progressCallback) progressCallback(1.0, '시뮬레이션 완료');
                return this.simulateImport(filePaths, sourceVideoName);
            }

            console.log('진행률 추적 임포트 시작:', filePaths.length, '개의 파일');
            
            const importResults = [];
            const importOptions = {
                tags: this.generateTags(sourceVideoName),
                annotation: this.generateAnnotation(sourceVideoName),
                ...options
            };

            // 폴더 생성
            let folderId = null;
            if (options.createFolder !== false) {
                folderId = await this.createVideoFolder(sourceVideoName);
            }

            // 각 파일을 순차적으로 임포트
            for (let i = 0; i < filePaths.length; i++) {
                const filePath = filePaths[i];
                
                try {
                    // 중복 확인 (옵션이 허용하지 않는 경우에만)
                    if (!options.allowDuplicates) {
                        const isDuplicate = await this.checkDuplicateFile(filePath);
                        if (isDuplicate) {
                            console.log('중복 파일 스킵:', path.basename(filePath));
                            importResults.push({
                                path: filePath,
                                success: false,
                                error: 'Duplicate file skipped',
                                fileName: path_ei ? path_ei.basename(filePath) : filePath.split('/').pop()
                            });
                            
                            // 진행률 업데이트
                            if (progressCallback) {
                                const progress = (i + 1) / filePaths.length;
                                const fileName = path_ei ? path_ei.basename(filePath) : filePath.split('/').pop();
                                progressCallback(progress, `${fileName} 중복으로 스킵 (${i + 1}/${filePaths.length})`);
                            }
                            
                            continue;
                        }
                    }
                    
                    // 파일 타입별 태그 추가
                    const fileSpecificTags = this.addFileTypeSpecificTags(filePath, importOptions.tags);
                    const fileImportOptions = {
                        ...importOptions,
                        tags: fileSpecificTags
                    };
                    
                    const importResult = await this.importSingleFile(filePath, fileImportOptions, folderId);
                    importResults.push(importResult);
                    
                    // 진행률 업데이트
                    if (progressCallback) {
                        const progress = (i + 1) / filePaths.length;
                        const fileName = path_ei ? path_ei.basename(filePath) : filePath.split('/').pop();
                        progressCallback(progress, `${fileName} 임포트 완료 (${i + 1}/${filePaths.length})`);
                    }
                    
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
            
            console.log('진행률 추적 임포트 완료:', successCount, '/', filePaths.length, '개의 파일');
            
            return {
                success: true,
                totalFiles: filePaths.length,
                successCount: successCount,
                failCount: filePaths.length - successCount,
                results: importResults,
                folderId: folderId
            };

        } catch (error) {
            console.error('진행률 추적 임포트 실패:', error);
            throw new Error('진행률 추적 임포트에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 임포트 결과 요약 생성
     * @param {Object} importResult - 임포트 결과
     * @returns {string} 요약 문자열
     */
    generateImportSummary(importResult) {
        const { totalFiles, successCount, failCount, results } = importResult;
        
        let summary = `\n=== Eagle 임포트 결과 요약 ===\n`;
        summary += `총 파일 수: ${totalFiles}개\n`;
        summary += `성공: ${successCount}개\n`;
        summary += `실패: ${failCount}개\n`;
        
        if (failCount > 0) {
            summary += `\n실패한 파일들:\n`;
            results.filter(r => !r.success).forEach(r => {
                const fileName = path_ei ? path_ei.basename(r.path) : r.path.split('/').pop();
                summary += `  - ${fileName}: ${r.error}\n`;
            });
        }
        
        summary += `\n================================\n`;
        
        return summary;
    }

    /**
     * 임시 파일 정리 후 Eagle 임포트
     * @param {Array} filePaths - 파일 경로 배열
     * @param {string} sourceVideoName - 원본 비디오 이름
     * @param {Object} options - 임포트 옵션
     * @returns {Promise<Object>} 임포트 결과
     */
    async importAndCleanup(filePaths, sourceVideoName, options = {}) {
        try {
            const importResult = await this.importWithProgress(
                filePaths, 
                sourceVideoName, 
                options,
                options.progressCallback
            );
            
            // 임포트 완료 후 임시 파일 정리 (옵션)
            if (options.cleanup !== false) {
                await this.cleanupTempFiles(filePaths);
            }
            
            return importResult;
            
        } catch (error) {
            console.error('임포트 및 정리 실패:', error);
            throw error;
        }
    }

    /**
     * 임시 파일 정리
     * @param {Array} filePaths - 정리할 파일 경로 배열
     */
    async cleanupTempFiles(filePaths) {
        console.log('임시 파일 정리 시작:', filePaths.length, '개의 파일');
        
        let cleanedCount = 0;
        
        for (const filePath of filePaths) {
            try {
                if (fs_ei && fs_ei.existsSync(filePath)) {
                    fs_ei.unlinkSync(filePath);
                    cleanedCount++;
                }
            } catch (error) {
                console.error('파일 정리 실패:', filePath, error);
            }
        }
        
        console.log('임시 파일 정리 완료:', cleanedCount, '개의 파일');
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
            
            // 폴더 생성
            let folderId = null;
            if (options.createFolder !== false) {
                folderId = await this.createVideoFolder(sourceVideoName);
            }
            
            if (progressCallback) progressCallback(0.2, '폴더 내 파일 검색 중...');
            
            // 폴더 내 모든 파일 가져오기
            const files = fs_ei.readdirSync(folderPath);
            console.log(`📂 폴더 내 전체 파일 수: ${files.length}개`);
            
            const videoFiles = files.filter(file => {
                const ext = path_ei.extname(file).toLowerCase();
                return ['.mp4', '.mov', '.avi', '.mkv'].includes(ext);
            });
            
            console.log(`📁 폴더에서 ${videoFiles.length}개 비디오 파일 발견`);
            console.log('비디오 파일 목록:', videoFiles.slice(0, 5), videoFiles.length > 5 ? `... 총 ${videoFiles.length}개` : '');
            
            // 모든 파일이 준비될 때까지 대기 (옵션)
            if (options.waitForAllFiles) {
                console.log('⏳ 모든 파일이 준비될 때까지 대기 중...');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            if (progressCallback) progressCallback(0.3, `${videoFiles.length}개 파일을 한 번에 임포트 시작...`);
            
            // 파일 경로 배열 생성
            const filePaths = videoFiles.map(file => path_ei.join(folderPath, file));
            
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
            const batchSize = options.batchSize || 20; // 기본값을 20으로 줄이고 옵션으로 조절 가능
            
            console.log(`📦 전체 ${filePaths.length}개 파일을 ${batchSize}개씩 배치로 처리`);
            
            for (let i = 0; i < filePaths.length; i += batchSize) {
                const batch = filePaths.slice(i, i + batchSize);
                const batchProgress = (i / filePaths.length) * 0.6 + 0.3;
                
                if (progressCallback) {
                    progressCallback(batchProgress, `배치 ${Math.floor(i/batchSize) + 1}/${Math.ceil(filePaths.length/batchSize)} 처리 중...`);
                }
                
                console.log(`📦 배치 ${Math.floor(i/batchSize) + 1}: ${batch.length}개 파일`);
                
                // 각 파일을 빠르게 임포트 (병렬 처리)
                const batchPromises = batch.map(async (filePath) => {
                    try {
                        const result = await this.importSingleFile(filePath, importOptions, folderId);
                        return result;
                    } catch (error) {
                        console.error('파일 임포트 실패:', filePath, error);
                        return {
                            path: filePath,
                            success: false,
                            error: error.message,
                            fileName: path_ei.basename(filePath)
                        };
                    }
                });
                
                // 현재 배치 완료 대기
                const batchResults = await Promise.all(batchPromises);
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
     * 폴더 임포트 시뮬레이션 (개발 환경용)
     * @param {string} folderPath - 폴더 경로
     * @param {string} sourceVideoName - 원본 비디오 이름
     * @returns {Object} 시뮬레이션 결과
     */
    simulateFolderImport(folderPath, sourceVideoName) {
        console.log('폴더 임포트 시뮬레이션 실행');
        
        const files = fs_ei ? fs_ei.readdirSync(folderPath) : [];
        const videoFiles = files.filter(file => {
            const ext = (path_ei ? path_ei.extname(file) : '.' + file.split('.').pop()).toLowerCase();
            return ['.mp4', '.mov', '.avi', '.mkv'].includes(ext);
        });
        
        const results = videoFiles.map((file, index) => ({
            path: path_ei ? path_ei.join(folderPath, file) : `${folderPath}/${file}`,
            success: true,
            eagleId: `sim_${Date.now()}_${index}`,
            fileName: file
        }));
        
        return {
            success: true,
            totalFiles: videoFiles.length,
            successCount: videoFiles.length,
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