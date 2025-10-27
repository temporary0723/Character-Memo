// 캐릭터 메모 확장 - SillyTavern Extension
// 캐릭터별로 메모를 저장하고 관리할 수 있는 기능 제공

import {
    eventSource,
    event_types,
    chat,
    getRequestHeaders,
    saveSettingsDebounced,
    substituteParams,
} from '../../../../script.js';

import {
    getContext,
    extension_settings,
    saveMetadataDebounced,
} from '../../../extensions.js';

import {
    POPUP_TYPE,
    callGenericPopup,
    POPUP_RESULT,
} from '../../../popup.js';

import {
    uuidv4,
    timestampToMoment,
} from '../../../utils.js';

// 확장 이름 및 상수 정의
const pluginName = 'character-memo';
const extensionFolderPath = `scripts/extensions/third-party/Character-Memo`;

// 캐릭터별 메모 저장을 위한 메타데이터 키
const MEMO_METADATA_KEY = 'character_memos_v1';

// 메모 데이터 저장소
let currentCharacterMemos = [];
let globalMemos = [];

// 현재 모달 상태
let currentModal = null;
let isGlobalMode = false; // 글로벌 메모 모드 여부

// Extension Settings에 메모 데이터 초기화
function initializeMemoSettings() {
    if (!extension_settings[pluginName]) {
        extension_settings[pluginName] = {
            characterMemos: {},
            globalMemos: [],
            version: '1.0'
        };
        saveSettingsDebounced();
    }
    
    // 기존 설정에 필요한 키들이 없으면 추가
    if (!extension_settings[pluginName].characterMemos) {
        extension_settings[pluginName].characterMemos = {};
        saveSettingsDebounced();
    }
    
    if (!extension_settings[pluginName].globalMemos) {
        extension_settings[pluginName].globalMemos = [];
        saveSettingsDebounced();
    }
}

/**
 * 현재 캐릭터의 메모 로드
 */
function loadCharacterMemos() {
    try {
        const context = getContext();
        if (!context || context.characterId === undefined) {
            currentCharacterMemos = [];
            return;
        }

        initializeMemoSettings();
        
        const characterKey = context.characterId.toString();
        const savedMemos = extension_settings[pluginName].characterMemos[characterKey];
        
        if (savedMemos && Array.isArray(savedMemos)) {
            currentCharacterMemos = savedMemos;
        } else {
            currentCharacterMemos = [];
        }
    } catch (error) {
        console.error('[CharacterMemo] 메모 로드 실패:', error);
        currentCharacterMemos = [];
    }
}

/**
 * 글로벌 메모 로드
 */
function loadGlobalMemos() {
    try {
        initializeMemoSettings();
        
        const savedMemos = extension_settings[pluginName].globalMemos;
        
        if (savedMemos && Array.isArray(savedMemos)) {
            globalMemos = savedMemos;
        } else {
            globalMemos = [];
        }
    } catch (error) {
        console.error('[CharacterMemo] 글로벌 메모 로드 실패:', error);
        globalMemos = [];
    }
}

/**
 * 현재 캐릭터의 메모 저장
 */
function saveCharacterMemos() {
    try {
        const context = getContext();
        if (!context || context.characterId === undefined) {
            console.error('[CharacterMemo] 캐릭터 ID를 찾을 수 없어 메모를 저장할 수 없습니다.');
            return;
        }

        initializeMemoSettings();
        
        const characterKey = context.characterId.toString();
        
        // Extension Settings에 메모 저장
        extension_settings[pluginName].characterMemos[characterKey] = [...currentCharacterMemos];
        
        // 설정 변경사항 저장
        saveSettingsDebounced();
        
    } catch (error) {
        console.error('[CharacterMemo] 메모 저장 실패:', error);
    }
}

/**
 * 글로벌 메모 저장
 */
function saveGlobalMemos() {
    try {
        initializeMemoSettings();
        
        // Extension Settings에 글로벌 메모 저장
        extension_settings[pluginName].globalMemos = [...globalMemos];
        
        // 설정 변경사항 저장
        saveSettingsDebounced();
        
    } catch (error) {
        console.error('[CharacterMemo] 글로벌 메모 저장 실패:', error);
    }
}

/**
 * 새 메모 추가
 */
function addMemo() {
    const newMemo = {
        id: uuidv4(),
        title: '',
        content: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    if (isGlobalMode) {
        globalMemos.push(newMemo);
        saveGlobalMemos();
    } else {
        currentCharacterMemos.push(newMemo);
        saveCharacterMemos();
    }
    
    // 모달이 열려있으면 새로고침
    refreshMemoListInModal();
    
    // 새로 추가된 메모의 제목 입력 필드에 포커스
    setTimeout(() => {
        const newMemoElement = $(`.memo-item[data-memo-id="${newMemo.id}"] .memo-title-input`);
        if (newMemoElement.length > 0) {
            newMemoElement.focus();
        }
    }, 100);
}

/**
 * 메모 수정
 */
function updateMemo(memoId, title, content) {
    const memos = isGlobalMode ? globalMemos : currentCharacterMemos;
    const memo = memos.find(m => m.id === memoId);
    if (memo) {
        memo.title = title;
        memo.content = content;
        memo.updatedAt = new Date().toISOString();
        
        if (isGlobalMode) {
            saveGlobalMemos();
        } else {
            saveCharacterMemos();
        }
    }
}

/**
 * 메모 내용 클립보드에 복사
 */
async function copyMemoContent(memoId) {
    const memos = isGlobalMode ? globalMemos : currentCharacterMemos;
    const memo = memos.find(m => m.id === memoId);
    if (!memo) return;

    try {
        // 내용만 복사
        const textToCopy = memo.content || '';
        
        if (navigator.clipboard && window.isSecureContext) {
            // 최신 Clipboard API 사용
            await navigator.clipboard.writeText(textToCopy);
        } else {
            // 폴백: 임시 textarea 사용
            const textArea = document.createElement('textarea');
            textArea.value = textToCopy;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            document.execCommand('copy');
            textArea.remove();
        }
        
        toastr.success('메모가 클립보드에 복사되었습니다.');
    } catch (error) {
        console.error('[CharacterMemo] 클립보드 복사 실패:', error);
        toastr.error('클립보드 복사에 실패했습니다.');
    }
}

/**
 * 메모 삭제
 */
async function deleteMemo(memoId) {
    const memos = isGlobalMode ? globalMemos : currentCharacterMemos;
    const memo = memos.find(m => m.id === memoId);
    if (!memo) return;

    const memoTitle = memo.title || '제목 없음';
    
    const result = await callGenericPopup(
        `"${memoTitle}" 메모를 삭제하시겠습니까?`,
        POPUP_TYPE.CONFIRM
    );

    if (result === POPUP_RESULT.AFFIRMATIVE) {
        const index = memos.findIndex(m => m.id === memoId);
        if (index !== -1) {
            memos.splice(index, 1);
            
            if (isGlobalMode) {
                saveGlobalMemos();
            } else {
                saveCharacterMemos();
            }
            
            // 모달 새로고침
            refreshMemoListInModal();
            
            toastr.success('메모가 삭제되었습니다.');
        }
    }
}

/**
 * 메모 위로 이동
 */
function moveMemoUp(memoId) {
    const memos = isGlobalMode ? globalMemos : currentCharacterMemos;
    const index = memos.findIndex(m => m.id === memoId);
    
    if (index > 0) {
        // 배열에서 위치 교환
        [memos[index - 1], memos[index]] = [memos[index], memos[index - 1]];
        
        // 저장
        if (isGlobalMode) {
            saveGlobalMemos();
        } else {
            saveCharacterMemos();
        }
        
        // 모달 새로고침
        refreshMemoListInModal();
    }
}

/**
 * 메모 아래로 이동
 */
function moveMemoDown(memoId) {
    const memos = isGlobalMode ? globalMemos : currentCharacterMemos;
    const index = memos.findIndex(m => m.id === memoId);
    
    if (index >= 0 && index < memos.length - 1) {
        // 배열에서 위치 교환
        [memos[index], memos[index + 1]] = [memos[index + 1], memos[index]];
        
        // 저장
        if (isGlobalMode) {
            saveGlobalMemos();
        } else {
            saveCharacterMemos();
        }
        
        // 모달 새로고침
        refreshMemoListInModal();
    }
}

/**
 * 글로벌/캐릭터 메모 모드 전환
 */
function toggleMemoMode() {
    isGlobalMode = !isGlobalMode;
    
    if (isGlobalMode) {
        // 글로벌 메모 로드
        loadGlobalMemos();
    } else {
        // 캐릭터 메모 로드
        loadCharacterMemos();
    }
    
    // 모달 새로고침
    refreshMemoListInModal();
}

/**
 * 현재 모달의 메모 리스트만 새로고침
 */
function refreshMemoListInModal() {
    if (!currentModal || currentModal.length === 0) {
        return; // 모달이 열려있지 않으면 아무것도 하지 않음
    }
    
    const context = getContext();
    const characterName = context && context.name2 ? context.name2 : '알 수 없는 캐릭터';
    
    // 모달 헤더 업데이트
    const headerTitle = isGlobalMode ? '글로벌 메모' : `${characterName}의 메모`;
    currentModal.find('.memo-modal-header h3').text(headerTitle);
    
    // 현재 모드에 따른 메모 배열 선택
    const currentMemos = isGlobalMode ? globalMemos : currentCharacterMemos;
    
    // 새로운 메모 리스트 HTML 생성
    const memoListHtml = currentMemos.map((memo, index) => `
        <div class="memo-item" data-memo-id="${memo.id}">
            <div class="memo-item-header">
                <div class="memo-move-buttons">
                    <button class="memo-move-up-btn" title="위로 이동" data-memo-id="${memo.id}" ${index === 0 ? 'disabled' : ''}>
                        <i class="fa-solid fa-chevron-up"></i>
                    </button>
                    <button class="memo-move-down-btn" title="아래로 이동" data-memo-id="${memo.id}" ${index === currentMemos.length - 1 ? 'disabled' : ''}>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                </div>
                <input type="text" class="memo-title-input" placeholder="메모 제목을 입력하세요" 
                       value="${memo.title || ''}" data-memo-id="${memo.id}">
                <div class="memo-actions">
                    <button class="memo-copy-btn" title="내용 복사" data-memo-id="${memo.id}">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                    <button class="memo-delete-btn" title="삭제" data-memo-id="${memo.id}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            <textarea class="memo-content-textarea" placeholder="메모 내용을 입력하세요" 
                      data-memo-id="${memo.id}">${memo.content || ''}</textarea>
        </div>
    `).join('');
    
    // 모달 바디 업데이트
    const modalBody = currentModal.find('.memo-modal-body');
    
    if (currentMemos.length === 0) {
        modalBody.html(`
            <button class="memo-add-button">
                <i class="fa-solid fa-plus"></i>
                <span>새 메모 추가</span>
            </button>
            <div class="no-memos">
                <i class="fa-solid fa-sticky-note"></i>
                저장된 메모가 없습니다.<br>
                위의 버튼을 클릭하여 새 메모를 추가해보세요.
            </div>
            <button class="memo-add-button memo-add-button-bottom">
                <i class="fa-solid fa-plus"></i>
                <span>새 메모 추가</span>
            </button>
        `);
    } else {
        modalBody.html(`
            <button class="memo-add-button">
                <i class="fa-solid fa-plus"></i>
                <span>새 메모 추가</span>
            </button>
            <div class="memo-list">${memoListHtml}</div>
            <button class="memo-add-button memo-add-button-bottom">
                <i class="fa-solid fa-plus"></i>
                <span>새 메모 추가</span>
            </button>
        `);
    }
    
    // 이벤트 핸들러 다시 바인딩
    bindModalEventHandlers();
}

/**
 * 모달 이벤트 핸들러 바인딩
 */
function bindModalEventHandlers() {
    if (!currentModal) return;
    
    // 새 메모 추가 버튼 (상단과 하단 모두)
    currentModal.find('.memo-add-button').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        addMemo();
    });
    
    // 스왑 버튼 이벤트
    currentModal.find('.memo-swap-btn').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleMemoMode();
    });
    
    // 메모 제목 변경 이벤트
    currentModal.find('.memo-title-input').off('blur').on('blur', function() {
        const memoId = $(this).data('memo-id');
        const newTitle = $(this).val().trim();
        const memos = isGlobalMode ? globalMemos : currentCharacterMemos;
        const memo = memos.find(m => m.id === memoId);
        
        if (memo && memo.title !== newTitle) {
            updateMemo(memoId, newTitle, memo.content);
        }
    });
    
    // 메모 내용 변경 이벤트
    currentModal.find('.memo-content-textarea').off('blur').on('blur', function() {
        const memoId = $(this).data('memo-id');
        const newContent = $(this).val().trim();
        const memos = isGlobalMode ? globalMemos : currentCharacterMemos;
        const memo = memos.find(m => m.id === memoId);
        
        if (memo && memo.content !== newContent) {
            updateMemo(memoId, memo.title, newContent);
        }
    });
    
    // 메모 복사 버튼
    currentModal.find('.memo-copy-btn').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const memoId = $(this).data('memo-id');
        copyMemoContent(memoId);
    });
    
    // 메모 삭제 버튼
    currentModal.find('.memo-delete-btn').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const memoId = $(this).data('memo-id');
        deleteMemo(memoId);
    });
    
    // 메모 위로 이동 버튼
    currentModal.find('.memo-move-up-btn').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const memoId = $(this).data('memo-id');
        moveMemoUp(memoId);
    });
    
    // 메모 아래로 이동 버튼
    currentModal.find('.memo-move-down-btn').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const memoId = $(this).data('memo-id');
        moveMemoDown(memoId);
    });
}

/**
 * 캐릭터 메모 모달 생성
 */
async function createCharacterMemoModal() {
    const context = getContext();
    const characterName = context && context.name2 ? context.name2 : '알 수 없는 캐릭터';
    
    // 현재 캐릭터의 메모 로드 (글로벌 모드가 아닌 경우)
    if (!isGlobalMode) {
        loadCharacterMemos();
    } else {
        loadGlobalMemos();
    }
    
    const currentMemos = isGlobalMode ? globalMemos : currentCharacterMemos;
    const memoListHtml = currentMemos.map((memo, index) => `
        <div class="memo-item" data-memo-id="${memo.id}">
            <div class="memo-item-header">
                <div class="memo-move-buttons">
                    <button class="memo-move-up-btn" title="위로 이동" data-memo-id="${memo.id}" ${index === 0 ? 'disabled' : ''}>
                        <i class="fa-solid fa-chevron-up"></i>
                    </button>
                    <button class="memo-move-down-btn" title="아래로 이동" data-memo-id="${memo.id}" ${index === currentMemos.length - 1 ? 'disabled' : ''}>
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                </div>
                <input type="text" class="memo-title-input" placeholder="메모 제목을 입력하세요" 
                       value="${memo.title || ''}" data-memo-id="${memo.id}">
                <div class="memo-actions">
                    <button class="memo-copy-btn" title="내용 복사" data-memo-id="${memo.id}">
                        <i class="fa-solid fa-copy"></i>
                    </button>
                    <button class="memo-delete-btn" title="삭제" data-memo-id="${memo.id}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
            <textarea class="memo-content-textarea" placeholder="메모 내용을 입력하세요" 
                      data-memo-id="${memo.id}">${memo.content || ''}</textarea>
        </div>
    `).join('');

    const headerTitle = isGlobalMode ? '글로벌 메모' : `${characterName}의 메모`;
    
    const modalHtml = `
        <div class="memo-modal-backdrop">
            <div class="memo-modal">
                <div class="memo-modal-header">
                    <button class="memo-swap-btn" title="글로벌 메모 / 캐릭터 메모 전환">
                        <i class="fa-solid fa-arrows-rotate"></i>
                    </button>
                    <h3>${headerTitle}</h3>
                    <button class="memo-modal-close" title="닫기">×</button>
                </div>
                <div class="memo-modal-body">
                    <button class="memo-add-button">
                        <i class="fa-solid fa-plus"></i>
                        <span>새 메모 추가</span>
                    </button>
                    ${currentMemos.length === 0 
                        ? `<div class="no-memos">
                            <i class="fa-solid fa-sticky-note"></i>
                            저장된 메모가 없습니다.<br>
                            위의 버튼을 클릭하여 새 메모를 추가해보세요.
                           </div>` 
                        : `<div class="memo-list">${memoListHtml}</div>`
                    }
                    <button class="memo-add-button memo-add-button-bottom">
                        <i class="fa-solid fa-plus"></i>
                        <span>새 메모 추가</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    // 기존 모달 제거
    if (currentModal) {
        currentModal.remove();
    }

    currentModal = $(modalHtml);
    $('body').append(currentModal);

    // 애니메이션 효과
    setTimeout(() => {
        currentModal.addClass('visible');
        currentModal.find('.memo-modal').addClass('visible');
    }, 10);

    // 모달 닫기 이벤트
    currentModal.find('.memo-modal-close').on('click', function() {
        currentModal.removeClass('visible');
        currentModal.find('.memo-modal').removeClass('visible');
        
        setTimeout(() => {
            currentModal.remove();
            currentModal = null;
        }, 300);
    });
    
    // 배경 클릭으로 모달 닫기
    currentModal.on('click', function(e) {
        if (e.target === this) {
            currentModal.removeClass('visible');
            currentModal.find('.memo-modal').removeClass('visible');
            
            setTimeout(() => {
                currentModal.remove();
                currentModal = null;
            }, 300);
        }
    });
    
    // 모든 이벤트 핸들러 바인딩
    bindModalEventHandlers();
}

/**
 * 캐릭터 변경 처리 - 새로운 캐릭터의 메모를 로드
 */
function handleCharacterChanged() {
    // 새로운 캐릭터의 메모를 로드
    loadCharacterMemos();
    
    // 모달이 열려있으면 새로고침
    if (currentModal && currentModal.length > 0) {
        refreshMemoListInModal();
    }
}

/**
 * 요술봉 메뉴에 버튼 추가
 */
async function addToWandMenu() {
    try {
        const buttonHtml = await $.get(`${extensionFolderPath}/button.html`);
        
        const extensionsMenu = $("#extensionsMenu");
        if (extensionsMenu.length > 0) {
            extensionsMenu.append(buttonHtml);
            $("#character_memo_button").on("click", createCharacterMemoModal);
        } else {
            setTimeout(addToWandMenu, 1000);
        }
    } catch (error) {
        console.error('[CharacterMemo] 요술봉 메뉴 버튼 추가 실패:', error);
    }
}

/**
 * 확장 초기화
 */
function initializeCharacterMemo() {
    console.log('[CharacterMemo] 캐릭터 메모 확장을 초기화합니다.');
    
    // Extension Settings 초기화
    initializeMemoSettings();
    
    // 메모 데이터 로드
    loadCharacterMemos();
    loadGlobalMemos();
    
    // 이벤트 리스너 설정
    eventSource.on(event_types.CHAT_CHANGED, handleCharacterChanged);
    
    // 요술봉 메뉴에 버튼 추가
    setTimeout(addToWandMenu, 1000);
}

// jQuery 준비 완료 시 초기화
jQuery(() => {
    initializeCharacterMemo();
});
