/**
 * 定义 AI 角色的数据结构
 */
export interface AICharacter {
  id: string;           // 唯一标识符
  name: string;         // 姓名 (必填)
  identity?: string;    // 身份 (可选, 例如：皇帝、密探、游侠)
  gender?: string;      // 性别 (可选, 例如：男、女、未知)
  age?: string;         // 年龄 (可选, 可以是数字或描述性文字，如：青年、老年)
  personality: string;  // 性格 (必填)
  background?: string;  // 背景故事 (可选)
  appearance?: string;  // 外貌描述 (可选)
  abilities?: string;   // 能力/特长 (可选)
  goals?: string;       // 目标/动机 (可选)
  secrets?: string;     // 秘密 (可选)
  relationships?: string;// 人物关系 (可选)
  // --- 额外 4 项 ---
  mannerisms?: string;  // 言行举止/小动作 (可选)
  voiceTone?: string;   // 说话音调/风格 (可选)
  catchphrase?: string; // 口头禅 (可选)
  notes?: string;       // 其他备注 (可选)
  avatar?: string;      // 头像 (URL 或标识符, 可选)
}

/**
 * 定义剧本中引用的简单角色信息
 */
export interface ScriptCharacterRef {
  name: string; // 角色名称
  description?: string; // 角色在该剧本中的定位或描述 (可选)
}

/**
 * 定义剧本的数据结构
 */
export interface Script {
  id: string;           // 唯一标识符
  title: string;        // 剧本标题 (必填)
  scene?: string;       // 场景描述 (可选)
  characterIds?: string[]; // 涉及的角色 ID 列表 (可选)
  // --- 新增字段 ---
  genre?: string;       // 类型/题材 (可选, 例如：喜剧、悲剧、科幻)
  setting?: string;     // 时代/背景设定 (可选, 例如：古代宫廷、未来都市)
  synopsis?: string;    // 剧情梗概 (可选)
  mood?: string;        // 氛围/基调 (可选, 例如：轻松、紧张、悬疑)
  themes?: string;      // 主题 (可选, 例如：爱情、背叛、成长)
  tags?: string[];      // 标签 (可选, 用于搜索和分类)
  // 可以添加其他字段，如作者、创建日期等
}


// 未来可以添加更多类型定义，例如设置等

// --- 聊天模式定义 ---
export type ChatMode = 'singleUserSingleAI' | 'singleUserMultiAI' | 'director';

// --- 聊天配置、消息、快照 类型定义 ---

/**
 * 聊天配置信息 (从 Setup 页面传递)
 */
export interface ChatConfig {
  mode: ChatMode;
  script: Script;
  participatingCharacters: AICharacter[];
  userCharacterId: string | null;
  aiConfigs: Record<string, { providerId: string; model: string }>;
}

/**
 * 单条对话消息结构
 */
export interface ChatMessage {
  role: 'user' | 'assistant';
  characterId: string;
  characterName: string;
  content: string;
  timestamp: number;
}

/**
 * 聊天页面内部状态快照 (用于保存和恢复)
 */
export interface ChatPageStateSnapshot {
    chatConfig: ChatConfig; // 需要保存完整的配置信息
    messages: ChatMessage[];
    inputValue: string;
    systemPrompt: string; // 系统提示也需要保存
    chatSessionId: string; // 会话 ID 也需要保存
    isStreamingEnabled?: boolean; // 新增：是否启用流式输出
    // aiCharacter 和 userCharacter 可以从 chatConfig 恢复，无需单独保存
}