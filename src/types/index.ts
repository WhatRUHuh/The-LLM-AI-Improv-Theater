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
}

// 未来可以添加更多类型定义，例如剧本、设置等