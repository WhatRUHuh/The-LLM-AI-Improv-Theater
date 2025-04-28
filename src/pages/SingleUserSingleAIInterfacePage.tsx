import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Input, Button, List, Spin, message, Typography, Card, Empty } from 'antd'; // 移除未使用的 Avatar
import { SendOutlined } from '@ant-design/icons';
import type { Script, AICharacter } from '../types';
import type { ChatMode } from './ChatModeSelectionPage';
import type { LLMChatOptions } from '../../electron/llm/BaseLLM'; // 移除未使用的 LLMResponse

// 从 Setup 页面传递过来的配置类型
interface ChatConfig {
  mode: ChatMode;
  script: Script;
  participatingCharacters: AICharacter[];
  userCharacterId: string | null;
  aiConfigs: Record<string, { providerId: string; model: string }>; // { characterId: { providerId, model } }
}

// 对话消息结构
interface ChatMessage {
  role: 'user' | 'assistant'; // 'user' 代表用户扮演的角色发言, 'assistant' 代表 AI 发言
  characterId: string; // 发言角色的 ID
  characterName: string; // 发言角色的名字
  content: string; // 消息内容 (纯文本)
  timestamp: number; // 时间戳
}

const SingleUserSingleAIInterfacePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const chatConfig = location.state?.chatConfig as ChatConfig | undefined;

  const [messages, setMessages] = useState<ChatMessage[]>([]); // 存储对话历史
  const [inputValue, setInputValue] = useState(''); // 用户输入框内容
  const [isLoading, setIsLoading] = useState(false); // AI 是否正在回复
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [aiCharacter, setAiCharacter] = useState<AICharacter | null>(null);
  const [userCharacter, setUserCharacter] = useState<AICharacter | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [chatSessionId, setChatSessionId] = useState<string>(''); // 新增：存储当前聊天会话的唯一 ID

  // --- 初始化和配置处理 ---
  useEffect(() => {
    if (!chatConfig) {
      message.error('缺少聊天配置信息，请返回重新设置。');
      navigate('/chat-mode-selection', { replace: true });
      return;
    }

    // 校验是否为单人单 AI 模式 (虽然理论上应该由 Setup 页保证)
    if (chatConfig.mode !== 'singleUserSingleAI' || chatConfig.participatingCharacters.length !== 2 || !chatConfig.userCharacterId) {
       message.error('配置信息与单人单 AI 模式不符，请返回重新设置。');
       navigate('/chat-mode-selection', { replace: true });
       return;
    }

    // 确定用户和 AI 扮演的角色
    const userChar = chatConfig.participatingCharacters.find(c => c.id === chatConfig.userCharacterId);
    const aiChar = chatConfig.participatingCharacters.find(c => c.id !== chatConfig.userCharacterId);

    if (!userChar || !aiChar) {
       message.error('无法确定用户或 AI 扮演的角色信息，请返回重新设置。');
       navigate('/chat-mode-selection', { replace: true });
       return;
    }
    setUserCharacter(userChar);
    setAiCharacter(aiChar);

    // --- 构建 System Prompt ---
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
       // 可以根据需要添加更多角色信息到这里
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
    // 可以添加更多 AICharacter 的字段到 Prompt
    prompt += `\n对话历史中的发言会以 "角色名: 内容" 的格式呈现。`;
    prompt += `请你只输出你扮演的角色 (${aiChar.name}) 的对话内容，不要包含角色名和冒号，也不要进行任何与角色扮演无关的评论或解释。\n`;
    prompt += `与你对话的是由人类用户扮演的角色: ${userChar.name}。\n`;

    setSystemPrompt(prompt);
    console.log('[ChatInterface] Generated System Prompt:', prompt);

    // 生成唯一的会话 ID (例如：scriptId + timestamp)
    const sessionId = `${chatConfig.script.id}-${Date.now()}`;
    setChatSessionId(sessionId);
    console.log(`[ChatInterface] Generated Chat Session ID: ${sessionId}`);

    // TODO: 实现加载本地存储的对话历史 (使用 sessionId 作为文件名)
    // const loadHistory = async () => {
    //   const historyResult = await window.electronAPI.readStore(`${sessionId}.json`, []);
    //   if (historyResult.success && Array.isArray(historyResult.data)) {
    //     setMessages(historyResult.data as ChatMessage[]);
    //   }
    // };
    // loadHistory();

  }, [chatConfig, navigate]);

  // --- 滚动到底部 ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- 发送消息给 AI ---
  const sendMessageToAI = useCallback(async (history: ChatMessage[]) => {
    if (!aiCharacter || !chatConfig || !systemPrompt) return;

    const aiConfig = chatConfig.aiConfigs[aiCharacter.id];
    if (!aiConfig || !aiConfig.providerId || !aiConfig.model) {
      message.error(`AI角色 (${aiCharacter.name}) 的配置不完整！`);
      return;
    }

    setIsLoading(true);
    try {
      // 构造发送给 LLM 的消息历史
      const llmHistory = history.map(msg => ({
        role: msg.role,
        // 确保内容包含角色名，符合 Prompt 中的说明
        content: `${msg.characterName}: ${msg.content}`
      }));

      const options: LLMChatOptions = {
        model: aiConfig.model,
        messages: llmHistory,
        systemPrompt: systemPrompt,
        // 可以添加 temperature, maxTokens 等参数
      };

      console.log(`[ChatInterface] Sending to ${aiConfig.providerId} (${aiConfig.model}):`, options);

      // 调用后端 API
      const result = await window.electronAPI.llmGenerateChat(aiConfig.providerId, options);

      console.log('[ChatInterface] Received from AI:', result);

      if (result.success && result.data?.content) {
        const aiResponse: ChatMessage = {
          role: 'assistant',
          characterId: aiCharacter.id,
          characterName: aiCharacter.name,
          content: result.data.content.trim(), // 去除可能的首尾空格
          timestamp: Date.now(),
        };
        const newHistory = [...history, aiResponse]; // 使用传入的 history 构建新历史
        setMessages(newHistory);
        // 保存对话历史到本地
        if (chatSessionId) {
           window.electronAPI.writeStore(`${chatSessionId}.json`, newHistory)
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
  }, [aiCharacter, chatConfig, systemPrompt, chatSessionId]); // <-- 添加 chatSessionId 到依赖数组

  // --- 处理用户输入 ---
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
    setMessages(updatedMessages);
    setInputValue('');
    // 保存对话历史到本地
    if (chatSessionId) {
       window.electronAPI.writeStore(`${chatSessionId}.json`, updatedMessages)
         .catch(err => message.error(`保存对话历史失败: ${err}`));
    }

    // 发送更新后的历史给 AI
    sendMessageToAI(updatedMessages);
  };

  // --- 渲染聊天消息 ---
  const renderMessage = (item: ChatMessage) => {
    const isUser = item.role === 'user';
    // 简单的左右布局区分用户和 AI
    const messageStyle: React.CSSProperties = {
      textAlign: isUser ? 'right' : 'left',
      marginBottom: '10px',
    };
    const contentStyle: React.CSSProperties = {
      display: 'inline-block',
      padding: '8px 12px',
      borderRadius: '10px',
      backgroundColor: isUser ? '#1890ff' : '#f0f0f0',
      color: isUser ? 'white' : 'black',
      maxWidth: '70%',
      textAlign: 'left', // 内容本身左对齐
    };

    return (
      <List.Item style={{ borderBottom: 'none', padding: '0 10px' }}>
        <div style={messageStyle}>
          <Typography.Text strong style={{ display: 'block', marginBottom: '2px', fontSize: '12px', color: '#888' }}>
            {item.characterName} {new Date(item.timestamp).toLocaleTimeString()}
          </Typography.Text>
          <div style={contentStyle}>
            {/* 处理换行符 */}
            {item.content.split('\n').map((line, index) => (
              <span key={index}>{line}<br/></span>
            ))}
          </div>
        </div>
      </List.Item>
    );
  };


  // --- 页面主要结构 ---
  if (!chatConfig || !aiCharacter || !userCharacter) {
    // 在配置信息加载完成前显示加载状态或错误信息
    return <Spin tip="加载聊天配置中..." style={{ display: 'block', marginTop: 50 }} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)' /* 估算高度，需要根据实际布局调整 */ }}>
      <Typography.Title level={3} style={{ textAlign: 'center', margin: '10px 0' }}>
        {chatConfig.script.title} - {aiCharacter.name} vs {userCharacter.name}
      </Typography.Title>
      <Card bodyStyle={{ flexGrow: 1, overflowY: 'auto', padding: '10px' }} style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', marginBottom: '10px' }}>
        {messages.length === 0 ? (
           <Empty description="开始你们的对话吧！" />
        ) : (
           <List
             dataSource={messages}
             renderItem={renderMessage}
             split={false}
           />
        )}
        <div ref={messagesEndRef} /> {/* 用于滚动 */}
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

export default SingleUserSingleAIInterfacePage; // 确保导出的是新名字