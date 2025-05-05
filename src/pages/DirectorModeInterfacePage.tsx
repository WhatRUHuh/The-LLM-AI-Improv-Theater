import React, { useState, useEffect, useRef, useCallback, useMemo, FC } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Input, Button, List, Spin, message, Typography, Card, Empty, Switch,
    Space, theme, Checkbox, Row, Col, Radio, RadioChangeEvent // 添加了 Radio 和 RadioChangeEvent 用于模式切换
} from 'antd';
import {
    SendOutlined, ArrowLeftOutlined, ReloadOutlined, MessageOutlined, EditOutlined // 添加了重演、指令、旁白图标
} from '@ant-design/icons';
import type {
    AICharacter,
    ChatConfig,
    ChatMessage,
    // ChatPageStateSnapshot, // 可能需要为导演模式定义新的快照类型
} from '../types';
import type { LLMChatOptions, StreamChunk } from '../../electron/llm/BaseLLM';
import { useLastVisited } from '../hooks/useLastVisited';
import { chatLogger } from '../utils/logger'; // 重命名后的导入别名

// --- 导演模式特定的类型 ---

// 定义导演输入模式
type DirectorInputMode = 'command' | 'narration'; // 指令或旁白

// 定义各 AI 的加载状态
type AILoadingState = Record<string, boolean>;

// 定义分割的系统提示词结构 (复用)
interface SplitSystemPrompt {
    prePrompt: string;
    postPrompt: string;
}

// 定义导演模式聊天页面状态快照的类型 (基于 MultiAIChatPageStateSnapshot 修改)
interface DirectorChatPageStateSnapshot {
    chatConfig: ChatConfig & { mode: 'director' }; // 模式固定为 director
    messages: ChatMessage[];
    directorInputValue: string; // 导演输入框内容
    directorInputMode: DirectorInputMode; // 导演输入模式
    systemPrompts: Record<string, SplitSystemPrompt>;
    chatSessionId: string;
    isStreamingEnabled: boolean;
    selectedTargetAIIds: string[]; // 本轮选中的目标 AI
    // nextSequentialAIIndex?: number; // 顺序逻辑内部管理，快照中可能不需要
}

// 特殊 Character ID 用于标识导演和旁白
const DIRECTOR_COMMAND_ID = 'DIRECTOR_COMMAND';
const NARRATOR_ID = 'NARRATOR';

// --- 组件定义 ---
const DirectorModeInterfacePage: FC = () => {

    // --- 所有 Hook 必须声明在顶部 ---
    const location = useLocation();
    const navigate = useNavigate();
    const { updateLastVisitedNavInfo, getLastVisitedNavInfo } = useLastVisited();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [directorInputValue, setDirectorInputValue] = useState<string>(''); // 导演输入框状态
    const [directorInputMode, setDirectorInputMode] = useState<DirectorInputMode>('command'); // 导演输入模式状态，默认指令
    const [aiLoadingState, setAILoadingState] = useState<AILoadingState>({});
    const [systemPrompts, setSystemPrompts] = useState<Record<string, SplitSystemPrompt>>({});
    const [chatSessionId, setChatSessionId] = useState<string>('');
    const [isStreamingEnabled, setIsStreamingEnabled] = useState<boolean>(true);
    const [selectedTargetAIIds, setSelectedTargetAIIds] = useState<string[]>([]); // 本轮目标 AI
    // const [nextSequentialAIIndex, setNextSequentialAIIndex] = useState<number>(0); // 顺序逻辑内部管理
    const [respondedInTurnAIIds, setRespondedInTurnAIIds] = useState<Set<string>>(new Set()); // 记录本轮已回复的AI ID
    const [chatConfig, setChatConfig] = useState<(ChatConfig & { mode: 'director' }) | null>(null); // 模式改为 director
    const [initializationError, setInitializationError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const sequentialTriggerLock = useRef<Record<string, boolean>>({}); // 原子锁 Ref
    const scheduleTriggerLock = useRef(false); // 调度锁 Ref
    const { token: { colorBgContainer } } = theme.useToken();

    // --- 记忆化派生状态 ---
    // 导演模式没有 userCharacter
    const aiCharacters: AICharacter[] = useMemo(() =>
        chatConfig?.participatingCharacters ?? [], // 所有参与者都是 AI
        [chatConfig]
    );

    // --- 初始状态计算函数 (适配导演模式) ---
    const calculateAndSetInitialState = useCallback(() => {
        // 类型断言为导演模式快照或配置
        const restoredState = location.state as DirectorChatPageStateSnapshot | (ChatConfig & { mode: 'director' }) | undefined;
        let errorMsg: string | null = null;
        let configToSet: (ChatConfig & { mode: 'director' }) | null = null;
        let messagesToSet: ChatMessage[] = [];
        let directorInputToSet = '';
        let directorInputModeToSet: DirectorInputMode = 'command';
        let promptsToSet: Record<string, SplitSystemPrompt> = {};
        let sessionIdToSet = '';
        let streamingToSet = true;
        let targetsToSet: string[] = [];
        const loadingStateToSet: AILoadingState = {};
        // let seqIndexToSet = 0; // 移除

        if (restoredState) {
            // 检查是否是完整的快照
            if ('messages' in restoredState && 'chatConfig' in restoredState && restoredState.chatConfig?.mode === 'director') {
                chatLogger.info('恢复导演模式的完整状态快照'); // 中文注释
                const snapshot = restoredState as DirectorChatPageStateSnapshot;
                configToSet = snapshot.chatConfig;
                messagesToSet = snapshot.messages ?? [];
                directorInputToSet = snapshot.directorInputValue ?? '';
                directorInputModeToSet = snapshot.directorInputMode ?? 'command';
                promptsToSet = snapshot.systemPrompts ?? {};
                sessionIdToSet = snapshot.chatSessionId ?? '';
                streamingToSet = snapshot.isStreamingEnabled ?? true;
                targetsToSet = snapshot.selectedTargetAIIds ?? [];
                // seqIndexToSet = snapshot.nextSequentialAIIndex ?? 0; // 移除
            } else if (!('messages' in restoredState) && restoredState.mode === 'director') {
                // 从设置页面接收初始配置
                chatLogger.info('从 ChatConfig 初始化导演模式'); // 中文注释
                configToSet = restoredState as (ChatConfig & { mode: 'director' });
                // 首次进入时，默认选中所有 AI
                targetsToSet = configToSet.participatingCharacters.map(c => c.id);
            } else {
                errorMsg = '无效的聊天状态，请返回重新设置。'; // 中文注释
                chatLogger.error('导演模式页面收到无效状态:', restoredState); // 中文注释
            }
        } else {
            errorMsg = '缺少聊天配置信息，请返回重新设置。'; // 中文注释
            chatLogger.error('导演模式页面未收到状态。'); // 中文注释
        }

        // 进一步验证配置
        if (!errorMsg && (!configToSet || configToSet.mode !== 'director' || configToSet.participatingCharacters.length < 2)) {
            errorMsg = '导演模式聊天配置信息无效或不完整（至少需要2个AI角色）。'; // 中文注释
            chatLogger.error('计算得到的初始 chatConfig 无效:', configToSet); // 中文注释
            configToSet = null;
        }

        if (errorMsg) {
            setInitializationError(errorMsg);
            message.error(errorMsg);
            navigate('/chat-mode-selection', { replace: true });
        } else if (configToSet) {
            setChatConfig(configToSet);
            setMessages(messagesToSet);
            setDirectorInputValue(directorInputToSet);
            setDirectorInputMode(directorInputModeToSet);
            setSystemPrompts(promptsToSet);
            setChatSessionId(sessionIdToSet);
            setIsStreamingEnabled(streamingToSet);
            setSelectedTargetAIIds(targetsToSet);
            setAILoadingState(loadingStateToSet);
            // setNextSequentialAIIndex(seqIndexToSet); // 移除
            setRespondedInTurnAIIds(new Set()); // 初始化为空集合
            setInitializationError(null);
        } else {
             const fallbackError = '无法初始化导演模式聊天配置。'; // 中文注释
             setInitializationError(fallbackError);
             message.error(fallbackError);
             navigate('/chat-mode-selection', { replace: true });
        }
    }, [location.state, navigate]);

    // --- useEffect 用于初始化状态 ---
    useEffect(() => {
        calculateAndSetInitialState();
    }, [calculateAndSetInitialState]);

    // --- useEffect 用于生成 prompts 和会话 ID（适配导演模式） ---
    useEffect(() => {
        let didCancel = false;
        if (initializationError || !chatConfig || (Object.keys(systemPrompts).length > 0 && chatSessionId)) {
            return;
        }

         chatLogger.info('导演模式：生成提示词和会话 ID...'); // 中文注释
         const newPrompts: Record<string, SplitSystemPrompt> = {};
         const currentAiChars = aiCharacters; // 现在所有参与者都是 AI

         if (currentAiChars.length === 0) {
              chatLogger.error("导演模式：找不到 AI 角色用于生成提示词。"); // 中文注释
              return;
         }

         // --- 1. 生成剧本设定部分 (与之前一致) ---
         const scriptFields: (keyof ChatConfig['script'])[] = [
             'title', 'scene', 'genre', 'setting', 'synopsis', 'mood', 'themes', 'tags'
         ];
         const scriptSettings = scriptFields
             .map(key => {
                 const value = chatConfig.script[key];
                 if (key === 'tags' && Array.isArray(value) && value.length > 0) { return `标签: ${value.join(', ')}`; }
                 if (typeof value === 'string' && value.trim()) {
                     const labelMap: Record<string, string> = { title: '剧本名字', scene: '场景描述', genre: '类型/题材', setting: '时代/背景设定', synopsis: '剧情梗概', mood: '氛围/基调', theme: '主题' };
                     return `${labelMap[key] || key}: ${value.trim()}`;
                 } return null;
             }).filter(Boolean).join('\n');

         // --- 2. 生成出场人物设定部分 (与之前一致) ---
         const characterFields: (keyof AICharacter)[] = [ 'name', 'identity', 'gender', 'age', 'personality', 'background', 'appearance', 'abilities', 'goals', 'secrets', 'relationships', 'mannerisms', 'voiceTone', 'catchphrase', 'notes' ];
         const formatCharacterDetails = (char: AICharacter, hideSecrets: boolean): string => {
            return characterFields.map(key => {
                if (hideSecrets && key === 'secrets') { return null; }
                const value = char[key];
                if (value !== undefined && value !== null && String(value).trim() !== '') {
                    const labelMap: Record<string, string> = { name: '姓名', identity: '身份', gender: '性别', age: '年龄', personality: '性格', background: '背景故事', appearance: '外貌描述', abilities: '能力/特长', goals: '目标/动机', secrets: '秘密', relationships: '人物关系', mannerisms: '言行举止/小动作', voiceTone: '说话音调/风格', catchphrase: '口头禅', notes: '其他备注' };
                    return `  ${labelMap[key] || key}: ${String(value).trim()}`;
                } return null;
            }).filter(Boolean).join('\n');
         };

         // --- 3. 为每个 AI 生成导演模式专属提示词 ---
         currentAiChars.forEach((aiChar: AICharacter) => {
            const otherCharacterDescriptions = chatConfig.participatingCharacters
                .filter(c => c.id !== aiChar.id)
                .map(otherChar => `${otherChar.name}`) // 只列出名字
                .join(', '); // 用逗号分隔

            const ownCharacterDescription = formatCharacterDetails(aiChar, false); // 包含自己的秘密

            // --- 3c. 组装前置提示词 (导演模式版) ---
            const prePrompt = `你是一名 AI 演员，正在参与一个由【导演】（用户）指导的即兴剧场。\n\n` +
                           `=== 剧本设定 ===\n${scriptSettings || '无'}\n\n` +
                           `=== 其他出场人物 ===\n${otherCharacterDescriptions || '无其他角色'}\n\n` +
                           `--- 你的重要任务 ---\n` +
                           `你的任务是扮演角色：**${aiChar.name}**。\n` +
                           `你的【完整】角色设定（包括秘密）如下：\n${ownCharacterDescription}\n\n` +
                           `你必须严格按照你的角色设定行事。`;

            // --- 3d. 组装后置提示词 (导演模式版) ---
            const postPrompt = `--- 表演规则与导演互动 ---\n` +
                           `1.  对话历史中会包含其他角色的发言（格式：角色名: 内容）、导演的指令（格式：[导演 -> 目标角色]: 指令内容）和旁白（格式：[旁白]: 内容）。\n` +
                           `2.  【导演指令】是给特定角色的。如果你是目标之一，必须在保持角色身份的前提下，尽力遵循指令。\n` +
                           `3.  【旁白】是场景或氛围信息，你需要理解并融入表演。\n` +
                           `4.  **重要：你可能会在一条【导演指令】或【旁白】之后被要求立即回应。请自然地将这条最新的信息纳入你的表演中。**\n` +
                           `5.  如果没有明确的指令指向你，并且你不是刚被旁白触发的目标，请根据角色、剧本、历史对话和旁白信息，自主地进行表演。\n` +
                           `6.  你只能输出你扮演的角色 **(${aiChar.name})** 的对话内容。\n` +
                           `7.  直接输出对话，不要加角色名前缀，如 "${aiChar.name}: "。\n` +
                           `8.  不要输出任何与角色扮演无关的评论、解释或内心想法。\n` +
                           `9.  全心投入你的角色 **${aiChar.name}**！\n\n` +
                           `现在，请根据最新的对话历史，开始你的表演：`;

             newPrompts[aiChar.id] = { prePrompt, postPrompt };
             chatLogger.info(`为 ${aiChar.name} 生成了导演模式的系统提示词`); // 中文注释
         });

        if (!didCancel) {
            if (Object.keys(systemPrompts).length === 0) {
                setSystemPrompts(newPrompts);
            }
            if (!chatSessionId) {
                const newSessionId = `director-${chatConfig.script.id}-${Date.now()}`; // 加上 director 前缀
                setChatSessionId(newSessionId);
                chatLogger.info(`生成了新的导演模式会话 ID: ${newSessionId}`); // 中文注释
            }
             // 确保首次加载时有默认选中的 AI (如果之前没有恢复状态)
             if(selectedTargetAIIds.length === 0 && currentAiChars.length > 0) {
                setSelectedTargetAIIds(currentAiChars.map((c: AICharacter) => c.id));
             }
        }

        return () => { didCancel = true; };
    }, [initializationError, chatConfig, aiCharacters, systemPrompts, chatSessionId, selectedTargetAIIds.length]); // 依赖项更新

    // --- useEffect 用于保存状态到上下文 (适配导演模式) ---
    useEffect(() => {
        if (!initializationError && chatConfig && chatSessionId && Object.keys(systemPrompts).length > 0) {
            const currentStateSnapshot: DirectorChatPageStateSnapshot = {
                chatConfig, messages, directorInputValue, directorInputMode, systemPrompts, chatSessionId,
                isStreamingEnabled, selectedTargetAIIds,
            };
            // 使用 'directorModeInterface' 作为 key
            updateLastVisitedNavInfo('directorModeInterface', location.pathname, undefined, currentStateSnapshot);
        }
    }, [
        messages, directorInputValue, directorInputMode, chatConfig, systemPrompts, chatSessionId,
        isStreamingEnabled, selectedTargetAIIds,
        initializationError, updateLastVisitedNavInfo, location.pathname
    ]);

    // --- useEffect 用于滚动 (保持不变) ---
    useEffect(() => {
        if (!initializationError) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, initializationError]);

    // --- triggerNextSequentialAI 前置声明 (保持不变) ---
    const triggerNextSequentialAIRef = useRef<(currentHistory: ChatMessage[]) => void>(undefined);

    // --- useCallback 用于发送消息给单个 AI (基本保持不变, 只需确保 history 正确) ---
    const sendToSingleAI = useCallback(async (aiChar: AICharacter, history: ChatMessage[]) => {
        if (aiLoadingState[aiChar.id]) {
            chatLogger.warn(`sendToSingleAI 调用 ${aiChar.name} 时它已在加载中，忽略重复调用。`); // 中文注释
            return;
        }
        if (!chatConfig || !systemPrompts[aiChar.id] || !chatSessionId || initializationError) {
            chatLogger.warn(`无法发送消息给 ${aiChar.name}，缺少配置/提示/会话或初始化错误。`); // 中文注释
            return;
        }
        const aiConfig = chatConfig.aiConfigs[aiChar.id];
        if (!aiConfig || !aiConfig.providerId || !aiConfig.model) {
            message.error(`AI角色 (${aiChar.name}) 的配置不完整！`); // 中文注释
            setAILoadingState(prev => ({ ...prev, [aiChar.id]: false }));
            return;
        }

        setAILoadingState(prev => ({ ...prev, [aiChar.id]: true }));

        try {
            // 格式化历史记录，将导演/旁白消息也包含进去
            const llmHistory = history.map(msg => {
                let role: 'user' | 'assistant';
                let contentPrefix = '';
                if (msg.role === 'assistant') {
                    role = 'assistant';
                    contentPrefix = `${msg.characterName}: `;
                } else { // 'user' or special director/narrator roles disguised as 'user'
                    role = 'user'; // LLM 通常只认 user 和 assistant
                    // 根据 characterId 判断是否是特殊消息，并添加前缀
                    if (msg.characterId === DIRECTOR_COMMAND_ID) {
                        // 尝试从内容中解析目标
                        const match = msg.content.match(/^\[指令 -> (.*?)]: (.*)$/s);
                        if (match) {
                             contentPrefix = `[导演 -> ${match[1]}]: `;
                             msg.content = match[2]; // 只保留指令内容给 LLM
                        } else {
                             contentPrefix = `[导演指令]: `; // 备用前缀
                        }
                    } else if (msg.characterId === NARRATOR_ID) {
                        contentPrefix = `[旁白]: `;
                    } else {
                        // 普通用户扮演的角色（虽然导演模式没有，但为了兼容性保留）
                        contentPrefix = `${msg.characterName}: `;
                    }
                }
                return { role, content: `${contentPrefix}${msg.content}` };
            });


            const { prePrompt, postPrompt } = systemPrompts[aiChar.id];
            const combinedSystemPrompt = prePrompt + '\n\n' + postPrompt;

            const options: LLMChatOptions = {
                model: aiConfig.model, messages: llmHistory,
                systemPrompt: combinedSystemPrompt, stream: isStreamingEnabled,
            };

            chatLogger.info(`发送请求给 ${aiChar.name} (${aiConfig.providerId}/${aiConfig.model}), Stream: ${isStreamingEnabled}`); // 中文注释

            if (isStreamingEnabled) {
                const placeholderMessage: ChatMessage = {
                    role: 'assistant', characterId: aiChar.id, characterName: aiChar.name, content: '', timestamp: Date.now(),
                };
                setMessages(prev => [...prev, placeholderMessage]);
                const startResult = await window.electronAPI.llmGenerateChatStream(aiConfig.providerId, options, aiChar.id);

                if (!startResult.success) {
                    message.error(`启动 AI (${aiChar.name}) 流式响应失败: ${startResult.error || '未知错误'}`); // 中文注释
                    setAILoadingState(prev => ({ ...prev, [aiChar.id]: false }));
                    setMessages(prev => prev.filter(m => !(m.characterId === aiChar.id && m.content === '' && m.role === 'assistant')));
                    // 错误处理中会调用 triggerNextSequentialAI
                } else {
                    chatLogger.info(`AI (${aiChar.name}) 流式响应已启动。`); // 中文注释
                }
            } else {
                // --- 非流式 ---
                try {
                    const result = await window.electronAPI.llmGenerateChat(aiConfig.providerId, options);
                    chatLogger.info(`收到来自 ${aiChar.name} 的非流式响应:`, result); // 中文注释
                    if (result.success && result.data?.content) {
                        const aiResponse: ChatMessage = {
                            role: 'assistant', characterId: aiChar.id, characterName: aiChar.name,
                            content: result.data.content.trim(), timestamp: Date.now(),
                        };
                        setMessages(prev => [...prev, aiResponse]);
                        // --- 非流式顺序回复完成处理 ---
                        setRespondedInTurnAIIds(prev => new Set(prev).add(aiChar.id));
                        if (sequentialTriggerLock.current[aiChar.id]) {
                            sequentialTriggerLock.current[aiChar.id] = false;
                            chatLogger.info(`顺序锁已为 ${aiChar.name} 释放 (非流式成功)。`); // 中文注释
                        }
                        setMessages(prevMsgs => {
                            if (!scheduleTriggerLock.current) {
                                scheduleTriggerLock.current = true;
                                chatLogger.info(`计划在 ${aiChar.name} 非流式成功后检查下一个触发。`); // 中文注释
                                setTimeout(() => {
                                    scheduleTriggerLock.current = false;
                                    chatLogger.info(`执行在 ${aiChar.name} 非流式成功后计划的触发检查。`); // 中文注释
                                    triggerNextSequentialAIRef.current?.(prevMsgs);
                                }, 0);
                            } else {
                                chatLogger.warn(`在 ${aiChar.name} 非流式成功后跳过重复的计划尝试。`); // 中文注释
                            }
                            return prevMsgs;
                        });
                    } else {
                        // --- 非流式顺序回复失败处理 ---
                        message.error(`AI (${aiChar.name}) 回复失败: ${result.error || '未知错误'}`); // 中文注释
                        setRespondedInTurnAIIds(prev => new Set(prev).add(aiChar.id));
                        if (sequentialTriggerLock.current[aiChar.id]) {
                            sequentialTriggerLock.current[aiChar.id] = false;
                            chatLogger.info(`顺序锁已为 ${aiChar.name} 释放 (非流式失败)。`); // 中文注释
                        }
                        setMessages(prevMsgs => {
                            if (!scheduleTriggerLock.current) {
                                scheduleTriggerLock.current = true;
                                chatLogger.info(`计划在 ${aiChar.name} 非流式失败后检查下一个触发。`); // 中文注释
                                setTimeout(() => {
                                    scheduleTriggerLock.current = false;
                                    chatLogger.info(`执行在 ${aiChar.name} 非流式失败后计划的触发检查。`); // 中文注释
                                    triggerNextSequentialAIRef.current?.(prevMsgs);
                                }, 0);
                            } else {
                                chatLogger.warn(`在 ${aiChar.name} 非流式失败后跳过重复的计划尝试。`); // 中文注释
                            }
                            return prevMsgs;
                        });
                    }
                } catch (error: unknown) {
                    // --- 非流式调用本身出错处理 ---
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    message.error(`调用 AI (${aiChar.name}) 时出错: ${errorMsg}`); // 中文注释
                    setRespondedInTurnAIIds(prev => new Set(prev).add(aiChar.id));
                    if (sequentialTriggerLock.current[aiChar.id]) {
                        sequentialTriggerLock.current[aiChar.id] = false;
                        chatLogger.info(`顺序锁已为 ${aiChar.name} 释放 (非流式捕获)。`); // 中文注释
                    }
                    setMessages(prevMsgs => {
                        if (!scheduleTriggerLock.current) {
                            scheduleTriggerLock.current = true;
                            chatLogger.info(`计划在 ${aiChar.name} 非流式捕获后检查下一个触发。`); // 中文注释
                            setTimeout(() => {
                                scheduleTriggerLock.current = false;
                                chatLogger.info(`执行在 ${aiChar.name} 非流式捕获后计划的触发检查。`); // 中文注释
                                triggerNextSequentialAIRef.current?.(prevMsgs);
                            }, 0);
                        } else {
                            chatLogger.warn(`在 ${aiChar.name} 非流式捕获后跳过重复的计划尝试。`); // 中文注释
                        }
                        return prevMsgs;
                    });
                } finally {
                    setAILoadingState(prev => ({ ...prev, [aiChar.id]: false }));
                }
            }
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            message.error(`准备发送消息给 ${aiChar.name} 时出错: ${errorMsg}`); // 中文注释
            setAILoadingState(prev => ({ ...prev, [aiChar.id]: false }));
            // --- 外层 try...catch 的顺序回复失败处理 ---
             setRespondedInTurnAIIds(prev => new Set(prev).add(aiChar.id));
             if (sequentialTriggerLock.current[aiChar.id]) {
                 sequentialTriggerLock.current[aiChar.id] = false;
                 chatLogger.info(`顺序锁已为 ${aiChar.name} 释放 (外部捕获)。`); // 中文注释
             }
             setMessages(prevMsgs => {
                  if (!scheduleTriggerLock.current) {
                      scheduleTriggerLock.current = true;
                      chatLogger.info(`计划在 ${aiChar.name} 外部捕获后检查下一个触发。`); // 中文注释
                      setTimeout(() => {
                          scheduleTriggerLock.current = false;
                          chatLogger.info(`执行在 ${aiChar.name} 外部捕获后计划的触发检查。`); // 中文注释
                          triggerNextSequentialAIRef.current?.(prevMsgs);
                      }, 0);
                  } else {
                     chatLogger.warn(`在 ${aiChar.name} 外部捕获后跳过重复的计划尝试。`); // 中文注释
                  }
                  return prevMsgs;
             });
        }
    }, [
        chatConfig, systemPrompts, chatSessionId, isStreamingEnabled,
        initializationError, setMessages, setAILoadingState,
        setRespondedInTurnAIIds, aiLoadingState
    ]);


    // --- useCallback 用于触发下一个顺序 AI (逻辑保持不变) ---
    const triggerNextSequentialAI = useCallback((currentHistory: ChatMessage[]) => {
        if (initializationError || aiCharacters.length === 0) {
            return;
        }
        chatLogger.info('顺序模式：尝试触发下一个 AI。本轮已回复:', Array.from(respondedInTurnAIIds)); // 中文注释

        let foundNext = false;
        for (const targetId of selectedTargetAIIds) { // 使用本轮选中的目标
            if (!respondedInTurnAIIds.has(targetId) && !aiLoadingState[targetId] && !sequentialTriggerLock.current[targetId]) {
                const nextAI = aiCharacters.find((c: AICharacter) => c.id === targetId);
                if (nextAI) {
                    chatLogger.info(`顺序模式：找到下一个可触发的 AI: ${nextAI.name}，应用锁。`); // 中文注释
                    sequentialTriggerLock.current[targetId] = true;
                    setAILoadingState(prev => ({ ...prev, [targetId]: true }));
                    sendToSingleAI(nextAI, currentHistory);
                    foundNext = true;
                    break; // 单次放行
                } else {
                    chatLogger.error(`顺序模式：无法找到 ID 为 ${targetId} 的 AI 角色对象。跳过。`); // 中文注释
                    setRespondedInTurnAIIds(prev => new Set(prev).add(targetId));
                    if (sequentialTriggerLock.current[targetId]) {
                         sequentialTriggerLock.current[targetId] = false;
                         chatLogger.warn(`为不存在的 AI ID 释放了顺序锁: ${targetId}`); // 中文注释
                    }
                    continue;
                }
            }
        }
        if (!foundNext) {
            chatLogger.info('顺序模式：本轮所有选中的 AI 均已回复。'); // 中文注释
        }
    }, [
        initializationError, aiCharacters, selectedTargetAIIds,
        respondedInTurnAIIds, aiLoadingState,
        sendToSingleAI, setRespondedInTurnAIIds, setAILoadingState
    ]);

    // --- 在每次渲染时更新 ref (保持不变) ---
     useEffect(() => {
        triggerNextSequentialAIRef.current = triggerNextSequentialAI;
     });

     // --- useEffect 用于统一处理流式监听器 (适配导演模式) ---
     useEffect(() => {
         if (initializationError) return;

         const handleStreamChunk = (data: unknown) => {
             // ... (内部逻辑基本不变，主要是日志和错误信息可能需要微调) ...
             if (typeof data !== 'object' || data === null || !('chunk' in data) || !('sourceId' in data)) {
                 chatLogger.error('收到无效的流数据结构:', data); return; // 中文注释
             }
             const { chunk, sourceId } = data as { chunk: StreamChunk, sourceId: string };
             const aiCharacterId = sourceId;
             if (!aiCharacterId) { chatLogger.error('流块缺少 sourceId:', chunk); return; } // 中文注释
             const aiChar = aiCharacters.find((c: AICharacter) => c.id === aiCharacterId);
             if (!aiChar) { chatLogger.error(`流块来自未知的 sourceId: ${aiCharacterId}`); return; } // 中文注释

             // --- 更新消息内容 ---
             if (chunk.text) {
                 setMessages(prevMessages => {
                     // ... (找到对应的助手消息并追加内容，逻辑不变) ...
                     let targetMessageIndex = -1;
                     for (let i = prevMessages.length - 1; i >= 0; i--) {
                         if (prevMessages[i].role === 'assistant' && prevMessages[i].characterId === aiCharacterId) {
                             targetMessageIndex = i; break;
                         }
                     }
                     if (targetMessageIndex !== -1) {
                         const updatedMessages = [...prevMessages];
                         updatedMessages[targetMessageIndex] = { ...updatedMessages[targetMessageIndex], content: (updatedMessages[targetMessageIndex].content ?? '') + (chunk.text ?? ''), timestamp: Date.now() };
                         return updatedMessages;
                     } else {
                         chatLogger.warn(`收到 ${aiChar.name} 的流块文本，但未找到消息。创建新消息。`); // 中文注释
                         const newMessage: ChatMessage = { role: 'assistant', characterId: aiChar.id, characterName: aiChar.name, content: chunk.text ?? '', timestamp: Date.now() };
                         return [...prevMessages, newMessage];
                     }
                 });
             }

             // --- 处理错误 ---
             if (chunk.error) {
                 message.error(`AI (${aiChar.name}) 流式响应出错: ${chunk.error}`); // 中文注释
                 setAILoadingState(prev => ({ ...prev, [aiCharacterId]: false }));
                 // 清理空消息
                 setMessages(prevMessages => {
                     const updatedMessages = [...prevMessages];
                     let lastMsgIndex = -1;
                     for (let i = updatedMessages.length - 1; i >= 0; i--) { if (updatedMessages[i].role === 'assistant' && updatedMessages[i].characterId === aiCharacterId) { lastMsgIndex = i; break; } }
                     if (lastMsgIndex !== -1 && updatedMessages[lastMsgIndex].content === '') {
                         chatLogger.info(`在流错误后清理 ${aiChar?.name} 的空占位消息。`); // 中文注释
                         updatedMessages.splice(lastMsgIndex, 1); return updatedMessages;
                     } return prevMessages;
                 });
                 // --- 流式错误处理，顺序模式下触发下一个 ---
                 setRespondedInTurnAIIds(prev => new Set(prev).add(aiCharacterId));
                 if (sequentialTriggerLock.current[aiCharacterId]) {
                     sequentialTriggerLock.current[aiCharacterId] = false;
                     chatLogger.info(`顺序锁已为 ${aiChar?.name} 释放 (流错误)。`); // 中文注释
                 }
                 setMessages(prevMsgs => {
                      if (!scheduleTriggerLock.current) {
                          scheduleTriggerLock.current = true;
                          chatLogger.info(`计划在 ${aiChar?.name} 流错误后检查下一个触发。`); // 中文注释
                          setTimeout(() => {
                              scheduleTriggerLock.current = false;
                              chatLogger.info(`执行在 ${aiChar?.name} 流错误后计划的触发检查。`); // 中文注释
                              triggerNextSequentialAIRef.current?.(prevMsgs);
                          }, 1000);
                      } else {
                         chatLogger.warn(`在 ${aiChar?.name} 流错误后跳过重复的计划尝试。`); // 中文注释
                      }
                      return prevMsgs;
                 });
             }

             // --- 处理流式完成 ---
             if (chunk.done) {
                 chatLogger.info(`AI (${aiChar.name}) 流式响应完成。`); // 中文注释
                 setAILoadingState(prev => ({ ...prev, [aiCharacterId]: false }));

                 // 保存聊天记录 (适配导演模式快照)
                 if (chatSessionId && chatConfig) {
                     setMessages(currentMessages => {
                         const snapshotToSave: DirectorChatPageStateSnapshot = { // 使用导演模式快照类型
                             chatConfig,
                             messages: currentMessages,
                             directorInputValue, // 保存导演输入框内容
                             directorInputMode, // 保存导演输入模式
                             systemPrompts,
                             chatSessionId,
                             isStreamingEnabled,
                             selectedTargetAIIds,
                         };
                         window.electronAPI.saveChatSession(chatSessionId, snapshotToSave)
                           .then(() => chatLogger.info(`AI (${aiChar.name}) 回复后聊天记录已保存`)) // 中文注释
                           .catch(err => message.error(`保存聊天记录失败: ${err}`)); // 中文注释
                         return currentMessages;
                     });
                 }

                 // --- 流式完成处理，顺序模式下触发下一个 ---
                 setRespondedInTurnAIIds(prev => new Set(prev).add(aiCharacterId));
                 if (sequentialTriggerLock.current[aiCharacterId]) {
                     sequentialTriggerLock.current[aiCharacterId] = false;
                     chatLogger.info(`顺序锁已为 ${aiChar?.name} 释放 (流完成)。`); // 中文注释
                 }
                 setMessages(prevMsgs => {
                      if (!scheduleTriggerLock.current) {
                          scheduleTriggerLock.current = true;
                          chatLogger.info(`计划在 ${aiChar?.name} 流完成后检查下一个触发。`); // 中文注释
                          setTimeout(() => {
                              scheduleTriggerLock.current = false;
                              chatLogger.info(`执行在 ${aiChar?.name} 流完成后计划的触发检查。`); // 中文注释
                              triggerNextSequentialAIRef.current?.(prevMsgs);
                          }, 1000);
                      } else {
                          chatLogger.warn(`在 ${aiChar?.name} 流完成后跳过重复的计划尝试。`); // 中文注释
                      }
                      return prevMsgs;
                 });
             }
         }; // handleStreamChunk 结束

         chatLogger.info('注册统一流监听器...'); // 中文注释
         const disposeHandle = window.electronAPI.onLLMStreamChunk(handleStreamChunk as (data: unknown) => void);

         return () => {
             chatLogger.info('清理统一流监听器...'); // 中文注释
             disposeHandle.dispose();
         };
     }, [
         initializationError, aiCharacters, chatConfig, chatSessionId, isStreamingEnabled,
         systemPrompts, setRespondedInTurnAIIds,
         // 添加缺失的依赖项，因为 handleStreamChunk 内部的 snapshotToSave 用到了它们
         directorInputMode, directorInputValue, selectedTargetAIIds
     ]);

   // --- 处理导演操作（发送指令/旁白）---
   const handleDirectorAction = () => {
       if (!directorInputValue.trim() && directorInputMode === 'command') { // 指令模式下不能为空
            message.warning('导演指令不能为空！'); // 中文注释
            return;
       }
       const isAnyAILoading = Object.values(aiLoadingState).some(loading => loading);
        if (isAnyAILoading) {
            message.warning('请等待当前 AI 回复完成后再发出指令或旁白。'); // 中文注释
            return;
        }
        // 允许不选择任何 AI，只添加记录
        // if (selectedTargetAIIds.length === 0) {
        //     message.warning('请至少选择一个目标 AI！'); // 中文注释
        //     return;
        // }

       const messageContent = directorInputValue.trim();
       let specialMessage: ChatMessage;

       if (directorInputMode === 'command') {
           // 格式化指令内容，包含目标信息
           const targetNames = selectedTargetAIIds
               .map(id => aiCharacters.find(c => c.id === id)?.name)
               .filter(Boolean)
               .join(', ');
           const formattedContent = `[指令 -> ${targetNames || '无特定目标'}]: ${messageContent}`;
           specialMessage = {
               role: 'user', // 伪装成 user
               characterId: DIRECTOR_COMMAND_ID,
               characterName: '导演指令', // 中文注释
               content: formattedContent, // 完整内容，包含目标信息和指令
               timestamp: Date.now(),
           };
       } else { // narration
           specialMessage = {
               role: 'user', // 伪装成 user
               characterId: NARRATOR_ID,
               characterName: '旁白', // 中文注释
               content: `[旁白]: ${messageContent}`, // 添加前缀
               timestamp: Date.now(),
           };
       }

       const updatedMessages = [...messages, specialMessage];
       setMessages(updatedMessages);
       setDirectorInputValue(''); // 清空输入框

       // 保存聊天记录
       if (chatSessionId && chatConfig) {
           const snapshotToSave: DirectorChatPageStateSnapshot = {
               chatConfig, messages: updatedMessages, directorInputValue: '', directorInputMode,
               systemPrompts, chatSessionId, isStreamingEnabled, selectedTargetAIIds,
           };
           window.electronAPI.saveChatSession(chatSessionId, snapshotToSave)
               .then(() => chatLogger.info('导演操作后聊天记录已保存')) // 中文注释
               .catch(err => message.error(`保存聊天记录失败: ${err}`)); // 中文注释
       }

       // 如果选中了目标 AI，则触发顺序回复
       if (selectedTargetAIIds.length > 0) {
           const targetAIs = selectedTargetAIIds
               .map(id => aiCharacters.find((c: AICharacter) => c.id === id))
               .filter((c): c is AICharacter => !!c);

           chatLogger.info(`导演操作触发顺序模式：开始序列，包含 ${targetAIs.length} 个 AI。`); // 中文注释
           setRespondedInTurnAIIds(new Set());
           sequentialTriggerLock.current = {};
           scheduleTriggerLock.current = false;
           // setNextSequentialAIIndex(0); // 索引由 triggerNextSequentialAI 内部管理

           setTimeout(() => {
               triggerNextSequentialAIRef.current?.(updatedMessages); // 使用更新后的消息列表
           }, 0);
       } else {
            chatLogger.info('导演操作未选择目标 AI，仅记录消息。'); // 中文注释
       }
   };

    // --- 处理重演 ---
    const handleRetryMessage = async (messageIndex: number) => {
        const targetMessage = messages[messageIndex];
        if (!targetMessage || targetMessage.role !== 'assistant' || aiLoadingState[targetMessage.characterId]) {
            chatLogger.warn('无法重演非 AI 消息或正在加载中的消息。'); // 中文注释
            return;
        }

        const aiCharToRetry = aiCharacters.find(c => c.id === targetMessage.characterId);
        if (!aiCharToRetry) {
            message.error('找不到要重演的角色信息！'); // 中文注释
            return;
        }

        chatLogger.info(`尝试重演角色 ${aiCharToRetry.name} 的消息 (索引: ${messageIndex})`); // 中文注释

        // 获取到目标消息之前的所有历史记录
        const historyForRetry = messages.slice(0, messageIndex);

        // 移除旧消息，并插入一个临时的加载占位符（可选，但可以提供反馈）
        // const tempMessages = [...historyForRetry]; // 移除未使用的变量
        // setMessages(tempMessages); // 暂时不加占位符，直接替换

        // 调用 sendToSingleAI 发送重演请求
        // 注意：sendToSingleAI 内部会处理流式和非流式，并添加新消息
        // 我们需要在它完成后，手动替换掉原来的消息（如果是非流式）或更新占位符（如果是流式）
        // 为了简化，这里我们假设 sendToSingleAI 能正确处理，并在流结束后更新 messages 状态
        // 但我们需要一种方法来标识这次调用是重演，以便在流结束后替换而不是追加

        // 简化的重演逻辑：直接调用 sendToSingleAI，让它追加新消息，然后我们手动删除旧消息？
        // 或者修改 sendToSingleAI 接收一个可选参数 indicating retry?

        // 方案一：调用后删除旧消息 (可能导致顺序问题和 UI 跳动)
        // sendToSingleAI(aiCharToRetry, historyForRetry);
        // setMessages(prev => prev.filter((_, index) => index !== messageIndex)); // 不太好

        // 方案二：修改 sendToSingleAI (更复杂)

        // 方案三：模拟调用，获取结果后替换 (只适用于非流式，或者需要特殊处理流式)
        // 这里暂时只实现非流式重演的简单逻辑，流式重演需要更复杂的处理
        if (isStreamingEnabled) {
            message.warning('流式模式下的重演功能暂未完全实现，可能行为不符合预期。'); // 中文注释，修正：使用 message.warning
            // 可以在这里添加流式重演的特殊逻辑，比如记录要替换的索引，在 onLLMStreamChunk 完成时替换
        }

        // 尝试直接调用，让它追加，然后我们再处理 (可能需要调整)
        // 先标记一下，表示正在重演这条消息
        setAILoadingState(prev => ({ ...prev, [aiCharToRetry.id]: true })); // 标记为加载中

        // 模拟发送（这里需要调用实际的发送逻辑，并处理结果）
        // 假设我们有一个修改版的 sendToSingleAI 或者一个新的函数 handleRetrySend
        // 这里暂时用 console.log 模拟
        chatLogger.info(`[模拟] 正在为 ${aiCharToRetry.name} 基于 ${historyForRetry.length} 条历史重演...`);
        // 模拟异步操作
        await new Promise(resolve => setTimeout(resolve, 1500));
        const newContent = `[重演] 这是 ${aiCharToRetry.name} 的新回复 - ${Date.now()}`;
        const newMessage: ChatMessage = {
            role: 'assistant',
            characterId: aiCharToRetry.id,
            characterName: aiCharToRetry.name,
            content: newContent,
            timestamp: Date.now(),
        };

        // 替换旧消息
        setMessages(prev => {
            const newMsgs = [...prev];
            if (newMsgs[messageIndex]?.characterId === aiCharToRetry.id) { // 再次确认索引没问题
                newMsgs[messageIndex] = newMessage;
                chatLogger.info(`消息索引 ${messageIndex} 已被重演结果替换。`); // 中文注释
            } else {
                chatLogger.error(`重演替换失败，索引 ${messageIndex} 处的角色 ID 不匹配！`); // 中文注释
                // 如果替换失败，可能需要将新消息追加到末尾或其他处理
                newMsgs.push(newMessage);
            }
            return newMsgs;
        });
        setAILoadingState(prev => ({ ...prev, [aiCharToRetry.id]: false })); // 取消加载状态

        // 重演后是否需要触发后续 AI？根据产品逻辑决定，目前不触发
    };


    // --- 输入处理 ---
    const handleDirectorInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => { setDirectorInputValue(e.target.value); };
    const handleDirectorInputModeChange = (e: RadioChangeEvent) => { setDirectorInputMode(e.target.value); };
    const handleDirectorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const isAnyAILoading = Object.values(aiLoadingState).some(loading => loading);
        if (e.key === 'Enter' && !e.shiftKey && !isAnyAILoading) {
            e.preventDefault(); handleDirectorAction();
        }
    };

    // --- 控制项处理函数 (保持不变) ---
    const handleTargetAIChange = (checkedValues: (string | number | boolean)[]) => {
        const newSelectedIds = checkedValues as string[];
        setSelectedTargetAIIds(prevSelectedIds => {
            const newlyAdded = newSelectedIds.filter(id => !prevSelectedIds.includes(id));
            const removed = prevSelectedIds.filter(id => !newSelectedIds.includes(id));
            let updatedOrderedIds = prevSelectedIds.filter(id => !removed.includes(id));
            updatedOrderedIds = [...updatedOrderedIds, ...newlyAdded];
            chatLogger.info('选中的目标 AI ID 已更改 (有序):', updatedOrderedIds); // 中文注释
            return updatedOrderedIds;
        });
    };

    // --- 消息渲染 (适配导演模式) ---
    const renderMessage = (item: ChatMessage, index: number) => { // 添加 index 参数用于重演
        const isAssistant = item.role === 'assistant';
        const isDirectorCommand = item.characterId === DIRECTOR_COMMAND_ID;
        const isNarrator = item.characterId === NARRATOR_ID;
        const isLoading = isAssistant && aiLoadingState[item.characterId];

        // 导演指令和旁白样式
        const specialMessageStyle: React.CSSProperties = {
            color: '#888',
            fontStyle: 'italic',
            textAlign: 'center',
            margin: '10px 20px',
            fontSize: '13px',
        };

        if (isDirectorCommand || isNarrator) {
            return (
                <List.Item style={{ borderBottom: 'none', padding: '0', display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                    <div style={specialMessageStyle}>
                        <Typography.Text type="secondary">
                            {item.content} ({new Date(item.timestamp).toLocaleTimeString()})
                        </Typography.Text>
                    </div>
                </List.Item>
            );
        }

        // AI 角色消息样式 (与之前类似，但添加重演按钮)
        const contentStyle: React.CSSProperties = {
            display: 'inline-block', padding: '10px 14px', borderRadius: '12px',
            backgroundColor: (isLoading && item.content === '' ? '#e6f7ff' : '#f0f0f0'), // 用户消息颜色去掉了
            color: 'black', maxWidth: '85%', textAlign: 'left',
            fontSize: '15px', lineHeight: '1.6', margin: '0 0 0 10px', // AI 消息总是在左边
            opacity: isLoading && item.content === '' ? 0.8 : 1,
            position: 'relative', // 为了重演按钮定位
        };
        const nameTimeStyle: React.CSSProperties = {
            display: 'block', marginBottom: '2px', fontSize: '12px', color: '#888',
            textAlign: 'left', margin: '0 0 0 10px', // AI 消息总是在左边
        };

        return (
            <List.Item style={{ borderBottom: 'none', padding: '0', display: 'flex', justifyContent: 'flex-start', marginBottom: '10px' }}>
                <div>
                    <Typography.Text strong style={nameTimeStyle}>
                        {item.characterName}{' '}
                        {isLoading && <Spin size="small" style={{ marginLeft: '5px' }} />}
                        {' '}{new Date(item.timestamp).toLocaleTimeString()}
                    </Typography.Text>
                    <div style={contentStyle}>
                        {item.content === '' && isLoading ? ( <Spin size="small" style={{ display: 'inline-block' }} /> ) : (
                            item.content?.split('\n').map((line, i) => ( <span key={i}>{line}<br /></span> ))
                        )}
                        {/* 重演按钮，只对已完成的 AI 消息显示 */}
                        {isAssistant && !isLoading && item.content !== '' && (
                            <Button
                                icon={<ReloadOutlined />}
                                size="small"
                                type="text"
                                onClick={() => handleRetryMessage(index)}
                                style={{ position: 'absolute', top: '-5px', right: '-30px', opacity: 0.5 }} // 调整位置和透明度
                                title="重演此条回复" // 中文注释
                            />
                        )}
                    </div>
                </div>
            </List.Item>
        );
    };

    // --- 渲染逻辑 (适配导演模式) ---
    if (initializationError) {
        return <div style={{ padding: 20 }}><Typography.Text type="danger">{initializationError}</Typography.Text></div>;
    }
    if (!chatConfig) { // 导演模式不依赖 userCharacter
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 100px)' }}>
                <Spin tip="加载导演模式配置中..." size="large" /> {/* 中文注释 */}
            </div>
        );
    }
    const isOverallLoading = Object.values(aiLoadingState).some(loading => loading);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 5px)' }}>
            {/* 头部 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', margin: '10px 0', flexShrink: 0 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => {
                    // 返回导演模式设置页
                    const setupNavInfo = getLastVisitedNavInfo('directorModeSetup', '/director-mode-setup');
                    navigate(setupNavInfo.path, { state: setupNavInfo.internalState });
                }} style={{ position: 'absolute', left: 10 }} aria-label="返回导演设置" /> {/* 中文注释 */}
                <div style={{ textAlign: 'center' }}>
                    <Typography.Title level={4} style={{ margin: 0, lineHeight: 1.2 }}>导演模式 - 剧本：{chatConfig.script.title}</Typography.Title> {/* 中文注释 */}
                    <Typography.Text type="secondary" style={{ fontSize: '12px' }}>AI 演员：{aiCharacters.map(c => c.name).join(', ')}</Typography.Text> {/* 中文注释 */}
                </div>
            </div>
            {/* AI 选择控制 */}
            <Card size="small" style={{ margin: '0 10px 10px 10px', flexShrink: 0 }}>
                <Row gutter={16} align="middle">
                    <Col flex="auto">
                        <Typography.Text strong>选择本轮目标 AI (按顺序)：</Typography.Text> {/* 中文注释 */}
                        <Checkbox.Group
                            value={selectedTargetAIIds}
                            onChange={handleTargetAIChange}
                            disabled={isOverallLoading}
                            style={{ display: 'inline-block' }}
                        >
                            {aiCharacters.map((ai: AICharacter) => {
                                const isSelected = selectedTargetAIIds.includes(ai.id);
                                let displayLabel = ai.name;
                                if (isSelected) {
                                    const indexInSelectionOrder = selectedTargetAIIds.indexOf(ai.id);
                                    if (indexInSelectionOrder !== -1) {
                                        displayLabel += ` (${indexInSelectionOrder + 1})`;
                                    }
                                }
                                return (
                                    <Checkbox key={ai.id} value={ai.id} style={{ marginRight: 8 }}>
                                        {displayLabel}
                                    </Checkbox>
                                );
                            })}
                        </Checkbox.Group>
                    </Col>
                </Row>
            </Card>
            {/* 聊天区域 */}
            <Card variant="borderless" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', background: colorBgContainer, padding: 0, margin: '0 10px 10px 10px', overflow: 'hidden' }} styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' } }}>
                {/* 消息列表 */}
                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px' }}>
                    {messages.length === 0 ? (
                        <Empty description="导演，请开始你的表演指导！" style={{ paddingTop: '20vh' }} /> // 中文注释
                    ) : (
                        // 将 index 传递给 renderMessage
                        <List dataSource={messages} renderItem={(item, index) => renderMessage(item, index)} split={false} />
                    )}
                    <div ref={messagesEndRef} />
                </div>
                {/* 导演输入区域 */}
                <div style={{ position: 'relative', padding: '10px', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
                    <Input.TextArea
                        placeholder={directorInputMode === 'command' ? "输入导演指令... (Shift+Enter 换行)" : "输入旁白/场景描述... (Shift+Enter 换行)"} // 中文注释
                        value={directorInputValue}
                        onChange={handleDirectorInputChange}
                        onKeyDown={handleDirectorKeyDown}
                        disabled={isOverallLoading}
                        autoSize={{ minRows: 3, maxRows: 3 }}
                        style={{ paddingBottom: '40px', paddingRight: '150px', resize: 'none', fontSize: '15px', lineHeight: '1.6', overflowY: 'auto' }} // 留出更多右侧空间
                    />
                    {/* 输入模式切换 + 流式开关 */}
                    <div style={{ position: 'absolute', bottom: '18px', right: '95px', zIndex: 1, display: 'flex', alignItems: 'center', gap: '15px' }}>
                         <Radio.Group onChange={handleDirectorInputModeChange} value={directorInputMode} size="small" buttonStyle="solid" disabled={isOverallLoading}>
                            <Radio.Button value="command"><EditOutlined /> 指令</Radio.Button> {/* 中文注释 */}
                            <Radio.Button value="narration"><MessageOutlined /> 旁白</Radio.Button> {/* 中文注释 */}
                        </Radio.Group>
                        <Space size="small" direction="vertical" align="center">
                            <Switch checked={isStreamingEnabled} onChange={setIsStreamingEnabled} size="small" disabled={isOverallLoading} />
                            <Typography.Text style={{ fontSize: '12px', color: '#888' }}>流式</Typography.Text> {/* 中文注释 */}
                        </Space>
                    </div>
                    {/* 发送按钮 */}
                    <Button
                        type="primary"
                        icon={<SendOutlined />}
                        onClick={handleDirectorAction}
                        loading={isOverallLoading}
                        // 允许在未选择目标 AI 时仅插入旁白
                        disabled={isOverallLoading || (directorInputMode === 'command' && !directorInputValue.trim())}
                        style={{ position: 'absolute', bottom: '18px', right: '18px', zIndex: 1 }} // 调整按钮位置
                        title={selectedTargetAIIds.length > 0 ? "发送并触发选中 AI" : (directorInputMode === 'narration' ? "仅插入旁白" : "发送指令（无目标）")} // 中文注释
                    />
                </div>
            </Card>
        </div>
    );
}; // 组件函数结束

export default DirectorModeInterfacePage;