import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Input, Button, List, Spin, message, Typography, Card, Empty } from 'antd';
import { SendOutlined, ArrowLeftOutlined } from '@ant-design/icons';
// 从公共类型文件导入所有需要的类型
import type {
  // Script, // <-- 删除未使用的 Script
  AICharacter,
  // ChatMode, // <-- 删除未使用的 ChatMode
  ChatConfig,
  ChatMessage,
  ChatPageStateSnapshot
} from '../types';
import type { LLMChatOptions } from '../../electron/llm/BaseLLM';
import { useLastVisited } from '../contexts/LastVisitedContext'; // <-- 导入 Context Hook


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

  // aiCharacter 和 userCharacter 可以根据 chatConfig 派生，或者在 useEffect 中设置
  const [aiCharacter, setAiCharacter] = useState<AICharacter | null>(null);
  const [userCharacter, setUserCharacter] = useState<AICharacter | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);


  // --- 初始化和配置处理 Effect ---
  useEffect(() => {
    // 检查 chatConfig 是否有效 (无论是初始传入还是从快照恢复)
    if (!chatConfig) {
      message.error('缺少聊天配置信息，请返回重新设置。');
      navigate('/chat-mode-selection', { replace: true });
      return;
    }

    // 校验模式和角色数量 (如果 chatConfig 有效)
    if (chatConfig.mode !== 'singleUserSingleAI' || chatConfig.participatingCharacters.length !== 2 || !chatConfig.userCharacterId) {
       message.error('配置信息与单人单 AI 模式不符，请返回重新设置。');
       navigate('/chat-mode-selection', { replace: true });
       return;
    }

    // --- 设置角色信息 ---
    const userChar = chatConfig.participatingCharacters.find(c => c.id === chatConfig.userCharacterId);
    const aiChar = chatConfig.participatingCharacters.find(c => c.id !== chatConfig.userCharacterId);

    if (!userChar || !aiChar) {
       message.error('无法确定用户或 AI 扮演的角色信息，请返回重新设置。');
       navigate('/chat-mode-selection', { replace: true });
       return;
    }
    setUserCharacter(userChar);
    setAiCharacter(aiChar);

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
        setChatSessionId(sessionId);
        console.log(`[ChatInterface] Generated Chat Session ID: ${sessionId}`);
    } else {
        console.log('[ChatInterface] Restored internal state:', restoredState);
    }

    // TODO: 加载本地存储的对话历史逻辑可能需要调整或移除，因为状态现在由 Context 管理
    // 如果希望持久化存储，应该在 Context 更新时写入文件，并在 App 启动时从文件加载到 Context

  }, [chatConfig, navigate, restoredState]); // 依赖 chatConfig 和 navigate

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
        };
        // 使用 location.pathname 获取当前路径
        updateLastVisitedNavInfo('singleUserSingleAIInterface', location.pathname, undefined, currentStateSnapshot); // <-- 使用更明确的 key
        // console.log('[ChatInterface] Updated context with current state snapshot.'); // 减少日志
    }
  }, [messages, inputValue, chatConfig, systemPrompt, chatSessionId, updateLastVisitedNavInfo, location.pathname]);


  // --- 滚动到底部 Effect (不变) ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- 发送消息给 AI (基本不变, 确保使用当前 state) ---
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

    setIsLoading(true);
    try {
      const llmHistory = history.map(msg => ({
        role: msg.role,
        content: `${msg.characterName}: ${msg.content}`
      }));

      const options: LLMChatOptions = {
        model: aiConfig.model,
        messages: llmHistory,
        systemPrompt: systemPrompt,
      };

      console.log(`[ChatInterface] Sending to ${aiConfig.providerId} (${aiConfig.model}):`, options);
      const result = await window.electronAPI.llmGenerateChat(aiConfig.providerId, options);
      console.log('[ChatInterface] Received from AI:', result);

      if (result.success && result.data?.content) {
        const aiResponse: ChatMessage = {
          role: 'assistant',
          characterId: aiCharacter.id,
          characterName: aiCharacter.name,
          content: result.data.content.trim(),
          timestamp: Date.now(),
        };
        // 更新状态会触发上面的 useEffect 来保存快照
        setMessages(prevMessages => [...prevMessages, aiResponse]);
        // 不再在此处单独写入文件，由 Context Effect 处理
        // 确保 chatConfig 存在再保存快照
        if (chatSessionId && chatConfig) {
           // 构建包含新消息的状态快照
           const snapshotToSave: ChatPageStateSnapshot = {
               chatConfig, // 使用当前的 chatConfig (包含 mode)
               messages: [...history, aiResponse], // 使用包含新 AI 回复的消息列表
               inputValue, // 保存当前输入框内容 (虽然通常是空的)
               systemPrompt, // 保存当前的系统提示
               chatSessionId, // 保存当前的会话 ID
           };
           // 使用新的 saveChatSession API，传入 sessionId 和快照数据
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
      setIsLoading(false);
    }
  }, [aiCharacter, chatConfig, systemPrompt, chatSessionId]); // 移除 setMessages, 因为它在内部调用

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
    sendMessageToAI(updatedMessages);
  };

  // --- 渲染聊天消息 (不变) ---
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
            {item.content.split('\n').map((line, index) => (
              <span key={index}>{line}<br/></span>
            ))}
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
    return <Spin tip="加载聊天配置中..." style={{ display: 'block', marginTop: 50 }} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' }}>
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
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Input
          placeholder={`以 ${userCharacter.name} 的身份发言...`}
          value={inputValue}
          onChange={handleInputChange}
          onPressEnter={handleSendMessage}
          disabled={isLoading}
          style={{ flexGrow: 1, marginRight: '8px' }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSendMessage}
          loading={isLoading}
          disabled={!inputValue.trim()}
        >
          发送
        </Button>
      </div>
    </div>
  );
};

export default SingleUserSingleAIInterfacePage;