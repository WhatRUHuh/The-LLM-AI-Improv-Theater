import React, { useState, useEffect, useRef, useCallback, useMemo, FC } from 'react'; // 导入函数组件类型 FC
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Input, Button, List, Spin, message, Typography, Card, Empty, Switch,
    Space, theme, Checkbox, Radio, Tooltip, Row, Col, RadioChangeEvent
} from 'antd';
import {
    SendOutlined, ArrowLeftOutlined, SyncOutlined, OrderedListOutlined
    // Removed unused QuestionCircleOutlined
} from '@ant-design/icons';
import type {
    AICharacter,
    ChatConfig,
    ChatMessage,
    ChatPageStateSnapshot,
} from '../types';
import type { LLMChatOptions, StreamChunk } from '../../electron/llm/BaseLLM';
import { useLastVisited } from '../hooks/useLastVisited';
import { chatLogger } from '../utils/logger'; // 重命名后的导入别名

// --- 此页面特定的类型 ---
type AIResponseMode = 'simultaneous' | 'sequential'; // 同时或顺序回复模式

// 定义各 AI 的加载状态
type AILoadingState = Record<string, boolean>;

// 扩展 ChatPageStateSnapshot 用于多 AI 相关
interface MultiAIChatPageStateSnapshot extends Omit<ChatPageStateSnapshot, 'chatConfig' | 'systemPrompt'> {
    chatConfig: ChatConfig & { mode: 'singleUserMultiAI' };
    systemPrompts: Record<string, string>; // 存储所有系统提示词
    selectedTargetAIIds: string[];
    aiResponseMode: AIResponseMode;
    nextSequentialAIIndex?: number;
}

// --- 组件定义 ---
const SingleUserMultiAIInterfacePage: FC = () => {

    // --- 所有 Hook 必须声明在顶部 ---
    const location = useLocation();
    const navigate = useNavigate();
    const { updateLastVisitedNavInfo, getLastVisitedNavInfo } = useLastVisited();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState<string>('');
    const [aiLoadingState, setAILoadingState] = useState<AILoadingState>({});
    const [systemPrompts, setSystemPrompts] = useState<Record<string, string>>({});
    const [chatSessionId, setChatSessionId] = useState<string>('');
    const [isStreamingEnabled, setIsStreamingEnabled] = useState<boolean>(true);
    const [selectedTargetAIIds, setSelectedTargetAIIds] = useState<string[]>([]);
    const [aiResponseMode, setAiResponseMode] = useState<AIResponseMode>('simultaneous');
    const [nextSequentialAIIndex, setNextSequentialAIIndex] = useState<number>(0); // 保留，但作用可能减弱
    const [respondedInTurnAIIds, setRespondedInTurnAIIds] = useState<Set<string>>(new Set()); // 新增：记录本轮已回复的AI ID
    const [chatConfig, setChatConfig] = useState<(ChatConfig & { mode: 'singleUserMultiAI' }) | null>(null);
    const [initializationError, setInitializationError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const sequentialTriggerLock = useRef<Record<string, boolean>>({}); // <-- 原子锁 Ref (防止对同一个AI并发处理)
    const scheduleTriggerLock = useRef(false); // <-- 调度锁 Ref (防止并发调度setTimeout)
    const { token: { colorBgContainer } } = theme.useToken();

    // --- 记忆化派生状态 ---
    const userCharacter: AICharacter | undefined = useMemo(() =>
        chatConfig?.participatingCharacters.find((c: AICharacter) => c.id === chatConfig?.userCharacterId),
        [chatConfig]
    );
    const aiCharacters: AICharacter[] = useMemo(() =>
        chatConfig?.participatingCharacters.filter((c: AICharacter) => c.id !== chatConfig?.userCharacterId) ?? [],
        [chatConfig]
    );

    // --- 初始状态计算函数 ---
    const calculateAndSetInitialState = useCallback(() => {
        const restoredState = location.state as MultiAIChatPageStateSnapshot | ChatConfig | undefined;
        let errorMsg: string | null = null;
        let configToSet: (ChatConfig & { mode: 'singleUserMultiAI' }) | null = null;
        let messagesToSet: ChatMessage[] = [];
        let inputToSet = '';
        let promptsToSet: Record<string, string> = {};
        let sessionIdToSet = '';
        let streamingToSet = true;
        let targetsToSet: string[] = [];
        let responseModeToSet: AIResponseMode = 'simultaneous';
        const loadingStateToSet: AILoadingState = {};
        let seqIndexToSet = 0;

        if (restoredState) {
            if ('messages' in restoredState && 'chatConfig' in restoredState && restoredState.chatConfig?.mode === 'singleUserMultiAI') {
                chatLogger.info('Restoring full state snapshot for Multi AI');
                const snapshot = restoredState as MultiAIChatPageStateSnapshot;
                configToSet = snapshot.chatConfig;
                messagesToSet = snapshot.messages ?? [];
                inputToSet = snapshot.inputValue ?? '';
                promptsToSet = snapshot.systemPrompts ?? {};
                sessionIdToSet = snapshot.chatSessionId ?? '';
                streamingToSet = snapshot.isStreamingEnabled ?? true;
                targetsToSet = snapshot.selectedTargetAIIds ?? [];
                responseModeToSet = snapshot.aiResponseMode ?? 'simultaneous';
                seqIndexToSet = snapshot.nextSequentialAIIndex ?? 0;
                // 注意：respondedInTurnAIIds 是瞬态的，通常不需要从快照恢复，每次会话开始时重置

            } else if (!('messages' in restoredState) && restoredState.mode === 'singleUserMultiAI') {
                chatLogger.info('Initializing from ChatConfig for Multi AI');
                configToSet = restoredState as (ChatConfig & { mode: 'singleUserMultiAI' });
            } else {
                errorMsg = '无效的聊天状态，请返回重新设置。';
                chatLogger.error('Invalid state received for Multi AI page:', restoredState);
            }
        } else {
            errorMsg = '缺少聊天配置信息，请返回重新设置。';
            chatLogger.error('No state received for Multi AI page.');
        }

        if (!errorMsg && (!configToSet || configToSet.mode !== 'singleUserMultiAI' || !configToSet.userCharacterId || configToSet.participatingCharacters.length < 2)) {
            errorMsg = '聊天配置信息无效或不完整。';
            chatLogger.error('Calculated initial chatConfig is invalid:', configToSet);
            configToSet = null;
        }

        if (errorMsg) {
            setInitializationError(errorMsg);
            message.error(errorMsg);
            navigate('/chat-mode-selection', { replace: true });
        } else if (configToSet) {
            setChatConfig(configToSet);
            setMessages(messagesToSet);
            setInputValue(inputToSet);
            setSystemPrompts(promptsToSet);
            setChatSessionId(sessionIdToSet);
            setIsStreamingEnabled(streamingToSet);
            setSelectedTargetAIIds(targetsToSet);
            setAiResponseMode(responseModeToSet);
            setAILoadingState(loadingStateToSet);
            setNextSequentialAIIndex(seqIndexToSet); // 恢复旧索引，但可能在启动时被重置
            setRespondedInTurnAIIds(new Set()); // 初始化为空集合
            setInitializationError(null);
        } else {
             const fallbackError = '无法初始化聊天配置。';
             setInitializationError(fallbackError);
             message.error(fallbackError);
             navigate('/chat-mode-selection', { replace: true });
        }
    }, [location.state, navigate]);

    // --- useEffect 用于初始化状态 ---
    useEffect(() => {
        calculateAndSetInitialState();
    }, [calculateAndSetInitialState]);

    // --- useEffect 用于生成 prompts 和会话 ID（如有需要） ---
    useEffect(() => {
        let didCancel = false;
        if (initializationError || !chatConfig || (Object.keys(systemPrompts).length > 0 && chatSessionId)) {
            return;
        }

         chatLogger.info('Multi AI: Generating prompts and session ID...');
         const newPrompts: Record<string, string> = {}; // 存储新生成的提示词
         const currentAiChars = aiCharacters;      // 当前所有 AI 角色
         const currentUserChar = userCharacter;   // 当前用户扮演的角色

         // 检查角色是否存在
         if (!currentUserChar || currentAiChars.length === 0) {
              chatLogger.error("Multi AI: Cannot find user/AI characters for prompt generation.");
              return; // 如果缺少角色信息，则无法继续
         }

         // --- 1. 生成剧本设定部分 ---
         // 确保这里的 key 都是 Script 类型中真实存在的
         const scriptFields: (keyof ChatConfig['script'])[] = [
             'title', 'scene', 'genre', 'setting', 'synopsis', 'mood', 'themes', 'tags' 
         ];
         const scriptSettings = scriptFields
             .map(key => {
                 const value = chatConfig.script[key];
                 // 对标签数组特殊处理
                 if (key === 'tags' && Array.isArray(value) && value.length > 0) {
                     return `标签: ${value.join(', ')}`;
                 }
                 // 其他字段，如果存在且非空字符串则包含
                 if (typeof value === 'string' && value.trim()) {
                     // 为 key 添加中文标签（这里可以映射）
                     const labelMap: Record<string, string> = {
                         title: '剧本名字', scene: '场景描述', genre: '类型/题材', setting: '时代/背景设定',
                         synopsis: '剧情梗概', mood: '氛围/基调', theme: '主题'
                     };
                     return `${labelMap[key] || key}: ${value.trim()}`;
                 }
                 return null; // 忽略空字段或非字符串/标签数组字段
             })
             .filter(Boolean) // 过滤掉 null
             .join('\n'); // 用换行符连接

         // --- 2. 生成出场人物设定部分 (对所有 AI 隐藏其他人的秘密) ---
         const characterFields: (keyof AICharacter)[] = [
             'name', 'identity', 'gender', 'age', 'personality', 'background',
             'appearance', 'abilities', 'goals', 'secrets', 'relationships',
             'mannerisms', 'voiceTone', 'catchphrase', 'notes'
         ];
         // Helper function to format character details, optionally hiding secrets
         const formatCharacterDetails = (char: AICharacter, hideSecrets: boolean): string => {
            return characterFields
                .map(key => {
                    // 如果是 'secrets' 字段且需要隐藏，则跳过
                    if (hideSecrets && key === 'secrets') {
                        return null;
                    }
                    const value = char[key];
                     // 对标签数组或关系数组特殊处理 (如果 future proofing)
                     // if ((key === 'tags' || key === 'relationships') && Array.isArray(value) && value.length > 0) {
                     //     return `${key}: ${value.join(', ')}`;
                     // }
                    if (value !== undefined && value !== null && String(value).trim() !== '') {
                         // 添加中文标签（可以扩展这个映射）
                         const labelMap: Record<string, string> = {
                              name: '姓名', identity: '身份', gender: '性别', age: '年龄', personality: '性格',
                              background: '背景故事', appearance: '外貌描述', abilities: '能力/特长',
                              goals: '目标/动机', secrets: '秘密', relationships: '人物关系',
                              mannerisms: '言行举止/小动作', voiceTone: '说话音调/风格',
                              catchphrase: '口头禅', notes: '其他备注'
                         };
                        return `  ${labelMap[key] || key}: ${String(value).trim()}`; // 两空格缩进
                    }
                    return null;
                })
                .filter(Boolean)
                .join('\n');
         };

         // --- 3. 为每个 AI 生成专属提示词 ---
         currentAiChars.forEach((aiChar: AICharacter) => {

            // --- 3a. 生成对【其他角色】(包括用户)的描述，隐藏秘密 ---
            const otherCharacterDescriptions = chatConfig.participatingCharacters
                .filter(c => c.id !== aiChar.id) // 排除当前 AI 自己
                .map(otherChar => {
                    const details = formatCharacterDetails(otherChar, true); // hideSecrets = true
                    return `${otherChar.name}:\n${details}`;
                })
                .join('\n\n'); // 其他角色之间空一行

            // --- 3b. 生成对【当前 AI 自己】的描述，包含秘密 ---
            const ownCharacterDescription = formatCharacterDetails(aiChar, false); // hideSecrets = false

            // --- 3c. 组装最终提示词 ---
            const prompt = `你现在正在参与一个 AI 即兴剧场。\n\n` +
                           `=== 剧本设定 ===\n${scriptSettings || '无'}\n\n` + // 如果没设定则显示“无”
                           `=== 出场人物设定 (他人信息已隐藏秘密) ===\n${otherCharacterDescriptions || '无其他角色'}\n\n` +
                           `--- 你的重要任务 ---\n` +
                           `你的任务是扮演以下角色，这是你的【完整】设定（包括你的秘密）：\n` +
                           `**${aiChar.name}**:\n${ownCharacterDescription}\n\n` +
                           `--- 表演规则 ---\n` +
                           `1. 对话历史中的发言会以 "角色名: 内容" 的格式呈现。\n` +
                           `2. 你必须只输出你扮演的角色 **(${aiChar.name})** 的对话内容。\n` +
                           `3. 输出内容**不要**包含角色名和冒号 (例如，不要输出 "${aiChar.name}: 你好")。\n` +
                           `4. **不要**进行任何与角色扮演无关的评论或解释。\n` +
                           `5. 再次强调，你是 **${aiChar.name}**！请全身心投入角色！\n\n` +
                           `现在，请根据对话历史，开始你的表演：`;

             newPrompts[aiChar.id] = prompt; // 存储生成的提示词
             chatLogger.info(`Generated NEW detailed & privacy-aware system prompt for ${aiChar.name}`); // 更新日志信息
         });

        if (!didCancel) {
            if (Object.keys(systemPrompts).length === 0) {
                setSystemPrompts(newPrompts);
            }
            if (!chatSessionId) {
                const newSessionId = `${chatConfig.script.id}-${Date.now()}`;
                setChatSessionId(newSessionId);
                chatLogger.info(`Generated new chat session ID: ${newSessionId}`);
            }
             if(selectedTargetAIIds.length === 0) {
                setSelectedTargetAIIds(currentAiChars.map((c: AICharacter) => c.id));
             }
        }

        return () => { didCancel = true; };
    }, [initializationError, chatConfig, userCharacter, aiCharacters, systemPrompts, chatSessionId, selectedTargetAIIds.length]);

    // --- useEffect 用于保存状态到上下文 ---
    useEffect(() => {
        if (!initializationError && chatConfig && chatSessionId && Object.keys(systemPrompts).length > 0) {
            const currentStateSnapshot: MultiAIChatPageStateSnapshot = {
                chatConfig, messages, inputValue, systemPrompts, chatSessionId,
                isStreamingEnabled, selectedTargetAIIds, aiResponseMode, nextSequentialAIIndex, // respondedInTurnAIIds 不保存
            };
            updateLastVisitedNavInfo('singleUserMultiAIInterface', location.pathname, undefined, currentStateSnapshot);
        }
    }, [
        messages, inputValue, chatConfig, systemPrompts, chatSessionId,
        isStreamingEnabled, selectedTargetAIIds, aiResponseMode, nextSequentialAIIndex, // 移除 respondedInTurnAIIds
        initializationError, updateLastVisitedNavInfo, location.pathname
    ]);

    // --- useEffect 用于滚动 ---
    useEffect(() => {
        if (!initializationError) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, initializationError]);

    // --- triggerNextSequentialAI 前置声明 ---
    // 需要这样做，因为 sendToSingleAI 依赖 triggerNextSequentialAI，反之亦然
    const triggerNextSequentialAIRef = useRef<(currentHistory: ChatMessage[]) => void>(undefined);

    // --- useCallback 用于发送消息给单个 AI ---
    const sendToSingleAI = useCallback(async (aiChar: AICharacter, history: ChatMessage[]) => {
        // 强化锁：在函数入口处再次检查加载状态，防止并发调用执行核心逻辑
        if (aiLoadingState[aiChar.id]) {
            chatLogger.warn(`sendToSingleAI called for ${aiChar.name} while it was already loading. Ignoring duplicate call.`);
            return; // 如果已经在加载中，则直接返回，不再执行后续逻辑
        }

        if (!chatConfig || !systemPrompts[aiChar.id] || !chatSessionId || initializationError) {
            chatLogger.warn(`Cannot send message to ${aiChar.name}, missing config/prompt/session or init error.`);
            return; // 其他前置条件检查保持不变
        }
        const aiConfig = chatConfig.aiConfigs[aiChar.id];
        if (!aiConfig || !aiConfig.providerId || !aiConfig.model) {
            message.error(`AI角色 (${aiChar.name}) 的配置不完整！`);
            setAILoadingState(prev => ({ ...prev, [aiChar.id]: false }));
            return;
        }

        setAILoadingState(prev => ({ ...prev, [aiChar.id]: true }));

        try {
            const llmHistory = history.map(msg => ({
                role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
                content: `${msg.characterName}: ${msg.content}` // 保留前缀用于上下文
            }));

            const options: LLMChatOptions = {
                model: aiConfig.model, messages: llmHistory,
                systemPrompt: systemPrompts[aiChar.id], stream: isStreamingEnabled,
            };

            chatLogger.info(`Sending request to ${aiChar.name} (${aiConfig.providerId}/${aiConfig.model}), Stream: ${isStreamingEnabled}`);

            if (isStreamingEnabled) {
                const placeholderMessage: ChatMessage = {
                    role: 'assistant', characterId: aiChar.id, characterName: aiChar.name, content: '', timestamp: Date.now(),
                };
                setMessages(prev => [...prev, placeholderMessage]);
                // 传入 aiCharacterId 作为第三个参数
                const startResult = await window.electronAPI.llmGenerateChatStream(aiConfig.providerId, options, aiChar.id);

                if (!startResult.success) {
                    message.error(`启动 AI (${aiChar.name}) 流式响应失败: ${startResult.error || '未知错误'}`);
                    setAILoadingState(prev => ({ ...prev, [aiChar.id]: false }));
                    setMessages(prev => prev.filter(m => !(m.characterId === aiChar.id && m.content === '' && m.role === 'assistant')));
                    // 流式监听器的错误处理会调用 triggerNextSequentialAI
                } else {
                    chatLogger.info(`AI (${aiChar.name}) 流式响应已启动。`);
                }
            } else {
                // --- 非流式 ---
                try {
                    const result = await window.electronAPI.llmGenerateChat(aiConfig.providerId, options);
                    chatLogger.info(`Received non-stream response from ${aiChar.name}:`, result);
                    if (result.success && result.data?.content) {
                        const aiResponse: ChatMessage = {
                            role: 'assistant', characterId: aiChar.id, characterName: aiChar.name,
                            content: result.data.content.trim(), timestamp: Date.now(),
                        };
                        setMessages(prev => [...prev, aiResponse]);
                        // --- 非流式顺序回复完成处理 ---
                        if (aiResponseMode === 'sequential') {
                            setRespondedInTurnAIIds(prev => new Set(prev).add(aiChar.id)); // 1. 标记完成
                             // 2. 释放原子锁
                             if (sequentialTriggerLock.current[aiChar.id]) {
                                 sequentialTriggerLock.current[aiChar.id] = false;
                                 chatLogger.info(`Sequential lock released for ${aiChar.name} after non-stream success.`);
                             }
                             // 3. 尝试调度触发下一个 (延迟执行)
                             setMessages(prevMsgs => {
                                 if (!scheduleTriggerLock.current) {
                                     scheduleTriggerLock.current = true; // 上调度锁
                                     chatLogger.info(`Scheduling next trigger check after ${aiChar.name} non-stream success.`);
                                     setTimeout(() => {
                                         scheduleTriggerLock.current = false; // 在执行前释放调度锁
                                         chatLogger.info(`Executing scheduled trigger check after ${aiChar.name} non-stream success.`);
                                         triggerNextSequentialAIRef.current?.(prevMsgs);
                                     }, 0);
                                 } else {
                                    chatLogger.warn(`Skipping duplicate schedule attempt after ${aiChar.name} non-stream success.`);
                                 }
                                 return prevMsgs;
                             });
                        }
                    } else {
                        // --- 非流式顺序回复失败处理 ---
                        message.error(`AI (${aiChar.name}) 回复失败: ${result.error || '未知错误'}`);
                         if (aiResponseMode === 'sequential') {
                            // 标记完成（失败也算完成）
                            setRespondedInTurnAIIds(prev => new Set(prev).add(aiChar.id)); // 1. 标记完成
                             // 2. 释放原子锁
                             if (sequentialTriggerLock.current[aiChar.id]) {
                                 sequentialTriggerLock.current[aiChar.id] = false;
                                 chatLogger.info(`Sequential lock released for ${aiChar.name} after non-stream failure.`);
                             }
                             // 3. 尝试调度触发下一个 (延迟执行)
                             setMessages(prevMsgs => {
                                  if (!scheduleTriggerLock.current) {
                                     scheduleTriggerLock.current = true; // 上调度锁
                                     chatLogger.info(`Scheduling next trigger check after ${aiChar.name} non-stream failure.`);
                                     setTimeout(() => {
                                         scheduleTriggerLock.current = false; // 在执行前释放调度锁
                                         chatLogger.info(`Executing scheduled trigger check after ${aiChar.name} non-stream failure.`);
                                         triggerNextSequentialAIRef.current?.(prevMsgs);
                                     }, 0);
                                  } else {
                                     chatLogger.warn(`Skipping duplicate schedule attempt after ${aiChar.name} non-stream failure.`);
                                  }
                                  return prevMsgs;
                             });
                         }
                    }
                } catch (error: unknown) {
                    // --- 非流式调用本身出错处理 ---
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    message.error(`调用 AI (${aiChar.name}) 时出错: ${errorMsg}`);
                     if (aiResponseMode === 'sequential') {
                        // 标记完成（出错也算完成）
                        setRespondedInTurnAIIds(prev => new Set(prev).add(aiChar.id)); // 1. 标记完成
                         // 2. 释放原子锁
                         if (sequentialTriggerLock.current[aiChar.id]) {
                             sequentialTriggerLock.current[aiChar.id] = false;
                             chatLogger.info(`Sequential lock released for ${aiChar.name} after non-stream catch.`);
                         }
                         // 3. 尝试调度触发下一个 (延迟执行)
                         setMessages(prevMsgs => {
                              if (!scheduleTriggerLock.current) {
                                  scheduleTriggerLock.current = true; // 上调度锁
                                  chatLogger.info(`Scheduling next trigger check after ${aiChar.name} non-stream catch.`);
                                  setTimeout(() => {
                                      scheduleTriggerLock.current = false; // 在执行前释放调度锁
                                      chatLogger.info(`Executing scheduled trigger check after ${aiChar.name} non-stream catch.`);
                                      triggerNextSequentialAIRef.current?.(prevMsgs);
                                  }, 0);
                              } else {
                                 chatLogger.warn(`Skipping duplicate schedule attempt after ${aiChar.name} non-stream catch.`);
                              }
                              return prevMsgs;
                        });
                     }
                } finally {
                    setAILoadingState(prev => ({ ...prev, [aiChar.id]: false }));
                    // 非流式的触发逻辑已在 try/catch 内部处理
                }
            }
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            message.error(`准备发送消息给 ${aiChar.name} 时出错: ${errorMsg}`);
            setAILoadingState(prev => ({ ...prev, [aiChar.id]: false }));
            // --- 外层 try...catch 的顺序回复失败处理 ---
            if (aiResponseMode === 'sequential') {
                 // 标记完成（外层catch出错也算完成）
                 setRespondedInTurnAIIds(prev => new Set(prev).add(aiChar.id)); // 1. 标记完成
                 // 2. 释放原子锁
                 if (sequentialTriggerLock.current[aiChar.id]) {
                     sequentialTriggerLock.current[aiChar.id] = false;
                     chatLogger.info(`Sequential lock released for ${aiChar.name} after outer catch.`);
                 }
                 // 3. 尝试调度触发下一个 (延迟执行)
                 setMessages(prevMsgs => {
                      if (!scheduleTriggerLock.current) {
                          scheduleTriggerLock.current = true; // 上调度锁
                          chatLogger.info(`Scheduling next trigger check after ${aiChar.name} outer catch.`);
                          setTimeout(() => {
                              scheduleTriggerLock.current = false; // 在执行前释放调度锁
                              chatLogger.info(`Executing scheduled trigger check after ${aiChar.name} outer catch.`);
                              triggerNextSequentialAIRef.current?.(prevMsgs);
                          }, 0);
                      } else {
                         chatLogger.warn(`Skipping duplicate schedule attempt after ${aiChar.name} outer catch.`);
                      }
                      return prevMsgs;
                 });
            }
        }
    // 依赖项 - 添加 setRespondedInTurnAIIds
    }, [
        chatConfig, systemPrompts, chatSessionId, isStreamingEnabled,
        initializationError, aiResponseMode, setMessages, setAILoadingState,
        setRespondedInTurnAIIds, aiLoadingState // 添加依赖
    ]);


    // --- useCallback 用于触发下一个顺序 AI (重写逻辑) ---
    const triggerNextSequentialAI = useCallback((currentHistory: ChatMessage[]) => {
        // 检查是否处于顺序模式且初始化无误
        if (aiResponseMode !== 'sequential' || initializationError || aiCharacters.length === 0) {
            return;
        }

        chatLogger.info('Sequential mode: Attempting to trigger next AI. Responded this turn:', Array.from(respondedInTurnAIIds));

        let foundNext = false; // 标记是否找到了下一个要触发的AI
        // 遍历用户选定的、按顺序排列的AI ID列表
        for (const targetId of selectedTargetAIIds) {
            // 三重检查：1. 是否已在本轮回复过？ 2. 是否当前正在加载中(State)? 3. 原子锁是否锁上(Ref)?
            if (!respondedInTurnAIIds.has(targetId) && !aiLoadingState[targetId] && !sequentialTriggerLock.current[targetId]) {
                // 找到了下一个要触发的、空闲的、且未回复的AI！
                const nextAI = aiCharacters.find((c: AICharacter) => c.id === targetId);
                if (nextAI) {
                    chatLogger.info(`Sequential mode: Found next available AI to trigger: ${nextAI.name}, applying locks.`);
                    // 立刻双重上锁：
                    sequentialTriggerLock.current[targetId] = true; // 1. 原子锁 (立刻生效)
                    setAILoadingState(prev => ({ ...prev, [targetId]: true })); // 2. 状态锁 (用于UI，可能延迟)
                    // 发送请求
                    sendToSingleAI(nextAI, currentHistory);
                    foundNext = true; // 标记已找到并触发
                    // 单次放行：触发一个后立刻结束本次检查，等待回调再触发下一次检查
                    break;
                } else {
                    // 虽然ID在列表中，但找不到对应的AI角色对象，记录错误并尝试跳过
                    chatLogger.error(`Sequential mode: Could not find AI character object for ID ${targetId}. Skipping.`);
                    // 将这个找不到的ID也标记为“已完成”并释放可能的锁（虽然理论上不会锁上）
                    setRespondedInTurnAIIds(prev => new Set(prev).add(targetId));
                    if (sequentialTriggerLock.current[targetId]) {
                         sequentialTriggerLock.current[targetId] = false; // 释放锁以防万一
                         chatLogger.warn(`Sequential lock released for non-existent AI ID: ${targetId}`);
                    }
                    // 继续循环查找下一个 *未响应* 且 *存在* 的 AI
                    continue;
                }
            }
            // 如果 respondedInTurnAIIds.has(targetId) 为 true，说明这个AI本轮已回复，继续检查下一个
        }

        // 如果遍历完所有选中的AI，都没有找到下一个需要触发的（即 foundNext 仍为 false）
        if (!foundNext) {
            chatLogger.info('Sequential mode: All selected AIs have responded in this turn.');
            // 不需要重置 respondedInTurnAIIds，它会在下一次用户发送消息时重置
            // 也不需要重置 nextSequentialAIIndex，因为我们不再主要依赖它来查找
        }
    // 依赖项：需要包含所有在函数内部使用的状态和回调
    }, [
        aiResponseMode, initializationError, aiCharacters, selectedTargetAIIds,
        respondedInTurnAIIds, aiLoadingState, // 确保 aiLoadingState 在依赖数组中
        sendToSingleAI, setRespondedInTurnAIIds, setAILoadingState // 其他依赖项
    ]); // 修正：useCallback 依赖项应包含 aiLoadingState

    // --- 在每次渲染时更新 ref (保持不变) ---
     useEffect(() => {
        triggerNextSequentialAIRef.current = triggerNextSequentialAI;
     });

     // --- useEffect 用于统一处理流式监听器 ---
     useEffect(() => {
         if (initializationError) return;

         const handleStreamChunk = (data: unknown) => {
             if (typeof data !== 'object' || data === null || !('chunk' in data) || !('sourceId' in data)) {
                 chatLogger.error('Received invalid stream data structure:', data);
                 return;
             }
             const { chunk, sourceId } = data as { chunk: StreamChunk, sourceId: string };
             const aiCharacterId = sourceId;

             if (!aiCharacterId) {
                 chatLogger.error('Stream chunk received without sourceId:', chunk);
                 return;
             }

             const aiChar = aiCharacters.find((c: AICharacter) => c.id === aiCharacterId);
             if (!aiChar) {
                 chatLogger.error(`Stream chunk received for unknown sourceId: ${aiCharacterId}`);
                 return;
             }

             // --- 更新消息内容 ---
             if (chunk.text) {
                 setMessages(prevMessages => {
                     let targetMessageIndex = -1;
                     for (let i = prevMessages.length - 1; i >= 0; i--) {
                         if (prevMessages[i].role === 'assistant' && prevMessages[i].characterId === aiCharacterId) {
                             targetMessageIndex = i;
                             break;
                         }
                     }
                     if (targetMessageIndex !== -1) {
                         const updatedMessages = [...prevMessages];
                         updatedMessages[targetMessageIndex] = {
                             ...updatedMessages[targetMessageIndex],
                             content: (updatedMessages[targetMessageIndex].content ?? '') + (chunk.text ?? ''),
                             timestamp: Date.now()
                         };
                         return updatedMessages;
                     } else {
                         chatLogger.warn(`Stream chunk text received for ${aiChar.name}, but no message found. Creating new.`);
                         const newMessage: ChatMessage = {
                            role: 'assistant', characterId: aiChar.id, characterName: aiChar.name,
                            content: chunk.text ?? '', timestamp: Date.now(),
                         };
                         return [...prevMessages, newMessage];
                     }
                 });
             }

             // --- 处理错误 ---
             if (chunk.error) {
                 message.error(`AI (${aiChar.name}) 流式响应出错: ${chunk.error}`);
                 setAILoadingState(prev => ({ ...prev, [aiCharacterId]: false }));
                 // 保留空消息清理逻辑
                 setMessages(prevMessages => {
                     const updatedMessages = [...prevMessages]; // 创建副本
                     let lastMsgIndex = -1;
                     // 从后往前找这个 AI 的最后一条消息
                     for (let i = updatedMessages.length - 1; i >= 0; i--) {
                         if (updatedMessages[i].role === 'assistant' && updatedMessages[i].characterId === aiCharacterId) {
                             lastMsgIndex = i;
                             break;
                         }
                     }
                     // 如果找到了且内容为空，则移除
                     if (lastMsgIndex !== -1 && updatedMessages[lastMsgIndex].content === '') {
                         chatLogger.info(`Cleaning up empty placeholder message for ${aiChar?.name} after stream error.`);
                         updatedMessages.splice(lastMsgIndex, 1);
                         return updatedMessages;
                     }
                     // 否则返回原始副本（无修改）
                     return prevMessages;
                 });
                 // --- 流式错误处理，顺序模式下触发下一个 ---
                 if (aiResponseMode === 'sequential') {
                    // 标记完成（流式错误也算完成）
                    setRespondedInTurnAIIds(prev => new Set(prev).add(aiCharacterId)); // 1. 标记完成
                     // 2. 释放原子锁
                     if (sequentialTriggerLock.current[aiCharacterId]) {
                         sequentialTriggerLock.current[aiCharacterId] = false;
                         chatLogger.info(`Sequential lock released for ${aiChar?.name} after stream error.`);
                     }
                    // 3. 尝试调度触发下一个 (延迟执行)
                    setMessages(prevMsgs => {
                         if (!scheduleTriggerLock.current) {
                             scheduleTriggerLock.current = true; // 上调度锁
                             chatLogger.info(`Scheduling next trigger check after ${aiChar?.name} stream error.`);
                             setTimeout(() => {
                                 scheduleTriggerLock.current = false; // 在执行前释放调度锁
                                 chatLogger.info(`Executing scheduled trigger check after ${aiChar?.name} stream error.`);
                                 triggerNextSequentialAIRef.current?.(prevMsgs);
                             }, 0);
                         } else {
                            chatLogger.warn(`Skipping duplicate schedule attempt after ${aiChar?.name} stream error.`);
                         }
                         return prevMsgs;
                    });
                 }
             }

             // --- 处理流式完成 ---
             if (chunk.done) {
                 chatLogger.info(`AI (${aiChar.name}) 流式响应完成。`);
                 setAILoadingState(prev => ({ ...prev, [aiCharacterId]: false })); // 更新加载状态

                 // 保存聊天记录 (保持不变)
                 if (chatSessionId && chatConfig) {
                     setMessages(currentMessages => {
                         const snapshotToSave: MultiAIChatPageStateSnapshot = {
                             chatConfig,
                             messages: currentMessages,
                             inputValue,
                             systemPrompts,
                             chatSessionId,
                             isStreamingEnabled,
                             selectedTargetAIIds,
                             aiResponseMode,
                             nextSequentialAIIndex
                         };
                         window.electronAPI.saveChatSession(chatSessionId, snapshotToSave)
                           .then(() => chatLogger.info(`AI (${aiChar.name}) 回复后聊天记录已保存`))
                           .catch(err => message.error(`保存聊天记录失败: ${err}`));
                         return currentMessages; // 返回当前状态，不修改
                     });
                 }

                 // --- 流式完成处理，顺序模式下触发下一个 ---
                 if (aiResponseMode === 'sequential') {
                    // 标记完成
                    setRespondedInTurnAIIds(prev => new Set(prev).add(aiCharacterId)); // 1. 标记完成
                     // 2. 释放原子锁
                     if (sequentialTriggerLock.current[aiCharacterId]) {
                         sequentialTriggerLock.current[aiCharacterId] = false;
                         chatLogger.info(`Sequential lock released for ${aiChar?.name} after stream done.`);
                     }
                    // 3. 尝试调度触发下一个 (延迟执行)
                    setMessages(prevMsgs => {
                         if (!scheduleTriggerLock.current) {
                             scheduleTriggerLock.current = true; // 上调度锁
                             chatLogger.info(`Scheduling next trigger check after ${aiChar?.name} stream done.`);
                             setTimeout(() => {
                                 scheduleTriggerLock.current = false; // 在执行前释放调度锁
                                 chatLogger.info(`Executing scheduled trigger check after ${aiChar?.name} stream done.`);
                                 triggerNextSequentialAIRef.current?.(prevMsgs);
                             }, 0);
                         } else {
                             chatLogger.warn(`Skipping duplicate schedule attempt after ${aiChar?.name} stream done.`);
                         }
                         return prevMsgs;
                    });
                 }
             }
         }; // handleStreamChunk 结束

         chatLogger.info('Registering unified stream listener...');
         const disposeHandle = window.electronAPI.onLLMStreamChunk(handleStreamChunk as (data: unknown) => void);

         return () => {
             chatLogger.info('Cleaning up unified stream listener...');
             disposeHandle.dispose();
         };
     }, [
         initializationError,
         aiCharacters,
         aiResponseMode,
         // 添加缺失的依赖项
         chatConfig,
         chatSessionId,
         inputValue,
         isStreamingEnabled,
         nextSequentialAIIndex,
         selectedTargetAIIds,
         systemPrompts,
         setRespondedInTurnAIIds // 添加依赖
     ]);

   // --- 处理用户消息发送 ---
   const handleSendMessage = () => {
       if (!inputValue.trim() || !userCharacter || initializationError) return;
       const isAnyAILoading = Object.values(aiLoadingState).some(loading => loading); // 检查是否有AI正在加载
        if (isAnyAILoading) {
            message.warning('请等待当前 AI 回复完成后再发送消息。');
            return;
        }
        if (selectedTargetAIIds.length === 0) {
            message.warning('请至少选择一个 AI 角色进行对话！');
            return;
        }

        const userMessage: ChatMessage = {
            role: 'user', characterId: userCharacter.id, characterName: userCharacter.name,
            content: inputValue.trim(), timestamp: Date.now(),
        };

        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);
        setInputValue('');

        // 保存聊天记录到文件
        if (chatSessionId && chatConfig) {
            const snapshotToSave: MultiAIChatPageStateSnapshot = {
                chatConfig,
                messages: updatedMessages,
                inputValue: '',
                systemPrompts,
                chatSessionId,
                isStreamingEnabled,
                selectedTargetAIIds,
                aiResponseMode,
                nextSequentialAIIndex
            };
            window.electronAPI.saveChatSession(chatSessionId, snapshotToSave)
                .then(() => chatLogger.info('用户发送消息后聊天记录已保存'))
                .catch(err => message.error(`保存聊天记录失败: ${err}`));
        }

        // 触发 AI 回复
        const targetAIs = selectedTargetAIIds
            .map(id => aiCharacters.find((c: AICharacter) => c.id === id))
            .filter((c): c is AICharacter => !!c);

        if (aiResponseMode === 'simultaneous') {
            chatLogger.info(`Simultaneous mode: Sending message to ${targetAIs.length} AIs.`);
            targetAIs.forEach(ai => sendToSingleAI(ai, updatedMessages));
        } else { // 顺序模式
            // --- 顺序模式启动逻辑 ---
            chatLogger.info(`Sequential mode: Starting sequence with ${targetAIs.length} AIs.`);
            setRespondedInTurnAIIds(new Set()); // 清空“已回复”名单
            sequentialTriggerLock.current = {}; // 清空AI处理原子锁记录
            scheduleTriggerLock.current = false; // 重置调度锁
            setNextSequentialAIIndex(0); // 重置索引（可能仍有用）
            // 使用 setTimeout 确保状态更新后再触发第一个 AI
            setTimeout(() => {
                 // 直接调用重构后的 triggerNextSequentialAI 来启动序列
                // 它会自己找到第一个未响应的 AI
                triggerNextSequentialAIRef.current?.(updatedMessages);
            }, 0);
        }
    };

    // --- 输入处理 ---
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => { setInputValue(e.target.value); };
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const isAnyAILoading = Object.values(aiLoadingState).some(loading => loading);
        if (e.key === 'Enter' && !e.shiftKey && !isAnyAILoading) {
            e.preventDefault(); handleSendMessage();
        }
    };

    // --- 控制项处理函数 ---
    const handleTargetAIChange = (checkedValues: (string | number | boolean)[]) => {
        const newSelectedIds = checkedValues as string[];
        setSelectedTargetAIIds(prevSelectedIds => {
            // 找出新勾选的 ID
            const newlyAdded = newSelectedIds.filter(id => !prevSelectedIds.includes(id));
            // 找出取消勾选的 ID
            const removed = prevSelectedIds.filter(id => !newSelectedIds.includes(id));

            // 基于之前的顺序，移除取消勾选的，然后追加新勾选的
            let updatedOrderedIds = prevSelectedIds.filter(id => !removed.includes(id));
            updatedOrderedIds = [...updatedOrderedIds, ...newlyAdded]; // 新增的放在最后

            chatLogger.info('Selected Target AI IDs changed (ordered):', updatedOrderedIds);
            return updatedOrderedIds;
        });
    };
    const handleResponseModeChange = (e: RadioChangeEvent) => { setAiResponseMode(e.target.value); setNextSequentialAIIndex(0); };

    // --- 消息渲染 ---
    const renderMessage = (item: ChatMessage) => {
        const isUser = item.role === 'user';
        const isLoading = item.role === 'assistant' && aiLoadingState[item.characterId];
        const contentStyle: React.CSSProperties = {
            display: 'inline-block', padding: '10px 14px', borderRadius: '12px',
            backgroundColor: isUser ? '#1890ff' : (isLoading && item.content === '' ? '#e6f7ff' : '#f0f0f0'),
            color: isUser ? 'white' : 'black', maxWidth: '85%', textAlign: 'left',
            fontSize: '15px', lineHeight: '1.6', margin: isUser ? '0 10px 0 0' : '0 0 0 10px',
            opacity: isLoading && item.content === '' ? 0.8 : 1,
        };
        const nameTimeStyle: React.CSSProperties = {
            display: 'block', marginBottom: '2px', fontSize: '12px', color: '#888',
            textAlign: isUser ? 'right' : 'left', margin: isUser ? '0 10px 0 0' : '0 0 0 10px',
        };
        return (
            <List.Item style={{ borderBottom: 'none', padding: '0', display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '10px' }}>
                <div>
                    <Typography.Text strong style={nameTimeStyle}>
                        {item.characterName}{' '}
                        {item.role === 'assistant' && isLoading && <Spin size="small" style={{ marginLeft: '5px' }} />}
                        {' '}{new Date(item.timestamp).toLocaleTimeString()}
                    </Typography.Text>
                    <div style={contentStyle}>
                        {item.role === 'assistant' && item.content === '' && isLoading ? ( <Spin size="small" style={{ display: 'inline-block' }} /> ) : (
                            item.content?.split('\n').map((line, index) => ( <span key={index}>{line}<br /></span> ))
                        )}
                    </div>
                </div>
            </List.Item>
        );
    };

    // --- 渲染逻辑 ---
    if (initializationError) {
        return <div style={{ padding: 20 }}><Typography.Text type="danger">{initializationError}</Typography.Text></div>;
    }
    if (!chatConfig || !userCharacter) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 100px)' }}>
                <Spin tip="加载聊天配置中..." size="large" />
            </div>
        );
    }
    const isOverallLoading = Object.values(aiLoadingState).some(loading => loading);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 5px)' }}>
            {/* 头部 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', margin: '10px 0', flexShrink: 0 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => {
                    const setupNavInfo = getLastVisitedNavInfo('singleUserMultiAISetup', '/single-user-multi-ai-setup');
                    navigate(setupNavInfo.path, { state: setupNavInfo.internalState });
                }} style={{ position: 'absolute', left: 10 }} aria-label="返回聊天设置" />
                <div style={{ textAlign: 'center' }}>
                    <Typography.Title level={4} style={{ margin: 0, lineHeight: 1.2 }}>剧本：{chatConfig.script.title}</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: '12px' }}>你扮演：{userCharacter.name} | AI角色：{aiCharacters.map(c => c.name).join(', ')}</Typography.Text>
                </div>
            </div>
            {/* AI 选择和模式控制 */}
            <Card size="small" style={{ margin: '0 10px 10px 10px', flexShrink: 0 }}>
                <Row gutter={16} align="middle">
                    <Col flex="auto">
                        <Typography.Text strong>选择回复对象：</Typography.Text>
                        <Checkbox.Group
                            value={selectedTargetAIIds}
                            onChange={handleTargetAIChange}
                            disabled={isOverallLoading}
                            style={{ display: 'inline-block' }} // 让 Checkbox 内部能更好地排列
                        >
                            {aiCharacters.map((ai: AICharacter) => {
                                const isSelected = selectedTargetAIIds.includes(ai.id);
                                let displayLabel = ai.name;
                                // 如果是顺序模式且当前 AI 被选中，则添加基于点击顺序的序号
                                if (aiResponseMode === 'sequential' && isSelected) {
                                    const indexInSelectionOrder = selectedTargetAIIds.indexOf(ai.id); // 使用 indexOf 获取点击顺序
                                    if (indexInSelectionOrder !== -1) {
                                        displayLabel += ` (${indexInSelectionOrder + 1})`; // 序号从 1 开始
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
                    <Col>
                        <Radio.Group onChange={handleResponseModeChange} value={aiResponseMode} buttonStyle="solid" disabled={isOverallLoading}>
                            <Tooltip title="选中的 AI 将同时收到消息并回复">
                                <Radio.Button value="simultaneous"><SyncOutlined /> 同时回复</Radio.Button>
                            </Tooltip>
                            <Tooltip title="选中的 AI 将按选择顺序依次回复">
                                <Radio.Button value="sequential"><OrderedListOutlined /> 顺序回复</Radio.Button>
                            </Tooltip>
                        </Radio.Group>
                        {/* Removed the QuestionCircleOutlined tooltip */}
                    </Col>
                </Row>
            </Card>
            {/* 聊天区域 */}
            <Card variant="borderless" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', background: colorBgContainer, padding: 0, margin: '0 10px 10px 10px', overflow: 'hidden' }} styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' } }}>
                {/* 消息列表 */}
                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px' }}>
                    {messages.length === 0 ? (
                        <Empty description="开始你们的对话吧！" style={{ paddingTop: '20vh' }} />
                    ) : (
                        <List dataSource={messages} renderItem={renderMessage} split={false} />
                    )}
                    <div ref={messagesEndRef} />
                </div>
                {/* 输入区域 */}
                <div style={{ position: 'relative', padding: '10px', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
                    <Input.TextArea
                        placeholder={`以 ${userCharacter?.name ?? '你'} 的身份发言... (Shift+Enter 换行)`}
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        disabled={isOverallLoading}
                        autoSize={{ minRows: 3, maxRows: 3 }}
                        style={{ paddingBottom: '40px', paddingRight: '90px', resize: 'none', fontSize: '15px', lineHeight: '1.6', overflowY: 'auto' }}
                    />
                    <div style={{ position: 'absolute', bottom: '50px', right: '40px', zIndex: 1 }}>
                        <Space size="small" direction="vertical" align="center">
                            <Switch checked={isStreamingEnabled} onChange={setIsStreamingEnabled} size="small" disabled={isOverallLoading} />
                            <Typography.Text style={{ fontSize: '12px', color: '#888' }}>流式</Typography.Text>
                        </Space>
                    </div>
                    <Button
                        type="primary"
                        icon={<SendOutlined />}
                        onClick={handleSendMessage}
                        loading={isOverallLoading}
                        disabled={!inputValue.trim() || isOverallLoading || selectedTargetAIIds.length === 0}
                        style={{ position: 'absolute', bottom: '18px', right: '40px', zIndex: 1 }}
                    />
                </div>
            </Card>
        </div>
    );
}; // 组件函数结束

export default SingleUserMultiAIInterfacePage;
