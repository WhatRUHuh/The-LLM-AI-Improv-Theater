import React, { useState, useEffect, useRef, useCallback, useMemo, FC } from 'react'; // Import FC
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Input, Button, List, Spin, message, Typography, Card, Empty, Switch,
    Space, theme, Checkbox, Radio, Tooltip, Row, Col, RadioChangeEvent
} from 'antd';
import {
    SendOutlined, ArrowLeftOutlined, SyncOutlined, OrderedListOutlined, QuestionCircleOutlined
} from '@ant-design/icons';
import type {
    AICharacter,
    ChatConfig,
    ChatMessage,
    ChatPageStateSnapshot,
} from '../types';
import type { LLMChatOptions, StreamChunk } from '../../electron/llm/BaseLLM';
import { useLastVisited } from '../hooks/useLastVisited';
import { chatLogger } from '../utils/logger'; // Renamed import alias

// --- Types specific to this page ---
type AIResponseMode = 'simultaneous' | 'sequential';

// Define state for each AI's loading status
type AILoadingState = Record<string, boolean>;

// Extend ChatPageStateSnapshot for multi-AI specifics
interface MultiAIChatPageStateSnapshot extends Omit<ChatPageStateSnapshot, 'chatConfig' | 'systemPrompt'> {
    chatConfig: ChatConfig & { mode: 'singleUserMultiAI' };
    systemPrompts: Record<string, string>; // Save all system prompts
    selectedTargetAIIds: string[];
    aiResponseMode: AIResponseMode;
    nextSequentialAIIndex?: number;
}

// --- Component Definition ---
const SingleUserMultiAIInterfacePage: FC = () => {

    // --- ALL HOOKS MUST BE DECLARED AT THE TOP ---
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
    const [nextSequentialAIIndex, setNextSequentialAIIndex] = useState<number>(0);
    const [chatConfig, setChatConfig] = useState<(ChatConfig & { mode: 'singleUserMultiAI' }) | null>(null);
    const [initializationError, setInitializationError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { token: { colorBgContainer } } = theme.useToken();

    // --- Memoized Derived State ---
    const userCharacter: AICharacter | undefined = useMemo(() =>
        chatConfig?.participatingCharacters.find((c: AICharacter) => c.id === chatConfig?.userCharacterId),
        [chatConfig]
    );
    const aiCharacters: AICharacter[] = useMemo(() =>
        chatConfig?.participatingCharacters.filter((c: AICharacter) => c.id !== chatConfig?.userCharacterId) ?? [],
        [chatConfig]
    );

    // --- Initial State Calculation Function ---
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
            setNextSequentialAIIndex(seqIndexToSet);
            setInitializationError(null);
        } else {
             const fallbackError = '无法初始化聊天配置。';
             setInitializationError(fallbackError);
             message.error(fallbackError);
             navigate('/chat-mode-selection', { replace: true });
        }
    }, [location.state, navigate]);

    // --- useEffect FOR INITIAL STATE SETTING ---
    useEffect(() => {
        calculateAndSetInitialState();
    }, [calculateAndSetInitialState]);

    // --- useEffect FOR GENERATING PROMPTS/SESSION ID (if needed) ---
    useEffect(() => {
        let didCancel = false;
        if (initializationError || !chatConfig || (Object.keys(systemPrompts).length > 0 && chatSessionId)) {
            return;
        }

         chatLogger.info('Multi AI: Generating prompts and session ID...');
         const newPrompts: Record<string, string> = {};
         const currentAiChars = aiCharacters;
         const currentUserChar = userCharacter;

         if (!currentUserChar || currentAiChars.length === 0) {
              chatLogger.error("Multi AI: Cannot find user/AI characters for prompt generation.");
              return;
         }

         const basePrompt = `你现在正在参与一个 AI 即兴剧场。\n剧本: ${chatConfig.script.title}\n场景: ${chatConfig.script.scene || '未指定'}\n背景: ${chatConfig.script.setting || '未指定'}\n梗概: ${chatConfig.script.synopsis || '未指定'}\n氛围: ${chatConfig.script.mood || '未指定'}\n\n出场角色:\n${chatConfig.participatingCharacters.map((c: AICharacter) => `- ${c.name}${c.identity ? ` (${c.identity})` : ''} (性格: ${c.personality || '未指定'})`).join('\n')}\n\n与你对话的是由人类用户扮演的角色: **${currentUserChar.name}**。\n以下是该角色的设定:\n- 姓名: ${currentUserChar.name}\n${currentUserChar.identity ? `- 身份: ${currentUserChar.identity}\n` : ''}${currentUserChar.personality ? `- 性格: ${currentUserChar.personality}\n` : ''}${currentUserChar.background ? `- 背景: ${currentUserChar.background}\n` : ''}${currentUserChar.mannerisms ? `- 言行举止: ${currentUserChar.mannerisms}\n` : ''}${currentUserChar.voiceTone ? `- 说话音调: ${currentUserChar.voiceTone}\n` : ''}${currentUserChar.catchphrase ? `- 口头禅: ${currentUserChar.catchphrase}\n` : ''}\n`;

         currentAiChars.forEach((aiChar: AICharacter) => {
             let prompt = basePrompt;
             prompt += `\n你的任务是扮演角色: **${aiChar.name}**。\n请严格按照以下角色设定进行表演:\n- 姓名: ${aiChar.name}\n`;
             if (aiChar.identity) prompt += `- 身份: ${aiChar.identity}\n`;
             if (aiChar.personality) prompt += `- 性格: ${aiChar.personality}\n`;
             if (aiChar.background) prompt += `- 背景: ${aiChar.background}\n`;
             if (aiChar.mannerisms) prompt += `- 言行举止: ${aiChar.mannerisms}\n`;
             if (aiChar.voiceTone) prompt += `- 说话音调: ${aiChar.voiceTone}\n`;
             if (aiChar.catchphrase) prompt += `- 口头禅: ${aiChar.catchphrase}\n`;
             prompt += `\n其他 AI 角色包括: ${currentAiChars.filter(c => c.id !== aiChar.id).map(c => c.name).join(', ') || '无'}\n`;
             prompt += `对话历史中的发言会以 "角色名: 内容" 的格式呈现。\n请你只输出你扮演的角色 (${aiChar.name}) 的对话内容，不要包含角色名和冒号，也不要进行任何与角色扮演无关的评论或解释。\n`;
             newPrompts[aiChar.id] = prompt;
             chatLogger.info(`Generated system prompt for ${aiChar.name}`);
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

    // --- useEffect FOR SAVING STATE TO CONTEXT ---
    useEffect(() => {
        if (!initializationError && chatConfig && chatSessionId && Object.keys(systemPrompts).length > 0) {
            const currentStateSnapshot: MultiAIChatPageStateSnapshot = {
                chatConfig, messages, inputValue, systemPrompts, chatSessionId,
                isStreamingEnabled, selectedTargetAIIds, aiResponseMode, nextSequentialAIIndex,
            };
            updateLastVisitedNavInfo('singleUserMultiAIInterface', location.pathname, undefined, currentStateSnapshot);
        }
    }, [
        messages, inputValue, chatConfig, systemPrompts, chatSessionId,
        isStreamingEnabled, selectedTargetAIIds, aiResponseMode, nextSequentialAIIndex,
        initializationError, updateLastVisitedNavInfo, location.pathname
    ]);

    // --- useEffect FOR SCROLLING ---
    useEffect(() => {
        if (!initializationError) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, initializationError]);

    // --- Forward declaration for triggerNextSequentialAI ---
    // We need this because sendToSingleAI depends on triggerNextSequentialAI, and vice-versa
    const triggerNextSequentialAIRef = useRef<(currentHistory: ChatMessage[]) => void>(undefined); // Provide initial value

    // --- useCallback FOR SENDING TO SINGLE AI ---
    const sendToSingleAI = useCallback(async (aiChar: AICharacter, history: ChatMessage[]) => {
        if (!chatConfig || !systemPrompts[aiChar.id] || !chatSessionId || initializationError) {
            chatLogger.warn(`Cannot send message to ${aiChar.name}, missing config/prompt/session or init error.`);
            return;
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
                content: `${msg.characterName}: ${msg.content}` // Keep prefix for context
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
                // Pass aiCharacterId as the third argument
                const startResult = await window.electronAPI.llmGenerateChatStream(aiConfig.providerId, options, aiChar.id);

                if (!startResult.success) {
                    message.error(`启动 AI (${aiChar.name}) 流式响应失败: ${startResult.error || '未知错误'}`);
                    setAILoadingState(prev => ({ ...prev, [aiChar.id]: false }));
                    setMessages(prev => prev.filter(m => !(m.characterId === aiChar.id && m.content === '' && m.role === 'assistant')));
                    // Stream listener's error handler will call triggerNextSequentialAI
                } else {
                    chatLogger.info(`AI (${aiChar.name}) 流式响应已启动。`);
                }
            } else {
                // --- Non-streaming ---
                try {
                    const result = await window.electronAPI.llmGenerateChat(aiConfig.providerId, options);
                    chatLogger.info(`Received non-stream response from ${aiChar.name}:`, result);
                    if (result.success && result.data?.content) {
                        const aiResponse: ChatMessage = {
                            role: 'assistant', characterId: aiChar.id, characterName: aiChar.name,
                            content: result.data.content.trim(), timestamp: Date.now(),
                        };
                        setMessages(prev => [...prev, aiResponse]);
                        if (aiResponseMode === 'sequential') {
                             setMessages(currentMsgState => {
                                // Use the ref to call the latest trigger function
                                triggerNextSequentialAIRef.current?.(currentMsgState);
                                return currentMsgState;
                            });
                        }
                    } else {
                        message.error(`AI (${aiChar.name}) 回复失败: ${result.error || '未知错误'}`);
                         if (aiResponseMode === 'sequential') {
                             setMessages(currentMsgState => {
                                triggerNextSequentialAIRef.current?.(currentMsgState);
                                return currentMsgState;
                            });
                         }
                    }
                } catch (error: unknown) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    message.error(`调用 AI (${aiChar.name}) 时出错: ${errorMsg}`);
                     if (aiResponseMode === 'sequential') {
                         setMessages(currentMsgState => {
                            triggerNextSequentialAIRef.current?.(currentMsgState);
                            return currentMsgState;
                        });
                     }
                } finally {
                    setAILoadingState(prev => ({ ...prev, [aiChar.id]: false }));
                    // Trigger handled inside try/catch/success for non-streaming
                }
            }
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            message.error(`准备发送消息给 ${aiChar.name} 时出错: ${errorMsg}`);
            setAILoadingState(prev => ({ ...prev, [aiChar.id]: false }));
            if (aiResponseMode === 'sequential') {
                 setMessages(currentMsgState => {
                    triggerNextSequentialAIRef.current?.(currentMsgState);
                    return currentMsgState;
                });
            }
        }
    // Dependencies
    }, [
        chatConfig, systemPrompts, chatSessionId, isStreamingEnabled,
        initializationError, aiResponseMode, /* triggerNextSequentialAI Ref used instead */ setMessages, setAILoadingState
    ]);

    // --- useCallback FOR TRIGGERING NEXT SEQUENTIAL AI ---
    // Now define the actual trigger function
    const triggerNextSequentialAI = useCallback((currentHistory: ChatMessage[]) => {
        if (initializationError || aiCharacters.length === 0) return;

        chatLogger.info(`Sequential mode: Trying to trigger next AI. Current index: ${nextSequentialAIIndex}`);
        const targetAIsInOrder = selectedTargetAIIds
            .map(id => aiCharacters.find((c: AICharacter) => c.id === id))
            .filter((c): c is AICharacter => !!c);

        if (nextSequentialAIIndex < targetAIsInOrder.length) {
            const nextAI = targetAIsInOrder[nextSequentialAIIndex];
            chatLogger.info(`Sequential mode: Sending to next AI: ${nextAI.name} (index ${nextSequentialAIIndex})`);
            setNextSequentialAIIndex(currentIndex => currentIndex + 1);
            // Call sendToSingleAI directly now
            sendToSingleAI(nextAI, currentHistory);
        } else {
            chatLogger.info('Sequential mode: All AIs have responded.');
            setNextSequentialAIIndex(0); // Reset index
        }
    // Dependencies
    }, [initializationError, aiCharacters, nextSequentialAIIndex, selectedTargetAIIds, sendToSingleAI, setNextSequentialAIIndex]);

    // --- Update the ref on every render ---
    // This ensures sendToSingleAI always calls the latest version of triggerNextSequentialAI
     useEffect(() => {
        triggerNextSequentialAIRef.current = triggerNextSequentialAI;
     });


     // --- useEffect FOR STREAM LISTENERS (Unified Handler) ---
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

             // --- Update message content ---
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

             // --- Handle errors ---
             if (chunk.error) {
                 message.error(`AI (${aiChar.name}) 流式响应出错: ${chunk.error}`);
                 setAILoadingState(prev => ({ ...prev, [aiCharacterId]: false }));
                 setMessages(prevMessages => {
                     let lastMsgIndex = -1;
                     for (let i = prevMessages.length - 1; i >= 0; i--) {
                         if (prevMessages[i].role === 'assistant' && prevMessages[i].characterId === aiCharacterId) {
                             lastMsgIndex = i; break;
                         }
                     }
                     if (lastMsgIndex !== -1 && prevMessages[lastMsgIndex].content === '') {
                         const updatedMessages = [...prevMessages];
                         updatedMessages.splice(lastMsgIndex, 1);
                         return updatedMessages;
                     }
                     return prevMessages;
                 });
                 if (aiResponseMode === 'sequential') {
                    setMessages(currentMsgState => {
                        // Use the ref here as well
                        triggerNextSequentialAIRef.current?.(currentMsgState);
                        return currentMsgState;
                    });
                 }
             }

             // --- Handle completion ---
             if (chunk.done) {
                 chatLogger.info(`AI (${aiChar.name}) 流式响应完成。`);
                 setAILoadingState(prev => ({ ...prev, [aiCharacterId]: false }));
                 if (aiResponseMode === 'sequential') {
                    setMessages(currentMsgState => {
                         // Use the ref here as well
                        triggerNextSequentialAIRef.current?.(currentMsgState);
                        return currentMsgState;
                    });
                 }
             }
         };

         chatLogger.info('Registering unified stream listener...');
         const disposeHandle = window.electronAPI.onLLMStreamChunk(handleStreamChunk as (data: unknown) => void);

         return () => {
             chatLogger.info('Cleaning up unified stream listener...');
             disposeHandle.dispose();
         };
     }, [initializationError, aiCharacters, aiResponseMode]); // Removed triggerNextSequentialAI from deps, using ref


    // --- Handle User Message Sending ---
    const handleSendMessage = () => {
        if (!inputValue.trim() || !userCharacter || initializationError) return;
        const isAnyAILoading = Object.values(aiLoadingState).some(loading => loading);
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

        // Trigger AI responses
        const targetAIs = selectedTargetAIIds
            .map(id => aiCharacters.find((c: AICharacter) => c.id === id))
            .filter((c): c is AICharacter => !!c);

        if (aiResponseMode === 'simultaneous') {
            chatLogger.info(`Simultaneous mode: Sending message to ${targetAIs.length} AIs.`);
            targetAIs.forEach(ai => sendToSingleAI(ai, updatedMessages));
        } else { // Sequential mode
            chatLogger.info(`Sequential mode: Starting sequence with ${targetAIs.length} AIs.`);
            setNextSequentialAIIndex(0);
            setTimeout(() => {
                 const currentTargetAIs = selectedTargetAIIds
                    .map(id => aiCharacters.find((c: AICharacter) => c.id === id))
                    .filter((c): c is AICharacter => !!c);
                 if (currentTargetAIs.length > 0) {
                     chatLogger.info(`Sequential mode: Triggering first AI: ${currentTargetAIs[0].name}`);
                     setNextSequentialAIIndex(1);
                     sendToSingleAI(currentTargetAIs[0], updatedMessages);
                 } else {
                    chatLogger.warn("Sequential mode: No target AIs found when starting sequence.");
                    setNextSequentialAIIndex(0);
                 }
            }, 0);
        }
    };

    // --- Input Handling ---
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => { setInputValue(e.target.value); };
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const isAnyAILoading = Object.values(aiLoadingState).some(loading => loading);
        if (e.key === 'Enter' && !e.shiftKey && !isAnyAILoading) {
            e.preventDefault(); handleSendMessage();
        }
    };

    // --- Control Handlers ---
    const handleTargetAIChange = (checkedValues: (string | number | boolean)[]) => { setSelectedTargetAIIds(checkedValues as string[]); };
    const handleResponseModeChange = (e: RadioChangeEvent) => { setAiResponseMode(e.target.value); setNextSequentialAIIndex(0); };

    // --- Message Rendering ---
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

    // --- RENDER LOGIC ---
    if (initializationError) { return <div style={{ padding: 20 }}><Typography.Text type="danger">{initializationError}</Typography.Text></div>; }
    if (!chatConfig || !userCharacter) {
        return ( <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 100px)' }}><Spin tip="加载聊天配置中..." size="large" /></div> );
    }
    const isOverallLoading = Object.values(aiLoadingState).some(loading => loading);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 5px)' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', margin: '10px 0', flexShrink: 0 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => { const setupNavInfo = getLastVisitedNavInfo('singleUserMultiAISetup', '/single-user-multi-ai-setup'); navigate(setupNavInfo.path, { state: setupNavInfo.internalState }); }} style={{ position: 'absolute', left: 10 }} aria-label="返回聊天设置" />
                <div style={{ textAlign: 'center' }}>
                    <Typography.Title level={4} style={{ margin: 0, lineHeight: 1.2 }}>剧本：{chatConfig.script.title}</Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: '12px' }}>你扮演：{userCharacter.name} | AI角色：{aiCharacters.map(c => c.name).join(', ')}</Typography.Text>
                </div>
            </div>
            {/* AI Selection & Mode Controls */}
            <Card size="small" style={{ margin: '0 10px 10px 10px', flexShrink: 0 }}>
                <Row gutter={16} align="middle">
                    <Col flex="auto">
                        <Typography.Text strong>选择回复对象：</Typography.Text>
                        <Checkbox.Group options={aiCharacters.map(ai => ({ label: ai.name, value: ai.id }))} value={selectedTargetAIIds} onChange={handleTargetAIChange} disabled={isOverallLoading} />
                    </Col>
                    <Col>
                        <Radio.Group onChange={handleResponseModeChange} value={aiResponseMode} buttonStyle="solid" disabled={isOverallLoading}>
                            <Tooltip title="选中的 AI 将同时收到消息并回复"><Radio.Button value="simultaneous"><SyncOutlined /> 同时回复</Radio.Button></Tooltip>
                            <Tooltip title="选中的 AI 将按选择顺序依次回复"><Radio.Button value="sequential"><OrderedListOutlined /> 顺序回复</Radio.Button></Tooltip>
                        </Radio.Group>
                        <Tooltip title="同时回复：您的消息会发给所有选中的AI，它们会同时开始思考并回复。\n顺序回复：您的消息会先发给第一个选中的AI，等它回复后，再连同它的回复一起发给第二个选中的AI，以此类推。"><QuestionCircleOutlined style={{ marginLeft: 8, color: '#888', cursor: 'help' }} /></Tooltip>
                    </Col>
                </Row>
            </Card>
            {/* Chat Area */}
            <Card variant="borderless" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', background: colorBgContainer, padding: 0, margin: '0 10px 10px 10px', overflow: 'hidden' }} styles={{ body: { padding: 0, display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' } }}>
                {/* Message List */}
                <div style={{ flexGrow: 1, overflowY: 'auto', padding: '10px', }}>
                    {messages.length === 0 ? ( <Empty description="开始你们的对话吧！" style={{ paddingTop: '20vh' }} /> ) : ( <List dataSource={messages} renderItem={renderMessage} split={false} /> )}
                    <div ref={messagesEndRef} />
                </div>
                {/* Input Area */}
                <div style={{ position: 'relative', padding: '10px', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
                    <Input.TextArea placeholder={`以 ${userCharacter?.name ?? '你'} 的身份发言... (Shift+Enter 换行)`} value={inputValue} onChange={handleInputChange} onKeyDown={handleKeyDown} disabled={isOverallLoading} autoSize={{ minRows: 3, maxRows: 3 }} style={{ paddingBottom: '40px', paddingRight: '90px', resize: 'none', fontSize: '15px', lineHeight: '1.6', overflowY: 'auto' }} />
                    <div style={{ position: 'absolute', bottom: '50px', right: '40px', zIndex: 1 }}>
                        <Space size="small" direction="vertical" align="center">
                            <Switch checked={isStreamingEnabled} onChange={setIsStreamingEnabled} size="small" disabled={isOverallLoading} />
                            <Typography.Text style={{ fontSize: '12px', color: '#888' }}>流式</Typography.Text>
                        </Space>
                    </div>
                    <Button type="primary" icon={<SendOutlined />} onClick={handleSendMessage} loading={isOverallLoading} disabled={!inputValue.trim() || isOverallLoading || selectedTargetAIIds.length === 0} style={{ position: 'absolute', bottom: '18px', right: '40px', zIndex: 1 }} />
                </div>
            </Card>
        </div>
    );
}; // End of component function

export default SingleUserMultiAIInterfacePage;