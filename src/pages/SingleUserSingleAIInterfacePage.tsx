import React, { useState, useEffect, useRef, useCallback } from 'react'; // 确认 useMemo 已移除
import { useLocation, useNavigate } from 'react-router-dom';
import { Input, Button, List, Spin, message, Typography, Card, Empty, Switch, Space } from 'antd';
import { SendOutlined, ArrowLeftOutlined } from '@ant-design/icons';
// 导入 StreamChunk 类型 (假设已在 BaseLLM 定义并导出)
// import type { StreamChunk } from '../../electron/llm/BaseLLM'; // <-- 需要确认 BaseLLM.ts 中 StreamChunk 的导出
// 从公共类型文件导入所有需要的类型
import type {
  // Script, // <-- 删除未使用的 Script
  AICharacter,
  // ChatMode, // <-- 删除未使用的 ChatMode
  ChatConfig,
  ChatMessage, // <-- 保留这一个
  ChatPageStateSnapshot
  // ChatMessage // <-- 删除重复的导入
} from '../types';
// 导入 LLMChatOptions 和 StreamChunk 类型
import type { LLMChatOptions, StreamChunk } from '../../electron/llm/BaseLLM';
import { useLastVisited } from '../hooks/useLastVisited';


// --- 流式监听器管理 ---
// 将监听器引用移到组件外部或使用 useMemo/useRef 避免重复创建
let streamListenerDispose: (() => void) | null = null;


const SingleUserSingleAIInterfacePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { updateLastVisitedNavInfo, getLastVisitedNavInfo } = useLastVisited(); // <-- 获取 getLastVisitedNavInfo

  // 尝试从 location.state 获取状态快照或初始 chatConfig
  // location.state 现在可能是 ChatPageStateSnapshot (从 Context 恢复)
  // 或者 ChatConfig (从 Setup 页首次导航)
  const restoredState = location.state as ChatPageStateSnapshot | undefined;
  const initialChatConfig = restoredState?.chatConfig ?? (location.state as ChatConfig | undefined);

  // --- 页面核心状态 ---
  // 优先使用恢复的状态，否则使用默认值或从 initialChatConfig 计算
  const chatConfig = initialChatConfig; // chatConfig 在此页面是只读的
  const [messages, setMessages] = useState<ChatMessage[]>(restoredState?.messages ?? []);
  const [inputValue, setInputValue] = useState<string>(restoredState?.inputValue ?? '');
  const [isLoading, setIsLoading] = useState(false); // Loading 状态通常不需要保存
  const [systemPrompt, setSystemPrompt] = useState<string>(restoredState?.systemPrompt ?? '');
  const [chatSessionId, setChatSessionId] = useState<string>(restoredState?.chatSessionId ?? '');
  // 新增：流式输出开关状态，默认 true，尝试从快照恢复
  const [isStreamingEnabled, setIsStreamingEnabled] = useState<boolean>(restoredState?.isStreamingEnabled ?? true);

  // aiCharacter 和 userCharacter 可以根据 chatConfig 派生，或者在 useEffect 中设置
  const [aiCharacter, setAiCharacter] = useState<AICharacter | null>(null);
  const [userCharacter, setUserCharacter] = useState<AICharacter | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);


  // --- 初始化和配置处理 Effect ---
  useEffect(() => {
    let didCancel = false; // 添加一个清理标志

    const initializeChat = () => {
        console.log('[ChatInterface] Initializing chat...');
        // 检查 chatConfig 是否有效 (无论是初始传入还是从快照恢复)
        if (!chatConfig) {
          if (!didCancel) { // 只有在组件未卸载时才执行跳转
            message.error('缺少聊天配置信息，请返回重新设置。');
            navigate('/chat-mode-selection', { replace: true });
          }
          return;
        }

    // 校验模式和角色数量 (如果 chatConfig 有效)
        // 校验模式和角色数量 (如果 chatConfig 有效)
        if (chatConfig.mode !== 'singleUserSingleAI' || chatConfig.participatingCharacters.length !== 2 || !chatConfig.userCharacterId) {
           if (!didCancel) {
             message.error('配置信息与单人单 AI 模式不符，请返回重新设置。');
             navigate('/chat-mode-selection', { replace: true });
           }
           return;
        }

    // --- 设置角色信息 ---
    const userChar = chatConfig.participatingCharacters.find(c => c.id === chatConfig.userCharacterId);
    const aiChar = chatConfig.participatingCharacters.find(c => c.id !== chatConfig.userCharacterId);

        if (!userChar || !aiChar) {
           if (!didCancel) {
             message.error('无法确定用户或 AI 扮演的角色信息，请返回重新设置。');
             navigate('/chat-mode-selection', { replace: true });
           }
           return;
        }

        // 只有在组件未卸载时才更新状态
        if (!didCancel) {
            setUserCharacter(userChar);
            setAiCharacter(aiChar);
        } else {
            return; // 如果已卸载，则不继续执行后续逻辑
        }

    // --- 如果不是从快照恢复，则需要构建 System Prompt 和生成 Session ID ---
    // 检查 restoredState 是否包含 chatConfig 来判断是否是恢复状态
    if (!restoredState?.chatConfig) {
        console.log('[ChatInterface] Initializing from chatConfig...');
        let prompt = `你现在正在参与一个 AI 即兴剧场。\n`;
        prompt += `剧本标题: ${chatConfig.script.title}\n`;
        if (chatConfig.script.scene) prompt += `场景: ${chatConfig.script.scene}\n`;
        if (chatConfig.script.setting) prompt += `时代背景: ${chatConfig.script.setting}\n`;
        if (chatConfig.script.synopsis) prompt += `剧情梗概: ${chatConfig.script.synopsis}\n`;
        if (chatConfig.script.mood) prompt += `氛围基调: ${chatConfig.script.mood}\n`;
        prompt += `\n出场角色:\n`;
        chatConfig.participatingCharacters.forEach(char => {
           prompt += `- ${char.name}`;
           if (char.identity) prompt += ` (身份: ${char.identity})`;
           if (char.personality) prompt += ` (性格: ${char.personality})`;
           prompt += `\n`;
        });
        prompt += `\n你的任务是扮演角色: **${aiChar.name}**。\n`;
        prompt += `请严格按照以下角色设定进行表演:\n`;
        prompt += `- 姓名: ${aiChar.name}\n`;
        if (aiChar.identity) prompt += `- 身份: ${aiChar.identity}\n`;
        if (aiChar.personality) prompt += `- 性格: ${aiChar.personality}\n`;
        if (aiChar.background) prompt += `- 背景: ${aiChar.background}\n`;
        if (aiChar.mannerisms) prompt += `- 言行举止: ${aiChar.mannerisms}\n`;
        if (aiChar.voiceTone) prompt += `- 说话音调: ${aiChar.voiceTone}\n`;
        if (aiChar.catchphrase) prompt += `- 口头禅: ${aiChar.catchphrase}\n`;
        prompt += `\n对话历史中的发言会以 "角色名: 内容" 的格式呈现。`;
        prompt += `请你只输出你扮演的角色 (${aiChar.name}) 的对话内容，不要包含角色名和冒号，也不要进行任何与角色扮演无关的评论或解释。\n`;
prompt += `\n与你对话的是由人类用户扮演的角色: **${userChar.name}**。\n`; // 强调一下用户角色
        prompt += `以下是该角色的设定:\n`; // 加上用户角色的详细设定
        prompt += `- 姓名: ${userChar.name}\n`;
        if (userChar.identity) prompt += `- 身份: ${userChar.identity}\n`;
        if (userChar.personality) prompt += `- 性格: ${userChar.personality}\n`;
        if (userChar.background) prompt += `- 背景: ${userChar.background}\n`;
        if (userChar.mannerisms) prompt += `- 言行举止: ${userChar.mannerisms}\n`;
        if (userChar.voiceTone) prompt += `- 说话音调: ${userChar.voiceTone}\n`;
        if (userChar.catchphrase) prompt += `- 口头禅: ${userChar.catchphrase}\n`;
        prompt += `\n`; // 加个空行好看点
        prompt += `与你对话的是由人类用户扮演的角色: ${userChar.name}。\n`;
        setSystemPrompt(prompt);
        console.log('[ChatInterface] Generated System Prompt:', prompt);

        const sessionId = `${chatConfig.script.id}-${Date.now()}`;
        if (!didCancel) setChatSessionId(sessionId); // 更新状态前检查
        console.log(`[ChatInterface] Generated Chat Session ID: ${sessionId}`);
    } else {
      console.log('[ChatInterface] Restored internal state:', restoredState);
      // 如果是从快照恢复，确保 sessionId 也被正确设置
      if (restoredState?.chatSessionId && !didCancel) {
          setChatSessionId(restoredState.chatSessionId);
      }
    }

    // TODO: 加载本地存储的对话历史逻辑可能需要调整或移除，因为状态现在由 Context 管理
    // 如果希望持久化存储，应该在 Context 更新时写入文件，并在 App 启动时从文件加载到 Context

    };

    initializeChat(); // 调用初始化函数

    // 清理函数：当组件卸载或依赖项变化时，设置取消标志
    return () => {
      didCancel = true;
      console.log('[ChatInterface] Cleanup: Initialization effect cancelled.');
    };
    // 添加 restoredState 到依赖项以消除 ESLint 警告，同时保留 didCancel 标志
  }, [chatConfig, navigate, restoredState]);

  // --- 保存状态到 Context Effect ---
  useEffect(() => {
    // 确保 chatConfig 存在，并且页面状态已初始化
    if (chatConfig && systemPrompt && chatSessionId) {
        const currentStateSnapshot: ChatPageStateSnapshot = {
            chatConfig, // 保存当前的配置
            messages,
            inputValue,
            systemPrompt,
            chatSessionId,
            isStreamingEnabled, // <-- 保存流式开关状态
        };
        // 使用 location.pathname 获取当前路径
        updateLastVisitedNavInfo('singleUserSingleAIInterface', location.pathname, undefined, currentStateSnapshot); // <-- 使用更明确的 key
        // console.log('[ChatInterface] Updated context with current state snapshot.'); // 减少日志
    }
  }, [messages, inputValue, chatConfig, systemPrompt, chatSessionId, isStreamingEnabled, updateLastVisitedNavInfo, location.pathname]);


  // --- 滚动到底部 Effect (不变) ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  // --- 流式数据处理 Effect ---
  useEffect(() => {
    // 定义处理函数
    const handleStreamChunk = (chunkData: unknown) => {
      // console.log('[ChatInterface] Received stream chunk:', chunkData); // 调试日志
      // 类型守卫，确保 chunkData 是对象且符合 StreamChunk 结构
      if (typeof chunkData !== 'object' || chunkData === null) return;

      const chunk = chunkData as StreamChunk; // 类型断言 (或更安全的检查)

      if (chunk.text) {
        setMessages(prevMessages => {
          // 找到最后一条消息 (应该是 AI 的占位符或正在接收的消息)
          const lastMessageIndex = prevMessages.length - 1;
          if (lastMessageIndex >= 0 && prevMessages[lastMessageIndex].role === 'assistant') {
            const updatedMessages = [...prevMessages];
            updatedMessages[lastMessageIndex] = {
              ...updatedMessages[lastMessageIndex],
              content: updatedMessages[lastMessageIndex].content + chunk.text,
              timestamp: Date.now() // 更新时间戳，表示活跃
            };
            return updatedMessages;
          }
          // 如果最后一条不是 assistant，可能出错了，或者是非流式模式下的意外调用
          console.warn('[ChatInterface] Received stream chunk but last message is not assistant.');
          return prevMessages;
        });
      }

      if (chunk.error) {
        message.error(`流式响应出错: ${chunk.error}`);
        setIsLoading(false); // 出错时停止 loading
        if (streamListenerDispose) {
          streamListenerDispose(); // 取消监听
          streamListenerDispose = null;
        }
        // 可以考虑移除最后一条 AI 占位符消息
        setMessages(prevMessages => {
            if (prevMessages.length > 0 && prevMessages[prevMessages.length - 1].role === 'assistant' && prevMessages[prevMessages.length - 1].content === '') {
                return prevMessages.slice(0, -1);
            }
            return prevMessages;
        });
      }

      if (chunk.done) {
        console.log('[ChatInterface] Stream finished.');
        setIsLoading(false); // 流结束时停止 loading
        if (streamListenerDispose) {
          streamListenerDispose(); // 取消监听
          streamListenerDispose = null;
        }
        // 可选：保存最终的聊天记录到文件
        // 注意：这里需要确保 messages 状态是最新的
        if (chatSessionId && chatConfig) {
            // 重新获取最新的 messages 状态来保存
            setMessages(currentMessages => {
                const snapshotToSave: ChatPageStateSnapshot = {
                    chatConfig,
                    messages: currentMessages, // 使用当前最新的消息列表
                    inputValue,
                    systemPrompt,
                    chatSessionId,
                    isStreamingEnabled,
                };
                window.electronAPI.saveChatSession(chatSessionId, snapshotToSave)
                  .catch(err => message.error(`保存最终对话历史失败: ${err}`));
                return currentMessages; // 返回当前状态，不修改
            });
        }
      }
    };

    // 注册监听器
    console.log('[ChatInterface] Registering stream listener...');
    const disposeHandle = window.electronAPI.onLLMStreamChunk(handleStreamChunk);
    streamListenerDispose = disposeHandle.dispose; // 保存 dispose 函数

    // 清理函数：组件卸载时取消监听
    return () => {
      console.log('[ChatInterface] Cleaning up stream listener...');
      if (streamListenerDispose) {
        streamListenerDispose();
        streamListenerDispose = null;
      }
    };
    // 依赖项为空数组，表示只在挂载和卸载时执行
    // 但 handleStreamChunk 内部依赖了 chatSessionId, chatConfig 等状态，
    // 为了避免闭包问题，将这些依赖项加入，或者使用 useRef 存储它们
    // 暂时保持空数组，依赖函数式更新 setMessages 来获取最新状态
  }, [chatConfig, chatSessionId, inputValue, systemPrompt, isStreamingEnabled]); // 添加依赖项确保闭包内状态正确


  // --- 发送消息给 AI (修改后支持流式/非流式) ---
  const sendMessageToAI = useCallback(async (history: ChatMessage[]) => {
    // 检查依赖项是否就绪
    if (!aiCharacter || !chatConfig || !systemPrompt || !chatSessionId) {
        console.warn('[ChatInterface] sendMessageToAI called before state is fully initialized.');
        return;
    }

    const aiConfig = chatConfig.aiConfigs[aiCharacter.id];
    if (!aiConfig || !aiConfig.providerId || !aiConfig.model) {
      message.error(`AI角色 (${aiCharacter.name}) 的配置不完整！`);
      return;
    }

    // 注意：isLoading 现在主要由流式处理的开始和结束控制
    // setIsLoading(true); // 在发送时设置 loading

    try {
      // 明确 llmHistory 的 role 类型
      const llmHistory = history.map(msg => ({
        role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant', // 确认类型断言存在
        content: `${msg.characterName}: ${msg.content}`
      }));

      const options: LLMChatOptions = {
        model: aiConfig.model,
        messages: llmHistory,
        systemPrompt: systemPrompt,
        stream: isStreamingEnabled, // <-- 传递流式开关状态
        // temperature, maxTokens 等也可以在这里传递 (如果需要前端控制)
      };

      console.log(`[ChatInterface] Sending to ${aiConfig.providerId} (${aiConfig.model}), Streaming: ${isStreamingEnabled}`);
      setIsLoading(true); // 设置 loading 状态

      if (isStreamingEnabled) {
        // --- 处理流式请求 ---
        // 1. 添加 AI 消息占位符
        const placeholderMessage: ChatMessage = {
          role: 'assistant',
          characterId: aiCharacter.id,
          characterName: aiCharacter.name,
          content: '', // 初始为空
          timestamp: Date.now(),
        };
        setMessages(prevMessages => [...prevMessages, placeholderMessage]);

        // 2. 启动流式请求
        const startResult = await window.electronAPI.llmGenerateChatStream(aiConfig.providerId, options);

        // 3. 检查启动是否成功
        if (!startResult.success) {
          message.error(`启动流式响应失败: ${startResult.error || '未知错误'}`);
          setIsLoading(false);
          // 移除占位符
          setMessages(prevMessages => prevMessages.slice(0, -1));
        } else {
          console.log('[ChatInterface] Stream started successfully.');
          // Loading 状态将在收到 done:true 或 error 时在 handleStreamChunk 中解除
        }

      } else {
        // --- 处理非流式请求 ---
        try {
            const result = await window.electronAPI.llmGenerateChat(aiConfig.providerId, options);
            console.log('[ChatInterface] Received non-stream response:', result);

            if (result.success && result.data?.content) {
              const aiResponse: ChatMessage = {
                role: 'assistant',
                characterId: aiCharacter.id,
                characterName: aiCharacter.name,
                content: result.data.content.trim(),
                timestamp: Date.now(),
              };
              setMessages(prevMessages => [...prevMessages, aiResponse]);
              // 保存快照
              if (chatSessionId && chatConfig) {
                 const snapshotToSave: ChatPageStateSnapshot = {
                     chatConfig,
                     messages: [...history, aiResponse], // 使用更新后的消息
                     inputValue,
                     systemPrompt,
                     chatSessionId,
                     isStreamingEnabled,
                 };
                 window.electronAPI.saveChatSession(chatSessionId, snapshotToSave)
                   .catch(err => message.error(`保存对话历史失败: ${err}`));
              }
            } else {
              message.error(`AI 回复失败: ${result.error || '未知错误'}`);
            }
        } catch (error: unknown) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            message.error(`调用 AI 时出错: ${errorMsg}`);
        } finally {
            setIsLoading(false); // 非流式请求结束后解除 loading
        }
      }
    } catch (error: unknown) { // 这个 catch 块捕获 options 准备阶段的错误
        const errorMsg = error instanceof Error ? error.message : String(error);
        message.error(`发送消息前出错: ${errorMsg}`);
        setIsLoading(false); // 确保解除 loading
    }

  }, [aiCharacter, chatConfig, systemPrompt, chatSessionId, isStreamingEnabled, inputValue]); // <-- 添加 isStreamingEnabled 到依赖项

  // --- 处理用户输入 (基本不变) ---
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  // 处理发送按钮点击或回车
  const handleSendMessage = () => {
    if (!inputValue.trim() || isLoading || !userCharacter) return;

    const userMessage: ChatMessage = {
      role: 'user',
      characterId: userCharacter.id,
      characterName: userCharacter.name,
      content: inputValue.trim(),
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMessage];
    // 更新状态会触发上面的 useEffect 来保存快照
    setMessages(updatedMessages);
    setInputValue('');
    // 不再在此处单独写入文件
    // 确保 chatConfig 存在再保存快照
    if (chatSessionId && chatConfig) {
       // 构建包含新消息的状态快照
       const snapshotToSave: ChatPageStateSnapshot = {
           chatConfig, // 使用当前的 chatConfig (包含 mode)
           messages: updatedMessages, // 使用包含新用户消息的消息列表
           inputValue: '', // 用户发送后输入框已清空
           systemPrompt, // 保存当前的系统提示
           chatSessionId, // 保存当前的会话 ID
       };
       // 使用新的 saveChatSession API
       window.electronAPI.saveChatSession(chatSessionId, snapshotToSave)
         .catch(err => message.error(`保存对话历史失败: ${err}`));
    }

    // 发送更新后的历史给 AI
    // 注意：sendMessageToAI 现在是 useCallback 的一部分，可以直接调用
    sendMessageToAI(updatedMessages);
  };

  // --- 渲染聊天消息 (基本不变, 但需要处理 AI 消息为空的情况) ---
  const renderMessage = (item: ChatMessage) => {
    const isUser = item.role === 'user';
    const contentStyle: React.CSSProperties = {
      display: 'inline-block',
      padding: '10px 14px',
      borderRadius: '12px',
      backgroundColor: isUser ? '#1890ff' : '#f0f0f0',
      color: isUser ? 'white' : 'black',
      maxWidth: '85%',
      textAlign: 'left',
      fontSize: '15px', // 之前调整的字体大小
      lineHeight: '1.6',
      margin: isUser ? '0 10px 0 0' : '0 0 0 10px',
    };
    const nameTimeStyle: React.CSSProperties = {
      display: 'block',
      marginBottom: '2px',
      fontSize: '12px',
      color: '#888',
      textAlign: isUser ? 'right' : 'left',
      margin: isUser ? '0 10px 0 0' : '0 0 0 10px',
    };

    return (
      <List.Item style={{
          borderBottom: 'none',
          padding: '0',
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          marginBottom: '10px'
         }}>
        <div>
          <Typography.Text strong style={nameTimeStyle}>
            {item.characterName} {new Date(item.timestamp).toLocaleTimeString()}
          </Typography.Text>
          <div style={contentStyle}>
            {/* 如果是 AI 消息且内容为空 (流式占位符)，可以显示一个加载指示器 */}
            {item.role === 'assistant' && item.content === '' && isLoading ? (
                <Spin size="small" style={{ display: 'inline-block', marginLeft: '5px' }}/>
            ) : (
                item.content.split('\n').map((line, index) => (
                  <span key={index}>{line}<br/></span>
                ))
            )}
          </div>
        </div>
      </List.Item>
    );
  };


  // --- 页面主要结构 (基本不变) ---
  // 修改 loading 判断，确保 chatConfig 加载完成
  if (!chatConfig || !aiCharacter || !userCharacter) {
    // 增加一个判断，如果 restoredState 存在但 chatConfig 不存在，说明恢复失败
    if (restoredState && !restoredState.chatConfig) {
        message.error('恢复聊天状态失败，缺少配置信息。');
        navigate('/chat-mode-selection', { replace: true });
        return null; // 或者显示错误组件
    }
    // 返回 Spin 组件包裹整个加载中的内容
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 100px)' }}>
        <Spin tip="加载聊天配置中..." size="large" />
      </div>
    );
  }

  // 配置加载完成后，渲染实际内容
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
      {/* 标题区域 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', margin: '10px 0' }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => {
            // 获取设置页面的最后访问信息，包含路径和状态(包括 mode)
            const setupNavInfo = getLastVisitedNavInfo('singleUserSingleAISetup', '/single-user-single-ai-setup'); // <-- 使用更明确的 key
            // 使用获取到的路径和状态进行导航
            navigate(setupNavInfo.path, { state: setupNavInfo.internalState });
          }}
          style={{ position: 'absolute', left: 0 }}
          aria-label="返回聊天设置"
        />
        {/* 使用 div 包裹两行文本 */}
        <div style={{ textAlign: 'center' }}>
            <Typography.Title level={4} style={{ margin: 0, lineHeight: 1.2 }}>
              剧本名：{chatConfig.script.title}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
              出场角色：{userCharacter.name}, {aiCharacter.name}
            </Typography.Text>
        </div>
      </div>
      <Card
        variant="borderless" // 使用 variant 替代 bordered
        styles={{ body: { flexGrow: 1, overflowY: 'auto', padding: '10px 0' } }} // 使用 styles.body 替代 bodyStyle
        style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          marginBottom: '10px',
          backgroundColor: 'transparent'
        }}
      >
        {messages.length === 0 ? (
           <Empty description="开始你们的对话吧！" style={{ paddingTop: '20vh' }}/>
        ) : (
           <List
             dataSource={messages}
             renderItem={renderMessage}
             split={false}
           />
        )}
        <div ref={messagesEndRef} />
      </Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}> {/* 使用 gap 替代 marginRight */}
        {/* 添加流式开关 */}
        <Space size="small">
           <Switch
             checked={isStreamingEnabled}
             onChange={setIsStreamingEnabled}
             size="small"
             disabled={isLoading} // 发送时禁用开关
           />
           <Typography.Text style={{ fontSize: '12px', color: '#666' }}>流式</Typography.Text>
        </Space>
        <Input
          placeholder={`以 ${userCharacter.name} 的身份发言...`}
          value={inputValue}
          onChange={handleInputChange}
          onPressEnter={handleSendMessage}
          disabled={isLoading}
          style={{ flexGrow: 1 }} // 移除 marginRight
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSendMessage}
          loading={isLoading} // Spin 现在由 isLoading 控制，按钮本身的 loading 可以保留或移除
          disabled={!inputValue.trim() || isLoading} // 增加 isLoading 判断
        >
          发送
        </Button>
      </div>
    </div>
  );
};

export default SingleUserSingleAIInterfacePage;