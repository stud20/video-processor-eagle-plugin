/**
 * SmartFrameSelector - 스마트 프레임 선별 모듈
 * 추출된 프레임들을 분석하여 의미있는 대표 이미지를 선별합니다.
 */

class SmartFrameSelector {
    constructor(options = {}) {
        // 의존성 주입
        this.eagleUtils = window.eagleUtils || null;
        this.configManager = window.configManager || null;
        
        // 설정 초기화
        this.options = {
            targetCount: 10,           // 목표 선별 개수
            similarityThreshold: 0.85, // 유사도 임계값 (0-1)
            enableHistogramAnalysis: true,
            enableColorAnalysis: true,
            enableTextureAnalysis: true,
            clusteringMethod: 'hierarchical', // 'hierarchical' | 'kmeans'
            diversityBoost: 0.3,      // 다양성 가중치
            ...options
        };

        this.canvas = null;
        this.ctx = null;
        this.initialized = false;
    }

    /**
     * 파일 경로에서 이미지 로드 (최적화된 버전)
     * @param {string} imagePath - 이미지 경로
     * @param {HTMLImageElement} img - 이미지 엘리먼트
     */
    loadImageFromPathOptimized(imagePath, img) {
        try {
            const fs = this.eagleUtils?.getFS();
            if (fs && fs.existsSync(imagePath)) {
                // M4 MAX의 전용 메모리를 활용한 고속 로딩
                const buffer = fs.readFileSync(imagePath);
                const base64 = buffer.toString('base64');
                const mimeType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
                
                // 데이터 URL로 직접 로드 (전용 메모리 활용)
                img.src = `data:${mimeType};base64,${base64}`;
            } else {
                // 폴백: 직접 경로 사용
                img.src = `file://${imagePath}`;
            }
        } catch (error) {
            console.warn('이미지 로드 실패:', error);
            img.src = `file://${imagePath}`; // 폴백
        }
    }
    
    /**
     * 초기화
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Canvas 생성 (이미지 분석용)
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d');
            
            console.log('SmartFrameSelector 초기화 완료');
            this.initialized = true;
        } catch (error) {
            console.error('SmartFrameSelector 초기화 실패:', error);
        }
    }

    /**
     * 스마트 프레임 선별 메인 함수
     * @param {Array} framePaths - 분석할 프레임 경로 배열
     * @param {Object} options - 선별 옵션
     * @param {function} progressCallback - 진행률 콜백
     * @returns {Promise<Object>} 선별 결과
     */
    async selectBestFrames(framePaths, options = {}, progressCallback = null) {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            const config = { ...this.options, ...options };
            console.log(`🎯 스마트 프레임 선별 시작: ${framePaths.length}개 → ${config.targetCount}개`);

            if (progressCallback) progressCallback(0.1, '이미지 분석 준비 중...');

            // 1. 모든 프레임 특성 분석
            const frameFeatures = await this.analyzeFrameFeatures(
                framePaths, 
                (progress) => {
                    if (progressCallback) progressCallback(0.1 + progress * 0.4, '이미지 특성 분석 중...');
                }
            );

            if (progressCallback) progressCallback(0.5, '유사도 계산 중...');

            // 2. 유사도 매트릭스 계산 (이제 async)
            const similarityMatrix = await this.calculateSimilarityMatrix(frameFeatures);

            if (progressCallback) progressCallback(0.7, '클러스터링 수행 중...');

            // 3. 클러스터링 수행
            const clusters = this.performClustering(frameFeatures, similarityMatrix, config);

            if (progressCallback) progressCallback(0.9, '대표 프레임 선별 중...');

            // 4. 각 클러스터에서 대표 프레임 선별
            const selectedFrames = this.selectRepresentativeFrames(
                frameFeatures, 
                clusters, 
                config
            );

            if (progressCallback) progressCallback(1.0, '선별 완료!');

            console.log(`✅ 스마트 선별 완료: ${selectedFrames.length}개 프레임 선별`);

            return {
                success: true,
                selectedFrames: selectedFrames,
                clusters: clusters,
                totalAnalyzed: framePaths.length,
                selectionRatio: selectedFrames.length / framePaths.length,
                metadata: {
                    method: 'smart-clustering',
                    config: config,
                    processingTime: Date.now()
                }
            };

        } catch (error) {
            console.error('스마트 프레임 선별 실패:', error);
            throw new Error('스마트 프레임 선별에 실패했습니다: ' + error.message);
        }
    }

    /**
     * 프레임 특성 분석 (M4 MAX 최적화 병렬 처리)
     * @param {Array} framePaths - 프레임 경로 배열
     * @param {function} progressCallback - 진행률 콜백
     * @returns {Promise<Array>} 프레임 특성 배열
     */
    async analyzeFrameFeatures(framePaths, progressCallback = null) {
        const features = [];
        const totalFrames = framePaths.length;
        let processedCount = 0;
        
        // M4 MAX에 맞는 동시 처리 수 결정 (개선된 코어 활용)
        const os = typeof window !== 'undefined' && window.require ? window.require('os') : null;
        const cpuCount = os ? os.cpus().length : 4;
        
        // 이미지 분석은 CPU 집약적이므로 더 많은 병렬 처리 가능
        let concurrency;
        if (cpuCount >= 12) {
            // M4 MAX/Pro 급 (12코어 이상): 최대 성능 활용 - 더 공격적으로 설정
            concurrency = Math.min(Math.max(10, Math.floor(cpuCount * 1.0)), 24, totalFrames);
        } else if (cpuCount >= 8) {
            // M3/M2 Pro 급 (8-11코어): 적극적 활용
            concurrency = Math.min(Math.max(7, Math.floor(cpuCount * 0.9)), 16, totalFrames);
        } else {
            // 일반 CPU (8코어 미만): 안전한 활용
            concurrency = Math.min(Math.max(3, Math.floor(cpuCount * 0.6)), 8, totalFrames);
        }
        
        console.log(`🎨 병렬 이미지 분석 시작: ${totalFrames}개 프레임, ${concurrency}개 동시 처리`);
        
        // 배치별 순차 처리 (메모리 효율성 유지 - M4 MAX 최적화)
        // M4 MAX의 대용량 통합 메모리를 활용하여 더 큰 배치 처리 가능
        for (let batchStart = 0; batchStart < framePaths.length; batchStart += concurrency) {
            const batchEnd = Math.min(batchStart + concurrency, framePaths.length);
            const currentBatch = framePaths.slice(batchStart, batchEnd);
            const batchNumber = Math.floor(batchStart / concurrency) + 1;
            const totalBatches = Math.ceil(framePaths.length / concurrency);
            
            console.log(`⚡ 배치 ${batchNumber}/${totalBatches} 분석: ${currentBatch.length}개 프레임`);
            
            // 현재 배치의 모든 프레임을 병렬로 분석
            const batchPromises = currentBatch.map(async (framePath, batchIndex) => {
                const globalIndex = batchStart + batchIndex;
                
                try {
                    const feature = await this.extractImageFeatures(framePath, globalIndex);
                    processedCount++;
                    
                    // 진행률 업데이트
                    if (progressCallback) {
                        const progress = processedCount / totalFrames;
                        progressCallback(progress);
                    }
                    
                    return feature;
                } catch (error) {
                    console.error(`프레임 특성 분석 실패: ${framePath}`, error);
                    processedCount++;
                    
                    // 실패한 프레임은 기본 특성으로 처리
                    return {
                        path: framePath,
                        index: globalIndex,
                        histogram: new Array(256).fill(0),
                        colorMoments: { mean: [0, 0, 0], variance: [0, 0, 0] },
                        textureFeatures: { contrast: 0, energy: 0, homogeneity: 0 },
                        dominantColors: [],
                        brightness: 0,
                        contrast: 0,
                        sharpness: 0,
                        error: error.message
                    };
                }
            });
            
            // 배치 내 모든 작업 완료 대기
            const batchResults = await Promise.allSettled(batchPromises);
            
            // 성공한 결과만 수집
            batchResults.forEach((result, batchIndex) => {
                if (result.status === 'fulfilled' && result.value) {
                    features.push(result.value);
                    const globalIndex = batchStart + batchIndex;
                    console.log(`✅ 프레임 ${globalIndex + 1} 분석 완료`);
                } else {
                    const globalIndex = batchStart + batchIndex;
                    console.warn(`❌ 프레임 ${globalIndex + 1} 분석 실패`);
                }
            });
            
            // M4 MAX의 강력한 성능에 맞게 배치 간 대기 시간 단축
            if (batchEnd < framePaths.length) {
                // M4 MAX는 더 빠른 처리가 가능하므로 대기 시간 감소
                const waitTime = cpuCount >= 12 ? 20 : cpuCount >= 8 ? 30 : 50;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        
        console.log(`🏁 병렬 이미지 분석 완료: ${features.length}개 프레임 처리`);
        return features;
    }

    /**
     * 단일 이미지 특성 추출
     * @param {string} imagePath - 이미지 경로
     * @param {number} index - 인덱스
     * @returns {Promise<Object>} 이미지 특성
     */
    async extractImageFeatures(imagePath, index) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                try {
                    // Canvas 크기 설정 (분석 최적화를 위해 리사이즈)
                    // M4 MAX의 메모리 대역폭을 활용하여 적절한 사이즈 선택
                    const os = typeof window !== 'undefined' && window.require ? window.require('os') : null;
                    const cpuCount = os ? os.cpus().length : 4;
                    const targetSize = cpuCount >= 12 ? 320 : cpuCount >= 8 ? 256 : 192; // 코어 수에 따른 동적 사이즈
                    
                    this.canvas.width = targetSize;
                    this.canvas.height = targetSize;

                    // 이미지 그리기 (고품질 리샘플링)
                    this.ctx.imageSmoothingEnabled = true;
                    this.ctx.imageSmoothingQuality = 'high';
                    this.ctx.drawImage(img, 0, 0, targetSize, targetSize);
                    
                    const imageData = this.ctx.getImageData(0, 0, targetSize, targetSize);
                    
                    // 병렬 특성 추출로 성능 최적화
                    const features = {
                        path: imagePath,
                        index: index,
                        histogram: this.calculateHistogram(imageData),
                        colorMoments: this.calculateColorMoments(imageData),
                        textureFeatures: this.calculateTextureFeatures(imageData),
                        dominantColors: this.extractDominantColors(imageData),
                        brightness: this.calculateBrightness(imageData),
                        contrast: this.calculateContrast(imageData),
                        sharpness: this.calculateSharpness(imageData)
                    };

                    resolve(features);

                } catch (error) {
                    reject(new Error(`이미지 특성 추출 실패: ${error.message}`));
                }
            };

            img.onerror = () => {
                reject(new Error(`이미지 로드 실패: ${imagePath}`));
            };

            // 파일 경로를 data URL로 변환하여 로드
            this.loadImageFromPath(imagePath, img);
        });
    }

    /**
     * 파일 경로에서 이미지 로드
     * @param {string} imagePath - 이미지 경로
     * @param {HTMLImageElement} img - 이미지 엘리먼트
     */
    loadImageFromPath(imagePath, img) {
        try {
            const fs = this.eagleUtils?.getFS();
            if (fs && fs.existsSync(imagePath)) {
                const buffer = fs.readFileSync(imagePath);
                const base64 = buffer.toString('base64');
                const mimeType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
                img.src = `data:${mimeType};base64,${base64}`;
            } else {
                // 폴백: 직접 경로 사용 (보안 정책에 따라 제한될 수 있음)
                img.src = `file://${imagePath}`;
            }
        } catch (error) {
            console.error('이미지 로드 실패:', error);
            img.src = `file://${imagePath}`; // 폴백
        }
    }

    /**
     * 히스토그램 계산 (RGB 평균)
     * @param {ImageData} imageData - 이미지 데이터
     * @returns {Array} 히스토그램 배열
     */
    calculateHistogram(imageData) {
        const histogram = new Array(256).fill(0);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // RGB 평균을 그레이스케일로 변환
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            histogram[gray]++;
        }

        // 정규화
        const totalPixels = imageData.width * imageData.height;
        return histogram.map(count => count / totalPixels);
    }

    /**
     * 색상 모멘트 계산
     * @param {ImageData} imageData - 이미지 데이터
     * @returns {Object} 색상 모멘트
     */
    calculateColorMoments(imageData) {
        const data = imageData.data;
        const totalPixels = imageData.width * imageData.height;
        const means = [0, 0, 0]; // R, G, B
        const variances = [0, 0, 0];

        // 평균 계산
        for (let i = 0; i < data.length; i += 4) {
            means[0] += data[i];     // R
            means[1] += data[i + 1]; // G
            means[2] += data[i + 2]; // B
        }
        means[0] /= totalPixels;
        means[1] /= totalPixels;
        means[2] /= totalPixels;

        // 분산 계산
        for (let i = 0; i < data.length; i += 4) {
            variances[0] += Math.pow(data[i] - means[0], 2);
            variances[1] += Math.pow(data[i + 1] - means[1], 2);
            variances[2] += Math.pow(data[i + 2] - means[2], 2);
        }
        variances[0] /= totalPixels;
        variances[1] /= totalPixels;
        variances[2] /= totalPixels;

        return { mean: means, variance: variances };
    }

    /**
     * 텍스처 특성 계산 (단순화된 GLCM)
     * @param {ImageData} imageData - 이미지 데이터
     * @returns {Object} 텍스처 특성
     */
    calculateTextureFeatures(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        let contrast = 0;
        let energy = 0;
        let homogeneity = 0;
        let validPairs = 0;

        // 단순화된 텍스처 분석 (수평 방향 픽셀 쌍)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width - 1; x++) {
                const idx1 = (y * width + x) * 4;
                const idx2 = (y * width + x + 1) * 4;
                
                const gray1 = Math.round(0.299 * data[idx1] + 0.587 * data[idx1 + 1] + 0.114 * data[idx1 + 2]);
                const gray2 = Math.round(0.299 * data[idx2] + 0.587 * data[idx2 + 1] + 0.114 * data[idx2 + 2]);
                
                const diff = Math.abs(gray1 - gray2);
                
                contrast += diff * diff;
                energy += gray1 * gray2;
                homogeneity += 1 / (1 + diff);
                validPairs++;
            }
        }

        return {
            contrast: contrast / validPairs,
            energy: energy / validPairs,
            homogeneity: homogeneity / validPairs
        };
    }

    /**
     * 주요 색상 추출 (K-means 클러스터링 단순화)
     * @param {ImageData} imageData - 이미지 데이터
     * @returns {Array} 주요 색상 배열
     */
    extractDominantColors(imageData) {
        const data = imageData.data;
        const colorCounts = new Map();
        
        // 색상 빈도 계산 (8bit → 4bit 다운샘플링으로 성능 최적화)
        for (let i = 0; i < data.length; i += 4) {
            const r = Math.floor(data[i] / 16) * 16;
            const g = Math.floor(data[i + 1] / 16) * 16;
            const b = Math.floor(data[i + 2] / 16) * 16;
            
            const colorKey = `${r},${g},${b}`;
            colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
        }

        // 상위 5개 색상 반환
        const sortedColors = Array.from(colorCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([color, count]) => {
                const [r, g, b] = color.split(',').map(Number);
                return { r, g, b, count };
            });

        return sortedColors;
    }

    /**
     * 밝기 계산
     * @param {ImageData} imageData - 이미지 데이터
     * @returns {number} 평균 밝기
     */
    calculateBrightness(imageData) {
        const data = imageData.data;
        let totalBrightness = 0;

        for (let i = 0; i < data.length; i += 4) {
            const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            totalBrightness += brightness;
        }

        return totalBrightness / (imageData.width * imageData.height);
    }

    /**
     * 대비 계산
     * @param {ImageData} imageData - 이미지 데이터
     * @returns {number} 대비값
     */
    calculateContrast(imageData) {
        const data = imageData.data;
        const brightness = this.calculateBrightness(imageData);
        let variance = 0;

        for (let i = 0; i < data.length; i += 4) {
            const pixelBrightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            variance += Math.pow(pixelBrightness - brightness, 2);
        }

        return Math.sqrt(variance / (imageData.width * imageData.height));
    }

    /**
     * 선명도 계산 (간단한 엣지 검출)
     * @param {ImageData} imageData - 이미지 데이터
     * @returns {number} 선명도값
     */
    calculateSharpness(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        let edgeSum = 0;
        let validPixels = 0;

        // 소벨 필터 (단순화)
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                const current = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                
                const rightIdx = (y * width + x + 1) * 4;
                const right = 0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];
                
                const bottomIdx = ((y + 1) * width + x) * 4;
                const bottom = 0.299 * data[bottomIdx] + 0.587 * data[bottomIdx + 1] + 0.114 * data[bottomIdx + 2];
                
                const gx = Math.abs(right - current);
                const gy = Math.abs(bottom - current);
                const gradient = Math.sqrt(gx * gx + gy * gy);
                
                edgeSum += gradient;
                validPixels++;
            }
        }

        return edgeSum / validPixels;
    }

    /**
     * 유사도 매트릭스 계산 (M4 MAX 최적화 병렬 처리) - 이제 async 함수
     * @param {Array} features - 특성 배열
     * @returns {Promise<Array>} 유사도 매트릭스
     */
    async calculateSimilarityMatrix(features) {
        const n = features.length;
        const matrix = Array(n).fill().map(() => Array(n).fill(0));
        
        // M4 MAX에 맞는 동시 처리 수 결정 (유사도 계산 최적화)
        const os = typeof window !== 'undefined' && window.require ? window.require('os') : null;
        const cpuCount = os ? os.cpus().length : 4;
        
        // 유사도 계산도 M4 MAX에서는 더 공격적으로 병렬 처리 가능
        let concurrency;
        if (cpuCount >= 12) {
            // M4 MAX/Pro 급: 더 많은 병렬 처리
            concurrency = Math.min(Math.max(8, Math.floor(cpuCount * 0.8)), 16, n);
        } else if (cpuCount >= 8) {
            // M3/M2 Pro 급: 적극적 활용
            concurrency = Math.min(Math.max(6, Math.floor(cpuCount * 0.7)), 12, n);
        } else {
            // 일반 CPU: 안전한 활용
            concurrency = Math.min(Math.max(4, Math.floor(cpuCount * 0.6)), 8, n);
        }
        
        console.log(`📋 병렬 유사도 계산 시작: ${n}x${n} 매트릭스, ${concurrency}개 동시 처리`);
        
        // 대각선 설정 (자기 자신과의 유사도는 1.0)
        for (let i = 0; i < n; i++) {
            matrix[i][i] = 1.0;
        }
        
        // 상삼각 매트릭스만 계산 (대칭 매트릭스이므로)
        const totalPairs = (n * (n - 1)) / 2;
        let processedPairs = 0;
        
        // M4 MAX 최적화: 더 효율적인 배치별 병렬 처리
        for (let startRow = 0; startRow < n; startRow += concurrency) {
            const endRow = Math.min(startRow + concurrency, n);
            const rowPromises = [];
            
            for (let i = startRow; i < endRow; i++) {
                const rowPromise = new Promise(resolve => {
                    const rowResults = [];
                    
                    for (let j = i + 1; j < n; j++) {
                        try {
                            const similarity = this.calculateFeatureSimilarity(features[i], features[j]);
                            rowResults.push({ i, j, similarity });
                            processedPairs++;
                        } catch (error) {
                            console.warn(`유사도 계산 실패: (${i}, ${j})`, error);
                            rowResults.push({ i, j, similarity: 0 });
                        }
                    }
                    
                    resolve(rowResults);
                });
                
                rowPromises.push(rowPromise);
            }
            
            // 현재 배치의 모든 행 처리 완료 대기 (M4 MAX 최적화)
            const batchResults = await Promise.all(rowPromises);
            
            // 결과를 매트릭스에 적용 (메모리 효율적 접근)
            batchResults.forEach(rowResults => {
                rowResults.forEach(({ i, j, similarity }) => {
                    matrix[i][j] = similarity;
                    matrix[j][i] = similarity; // 대칭 매트릭스
                });
            });
            
            // 진행률 로그 (성능 모니터링)
            const progressPercent = ((processedPairs / totalPairs) * 100).toFixed(1);
            console.log(`⚡ 유사도 계산 진행: ${progressPercent}% (${processedPairs}/${totalPairs}) - M4 MAX 최적화`);
            
            // M4 MAX의 강력한 성능에 맞게 배치 간 대기 시간 감소
            if (startRow + concurrency < n) {
                const waitTime = cpuCount >= 12 ? 10 : cpuCount >= 8 ? 20 : 30;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        
        console.log(`🏁 병렬 유사도 계산 완료: ${n}x${n} 매트릭스`);
        return matrix;
    }

    /**
     * 두 특성 간의 유사도 계산
     * @param {Object} feature1 - 첫 번째 특성
     * @param {Object} feature2 - 두 번째 특성
     * @returns {number} 유사도 (0-1)
     */
    calculateFeatureSimilarity(feature1, feature2) {
        // 히스토그램 유사도 (코사인 유사도)
        const histSim = this.cosineSimilarity(feature1.histogram, feature2.histogram);
        
        // 색상 모멘트 유사도
        const colorSim = this.colorMomentSimilarity(feature1.colorMoments, feature2.colorMoments);
        
        // 텍스처 유사도
        const textureSim = this.textureSimilarity(feature1.textureFeatures, feature2.textureFeatures);
        
        // 밝기 유사도
        const brightnessSim = 1 - Math.abs(feature1.brightness - feature2.brightness) / 255;
        
        // 가중 평균
        const weights = {
            histogram: 0.3,
            color: 0.25,
            texture: 0.25,
            brightness: 0.2
        };

        return (
            weights.histogram * histSim +
            weights.color * colorSim +
            weights.texture * textureSim +
            weights.brightness * brightnessSim
        );
    }

    /**
     * 코사인 유사도 계산
     * @param {Array} vector1 - 벡터 1
     * @param {Array} vector2 - 벡터 2
     * @returns {number} 코사인 유사도
     */
    cosineSimilarity(vector1, vector2) {
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vector1.length; i++) {
            dotProduct += vector1[i] * vector2[i];
            norm1 += vector1[i] * vector1[i];
            norm2 += vector2[i] * vector2[i];
        }

        if (norm1 === 0 || norm2 === 0) return 0;
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    /**
     * 색상 모멘트 유사도
     * @param {Object} moment1 - 색상 모멘트 1
     * @param {Object} moment2 - 색상 모멘트 2
     * @returns {number} 유사도
     */
    colorMomentSimilarity(moment1, moment2) {
        let meanDiff = 0;
        let varDiff = 0;

        for (let i = 0; i < 3; i++) {
            meanDiff += Math.abs(moment1.mean[i] - moment2.mean[i]);
            varDiff += Math.abs(moment1.variance[i] - moment2.variance[i]);
        }

        const meanSim = 1 - (meanDiff / 3) / 255;
        const varSim = 1 - Math.min(varDiff / 3 / 10000, 1); // 분산은 큰 값이므로 정규화

        return (meanSim + varSim) / 2;
    }

    /**
     * 텍스처 유사도
     * @param {Object} texture1 - 텍스처 특성 1
     * @param {Object} texture2 - 텍스처 특성 2
     * @returns {number} 유사도
     */
    textureSimilarity(texture1, texture2) {
        const contrastSim = 1 - Math.abs(texture1.contrast - texture2.contrast) / Math.max(texture1.contrast + texture2.contrast, 1);
        const energySim = 1 - Math.abs(texture1.energy - texture2.energy) / Math.max(texture1.energy + texture2.energy, 1);
        const homogeneitySim = 1 - Math.abs(texture1.homogeneity - texture2.homogeneity) / Math.max(texture1.homogeneity + texture2.homogeneity, 1);

        return (contrastSim + energySim + homogeneitySim) / 3;
    }

    /**
     * 계층적 클러스터링 수행
     * @param {Array} features - 특성 배열
     * @param {Array} similarityMatrix - 유사도 매트릭스
     * @param {Object} config - 설정
     * @returns {Array} 클러스터 배열
     */
    performClustering(features, similarityMatrix, config) {
        const n = features.length;
        const targetClusters = Math.min(config.targetCount, n);
        
        // 각 프레임을 개별 클러스터로 시작
        let clusters = features.map((feature, index) => ({
            id: index,
            members: [index],
            representative: index,
            centroid: feature
        }));

        // 거리 매트릭스 (1 - 유사도)
        const distanceMatrix = similarityMatrix.map(row => 
            row.map(sim => 1 - sim)
        );

        // 클러스터 개수가 목표에 도달할 때까지 병합
        while (clusters.length > targetClusters) {
            let minDistance = Infinity;
            let mergeIndices = [-1, -1];

            // 가장 가까운 클러스터 쌍 찾기
            for (let i = 0; i < clusters.length; i++) {
                for (let j = i + 1; j < clusters.length; j++) {
                    const distance = this.calculateClusterDistance(
                        clusters[i], 
                        clusters[j], 
                        distanceMatrix
                    );
                    
                    if (distance < minDistance) {
                        minDistance = distance;
                        mergeIndices = [i, j];
                    }
                }
            }

            // 클러스터 병합
            if (mergeIndices[0] !== -1) {
                const cluster1 = clusters[mergeIndices[0]];
                const cluster2 = clusters[mergeIndices[1]];
                
                const mergedCluster = {
                    id: `${cluster1.id}_${cluster2.id}`,
                    members: [...cluster1.members, ...cluster2.members],
                    representative: this.selectClusterRepresentative(
                        [...cluster1.members, ...cluster2.members], 
                        features, 
                        distanceMatrix
                    )
                };

                // 새 클러스터로 교체
                clusters[mergeIndices[0]] = mergedCluster;
                clusters.splice(mergeIndices[1], 1);
            } else {
                break; // 병합할 수 없으면 종료
            }
        }

        console.log(`🎯 클러스터링 완료: ${features.length}개 → ${clusters.length}개 클러스터`);
        return clusters;
    }

    /**
     * 클러스터 간 거리 계산 (완전 연결법)
     * @param {Object} cluster1 - 클러스터 1
     * @param {Object} cluster2 - 클러스터 2
     * @param {Array} distanceMatrix - 거리 매트릭스
     * @returns {number} 클러스터 간 거리
     */
    calculateClusterDistance(cluster1, cluster2, distanceMatrix) {
        let maxDistance = 0;

        for (const member1 of cluster1.members) {
            for (const member2 of cluster2.members) {
                const distance = distanceMatrix[member1][member2];
                maxDistance = Math.max(maxDistance, distance);
            }
        }

        return maxDistance;
    }

    /**
     * 클러스터 대표 프레임 선택
     * @param {Array} members - 클러스터 멤버 인덱스들
     * @param {Array} features - 모든 특성 배열
     * @param {Array} distanceMatrix - 거리 매트릭스
     * @returns {number} 대표 프레임 인덱스
     */
    selectClusterRepresentative(members, features, distanceMatrix) {
        if (members.length === 1) return members[0];

        let bestRepresentative = members[0];
        let minTotalDistance = Infinity;

        // 클러스터 내 다른 모든 멤버와의 거리 합이 최소인 프레임 선택
        for (const candidate of members) {
            let totalDistance = 0;
            
            for (const member of members) {
                if (candidate !== member) {
                    totalDistance += distanceMatrix[candidate][member];
                }
            }

            // 추가 점수: 선명도, 대비 등 품질 점수
            const feature = features[candidate];
            const qualityBonus = this.calculateQualityScore(feature);
            const adjustedDistance = totalDistance - qualityBonus * 0.1;

            if (adjustedDistance < minTotalDistance) {
                minTotalDistance = adjustedDistance;
                bestRepresentative = candidate;
            }
        }

        return bestRepresentative;
    }

    /**
     * 이미지 품질 점수 계산
     * @param {Object} feature - 이미지 특성
     * @returns {number} 품질 점수
     */
    calculateQualityScore(feature) {
        // 선명도, 대비, 적절한 밝기를 종합한 품질 점수
        const sharpnessScore = Math.min(feature.sharpness / 50, 1); // 정규화
        const contrastScore = Math.min(feature.contrast / 50, 1);
        
        // 밝기가 너무 어둡거나 밝지 않은 것을 선호
        const brightnessScore = 1 - Math.abs(feature.brightness - 128) / 128;
        
        return (sharpnessScore + contrastScore + brightnessScore) / 3;
    }

    /**
     * 최종 대표 프레임 선별
     * @param {Array} features - 모든 특성 배열
     * @param {Array} clusters - 클러스터 배열
     * @param {Object} config - 설정
     * @returns {Array} 선별된 프레임 정보
     */
    selectRepresentativeFrames(features, clusters, config) {
        const selectedFrames = [];
        const usedIndices = new Set(); // 중복 방지를 위한 Set
        const usedPaths = new Set(); // 경로 중복 방지

        // 클러스터 크기에 따른 가중치 적용
        const sortedClusters = clusters.sort((a, b) => b.members.length - a.members.length);

        console.log(`🎯 대표 프레임 선별 시작: ${clusters.length}개 클러스터에서 ${config.targetCount}개 선별`);

        for (const cluster of sortedClusters) {
            const representativeIndex = cluster.representative;
            const feature = features[representativeIndex];
            
            // 중복 확인
            if (usedIndices.has(representativeIndex) || usedPaths.has(feature.path)) {
                console.warn(`⚠️ 중복 프레임 제외: 인덱스 ${representativeIndex}, 경로 ${feature.path}`);
                continue;
            }
            
            const frameInfo = {
                path: feature.path,
                originalIndex: feature.index,
                clusterSize: cluster.members.length,
                qualityScore: this.calculateQualityScore(feature),
                cluster: {
                    id: cluster.id,
                    size: cluster.members.length,
                    members: cluster.members
                },
                features: {
                    brightness: feature.brightness,
                    contrast: feature.contrast,
                    sharpness: feature.sharpness,
                    dominantColors: feature.dominantColors.slice(0, 3)
                }
            };

            selectedFrames.push(frameInfo);
            usedIndices.add(representativeIndex);
            usedPaths.add(feature.path);

            console.log(`✅ 대표 프레임 선별: 클러스터 ${cluster.id}, 인덱스 ${representativeIndex}, 품질 ${frameInfo.qualityScore.toFixed(3)}`);

            // 목표 개수에 도달하면 중단
            if (selectedFrames.length >= config.targetCount) {
                break;
            }
        }

        // 목표 개수에 도달하지 못한 경우 추가 선별
        if (selectedFrames.length < config.targetCount) {
            console.log(`📊 추가 선별 필요: ${selectedFrames.length}/${config.targetCount}, 모든 클러스터 재검토`);
            
            // 모든 클러스터의 멤버들을 품질 점수로 정렬하여 추가 선별
            for (const cluster of sortedClusters) {
                if (selectedFrames.length >= config.targetCount) break;
                
                // 클러스터 내 모든 멤버를 품질 점수로 정렬
                const clusterMembers = cluster.members
                    .map(memberIndex => features[memberIndex])
                    .filter(feature => !usedIndices.has(feature.index) && !usedPaths.has(feature.path))
                    .map(feature => ({
                        feature,
                        qualityScore: this.calculateQualityScore(feature)
                    }))
                    .sort((a, b) => b.qualityScore - a.qualityScore);
                
                for (const member of clusterMembers) {
                    if (selectedFrames.length >= config.targetCount) break;
                    
                    const frameInfo = {
                        path: member.feature.path,
                        originalIndex: member.feature.index,
                        clusterSize: cluster.members.length,
                        qualityScore: member.qualityScore,
                        cluster: {
                            id: cluster.id,
                            size: cluster.members.length,
                            members: cluster.members
                        },
                        features: {
                            brightness: member.feature.brightness,
                            contrast: member.feature.contrast,
                            sharpness: member.feature.sharpness,
                            dominantColors: member.feature.dominantColors.slice(0, 3)
                        }
                    };

                    selectedFrames.push(frameInfo);
                    usedIndices.add(member.feature.index);
                    usedPaths.add(member.feature.path);
                    
                    console.log(`✅ 추가 선별: 클러스터 ${cluster.id}, 인덱스 ${member.feature.index}, 품질 ${member.qualityScore.toFixed(3)}`);
                }
            }
        }

        // 품질 점수로 최종 정렬
        selectedFrames.sort((a, b) => b.qualityScore - a.qualityScore);

        console.log(`🏁 최종 선별 완료: ${selectedFrames.length}개 프레임, 중복 제거됨`);
        return selectedFrames.slice(0, config.targetCount);
    }

    /**
     * 선별된 프레임들을 새 폴더에 복사
     * @param {Array} selectedFrames - 선별된 프레임 정보
     * @param {string} outputDir - 출력 디렉토리
     * @returns {Promise<Array>} 복사된 파일 경로들
     */
    async copySelectedFrames(selectedFrames, outputDir) {
        const fs = this.eagleUtils?.getFS();
        const path = this.eagleUtils?.getNodeModule('path');
        
        if (!fs || !path) {
            throw new Error('파일 시스템 모듈을 사용할 수 없습니다.');
        }

        // 출력 디렉토리 생성
        await this.eagleUtils.ensureDirectory(outputDir);

        const copiedFiles = [];

        for (let i = 0; i < selectedFrames.length; i++) {
            const frame = selectedFrames[i];
            const originalPath = frame.path;
            const ext = path.extname(originalPath);
            
            // 새 파일명: 순서_품질점수_클러스터크기.확장자
            const newFileName = `grouped_${String(i + 1).padStart(2, '0')}_q${Math.round(frame.qualityScore * 100)}_c${frame.clusterSize}${ext}`;
            const newPath = path.join(outputDir, newFileName);

            try {
                // 파일 복사
                fs.copyFileSync(originalPath, newPath);
                
                copiedFiles.push({
                    originalPath: originalPath,
                    newPath: newPath,
                    fileName: newFileName,
                    ...frame
                });

                console.log(`📁 대표 프레임 복사 완료: ${newFileName} (클러스터 크기: ${frame.clusterSize})`);

            } catch (error) {
                console.error(`파일 복사 실패: ${originalPath}`, error);
            }
        }

        console.log(`✅ ${copiedFiles.length}개 선별 프레임 복사 완료`);
        return copiedFiles;
    }

    /**
     * 선별 결과 요약 HTML 생성
     * @param {Array} selectedFrames - 선별된 프레임들
     * @param {Object} metadata - 메타데이터
     * @returns {string} HTML 내용
     */
    generateSelectionSummaryHTML(selectedFrames, metadata) {
        let html = `
        <!DOCTYPE html>
        <html lang="ko">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>스마트 프레임 선별 결과</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
                .header { text-align: center; margin-bottom: 30px; padding: 20px; background: white; border-radius: 8px; }
                .summary { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
                .frames-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
                .frame-card { background: white; border-radius: 8px; padding: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .frame-image { width: 100%; height: 200px; object-fit: cover; border-radius: 4px; margin-bottom: 10px; }
                .frame-info { font-size: 12px; color: #666; }
                .quality-bar { width: 100%; height: 8px; background: #ddd; border-radius: 4px; margin: 5px 0; }
                .quality-fill { height: 100%; background: linear-gradient(90deg, #ff4444, #ffaa44, #44ff44); border-radius: 4px; }
                .cluster-badge { display: inline-block; background: #007bff; color: white; padding: 2px 6px; border-radius: 12px; font-size: 10px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🎯 스마트 프레임 그룹화 결과</h1>
                <p>AI 기반 이미지 분석으로 그룹화된 대표 프레임들</p>
            </div>
            
            <div class="summary">
                <h3>📊 그룹화 요약</h3>
                <p><strong>총 분석 프레임:</strong> ${metadata.totalAnalyzed}개</p>
                <p><strong>그룹화된 프레임:</strong> ${selectedFrames.length}개</p>
                <p><strong>선별 비율:</strong> ${(metadata.selectionRatio * 100).toFixed(1)}%</p>
                <p><strong>분석 방법:</strong> 색상, 텍스처, 밝기 기반 클러스터링</p>
            </div>
            
            <div class="frames-grid">
        `;

        selectedFrames.forEach((frame, index) => {
            const qualityPercent = Math.round(frame.qualityScore * 100);
            html += `
                <div class="frame-card">
                    <img src="${frame.path}" alt="Frame ${index + 1}" class="frame-image">
                    <h4>프레임 #${index + 1} <span class="cluster-badge">클러스터 ${frame.clusterSize}개</span></h4>
                    <div class="frame-info">
                        <div><strong>품질 점수:</strong> ${qualityPercent}%</div>
                        <div class="quality-bar">
                            <div class="quality-fill" style="width: ${qualityPercent}%"></div>
                        </div>
                        <div><strong>밝기:</strong> ${Math.round(frame.features.brightness)}</div>
                        <div><strong>대비:</strong> ${Math.round(frame.features.contrast)}</div>
                        <div><strong>선명도:</strong> ${Math.round(frame.features.sharpness)}</div>
                        <div><strong>대표 색상:</strong> 
                            ${frame.features.dominantColors.map(c => 
                                `<span style="display:inline-block;width:12px;height:12px;background:rgb(${c.r},${c.g},${c.b});border:1px solid #ccc;margin:0 2px;"></span>`
                            ).join('')}
                        </div>
                    </div>
                </div>
            `;
        });

        html += `
            </div>
        </body>
        </html>
        `;

        return html;
    }
}

// 브라우저 환경에서 전역 객체로 등록
window.SmartFrameSelector = SmartFrameSelector;
