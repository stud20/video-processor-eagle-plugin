/**
 * 그룹 그리드 표시 - 디버깅 강화 버전
 */
function displayGroupGrid(groups) {
    try {
        console.log('=== displayGroupGrid 시작 ===');
        console.log('그룹 데이터:', groups);
        
        if (!groups || groups.length === 0) {
            elements.groupsGrid.innerHTML = '<p>표시할 그룹이 없습니다.</p>';
            return;
        }
        
        let gridHTML = '';
        let totalCuts = 0;
        let thumbnailCount = 0;
        let noThumbnailCount = 0;
        
        // 총 컷 개수 계산 및 썸네일 상태 확인
        groups.forEach(group => {
            totalCuts += group.members.length;
            group.members.forEach(member => {
                if (member.thumbnail) {
                    thumbnailCount++;
                    console.log(`✅ 썸네일 있음: 컷 #${member.cutIndex + 1}`, {
                        length: member.thumbnail.length,
                        prefix: member.thumbnail.substring(0, 50) + '...'
                    });
                } else {
                    noThumbnailCount++;
                    console.log(`❌ 썸네일 없음: 컷 #${member.cutIndex + 1}`, {
                        framePath: member.framePath
                    });
                }
            });
        });
        
        console.log(`썸네일 상태: ${thumbnailCount}개 있음, ${noThumbnailCount}개 없음`);
        
        gridHTML += `<div class="grid-header">
            <h3>🎬 총 ${totalCuts}개의 컷이 발견되었습니다</h3>
            <p style="font-size: 0.8em; color: #a0aec0;">썸네일: ${thumbnailCount}/${totalCuts}</p>
        </div>`;
        
        // 각 그룹을 순회하며 모든 컷 표시
        groups.forEach((group, groupIndex) => {
            const isActualGroup = group.isGroup;
            const memberCount = group.members.length;
            
            console.log(`그룹 #${group.id} 처리 중...`, {
                isGroup: isActualGroup,
                members: memberCount
            });
            
            // 그룹 헤더 (실제 그룹인 경우만)
            if (isActualGroup && memberCount > 1) {
                gridHTML += `
                    <div class="group-header-section" data-group-id="${group.id}">
                        <h3 class="group-section-title">
                            🎯 그룹 #${group.id} - ${memberCount}개의 유사한 컷 (유사도: ${(group.avgSimilarity * 100).toFixed(1)}%)
                        </h3>
                    </div>
                `;
            }
            
            // 각 멤버를 개별 카드로 표시
            group.members.forEach((member, memberIndex) => {
                const cutPoint = member.cutPoint;
                const duration = cutPoint.duration.toFixed(1);
                const timeRange = `${formatTime(cutPoint.start)} ~ ${formatTime(cutPoint.end)}`;
                const cutId = `${group.id}-${memberIndex}`;
                const isSelected = selectedGroupIds.has(cutId);
                
                // 썸네일 HTML 생성 - 다양한 방법 시도
                let thumbnailHTML = '';
                
                if (member.thumbnail) {
                    // Base64 썸네일이 있는 경우
                    console.log(`🖼️ Base64 썸네일 사용: 그룹${group.id}-멤버${memberIndex}`);
                    thumbnailHTML = `
                        <img src="${member.thumbnail}" 
                             alt="컷 ${member.cutIndex + 1}" 
                             class="thumbnail-image"
                             onload="console.log('이미지 로드 성공: 컷 ${member.cutIndex + 1}')"
                             onerror="console.error('이미지 로드 실패: 컷 ${member.cutIndex + 1}'); this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                        <div class="thumbnail-placeholder" style="display: none;">🎬</div>
                    `;
                } else if (member.framePath) {
                    // 파일 경로만 있는 경우 - Eagle 환경에서 직접 읽기 시도
                    console.log(`📁 파일 경로 사용 시도: ${member.framePath}`);
                    
                    // Eagle 플러그인 환경에서 파일 읽기 시도
                    if (window.require) {
                        try {
                            const fs = window.require('fs');
                            if (fs.existsSync(member.framePath)) {
                                const imageBuffer = fs.readFileSync(member.framePath);
                                const base64 = imageBuffer.toString('base64');
                                member.thumbnail = `data:image/jpeg;base64,${base64}`;
                                console.log(`✅ 파일에서 Base64 변환 성공: ${member.framePath}`);
                                
                                thumbnailHTML = `
                                    <img src="${member.thumbnail}" 
                                         alt="컷 ${member.cutIndex + 1}" 
                                         class="thumbnail-image"
                                         onload="console.log('변환된 이미지 로드 성공: 컷 ${member.cutIndex + 1}')"
                                         onerror="console.error('변환된 이미지 로드 실패: 컷 ${member.cutIndex + 1}'); this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                                    <div class="thumbnail-placeholder" style="display: none;">🎬</div>
                                `;
                            } else {
                                console.error(`파일이 존재하지 않음: ${member.framePath}`);
                                thumbnailHTML = '<div class="thumbnail-placeholder">❌</div>';
                            }
                        } catch (error) {
                            console.error(`파일 읽기 실패: ${member.framePath}`, error);
                            thumbnailHTML = '<div class="thumbnail-placeholder">⚠️</div>';
                        }
                    } else {
                        // require가 없는 경우 file:// 프로토콜 시도
                        thumbnailHTML = `
                            <img src="file://${member.framePath}" 
                                 alt="컷 ${member.cutIndex + 1}" 
                                 class="thumbnail-image"
                                 onload="console.log('file:// 이미지 로드 성공: 컷 ${member.cutIndex + 1}')"
                                 onerror="console.error('file:// 이미지 로드 실패: 컷 ${member.cutIndex + 1}'); this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                            <div class="thumbnail-placeholder" style="display: none;">🎬</div>
                        `;
                    }
                } else {
                    // 아무것도 없는 경우
                    console.warn(`⚠️ 썸네일 정보 없음: 그룹${group.id}-멤버${memberIndex}`);
                    thumbnailHTML = '<div class="thumbnail-placeholder">🎬</div>';
                }
                
                gridHTML += `
                    <div class="cut-card ${isSelected ? 'selected' : ''} ${isActualGroup ? 'grouped' : 'single'}" 
                         data-cut-id="${cutId}" 
                         data-group-id="${group.id}"
                         data-member-index="${memberIndex}">
                        <div class="cut-header">
                            <div class="cut-checkbox">
                                <input type="checkbox" id="cut-${cutId}" ${isSelected ? 'checked' : ''}>
                                <label for="cut-${cutId}"></label>
                            </div>
                            <div class="cut-title">
                                ${isActualGroup && memberIndex === 0 ? '🎯 대표 ' : ''}
                                컷 #${member.cutIndex + 1}
                            </div>
                            ${member.separated ? '<span class="separated-badge">분리됨</span>' : ''}
                        </div>
                        
                        <div class="cut-thumbnail" data-cut-index="${member.cutIndex}">
                            ${thumbnailHTML}
                        </div>
                        
                        <div class="cut-info">
                            <div class="cut-time">${timeRange}</div>
                            <div class="cut-duration">${duration}초</div>
                        </div>
                        
                        ${isActualGroup && memberCount > 1 ? `
                            <div class="cut-actions">
                                <button class="btn-small btn-separate" onclick="separateCut('${group.id}', ${memberIndex})">
                                    ✂️ 분리
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            
            // 그룹 구분선
            if (isActualGroup && memberCount > 1) {
                gridHTML += '<div class="group-separator"></div>';
            }
        });
        
        elements.groupsGrid.innerHTML = gridHTML;
        
        // 체크박스 이벤트 리스너 추가
        elements.groupsGrid.addEventListener('change', handleCutSelection);
        
        // 이미지 로드 상태 확인 (1초 후)
        setTimeout(() => {
            const images = elements.groupsGrid.querySelectorAll('.thumbnail-image');
            let loadedCount = 0;
            let failedCount = 0;
            
            images.forEach((img, index) => {
                if (img.complete && img.naturalHeight > 0) {
                    loadedCount++;
                } else {
                    failedCount++;
                    console.error(`이미지 로드 실패 확인: ${index}번째 이미지`, {
                        src: img.src.substring(0, 100) + '...',
                        complete: img.complete,
                        naturalHeight: img.naturalHeight
                    });
                    
                    // 실패한 이미지 숨기고 placeholder 표시
                    img.style.display = 'none';
                    const placeholder = img.nextElementSibling;
                    if (placeholder) {
                        placeholder.style.display = 'flex';
                    }
                }
            });
            
            console.log(`=== 이미지 로드 결과 ===`);
            console.log(`성공: ${loadedCount}개, 실패: ${failedCount}개`);
        }, 1000);
        
        console.log('=== displayGroupGrid 완료 ===');
        console.log(`총 ${totalCuts}개의 컷 표시 완료`);
        
    } catch (error) {
        console.error('=== displayGroupGrid 오류 ===', error);
        elements.groupsGrid.innerHTML = '<p>컷 표시 중 오류가 발생했습니다.</p>';
    }
}

/**
 * 컷 선택 처리 (개별 컷 선택)
 */
function handleCutSelection(event) {
    if (event.target.type === 'checkbox') {
        const cutId = event.target.id.replace('cut-', '');
        const isChecked = event.target.checked;
        
        if (isChecked) {
            selectedGroupIds.add(cutId);
        } else {
            selectedGroupIds.delete(cutId);
        }
        
        // 카드 스타일 업데이트
        const card = event.target.closest('.cut-card');
        if (card) {
            card.classList.toggle('selected', isChecked);
        }
        
        // 선택된 컷 수 업데이트
        updateSelectedCutsCount();
        
        console.log('컷 선택 변경:', cutId, isChecked ? '선택' : '해제');
    }
}

/**
 * 선택된 컷 수 업데이트
 */
function updateSelectedCutsCount() {
    const selectedCount = selectedGroupIds.size;
    let totalCuts = 0;
    
    smartGroups.forEach(group => {
        totalCuts += group.members.length;
    });
    
    if (elements.extractSelectedBtn) {
        elements.extractSelectedBtn.textContent = `🎯 선택된 ${selectedCount}개 컷 추출`;
        elements.extractSelectedBtn.disabled = selectedCount === 0;
    }
    
    console.log(`선택된 컷: ${selectedCount}/${totalCuts}`);
}

/**
 * 컷 분리 함수
 */
function separateCut(groupId, memberIndex) {
    try {
        console.log(`✂️ 컷 분리: 그룹 ${groupId}의 멤버 ${memberIndex}`);
        
        // 해당 그룹 찾기
        const group = smartGroups.find(g => g.id === parseInt(groupId));
        if (!group || !group.isGroup || group.members.length <= 1) {
            showNotification('분리할 수 없는 컷입니다.', 'warning');
            return;
        }
        
        // 분리할 멤버 찾기
        const memberToSeparate = group.members[memberIndex];
        if (!memberToSeparate) {
            showNotification('해당 컷을 찾을 수 없습니다.', 'error');
            return;
        }
        
        // 그룹에서 멤버 제거
        group.members.splice(memberIndex, 1);
        
        // 새로운 개별 그룹 생성
        const newGroup = {
            id: Math.max(...smartGroups.map(g => g.id)) + 1,
            representative: memberToSeparate,
            members: [memberToSeparate],
            avgSimilarity: 1.0,
            isGroup: false,
            separated: true
        };
        
        // 원래 그룹이 하나만 남으면 그룹 해제
        if (group.members.length === 1) {
            group.isGroup = false;
        }
        
        // 새 그룹 추가
        smartGroups.push(newGroup);
        
        // UI 업데이트
        displayGroupGrid(smartGroups);
        
        showNotification(`✂️ 컷 #${memberToSeparate.cutIndex + 1}이 그룹에서 분리되었습니다.`, 'success');
        
    } catch (error) {
        console.error('컷 분리 실패:', error);
        showNotification('컷 분리에 실패했습니다.', 'error');
    }
}

/**
 * 시간 포맷 함수
 */
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toFixed(1).padStart(4, '0')}`;
}

// 전역 함수로 등록
window.separateCut = separateCut;
window.displayGroupGrid = displayGroupGrid;
window.handleCutSelection = handleCutSelection;
window.updateSelectedCutsCount = updateSelectedCutsCount;

console.log('displayGroupGrid.js 로드 완료');
